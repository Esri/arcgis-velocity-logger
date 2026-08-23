const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '');
  const presetsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'connection-presets.js'), 'utf8');
  const summarySource = fs.readFileSync(path.join(__dirname, '..', 'src', 'connection-summary.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
  const listeners = new Map();
  const sent = [];
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.electronAPI = {
    on(channel, callback) {
      listeners.set(channel, callback);
    },
    send(channel, payload) {
      sent.push({ channel, payload });
    },
    invoke: async (channel) => channel === 'xmpp-copy-client-settings'
      ? { success: true, settings: {} }
      : { success: true },
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

  const connectionType = window.document.getElementById('connection-type');
  const dialog = window.document.getElementById('protocol-settings-dialog');
  const xmppGroups = [...dialog.querySelectorAll('.protocol-settings-group[data-protocol="xmpp"]')];
  const copyButton = window.document.getElementById('xmpp-copy-settings');
  const copyPassword = window.document.getElementById('xmpp-copy-password');
  const tlsPolicy = window.document.getElementById('xmpp-tls-policy');
  const conversation = window.document.getElementById('xmpp-conversation');

  connectionType.value = 'xmpp-server';
  connectionType.dispatchEvent(new window.Event('change'));
  assert.ok(xmppGroups.every((group) => group.hidden === false));
  assert.match(window.document.getElementById('protocol-settings-title').textContent, /XMPP Server settings/);
  assert.match(tlsPolicy.dataset.tooltip, /Require STARTTLS/);
  conversation.value = 'muc';
  conversation.dispatchEvent(new window.Event('change'));
  assert.match(conversation.dataset.tooltip, /Multi-User Chat room/);

  assert.strictEqual(copyButton.disabled, true);
  assert.strictEqual(copyPassword.disabled, true);
  listeners.get('tcp-connection-state')('connected');
  assert.strictEqual(copyButton.disabled, false);
  assert.strictEqual(copyPassword.disabled, false);
  copyPassword.checked = true;
  copyButton.click();
  await tick();
  assert.strictEqual(copyPassword.checked, false);

  listeners.get('xmpp-warning')('XMPP Server warning: oversized client stanza');
  assert.strictEqual(window.document.getElementById('app-status-text').textContent, 'Connected');
  assert.strictEqual(window.document.getElementById('disconnect-btn').disabled, false);
  listeners.get('xmpp-server-settings')({ receivingJid: 'velocity-logger@example.com' });
  assert.match(window.document.getElementById('xmpp-receiving-jid').textContent, /velocity-logger@example\.com/);

  listeners.get('tcp-connection-state')('connecting');
  assert.strictEqual(window.document.getElementById('disconnect-btn').disabled, false);
  listeners.get('tcp-connection-state')('connected');
  assert.strictEqual(window.document.getElementById('app-status-text').textContent, 'Connected');

  listeners.get('tcp-connection-state')('disconnected');
  tlsPolicy.value = 'preferred';
  tlsPolicy.dispatchEvent(new window.Event('change'));
  assert.strictEqual(window.document.getElementById('tls-badge').dataset.trust, 'opportunistic');
  assert.strictEqual(window.document.getElementById('tls-badge').dataset.tooltipKind, 'warning');

  listeners.get('velocity:output-applied')({
    outputType: 'xmpp',
    label: 'Direct output',
    host: 'xmpp.example.com',
    domain: 'example.com',
    username: 'receiver',
    localJid: 'receiver@example.com',
    conversation: 'direct',
    tlsPolicy: 'required',
  });
  assert.strictEqual(dialog.open, true);
  assert.strictEqual(window.document.activeElement.id, 'xmpp-password');
  assert.match(window.document.getElementById('logs').textContent, /credentials required before connecting/);
  assert.doesNotMatch(window.document.getElementById('logs').textContent, /XMPP output applied - ready to connect/);

  connectionType.value = 'xmpp-client';
  connectionType.dispatchEvent(new window.Event('change'));
  window.document.getElementById('xmpp-username').value = '';
  window.document.getElementById('xmpp-password').value = '';
  const sendsBeforeValidation = sent.filter(({ channel }) => channel === 'connect-xmpp').length;
  window.document.getElementById('connect-btn').click();
  assert.strictEqual(
    sent.filter(({ channel }) => channel === 'connect-xmpp').length,
    sendsBeforeValidation,
  );
  assert.strictEqual(window.document.getElementById('xmpp-username').getAttribute('aria-invalid'), 'true');
  assert.strictEqual(window.document.getElementById('protocol-settings-alert').hidden, false);

  listeners.get('xmpp-error')('XMPP Client error: authentication failed');
  assert.strictEqual(window.document.getElementById('app-status-text').textContent, 'Error');
  assert.strictEqual(copyButton.disabled, true);

  dom.window.close();
  console.log('xmpp-ui.test.js\n  ✓ XMPP renderer lifecycle, validation, copy state, and tooltips');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
