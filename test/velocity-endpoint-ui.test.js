const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { create, portalKey } = require('../src/velocity-endpoint-ui');

const html = fs.readFileSync(path.join(__dirname, '../src/velocity-login.html'), 'utf8');
const portalUrl = 'https://portal.example.com/portal';
const snapshot = (input = {}, revision = 1) => {
  const state = {
    authenticated: true, portalUrl, endpointMode: 'automatic', publicApiUrl: '',
    detectedUrl: 'https://api.example.com/velocity', effectiveUrl: 'https://api.example.com/velocity',
    profile: 'enterprise', expires: Date.now() + 3600000, revision, endpointError: '',
    selectedServerId: 'all', authRevision: 1, ...input,
  };
  state.servers = input.servers || [{
    id: 'north', label: 'North server', endpointMode: state.endpointMode, publicApiUrl: state.publicApiUrl,
    detectedUrl: state.detectedUrl, effectiveUrl: state.effectiveUrl, profile: state.profile,
    status: state.endpointError ? 'error' : 'ready', error: state.endpointError,
  }];
  return state;
};
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function fixture(t, overrides = {}) {
  const dom = new JSDOM(html);
  t.after(() => dom.window.close());
  const calls = [];
  const statuses = [];
  const api = {
    getStoredCredentials: async () => ({ portalUrl, username: 'reader', rememberMe: false }),
    getSessionState: async () => null,
    login: async input => snapshot(input),
    loginOAuth: async input => snapshot(input),
    storeCredentials: async input => { calls.push(['store', input]); },
    applyEndpoint: async input => {
      calls.push(['endpoint', input]);
      return snapshot({ ...input, effectiveUrl: input.publicApiUrl }, 2);
    },
    detectEndpoint: async () => snapshot({ detectedUrl: 'https://preview.example.com/velocity' }),
    selectServer: async selectedServerId => snapshot({ selectedServerId }),
    applyItem: async input => { calls.push(['apply', input]); return { success: true }; },
    hideWindow: () => calls.push(['hide']),
    ...overrides,
  };
  const element = id => dom.window.document.getElementById(id);
  const controller = create({
    document: dom.window.document, api,
    onLoadItems: async () => calls.push(['list']),
    setStatus: (...args) => statuses.push(args),
  });
  await controller.initialize();
  const edit = (id, value, event = 'input') => {
    const control = element(id);
    if (control.type === 'radio') control.checked = value;
    else control.value = value;
    control.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
  };
  const signIn = async () => { element('password').value = 'session-only'; await controller.signIn(); };
  return { controller, element, edit, signIn, calls, statuses, api };
}

test('shared controller exposes a frozen credential-free snapshot and canonical Portal keys', async t => {
  const { controller, signIn, calls } = await fixture(t, {
    login: async () => snapshot({ token: 'never-copy', password: 'never-copy' }),
  });
  await signIn();
  assert.equal(controller.canBrowse, true);
  assert.equal(Object.isFrozen(controller.session), true);
  assert.equal(controller.session.token, undefined);
  assert.equal(controller.session.password, undefined);
  assert.equal(portalKey(`${portalUrl}///`), portalUrl);
  assert.deepEqual(calls.find(([name]) => name === 'store')[1], {
    portalUrl, username: 'reader', rememberMe: false, endpointMode: 'automatic', publicApiUrl: '',
    serverId: 'north', selectedServerId: 'all',
  });
});

test('endpoint edits invalidate requests, detection previews, and Apply URL validates', async t => {
  const { controller, edit, signIn, element, calls } = await fixture(t);
  await signIn();
  const initialGeneration = controller.generation;
  edit('endpoint-custom', true, 'change');
  edit('public-api-url', 'https://custom.example.com/velocity');
  assert.equal(controller.pendingEndpoint, true);
  assert.equal(controller.canBrowse, false);
  assert.ok(controller.generation > initialGeneration);
  await controller.detect();
  assert.equal(element('public-api-url').value, 'https://custom.example.com/velocity');
  assert.equal(element('effective-url').textContent, 'https://api.example.com/velocity');
  assert.equal(element('detected-url').textContent, 'https://preview.example.com/velocity');
  await controller.applyEndpoint();
  assert.equal(controller.session.revision, 2);
  assert.equal(controller.pendingEndpoint, false);
  assert.equal(controller.canBrowse, true);
  assert.deepEqual(calls.find(([name]) => name === 'endpoint')[1], {
    serverId: 'north', endpointMode: 'custom', publicApiUrl: 'https://custom.example.com/velocity',
  });
});

test('Portal changes discard authentication and a different Portal never inherits an override', async t => {
  const { controller, edit, signIn, element } = await fixture(t);
  await signIn();
  edit('endpoint-custom', true, 'change');
  edit('public-api-url', 'https://custom.example.com/velocity');
  edit('portal-url', 'https://other.example.com/portal');
  assert.equal(controller.session, null);
  assert.equal(element('endpoint-automatic').checked, true);
  assert.equal(element('public-api-url').value, '');
  assert.equal(element('apply-endpoint-btn').disabled, true);
  assert.equal(element('use-token-btn').disabled, true);
});

test('Portal-only authentication allows token Apply despite an endpoint error', async t => {
  const { controller, signIn, element, calls } = await fixture(t, {
    login: async () => snapshot({ effectiveUrl: '', endpointError: 'No reachable source.' }),
  });
  await signIn();
  assert.equal(controller.canBrowse, false);
  assert.equal(element('use-token-btn').disabled, false);
  await controller.applyItem({ tokenOnly: true, revision: controller.session.revision });
  assert.deepEqual(calls.find(([name]) => name === 'apply')[1], { tokenOnly: true, revision: 1 });
  assert.ok(calls.some(([name]) => name === 'hide'));
});

test('newer edits ignore stale login and close invalidates a pending Apply acknowledgement', async t => {
  const login = deferred();
  const apply = deferred();
  const { controller, edit, element, api, calls } = await fixture(t, { login: () => login.promise });
  element('password').value = 'session-only';
  const pendingLogin = controller.signIn();
  edit('public-api-url', 'https://pending.example.com/velocity');
  login.resolve(snapshot());
  await pendingLogin;
  assert.equal(controller.session, null);
  api.login = async () => snapshot();
  await controller.signIn();
  api.applyItem = () => apply.promise;
  const pendingApply = controller.applyItem({ id: 'output', revision: 1 });
  controller.close();
  apply.resolve({ success: true });
  assert.equal(await pendingApply, false);
  assert.equal(calls.filter(([name]) => name === 'hide').length, 1);
});

test('authentication tabs share one Portal row and one endpoint section', async t => {
  const { element } = await fixture(t);
  const document = element('portal-url').ownerDocument;
  assert.equal(document.querySelectorAll('#portal-url').length, 1);
  assert.equal(document.querySelector('#oauth-portal-url'), null);
  assert.equal(document.querySelector('.auth-form #velocity-endpoint'), null);
  assert.equal(document.querySelectorAll('#velocity-endpoint').length, 1);
  for (const control of document.querySelectorAll('#velocity-endpoint input, #velocity-endpoint button, #velocity-endpoint summary')) {
    assert.ok(control.dataset.tooltip || control.title, control.outerHTML);
    assert.ok(control.getAttribute('aria-label'), control.outerHTML);
  }
});

test('multi-server scope defaults to All, disables aggregate overrides, and retains each endpoint', async t => {
  const north = snapshot().servers[0];
  const south = { ...north, id: 'south', label: 'South server', endpointMode: 'custom', publicApiUrl: 'https://south.example.com/team', effectiveUrl: 'https://south.example.com/team' };
  const servers = [north, south];
  const { controller, element, signIn, calls, api } = await fixture(t, {
    login: async () => snapshot({ servers }),
    selectServer: async selectedServerId => snapshot({ servers, selectedServerId }),
  });
  await signIn();
  assert.equal(controller.session.selectedServerId, 'all');
  assert.equal(controller.session.authRevision, 1);
  assert.equal(Object.isFrozen(controller.session.servers), true);
  assert.equal(Object.isFrozen(controller.session.servers[0]), true);
  assert.equal(element('velocity-server-row').classList.contains('hidden'), false);
  assert.equal(element('velocity-endpoint').open, true);
  assert.equal(element('velocity-server-select').options.length, 3);
  assert.equal(element('endpoint-custom').disabled, true);
  assert.equal(element('apply-endpoint-btn').disabled, true);
  assert.equal(element('detect-endpoint-btn').disabled, false);
  assert.equal(element('apply-endpoint-btn').dataset.tooltip, 'Select one Velocity server before applying a public API URL');
  await controller.applyEndpoint();
  assert.equal(calls.some(([name]) => name === 'endpoint'), false);
  assert.match(element('velocity-server-status').textContent, /https:\/\/south.example.com\/team/);
  const generation = controller.generation;
  await controller.selectServer('south');
  assert.equal(controller.session.revision, 1);
  assert.ok(controller.generation > generation);
  assert.equal(element('public-api-url').value, 'https://south.example.com/team');
  assert.equal(controller.selection().serverId, 'south');
  assert.deepEqual(calls.filter(([name]) => name === 'store').at(-1)[1], {
    portalUrl, username: 'reader', rememberMe: false, selectedServerId: 'south',
    serverId: 'south', endpointMode: 'custom', publicApiUrl: 'https://south.example.com/team',
  });
  api.detectEndpoint = async () => snapshot({ servers: servers.map(server => ({ ...server, detectedUrl: 'https://preview.example.com/velocity' })) });
  await controller.detect();
  assert.equal(controller.session.servers[1].effectiveUrl, 'https://south.example.com/team');
  assert.equal(element('public-api-url').value, 'https://south.example.com/team');
  await controller.selectServer('all');
  assert.equal(controller.selection().endpointMode, 'automatic');
  assert.equal(controller.selection().publicApiUrl, '');
  assert.equal(controller.session.servers[1].publicApiUrl, 'https://south.example.com/team');
});

test('nested Portal/source preferences restore independently and Remember me off is forwarded', async t => {
  const north = snapshot().servers[0];
  const south = { ...north, id: 'south', label: 'South server', endpointMode: 'custom', publicApiUrl: 'https://south.example.com/velocity', effectiveUrl: 'https://south.example.com/velocity' };
  const { controller, element, edit, signIn, calls } = await fixture(t, {
    getStoredCredentials: async () => ({
      portalUrl: `${portalUrl}/`, username: 'reader', rememberMe: true,
      endpointProfiles: {
        [portalUrl]: { selectedServerId: 'south', serverProfiles: { north: { endpointMode: 'automatic', publicApiUrl: '' }, south: { endpointMode: 'custom', publicApiUrl: south.publicApiUrl } } },
        'https://other.example.com/portal': { selectedServerId: 'east', serverProfiles: { east: { endpointMode: 'custom', publicApiUrl: 'https://east.example.com/api' } } },
      },
    }),
    login: async input => {
      calls.push(['login', input]);
      return snapshot({ servers: [north, south], selectedServerId: 'south' });
    },
    selectServer: async selectedServerId => snapshot({ servers: [north, south], selectedServerId }),
  });
  assert.equal(element('public-api-url').value, south.publicApiUrl);
  await signIn();
  assert.equal(calls.find(([name]) => name === 'login')[1].serverId, 'south');
  await controller.selectServer('north');
  assert.equal(element('public-api-url').value, '');
  await controller.selectServer('south');
  assert.equal(element('public-api-url').value, south.publicApiUrl);
  edit('portal-url', 'https://other.example.com/portal');
  assert.equal(element('public-api-url').value, 'https://east.example.com/api');
  edit('portal-url', portalUrl);
  assert.equal(element('public-api-url').value, south.publicApiUrl);
  element('remember-me').checked = false;
  const Event = element('remember-me').ownerDocument.defaultView.Event;
  element('remember-me').dispatchEvent(new Event('change'));
  await Promise.resolve();
  assert.equal(calls.filter(([name]) => name === 'store').at(-1)[1].rememberMe, false);
});

test('legacy Portal preferences with an empty server profile map restore the single-source editor', async t => {
  const publicApiUrl = 'https://api.example.com/custom-context';
  const { controller, element, signIn, calls } = await fixture(t, {
    getStoredCredentials: async () => ({
      portalUrl, username: 'reader', rememberMe: true,
      endpointProfiles: { [portalUrl]: { endpointMode: 'custom', publicApiUrl, serverProfiles: {} } },
    }),
    login: async () => snapshot({ endpointMode: 'custom', publicApiUrl, effectiveUrl: publicApiUrl }),
  });
  assert.equal(element('endpoint-custom').checked, true);
  assert.equal(element('public-api-url').value, publicApiUrl);
  await signIn();
  assert.equal(controller.session.servers.length, 1);
  assert.equal(element('velocity-server-row').classList.contains('hidden'), true);
  assert.equal(controller.selection().serverId, 'north');
  assert.deepEqual(calls.filter(([name]) => name === 'store').at(-1)[1], {
    portalUrl, username: 'reader', rememberMe: true, selectedServerId: 'all',
    serverId: 'north', endpointMode: 'custom', publicApiUrl,
  });
});
