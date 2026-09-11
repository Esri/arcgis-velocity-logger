const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { buildVelocityConnectionOptions } = require('../src/velocity-connection-options');

(async () => {
  const source = (name) => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
  const dom = new JSDOM(source('index.html').replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true,
  });
  try {
    const { window } = dom;
    const listeners = new Map();
    const sent = [];
    window.electronAPI = {
      on: (channel, callback) => listeners.set(channel, callback),
      send: (channel, payload) => sent.push([channel, payload]),
      invoke: async () => ({ success: true }),
      openVelocityLogin() {},
    };
    for (const file of ['velocity-auth-utils.js', 'connection-presets.js', 'connection-summary.js', 'renderer.js']) {
      window.eval(source(file));
    }
    await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
    const get = (id) => window.document.getElementById(id);
    get('ws-headers').value = '{"Authorization":"old-secret"}';
    get('ws-subscription-msg').value = 'old-subscription';
    const item = {
      outputType: 'stream-lyr-new', authType: 'token', label: 'Cars', id: 'stream',
      connectionOptions: {
        connectionType: 'ws-client', ip: 'events.example.com', port: 7443,
        wsTls: true, wsPath: '/team/velocity/cars/subscribe?tenant=demo',
        wsFormat: 'json', wsHeaders: '', wsSubscriptionMsg: '', wsIgnoreFirstMsg: false,
      },
    };
    listeners.get('velocity:output-applied')(item);
    assert.strictEqual(get('host').value, 'events.example.com');
    assert.strictEqual(get('port').value, '7443');
    assert.strictEqual(get('ws-path').value, '/team/velocity/cars/subscribe?tenant=demo');
    assert.strictEqual(get('ws-headers').value, '');
    assert.strictEqual(get('ws-subscription-msg').value, '');
    assert.strictEqual(get('ws-format').value, 'json');
    assert.strictEqual(sent.filter(([channel]) => channel === 'connect-ws').length, 0);
    get('connect-btn').click();
    const request = sent.find(([channel]) => channel === 'connect-ws')[1];
    assert.strictEqual(request.port, 7443);
    assert.strictEqual(request.wsPath, '/team/velocity/cars/subscribe?tenant=demo');
    assert.ok(!JSON.stringify(request).includes('secret'));
    listeners.get('velocity:output-applied')({
      ...item, connectionOptions: { ...item.connectionOptions, ip: 'other.example.com' },
    });
    assert.strictEqual(get('host').value, 'events.example.com');
    listeners.get('tcp-connection-state')('disconnected');
    listeners.get('velocity:output-applied')({ outputType: 'http', url: 'https://destination.example.com' });
    assert.strictEqual(get('host').value, 'events.example.com');
    for (const outputType of ['tcp-client', 'tcp-server', 'udp-client', 'udp-server']) {
      const protocol = outputType.split('-')[0];
      const output = {
        outputType, label: outputType, port: 9010, format: 'geo-json',
        host: outputType.endsWith('-client') ? '127.0.0.1' : '',
        serverApiUrl: 'https://127.0.0.1:7443/team/velocity',
      };
      const connectionOptions = buildVelocityConnectionOptions(output);
      const before = sent.filter(([channel]) => channel.startsWith('connect-')).length;
      listeners.get('velocity:output-applied')({ ...output, connectionOptions });
      assert.strictEqual(get('connection-type').value, connectionOptions.connectionType);
      assert.strictEqual(get('host').value, '127.0.0.1');
      assert.strictEqual(get('port').value, '9010');
      assert.strictEqual(get(`${protocol}-format`).value, 'geo-json');
      assert.strictEqual(sent.filter(([channel]) => channel.startsWith('connect-')).length, before);
      get('connect-btn').click();
      const [channel, request] = sent.filter(([name]) => name.startsWith('connect-')).at(-1);
      assert.strictEqual(channel, `connect-${protocol}`);
      assert.strictEqual(request.type, connectionOptions.connectionType.split('-')[1]);
      assert.strictEqual(request[`${protocol}Format`], 'geo-json');
      listeners.get(`${protocol}-connection-state`)('disconnected');
    }
    const httpOutput = { outputType: 'http', label: 'HTTP output', url: 'http://127.0.0.1:9011/receive?tenant=demo', format: 'json' };
    listeners.get('velocity:output-applied')({
      ...httpOutput, connectionOptions: buildVelocityConnectionOptions(httpOutput),
    });
    assert.strictEqual(get('connection-type').value, 'http-server');
    assert.strictEqual(get('http-path').value, '/receive?tenant=demo');
    assert.strictEqual(get('http-tls').checked, false);
    assert.strictEqual(get('http-format').value, 'json');
    const grpcItem = {
      outputType: 'grpc', label: 'gRPC', authType: 'token',
      url: 'https://grpc.example.com:7443', headerPathKey: 'tenant-route', headerPath: 'route-a',
    };
    const grpcOptions = buildVelocityConnectionOptions(grpcItem);
    for (const previousSerialization of ['text', 'kryo']) {
      get('grpc-serialization').value = previousSerialization;
      listeners.get('velocity:output-applied')({ ...grpcItem, connectionOptions: grpcOptions });
      assert.strictEqual(get('grpc-serialization').value, 'protobuf');
      assert.strictEqual(get('grpc-header-path-key').value, 'tenant-route');
      assert.strictEqual(get('grpc-header-path').value, 'route-a');
      assert.strictEqual(get('port').value, '7443');
    }
    get('connect-btn').click();
    const grpcRequest = sent.find(([channel]) => channel === 'connect-grpc')[1];
    assert.strictEqual(grpcRequest.grpcSerialization, 'protobuf');
    assert.strictEqual(grpcRequest.headerPathKey, 'tenant-route');
    assert.strictEqual(grpcRequest.headerPath, 'route-a');
    console.log('velocity-output-apply tests passed');
  } finally {
    dom.window.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
