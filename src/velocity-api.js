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

const {
  DEFAULT_PORTAL_URL, jsonRequest, generateToken, generateOAuthToken,
  TokenManager, assertArcGISResponse,
} = require('./velocity-rest-client');
const {
  apiUrl, normalizeApiBaseUrl, endpointError, isRecord, isFeedConfiguration, validateFeedConfigurations,
} = require('./velocity-endpoints');
const { buildVelocityConnectionOptions } = require('./velocity-connection-options');

const SUPPORTED_FEED_TYPES = new Set(['grpc', 'http-receiver']);

async function getVelocityApiUrl(portalUrl, token, options = {}) {
  const { discoverVelocityEndpoint } = require('./velocity-session');
  return (await discoverVelocityEndpoint(portalUrl, token, options)).apiBaseUrl;
}

function profileOf(context) {
  const profile = typeof context === 'object' && context ? context.profile || 'current' : 'current';
  if (!['current', 'legacy'].includes(profile)) throw endpointError('Unknown Velocity API profile.');
  return profile;
}

async function listFeeds(context, token, adminScope = false, { request = jsonRequest, onLog } = {}) {
  const resource = profileOf(context) === 'legacy' ? 'feeds' : 'feed';
  const query = adminScope ? { view: 'admin' } : {};
  const result = assertArcGISResponse(await request(apiUrl(context, resource, query), { token, onLog }));
  return validateFeedConfigurations(result).map(parseFeedItem);
}

async function getFeedDetails(context, feedId, token, { request = jsonRequest, onLog } = {}) {
  profileOf(context);
  if (typeof feedId !== 'string' || !feedId || feedId === '.' || feedId === '..') {
    throw endpointError('Select a feed with a valid identifier.', 'INVALID_ITEM');
  }
  const result = assertArcGISResponse(await request(apiUrl(context, `feed/${encodeURIComponent(feedId)}`), { token, onLog }));
  if (!isFeedConfiguration(result) || result.id !== feedId) {
    throw endpointError('The Velocity endpoint did not return the requested feed configuration.', 'INVALID_RESPONSE');
  }
  return parseFeedItem(result);
}

function outputSource(context) {
  const apiBaseUrl = normalizeApiBaseUrl(typeof context === 'string' ? context : context.apiBaseUrl);
  return {
    id: context.serverId || apiBaseUrl,
    label: context.serverName || apiBaseUrl,
    apiBaseUrl,
  };
}

async function listOutputs(context, token, adminScope = false, { request = jsonRequest, onLog } = {}) {
  profileOf(context);
  const { listAnalyticOutputs } = require('./velocity-output-api');
  return listAnalyticOutputs(
    (resource, options = {}) => request(apiUrl(context, resource, options.query), { token, onLog }),
    adminScope, outputSource(context),
  );
}

async function getOutputDetails(context, id, token, { request = jsonRequest, onLog } = {}) {
  profileOf(context);
  let identity;
  try { identity = JSON.parse(id); } catch { throw endpointError('Select an output from the analytic output list.', 'INVALID_ITEM'); }
  const source = outputSource(context);
  if (!Array.isArray(identity) || identity.length !== 4 || identity[0] !== source.id) {
    throw endpointError('The selected output belongs to a different Velocity server.', 'INVALID_ITEM');
  }
  const { getAnalyticOutput } = require('./velocity-output-api');
  return getAnalyticOutput(
    (resource) => request(apiUrl(context, resource), { token, onLog }),
    {
      serverId: source.id, serverName: source.label, serverApiUrl: source.apiBaseUrl,
      analyticKind: identity[1], analyticId: identity[2], outputId: identity[3],
    },
  );
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function safeSchema(attributes) {
  if (!Array.isArray(attributes)) return [];
  const keys = new Set(['name', 'dataType', 'type', 'alias', 'length', 'nullable', 'tags']);
  return attributes.filter(isRecord).map(attribute => {
    const safe = {};
    for (const [key, value] of Object.entries(attribute)) {
      if (!keys.has(key)) continue;
      if (['string', 'number', 'boolean'].includes(typeof value) || value === null) safe[key] = value;
      else if (key === 'tags' && Array.isArray(value)) safe[key] = value.filter(tag => typeof tag === 'string');
    }
    return safe;
  });
}

function safeDataUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || !['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol)) return '';
    for (const key of url.searchParams.keys()) {
      if (/token|password|secret|api[_-]?key|authorization|signature|credential/i.test(key)) return '';
    }
    return value;
  } catch { return ''; }
}

function safeGrpcAuthority(value) {
  if (typeof value !== 'string') return '';
  try {
    buildVelocityConnectionOptions({ feedType: 'grpc', url: value });
    return value.trim();
  } catch { return ''; }
}

function parseItem(item, direction) {
  const container = isRecord(item) ? item : {};
  const definition = isRecord(container[direction]) ? container[direction] : container;
  const name = text(definition.name);
  const properties = isRecord(definition.properties) ? definition.properties : {};
  const transformation = isRecord(definition.schemaTransformation) ? definition.schemaTransformation : {};
  const schema = transformation[direction === 'feed' ? 'inputSchema' : 'outputSchema'];
  const supportedTypes = direction === 'feed' ? SUPPORTED_FEED_TYPES : new Set(['grpc', 'http', 'websocket', 'tcp']);
  const parsed = {
    label: text(container.label),
    id: text(container.id),
    [direction === 'feed' ? 'feedType' : 'outputType']: name,
    format: text(definition.formatName),
    schema: safeSchema(schema && schema.attributes),
    supported: supportedTypes.has(name),
  };
  if (name === 'grpc') {
    parsed.url = safeGrpcAuthority(properties['grpc.url']);
    parsed.headerPath = text(properties['grpc.headerPath']);
    parsed.headerPathKey = text(properties['grpc.headerPathKey']) || 'grpc-path';
    parsed.authType = text(properties['grpc.authenticationType']);
  } else if (['http-receiver', 'http', 'websocket'].includes(name)) {
    parsed.url = safeDataUrl(properties[`${name}.url`]);
    parsed.authType = text(properties[`${name}.${name === 'http-receiver' ? 'httpAuthenticationType' : 'authenticationType'}`]);
  } else if (['mqtt', 'kinetic'].includes(name)) {
    for (const key of ['host', 'port', 'topic', 'username', 'qos']) {
      const value = properties[`${name}.${key}`];
      parsed[key] = typeof value === 'number' ? value : text(value);
    }
    parsed.clientId = text(properties[`${name}.clientid`]);
  } else if (['azure-event-hub', 'azure-service-bus'].includes(name)) {
    parsed.endpoint = safeDataUrl(properties[`${name}.endpoint`]);
    parsed.entityPath = text(properties[`${name}.${name === 'azure-event-hub' ? 'entityPath' : 'topicName'}`]);
    parsed.sharedAccessKeyName = text(properties[`${name}.sharedAccessKeyName`]);
  } else if (['tcp', 'udp'].includes(name)) {
    parsed.host = text(properties[`${name}.host`]);
    parsed.port = typeof properties[`${name}.port`] === 'number' ? properties[`${name}.port`] : text(properties[`${name}.port`]);
  }
  if (direction === 'feed' && name === 'websocket') {
    parsed.reason = 'A WebSocket feed connects to an outbound source; it is not a receiver the Simulator can publish to.';
  } else if (parsed.supported && Object.hasOwn(parsed, 'url') && !parsed.url) {
    parsed.supported = false;
    parsed.reason = 'This item has no valid public data URL, or its URL contains embedded credentials. Configure the connection manually.';
  } else if (!parsed.supported) {
    parsed.reason = `This ${direction} type is not yet supported by the ${direction === 'feed' ? 'Simulator' : 'Logger'}.`;
  }
  return parsed;
}

function parseFeedItem(item) { return parseItem(item, 'feed'); }
function parseOutputItem(item) {
  const parsed = parseItem(item, 'output');
  if (parsed.outputType !== 'xmpp') return parsed;
  const output = item.output || item;
  const propBag = output.properties || {};
  const get = (...keys) => keys.map((key) => propBag[key]).find((value) => value !== undefined && value !== null && value !== '');
  const positiveInteger = (value, fallback) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
  };
  const secondsToMilliseconds = (value, fallback) => {
    const seconds = positiveInteger(value, 0);
    return seconds > 0 ? seconds * 1000 : fallback;
  };
  parsed.supported = true;
  delete parsed.reason;
  parsed.domain = get('xmpp.domain', 'xmpp.serverDomain', 'domain') || '';
  parsed.host = get('xmpp.host', 'xmpp.serverHost', 'host') || '';
  parsed.port = get('xmpp.port', 'port') || 5222;
  const conversationValue = String(
    get('xmpp.connectionType', 'xmpp.conversation', 'xmpp.type', 'conversation') || 'chat',
  ).toLowerCase();
  parsed.conversation = ['groupchat', 'room', 'muc'].includes(conversationValue) ? 'muc' : 'direct';
  const destination = String(get('xmpp.destination', 'xmpp.to', 'destination') || '')
    .split(',')[0]
    .trim()
    .split('/')[0];
  const destinationAt = destination.indexOf('@');
  const staticDestination = destinationAt > 0
    && destinationAt === destination.lastIndexOf('@')
    && !/[${}[\]()]/.test(destination);
  if (parsed.conversation === 'direct' && staticDestination) {
    parsed.localJid = destination;
    parsed.username = destination.slice(0, destinationAt);
    parsed.domain = destination.slice(destinationAt + 1) || parsed.domain;
  } else {
    parsed.localJid = '';
    parsed.username = '';
  }
  parsed.room = parsed.conversation === 'muc' && staticDestination ? destination : '';
  parsed.connectTimeoutMs = secondsToMilliseconds(
    get('xmpp.connectTimeoutSeconds'),
    positiveInteger(get('xmpp.connectTimeoutMs', 'xmpp.connectionTimeoutMs'), 30000),
  );
  parsed.replyTimeoutMs = secondsToMilliseconds(
    get('xmpp.replyTimeoutSeconds'),
    positiveInteger(get('xmpp.replyTimeoutMs', 'xmpp.responseTimeoutMs'), 15000),
  );
  parsed.pingIntervalMs = secondsToMilliseconds(
    get('xmpp.pingIntervalSeconds'),
    positiveInteger(get('xmpp.pingIntervalMs', 'xmpp.keepAliveMs'), 60000),
  );
  parsed.reconnectDelayMs = positiveInteger(get('xmpp.reconnectDelayMs', 'xmpp.reconnectMs'), 60000);
  parsed.tlsPolicy = 'required';
  return parsed;
}

module.exports = {
  DEFAULT_PORTAL_URL,
  SUPPORTED_FEED_TYPES,
  jsonRequest,
  generateToken,
  generateOAuthToken,
  getVelocityApiUrl,
  listFeeds,
  listOutputs,
  getFeedDetails,
  getOutputDetails,
  parseFeedItem,
  parseOutputItem,
  TokenManager,
};
