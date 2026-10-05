const assert = require('assert');
const { VelocitySession } = require('../src/velocity-session');
const { TokenManager } = require('../src/velocity-rest-client');
const { apiUrl } = require('../src/velocity-endpoints');
const { VelocityOutputSession } = require('../src/velocity-output-session');
const { parseFeedItem } = require('../src/velocity-api');
const { validateVelocityOutputEndpoint } = require('../src/velocity-output-api');

async function verifyOutputOnlyAccess() {
  const portalUrl = 'https://portal.example.com/team/portal';
  const apiBaseUrl = 'https://velocity.example.com:7443/team/velocity';
  const analytic = {
    id: 'sockets', outputs: [
      { id: 'tcp', label: 'TCP', name: 'tcp-server', properties: { 'tcp-server.port': 9010 } },
      { id: 'udp', label: 'UDP', name: 'udp-client', properties: { 'udp-client.hostName': 'logger.example.com', 'udp-client.port': 9011 } },
    ],
  };
  for (const mode of ['enterprise', 'online', 'custom']) {
    const calls = [];
    let failedKind = 'bigdata';
    const request = async (url) => {
      calls.push(url);
      const path = new URL(url).pathname;
      if (path.endsWith('/generateToken')) return { token: 'synthetic-token', expires: Date.now() + 3600000 };
      if (path.endsWith('/oauth2/token')) return { access_token: 'synthetic-token', expires_in: 3600 };
      if (path.endsWith('/portals/self/servers')) return {
        servers: mode === 'enterprise' ? [{ id: 'registered', serverType: 'ARCGIS_VELOCITY', url: apiBaseUrl }] : [],
      };
      if (path.endsWith('/subscriptionInfo')) return { orgCapabilities: [{ id: 'velocity', velocityUrl: apiBaseUrl }] };
      if (/\/feeds?$/.test(path)) throw new Error('Feed access must not be required.');
      for (const kind of ['realtime', 'bigdata']) {
        if (path.endsWith(`/analytics/${kind}`)) {
          if (kind === failedKind) throw Object.assign(new Error(`${kind} access denied`), { code: 'ARCGIS_ERROR', httpStatus: 403 });
          return [analytic];
        }
        if (path.endsWith(`/analytics/${kind}/sockets`)) return analytic;
      }
      throw new Error(`Unexpected synthetic route: ${url}`);
    };
    const session = new VelocitySession({ request, validateEndpoint: validateVelocityOutputEndpoint });
    try {
      const state = await session.login({
        portalUrl, authMode: mode === 'online' ? 'oauth' : 'password',
        username: 'reader', password: 'synthetic-password',
        clientId: 'synthetic-client', clientSecret: 'synthetic-secret',
        endpointMode: mode === 'custom' ? 'custom' : 'automatic',
        publicApiUrl: mode === 'custom' ? apiBaseUrl : '',
      });
      assert.strictEqual(state.authenticated, true);
      assert.strictEqual(state.effectiveUrl, apiBaseUrl);
      assert.strictEqual(state.endpointError, '');
      const outputs = new VelocityOutputSession({ session, request, apiUrl });
      for (const kind of ['bigdata', 'realtime']) {
        failedKind = kind;
        const listing = await outputs.list({ revision: state.revision });
        assert.strictEqual(listing.items.length, 2);
        assert.strictEqual(listing.errors.length, 1);
        assert.strictEqual(listing.errors[0].analyticKind, kind);
        for (const item of listing.items) {
          assert.notStrictEqual(item.analyticKind, kind);
          assert.strictEqual(item.supported, true);
          assert.strictEqual((await outputs.apply({ id: item.id, revision: state.revision })).outputId, item.outputId);
        }
      }
      await session.detect();
      assert.ok(!calls.some(url => /\/feeds?(?:\?|$)/.test(url)));
      assert.ok(calls.some(url => url.startsWith(`${portalUrl}/sharing/rest/`)));
    } finally {
      session.logout();
    }
  }

  const calls = [];
  const session = new VelocitySession({
    validateEndpoint: validateVelocityOutputEndpoint,
    request: async (url) => {
      calls.push(url);
      if (url.endsWith('/generateToken')) return { token: 'synthetic-token', expires: Date.now() + 3600000 };
      if (url.endsWith('/analytics/realtime')) throw Object.assign(new Error('Missing route'), { code: 'HTTP_ERROR', httpStatus: 404 });
      if (url.endsWith('/analytics/bigdata')) throw Object.assign(new Error('Access denied'), { code: 'ARCGIS_ERROR', httpStatus: 403 });
      throw new Error(`Unexpected synthetic route: ${url}`);
    },
  });
  try {
    const state = await session.login({
      portalUrl, authMode: 'password', username: 'reader', password: 'synthetic-password',
      endpointMode: 'custom', publicApiUrl: `${apiBaseUrl}/iot`,
    });
    assert.strictEqual(state.authenticated, true);
    assert.strictEqual(state.effectiveUrl, '');
    assert.match(state.endpointError, /Access denied/);
    assert.strictEqual(calls.length, 3);
    const outputs = new VelocityOutputSession({ session, request: async () => { throw new Error('Unavailable endpoint must not be queried.'); }, apiUrl });
    const result = await outputs.list({ revision: state.revision });
    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.errors.length, 1);
    assert.match(result.errors[0].message, /Access denied/);
    assert.deepStrictEqual(await outputs.apply({ tokenOnly: true, revision: state.revision }), { tokenOnly: true, authType: 'token' });
  } finally {
    session.logout();
  }
}

(async () => {
  const portalUrl = 'https://portal.example.com/portal';
  const servers = ['alpha', 'beta', 'offline'].map((id) => ({
    id, name: `${id} server`, serverType: 'ARCGIS_VELOCITY',
    url: `https://${id}.example.com/arcgis`,
  }));
  const analytic = {
    id: 'same-analytic', label: 'Vehicles',
    outputs: [{
      id: 'same-output', name: 'stream-lyr-new', label: 'Cars',
      properties: { 'stream-lyr-new.portal.streamServicePortalItemID': 'stream-item' },
    }],
  };
  let issued = 0;
  let descriptorToken = '';
  const calls = [];
  const request = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url, options });
    if (parsed.pathname.endsWith('/generateToken')) return { token: `portal-token-${++issued}`, expires: Date.now() + 3600000 };
    if (parsed.pathname.endsWith('/portals/self/servers')) return { servers };
    if (parsed.hostname === 'offline.example.com') {
      throw Object.assign(new Error('The server is unavailable.'), { code: 'NETWORK_ERROR' });
    }
    if (parsed.pathname.endsWith('/feed')) {
      throw Object.assign(new Error('No feed-list permission.'), { code: 'ARCGIS_ERROR', httpStatus: 403 });
    }
    if (parsed.pathname.endsWith('/analytics/realtime')) return [analytic];
    if (parsed.pathname.endsWith('/analytics/bigdata')) return [];
    if (parsed.pathname.endsWith('/analytics/realtime/same-analytic')) return analytic;
    if (parsed.pathname.endsWith('/services/stream/stream-item')) return { url: `https://${parsed.hostname}/StreamServer` };
    throw new Error(`Unexpected synthetic route: ${parsed.pathname}`);
  };
  const tokenManager = new TokenManager({ request });
  const session = new VelocitySession({ tokenManager, request, validateEndpoint: validateVelocityOutputEndpoint });
  try {
    const state = await session.login({
      authMode: 'password', portalUrl, username: 'reader', password: 'synthetic-password',
      endpointMode: 'automatic', serverId: 'all',
    });
    assert.strictEqual(issued, 1);
    assert.strictEqual(state.servers.length, 3);
    const outputs = new VelocityOutputSession({
      session, request, apiUrl,
      requestStreamService: async (_url, _options, context, token) => {
        descriptorToken = token;
        return { streamUrls: [{ urls: [`wss://${context.serverId}.example.com/cars`], token: 'temporary-stream-token' }] };
      },
    });
    const all = await outputs.list({ revision: state.revision });
    assert.strictEqual(all.items.length, 2);
    assert.strictEqual(all.errors.length, 1);
    assert.strictEqual(all.errors[0].serverId, 'offline');
    assert.notStrictEqual(all.items[0].id, all.items[1].id);
    const alpha = all.items.find((item) => item.serverId === 'alpha');
    await tokenManager.refresh();
    assert.strictEqual(issued, 2);
    assert.strictEqual(session.state.revision, state.revision);
    const applied = await outputs.apply({ id: alpha.id, revision: state.revision });
    assert.strictEqual(descriptorToken, 'portal-token-2');
    assert.ok(!JSON.stringify(applied).includes('temporary-stream-token'));

    session.selectServer('beta');
    assert.strictEqual(session.state.revision, state.revision);
    const filtered = await outputs.list({ revision: state.revision });
    assert.strictEqual(filtered.items.length, 1);
    assert.strictEqual(filtered.items[0].serverId, 'beta');
    await session.setEndpoint({
      serverId: 'beta', endpointMode: 'custom', publicApiUrl: 'https://beta.example.com/team/velocity',
    });
    assert.strictEqual(session.state.authRevision, state.authRevision);
    assert.notStrictEqual(session.state.revision, state.revision);
    const credentials = await outputs.streamConnection({
      host: 'alpha.example.com', port: 443, wsTls: true, wsPath: '/cars/subscribe',
    });
    assert.strictEqual(credentials.authQueryToken, 'temporary-stream-token');
    assert.ok(calls.some((call) => call.url.endsWith('/team/velocity/analytics/realtime')));
    assert.ok(!calls.some((call) => /\/feeds?(?:\?|$)/.test(call.url)));
    await assert.rejects(() => outputs.details({ id: alpha.id, revision: state.revision }), /session changed/);
    session.logout();
    await assert.rejects(() => outputs.streamConnection({}), /session changed/);

    for (const authority of ['grpc.example.com:7443', '[2001:db8::1]:7443']) {
      const parsed = parseFeedItem({ id: 'grpc-feed', feed: { name: 'grpc', properties: { 'grpc.url': authority } } });
      assert.strictEqual(parsed.supported, true);
      assert.strictEqual(parsed.url, authority);
    }
    await verifyOutputOnlyAccess();
    console.log('velocity-output-integration tests passed');
  } finally {
    session.logout();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
