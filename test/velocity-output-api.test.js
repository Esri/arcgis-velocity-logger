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
const { buildVelocityConnectionOptions } = require('../src/velocity-connection-options');

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
    id: 'http-output', name: 'http', formatName: 'json',
    properties: { 'http.url': 'https://destination.example.com:7443/receive?tenant=demo' },
  });
  assert.strictEqual(outbound.supported, true);
  assert.deepStrictEqual(buildVelocityConnectionOptions(outbound), {
    connectionType: 'http-server', ip: 'destination.example.com', port: 7443,
    httpTls: true, httpPath: '/receive?tenant=demo', httpFormat: 'json',
  });
  const socketTypes = ['tcp', 'tcp-client', 'tcp-server'];
  const formats = ['delimited', 'json', 'geo-json'];
  const socketSource = { id: 'socket-server', label: 'Socket server', apiBaseUrl: 'https://public.example.com:7443/team/velocity' };
  for (const [index, name] of socketTypes.entries()) {
    const isServer = name.endsWith('-server');
    const protocol = name.startsWith('tcp') ? 'tcp' : 'udp';
    const config = {
      id: `valid-${name}`, name, formatName: formats[index],
      properties: {
        [`${name}.port`]: String(9010 + index),
        ...(isServer ? {} : { [`${name}.hostname`]: 'destination.example.com' }),
      },
    };
    const item = parseAnalyticOutput(analytic, 'realtime', config, socketSource);
    assert.strictEqual(item.supported, true, item.unsupportedReason);
    assert.strictEqual(item.host, isServer ? 'public.example.com' : 'destination.example.com');
    assert.strictEqual(item.port, 9010 + index);
    assert.strictEqual(item.serverId, socketSource.id);
    assert.strictEqual(item.serverApiUrl, socketSource.apiBaseUrl);
    assert.strictEqual(item.analyticId, analytic.id);
    assert.deepStrictEqual(buildVelocityConnectionOptions(item), {
      connectionType: `${protocol}-${isServer ? 'client' : 'server'}`,
      ip: item.host, port: item.port, [`${protocol}Format`]: formats[index],
    });
    for (const port of [0, 65536, 'invalid']) {
      const invalid = parseAnalyticOutput(analytic, 'realtime', {
        ...config, properties: { ...config.properties, [`${name}.port`]: port },
      }, socketSource);
      assert.strictEqual(invalid.supported, false);
      assert.match(invalid.unsupportedReason, /port/i);
    }
    for (const [index, name] of ['udp-client', 'udp-server'].entries()) {
      const hostKey = index === 0 ? `${name}.hostName` : `${name}.publicHostName`;
      const config = {
        id: `valid-${name}`, name, formatName: index === 0 ? 'esri-json' : 'json',
        properties: { [hostKey]: `destination-${index}.example.com`, [`${name}.port`]: 9020 + index },
      };
      const item = parseAnalyticOutput(analytic, 'realtime', config, socketSource);
      assert.strictEqual(item.supported, true, item.unsupportedReason);
      assert.strictEqual(item.host, `destination-${index}.example.com`);
      assert.deepStrictEqual(item.expectedDestination, {
        host: `destination-${index}.example.com`, port: 9020 + index,
      });
      assert.deepStrictEqual(buildVelocityConnectionOptions(item).expectedDestination, item.expectedDestination);
      assert.strictEqual(buildVelocityConnectionOptions(item).connectionType, 'udp-server');
      assert.strictEqual(buildVelocityConnectionOptions(item).ip, '127.0.0.1');
    }
    const xml = parseAnalyticOutput(analytic, 'realtime', { ...config, formatName: 'xml' }, socketSource);
    assert.strictEqual(xml.supported, false);
    assert.match(xml.unsupportedReason, /XML/);
    if (!isServer) {
      for (const hostname of ['', 'invalid host', 'destination.example.com:9010', '[not-an-ipv6-address]']) {
        const invalid = parseAnalyticOutput(analytic, 'realtime', {
          ...config, properties: { ...config.properties, [`${name}.hostname`]: hostname },
        }, socketSource);
        assert.strictEqual(invalid.supported, false, `Invalid socket hostname accepted: ${hostname}`);
        assert.match(invalid.unsupportedReason, /host/i);
      }
    }
    if (isServer) {
      assert.strictEqual(parseAnalyticOutput(analytic, 'realtime', config).supported, false);
      const second = parseAnalyticOutput(analytic, 'realtime', config, {
        ...socketSource, id: 'second', apiBaseUrl: 'https://second.example.com/arcgis',
      });
      assert.notStrictEqual(item.id, second.id);
      assert.strictEqual(second.host, 'second.example.com');
    }
  }
  assert.strictEqual(parseAnalyticOutput(analytic, 'realtime', {
    id: 'legacy', name: 'tcp', properties: { 'tcp.host': 'legacy.example.com', 'tcp.port': 9000 },
  }).supported, true);
  for (const url of ['', 'https://user:secret@example.com/receive', 'https://example.com/receive?token=secret']) {
    const invalid = parseAnalyticOutput(analytic, 'realtime', {
      id: 'bad-http', name: 'http', properties: { 'http.url': url },
    });
    assert.strictEqual(invalid.supported, false);
    assert.ok(invalid.unsupportedReason);
    assert.ok(!JSON.stringify(invalid).includes('secret'));
  }
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
