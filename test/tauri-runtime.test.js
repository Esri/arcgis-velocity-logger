'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { isAllowedChannel } = require('../src/tauri-policy');
const { encodeFrames, MAX_FRAME } = require('../src/tauri-wire');
const { JSDOM } = require('jsdom');

const entry = path.join(__dirname, '../src/tauri-backend.js');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-tauri-test-'));
const env = { ...process.env, HOME: temporary, APPDATA: temporary, XDG_CONFIG_HOME: temporary };
delete env.VELOCITY_TAURI_CLI;

function keyboardBridge() {
  const source = fs.readFileSync(path.join(__dirname, '../src/tauri-frontend.js'), 'utf8');
  for (const [file, keys] of [['', [
    { key: 'F1', blocked: true },
    { key: 'i', ctrlKey: true, blocked: true },
    { key: 'i', metaKey: true, shiftKey: true, blocked: false },
    { key: 'Escape', blocked: false },
  ]], ['about.html', [{ key: 'Escape', blocked: true }]]]) {
    const dom = new JSDOM('<body></body>', { url: `http://tauri.localhost/${file}`, runScripts: 'outside-only' });
    const received = [];
    dom.window.__TAURI_INTERNALS__ = { invoke: (_command, { message }) => {
      received.push(message);
      return Promise.resolve({ preventDefault: false });
    } };
    dom.window.eval(source);
    dom.window.__velocityDesktop.deliver('desktop-input-hook', [true]);
    for (const { blocked, ...options } of keys) {
      const event = new dom.window.KeyboardEvent('keydown', { ...options, cancelable: true, bubbles: true });
      dom.window.dispatchEvent(event);
      assert.equal(event.defaultPrevented, blocked, `${file}: ${options.key}`);
      assert.equal(received.at(-1).type, 'before-input');
      assert.equal(received.at(-1).input.key, options.key);
    }
    dom.window.close();
  }
}

async function headless() {
  const command = process.env.VELOCITY_TAURI_BINARY || process.execPath;
  const prefix = process.env.VELOCITY_TAURI_BINARY ? [] : [entry];
  const help = spawnSync(command, [...prefix, 'help=true', `logFile=${path.join(temporary, 'help.log')}`],
    { env: { ...env, VELOCITY_TAURI_CLI: '1' }, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /runMode/);
  const invalid = spawnSync(command, [...prefix, 'notAnOption=true', `logFile=${path.join(temporary, 'invalid.log')}`],
    { env: { ...env, VELOCITY_TAURI_CLI: '1' }, encoding: 'utf8' });
  assert.equal(invalid.status, require('../src/headless-runner').EXIT_CODES.configurationError, invalid.stderr);

  const output = path.join(temporary, 'capture.txt');
  const done = path.join(temporary, 'done.json');
  const server = net.createServer(socket => socket.end('first\nsecond\n'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    keyboardBridge();
    const child = spawn(command, [...prefix, 'runMode=headless', 'protocol=tcp', 'mode=client',
      'ip=127.0.0.1', `port=${server.address().port}`, 'maxLogCount=2', 'durationMs=3000',
      `outputFile=${output}`, `doneFile=${done}`, `logFile=${path.join(temporary, 'capture.log')}`],
    { env: { ...env, VELOCITY_TAURI_CLI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostic = '';
    child.stdout.on('data', data => { diagnostic += data; });
    child.stderr.on('data', data => { diagnostic += data; });
    const timer = setTimeout(() => child.kill(), 10000);
    const [code] = await once(child, 'exit');
    clearTimeout(timer);
    assert.equal(code, 0, diagnostic);
    assert.match(fs.readFileSync(output, 'utf8'), /first[\s\S]*second/);
    const result = JSON.parse(fs.readFileSync(done, 'utf8'));
    assert.equal(result.summary.stopReason, 'maxLogCount');
  } finally { server.close(); }
}

async function bridge() {
  const child = spawn(process.execPath, [entry, `logFile=${path.join(temporary, 'gui.log')}`],
    { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let diagnostics = '';
  child.stderr.on('data', data => { diagnostics += data; });
  const replies = new Map();
  const created = new Map();
  const menus = new Map();
  const operations = [];
  const waiters = new Map();
  let next = 0;
  const write = message => child.stdin.write(JSON.stringify(message) + '\n');
  const frontend = (label, message) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => reject(new Error(`IPC timed out: ${JSON.stringify(message)}\n${diagnostics}`)), 5000);
    replies.set(id, response => { clearTimeout(timer); resolve(response); });
    write({ type: 'frontend', id, label, message });
  });
  const waitForWindow = file => created.has(file) ? Promise.resolve(created.get(file))
    : new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No ${file} window\n${diagnostics}`)), 5000);
      waiters.set(file, window => { clearTimeout(timer); resolve(window); });
    });
  readline.createInterface({ input: child.stdout }).on('line', line => {
    const message = JSON.parse(line);
    if (message.type === 'response') { replies.get(message.id)?.(message); replies.delete(message.id); return; }
    if (message.type === 'native') {
      operations.push(message);
      if (message.op === 'menu') {
        const collect = items => {
          for (const item of items) {
            if (item.submenu) collect(item.submenu);
            else menus.set(item.label, item.id);
          }
        };
        collect(message.menu);
      }
      let value = null;
      if (message.op === 'eval') value = message.script.includes('JSON.stringify') ? '{}'
        : message.script.includes('stylesheet') ? './themes/theme-dark.css' : 'dark';
      write({ type: 'result', id: message.id, value });
      if (message.op === 'create') {
        created.set(message.file, message);
        waiters.get(message.file)?.(message);
        waiters.delete(message.file);
      }
    }
  });
  try {
    write({ type: 'init', dark: false, displays: [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }] });
    const splash = await waitForWindow('splash.html');
    await frontend(splash.label, { type: 'ready' });
    await frontend(splash.label, { type: 'send', channel: 'splash-ready', args: [] });
    const main = await waitForWindow('index.html');
    await frontend(main.label, { type: 'ready' });
    const version = await frontend(main.label, { type: 'invoke', channel: 'get-app-version', args: [] });
    assert.equal(version.value, require('../package.json').version);
    const forbidden = await frontend(splash.label, { type: 'send', channel: 'connect-tcp', args: [{}] });
    assert.match(forbidden.error, /not permitted/);
    const arbitrary = await frontend(main.label, { type: 'invoke', channel: 'shell:exec', args: ['touch nope'] });
    assert.match(arbitrary.error, /not permitted/);
    const invalidKind = await frontend(main.label, { type: 'native', op: 'open-external', url: 'https://example.com' });
    assert.match(invalidKind.error, /not permitted/);
    await frontend(main.label, { type: 'send', channel: 'protocol-settings:open', args: [{ title: 'Settings' }] });
    const settings = await waitForWindow('protocol-settings.html');
    const denied = await frontend(settings.label, { type: 'invoke', channel: 'save-logs', args: ['secret'] });
    assert.match(denied.error, /not permitted/);
    const ready = await frontend(settings.label, { type: 'send', channel: 'protocol-settings:window-ready', args: [] });
    assert.equal(ready.error, undefined);
    write({ type: 'window', event: 'focus', label: settings.label, focused: false, minimized: true });
    await frontend(main.label, { type: 'send', channel: 'protocol-settings:open', args: [{ title: 'Settings' }] });
    assert.ok(operations.some(operation => operation.op === 'restore' && operation.label === settings.label),
      'Reopening minimized Protocol Settings must restore the native window');
    for (const [label, file] of [['Show App Configuration', 'config.html'], ['Show Launch Configuration', 'launch-config.html'],
      ['Help', 'help.html'], ['Command Line Interface', 'cli.html']]) {
      assert.ok(menus.has(label), `Native menu is missing ${label}`);
      write({ type: 'menu', id: menus.get(label) });
      const window = await waitForWindow(file);
      const result = await frontend(window.label, { type: 'ready' });
      assert.equal(result.error, undefined);
    }
    await frontend(main.label, { type: 'send', channel: 'velocity:open-login', args: [] });
    const login = await waitForWindow('velocity-login.html');
    const wrongRole = await frontend(login.label, { type: 'send', channel: 'connect-tcp', args: [{}] });
    assert.match(wrongRole.error, /not permitted/);
  } finally {
    child.kill();
    await once(child, 'exit');
  }
}

(async () => {
  try {
    const large = { type: 'response', id: 1, value: 'Unicode \u{1f30e}'.repeat(2 * 1024 * 1024) };
    const frames = [...encodeFrames(large)];
    assert.ok(frames.length > 1);
    assert.ok(frames.every(frame => Buffer.byteLength(frame) < MAX_FRAME));
    const chunks = frames.map(frame => JSON.parse(frame));
    assert.equal(chunks.at(-1).last, true);
    assert.ok(chunks.slice(0, -1).every(chunk => chunk.last === false));
    assert.deepEqual(JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk.data, 'base64')))), large);
    assert.equal(isAllowedChannel('velocity-login.html', 'velocity:login'), true);
    assert.equal(isAllowedChannel('index.html', 'velocity:get-stored-credentials'), false);
    assert.equal(isAllowedChannel('help.html', 'connect-tcp'), false);
    assert.equal(isAllowedChannel('not-a-window.html', 'get-app-version'), false);
    const config = path.join(temporary, 'launch.json');
    fs.writeFileSync(config, JSON.stringify({ runMode: 'headless' }));
    const probe = spawnSync(process.execPath, [entry, '--tauri-probe', `config=${config}`], { env, encoding: 'utf8' });
    assert.equal(probe.stdout, 'cli');
    await headless();
    await bridge();
    console.log('Tauri backend CLI, capture lifecycle, and window-scoped IPC tests passed.');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
