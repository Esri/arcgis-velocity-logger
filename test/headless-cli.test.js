'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const entry = path.join(__dirname, '../src/headless-cli.js');
const packagedBinary = process.env.LOGGER_HEADLESS_BINARY;
const signalGroup = process.env.LOGGER_HEADLESS_SIGNAL_GROUP === '1' && process.platform !== 'win32';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-node-cli-'));
const children = new Set();
const sockets = new Set();

function start(args) {
  const env = { ...process.env, HOME: scratch, XDG_CONFIG_HOME: scratch };
  delete env.DISPLAY;
  delete env.WAYLAND_DISPLAY;
  const child = spawn(packagedBinary || process.execPath, [...(packagedBinary ? [] : [entry]), ...args],
    { cwd: scratch, env, detached: signalGroup });
  children.add(child);
  const result = { child, stdout: '', stderr: '', code: null };
  child.stdout.on('data', data => { result.stdout += data; });
  child.stderr.on('data', data => { result.stderr += data; });
  result.done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(child, 'SIGTERM'); reject(new Error(`CLI timed out: ${result.stderr}`)); }, 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      result.code = code;
      result.shellStatus = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : null);
      result.signal = signal;
      resolve(result);
    });
  });
  return result;
}

function stop(child, signal) {
  if (signalGroup) process.kill(-child.pid, signal);
  else child.kill(signal);
}

async function waitFor(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Timed out awaiting capture or completion');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function main() {
  const help = await start(['help=true']).done;
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /runMode/);
  const invalid = await start(['unknownOption=true']).done;
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /Unknown|unknown/);
  if (!packagedBinary) {
    const ui = await start([]).done;
    assert.equal(ui.code, 1);
    assert.match(ui.stderr, /application launcher/);
  }

  if (process.platform !== 'win32') {
    const occupied = net.createServer();
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    const doneFile = path.join(scratch, 'disconnected.json');
    try {
      const failedDone = path.join(scratch, 'bind-failed.json');
      const failed = await start(['runMode=headless', `port=${occupied.address().port}`, `doneFile=${failedDone}`]).done;
      assert.equal(failed.code, 2, failed.stderr);
      assert.equal(JSON.parse(fs.readFileSync(failedDone)).success, false);
      const idle = start(['runMode=headless', 'autoConnect=false', `port=${occupied.address().port}`, `doneFile=${doneFile}`]);
      await waitFor(() => idle.stderr.includes('receiver will not be started'));
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(idle.code, null, 'A disconnected capture must stay alive without binding its port');
      assert.equal(fs.existsSync(doneFile), false);
      stop(idle.child, 'SIGTERM');
      assert.equal((await idle.done).shellStatus, 143);
      const completion = JSON.parse(fs.readFileSync(doneFile));
      assert.equal(completion.summary.stopReason, 'SIGTERM');
      assert.equal(completion.summary.linesReceived, 0);
    } finally {
      await new Promise(resolve => occupied.close(resolve));
    }

    const disconnecting = net.createServer(socket => socket.end('last\n'));
    disconnecting.listen(0, '127.0.0.1');
    await once(disconnecting, 'listening');
    try {
      const doneFile = path.join(scratch, 'paused.json');
      const paused = start(['runMode=headless', 'protocol=tcp', 'mode=client', 'ip=127.0.0.1',
        `port=${disconnecting.address().port}`, 'onError=pause', 'exitOnComplete=false', `doneFile=${doneFile}`]);
      await waitFor(() => paused.stderr.includes('onError=pause: keeping process alive'));
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(paused.code, null, 'A paused capture must stay alive after its socket closes');
      assert.equal(fs.existsSync(doneFile), false);
      stop(paused.child, 'SIGTERM');
      assert.equal((await paused.done).shellStatus, 143);
      const completion = JSON.parse(fs.readFileSync(doneFile));
      assert.equal(completion.summary.stopReason, 'SIGTERM');
      assert.equal(completion.summary.linesWritten, 1);
    } finally {
      await new Promise(resolve => disconnecting.close(resolve));
    }
  }

  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('first\nsecond\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const done = path.join(scratch, 'completed.json');
    const config = path.join(scratch, 'launch.json');
    fs.writeFileSync(config, JSON.stringify({
      runMode: 'headless', protocol: 'tcp', mode: 'client', ip: '127.0.0.1', port: server.address().port,
      maxLogCount: 2, outputFormat: 'jsonl', doneFile: done,
    }));
    const capture = await start([`config=${config}`]).done;
    assert.equal(capture.code, 0, capture.stderr);
    assert.deepEqual(capture.stdout.trim().split('\n').map(line => JSON.parse(line).data.trim()), ['first', 'second']);
    assert.equal(JSON.parse(fs.readFileSync(done)).summary.stopReason, 'maxLogCount');
    const logs = path.join(scratch, ...(packagedBinary ? ['arcgis-velocity-logger'] : []), 'logs');
    assert.ok(fs.readdirSync(logs).some(file => file.endsWith('.log')));

    for (const signal of ['SIGINT', 'SIGTERM']) {
      if (process.platform === 'win32') continue;
      const output = path.join(scratch, `${signal}.txt`);
      const doneFile = path.join(scratch, `${signal}.json`);
      const running = start(['runMode=headless', 'protocol=tcp', 'mode=client', 'ip=127.0.0.1',
        `port=${server.address().port}`, `outputFile=${output}`, `doneFile=${doneFile}`, 'stdout=false']);
      await waitFor(() => fs.existsSync(output) && fs.readFileSync(output, 'utf8').includes('second'));
      stop(running.child, signal);
      const result = await running.done;
      assert.equal(result.shellStatus, signal === 'SIGINT' ? 130 : 143, result.stderr);
      if (packagedBinary) console.log(JSON.stringify({
        requestedSignal: signal, rawExitCode: result.code, terminatingSignal: result.signal, shellStatus: result.shellStatus,
      }));
      assert.equal(fs.readFileSync(output, 'utf8'), 'first\nsecond\n');
      assert.equal(JSON.parse(fs.readFileSync(doneFile)).summary.stopReason, signal);
    }

    if (process.platform !== 'win32') {
      const doneFile = path.join(scratch, 'keep-alive.json');
      const running = start([`config=${config}`, 'exitOnComplete=false', `doneFile=${doneFile}`]);
      await waitFor(() => fs.existsSync(doneFile));
      assert.equal(running.code, null);
      stop(running.child, 'SIGTERM');
      assert.equal((await running.done).shellStatus, 143);
    }
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
  console.log('Node-only CLI help, errors, Launch Config, capture, stdout and signal shutdown tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const child of children) stop(child, 'SIGTERM');
  fs.rmSync(scratch, { recursive: true, force: true });
});
