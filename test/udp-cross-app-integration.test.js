const assert = require('assert');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runHeadlessSession, EXIT_CODES } = require('../src/headless-runner.js');
const { DEFAULT_HEADLESS_OPTIONS } = require('../src/cli-options.js');
const UDP_MARKER_LITERAL = 'UDP Client connected';

const SIMULATOR_ROOT = process.env.VELOCITY_SIMULATOR_ROOT
  || path.resolve(__dirname, '..', '..', 'arcgis-velocity-simulator');
const simulatorTransportPath = path.join(SIMULATOR_ROOT, 'src', 'transport-manager.js');

if (!fs.existsSync(simulatorTransportPath)) {
  console.log('  – UDP cross-app integration (Simulator checkout not found)');
  process.exit(0);
}

const { TransportManager } = require(simulatorTransportPath);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, message, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await delay(10);
  }
}

function closeSocket(socket) {
  return new Promise((resolve) => {
    try { socket.close(resolve); } catch (_) { resolve(); }
  });
}

async function reserveUdpPort() {
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await closeSocket(socket);
  return port;
}

function loggerOptions(overrides) {
  return {
    ...DEFAULT_HEADLESS_OPTIONS,
    protocol: 'udp',
    ip: '127.0.0.1',
    udpFormat: 'delimited',
    outputFormat: 'jsonl',
    stdout: false,
    logLevel: 'error',
    durationMs: 3000,
    ...overrides,
  };
}

function readyLogger(pattern) {
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  return {
    logger: {
      info(message) {
        if (pattern.test(message)) resolveReady();
      },
      warn() {},
      error() {},
      debug() {},
    },
    ready,
  };
}

function readCaptured(pathname) {
  return fs.readFileSync(pathname, 'utf8').trim().split('\n').filter(Boolean)
    .map((line) => JSON.parse(line).data);
}

async function assertPortReusable(port) {
  const probe = dgram.createSocket('udp4');
  try {
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.bind(port, '127.0.0.1', resolve);
    });
  } finally {
    await closeSocket(probe);
  }
}

async function simulatorClientToLoggerServer(directory) {
  const port = await reserveUdpPort();
  const outputFile = path.join(directory, 'client-to-server.jsonl');
  const doneFile = path.join(directory, 'client-to-server.done.json');
  const readiness = readyLogger(/^UDP server listening on /);
  const loggerRun = runHeadlessSession(loggerOptions({
    mode: 'server',
    port,
    outputFile,
    doneFile,
    maxLogCount: 3,
  }), { logger: readiness.logger });
  const simulator = new TransportManager();
  const simulatorReceived = [];
  simulator.on('data-received', (event) => simulatorReceived.push(event.data));

  try {
    await Promise.race([
      readiness.ready,
      delay(2000).then(() => { throw new Error('Logger UDP server did not report ready'); }),
    ]);
    await simulator.connect({
      protocol: 'udp',
      mode: 'client',
      ip: '127.0.0.1',
      port,
      udpFormat: 'delimited',
      udpAppendNewline: false,
    });
    const payloads = ['  café,雪  \n', UDP_MARKER_LITERAL, 'final,value'];
    for (const payload of payloads) await simulator.send(payload);
    assert.strictEqual(await loggerRun, EXIT_CODES.success);
    const captured = readCaptured(outputFile);
    assert.deepStrictEqual(captured, payloads);
    assert.deepStrictEqual(captured.map(Buffer.from), payloads.map(Buffer.from));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(doneFile, 'utf8')).summary, {
      linesReceived: 3,
      linesWritten: 3,
      byteCount: payloads.reduce((total, payload) => total + Buffer.byteLength(payload), 0),
      stopReason: 'maxLogCount',
    });
    assert.deepStrictEqual(simulatorReceived, []);
  } finally {
    await simulator.disconnect();
    await loggerRun;
  }
  assert.strictEqual(simulator.connection, null);
  await assertPortReusable(port);
}

async function simulatorServerToLoggerClient(directory) {
  const port = await reserveUdpPort();
  const simulator = new TransportManager();
  let loggerRun = null;

  try {
    const outputFile = path.join(directory, 'server-to-client.jsonl');
    const doneFile = path.join(directory, 'server-to-client.done.json');
    const readiness = readyLogger(/^UDP client receiver ready at /);
    loggerRun = runHeadlessSession(loggerOptions({
      mode: 'client', udpLocalHost: '127.0.0.1', udpLocalPort: port,
      outputFile, doneFile, maxLogCount: 2,
    }), { logger: readiness.logger });
    await readiness.ready;
    await simulator.connect({
      protocol: 'udp', mode: 'server', ip: '127.0.0.1', port,
      udpLocalHost: '127.0.0.1', udpLocalPort: 0,
      udpFormat: 'delimited', udpAppendNewline: false,
    });
    for (const payload of ['first,雪\n', 'second,value']) await simulator.send(payload);
    assert.strictEqual(await loggerRun, EXIT_CODES.success);
    assert.deepStrictEqual(readCaptured(outputFile), ['first,雪\n', 'second,value']);
    assert.strictEqual(JSON.parse(fs.readFileSync(doneFile, 'utf8')).summary.linesReceived, 2);
  } finally {
    await simulator.disconnect();
    if (loggerRun) await loggerRun;
  }
  assert.strictEqual(simulator.connection, null);
  await assertPortReusable(port);
}

async function loggerClientSurvivesSimulatorRestart(directory) {
  const port = await reserveUdpPort();
  const simulator = new TransportManager();
  const outputFile = path.join(directory, 'server-restart.jsonl');
  const doneFile = path.join(directory, 'server-restart.done.json');
  const readiness = readyLogger(/^UDP client receiver ready at /);
  const loggerRun = runHeadlessSession(loggerOptions({
    mode: 'client', udpLocalHost: '127.0.0.1', udpLocalPort: port,
    outputFile,
    doneFile,
    maxLogCount: 2,
    durationMs: 5000,
  }), { logger: readiness.logger });

  try {
    await readiness.ready;
    const options = {
      protocol: 'udp', mode: 'server', ip: '127.0.0.1', port,
      udpLocalHost: '127.0.0.1', udpLocalPort: 0,
      udpFormat: 'delimited', udpAppendNewline: false,
    };
    await simulator.connect(options);
    await simulator.send('before,restart');
    await simulator.disconnect();
    await delay(140);

    await simulator.connect(options);
    await simulator.send('after,restart');
    assert.strictEqual(await loggerRun, EXIT_CODES.success);
    assert.deepStrictEqual(readCaptured(outputFile), ['before,restart', 'after,restart']);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(doneFile, 'utf8')).summary, {
      linesReceived: 2,
      linesWritten: 2,
      byteCount: Buffer.byteLength('before,restart') + Buffer.byteLength('after,restart'),
      stopReason: 'maxLogCount',
    });
  } finally {
    await Promise.allSettled([loggerRun]);
    await simulator.disconnect();
  }
  assert.strictEqual(simulator.connection, null);
  await assertPortReusable(port);
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-udp-cross-app-'));
  try {
    await simulatorClientToLoggerServer(directory);
    await simulatorServerToLoggerClient(directory);
    await loggerClientSurvivesSimulatorRestart(directory);
    console.log('UDP cross-app integration tests passed');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
