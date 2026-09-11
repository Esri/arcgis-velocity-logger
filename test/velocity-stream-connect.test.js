const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const start = source.indexOf("ipcMain.on('connect-ws',");
const end = source.indexOf('// The WebSocket transport tears down asynchronously', start);
assert.ok(start >= 0 && end > start);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const handlers = {};
const messages = [];
const transports = [];
let credentials = deferred();
const context = {
  ipcMain: { on: (channel, handler) => { handlers[channel] = handler; } },
  mainWindow: { isDestroyed: () => false, webContents: { send: (...args) => messages.push(args) } },
  wsConnectionAttempt: 0,
  wsTransport: null,
  currentConnectionDetails: null,
  velocitySendAuthToken: true,
  velocityOutputs: { streamConnection: () => credentials.promise },
  getVelocityAuthTokenForConnection: () => 'portal-token',
  updateWsButtonStates: (state) => messages.push(['state', state]),
  WS_CONTENT_TYPES: { json: 'application/json' },
  velocityLog: () => {},
  createWsClientTransport: (options) => {
    const pending = deferred();
    const transport = { options, pending, connect: () => pending.promise };
    transports.push(transport);
    return transport;
  },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

(async () => {
  const options = { type: 'client', host: 'events.example.com', port: 443, wsTls: true, wsPath: '/subscribe', wsFormat: 'json' };
  const cancelled = handlers['connect-ws']({}, options);
  context.wsConnectionAttempt += 1;
  credentials.resolve({ authQueryToken: 'cancelled-token' });
  await cancelled;
  assert.strictEqual(transports.length, 0);

  credentials = deferred();
  credentials.resolve({ authQueryToken: 'stream-token' });
  await handlers['connect-ws']({}, options);
  const first = transports[0];
  assert.strictEqual(first.options.authToken, null);
  assert.strictEqual(first.options.authQueryToken, 'stream-token');

  context.wsConnectionAttempt += 1;
  context.wsTransport = null;
  await handlers['connect-ws']({}, options);
  const second = transports[1];
  second.pending.resolve({ address: 'wss://events.example.com/subscribe', tlsInfo: 'tls=on' });
  await new Promise(setImmediate);
  const currentMessageCount = messages.length;
  first.pending.reject(new Error('obsolete handshake'));
  await new Promise(setImmediate);
  assert.strictEqual(context.wsTransport, second);
  assert.strictEqual(messages.length, currentMessageCount);
  assert.ok(!JSON.stringify(messages).includes('stream-token'));

  await handlers['connect-ws']({}, options);
  const third = transports[2];
  context.wsConnectionAttempt += 1;
  context.wsTransport = null;
  const beforeOldSuccess = messages.length;
  third.pending.resolve({ address: 'obsolete connection' });
  await new Promise(setImmediate);
  assert.strictEqual(context.wsTransport, null);
  assert.strictEqual(messages.length, beforeOldSuccess);
  console.log('velocity-stream-connect tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
