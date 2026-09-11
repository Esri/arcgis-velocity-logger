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
