const assert = require('assert');
const net = require('net');
const { createReceiver } = require('../src/headless-runner.js');
const { DEFAULT_HEADLESS_OPTIONS } = require('../src/cli-options.js');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, message, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await delay(10);
  }
}

function logger() {
  return { info() {}, warn() {}, error() {}, debug() {} };
}

function options(overrides) {
  return {
    ...DEFAULT_HEADLESS_OPTIONS,
    protocol: 'tcp',
    mode: 'server',
    ip: '127.0.0.1',
    port: 0,
    tcpFormat: 'delimited',
    tcpAddressFamily: 'ipv4',
    tcpHandshakeText: '',
    tcpHandshakeUseEscapes: true,
    connectTimeoutMs: 1000,
    ...overrides,
  };
}

function listenServer(port, onSocket) {
  const server = net.createServer(onSocket);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function connectAndRead(port, byteCount, outbound = '') {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    const socket = net.createConnection(port, '127.0.0.1', () => {
      if (outbound) socket.write(outbound);
    });
    socket.once('error', reject);
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      length += chunk.length;
      if (length >= byteCount) resolve({ socket, bytes: Buffer.concat(chunks) });
    });
  });
}

async function ipv6Available() {
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '::1', resolve);
    });
    return true;
  } catch (error) {
    if (['EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EPROTONOSUPPORT'].includes(error.code)) return false;
    throw error;
  } finally {
    try { server.close(); } catch (_) {}
  }
}

(async () => {
  const probe = await listenServer(0, () => {});
  const serverPort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const greeting = Buffer.from('  hello\r\n');
  const serverInbound = [];
  const receiver = createReceiver(options({
    port: serverPort,
    tcpHandshakeText: String.raw`  hello\r\n`,
  }), {
    logger: logger(),
    onLine(line) { serverInbound.push(line); },
    onError(error) { throw error; },
  });
  await receiver.startedPromise;
  const first = await connectAndRead(serverPort, greeting.length, 'incoming,one\n');
  const second = await connectAndRead(serverPort, greeting.length, 'incoming,two\n');
  assert.deepStrictEqual(first.bytes, greeting);
  assert.deepStrictEqual(second.bytes, greeting);
  await waitFor(() => serverInbound.length === 2, 'TCP server did not receive peer data during greetings');
  assert.deepStrictEqual(serverInbound, ['incoming,one', 'incoming,two']);
  first.socket.destroy();
  second.socket.destroy();
  await receiver.stop();

  const clientGreeting = Buffer.from('  raw\\n  ');
  const received = [];
  const clientInbound = [];
  const peer = await listenServer(0, (socket) => {
    socket.write('server,data\n');
    socket.once('data', (bytes) => received.push(bytes));
  });
  const peerPort = peer.address().port;
  const client = createReceiver(options({
    mode: 'client',
    port: peerPort,
    tcpHandshakeText: '  raw\\n  ',
    tcpHandshakeUseEscapes: false,
  }), {
    logger: logger(),
    onLine(line) { clientInbound.push(line); },
    onError() {},
  });
  await client.startedPromise;
  await waitFor(() => received.length === 1, 'TCP client greeting was not received');
  assert.deepStrictEqual(received[0], clientGreeting);
  await waitFor(() => clientInbound.length === 1, 'TCP client did not receive data during greeting');
  assert.deepStrictEqual(clientInbound, ['server,data']);
  await client.stop();
  await new Promise((resolve) => peer.close(resolve));

  const reconnectPortProbe = await listenServer(0, () => {});
  const reconnectPort = reconnectPortProbe.address().port;
  await new Promise((resolve) => reconnectPortProbe.close(resolve));
  const reconnectGreeting = Buffer.from('again\n');
  const reconnects = [];
  let currentServer = await listenServer(reconnectPort, (socket) => {
    socket.once('data', (bytes) => {
      reconnects.push(bytes);
      socket.destroy();
    });
  });
  const reconnectClient = createReceiver(options({
    mode: 'client',
    port: reconnectPort,
    tcpHandshakeText: String.raw`again\n`,
    connectWaitForServer: true,
    connectRetryIntervalMs: 20,
    connectTimeoutMs: 1500,
  }), {
    logger: logger(),
    onLine() {},
    onError() {},
  });
  await reconnectClient.startedPromise;
  await waitFor(() => reconnects.length === 1, 'Initial reconnect greeting missing');
  await new Promise((resolve) => currentServer.close(resolve));
  await delay(80);
  currentServer = await listenServer(reconnectPort, (socket) => {
    socket.once('data', (bytes) => reconnects.push(bytes));
  });
  await waitFor(() => reconnects.length === 2, 'Greeting was not resent after reconnect');
  assert.deepStrictEqual(reconnects, [reconnectGreeting, reconnectGreeting]);
  await reconnectClient.stop();
  await new Promise((resolve) => currentServer.close(resolve));

  if (await ipv6Available()) {
    const probe6 = net.createServer();
    await new Promise((resolve, reject) => {
      probe6.once('error', reject);
      probe6.listen(0, '::1', resolve);
    });
    const port6 = probe6.address().port;
    await new Promise((resolve) => probe6.close(resolve));
    const serverGreeting6 = Buffer.from('server6\n');
    const receiver6 = createReceiver(options({
      ip: '::1',
      port: port6,
      tcpAddressFamily: 'ipv6',
      tcpHandshakeText: String.raw`server6\n`,
    }), {
      logger: logger(),
      onLine() {},
      onError(error) { throw error; },
    });
    await receiver6.startedPromise;
    const client6 = await new Promise((resolve, reject) => {
      const socket = net.createConnection(port6, '::1');
      socket.once('error', reject);
      socket.once('data', (bytes) => resolve({ socket, bytes }));
    });
    assert.deepStrictEqual(client6.bytes, serverGreeting6);
    client6.socket.destroy();
    await receiver6.stop();

    let peerSocket6;
    let peerBytes6;
    const server6 = net.createServer((socket) => {
      peerSocket6 = socket;
      socket.once('data', (bytes) => { peerBytes6 = bytes; });
    });
    await new Promise((resolve, reject) => {
      server6.once('error', reject);
      server6.listen(port6, '::1', resolve);
    });
    const clientReceiver6 = createReceiver(options({
      mode: 'client',
      ip: '::1',
      port: port6,
      tcpAddressFamily: 'ipv6',
      tcpHandshakeText: String.raw`client6\n`,
    }), {
      logger: logger(),
      onLine() {},
      onError() {},
    });
    await clientReceiver6.startedPromise;
    await waitFor(() => peerBytes6, 'IPv6 TCP client greeting was not received');
    assert.deepStrictEqual(peerBytes6, Buffer.from('client6\n'));
    await clientReceiver6.stop();
    peerSocket6.destroy();
    await new Promise((resolve) => server6.close(resolve));
  } else {
    console.log('  – TCP handshake IPv6 cases skipped: ::1 is unavailable');
  }

  console.log('TCP handshake integration: server peers, client raw whitespace, and reconnect passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
