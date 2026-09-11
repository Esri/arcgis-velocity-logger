const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('sign-in preload uses request-response IPC for endpoint validation and output application', async () => {
  const calls = [];
  let api;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/velocity-login-preload.js'), 'utf8'), {
    require: name => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, 'velocityApi'); api = value; } },
        ipcRenderer: {
          invoke: async (...args) => { calls.push(['invoke', ...args]); return { success: true }; },
          send: (...args) => { calls.push(['send', ...args]); },
        },
      };
    },
  });

  const endpoint = { endpointMode: 'custom', publicApiUrl: 'https://api.example.com/velocity', serverId: 'north' };
  await api.getSessionState();
  await api.detectEndpoint();
  await api.applyEndpoint(endpoint);
  await api.selectServer('north');
  await api.listItems({ adminScope: true, revision: 2, serverId: 'north' });
  await api.getItemDetails({ id: 'composite', revision: 2 });
  assert.equal((await api.applyItem({ id: 'composite', revision: 2 })).success, true);
  api.hideWindow();
  assert.deepEqual(structuredClone(calls), [
    ['invoke', 'velocity:get-session-state'],
    ['invoke', 'velocity:detect-endpoint', undefined],
    ['invoke', 'velocity:apply-endpoint', endpoint],
    ['invoke', 'velocity:select-server', { serverId: 'north' }],
    ['invoke', 'velocity:list-items', { adminScope: true, revision: 2, serverId: 'north' }],
    ['invoke', 'velocity:get-item-details', { id: 'composite', revision: 2 }],
    ['invoke', 'velocity:apply-item', { id: 'composite', revision: 2 }],
    ['send', 'velocity:hide-login'],
  ]);
});

test('sign-in theme subscription exposes only the theme and can unsubscribe', () => {
  let api;
  const listeners = new Map();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/velocity-login-preload.js'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
      ipcRenderer: {
        on: (channel, listener) => listeners.set(channel, listener),
        removeListener: (channel, listener) => {
          assert.equal(listeners.get(channel), listener);
          listeners.delete(channel);
        },
      },
    }),
  });
  const themes = [];
  const unsubscribe = api.onLoadSavedTheme((...values) => themes.push(values));
  listeners.get('load-saved-theme')({ sender: 'not-exposed' }, 'ocean');
  assert.deepEqual(themes, [['ocean']]);
  unsubscribe();
  assert.equal(listeners.size, 0);
});
