const assert = require('assert');
const dgram = require('dgram');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { runHeadlessSession, EXIT_CODES } = require('../src/headless-runner.js');
const { DEFAULT_HEADLESS_OPTIONS } = require('../src/cli-options.js');

const SIMULATOR_ROOT = process.env.VELOCITY_SIMULATOR_ROOT
  || path.resolve(__dirname, '..', '..', 'arcgis-velocity-simulator');
const simulatorTransportPath = path.join(SIMULATOR_ROOT, 'src', 'transport-manager.js');

if (!fs.existsSync(simulatorTransportPath)) {
  console.log('  – TCP/UDP family cross-app integration (Simulator checkout not found)');
  process.exit(0);
}

const { TransportManager } = require(simulatorTransportPath);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, message, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await wait(10);
  }
}

async function supportsIpv6() {
  const socket = dgram.createSocket({ type: 'udp6', ipv6Only: true });
  try {
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(0, '::1', resolve);
    });
    return true;
  } catch (error) {
    if (['EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EPROTONOSUPPORT'].includes(error.code)) return false;
    throw error;
  } finally {
    try { socket.close(); } catch (_) {}
  }
}

function reservePort(protocol, host) {
  if (protocol === 'tcp') {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, host, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
    });
  }
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({
      type: host === '::1' ? 'udp6' : 'udp4',
      ...(host === '::1' ? { ipv6Only: true } : {}),
    });
    socket.once('error', reject);
    socket.bind(0, host, () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

async function assertPortReusable(protocol, host, port) {
  assert.strictEqual(await reserveSpecificPort(protocol, host, port), port);
}

function reserveSpecificPort(protocol, host, port) {
  if (protocol === 'tcp') {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(port, host, () => server.close(() => resolve(port)));
    });
  }
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({
      type: host === '::1' ? 'udp6' : 'udp4',
      ...(host === '::1' ? { ipv6Only: true } : {}),
    });
    socket.once('error', reject);
    socket.bind(port, host, () => socket.close(() => resolve(port)));
  });
}

function loggerOptions(protocol, mode, family, host, port, outputFile, maxLogCount) {
  return {
    ...DEFAULT_HEADLESS_OPTIONS,
    protocol,
    mode,
    ip: host,
    port,
    tcpAddressFamily: family === 'ipv6' ? 'ipv6' : 'ipv4',
    udpAddressFamily: family,
    ...(protocol === 'udp' && mode === 'client'
      ? { udpLocalHost: host, udpLocalPort: port }
      : {}),
    tcpFormat: 'delimited',
    udpFormat: 'delimited',
    outputFile,
    outputFormat: 'jsonl',
    stdout: false,
    logLevel: 'error',
    durationMs: 3500,
    maxLogCount,
  };
}

function readyLogger(pattern) {
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  return {
    ready,
    logger: {
      info(message) { if (pattern.test(message)) resolveReady(); },
      warn() {},
      error() {},
      debug() {},
    },
  };
}

function readCaptured(filename) {
  return fs.readFileSync(filename, 'utf8').trim().split('\n').filter(Boolean)
    .map((line) => JSON.parse(line).data);
}

async function simulatorClientToLoggerServer(protocol, family, directory) {
  const host = family === 'ipv6' ? '::1' : '127.0.0.1';
  const port = await reservePort(protocol, host);
  const outputFile = path.join(directory, `${protocol}-${family}-sim-client.jsonl`);
  const readiness = readyLogger(new RegExp(`^${protocol.toUpperCase()} server listening on `));
  const loggerRun = runHeadlessSession(
    loggerOptions(protocol, 'server', family, host, port, outputFile, 2),
    { logger: readiness.logger },
  );
  const simulator = new TransportManager();
  const unexpectedReplies = [];
  simulator.on('data-received', (event) => unexpectedReplies.push(event.data));
  try {
    await Promise.race([
      readiness.ready,
      wait(2000).then(() => { throw new Error(`${protocol}/${family} Logger server not ready`); }),
    ]);
    await simulator.connect({
      protocol, mode: 'client', ip: host, port,
      tcpAddressFamily: family, udpAddressFamily: family,
      tcpFormat: 'delimited', udpFormat: 'delimited',
    });
    const payloads = [
      `${protocol},${family},雪`,
      protocol === 'udp' ? `  café,${family}  \n` : `  café,${family}  `,
    ];
    for (const payload of payloads) await simulator.send(payload);
    assert.strictEqual(await loggerRun, EXIT_CODES.success);
    const captured = readCaptured(outputFile);
    const wirePayloads = protocol === 'udp'
      ? payloads.map((payload) => payload.endsWith('\n') ? payload : `${payload}\n`)
      : payloads;
    assert.deepStrictEqual(captured, wirePayloads);
    assert.deepStrictEqual(captured.map(Buffer.from), wirePayloads.map(Buffer.from));
    assert.deepStrictEqual(unexpectedReplies, []);
  } finally {
    await simulator.disconnect();
    await Promise.allSettled([loggerRun]);
  }
  await assertPortReusable(protocol, host, port);
}

async function simulatorServerToLoggerClient(protocol, family, directory) {
  const host = family === 'ipv6' ? '::1' : '127.0.0.1';
  const simulator = new TransportManager();
  const requestedPort = protocol === 'udp' ? await reservePort(protocol, host) : 0;
  const connected = await simulator.connect({
    protocol, mode: 'server', ip: host, port: requestedPort,
    tcpAddressFamily: family, udpAddressFamily: family,
    ...(protocol === 'udp' ? { udpLocalHost: host, udpLocalPort: 0 } : {}),
    tcpFormat: 'delimited', udpFormat: 'delimited',
  });
  const port = protocol === 'udp' ? requestedPort : connected.address.port;
  const outputFile = path.join(directory, `${protocol}-${family}-sim-server.jsonl`);
  const readiness = protocol === 'udp'
    ? readyLogger(/^UDP client receiver ready at /)
    : null;
  const loggerRun = runHeadlessSession(
    loggerOptions(protocol, 'client', family, host, port, outputFile, 2),
    readiness ? { logger: readiness.logger } : undefined,
  );
  try {
    if (readiness) await readiness.ready;
    else await waitFor(() => simulator.hasRecipients(), `${protocol}/${family} Simulator did not observe Logger`);
    const payloads = [
      `${protocol},${family},first`,
      protocol === 'udp' ? `${protocol},${family},第二\n` : `${protocol},${family},第二`,
    ];
    for (const payload of payloads) await simulator.send(payload);
    assert.strictEqual(await loggerRun, EXIT_CODES.success);
    assert.deepStrictEqual(
      readCaptured(outputFile),
      protocol === 'udp'
        ? payloads.map((payload) => payload.endsWith('\n') ? payload : `${payload}\n`)
        : payloads,
    );
  } finally {
    await Promise.allSettled([loggerRun]);
    await simulator.disconnect();
  }
  await assertPortReusable(protocol, host, port);
}

async function udpIpv6ReceiverSurvivesPublisherRestart(directory) {
  const port = await reservePort('udp', '::1');
  const simulator = new TransportManager();
  const options = {
    protocol: 'udp', mode: 'server', ip: '::1', port,
    udpAddressFamily: 'ipv6', udpLocalHost: '::1', udpLocalPort: 0,
    udpFormat: 'delimited',
  };
  const outputFile = path.join(directory, 'udp-ipv6-restart.jsonl');
  const readiness = readyLogger(/^UDP client receiver ready at /);
  const loggerRun = runHeadlessSession(
    loggerOptions('udp', 'client', 'ipv6', '::1', port, outputFile, 2),
    { logger: readiness.logger },
  );
  try {
    await readiness.ready;
    await simulator.connect(options);
    await simulator.send('ipv6,before,restart');
    await simulator.disconnect();
    await wait(140);
    await simulator.connect(options);
    await simulator.send('ipv6,after,restart');
    assert.strictEqual(await loggerRun, EXIT_CODES.success);
    assert.deepStrictEqual(readCaptured(outputFile), [
      'ipv6,before,restart\n',
      'ipv6,after,restart\n',
    ]);
  } finally {
    await Promise.allSettled([loggerRun]);
    await simulator.disconnect();
  }
  await assertPortReusable('udp', '::1', port);
}

(async () => {
  const ipv6 = await supportsIpv6();
  if (!ipv6) console.log('  – TCP/UDP IPv6 cross-app cases skipped: ::1 UDP is unavailable');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'socket-family-cross-app-'));
  try {
    for (const protocol of ['tcp', 'udp']) {
      await simulatorClientToLoggerServer(protocol, 'ipv4', directory);
      await simulatorServerToLoggerClient(protocol, 'ipv4', directory);
      if (ipv6) {
        await simulatorClientToLoggerServer(protocol, 'ipv6', directory);
        await simulatorServerToLoggerClient(protocol, 'ipv6', directory);
      }
    }
    if (ipv6) await udpIpv6ReceiverSurvivesPublisherRestart(directory);
    console.log(`TCP/UDP family cross-app tests passed${ipv6 ? ' (8 cases)' : ' (4 IPv4 cases; IPv6 unavailable)'}`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
