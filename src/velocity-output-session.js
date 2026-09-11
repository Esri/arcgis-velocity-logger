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

const { listAnalyticOutputs, getAnalyticOutput, resolveStreamOutput, STREAM_TYPE } = require('./velocity-output-api');

class VelocityOutputSession {
  constructor({ session, request, apiUrl, requestStreamService, canApply = () => true }) {
    this.session = session;
    this.request = request;
    this.apiUrl = apiUrl;
    this.requestStreamService = requestStreamService;
    this.canApply = canApply;
    this.items = new Map();
    this.itemsRevision = null;
    this.applied = null;
    this.listVersion = 0;
  }

  assertRevision(revision) {
    if (revision !== this.session.state.revision) {
      throw new Error('The Velocity session changed. Refresh the output list before applying settings.');
    }
  }

  withContext(callback, context, token) {
    const request = (resource, options = {}) => this.request(this.apiUrl(context, resource, options.query), { token });
    const requestService = (url, options) => this.requestStreamService(url, options, context, token);
    return callback(request, requestService, context);
  }

  async run(callback, serverId) {
    return this.session.run((context, token) => this.withContext(callback, context, token), serverId);
  }

  async list({ adminScope = false, revision, serverId = this.session.state.selectedServerId || 'all' }) {
    this.assertRevision(revision);
    const version = ++this.listVersion;
    const result = await this.session.runAll((context, token) => this.withContext(
      (request) => listAnalyticOutputs(request, adminScope, {
        id: context.serverId,
        label: context.serverName,
        apiBaseUrl: context.apiBaseUrl,
      }),
      context, token,
    ), { serverId });
    this.assertRevision(revision);
    if (version !== this.listVersion) throw new Error('A newer output list request replaced this response.');
    const items = result.results.flatMap((entry) => entry.value);
    this.items = new Map(items.map((item) => [item.id, item]));
    this.itemsRevision = revision;
    return { items, errors: result.errors, revision };
  }

  async details({ id, revision }) {
    this.assertRevision(revision);
    if (this.itemsRevision !== revision) throw new Error('Refresh the output list for the current Velocity session.');
    const selected = this.items.get(id);
    if (!selected) throw new Error('Select an output from the current list.');
    const item = await this.run(async (request, requestService) => {
      const current = await getAnalyticOutput(request, selected);
      if (current.outputType === STREAM_TYPE && current.supported) {
        return (await resolveStreamOutput(request, requestService, current)).item;
      }
      return current;
    }, selected.serverId);
    this.assertRevision(revision);
    if (this.items.get(id) !== selected) throw new Error('The output list changed. Select the output again.');
    this.items.set(id, item);
    return item;
  }

  async apply({ id, revision, tokenOnly = false }) {
    this.assertRevision(revision);
    if (!this.canApply()) throw new Error('Disconnect before applying Velocity settings.');
    if (tokenOnly) {
      if (!this.session.state.authenticated) throw new Error('Sign in before using a token.');
      this.applied = null;
      return { tokenOnly: true, authType: 'token' };
    }
    const item = await this.details({ id, revision });
    if (!item.supported) throw new Error(item.unsupportedReason || 'This output is not supported by the Logger.');
    if (!this.canApply()) throw new Error('Disconnect before applying Velocity settings.');
    this.applied = { item, revision, authRevision: this.session.state.authRevision };
    return item;
  }

  async streamConnection(options) {
    const applied = this.applied;
    if (applied?.item.outputType !== STREAM_TYPE) return null;
    const state = this.session.state;
    const source = state.servers.find((server) => server.id === applied.item.serverId);
    if (applied.authRevision !== state.authRevision || !source || source.effectiveUrl !== applied.item.serverApiUrl) {
      throw new Error('The Velocity session changed. Reapply the Stream Layer before connecting.');
    }
    const expected = new URL(applied.item.url);
    const bareHost = (host) => String(host).replace(/^\[|\]$/g, '').toLowerCase();
    if (bareHost(options.host) !== bareHost(expected.hostname)
        || Number(options.port) !== Number(expected.port || (expected.protocol === 'wss:' ? 443 : 80))
        || Boolean(options.wsTls) !== (expected.protocol === 'wss:')
        || options.wsPath !== expected.pathname + expected.search) {
      throw new Error('The Stream Layer connection settings changed. Reapply the output or turn token sending off for a manual connection.');
    }
    const result = await this.run(async (request, requestService) => {
      const current = await getAnalyticOutput(request, applied.item);
      return resolveStreamOutput(request, requestService, current);
    }, applied.item.serverId);
    if (this.applied !== applied) throw new Error('The selected output changed before connecting.');
    if (result.item.url !== applied.item.url) {
      throw new Error('The Stream Layer advertised a different endpoint. Refresh and reapply the output before connecting.');
    }
    return { authQueryToken: result.token || undefined };
  }
}

module.exports = { VelocityOutputSession };
