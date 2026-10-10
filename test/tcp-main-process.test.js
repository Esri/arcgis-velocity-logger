const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const vm = require('vm');
const { decodeTcpHandshake, writeTcpHandshake } = require('../src/tcp-handshake-utils');
const { assertSocketPayloadFormat, attachTcpPayloadReceiver, finishTcpPayloadReceiver } = require('../src/socket-payload-receiver');
const { resolveSocketEndpoint, tcpSocketOptions, formatSocketEndpoint } = require('../src/socket-address-utils');
const { APP_DEFAULTS } = require('../src/cli-options');

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const handlers = main.slice(main.indexOf("ipcMain.on('connect-tcp'"), main.indexOf('// Helper function to validate UDP'));
const cleanupStart = main.indexOf('function cleanupTcpClientSocket(');
const cleanup = main.slice(cleanupStart, main.indexOf('\n}', cleanupStart) + 2);
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(predicate, message) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await delay(5);
  }
}

function runtime() {
  const callbacks = new Map();
  const records = [];
  const errors = [];
  const states = [];
  const context = {
    net, AbortController, APP_DEFAULTS, decodeTcpHandshake, writeTcpHandshake,
    assertSocketPayloadFormat, attachTcpPayloadReceiver, finishTcpPayloadReceiver,
    resolveSocketEndpoint, tcpSocketOptions, formatSocketEndpoint,
    server: null, clientSocket: null, sockets: [], currentConnectionDetails: null,
    tcpConnectionAttempt: 0, tcpHandshakeControllers: new Map(), TCP_HANDSHAKE_TIMEOUT_MS: 1000,
    ipcMain: { on: (name, callback) => callbacks.set(name, callback) },
    mainWindow: { isDestroyed: () => false, webContents: {
      send: (name, value) => { if (name.endsWith('error')) errors.push(value); },
    } },
    velocityLog() {},
    reportSocketPayloadWarning: (_protocol, message) => errors.push(message),
    sendSocketPayloadRecord: (raw) => records.push(raw),
    updateTcpButtonStates: (state) => states.push(state),
    handleError: (error) => errors.push(error.message),
  };
  vm.createContext(context);
  vm.runInContext(`${cleanup}\n${handlers}`, context);
  return { context, callbacks, records, errors, states };
}

async function verify(type, text, useEscapes, expected) {
  const app = runtime();
  const peers = [];
  let remote;
  try {
    const outbound = [];
    const onPeer = (socket) => {
      peers.push(socket);
      socket.on('data', bytes => outbound.push(bytes));
      socket.write('event,one\n');
    };
    if (type === 'client') {
      remote = net.createServer(onPeer);
      await new Promise((resolve, reject) => {
        remote.once('error', reject);
        remote.listen(0, '127.0.0.1', resolve);
      });
    }
    await app.callbacks.get('connect-tcp')({}, {
      type, host: '127.0.0.1', port: remote ? remote.address().port : 0,
      tcpFormat: 'delimited', tcpAddressFamily: 'ipv4', tcpHandshakeText: text,
      ...(useEscapes === undefined ? {} : { tcpHandshakeUseEscapes: useEscapes }),
    });
    await waitFor(() => app.states.includes('connected'), 'Desktop TCP receiver did not connect');
    if (type === 'server') {
      for (let i = 0; i < 2; i++) {
        const socket = net.createConnection(app.context.server.address().port, '127.0.0.1');
        onPeer(socket);
        await waitFor(() => app.records.length === i + 1, 'Desktop TCP server did not capture peer data');
      }
    } else {
      await waitFor(() => app.records.length === 1, 'Desktop TCP client did not capture peer data');
    }
    const connections = type === 'server' ? 2 : 1;
    if (expected.length) {
      await waitFor(() => Buffer.concat(outbound).length === Buffer.byteLength(expected) * connections,
        'Desktop greeting bytes were not received');
    }
    await delay(25);
    assert.deepStrictEqual(Buffer.concat(outbound), Buffer.from(expected.repeat(connections)));
    assert.deepStrictEqual(app.records, Array(connections).fill('event,one'));
    assert.deepStrictEqual(app.errors, []);
  } finally {
    app.callbacks.get('disconnect-tcp')();
    for (const socket of peers) socket.destroy();
    if (remote) await new Promise(resolve => remote.close(resolve));
    await waitFor(() => !app.context.server && !app.context.clientSocket, 'Desktop TCP cleanup did not finish');
  }
}

(async () => {
  for (const type of ['client', 'server']) {
    await verify(type, String.raw`  hello\r\n  `, undefined, 'hello\r\n');
    await verify(type, String.raw`  hello\r\n  `, false, String.raw`hello\r\n`);
    await verify(type, '\u00a0hello\u00a0', true, '\u00a0hello\u00a0');
    await verify(type, ' \t\r\n', false, '');
    await verify(type, String.raw`\q\uu+0041\377\uD800`, true, 'qAÿ?');
    const app = runtime();
    await app.callbacks.get('connect-tcp')({}, {
      type, host: '127.0.0.1', port: 0, tcpHandshakeText: String.raw`secret\u12`,
    });
    assert.strictEqual(app.context.server, null);
    assert.strictEqual(app.context.clientSocket, null);
    assert.strictEqual(app.states.at(-1), 'disconnected');
    assert.strictEqual(app.errors.length, 1);
    assert.match(app.errors[0], /invalid Unicode escape/);
    assert.ok(!app.errors[0].includes('secret'));
  }
  console.log('TCP desktop main-process: trim, literal/default escapes, NBSP, empty greeting, and each accepted peer passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
