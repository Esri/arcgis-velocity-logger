const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const presets = require('../src/connection-presets');

let passed = 0;
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

console.log('connection-presets.test.js');

// The cross-application contract shared with the ArcGIS Velocity Simulator.
const EXPECTED_PRESETS = [
  ['local-tcp-logger-server', 'Local TCP — Logger Server / Simulator Client', 'tcp-server'],
  ['local-tcp-simulator-server', 'Local TCP — Simulator Server / Logger Client', 'tcp-client'],
  ['local-udp-logger-server', 'Local UDP — Logger Server / Simulator Client', 'udp-server'],
  ['local-udp-simulator-server', 'Local UDP — Simulator Server / Logger Client', 'udp-client'],
  ['local-grpc-logger-server', 'Local gRPC — Logger Server / Simulator Client', 'grpc-server'],
  ['local-grpc-simulator-server', 'Local gRPC — Simulator Server / Logger Client', 'grpc-client'],
  ['local-http-logger-server', 'Local HTTP — Logger Server / Simulator Client', 'http-server'],
  ['local-http-simulator-server', 'Local HTTP — Simulator Server / Logger Client', 'http-client'],
  ['local-ws-logger-server', 'Local WebSocket — Logger Server / Simulator Client', 'ws-server'],
  ['local-ws-simulator-server', 'Local WebSocket — Simulator Server / Logger Client', 'ws-client'],
  ['local-xmpp-logger-server', 'Local XMPP — Logger Server / Simulator Client', 'xmpp-server'],
  ['local-xmpp-simulator-server', 'Local XMPP — Simulator Server / Logger Client', 'xmpp-client'],
];

const EXPECTED_PORTS = {
  tcp: 5565, udp: 5565, grpc: 5565, http: 8080, ws: 8080, xmpp: 5222,
};

test('exposes exactly the twelve shared preset ids and labels in order', () => {
  const listed = presets.listConnectionPresets();
  assert.strictEqual(listed.length, EXPECTED_PRESETS.length);
  listed.forEach((preset, index) => {
    assert.strictEqual(preset.id, EXPECTED_PRESETS[index][0]);
    assert.strictEqual(preset.label, EXPECTED_PRESETS[index][1]);
  });
  assert.strictEqual(presets.getConnectionPreset('not-a-preset'), null);
  assert.strictEqual(presets.getConnectionPreset(presets.CUSTOM_PRESET_ID), null);
  assert.strictEqual(presets.buildConnectionPresetValues(presets.CUSTOM_PRESET_ID), null);
});

test('groups presets by protocol for optgroup rendering', () => {
  const groups = presets.listConnectionPresetGroups();
  assert.deepStrictEqual(groups.map((group) => group.label), [
    'Local TCP', 'Local UDP', 'Local gRPC', 'Local HTTP', 'Local WebSocket', 'Local XMPP',
  ]);
  groups.forEach((group) => assert.strictEqual(group.presets.length, 2));
});

test('maps every Logger role, host, and port exactly', () => {
  EXPECTED_PRESETS.forEach(([id, , connectionType]) => {
    const values = presets.buildConnectionPresetValues(id);
    const protocol = presets.getConnectionPreset(id).protocol;
    assert.strictEqual(values.connectionType, connectionType, id);
    assert.strictEqual(values.host, '127.0.0.1', id);
    assert.strictEqual(values.port, EXPECTED_PORTS[protocol], id);
    const role = presets.getConnectionPreset(id).role;
    assert.strictEqual(
      connectionType.endsWith('-server'),
      role === 'logger-server',
      `${id} must select a Logger server type only for the Logger Server label`,
    );
  });
});

test('gRPC presets use text serialization, streaming, and TLS off', () => {
  ['local-grpc-logger-server', 'local-grpc-simulator-server'].forEach((id) => {
    const values = presets.buildConnectionPresetValues(id);
    assert.strictEqual(values.grpcSerialization, 'text');
    assert.strictEqual(values.grpcSendMethod, 'stream');
    assert.strictEqual(values.grpcTls, false);
    assert.strictEqual(values.grpcAllowUnverifiedTls, false);
  });
});

test('HTTP and WebSocket presets use delimited payloads on path / with TLS off', () => {
  ['local-http-logger-server', 'local-http-simulator-server'].forEach((id) => {
    const values = presets.buildConnectionPresetValues(id);
    assert.strictEqual(values.httpFormat, 'delimited');
    assert.strictEqual(values.httpPath, '/');
    assert.strictEqual(values.httpTls, false);
  });
  ['local-ws-logger-server', 'local-ws-simulator-server'].forEach((id) => {
    const values = presets.buildConnectionPresetValues(id);
    assert.strictEqual(values.wsFormat, 'delimited');
    assert.strictEqual(values.wsPath, '/');
    assert.strictEqual(values.wsTls, false);
    assert.strictEqual(values.wsSubscriptionMsg, '');
    assert.strictEqual(values.wsIgnoreFirstMsg, false);
  });
});

test('Logger HTTP client preset describes the persistent SSE receive contract', () => {
  const preset = presets.getConnectionPreset('local-http-simulator-server');
  assert.match(preset.summary, /persistent SSE watch/);
});

test('XMPP presets pair the Logger server and client accounts', () => {
  const server = presets.buildConnectionPresetValues('local-xmpp-logger-server');
  assert.strictEqual(server.xmppDomain, 'localhost');
  assert.strictEqual(server.xmppConversation, 'direct');
  assert.strictEqual(server.xmppTlsPolicy, 'required');
  assert.strictEqual(server.xmppExternalUsername, 'simulator');
  assert.strictEqual(server.xmppExternalPassword, '');
  assert.strictEqual(server.xmppAllowRemote, false);
  assert.strictEqual(server.xmppAllowUnverifiedTls, false);

  const client = presets.buildConnectionPresetValues('local-xmpp-simulator-server');
  assert.strictEqual(client.xmppDomain, 'localhost');
  assert.strictEqual(client.xmppConversation, 'direct');
  assert.strictEqual(client.xmppTlsPolicy, 'required');
  assert.strictEqual(client.xmppUsername, 'velocity-logger');
  assert.strictEqual(client.xmppPassword, '');
  assert.strictEqual(client.xmppResource, 'velocity-logger');
  assert.strictEqual(client.xmppLocalJid, 'velocity-logger@localhost');
  assert.strictEqual(client.xmppAllowUnverifiedTls, true);
});

test('every preset writes the full field set so optional fields reset deterministically', () => {
  const fieldNames = Object.keys(presets.CONNECTION_PRESET_FIELD_DEFAULTS);
  presets.listConnectionPresets().forEach((preset) => {
    const values = presets.buildConnectionPresetValues(preset.id);
    assert.deepStrictEqual(Object.keys(values).sort(), fieldNames.slice().sort(), preset.id);
  });
  // Switching from a configured XMPP preset to TCP clears the XMPP account.
  const tcp = presets.buildConnectionPresetValues('local-tcp-logger-server');
  assert.strictEqual(tcp.xmppUsername, '');
  assert.strictEqual(tcp.xmppLocalJid, '');
  assert.strictEqual(tcp.xmppAllowUnverifiedTls, false);
  assert.strictEqual(tcp.wsSubscriptionMsg, '');
});

test('every preset field maps to a control that exists in index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  Object.entries(presets.CONNECTION_PRESET_CONTROLS).forEach(([field, control]) => {
    assert.ok(html.includes(`id="${control.elementId}"`), `${field} -> #${control.elementId}`);
  });
});

test('describes the Custom, applied, and modified preset states', () => {
  const custom = presets.describeConnectionPreset(presets.CUSTOM_PRESET_ID);
  assert.match(custom, /Keeps the current connection fields/);
  assert.match(custom, /never connects, starts capture, or saves a secret/);
  const applied = presets.describeConnectionPreset('local-xmpp-logger-server');
  assert.match(applied, /Local XMPP — Logger Server \/ Simulator Client/);
  const modified = presets.describeConnectionPreset(presets.CUSTOM_PRESET_ID, {
    modified: true,
    baseId: 'local-tcp-logger-server',
  });
  assert.match(modified, /Custom \(modified\)/);
  assert.match(modified, /Local TCP — Logger Server \/ Simulator Client/);
});

// ---------------------------------------------------------------------------
// Renderer behavior
// ---------------------------------------------------------------------------

async function withRenderer(run) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '');
  const presetsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'connection-presets.js'), 'utf8');
  const summarySource = fs.readFileSync(path.join(__dirname, '..', 'src', 'connection-summary.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
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
  window.eval(renderer);
  await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
  try {
    await run({ window, document: window.document, listeners, sent });
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

(async () => {
  await uiTest('preset dropdown offers Custom plus the twelve shared presets', async ({ document }) => {
    const select = document.getElementById('connection-preset');
    assert.ok(select, 'connection-preset must exist next to connection-type');
    const values = [...select.querySelectorAll('option')].map((option) => option.value);
    assert.deepStrictEqual(values, ['custom', ...EXPECTED_PRESETS.map(([id]) => id)]);
    assert.strictEqual(select.value, 'custom');
    [...select.querySelectorAll('option')].forEach((option) => {
      assert.ok(option.title && option.title.length > 20, `option ${option.value} needs a descriptive title`);
    });
    assert.match(select.dataset.tooltip, /Keeps the current connection fields/);
    assert.ok(select.getAttribute('aria-label'));
  });

  await uiTest('applying every preset fills the mapped controls without connecting', async ({ document, window, sent }) => {
    const select = document.getElementById('connection-preset');
    for (const [id] of EXPECTED_PRESETS) {
      select.value = id;
      select.dispatchEvent(new window.Event('change'));
      const values = presets.buildConnectionPresetValues(id);
      Object.entries(values).forEach(([field, expected]) => {
        const control = presets.CONNECTION_PRESET_CONTROLS[field];
        const element = document.getElementById(control.elementId);
        assert.ok(element, `${control.elementId} must exist`);
        if (control.kind === 'checked') {
          assert.strictEqual(element.checked, expected, `${id}: ${field}`);
        } else {
          assert.strictEqual(element.value, String(expected), `${id}: ${field}`);
        }
      });
      assert.strictEqual(select.value, id, `${id} must remain selected after applying`);
      assert.strictEqual(document.getElementById('connection-preset-state').hidden, true);
    }
    assert.strictEqual(sent.filter(({ channel }) => channel.startsWith('connect-')).length, 0);
  });

  await uiTest('applying a preset shows the matching protocol settings and reports status', async ({ document, window }) => {
    const select = document.getElementById('connection-preset');
    const dialog = document.getElementById('protocol-settings-dialog');
    const groupsFor = (protocol) => [...dialog.querySelectorAll(`.protocol-settings-group[data-protocol="${protocol}"]`)];

    select.value = 'local-xmpp-logger-server';
    select.dispatchEvent(new window.Event('change'));
    // A preset only pre-fills: it must never pop the dialog open.
    assert.strictEqual(dialog.open, false, 'applying a preset must not open the dialog');
    assert.ok(groupsFor('xmpp').every((group) => group.hidden === false));
    assert.ok(groupsFor('http').every((group) => group.hidden === true));
    assert.match(document.getElementById('status').textContent, /Preset applied: Local XMPP — Logger Server/);
    assert.match(document.getElementById('status').dataset.tooltip, /Fields were pre-filled only/);
    assert.match(select.dataset.tooltip, /Local XMPP — Logger Server/);
    assert.match(document.getElementById('protocol-settings-title').textContent, /XMPP Server settings/);

    select.value = 'local-grpc-simulator-server';
    select.dispatchEvent(new window.Event('change'));
    assert.ok(groupsFor('grpc').every((group) => group.hidden === false));
    assert.ok(groupsFor('xmpp').every((group) => group.hidden === true));
    assert.strictEqual(dialog.open, false);
    // The client preset turns on the certificate bypass, so Security leads.
    select.value = 'local-xmpp-simulator-server';
    select.dispatchEvent(new window.Event('change'));
    assert.strictEqual(
      document.getElementById('protocol-settings-tab-security').getAttribute('aria-selected'),
      'true',
    );
  });

  await uiTest('editing a populated field switches the display to Custom (modified)', async ({ document, window }) => {
    const select = document.getElementById('connection-preset');
    select.value = 'local-tcp-logger-server';
    select.dispatchEvent(new window.Event('change'));
    assert.strictEqual(select.value, 'local-tcp-logger-server');

    const port = document.getElementById('port');
    port.value = '6000';
    port.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.strictEqual(select.value, 'custom');
    const state = document.getElementById('connection-preset-state');
    assert.strictEqual(state.hidden, false);
    assert.match(select.dataset.tooltip, /Custom \(modified\)/);
    assert.match(select.dataset.tooltip, /Local TCP — Logger Server/);
    assert.strictEqual(port.value, '6000', 'the edited value must be preserved');

    // Custom preserves the current values and clears the modified marker.
    select.value = 'custom';
    select.dispatchEvent(new window.Event('change'));
    assert.strictEqual(port.value, '6000');
    assert.strictEqual(state.hidden, true);
    assert.doesNotMatch(select.dataset.tooltip, /modified/);

    // Re-selecting the preset restores its values.
    select.value = 'local-tcp-logger-server';
    select.dispatchEvent(new window.Event('change'));
    assert.strictEqual(port.value, '5565');
  });

  await uiTest('progressive disclosure keeps advanced fields available in the dialog', async ({ document, window }) => {
    const dialog = document.getElementById('protocol-settings-dialog');
    ['grpc-advanced', 'http-advanced', 'ws-advanced', 'xmpp-advanced'].forEach((id) => {
      const group = document.getElementById(id);
      assert.ok(group, `${id} must exist`);
      assert.strictEqual(group.dataset.section, 'advanced', `${id} belongs to the Advanced section`);
      assert.ok(dialog.contains(group), `${id} must live inside the Protocol Settings dialog`);
    });
    // Advanced controls stay in the DOM and keep their ids.
    ['grpc-tls-ca-path', 'http-tls-key-path', 'ws-headers', 'xmpp-tls-ca-path', 'xmpp-connect-timeout']
      .forEach((id) => assert.ok(document.getElementById(id), `${id} must be preserved`));
    // Every section tab carries a tooltip and an accessible name.
    ['basics', 'security', 'advanced', 'summary'].forEach((section) => {
      const tab = document.getElementById(`protocol-settings-tab-${section}`);
      assert.strictEqual(tab.getAttribute('role'), 'tab');
      assert.ok(tab.dataset.tooltip, `${section} tab needs a tooltip`);
      assert.ok(tab.getAttribute('aria-label'), `${section} tab needs an aria-label`);
    });

    // A validation failure opens the dialog and focuses the offending control.
    const connectionType = document.getElementById('connection-type');
    connectionType.value = 'xmpp-client';
    connectionType.dispatchEvent(new window.Event('change'));
    document.getElementById('xmpp-username').value = '';
    document.getElementById('connect-btn').click();
    assert.strictEqual(document.activeElement.id, 'xmpp-username');
    assert.strictEqual(dialog.open, true);
    assert.strictEqual(document.getElementById('protocol-settings-tab-basics').getAttribute('aria-selected'), 'true');
  });

  await uiTest('validation selects the section that owns an invalid field', async ({ document, window, sent }) => {
    const connectionType = document.getElementById('connection-type');
    connectionType.value = 'xmpp-server';
    connectionType.dispatchEvent(new window.Event('change'));
    document.getElementById('xmpp-external-username').value = 'simulator';
    // A certificate without its key is invalid, and both live under Security.
    document.getElementById('xmpp-tls-cert-path').value = '/not-a-real-path/server.pem';

    const before = sent.filter(({ channel }) => channel === 'connect-xmpp').length;
    document.getElementById('connect-btn').click();
    assert.strictEqual(sent.filter(({ channel }) => channel === 'connect-xmpp').length, before);
    assert.strictEqual(document.getElementById('protocol-settings-dialog').open, true);
    assert.strictEqual(document.getElementById('protocol-settings-tab-security').getAttribute('aria-selected'), 'true');
    assert.strictEqual(document.activeElement.id, 'xmpp-tls-key-path');
    assert.strictEqual(document.getElementById('protocol-settings-alert').hidden, false);
    assert.strictEqual(document.getElementById('xmpp-tls-key-path').getAttribute('aria-invalid'), 'true');
    assert.strictEqual(
      document.getElementById('xmpp-tls-key-path').getAttribute('aria-describedby'),
      'protocol-settings-alert',
    );
  });

  await uiTest('an empty XMPP password still connects while a missing username does not', async ({ document, window, sent }) => {
    const select = document.getElementById('connection-preset');
    select.value = 'local-xmpp-simulator-server';
    select.dispatchEvent(new window.Event('change'));
    assert.strictEqual(document.getElementById('xmpp-password').value, '');
    document.getElementById('connect-btn').click();
    const connect = sent.filter(({ channel }) => channel === 'connect-xmpp').pop();
    assert.ok(connect, 'an empty password must not block the connection');
    assert.strictEqual(connect.payload.xmppPassword, '');
    assert.strictEqual(connect.payload.xmppUsername, 'velocity-logger');
    assert.strictEqual(connect.payload.xmppAllowUnverifiedTls, true);

    document.getElementById('xmpp-username').value = '';
    const before = sent.filter(({ channel }) => channel === 'connect-xmpp').length;
    document.getElementById('connect-btn').click();
    assert.strictEqual(sent.filter(({ channel }) => channel === 'connect-xmpp').length, before);
  });

  await uiTest('the XMPP server preset connects with an empty external password', async ({ document, window, sent }) => {
    const select = document.getElementById('connection-preset');
    select.value = 'local-xmpp-logger-server';
    select.dispatchEvent(new window.Event('change'));
    assert.strictEqual(document.getElementById('xmpp-external-password').value, '');
    document.getElementById('connect-btn').click();
    const connect = sent.filter(({ channel }) => channel === 'connect-xmpp').pop();
    assert.ok(connect);
    assert.strictEqual(connect.payload.xmppExternalPassword, '');
    assert.strictEqual(connect.payload.xmppExternalUsername, 'simulator');
    assert.strictEqual(connect.payload.type, 'server');
  });

  await uiTest('explicit unverified TLS controls appear for client modes only', async ({ document, window, sent }) => {
    const connectionType = document.getElementById('connection-type');
    const cases = [
      ['grpc', 'grpc-tls', 'grpc-allow-unverified-label', 'grpc-allow-unverified'],
      ['http', 'http-tls', 'http-allow-unverified-label', 'http-allow-unverified'],
      ['ws', 'ws-tls', 'ws-allow-unverified-label', 'ws-allow-unverified'],
    ];
    cases.forEach(([protocol, tlsId, labelId, checkboxId]) => {
      const label = document.getElementById(labelId);
      const checkbox = document.getElementById(checkboxId);
      assert.strictEqual(checkbox.checked, false, `${checkboxId} defaults to false`);
      assert.match(label.dataset.tooltip, /Warning/);
      assert.strictEqual(label.dataset.tooltipKind, 'warning');
      assert.ok(label.classList.contains('unverified-tls-check'));

      connectionType.value = `${protocol}-server`;
      connectionType.dispatchEvent(new window.Event('change'));
      assert.strictEqual(label.style.display, 'none', `${labelId} hidden in server mode`);

      connectionType.value = `${protocol}-client`;
      document.getElementById(tlsId).checked = true;
      connectionType.dispatchEvent(new window.Event('change'));
      assert.strictEqual(label.style.display, '', `${labelId} shown for a TLS client`);

      const tls = document.getElementById(tlsId);
      tls.checked = false;
      tls.dispatchEvent(new window.Event('change'));
      assert.strictEqual(label.style.display, 'none', `${labelId} hidden when TLS is off`);
    });

    // The flag is delivered to the transport for a TLS client connection.
    connectionType.value = 'grpc-client';
    document.getElementById('grpc-tls').checked = true;
    connectionType.dispatchEvent(new window.Event('change'));
    document.getElementById('grpc-allow-unverified').checked = true;
    document.getElementById('connect-btn').click();
    const grpc = sent.filter(({ channel }) => channel === 'connect-grpc').pop();
    assert.strictEqual(grpc.payload.allowUnverifiedTls, true);
  });

  await uiTest('CLI prepopulation fills fields without marking the preset modified', async ({ document, listeners }) => {
    listeners.get('cli-presets')({
      protocol: 'ws', mode: 'client', ip: '127.0.0.1', port: 8443,
      wsTls: true, wsAllowUnverifiedTls: true,
    });
    assert.strictEqual(document.getElementById('ws-allow-unverified').checked, true);
    assert.strictEqual(document.getElementById('connection-preset').value, 'custom');
    assert.strictEqual(document.getElementById('connection-preset-state').hidden, true);
  });

  console.log(`\n${passed} passed`);
})();
