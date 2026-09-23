const assert = require('assert');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runHeadlessSession, EXIT_CODES } = require('../src/headless-runner.js');
const { DEFAULT_HEADLESS_OPTIONS } = require('../src/cli-options.js');
const { UDP_CLIENT_REGISTRATION_MESSAGE } = require('../src/udp-utils.js');

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
    const payloads = ['  café,雪  \n', UDP_CLIENT_REGISTRATION_MESSAGE, 'final,value'];
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
  const simulator = new TransportManager();
  const registrationPayloads = [];
  simulator.on('data-received', (event) => registrationPayloads.push(event.data));
  const connected = await simulator.connect({
    protocol: 'udp',
    mode: 'server',
    ip: '127.0.0.1',
    port: 0,
    udpFormat: 'delimited',
    udpAppendNewline: false,
  });
  const port = connected.address.port;
  let blocker = null;
  let firstRun = null;
  let secondRun = null;

  try {
    const firstOutput = path.join(directory, 'server-to-client-first.jsonl');
    const firstDone = path.join(directory, 'server-to-client-first.done.json');
    firstRun = runHeadlessSession(loggerOptions({
      mode: 'client', port, outputFile: firstOutput, doneFile: firstDone, maxLogCount: 1,
    }));
    await waitFor(() => simulator.hasRecipients(), 'Simulator did not learn the first Logger endpoint');
    const firstClientKey = [...simulator.udpServerClients][0];
    await simulator.send('first,雪\n');
    assert.strictEqual(await firstRun, EXIT_CODES.success);
    const firstCaptured = readCaptured(firstOutput);
    assert.deepStrictEqual(firstCaptured, ['first,雪\n']);
    assert.deepStrictEqual(firstCaptured.map(Buffer.from), [Buffer.from('first,雪\n')]);
    assert.strictEqual(JSON.parse(fs.readFileSync(firstDone, 'utf8')).summary.linesReceived, 1);

    const firstPort = Number(firstClientKey.slice(firstClientKey.lastIndexOf(':') + 1));
    blocker = dgram.createSocket('udp4');
    await new Promise((resolve, reject) => {
      blocker.once('error', reject);
      blocker.bind(firstPort, '127.0.0.1', resolve);
    });

    const secondOutput = path.join(directory, 'server-to-client-second.jsonl');
    const secondDone = path.join(directory, 'server-to-client-second.done.json');
    secondRun = runHeadlessSession(loggerOptions({
      mode: 'client', port, outputFile: secondOutput, doneFile: secondDone, maxLogCount: 1,
    }));
    await waitFor(
      () => simulator.udpServerClients.size >= 2,
      'Simulator did not learn the reconnected Logger endpoint',
    );
    const learned = [...simulator.udpServerClients];
    assert.notStrictEqual(learned.at(-1), firstClientKey);
    await simulator.send('second,value');
    assert.strictEqual(await secondRun, EXIT_CODES.success);
    assert.deepStrictEqual(readCaptured(secondOutput), ['second,value']);
    assert.strictEqual(JSON.parse(fs.readFileSync(secondDone, 'utf8')).summary.linesReceived, 1);
    assert.deepStrictEqual(registrationPayloads, []);
  } finally {
    if (blocker) await closeSocket(blocker);
    await simulator.disconnect();
    await Promise.allSettled([firstRun, secondRun].filter(Boolean));
  }
  assert.strictEqual(simulator.connection, null);
  assert.strictEqual(simulator.udpServerClients.size, 0);
  await assertPortReusable(port);
}

async function loggerClientSurvivesSimulatorRestart(directory) {
  const simulator = new TransportManager();
  let registrationPackets = 0;
  const countRegistrations = (message) => {
    if (message.equals(Buffer.from(UDP_CLIENT_REGISTRATION_MESSAGE))) registrationPackets += 1;
  };
  const connected = await simulator.connect({
    protocol: 'udp',
    mode: 'server',
    ip: '127.0.0.1',
    port: 0,
    udpFormat: 'delimited',
    udpAppendNewline: false,
  });
  const port = connected.address.port;
  simulator.connection.socket.on('message', countRegistrations);
  const outputFile = path.join(directory, 'server-restart.jsonl');
  const doneFile = path.join(directory, 'server-restart.done.json');
  const loggerRun = runHeadlessSession(loggerOptions({
    mode: 'client',
    port,
    outputFile,
    doneFile,
    maxLogCount: 2,
    durationMs: 5000,
    udpRegistrationIntervalMs: 40,
  }));

  try {
    await waitFor(() => simulator.hasRecipients(), 'Simulator did not learn the Logger before restart');
    await simulator.send('before,restart');
    await simulator.disconnect();
    await delay(140);

    await simulator.connect({
      protocol: 'udp',
      mode: 'server',
      ip: '127.0.0.1',
      port,
      udpFormat: 'delimited',
      udpAppendNewline: false,
    });
    simulator.connection.socket.on('message', countRegistrations);
    await waitFor(
      () => simulator.hasRecipients(),
      'Renewal did not register the still-running Logger after Simulator restart',
      2500,
    );
    await simulator.send('after,restart');
    assert.strictEqual(await loggerRun, EXIT_CODES.success);
    assert.deepStrictEqual(readCaptured(outputFile), ['before,restart', 'after,restart']);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(doneFile, 'utf8')).summary, {
      linesReceived: 2,
      linesWritten: 2,
      byteCount: Buffer.byteLength('before,restart') + Buffer.byteLength('after,restart'),
      stopReason: 'maxLogCount',
    });
    assert.ok(registrationPackets >= 2, 'Expected initial and renewed registration packets');

    const stoppedAt = registrationPackets;
    await delay(140);
    assert.strictEqual(
      registrationPackets,
      stoppedAt,
      'Registration packets continued after Logger teardown',
    );
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
