/**
 * Protocol Settings dialog and connection summary UI tests
 * Run with: node test/protocol-settings-dialog.test.js
 *
 * Exercises the renderer against `src/index.html`: dialog nesting, preserved
 * control ids, tab semantics and keyboard navigation, the live-edit model with
 * Revert and Reset, presets applied while the dialog is closed, validation
 * focus, connected read-only locking, secret redaction, and the three summary
 * surfaces.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let passed = 0;

const SOURCE_DIR = path.join(__dirname, '..', 'src');
const indexHtml = fs.readFileSync(path.join(SOURCE_DIR, 'index.html'), 'utf8');
const rendererSource = fs.readFileSync(path.join(SOURCE_DIR, 'renderer.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(SOURCE_DIR, 'style.css'), 'utf8');
const presetsSource = fs.readFileSync(path.join(SOURCE_DIR, 'connection-presets.js'), 'utf8');
const summarySource = fs.readFileSync(path.join(SOURCE_DIR, 'connection-summary.js'), 'utf8');

async function withRenderer(run) {
  const html = indexHtml.replace(/<script[\s\S]*?<\/script>/g, '');
  const listeners = new Map();
  const sent = [];
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  window.electronAPI = {
    on(channel, callback) { listeners.set(channel, callback); },
    send(channel, payload) { sent.push({ channel, payload }); },
    invoke: async () => ({ success: true }),
    openVelocityLogin() {},
  };
  window.VelocityAuthUtils = {
    shouldSendVelocityTokenByDefault: () => false,
    describeVelocityAuthType: (value) => value || 'not specified',
  };
  window.eval(presetsSource);
  window.eval(summarySource);
  window.eval(rendererSource);
  await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const helpers = {
    window,
    document: window.document,
    listeners,
    sent,
    select(id, value) {
      const element = window.document.getElementById(id);
      element.value = value;
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
      return element;
    },
    check(id, value) {
      const element = window.document.getElementById(id);
      element.checked = value;
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
      return element;
    },
    type(id, value) {
      const element = window.document.getElementById(id);
      element.value = value;
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
      return element;
    },
    key(target, key, init = {}) {
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    },
    rows(containerId) {
      return [...window.document.querySelectorAll(`#${containerId} .connection-summary-row`)]
        .map((row) => ({ key: row.dataset.rowKey, value: row.querySelector('dd').textContent, kind: row.dataset.kind }));
    },
    tabState() {
      return [...window.document.querySelectorAll('#protocol-settings-tablist [role="tab"]')]
        .map((tab) => ({
          section: tab.dataset.section,
          hidden: tab.hidden,
          selected: tab.getAttribute('aria-selected') === 'true',
          tabIndex: tab.tabIndex,
        }));
    },
  };
  try {
    await run(helpers);
  } finally {
    window.close();
  }
}

async function uiTest(name, fn) {
  try {
    await withRenderer(fn);
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}\n    ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}\n    ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

console.log('protocol-settings-dialog.test.js');

// ---------------------------------------------------------------------------
// Source structure
// ---------------------------------------------------------------------------

test('the dialog is a native in-window dialog nested inside the connection controls', () => {
  const { document } = new JSDOM(indexHtml).window;
  const dialog = document.getElementById('protocol-settings-dialog');
  assert.ok(dialog, 'protocol-settings-dialog must exist');
  assert.strictEqual(dialog.tagName, 'DIALOG');
  assert.ok(document.querySelector('.connection-controls > #protocol-settings-dialog'),
    'the dialog must be a child of .connection-controls so delegated preset events still fire');
  assert.strictEqual(dialog.getAttribute('aria-labelledby'), 'protocol-settings-title');
  assert.doesNotMatch(rendererSource, /BrowserWindow/, 'the dialog must not be an Electron window');
});

test('every protocol-specific control lives in the dialog exactly once', () => {
  const { document } = new JSDOM(indexHtml).window;
  const dialog = document.getElementById('protocol-settings-dialog');
  const protocolControlIds = [
    'grpc-serialization', 'grpc-send-method', 'grpc-header-path-key', 'grpc-header-path',
    'grpc-tls', 'grpc-tls-ca-path', 'grpc-tls-cert-path', 'grpc-tls-key-path', 'grpc-allow-unverified',
    'http-format', 'http-tls', 'http-path', 'http-tls-ca-path', 'http-tls-cert-path', 'http-tls-key-path', 'http-allow-unverified',
    'ws-format', 'ws-tls', 'ws-path', 'ws-tls-ca-path', 'ws-tls-cert-path', 'ws-tls-key-path',
    'ws-allow-unverified', 'ws-subscription-msg', 'ws-ignore-first-msg', 'ws-headers',
    'xmpp-domain', 'xmpp-tls-policy', 'xmpp-conversation', 'xmpp-username', 'xmpp-password', 'xmpp-resource',
    'xmpp-local-jid', 'xmpp-external-username', 'xmpp-external-password', 'xmpp-room', 'xmpp-nickname',
    'xmpp-room-password', 'xmpp-tls-ca-path', 'xmpp-tls-cert-path', 'xmpp-tls-key-path',
    'xmpp-allow-unverified', 'xmpp-allow-remote', 'xmpp-connect-timeout', 'xmpp-reply-timeout',
    'xmpp-ping-interval', 'xmpp-reconnect-delay', 'xmpp-copy-password', 'xmpp-copy-settings',
  ];
  protocolControlIds.forEach((id) => {
    const matches = document.querySelectorAll(`#${id}`);
    assert.strictEqual(matches.length, 1, `${id} must appear exactly once`);
    assert.ok(dialog.contains(matches[0]), `${id} must live inside the dialog`);
  });

  // Shared controls stay inline, outside the dialog.
  ['connection-preset', 'connection-preset-state', 'connection-type', 'host', 'port', 'connect-btn', 'disconnect-btn',
    'save-logs-btn', 'clear-logs-btn', 'toggle-order-btn', 'toggle-autoscroll-btn', 'toggle-view-raw-btn']
    .forEach((id) => {
      const element = document.getElementById(id);
      assert.ok(element, `${id} must exist`);
      assert.ok(!dialog.contains(element), `${id} must stay inline`);
    });
});

test('the trigger button announces the dialog and carries a persistent chip', () => {
  const { document } = new JSDOM(indexHtml).window;
  const button = document.getElementById('protocol-settings-btn');
  assert.strictEqual(button.getAttribute('aria-haspopup'), 'dialog');
  assert.strictEqual(button.getAttribute('aria-controls'), 'protocol-settings-dialog');
  assert.strictEqual(button.getAttribute('aria-expanded'), 'false');
  assert.ok(button.getAttribute('aria-label'));
  assert.match(button.dataset.tooltip, /Cmd\/Ctrl\+Shift\+P/);
  const chip = document.getElementById('protocol-settings-count');
  assert.ok(chip && button.contains(chip), 'the configured-state chip belongs to the button');
});

test('the dialog uses tablist, tab, and tabpanel semantics with a roving tab stop', () => {
  const { document } = new JSDOM(indexHtml).window;
  const tablist = document.getElementById('protocol-settings-tablist');
  assert.strictEqual(tablist.getAttribute('role'), 'tablist');
  assert.ok(tablist.getAttribute('aria-label'));
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  assert.deepStrictEqual(tabs.map((tab) => tab.dataset.section), ['basics', 'security', 'advanced', 'summary']);
  tabs.forEach((tab) => {
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    assert.ok(panel, `${tab.id} must control a panel`);
    assert.strictEqual(panel.getAttribute('role'), 'tabpanel');
    assert.strictEqual(panel.getAttribute('aria-labelledby'), tab.id);
  });
  assert.strictEqual(tabs.filter((tab) => tab.getAttribute('tabindex') === '0').length, 1);
});

test('the validation banner is assertive and the read-only banner is polite', () => {
  const { document } = new JSDOM(indexHtml).window;
  const validation = document.getElementById('protocol-settings-alert');
  assert.strictEqual(validation.getAttribute('role'), 'alert');
  assert.strictEqual(validation.getAttribute('aria-live'), 'assertive');
  assert.strictEqual(validation.hidden, true);
  const readOnly = document.getElementById('protocol-settings-readonly');
  assert.strictEqual(readOnly.getAttribute('role'), 'status');
  assert.strictEqual(readOnly.textContent, 'Disconnect to change these settings');
});

test('the stylesheet keeps the dialog sticky, layered, and responsive', () => {
  assert.match(styleCss, /\.protocol-settings-dialog::backdrop/);
  // Hiding a group must beat any display modifier, whatever the source order.
  assert.match(styleCss, /\.protocol-settings-group\[hidden\][\s\S]{0,240}display:\s*none\s*!important/);
  assert.match(styleCss, /\.protocol-settings-header\s*\{[^}]*position:\s*sticky/);
  assert.match(styleCss, /\.protocol-settings-footer\s*\{[^}]*position:\s*sticky/);
  assert.match(styleCss, /@media \(max-width: 760px\)[\s\S]*\.protocol-settings-tablist\s*\{[\s\S]*flex-direction:\s*row/);
});

// ---------------------------------------------------------------------------
// Renderer behavior
// ---------------------------------------------------------------------------

(async () => {
  await uiTest('opening and closing keeps edits and returns focus to the trigger', async ({ document, select }) => {
    select('connection-type', 'http-server');
    const dialog = document.getElementById('protocol-settings-dialog');
    const button = document.getElementById('protocol-settings-btn');
    button.focus();
    button.click();
    assert.strictEqual(dialog.open, true);
    assert.strictEqual(button.getAttribute('aria-expanded'), 'true');
    assert.strictEqual(document.activeElement.id, 'http-format', 'focus moves into the first setting');

    select('http-format', 'json');
    document.getElementById('protocol-settings-done').click();
    assert.strictEqual(dialog.open, false);
    assert.strictEqual(button.getAttribute('aria-expanded'), 'false');
    assert.strictEqual(document.getElementById('http-format').value, 'json', 'Done keeps the edit');
    assert.strictEqual(document.activeElement.id, 'protocol-settings-btn', 'focus returns to the opener');
  });

  await uiTest('Escape closes the dialog and keeps the edits', async ({ document, select, key, window }) => {
    select('connection-type', 'ws-client');
    document.getElementById('protocol-settings-btn').click();
    select('ws-path', '/stream');
    key(document.getElementById('protocol-settings-dialog'), 'Escape');
    assert.strictEqual(document.getElementById('protocol-settings-dialog').open, false);
    assert.strictEqual(document.getElementById('ws-path').value, '/stream');
    assert.strictEqual(document.activeElement.id, 'protocol-settings-btn');
    assert.ok(window);
  });

  await uiTest('only the sections that hold something for the protocol are offered', async ({ select, tabState, document }) => {
    select('connection-type', 'tcp-server');
    assert.deepStrictEqual(
      tabState().filter((tab) => !tab.hidden).map((tab) => tab.section),
      ['summary'],
      'TCP has no protocol settings',
    );
    assert.strictEqual(document.getElementById('protocol-settings-empty').hidden, false);
    assert.match(document.getElementById('protocol-settings-empty').textContent, /^TCP has no protocol settings/);

    select('connection-type', 'http-server');
    assert.deepStrictEqual(
      tabState().filter((tab) => !tab.hidden).map((tab) => tab.section),
      ['basics', 'security', 'summary'],
      'HTTP has no Advanced settings',
    );
    assert.strictEqual(document.getElementById('protocol-settings-empty').hidden, true);

    select('connection-type', 'ws-client');
    assert.deepStrictEqual(
      tabState().filter((tab) => !tab.hidden).map((tab) => tab.section),
      ['basics', 'security', 'advanced', 'summary'],
    );

    select('connection-type', 'grpc-server');
    assert.deepStrictEqual(
      tabState().filter((tab) => !tab.hidden).map((tab) => tab.section),
      ['basics', 'security', 'summary'],
      'the gRPC endpoint header is client-only, so a server has no Advanced section',
    );
    select('connection-type', 'grpc-client');
    assert.ok(tabState().find((tab) => tab.section === 'advanced' && !tab.hidden));
  });

  await uiTest('arrow keys, Home, and End move the roving tab stop', async ({ document, select, key, tabState }) => {
    select('connection-type', 'ws-client');
    document.getElementById('protocol-settings-btn').click();
    const tablist = document.getElementById('protocol-settings-tablist');
    const selected = () => tabState().find((tab) => tab.selected).section;
    assert.strictEqual(selected(), 'basics');

    key(tablist, 'ArrowDown');
    assert.strictEqual(selected(), 'security');
    assert.strictEqual(document.activeElement.id, 'protocol-settings-tab-security');
    assert.strictEqual(document.getElementById('protocol-settings-panel-security').hidden, false);
    assert.strictEqual(document.getElementById('protocol-settings-panel-basics').hidden, true);

    key(tablist, 'ArrowRight');
    assert.strictEqual(selected(), 'advanced');
    key(tablist, 'ArrowLeft');
    assert.strictEqual(selected(), 'security');
    key(tablist, 'End');
    assert.strictEqual(selected(), 'summary');
    key(tablist, 'ArrowRight');
    assert.strictEqual(selected(), 'basics', 'the roving tab stop wraps');
    key(tablist, 'Home');
    assert.strictEqual(selected(), 'basics');

    // Exactly one tab is in the tab order at any time.
    assert.strictEqual(tabState().filter((tab) => tab.tabIndex === 0).length, 1);
    assert.ok(tabState().filter((tab) => !tab.selected).every((tab) => tab.tabIndex === -1));
  });

  await uiTest('clicking a tab selects its panel', async ({ document, select }) => {
    select('connection-type', 'xmpp-server');
    document.getElementById('protocol-settings-btn').click();
    document.getElementById('protocol-settings-tab-advanced').click();
    assert.strictEqual(document.getElementById('protocol-settings-panel-advanced').hidden, false);
    assert.strictEqual(document.getElementById('xmpp-advanced').hidden, false);
    assert.strictEqual(document.getElementById('protocol-settings-tab-advanced').getAttribute('aria-selected'), 'true');
  });

  await uiTest('Revert changes restores the values the dialog opened with', async ({ document, select, type }) => {
    select('connection-type', 'ws-server');
    const revert = document.getElementById('protocol-settings-revert');
    document.getElementById('protocol-settings-btn').click();
    assert.strictEqual(revert.disabled, true, 'nothing to revert on open');

    select('ws-format', 'json');
    type('ws-path', '/edited');
    document.getElementById('protocol-settings-tab-security').click();
    document.getElementById('protocol-settings-tab-advanced').click();
    type('ws-subscription-msg', 'subscribe');
    assert.strictEqual(revert.disabled, false);

    revert.click();
    assert.strictEqual(document.getElementById('ws-format').value, 'delimited');
    assert.strictEqual(document.getElementById('ws-path').value, '/');
    assert.strictEqual(document.getElementById('ws-subscription-msg').value, '');
    assert.strictEqual(revert.disabled, true);
    assert.strictEqual(document.getElementById('protocol-settings-dialog').open, true, 'Revert keeps the dialog open');
  });

  await uiTest('Reset to preset is offered only for a modified preset', async ({ document, select, type }) => {
    const reset = document.getElementById('protocol-settings-reset');
    assert.strictEqual(reset.disabled, true, 'Custom has no preset to reset to');

    select('connection-preset', 'local-http-logger-server');
    document.getElementById('protocol-settings-btn').click();
    assert.strictEqual(reset.disabled, true, 'an unedited preset needs no reset');

    select('http-format', 'xml');
    type('http-path', '/changed');
    assert.strictEqual(document.getElementById('connection-preset').value, 'custom');
    assert.strictEqual(document.getElementById('connection-preset-state').hidden, false);
    assert.strictEqual(reset.disabled, false);
    assert.match(reset.dataset.tooltip, /Local HTTP — Logger Server \/ Simulator Client/);

    reset.click();
    assert.strictEqual(document.getElementById('http-format').value, 'delimited');
    assert.strictEqual(document.getElementById('http-path').value, '/');
    assert.strictEqual(document.getElementById('connection-preset').value, 'local-http-logger-server');
    assert.strictEqual(document.getElementById('connection-preset-state').hidden, true);
    assert.strictEqual(reset.disabled, true);
  });

  await uiTest('a preset applied while the dialog is closed still fills and re-labels everything', async ({ document, select, sent }) => {
    const dialog = document.getElementById('protocol-settings-dialog');
    select('connection-preset', 'local-grpc-logger-server');
    assert.strictEqual(dialog.open, false, 'a preset never opens the dialog');
    assert.strictEqual(document.getElementById('grpc-serialization').value, 'text');
    assert.strictEqual(document.getElementById('grpc-tls').checked, false);
    assert.strictEqual(document.getElementById('connection-type').value, 'grpc-server');
    assert.match(document.getElementById('protocol-settings-title').textContent, /gRPC Server settings/);
    assert.match(document.getElementById('protocol-settings-count').textContent, /^gRPC · \d+ changed( · \d+ warnings?)?$/);
    assert.strictEqual(sent.filter(({ channel }) => channel.startsWith('connect-')).length, 0);

    document.getElementById('protocol-settings-btn').click();
    assert.strictEqual(dialog.open, true);
    assert.strictEqual(document.getElementById('grpc-serialization').value, 'text');
  });

  await uiTest('the chip counts protocol settings that differ from their defaults', async ({ document, select, check }) => {
    const chip = document.getElementById('protocol-settings-count');
    select('connection-type', 'tcp-client');
    assert.strictEqual(chip.textContent, 'TCP · no protocol settings');

    select('connection-type', 'http-client');
    assert.strictEqual(chip.textContent, 'HTTP · defaults');
    select('http-format', 'json');
    assert.strictEqual(chip.textContent, 'HTTP · 1 changed');
    // A warning is appended to the count, never substituted for it.
    check('http-tls', false);
    assert.strictEqual(chip.textContent, 'HTTP · 2 changed · 1 warning');
    assert.strictEqual(chip.dataset.warning, 'true', 'plaintext raises a warning on the chip');
  });

  await uiTest('the inline card shows three rows with warnings first and copies redacted text', async ({ document, select, check, rows, sent }) => {
    select('connection-type', 'http-server');
    assert.deepStrictEqual(rows('connection-summary-rows').map((row) => row.key), ['connection', 'endpoint', 'status']);
    assert.strictEqual(rows('connection-summary-rows')[1].value, 'https://127.0.0.1:8443/');

    select('connection-type', 'http-client');
    check('http-allow-unverified', true);
    const primary = rows('connection-summary-rows');
    assert.strictEqual(primary[0].key, 'unverifiedCertificate');
    assert.strictEqual(primary[0].kind, 'warning');
    assert.strictEqual(document.getElementById('connection-summary-card').dataset.warning, 'true');

    document.getElementById('connection-summary-copy').click();
    const copied = sent.filter(({ channel }) => channel === 'copy-to-clipboard').pop();
    assert.ok(copied, 'the summary is copied through the main process clipboard channel');
    assert.match(copied.payload, /ArcGIS Velocity Logger — connection summary/);
    assert.match(copied.payload, /Certificate verification: Off for every host/);
  });

  await uiTest('the summary never leaks a password, whatever the surface', async ({ document, select, type, rows, sent }) => {
    select('connection-type', 'xmpp-client');
    type('xmpp-username', 'velocity-logger');
    type('xmpp-password', 'do-not-print-me');
    document.getElementById('connection-summary-show-all').click();
    const summaryRows = rows('protocol-settings-summary-rows');
    const password = summaryRows.find((row) => row.key === 'xmppPassword');
    assert.strictEqual(password.value, 'Set (hidden)');
    document.getElementById('connection-summary-copy').click();
    const copied = sent.filter(({ channel }) => channel === 'copy-to-clipboard').pop();
    assert.doesNotMatch(copied.payload, /do-not-print-me/);
    assert.doesNotMatch(document.getElementById('protocol-settings-summary-rows').textContent, /do-not-print-me/);
  });

  await uiTest('Show all and the status-bar button open the read-only summary section', async ({ document, select }) => {
    select('connection-type', 'grpc-client');
    document.getElementById('connection-summary-show-all').click();
    assert.strictEqual(document.getElementById('protocol-settings-dialog').open, true);
    assert.strictEqual(document.getElementById('protocol-settings-tab-summary').getAttribute('aria-selected'), 'true');
    assert.strictEqual(document.getElementById('protocol-settings-panel-summary').hidden, false);
    document.getElementById('protocol-settings-done').click();

    const statusButton = document.getElementById('connection-summary-status-btn');
    assert.strictEqual(statusButton.getAttribute('aria-haspopup'), 'dialog');
    assert.match(statusButton.dataset.tooltip, /Select or press Enter to open/);
    assert.strictEqual(document.getElementById('connection-summary-status-label').textContent, 'gRPC Client · 127.0.0.1:5565');
    statusButton.click();
    assert.strictEqual(document.getElementById('protocol-settings-dialog').open, true);
    assert.strictEqual(document.getElementById('protocol-settings-tab-summary').getAttribute('aria-selected'), 'true');
  });

  await uiTest('keyboard shortcuts open Protocol Settings and the Connection Summary', async ({ document, key, window }) => {
    // JSDOM reports a non-Mac platform, so the primary modifier is Ctrl here.
    const dialog = document.getElementById('protocol-settings-dialog');
    key(document.body, 'P', { ctrlKey: true, shiftKey: true });
    assert.strictEqual(dialog.open, true);
    key(document.body, 'P', { ctrlKey: true, shiftKey: true });
    assert.strictEqual(dialog.open, false);

    key(document.body, 'I', { ctrlKey: true, shiftKey: true });
    assert.strictEqual(document.activeElement.id, 'connection-summary-card');

    // The shortcut still works while a connection field has focus.
    document.getElementById('host').focus();
    key(document.getElementById('host'), 'P', { ctrlKey: true, shiftKey: true });
    assert.strictEqual(dialog.open, true);
    key(document.getElementById('host'), 'I', { ctrlKey: true, shiftKey: true });
    assert.strictEqual(document.activeElement.id, 'protocol-settings-panel-summary');
    key(document.body, 'Escape');
    assert.strictEqual(dialog.open, false);

    // On macOS the same handler listens for Command instead of Control.
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
    key(document.body, 'P', { metaKey: true, shiftKey: true });
    assert.strictEqual(dialog.open, true);
    key(document.body, 'P', { ctrlKey: true, shiftKey: true });
    assert.strictEqual(dialog.open, true, 'Control is not the primary modifier on macOS');
  });

  await uiTest('a hidden connection row is revealed before the dialog opens', async ({ document, key }) => {
    document.getElementById('toggle-connection-line').click();
    assert.ok(document.querySelector('.connection-controls').classList.contains('hidden'));
    key(document.body, 'P', { ctrlKey: true, shiftKey: true });
    assert.ok(!document.querySelector('.connection-controls').classList.contains('hidden'));
    assert.strictEqual(document.getElementById('protocol-settings-dialog').open, true);
  });

  await uiTest('connecting locks every protocol control and shows the read-only banner', async ({ document, select, listeners }) => {
    select('connection-type', 'ws-server');
    listeners.get('tcp-connection-state')('connecting');
    const dialog = document.getElementById('protocol-settings-dialog');
    assert.strictEqual(dialog.dataset.readOnly, 'true');
    assert.strictEqual(document.getElementById('protocol-settings-readonly').hidden, false);
    assert.match(document.getElementById('protocol-settings-readonly').textContent, /Disconnect to change these settings/);
    ['ws-format', 'ws-path', 'ws-tls', 'ws-tls-ca-path', 'ws-headers', 'ws-allow-unverified', 'http-format', 'grpc-serialization', 'xmpp-domain']
      .forEach((id) => assert.strictEqual(document.getElementById(id).disabled, true, `${id} must be locked`));
    ['connection-type', 'host', 'port', 'connection-preset']
      .forEach((id) => assert.strictEqual(document.getElementById(id).disabled, true, `${id} must be locked`));
    assert.strictEqual(document.getElementById('protocol-settings-revert').disabled, true);
    assert.strictEqual(document.getElementById('protocol-settings-reset').disabled, true);

    listeners.get('tcp-connection-state')('disconnected');
    assert.strictEqual(dialog.dataset.readOnly, 'false');
    assert.strictEqual(document.getElementById('protocol-settings-readonly').hidden, true);
    ['ws-format', 'ws-path', 'ws-tls', 'ws-headers', 'connection-type', 'host', 'port']
      .forEach((id) => assert.strictEqual(document.getElementById(id).disabled, false, `${id} must unlock`));
  });

  await uiTest('a connected dialog opens in read-only summary mode', async ({ document, select, listeners, rows }) => {
    select('connection-type', 'http-server');
    listeners.get('tcp-connection-state')('connected');
    document.getElementById('protocol-settings-btn').click();
    assert.strictEqual(document.getElementById('protocol-settings-dialog').dataset.mode, 'summary');
    assert.strictEqual(document.getElementById('protocol-settings-tab-summary').getAttribute('aria-selected'), 'true');
    ['basics', 'security', 'advanced'].forEach((section) => {
      assert.strictEqual(document.getElementById(`protocol-settings-tab-${section}`).hidden, true);
    });
    assert.match(document.getElementById('protocol-settings-readonly').textContent, /Connected\. Disconnect to change these settings\./);
    const status = rows('protocol-settings-summary-rows').find((row) => row.key === 'status');
    assert.strictEqual(status.value, 'Connected');
  });

  await uiTest('a connected XMPP server keeps Copy Client Settings available', async ({ document, select, listeners }) => {
    const copyButton = document.getElementById('xmpp-copy-settings');
    const includePassword = document.getElementById('xmpp-copy-password');
    select('connection-type', 'xmpp-server');
    assert.strictEqual(copyButton.disabled, true);
    assert.strictEqual(includePassword.disabled, true);

    listeners.get('tcp-connection-state')('connected');
    assert.strictEqual(copyButton.disabled, false, 'the copy action survives read-only locking');
    assert.strictEqual(includePassword.disabled, false);
    assert.strictEqual(document.getElementById('xmpp-domain').disabled, true);

    listeners.get('xmpp-server-settings')({ receivingJid: 'velocity-logger@localhost' });
    assert.match(document.getElementById('xmpp-receiving-jid').textContent, /velocity-logger@localhost/);
    const jidRow = [...document.querySelectorAll('#protocol-settings-summary-rows .connection-summary-row')]
      .find((row) => row.dataset.rowKey === 'xmppLocalJid');
    assert.strictEqual(jidRow.querySelector('dd').textContent, 'velocity-logger@localhost');

    listeners.get('tcp-connection-state')('disconnected');
    assert.strictEqual(copyButton.disabled, true);
    assert.strictEqual(includePassword.disabled, true);
  });

  await uiTest('a failed connect opens the dialog, selects the section, and describes the error', async ({ document, select, type, sent }) => {
    select('connection-type', 'ws-server');
    type('ws-tls-cert-path', '/not-a-real-path/server.pem');
    const before = sent.filter(({ channel }) => channel === 'connect-ws').length;
    document.getElementById('connect-btn').click();
    assert.strictEqual(sent.filter(({ channel }) => channel === 'connect-ws').length, before, 'the connection is refused');
    assert.strictEqual(document.getElementById('protocol-settings-dialog').open, true);
    assert.strictEqual(document.getElementById('protocol-settings-tab-security').getAttribute('aria-selected'), 'true');
    assert.strictEqual(document.activeElement.id, 'ws-tls-key-path');
    const banner = document.getElementById('protocol-settings-alert');
    assert.strictEqual(banner.hidden, false);
    assert.match(banner.textContent, /Certificate and Private key must be provided together for WebSocket TLS\./);
    assert.strictEqual(document.getElementById('ws-tls-key-path').getAttribute('aria-invalid'), 'true');
    assert.strictEqual(document.getElementById('ws-tls-key-path').getAttribute('aria-describedby'), 'protocol-settings-alert');
    assert.match(document.getElementById('status').textContent, /Connection validation error/);

    // Completing the pair clears the banner and lets the connection proceed.
    type('ws-tls-key-path', '/not-a-real-path/server.key');
    document.getElementById('connect-btn').click();
    assert.strictEqual(sent.filter(({ channel }) => channel === 'connect-ws').length, before + 1);
    assert.strictEqual(banner.hidden, true);
    assert.strictEqual(document.getElementById('ws-tls-key-path').getAttribute('aria-invalid'), 'false');
  });

  await uiTest('a certificate path left behind with TLS off does not block Connect', async ({ document, select, check, type, sent }) => {
    select('connection-type', 'http-client');
    type('http-tls-cert-path', '/not-a-real-path/client.pem');
    check('http-tls', false);
    const before = sent.filter(({ channel }) => channel === 'connect-http').length;
    document.getElementById('connect-btn').click();
    assert.strictEqual(
      sent.filter(({ channel }) => channel === 'connect-http').length,
      before + 1,
      'unused certificate paths must not block a plaintext connection',
    );
    assert.strictEqual(document.getElementById('protocol-settings-alert').hidden, true);
    assert.strictEqual(document.getElementById('protocol-settings-dialog').open, false);
  });

  await uiTest('the empty-settings note describes the protocol, not the lock state', async ({ document, select, listeners }) => {
    const note = document.getElementById('protocol-settings-empty');
    select('connection-type', 'ws-server');
    assert.strictEqual(note.hidden, true);
    listeners.get('tcp-connection-state')('connected');
    document.getElementById('protocol-settings-btn').click();
    assert.strictEqual(note.hidden, true, 'WebSocket has protocol settings even while connected');
    listeners.get('tcp-connection-state')('disconnected');

    select('connection-type', 'udp-server');
    assert.strictEqual(note.hidden, false);
    assert.match(note.textContent, /^UDP has no protocol settings/);
  });

  await uiTest('credential-bearing WebSocket fields never reach a summary surface', async ({ document, select, type, rows, sent }) => {
    select('connection-type', 'ws-client');
    type('ws-headers', '{"Authorization":"do-not-print-me"}');
    type('ws-subscription-msg', '{"token":"do-not-print-me"}');
    document.getElementById('connection-summary-show-all').click();
    const summaryRows = rows('protocol-settings-summary-rows');
    assert.strictEqual(summaryRows.find((row) => row.key === 'wsHeaders').value, 'Set (hidden)');
    assert.strictEqual(summaryRows.find((row) => row.key === 'wsSubscriptionMessage').value, 'Set (hidden)');
    document.getElementById('connection-summary-copy').click();
    const copied = sent.filter(({ channel }) => channel === 'copy-to-clipboard').pop();
    assert.doesNotMatch(copied.payload, /do-not-print-me/);
    assert.doesNotMatch(document.getElementById('protocol-settings-summary-rows').textContent, /do-not-print-me/);
  });

  await uiTest('the dialog heading and summary follow the protocol and mode', async ({ document, select, type }) => {
    const title = document.getElementById('protocol-settings-title');
    const subtitle = document.getElementById('protocol-settings-subtitle');
    select('connection-type', 'ws-client');
    type('host', 'example.com');
    type('port', '9443');
    assert.strictEqual(title.textContent, 'WebSocket Client settings');
    assert.strictEqual(subtitle.textContent, 'Receiving from wss://example.com:9443/');
    select('connection-type', 'udp-server');
    assert.strictEqual(title.textContent, 'UDP Server settings');
    assert.strictEqual(subtitle.textContent, 'Listening on example.com:9443');
  });

  console.log(`\n${passed} passed`);
})();
