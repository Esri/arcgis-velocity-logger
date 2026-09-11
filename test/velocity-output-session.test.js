const assert = require('assert');
const { VelocityOutputSession } = require('../src/velocity-output-session');

(async () => {
  const state = {
    revision: 1, authRevision: 1, authenticated: true,
    servers: [
      { id: 'first', label: 'First server', effectiveUrl: 'https://api.example.com/velocity' },
      { id: 'second', label: 'Second server', effectiveUrl: 'https://second.example.com/team/velocity' },
      { id: 'offline', label: 'Unavailable server', effectiveUrl: '' },
    ],
  };
  let token = 'initial-portal';
  let streamToken = 'first-stream';
  const calls = [];
  const analytic = {
    id: 'analytic', label: 'Locations',
    outputs: [{
      id: 'out', name: 'stream-lyr-new', label: 'Cars',
      properties: { 'stream-lyr-new.portal.streamServicePortalItemID': 'stream' },
    }],
  };
  const context = (server) => ({
    apiBaseUrl: server.effectiveUrl, serverId: server.id, serverName: server.label,
  });
  const sourceRequests = [];
  const session = {
    state,
    run: (callback, serverId) => {
      sourceRequests.push(serverId);
      return callback(context(state.servers.find((server) => server.id === serverId)), token);
    },
    runAll: async (callback, { serverId }) => {
      const healthy = state.servers.filter((server) => server.effectiveUrl && (serverId === 'all' || server.id === serverId));
      return {
        results: await Promise.all(healthy.map(async (server) => ({
          serverId: server.id, serverName: server.label, value: await callback(context(server), token, server),
        }))),
        errors: serverId === 'all' ? [{ serverId: 'offline', serverName: 'Unavailable server', message: 'Server unavailable' }] : [],
        revision: state.revision,
      };
    },
  };
  const browser = new VelocityOutputSession({
    session,
    apiUrl: (context, resource) => `${context.apiBaseUrl}/${resource}`,
    request: async (url, options) => {
      calls.push([url, options]);
      if (url.endsWith('/analytics/realtime')) return [analytic];
      if (url.endsWith('/analytics/bigdata')) return [];
      if (url.endsWith('/analytics/realtime/analytic')) return analytic;
      if (url.endsWith('/services/stream/stream')) return { url: 'https://stream.example.com/StreamServer' };
      throw new Error('Unexpected URL');
    },
    requestStreamService: async () => ({
      streamUrls: [{ urls: ['wss://events.example.com/velocity/cars'], token: streamToken }],
    }),
  });
  const listing = await browser.list({ revision: 1 });
  assert.strictEqual(listing.items.length, 2);
  assert.strictEqual(listing.errors[0].serverId, 'offline');
  assert.notStrictEqual(listing.items[0].id, listing.items[1].id);
  const [listed] = listing.items;
  token = 'refreshed-portal';
  calls.length = 0;
  const detailed = await browser.details({ id: listed.id, revision: 1 });
  assert.ok(calls.every(([, options]) => options.token === token));
  assert.strictEqual(sourceRequests.at(-1), 'first');
  assert.ok(!JSON.stringify(detailed).includes(streamToken));
  await assert.rejects(() => browser.apply({ id: 'fabricated', revision: 1 }), /current list/);
  await browser.apply({ id: listed.id, revision: 1 });
  streamToken = 'fresh-connect-token';
  const auth = await browser.streamConnection({
    host: 'events.example.com', port: 443, wsTls: true, wsPath: '/velocity/cars/subscribe',
  });
  assert.strictEqual(auth.authQueryToken, streamToken);
  assert.ok(!JSON.stringify(browser.applied).includes(streamToken));
  await assert.rejects(() => browser.streamConnection({
    host: 'different.example.com', port: 443, wsTls: true, wsPath: '/velocity/cars/subscribe',
  }), /settings changed/);
  state.revision = 2;
  state.servers[1].effectiveUrl = 'https://second.example.com/replacement';
  assert.strictEqual((await browser.streamConnection({
    host: 'events.example.com', port: 443, wsTls: true, wsPath: '/velocity/cars/subscribe',
  })).authQueryToken, streamToken);
  state.authRevision = 2;
  await assert.rejects(() => browser.streamConnection({}), /session changed/);
  await assert.rejects(() => browser.details({ id: listed.id, revision: 1 }), /session changed/);
  await assert.rejects(() => browser.details({ id: listed.id, revision: 2 }), /Refresh the output list/);
  const tokenOnly = await browser.apply({ tokenOnly: true, revision: 2 });
  assert.strictEqual(tokenOnly.tokenOnly, true);
  assert.strictEqual(browser.applied, null);
  state.selectedServerId = 'second';
  const filtered = await browser.list({ revision: 2 });
  assert.strictEqual(filtered.items.length, 1);
  assert.strictEqual(filtered.items[0].serverId, 'second');
  assert.strictEqual(filtered.errors.length, 0);
  const socketOutput = {
    id: 'socket', name: 'tcp-server', label: 'TCP events', formatName: 'geo-json',
    properties: { 'tcp-server.port': 9010 },
  };
  analytic.outputs.push(socketOutput);
  const socketList = await browser.list({ revision: 2 });
  const socketItem = socketList.items.find((item) => item.outputId === 'socket');
  assert.strictEqual(socketItem.supported, true);
  assert.strictEqual(socketItem.host, 'second.example.com');
  socketOutput.properties['tcp-server.port'] = 9011;
  const appliedSocket = await browser.apply({ id: socketItem.id, revision: 2 });
  assert.strictEqual(appliedSocket.port, 9011);
  assert.strictEqual(appliedSocket.serverId, 'second');
  assert.strictEqual(sourceRequests.at(-1), 'second');
  socketOutput.properties['tcp-server.port'] = 0;
  await assert.rejects(() => browser.apply({ id: socketItem.id, revision: 2 }), /port/i);
  console.log('velocity-output-session tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
