const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { buildVelocityConnectionOptions: build } = require('../src/velocity-connection-options');

let passed = 0;
function test(name, run) {
  try { run(); passed++; console.log(`  ✓ ${name}`); }
  catch (error) { console.error(`  ✗ ${name}\n${error.stack}`); process.exitCode = 1; }
}

test('HTTP retains public path, query, TLS, explicit port, and format', () => {
  assert.deepStrictEqual(build({
    feedType: 'http-receiver', url: 'https://receiver.example.com:8443/public/events?topic=traffic&f=json', format: 'geojson',
  }), {
    connectionType: 'http-client', ip: 'receiver.example.com', port: 8443, httpTls: true,
    httpPath: '/public/events?topic=traffic&f=json', httpFormat: 'geo-json',
  });
  assert.strictEqual(build({ feedType: 'http-receiver', url: 'https://receiver.example.com/events' }).port, 443);
  assert.strictEqual(build({ feedType: 'http-receiver', url: 'http://receiver.example.com/events' }).port, 80);
});

test('gRPC preserves explicit ports, bracketed IPv6 and routing metadata', () => {
  assert.deepStrictEqual(build({ feedType: 'grpc', url: '[2001:db8::1]:7443', headerPathKey: 'x-route', headerPath: '/tenant/feed' }), {
    connectionType: 'grpc-client', ip: '2001:db8::1', port: 7443, grpcTls: true,
    grpcSerialization: 'protobuf', grpcHeaderPathKey: 'x-route', grpcHeaderPath: '/tenant/feed',
  });
  assert.strictEqual(build({ feedType: 'grpc', url: 'receiver.example.com' }).port, 443);
  assert.strictEqual(build({ feedType: 'grpc', url: 'http://receiver.example.com:50051' }).grpcTls, false);
  assert.strictEqual(build({ feedType: 'grpc', url: 'https://receiver.example.com:8443/' }).port, 8443);
});

test('Logger output and safe Stream Layer mappings share the same helper', () => {
  const expected = {
    connectionType: 'ws-client', ip: '2001:db8::2', port: 443, wsTls: true,
    wsPath: '/stream/subscribe?filter=all', wsFormat: 'json',
  };
  assert.deepStrictEqual(build({ outputType: 'websocket', url: 'wss://[2001:db8::2]/stream/subscribe?filter=all', format: 'json' }), expected);
  assert.deepStrictEqual(build({ connectionType: 'ws-client', outputType: 'stream-layer', url: 'wss://[2001:db8::2]/stream/subscribe?filter=all', format: 'json' }), expected);
  assert.deepStrictEqual(build({ outputType: 'http', url: 'http://receiver.example.com/events', format: 'json' }), {
    connectionType: 'http-server', ip: 'receiver.example.com', port: 80,
    httpTls: false, httpPath: '/events', httpFormat: 'json',
  });
  assert.strictEqual(build({ outputType: 'grpc', url: 'receiver.example.com:50051' }).port, 50051);
});

test('missing or invalid endpoints fail without fallback', () => {
  for (const url of ['', 'bad address', 'https:receiver.example.com', 'https:///receiver.example.com', 'ftp://receiver.example.com', 'https://receiver.example.com:0', 'https://receiver.example.com:65536']) {
    assert.throws(() => build({ feedType: 'http-receiver', url }), undefined, url);
  }
  assert.throws(() => build({ feedType: 'http-receiver', url: 'https://receiver.example.com', format: 'unknown' }), /format/);
  assert.strictEqual(build({ feedType: 'websocket', url: 'wss://receiver.example.com' }).connectionType, 'ws-server');
  assert.throws(() => build({ feedType: 'mqtt', url: 'https://receiver.example.com' }), /supported/);
});

test('UDP feeds publish as clients while both UDP outputs receive as servers', () => {
  assert.deepStrictEqual(build({
    feedType: 'udp-server', host: 'velocity.example.com',
    port: 17009, format: 'json',
  }), {
    connectionType: 'udp-client', ip: 'velocity.example.com', port: 17009, udpFormat: 'json',
    udpConnectionMode: 'direct', udpAddressFamily: 'ipv4', udpAppendNewline: false,
  });
  assert.throws(() => build({
    feedType: 'udp-client', host: 'velocity.example.com', port: 17012, format: 'delimited',
  }), /does not advertise its receiving contract/);
  assert.deepStrictEqual(build({
    feedType: 'udp-client', host: 'velocity.example.com', port: 17012, format: 'delimited',
    udpConnectionMode: 'direct', udpLocalHost: 'velocity.example.com', udpLocalPort: 17012,
  }), {
    connectionType: 'udp-client', ip: 'velocity.example.com', port: 17012, udpFormat: 'delimited',
    udpConnectionMode: 'direct', udpAddressFamily: 'ipv4', udpAppendNewline: true,
  });
  for (const outputType of ['udp-client', 'udp-server']) {
    const options = build({
      outputType, host: 'logger.example.com', port: 17013, format: 'geo-json',
    });
    assert.strictEqual(options.connectionType, 'udp-server');
    assert.strictEqual(options.ip, '127.0.0.1');
    assert.strictEqual(options.port, 17013);
    assert.strictEqual(options.udpFormat, 'geo-json');
    assert.strictEqual(options.udpAddressFamily, 'ipv4');
    assert.deepStrictEqual(options.expectedDestination, {
      host: 'logger.example.com', port: 17013, family: 'ipv4',
    });
    assert.match(options.routingWarning, /choose a local interface/i);
    assert.match(options.routingWarning, /No registration datagram is sent/);
  }
});

test('UDP mapping supports IPv6 where the connector contract allows it', () => {
  const feed = build({
    feedType: 'udp-client', host: '2001:db8::10', port: 17009, format: 'json',
    udpConnectionMode: 'direct', udpLocalHost: '2001:db8::10', udpLocalPort: 17009,
  });
  assert.deepStrictEqual(feed, {
    connectionType: 'udp-client',
    ip: '2001:db8::10',
    port: 17009,
    udpConnectionMode: 'direct',
    udpAddressFamily: 'ipv6',
    udpFormat: 'json',
    udpAppendNewline: false,
  });
  for (const outputType of ['udp-client', 'udp-server']) {
    const output = build({
      outputType, host: '2001:db8::20', port: 17010, format: 'json',
    });
    assert.strictEqual(output.connectionType, 'udp-server');
    assert.strictEqual(output.ip, '::1');
    assert.strictEqual(output.udpAddressFamily, 'ipv6');
    assert.deepStrictEqual(output.expectedDestination, {
      host: '2001:db8::20', port: 17010, family: 'ipv6',
    });
    assert.match(output.routingWarning, /\[2001:db8::20\]:17010/);
  }
  assert.throws(() => build({
    feedType: 'udp-server', host: '2001:db8::30', port: 17011, format: 'json',
  }), /bind IPv4 only/);
});

test('TCP connector roles remain complementary', () => {
  assert.deepStrictEqual(build({
    feedType: 'tcp-server', serverApiUrl: 'https://velocity.example.com/arcgis',
    port: '17011', format: 'delimited',
  }), {
    connectionType: 'tcp-client', ip: 'velocity.example.com', port: 17011,
    tcpAddressFamily: 'ipv4', tcpHandshakeText: '', tcpHandshakeUseEscapes: true,
    tcpFormat: 'delimited',
  });
  assert.deepStrictEqual(build({
    outputType: 'tcp-client', host: 'logger.example.com', port: 17013, format: 'esri-json',
  }), {
    connectionType: 'tcp-server', ip: '127.0.0.1', port: 17013,
    tcpAddressFamily: 'auto', tcpHandshakeText: '', tcpHandshakeUseEscapes: true,
    tcpFormat: 'esri-json',
    expectedDestination: { host: 'logger.example.com', port: 17013, family: 'auto' },
    routingWarning: 'Velocity connects to logger.example.com:17013. The Logger bind address defaults to 127.0.0.1; choose a local interface and ensure the advertised destination routes to this Logger.',
  });
  assert.deepStrictEqual(build({
    outputType: 'tcp-server', serverApiUrl: 'https://velocity.example.com:7143/arcgis',
    port: 17011, format: 'json',
  }), {
    connectionType: 'tcp-client', ip: 'velocity.example.com', port: 17011,
    tcpAddressFamily: 'ipv4', tcpHandshakeText: '', tcpHandshakeUseEscapes: true,
    tcpFormat: 'json',
  });
  assert.throws(() => build({
    outputType: 'tcp-server', port: 17011, format: 'json',
  }), /data endpoint is missing/);
  assert.throws(() => build({
    outputType: 'tcp-client', host: 'destination.example.com:9010', port: 17011, format: 'json',
  }), /host is invalid/);
  assert.throws(() => build({
    outputType: 'tcp-client', host: '[not-an-ipv6-address]', port: 17011, format: 'json',
  }), /host is invalid/);
  assert.strictEqual(build({
    outputType: 'tcp-client', host: '2001:db8::1', port: 17011, format: 'json',
  }).ip, '::1');
  assert.strictEqual(build({
    outputType: 'tcp-client', host: '[2001:db8::2]', port: 17011, format: 'json',
  }).ip, '::1');
  assert.throws(() => build({
    feedType: 'udp-server', host: '2001:db8::1',
    port: 17009, format: 'json',
  }), /IPv4/);
  assert.throws(() => build({
    outputType: 'udp-server', serverApiUrl: 'https://velocity.example.com/arcgis',
    port: 17009, format: 'json',
  }), /advertised destination host/);
});

test('HTTP Poller and WebSocket feeds map to Simulator server roles', () => {
  assert.deepStrictEqual(build({
    feedType: 'http-poller', httpMethod: 'GET',
    url: 'https://simulator.example.com:8443/events?site=one', format: 'json',
  }), {
    connectionType: 'http-server', ip: 'simulator.example.com', port: 8443,
    httpTls: true, httpPath: '/events?site=one', httpFormat: 'json', httpPolling: true,
  });
  assert.deepStrictEqual(build({
    feedType: 'websocket', url: 'wss://simulator.example.com:9443/stream?tenant=demo', format: 'geo-json',
  }), {
    connectionType: 'ws-server', ip: 'simulator.example.com', port: 9443,
    wsTls: true, wsPath: '/stream', wsFormat: 'geo-json',
  });
  assert.throws(() => build({
    feedType: 'http-poller', httpMethod: 'POST', url: 'https://simulator.example.com/events',
  }), /GET-based/);
});

test('credentials and fragments cannot enter saved transport fields', () => {
  for (const url of [
    'https://user:pass@receiver.example.com/data', 'https://receiver.example.com/data#fragment',
    'https://receiver.example.com/data#', 'https://receiver.example.com/data?token=secret',
    'https://receiver.example.com/data?access_token=secret', 'https://receiver.example.com/data?api_key=secret',
    'https://receiver.example.com/data?%74oken=secret', 'https://receiver.example.com/data?value=Bearer%20secret',
    'https://receiver.example.com/data?signature=secret',
  ]) assert.throws(() => build({ feedType: 'http-receiver', url }), /credentials|fragments|credential/);
});

test('gRPC does not derive arbitrary RPC paths or unsafe metadata', () => {
  for (const url of ['receiver.example.com/rpc', 'https://receiver.example.com/context', '2001:db8::1', 'receiver.example.com?x=y']) {
    assert.throws(() => build({ feedType: 'grpc', url }));
  }
  assert.throws(() => build({ feedType: 'grpc', url: 'receiver.example.com', headerPathKey: 'invalid key' }), /header key/);
  assert.throws(() => build({ feedType: 'grpc', url: 'receiver.example.com', headerPath: 'route\r\nheader:value' }), /header value/);
});

test('browser UMD export matches the Node module', () => {
  const sandbox = { URL };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/velocity-connection-options'), 'utf8'), sandbox);
  assert.strictEqual(sandbox.VelocityConnectionOptions.buildVelocityConnectionOptions({ feedType: 'grpc', url: 'receiver.example.com' }).port, 443);
});

console.log(`velocity-connection-options: ${passed} tests passed`);
