const assert = require('assert');
const { VelocitySession } = require('../src/velocity-session');
const { TokenManager } = require('../src/velocity-rest-client');
const { apiUrl } = require('../src/velocity-endpoints');
const { VelocityOutputSession } = require('../src/velocity-output-session');
const { parseFeedItem } = require('../src/velocity-api');

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
    if (parsed.pathname.endsWith('/feed')) return [];
    if (parsed.pathname.endsWith('/analytics/realtime')) return [analytic];
    if (parsed.pathname.endsWith('/analytics/bigdata')) return [];
    if (parsed.pathname.endsWith('/analytics/realtime/same-analytic')) return analytic;
    if (parsed.pathname.endsWith('/services/stream/stream-item')) return { url: `https://${parsed.hostname}/StreamServer` };
    throw new Error(`Unexpected synthetic route: ${parsed.pathname}`);
  };
  const tokenManager = new TokenManager({ request });
  const session = new VelocitySession({ tokenManager, request });
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
    assert.ok(calls.some((call) => call.url.endsWith('/team/velocity/feed')));
    await assert.rejects(() => outputs.details({ id: alpha.id, revision: state.revision }), /session changed/);
    session.logout();
    await assert.rejects(() => outputs.streamConnection({}), /session changed/);

    for (const authority of ['grpc.example.com:7443', '[2001:db8::1]:7443']) {
      const parsed = parseFeedItem({ id: 'grpc-feed', feed: { name: 'grpc', properties: { 'grpc.url': authority } } });
      assert.strictEqual(parsed.supported, true);
      assert.strictEqual(parsed.url, authority);
    }
    console.log('velocity-output-integration tests passed');
  } finally {
    session.logout();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
