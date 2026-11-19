'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = source.indexOf("ipcMain.handle('xmpp-copy-client-settings'");
  const end = source.indexOf('\n});', start) + '\n});'.length;
  const handlers = new Map();
  const messages = [];
  let complete;
  const context = {
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    xmppTransport: { isConnected: () => true, getClientSettings: () => ({ host: '127.0.0.1' }) },
    currentConnectionDetails: { type: 'server' },
    clipboard: { writeText: () => new Promise(resolve => { complete = resolve; }) },
    velocityLog: (...message) => messages.push(message),
  };
  vm.runInNewContext(source.slice(start, end), context);
  const pending = handlers.get('xmpp-copy-client-settings')({});
  assert.equal(messages.length, 0, 'Copy success must wait for the native clipboard');
  complete();
  assert.equal((await pending).success, true);
  context.clipboard.writeText = async () => { throw new Error('Clipboard permission denied'); };
  const failed = await handlers.get('xmpp-copy-client-settings')({});
  assert.equal(failed.success, false);
  assert.equal(failed.error, 'Clipboard permission denied');
  assert.equal(messages.at(-1)[0], 'warn');
  console.log('Clipboard completion and failure reporting tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
