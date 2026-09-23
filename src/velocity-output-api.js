/**
 * Copyright 2026 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { parseOutputItem } = require('./velocity-api');
const { buildVelocityConnectionOptions } = require('./velocity-connection-options');

const ANALYTIC_KINDS = ['realtime', 'bigdata'];
const STREAM_TYPE = 'stream-lyr-new';
const ENDPOINT_OUTPUT_TYPES = new Set(['tcp', 'tcp-client', 'tcp-server', 'udp-client', 'udp-server', 'http']);
const TEMPORARY_QUERY_KEYS = /^(?:token|access_token|authorization)$/i;

function requireIdentity(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is missing. Refresh the output list.`);
  }
  return value;
}

function outputKey(analyticKind, analyticId, outputId, serverId = '') {
  return JSON.stringify([serverId, analyticKind, analyticId, outputId]);
}

function getOutputs(analytic) {
  if (!analytic || typeof analytic !== 'object' || Array.isArray(analytic)) {
    throw new Error('The server returned an invalid analytic configuration.');
  }
  requireIdentity(analytic.id, 'Analytic ID');
  if (analytic.outputs === undefined) return [];
  if (!Array.isArray(analytic.outputs)) {
    throw new Error('The analytic returned an invalid output configuration list.');
  }
  return analytic.outputs;
}

function parseAnalyticOutput(analytic, analyticKind, output, source = {}) {
  if (!ANALYTIC_KINDS.includes(analyticKind)) throw new Error('Unknown analytic type.');
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('The analytic returned an invalid output configuration.');
  }
  const analyticId = requireIdentity(analytic.id, 'Analytic ID');
  const outputId = requireIdentity(output.id, 'Output ID');
  const parsed = parseOutputItem(output);
  const item = {
    ...parsed,
    id: outputKey(analyticKind, analyticId, outputId, source.id),
    key: outputKey(analyticKind, analyticId, outputId, source.id),
    serverId: source.id || '',
    serverName: source.label || source.id || '',
    serverApiUrl: source.apiBaseUrl || '',
    analyticKind,
    analyticId,
    analyticName: (typeof analytic.label === 'string' && analytic.label)
      || (typeof analytic.name === 'string' && analytic.name) || analyticId,
    outputId,
    detailRequired: false,
  };
  if (parsed.outputType === STREAM_TYPE) {
    item.format = 'json';
    const portalItemId = output.properties?.[`${STREAM_TYPE}.portal.streamServicePortalItemID`];
    item.streamServiceItemId = typeof portalItemId === 'string' ? portalItemId.trim() : '';
    item.supported = Boolean(item.streamServiceItemId);
    item.detailRequired = item.supported;
    item.unsupportedReason = item.supported ? '' : 'This Stream Layer has no stream service item ID.';
  } else if (ENDPOINT_OUTPUT_TYPES.has(parsed.outputType)) {
    try {
      const options = buildVelocityConnectionOptions(item);
      item.supported = true;
      item.format = options.tcpFormat || options.udpFormat || options.httpFormat;
      if (options.tcpFormat) {
        item.host = options.ip;
        item.port = options.port;
      } else if (options.udpFormat) {
        item.expectedDestination = options.expectedDestination;
        item.port = options.port;
      }
    } catch (error) {
      item.supported = false;
      item.unsupportedReason = error.message;
    }
  } else if (parsed.outputType !== 'xmpp') {
    item.supported = false;
    item.unsupportedReason = 'This output has no verified Logger connection settings. Configure a compatible transport manually.';
    delete item.url;
    delete item.headerPath;
  }
  if (item.supported) delete item.reason;
  else item.reason = item.unsupportedReason || item.reason;
  return item;
}

async function listAnalyticOutputs(request, adminScope = false, source = {}) {
  const groups = await Promise.all(ANALYTIC_KINDS.map(async (kind) => {
    const analytics = await request(`analytics/${kind}`, {
      query: adminScope ? { view: 'admin' } : {},
    });
    if (!Array.isArray(analytics)) throw new Error(`Unexpected response from analytics/${kind}: expected an array.`);
    const seen = new Set();
    return analytics.flatMap((analytic) => {
      return getOutputs(analytic).map((output) => {
        const item = parseAnalyticOutput(analytic, kind, output, source);
        if (seen.has(item.key)) throw new Error('The analytic contains duplicate output IDs.');
        seen.add(item.key);
        return item;
      });
    });
  }));
  return groups.flat();
}

async function getAnalyticOutput(request, identity) {
  const { analyticKind, analyticId, outputId } = identity;
  if (!ANALYTIC_KINDS.includes(analyticKind)) throw new Error('Unknown analytic type.');
  requireIdentity(analyticId, 'Analytic ID');
  requireIdentity(outputId, 'Output ID');
  const analytic = await request(`analytics/${analyticKind}/${encodeURIComponent(analyticId)}`);
  if (!analytic || analytic.id !== analyticId) throw new Error('The selected analytic is no longer available.');
  const matches = getOutputs(analytic).filter((output) => output.id === outputId);
  if (matches.length !== 1) throw new Error('The selected output is no longer uniquely available. Refresh the output list.');
  return parseAnalyticOutput(analytic, analyticKind, matches[0], {
    id: identity.serverId, label: identity.serverName, apiBaseUrl: identity.serverApiUrl,
  });
}

function parseStreamUrl(value, token) {
  let url;
  try { url = new URL(value); } catch { throw new Error('The stream service returned an invalid connection URL.'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('The stream service must advertise a ws or wss URL without credentials or a fragment.');
  }
  let credential = typeof token === 'string' ? token : '';
  for (const key of [...url.searchParams.keys()]) {
    if (!TEMPORARY_QUERY_KEYS.test(key)) continue;
    if (!credential) credential = url.searchParams.get(key) || '';
    url.searchParams.delete(key);
  }
  if (credential && url.protocol !== 'wss:') {
    throw new Error('A stream token cannot be sent over an unsecure WebSocket connection.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/subscribe') ? path : `${path}/subscribe`;
  return { url: url.href, token: credential };
}

async function resolveStreamOutput(request, requestStreamService, item) {
  if (item.outputType !== STREAM_TYPE || !item.streamServiceItemId) {
    throw new Error('The selected output is not a configured Stream Layer.');
  }
  const service = await request(`services/stream/${encodeURIComponent(item.streamServiceItemId)}`);
  let serviceUrl;
  try { serviceUrl = new URL(service?.url); } catch { throw new Error('The stream service did not return a valid StreamServer URL.'); }
  if (serviceUrl.protocol !== 'https:' || serviceUrl.username || serviceUrl.password || serviceUrl.search || serviceUrl.hash) {
    throw new Error('The StreamServer URL must use HTTPS without credentials, a query, or a fragment.');
  }
  const info = await requestStreamService(serviceUrl.href, { query: { f: 'json' } });
  if (!Array.isArray(info?.streamUrls) || !info.streamUrls.length) {
    throw new Error('The StreamServer did not advertise a connection URL.');
  }
  const candidates = [];
  for (const entry of info.streamUrls) {
    if (!Array.isArray(entry?.urls)) throw new Error('The StreamServer returned an invalid connection URL list.');
    for (const value of entry.urls) candidates.push({ value, token: entry.token });
  }
  if (!candidates.length) throw new Error('The StreamServer did not advertise a connection URL.');
  const preferred = candidates.find((candidate) => typeof candidate.value === 'string' && candidate.value.startsWith('wss:')) || candidates[0];
  const connection = parseStreamUrl(preferred.value, preferred.token);
  return {
    item: {
      ...item,
      url: connection.url,
      transportType: 'websocket',
      authType: connection.token ? 'token' : 'none',
      supported: true,
      detailRequired: false,
    },
    token: connection.token,
  };
}

module.exports = {
  ANALYTIC_KINDS,
  STREAM_TYPE,
  outputKey,
  parseAnalyticOutput,
  listAnalyticOutputs,
  getAnalyticOutput,
  parseStreamUrl,
  resolveStreamOutput,
};
