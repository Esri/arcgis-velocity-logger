const assert = require('assert');
const {
  listAnalyticOutputs,
  getAnalyticOutput,
  parseAnalyticOutput,
  parseStreamUrl,
  resolveStreamOutput,
} = require('../src/velocity-output-api');
const facade = require('../src/velocity-api');
const restClient = require('../src/velocity-rest-client');

const stream = {
  id: 'output-1',
  name: 'stream-lyr-new',
  label: 'Vehicles',
  properties: { 'stream-lyr-new.portal.streamServicePortalItemID': 'stream/item' },
};
const analytic = { id: 'analytic/one', label: 'Vehicle positions', outputs: [stream] };

(async () => {
  assert.strictEqual(facade.TokenManager, restClient.TokenManager);
  assert.strictEqual(facade.jsonRequest, restClient.jsonRequest);
  const facadeRequest = async (url) => {
    if (url.endsWith('/analytics/realtime')) return [analytic];
    if (url.endsWith('/analytics/bigdata')) return [];
    if (url.endsWith('/analytics/realtime/analytic%2Fone')) return analytic;
    throw new Error('Unexpected facade route');
  };
  const context = { apiBaseUrl: 'https://api.example.com/velocity', profile: 'current', serverId: 'registered' };
  const facadeItems = await facade.listOutputs(context, 'test-token', false, { request: facadeRequest });
  assert.strictEqual(facadeItems[0].serverId, 'registered');
  assert.strictEqual((await facade.getOutputDetails(context, facadeItems[0].id, 'test-token', { request: facadeRequest })).outputId, 'output-1');
  await assert.rejects(() => facade.getOutputDetails(context, 'output-1', 'test-token'), /analytic output list/);
  const requested = [];
  const request = async (resource, options) => {
    requested.push([resource, options]);
    if (resource === 'analytics/realtime' || resource === 'analytics/bigdata') return [analytic];
    if (resource === 'analytics/realtime/analytic%2Fone') return analytic;
    if (resource === 'services/stream/stream%2Fitem') {
      return { url: 'https://stream.example.com/team/velocity/rest/services/vehicles/StreamServer' };
    }
    throw new Error(`Unexpected resource ${resource}`);
  };
  const items = await listAnalyticOutputs(request, true);
  assert.strictEqual(items.length, 2);
  assert.notStrictEqual(items[0].key, items[1].key);
  assert.strictEqual(items[0].analyticName, 'Vehicle positions');
  assert.strictEqual(items[0].detailRequired, true);
  const otherServer = await listAnalyticOutputs(request, false, { id: 'other-server', label: 'Other server' });
  assert.notStrictEqual(otherServer[0].id, items[0].id);
  assert.strictEqual(otherServer[0].serverName, 'Other server');
  assert.deepStrictEqual(requested[0][1], { query: { view: 'admin' } });
  assert.ok(requested.every(([resource]) => resource !== 'outputs'));
  assert.strictEqual((await getAnalyticOutput(request, items[0])).key, items[0].key);
  await assert.rejects(() => getAnalyticOutput(request, { ...items[0], outputId: 'removed' }), /no longer/);
  await assert.rejects(() => listAnalyticOutputs(async () => ({ results: [] })), /expected an array/);
  await assert.rejects(() => listAnalyticOutputs(async () => [{ name: 'connector-definition' }]), /Analytic ID/);
  await assert.rejects(() => listAnalyticOutputs(async () => [{ ...analytic, outputs: [stream, stream] }]), /duplicate/);
  const outbound = parseAnalyticOutput(analytic, 'realtime', {
    id: 'http-output', name: 'http', properties: { 'http.url': 'https://destination.example.com/receive' },
  });
  assert.strictEqual(outbound.supported, false);
  assert.strictEqual(outbound.url, undefined);
  assert.match(outbound.unsupportedReason, /destination/);
  for (const name of ['udp-client', 'udp-server', 'tcp-client', 'tcp-server', 'feat-lyr-new']) {
    const item = parseAnalyticOutput(analytic, 'realtime', {
      id: `out-${name}`, name, label: name, properties: { [`${name}.port`]: 9000 },
    }, { id: 'first', label: 'First server' });
    assert.strictEqual(item.supported, false);
    assert.strictEqual(item.outputType, name);
    assert.strictEqual(item.url, undefined);
  }
  assert.strictEqual(parseAnalyticOutput(analytic, 'realtime', {
    ...stream, properties: {},
  }).supported, false);
  assert.strictEqual(parseAnalyticOutput(analytic, 'realtime', {
    id: 'chat', name: 'xmpp', properties: { 'xmpp.destination': 'receiver@example.com' },
  }).localJid, 'receiver@example.com');

  let requestedService;
  const resolved = await resolveStreamOutput(request, async (url, options) => {
    requestedService = [url, options];
    return { streamUrls: [{ urls: ['ws://events.example.com/velocity/vehicles', 'wss://events.example.com:7443/velocity/vehicles?tenant=demo&token=temporary'], token: 'fresh-token' }] };
  }, items[0]);
  assert.strictEqual(resolved.item.url, 'wss://events.example.com:7443/velocity/vehicles/subscribe?tenant=demo');
  assert.strictEqual(resolved.token, 'fresh-token');
  assert.ok(!JSON.stringify(resolved.item).includes('fresh-token'));
  assert.ok(!JSON.stringify(resolved.item).includes('temporary'));
  assert.strictEqual(requestedService[0], 'https://stream.example.com/team/velocity/rest/services/vehicles/StreamServer');
  assert.deepStrictEqual(requestedService[1], { query: { f: 'json' } });
  assert.deepStrictEqual(parseStreamUrl('wss://events.example.com/velocity/subscribe/?tenant=demo'), {
    url: 'wss://events.example.com/velocity/subscribe?tenant=demo', token: '',
  });
  assert.throws(() => parseStreamUrl('ws://events.example.com/stream', 'secret'), /unsecure/);
  assert.throws(() => parseStreamUrl('https://events.example.com/stream'), /ws or wss/);
  await assert.rejects(() => resolveStreamOutput(request, async () => ({}), items[0]), /advertise/);
  await assert.rejects(() => resolveStreamOutput(async () => ({ url: 'http://stream.example.com/StreamServer' }), async () => ({}), items[0]), /HTTPS/);
  console.log('velocity-output-api tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
