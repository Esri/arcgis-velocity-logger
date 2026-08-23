/**
 * Tests for src/headless-runner.js covering real TCP server capture end-to-end.
 *
 * Uses a short-lived TCP client to push lines into a headless server and asserts the
 * resulting outputFile content, doneFile payload, and exit code signals. No Electron `app`
 * is provided; the runner returns the exit code instead.
 */
const assert = require('assert');
const dgram = require('dgram');
const fs = require('fs');
const net = require('net');
const path = require('path');

const grpcTransportModule = require('../src/grpc-transport.js');
const { runHeadlessSession, EXIT_CODES } = require('../src/headless-runner.js');
const { DEFAULT_HEADLESS_OPTIONS } = require('../src/cli-options.js');
const { createHttpClientTransport, createHttpServerTransport, HttpServerTransport } = require('../src/http-transport.js');
const { UDP_CLIENT_REGISTRATION_MESSAGE } = require('../src/udp-utils.js');
const { createWsClientTransport, createWsServerTransport } = require('../src/ws-transport.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.stack || err.message}`); process.exitCode = 1; }
}

// Scratch files stay inside the test folder so a run never depends on, or
// leaves anything behind in, a shared system temporary directory.
const scratchDir = path.join(__dirname, `.headless-runner-${process.pid}`);
fs.mkdirSync(scratchDir, { recursive: true });

function tmpFile(ext) {
  return path.join(scratchDir, `logger-runner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

function pickFreeUdpPort() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate, message, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function sendLines(port, lines) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, '127.0.0.1', () => {
      socket.write(`${lines.join('\n')}\n`);
      setTimeout(() => { socket.end(); resolve(); }, 50);
    });
    socket.on('error', reject);
  });
}

function baseOptions(overrides) {
  return {
    ...DEFAULT_HEADLESS_OPTIONS,
    stdout: false,
    logLevel: 'error',
    ...overrides,
  };
}

(async () => {
  console.log('headless-runner.test.js');

  await test('captures lines in text format and stops at maxLogCount', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('log');
    const doneFile = tmpFile('done.json');

    const runPromise = runHeadlessSession(baseOptions({
      outputFile: outFile,
      port,
      maxLogCount: 3,
      doneFile,
      exitOnComplete: true,
      // Stay in-process so runHeadlessSession returns an exit code instead of calling app.exit.
    }));

    // allow bind to complete
    await new Promise((res) => setTimeout(res, 100));
    await sendLines(port, ['alpha', 'beta', 'gamma', 'delta']);

    const code = await runPromise;
    assert.strictEqual(code, EXIT_CODES.success);

    const content = fs.readFileSync(outFile, 'utf8');
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(lines[0], 'alpha');
    assert.strictEqual(lines[2], 'gamma');

    const done = JSON.parse(fs.readFileSync(doneFile, 'utf8'));
    assert.strictEqual(done.success, true);
    assert.strictEqual(done.summary.linesWritten, 3);
    assert.strictEqual(done.summary.stopReason, 'maxLogCount');

    fs.unlinkSync(outFile);
    fs.unlinkSync(doneFile);
  });

  await test('jsonl format writes timestamp+seq+data', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('jsonl');

    const runPromise = runHeadlessSession(baseOptions({
      outputFile: outFile,
      outputFormat: 'jsonl',
      port,
      maxLogCount: 2,
    }));
    await new Promise((res) => setTimeout(res, 100));
    await sendLines(port, ['one', 'two']);
    await runPromise;

    const lines = fs.readFileSync(outFile, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 2);
    const first = JSON.parse(lines[0]);
    assert.strictEqual(first.data, 'one');
    assert.strictEqual(first.seq, 1);
    assert.ok(typeof first.timestamp === 'string');

    fs.unlinkSync(outFile);
  });

  await test('csv format writes header + escaped rows', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('csv');

    const runPromise = runHeadlessSession(baseOptions({
      outputFile: outFile,
      outputFormat: 'csv',
      port,
      maxLogCount: 1,
    }));
    await new Promise((res) => setTimeout(res, 100));
    await sendLines(port, ['has,comma']);
    await runPromise;

    const content = fs.readFileSync(outFile, 'utf8');
    const rows = content.trim().split('\n');
    assert.strictEqual(rows[0], 'timestamp,seq,data');
    assert.ok(rows[1].endsWith(',1,"has,comma"'));

    fs.unlinkSync(outFile);
  });

  await test('filter regex keeps matches, exclude drops matches', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('log');

    const runPromise = runHeadlessSession(baseOptions({
      outputFile: outFile,
      port,
      filter: 'ERROR|WARN',
      exclude: 'heartbeat',
      maxLogCount: 2,
    }));
    await new Promise((res) => setTimeout(res, 100));
    await sendLines(port, ['INFO hello', 'ERROR boom', 'WARN heartbeat slow', 'WARN disk full']);
    await runPromise;

    const lines = fs.readFileSync(outFile, 'utf8').trim().split('\n');
    assert.deepStrictEqual(lines, ['ERROR boom', 'WARN disk full']);
    fs.unlinkSync(outFile);
  });

  await test('UDP client registers its reply endpoint and captures the response datagram', async () => {
    const port = await pickFreeUdpPort();
    const outFile = tmpFile('log');
    const expected = 'udp,recipient,record';
    let registration = null;
    const server = dgram.createSocket('udp4');
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.bind(port, '127.0.0.1', resolve);
    });
    server.on('message', (message, remote) => {
      registration = message.toString('utf8');
      server.send(Buffer.from(expected), remote.port, remote.address);
    });

    try {
      const code = await runHeadlessSession(baseOptions({
        protocol: 'udp',
        mode: 'client',
        ip: '127.0.0.1',
        port,
        outputFile: outFile,
        maxLogCount: 1,
        durationMs: 2000,
      }));
      assert.strictEqual(code, EXIT_CODES.success);
      assert.strictEqual(registration, UDP_CLIENT_REGISTRATION_MESSAGE);
      assert.strictEqual(fs.readFileSync(outFile, 'utf8'), `${expected}\n`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });

  await test('HTTP server captures one client POST', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('log');
    const expected = 'http,logger-server,record';
    const run = runHeadlessSession(baseOptions({
      protocol: 'http',
      mode: 'server',
      ip: '127.0.0.1',
      port,
      httpFormat: 'delimited',
      httpPath: '/',
      httpTls: false,
      outputFile: outFile,
      maxLogCount: 1,
      durationMs: 2000,
    }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const client = createHttpClientTransport({
      ip: '127.0.0.1',
      port,
      httpFormat: 'delimited',
      httpPath: '/',
      httpTls: false,
    });
    try {
      await client.connect();
      await client.send(expected);
      assert.strictEqual(await run, EXIT_CODES.success);
      assert.strictEqual(fs.readFileSync(outFile, 'utf8'), `${expected}\n`);
    } finally {
      await client.disconnect();
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });

  await test('HTTP client captures one persistent SSE record', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('log');
    const expected = 'http,simulator-server,record';
    const server = createHttpServerTransport({
      ip: '127.0.0.1',
      port,
      httpFormat: 'delimited',
      httpPath: '/',
      httpTls: false,
    });
    await server.connect();
    const run = runHeadlessSession(baseOptions({
      protocol: 'http',
      mode: 'client',
      ip: '127.0.0.1',
      port,
      httpFormat: 'delimited',
      httpPath: '/',
      httpTls: false,
      outputFile: outFile,
      maxLogCount: 1,
      durationMs: 2000,
    }));
    try {
      await waitFor(() => server.hasRecipients(), 'HTTP client did not establish an SSE watch');
      assert.deepStrictEqual(await server.send(expected), { delivered: true, recipients: 1 });
      assert.strictEqual(await run, EXIT_CODES.success);
      assert.strictEqual(fs.readFileSync(outFile, 'utf8'), `${expected}\n`);
    } finally {
      await server.disconnect();
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });

  await test('WebSocket server captures one client frame', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('log');
    const expected = 'ws,logger-server,record';
    const run = runHeadlessSession(baseOptions({
      protocol: 'ws',
      mode: 'server',
      ip: '127.0.0.1',
      port,
      wsFormat: 'delimited',
      wsPath: '/',
      wsTls: false,
      wsSubscriptionMsg: null,
      wsIgnoreFirstMsg: false,
      outputFile: outFile,
      maxLogCount: 1,
      durationMs: 2000,
    }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const client = createWsClientTransport({
      ip: '127.0.0.1',
      port,
      wsFormat: 'delimited',
      wsPath: '/',
      wsTls: false,
    });
    try {
      await client.connect();
      await client.send(expected);
      assert.strictEqual(await run, EXIT_CODES.success);
      assert.strictEqual(fs.readFileSync(outFile, 'utf8'), `${expected}\n`);
    } finally {
      await Promise.resolve(client.disconnect());
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });

  await test('WebSocket client captures one server frame without skipping it', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('log');
    const expected = 'ws,simulator-server,record';
    const server = createWsServerTransport({
      ip: '127.0.0.1',
      port,
      wsFormat: 'delimited',
      wsPath: '/',
      wsTls: false,
    });
    await server.connect();
    const run = runHeadlessSession(baseOptions({
      protocol: 'ws',
      mode: 'client',
      ip: '127.0.0.1',
      port,
      wsFormat: 'delimited',
      wsPath: '/',
      wsTls: false,
      wsSubscriptionMsg: null,
      wsIgnoreFirstMsg: false,
      outputFile: outFile,
      maxLogCount: 1,
      durationMs: 2000,
    }));
    try {
      await waitFor(() => server.getClientCount() === 1, 'WebSocket client did not connect');
      server.send(expected);
      assert.strictEqual(await run, EXIT_CODES.success);
      assert.strictEqual(fs.readFileSync(outFile, 'utf8'), `${expected}\n`);
    } finally {
      await Promise.resolve(server.disconnect());
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });

  await test('durationMs stops the run when no lines arrive', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('log');
    const runPromise = runHeadlessSession(baseOptions({
      outputFile: outFile,
      port,
      durationMs: 300,
    }));
    const code = await runPromise;
    assert.strictEqual(code, EXIT_CODES.success);
    fs.unlinkSync(outFile);
  });

  await test('no outputFile → records are written to stdout, done payload notes stdout sink', async () => {
    const port = await pickFreePort();
    const doneFile = tmpFile('done.json');

    // Capture stdout writes during the session.
    const writes = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      return true; // swallow
    };

    let code;
    try {
      const runPromise = runHeadlessSession(baseOptions({
        outputFile: null,
        port,
        maxLogCount: 2,
        doneFile,
      }));
      await new Promise((res) => setTimeout(res, 100));
      await sendLines(port, ['hello', 'world', 'extra']);
      code = await runPromise;
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.strictEqual(code, EXIT_CODES.success);
    const captured = writes.join('');
    assert.ok(captured.includes('hello\n'));
    assert.ok(captured.includes('world\n'));

    const done = JSON.parse(fs.readFileSync(doneFile, 'utf8'));
    assert.strictEqual(done.success, true);
    assert.strictEqual(done.outputFile, null);
    assert.strictEqual(done.outputSink, 'stdout');
    assert.strictEqual(done.summary.linesWritten, 2);

    fs.unlinkSync(doneFile);
  });

  await test('a teardown failure after a completed capture still reports success', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('log');
    const doneFile = tmpFile('done.json');
    const expected = 'http,teardown,record';
    const warnings = [];
    const teardownLogger = {
      debug() {}, info() {}, error() {},
      warn(message) { warnings.push(message); },
    };
    // A peer that disappeared first makes teardown report a diagnostic. The
    // capture already collected its record, so the run must still succeed.
    const originalDisconnect = HttpServerTransport.prototype.disconnect;
    HttpServerTransport.prototype.disconnect = async function failingDisconnect() {
      await originalDisconnect.call(this);
      throw new Error('gRPC Stream failed: 14 UNAVAILABLE: Connection dropped');
    };
    try {
      const run = runHeadlessSession(baseOptions({
        protocol: 'http',
        mode: 'server',
        ip: '127.0.0.1',
        port,
        httpFormat: 'delimited',
        httpPath: '/',
        httpTls: false,
        outputFile: outFile,
        doneFile,
        maxLogCount: 1,
        durationMs: 4000,
      }), { logger: teardownLogger });
      await new Promise((resolve) => setTimeout(resolve, 80));
      const client = createHttpClientTransport({
        ip: '127.0.0.1', port, httpFormat: 'delimited', httpPath: '/', httpTls: false,
      });
      await client.connect();
      await client.send(expected);
      assert.strictEqual(await run, EXIT_CODES.success);
      await client.disconnect();

      assert.strictEqual(fs.readFileSync(outFile, 'utf8'), `${expected}\n`);
      const done = JSON.parse(fs.readFileSync(doneFile, 'utf8'));
      assert.strictEqual(done.success, true);
      assert.ok(
        warnings.some((message) => message.includes('[Transport] Teardown after the run reported')
          && message.includes('UNAVAILABLE')),
        `teardown diagnostic was not reported: ${JSON.stringify(warnings)}`
      );
    } finally {
      HttpServerTransport.prototype.disconnect = originalDisconnect;
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
      if (fs.existsSync(doneFile)) fs.unlinkSync(doneFile);
    }
  });

  await test('a gRPC connect that fails still tears down the channel it created', async () => {
    const port = await pickFreePort();
    const outFile = tmpFile('log');
    // Nothing is listening on this port, so waitForReady fails after the
    // channel already exists. The closer has to run anyway or the channel leaks.
    const originalCreate = grpcTransportModule.createGrpcClientTransport;
    let disconnectCalls = 0;
    grpcTransportModule.createGrpcClientTransport = (opts) => {
      const transport = originalCreate(opts);
      const originalTransportDisconnect = transport.disconnect.bind(transport);
      transport.disconnect = async () => {
        disconnectCalls += 1;
        return originalTransportDisconnect();
      };
      return transport;
    };
    try {
      const code = await runHeadlessSession(baseOptions({
        protocol: 'grpc',
        mode: 'client',
        ip: '127.0.0.1',
        port,
        grpcSerialization: 'protobuf',
        useTls: false,
        outputFile: outFile,
        maxLogCount: 1,
        durationMs: 2000,
        connectTimeoutMs: 1500,
      }));
      assert.strictEqual(code, EXIT_CODES.runtimeError);
      assert.strictEqual(disconnectCalls, 1, 'the failed gRPC client was never torn down');
    } finally {
      grpcTransportModule.createGrpcClientTransport = originalCreate;
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });

  fs.rmSync(scratchDir, { recursive: true, force: true });
  console.log(`\n${passed} passed`);
})();
