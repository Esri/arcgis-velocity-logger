const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
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
const output = (overrides = {}) => {
  const item = {
    serverId: 'north', serverName: 'North server', outputId: 'out', analyticId: 'a', analyticKind: 'realtime',
    analyticName: 'Roads', label: 'Events', outputType: 'stream-lyr-new', format: 'json',
    supported: true, detailRequired: false, url: 'wss://stream.example.com/subscribe', ...overrides,
  };
  const id = JSON.stringify([item.serverId, item.analyticKind, item.analyticId, item.outputId]);
  return { ...item, id, key: id };
};
const catalogue = (items = [output()], errors = [], revision = 1) => ({ items, errors, revision });

async function fixture(t, overrides = {}) {
  const calls = [];
  const api = {
    getStoredCredentials: async () => ({ portalUrl, username: 'reader', rememberMe: false }),
    getSessionState: async () => null,
    storeCredentials: async input => { calls.push(['store', plain(input)]); return { success: true }; },
    login: async input => { calls.push(['login', plain(input)]); return snapshot(input); },
    loginOAuth: async input => { calls.push(['oauth', plain(input)]); return snapshot(input); },
    listItems: async input => { calls.push(['list', plain(input)]); return catalogue([output()], [], input.revision); },
    getItemDetails: async input => { calls.push(['details', plain(input)]); return output(); },
    detectEndpoint: async () => snapshot({ detectedUrl: 'https://preview.example.com/velocity' }),
    applyEndpoint: async input => snapshot({ ...input, effectiveUrl: input.publicApiUrl }, 2),
    selectServer: async selectedServerId => snapshot({ selectedServerId }),
    applyItem: async input => { calls.push(['apply', plain(input)]); return { success: true }; },
    hideWindow: () => calls.push(['hide']),
    ...overrides,
  };
  const dom = new JSDOM(source('velocity-login.html'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.velocityApi = api;
  dom.window.eval(source('tooltip-utils.js'));
  dom.window.eval(source('velocity-endpoint-ui.js'));
  dom.window.eval(source('velocity-login-renderer.js'));
  await tick();
  const element = id => dom.window.document.getElementById(id);
  const edit = (id, value, type = 'input') => {
    const control = element(id);
    if (control.type === 'radio') control.checked = value;
    else control.value = value;
    control.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  };
  const signIn = async () => {
    element('password').value = 'session-only-password';
    element('sign-in-btn').click();
    await tick();
  };
  const select = async id => { edit('item-select', id, 'change'); await tick(); };
  return { dom, api, calls, element, edit, signIn, select };
}

test('browsing and registry-only Apply carry revision, never cached token or connection properties', async t => {
  const { calls, element, signIn, select } = await fixture(t);
  await signIn();
  assert.deepEqual(calls.find(([name]) => name === 'list')[1], { adminScope: true, revision: 1, serverId: 'all' });
  assert.deepEqual(calls.find(([name]) => name === 'store')[1], {
    portalUrl, username: 'reader', rememberMe: false, endpointMode: 'automatic', publicApiUrl: '',
    serverId: 'north', selectedServerId: 'all',
  });
  assert.equal(element('password').value, '');
  await select(output().id);
  element('apply-btn').click();
  await tick();
  assert.deepEqual(calls.find(([name]) => name === 'apply')[1], { id: output().id, revision: 1 });
  assert.ok(calls.some(([name]) => name === 'hide'));
});

test('pending endpoint edits prevent item Apply, and another Portal prevents token-only Apply', async t => {
  const { element, edit, calls, signIn, select } = await fixture(t);
  await signIn();
  await select(output().id);
  assert.equal(element('apply-btn').disabled, false);
  edit('endpoint-custom', true, 'change');
  edit('public-api-url', 'https://custom.example.com/velocity');
  for (const id of ['apply-btn', 'refresh-btn', 'scope-my', 'scope-org']) assert.equal(element(id).disabled, true, id);
  element('detect-endpoint-btn').click();
  await tick();
  assert.equal(element('public-api-url').value, 'https://custom.example.com/velocity');
  assert.equal(element('effective-url').textContent, 'https://api.example.com/velocity');
  element('apply-endpoint-btn').click();
  await tick();
  assert.equal(calls.filter(([name]) => name === 'list').at(-1)[1].revision, 2);
  assert.equal(element('apply-btn').disabled, true);
  edit('portal-url', 'https://other.example.com/portal');
  assert.equal(element('endpoint-automatic').checked, true);
  assert.equal(element('public-api-url').value, '');
  assert.equal(element('use-token-btn').disabled, true);
  element('use-token-btn').click();
  assert.equal(calls.some(([name]) => name === 'apply'), false);
});

test('Portal-only authentication permits revision-qualified token Apply despite endpoint errors', async t => {
  const { element, calls, signIn } = await fixture(t, {
    login: async () => snapshot({ effectiveUrl: '', endpointError: 'Discovery unavailable.' }),
  });
  await signIn();
  assert.equal(element('use-token-btn').disabled, false);
  assert.equal(element('refresh-btn').disabled, true);
  element('use-token-btn').click();
  await tick();
  assert.deepEqual(calls.find(([name]) => name === 'apply')[1], { tokenOnly: true, revision: 1 });
});

test('composite output identities distinguish matching labels across analytics and servers', async t => {
  const first = output({ supported: false, detailRequired: true });
  const second = output({ serverId: 'south', serverName: 'South server', analyticKind: 'bigdata', detailRequired: true });
  const stale = deferred();
  const { api, element, calls, signIn, select } = await fixture(t, {
    listItems: async () => catalogue([first, second]),
    getItemDetails: () => stale.promise,
  });
  await signIn();
  const options = Array.from(element('item-select').options).slice(1);
  assert.deepEqual(options.map(option => option.value), [first.id, second.id]);
  assert.match(options[0].textContent, /North server/);
  assert.match(options[1].textContent, /South server/);
  await select(first.id);
  assert.equal(element('apply-btn').disabled, true);
  api.getItemDetails = async input => {
    calls.push(['details', plain(input)]);
    return { ...second, detailRequired: false, url: 'wss://stream.example.com/subscribe?token=not-visible' };
  };
  await select(second.id);
  stale.resolve({ ...first, supported: true, detailRequired: false });
  await tick();
  assert.equal(element('info-server').textContent, 'South server (south)');
  assert.equal(element('info-id').textContent, 'out');
  assert.equal(element('info-type').textContent, 'Stream Layer');
  assert.doesNotMatch(element('info-url').textContent, /not-visible/);
  assert.equal(element('apply-btn').disabled, false);
  assert.deepEqual(calls.find(([name]) => name === 'details')[1], { id: second.id, revision: 1 });
});

test('aggregate partial failures retain healthy items and source errors while inspecting details', async t => {
  const { element, signIn, select } = await fixture(t, {
    listItems: async () => catalogue([output()], [{ serverId: 'south', serverName: 'South server', message: 'Service unavailable.' }]),
  });
  await signIn();
  assert.equal(element('picker-section').classList.contains('hidden'), false);
  assert.equal(element('velocity-server-errors').classList.contains('hidden'), false);
  assert.match(element('velocity-server-errors').textContent, /South server: Service unavailable/);
  assert.equal(element('status-banner').classList.contains('warning'), true);
  await select(output().id);
  assert.equal(element('apply-btn').disabled, false);
  assert.match(element('velocity-server-errors').textContent, /South server/);
  element('status-banner-dismiss').click();
  assert.equal(element('item-select').options.length, 2);
});

test('all-source failures and malformed or stale envelopes never become empty-list success', async t => {
  const { api, element, signIn } = await fixture(t, {
    listItems: async () => catalogue([], [{ serverId: 'north', message: 'Access denied.' }]),
  });
  await signIn();
  assert.equal(element('status-banner').classList.contains('warning'), true);
  assert.match(element('velocity-server-errors').textContent, /Access denied/);
  for (const response of [[], { items: [], errors: [] }, catalogue([], [], 0), { items: [null], errors: [], revision: 1 }]) {
    api.listItems = async () => response;
    element('refresh-btn').click();
    await tick();
    assert.match(element('status-banner-text').textContent, /list response is invalid/);
    assert.equal(element('picker-section').classList.contains('hidden'), true);
  }
});

test('refresh invalidates details and older errors cannot overwrite a newer selection', async t => {
  const stale = deferred();
  const first = output({ detailRequired: true });
  const second = output({ analyticId: 'b', analyticName: 'New analytic', detailRequired: true });
  const { api, element, signIn, select } = await fixture(t, {
    listItems: async () => catalogue([first]),
    getItemDetails: () => stale.promise,
  });
  await signIn();
  await select(first.id);
  api.listItems = async () => catalogue([second]);
  api.getItemDetails = async () => ({ ...second, detailRequired: false });
  element('refresh-btn').click();
  await tick();
  await select(second.id);
  stale.resolve({ error: 'Older failure.' });
  await tick();
  assert.equal(element('info-analytic').textContent, 'New analytic');
  assert.equal(element('apply-btn').disabled, false);
  assert.doesNotMatch(element('status-banner-text').textContent, /Older failure/);
});

test('newer endpoint edits ignore stale list and detail responses', async t => {
  const list = deferred();
  const detail = deferred();
  const { api, element, edit, signIn, select } = await fixture(t, { listItems: () => list.promise });
  await signIn();
  edit('endpoint-custom', true, 'change');
  edit('public-api-url', 'https://custom.example.com/velocity');
  list.resolve(catalogue());
  await tick();
  assert.equal(element('picker-section').classList.contains('hidden'), true);
  api.listItems = async () => catalogue([output({ detailRequired: true })]);
  api.getItemDetails = () => detail.promise;
  await signIn();
  await select(output().id);
  edit('public-api-url', 'https://next.example.com/velocity');
  detail.resolve(output());
  await tick();
  assert.equal(element('apply-btn').disabled, true);
  assert.equal(element('info-panel').classList.contains('hidden'), true);
});

test('mismatched or malformed detail responses fail visibly and cannot enable Apply', async t => {
  const item = output({ detailRequired: true });
  const { api, element, signIn, select } = await fixture(t, { listItems: async () => catalogue([item]) });
  await signIn();
  for (const detail of [[], {}, { ...item, serverId: 'south', detailRequired: false }, { ...item, id: 'wrong', detailRequired: false }]) {
    api.getItemDetails = async () => detail;
    await select(item.id);
    assert.equal(element('apply-btn').disabled, true);
    assert.match(element('status-banner-text').textContent, /detail response is invalid/);
    assert.match(element('apply-btn').dataset.tooltip, /detail response is invalid/);
  }
});

test('unverified output types show explicit unavailable reasons; XMPP remains selectable', async t => {
  const items = ['grpc', 'websocket', 'kafka'].map(outputType => output({
    outputId: outputType, outputType, supported: false,
    unsupportedReason: `${outputType} has no verified Logger connection settings.`,
  }));
  const xmpp = output({ outputId: 'xmpp', outputType: 'xmpp', xmppLocalJid: 'receiver@example.com' });
  const { element, calls, signIn, select } = await fixture(t, { listItems: async () => catalogue([...items, xmpp]) });
  await signIn();
  assert.equal(element('item-select').options.length, 2);
  element('filter-all-btn').click();
  for (const item of items) {
    await select(item.id);
    assert.equal(element('apply-btn').disabled, true);
    assert.match(element('apply-btn').dataset.tooltip, /no verified Logger connection/);
    assert.equal(element('info-availability').textContent, item.unsupportedReason);
  }
  await select(xmpp.id);
  element('apply-btn').click();
  await tick();
  assert.deepEqual(calls.find(([name]) => name === 'apply')[1], { id: xmpp.id, revision: 1 });
});

test('pairable socket and HTTP outputs remain visible and selectable in the supported filter', async t => {
  const types = [
    ['tcp', 'TCP'], ['tcp-client', 'TCP Client'], ['tcp-server', 'TCP Server'],
    ['udp-client', 'UDP Client'], ['udp-server', 'UDP Server'], ['http', 'HTTP'],
  ];
  const items = types.map(([outputType]) => output({ outputId: outputType, outputType }));
  const { element, calls, signIn, select } = await fixture(t, { listItems: async () => catalogue(items) });
  await signIn();
  assert.match(element('status-banner-text').textContent, /6 supported of 6 outputs/);
  assert.equal(element('item-select').options.length, 7);
  for (const [index, [, label]] of types.entries()) {
    await select(items[index].id);
    assert.equal(element('info-type').textContent, label);
    assert.equal(element('info-availability').textContent, 'Supported connection settings');
    assert.equal(element('apply-btn').disabled, false);
    element('apply-btn').click();
    await tick();
    assert.deepEqual(calls.filter(([name]) => name === 'apply').at(-1)[1], { id: items[index].id, revision: 1 });
  }
});

test('Apply errors remain visible without closing; OAuth uses the shared Portal form', async t => {
  const { dom, element, calls, signIn, select } = await fixture(t, {
    applyItem: async () => ({ error: 'Disconnect before applying output settings.' }),
  });
  await signIn();
  await select(output().id);
  element('apply-btn').click();
  await tick();
  assert.match(element('status-banner-text').textContent, /Disconnect before applying/);
  assert.equal(calls.some(([name]) => name === 'hide'), false);
  dom.window.document.querySelector('[data-tab="oauth"]').click();
  element('client-id').value = 'application';
  element('client-secret').value = 'session-only-secret';
  element('sign-in-btn').click();
  await tick();
  assert.equal(calls.find(([name]) => name === 'oauth')[1].portalUrl, portalUrl);
  assert.equal(JSON.stringify(calls.filter(([name]) => name === 'store')).includes('session-only-secret'), false);
  for (const control of element('remember-me').closest('.velocity-login-dialog').querySelectorAll('button, input, select, label')) {
    assert.ok(control.dataset.tooltip || control.title, control.outerHTML);
    assert.ok(control.getAttribute('aria-label'), control.outerHTML);
  }
});

test('safe TLS diagnostics remain verbatim for sign-in, catalogue, details, and Apply failures', async t => {
  const message = 'TLS certificate verification failed (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Check the server certificate chain and trusted certificate authorities.';
  const { api, element, signIn, select } = await fixture(t, {
    login: async () => ({ error: message }),
  });
  await signIn();
  assert.equal(element('status-banner-text').textContent, message);
  api.login = async input => snapshot(input);
  api.listItems = async () => ({ error: message });
  await signIn();
  assert.equal(element('status-banner-text').textContent, message);
  api.listItems = async () => catalogue([output({ detailRequired: true })]);
  api.getItemDetails = async () => ({ error: message });
  element('refresh-btn').click();
  await tick();
  await select(output().id);
  assert.equal(element('status-banner-text').textContent, message);
  api.getItemDetails = async () => output();
  api.applyItem = async () => ({ error: message });
  await select(output().id);
  element('apply-btn').click();
  await tick();
  assert.equal(element('status-banner-text').textContent, message);
});

test('authentication preserves the entered Portal context without guessing a portal suffix', async t => {
  const { calls, element, edit, signIn } = await fixture(t);
  for (const value of ['https://portal.example.com/team/portal', 'https://portal.example.com/enterprise', 'https://portal.example.com']) {
    edit('portal-url', value);
    await signIn();
    assert.equal(calls.filter(([name]) => name === 'login').at(-1)[1].portalUrl, value);
    assert.equal(element('portal-url').value, value);
  }
});

test('source filter changes invalidate list and detail races despite an unchanged session revision', async t => {
  const north = snapshot().servers[0];
  const south = { ...north, id: 'south', label: 'South server', effectiveUrl: 'https://south.example.com/velocity' };
  const servers = [north, south];
  const northItem = output({ detailRequired: true });
  const southItem = output({ serverId: 'south', serverName: 'South server', detailRequired: true });
  const oldList = deferred();
  const oldDetails = deferred();
  const { api, calls, element, edit, signIn, select } = await fixture(t, {
    login: async () => snapshot({ servers, effectiveUrl: '' }),
    selectServer: async selectedServerId => snapshot({ servers, selectedServerId, effectiveUrl: '' }),
    listItems: async () => catalogue([northItem, southItem]),
  });
  await signIn();
  assert.equal(element('velocity-server-select').value, 'all');
  assert.equal(element('velocity-server-row').classList.contains('hidden'), false);
  assert.equal(element('apply-endpoint-btn').disabled, true);
  api.listItems = () => oldList.promise;
  element('refresh-btn').click();
  await tick();
  api.listItems = async input => {
    calls.push(['list', plain(input)]);
    return catalogue([input.serverId === 'south' ? southItem : northItem]);
  };
  edit('velocity-server-select', 'south', 'change');
  await tick();
  oldList.resolve(catalogue([northItem]));
  await tick();
  assert.deepEqual(calls.filter(([name]) => name === 'list').at(-1)[1], { adminScope: true, revision: 1, serverId: 'south' });
  assert.equal(element('item-select').options[1].value, southItem.id);
  api.getItemDetails = () => oldDetails.promise;
  await select(southItem.id);
  edit('velocity-server-select', 'north', 'change');
  await tick();
  api.getItemDetails = async () => ({ ...northItem, detailRequired: false });
  await select(northItem.id);
  oldDetails.resolve({ ...southItem, detailRequired: false });
  await tick();
  assert.equal(element('info-server').textContent, 'North server (north)');
  assert.equal(element('apply-btn').disabled, false);
  element('apply-btn').click();
  await tick();
  assert.deepEqual(calls.filter(([name]) => name === 'apply').at(-1)[1], { id: northItem.id, revision: 1 });
});

test('server dropdown tooltip follows the selected source with the shared tooltip utility loaded', async t => {
  const north = snapshot().servers[0];
  const servers = [north, { ...north, id: 'south', label: 'South server' }];
  const { element, edit, signIn } = await fixture(t, {
    login: async () => snapshot({ servers }),
    selectServer: async selectedServerId => snapshot({ servers, selectedServerId }),
  });
  await signIn();
  edit('velocity-server-select', 'south', 'change');
  await tick();
  assert.equal(element('velocity-server-select').dataset.tooltip, 'Browse resources from South server (south)');
});

test('source TLS errors are rendered as exact text beside healthy outputs, never interpreted as markup', async t => {
  const message = 'TLS certificate verification failed (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Verify the <intermediate> certificate chain.';
  const { element, signIn } = await fixture(t, {
    listItems: async () => catalogue([output()], [{ serverId: 'south', serverName: 'South server', message }]),
  });
  await signIn();
  assert.equal(element('velocity-server-errors').firstElementChild.textContent, `South server: ${message}`);
  assert.equal(element('velocity-server-errors').querySelector('intermediate'), null);
  assert.ok(element('status-banner-text').textContent.includes(message));
  assert.equal(element('status-banner').classList.contains('warning'), true);
  assert.equal(element('item-select').options.length, 2);
});

test('zero-supported catalogues report their actual total with an actionable All filter hint', async t => {
  const items = ['http', 'grpc', 'websocket', 'tcp'].map(outputType => output({
    outputId: outputType, outputType, supported: false,
    unsupportedReason: 'This output is an outbound destination, not a subscription.',
  }));
  const { api, element, signIn } = await fixture(t, { listItems: async () => catalogue(items) });
  await signIn();
  const hint = '0 supported of 4 outputs. Choose All beside Supported to view unsupported outputs.';
  assert.equal(element('status-banner-text').textContent, hint);
  assert.equal(element('status-banner').classList.contains('info'), true);
  assert.equal(element('item-select').options.length, 1);
  element('filter-all-btn').click();
  assert.equal(element('item-select').options.length, 5);
  assert.equal(element('status-banner-text').textContent, '0 supported of 4 outputs.');
  element('filter-supported-btn').click();
  api.listItems = async () => catalogue(items, [{ serverId: 'south', serverName: 'South server', message: 'Service unavailable.' }]);
  element('refresh-btn').click();
  await tick();
  assert.ok(element('status-banner-text').textContent.startsWith(hint));
  assert.match(element('status-banner-text').textContent, /South server: Service unavailable/);
  assert.equal(element('status-banner').classList.contains('warning'), true);
  assert.equal(element('velocity-server-errors').children.length, 1);
});
