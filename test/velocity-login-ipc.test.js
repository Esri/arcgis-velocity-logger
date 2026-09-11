const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { registerVelocityLoginIpc } = require('../src/velocity-login-ipc');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-login-ipc-'));
  const credentialsFile = path.join(directory, 'preferences.json');
  const handlers = new Map();
  const sender = {};
  const events = [];
  const state = {
    authenticated: true, revision: 3, portalUrl: 'https://portal.example.com/portal', expires: 100,
    selectedServerId: 'all', servers: [{ id: 'first' }, { id: 'second' }],
  };
  let loginFailure = false;
  let pending = 0;
  const session = {
    state,
    login: async (input) => {
      events.push(['login', input]);
      if (loginFailure) throw new Error('Sign-in failed');
      return state;
    },
    detect: async () => state,
    setEndpoint: async (input) => { events.push(['endpoint', input]); return state; },
    selectServer: (serverId) => { state.selectedServerId = serverId; return state; },
  };
  try {
    registerVelocityLoginIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      session,
      outputs: {
        list: async (input) => {
          events.push(['list', input]);
          return { items: [{ id: 'composite' }], errors: [], revision: state.revision };
        },
        details: async (input) => { events.push(['detail', input]); return { id: input.id }; },
        apply: async (input) => {
          if (input.id !== 'composite') throw new Error('Select an output from the current list.');
          return { id: input.id, supported: true };
        },
      },
      credentialsFile,
      getLoginWindow: () => ({ webContents: sender }),
      onLoginStart: () => { pending++; },
      onLoginEnd: () => { pending--; },
      onApplied: (item) => events.push(['applied', item]),
      onState: () => events.push(['state']),
      log: (level, message) => events.push(['log', level, message]),
    });
    const call = (channel, input) => handlers.get(`velocity:${channel}`)({ sender }, input);
    const rejected = await handlers.get('velocity:login')({ sender: {} }, {});
    assert.match(rejected.error, /sign-in window/);
    const login = await call('login', {
      portalUrl: state.portalUrl, username: 'reader', password: 'not-persisted',
      endpointMode: 'custom', publicApiUrl: 'https://api.example.com/velocity',
    });
    assert.strictEqual(login.revision, 3);
    assert.strictEqual(login.token, undefined);
    assert.strictEqual(pending, 0);
    assert.strictEqual(events.find(([event]) => event === 'login')[1].authMode, 'password');
    const listed = await call('list-items', { revision: 3, adminScope: true, serverId: 'all' });
    assert.deepStrictEqual(events.find(([event]) => event === 'list')[1], { revision: 3, adminScope: true, serverId: 'all' });
    assert.deepStrictEqual(listed, { items: [{ id: 'composite' }], errors: [], revision: 3 });
    assert.match((await call('apply-endpoint', { serverId: 'all', endpointMode: 'automatic' })).error, /Select one Velocity server/);
    assert.strictEqual(events.filter(([event]) => event === 'endpoint').length, 0);
    assert.match((await call('apply-endpoint', { endpointMode: 'automatic' })).error, /Select one Velocity server/);
    assert.strictEqual((await call('select-server', { serverId: 'first' })).selectedServerId, 'first');
    assert.strictEqual(state.revision, 3);
    assert.strictEqual((await call('apply-endpoint', { serverId: 'first', endpointMode: 'automatic' })).revision, 3);
    const badApply = await call('apply-item', { id: 'fabricated', revision: 3 });
    assert.match(badApply.error, /current list/);
    assert.strictEqual(events.filter(([event]) => event === 'applied').length, 0);
    assert.strictEqual((await call('apply-item', { id: 'composite', revision: 3 })).success, true);
    await call('store-credentials', {
      portalUrl: state.portalUrl, username: 'reader', rememberMe: true,
      endpointMode: 'custom', publicApiUrl: 'https://api.example.com/velocity',
      serverId: 'first',
      password: 'not-persisted', token: 'not-persisted',
    });
    const saved = fs.readFileSync(credentialsFile, 'utf8');
    assert.ok(!saved.includes('not-persisted'));
    assert.strictEqual(JSON.parse(saved).endpointProfiles[state.portalUrl].serverProfiles.first.publicApiUrl, 'https://api.example.com/velocity');
    fs.writeFileSync(credentialsFile, '{invalid JSON');
    await call('store-credentials', { rememberMe: false });
    assert.strictEqual(fs.existsSync(credentialsFile), false);
    loginFailure = true;
    assert.match((await call('login', {})).error, /Sign-in failed/);
    assert.strictEqual(pending, 0);
    console.log('velocity-login-ipc tests passed');
  } finally {
    if (fs.existsSync(credentialsFile)) fs.unlinkSync(credentialsFile);
    fs.rmdirSync(directory);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
