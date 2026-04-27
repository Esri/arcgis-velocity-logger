/**
 * Tests for src/headless-runner.js covering real TCP server capture end-to-end.
 *
 * Uses a short-lived TCP client to push lines into a headless server and asserts the
 * resulting outputFile content, doneFile payload, and exit code signals. No Electron `app`
 * is provided; the runner returns the exit code instead.
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const { runHeadlessSession, EXIT_CODES } = require('../src/headless-runner.js');
const { DEFAULT_HEADLESS_OPTIONS } = require('../src/cli-options.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.stack || err.message}`); process.exitCode = 1; }
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `logger-runner-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
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

  console.log(`\n${passed} passed`);
})();

