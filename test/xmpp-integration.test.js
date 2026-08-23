const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseCommandLineArgs, formatExplainOutput } = require('../src/cli-options');
const { parseOutputItem } = require('../src/velocity-api');

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

console.log('xmpp-integration.test.js');

test('CLI resolves XMPP server defaults without changing app-wide transport default', () => {
  const normal = parseCommandLineArgs(['/node', '/app', 'runMode=headless']);
  assert.strictEqual(normal.headless.protocol, 'tcp');
  const xmpp = parseCommandLineArgs([
    '/node', '/app', 'runMode=headless', 'protocol=xmpp', 'mode=server',
    'xmppExternalPassword=hidden-value',
  ]);
  assert.strictEqual(xmpp.mode, 'headless');
  assert.strictEqual(xmpp.headless.xmppTlsPolicy, 'required');
  assert.strictEqual(xmpp.headless.xmppConversation, 'direct');
  assert.strictEqual(xmpp.headless.port, 5222);
  assert.strictEqual(xmpp.headless.xmppConnectTimeoutMs, 30000);
  assert.strictEqual(xmpp.headless.xmppReplyTimeoutMs, 15000);
  assert.strictEqual(xmpp.headless.xmppPingIntervalMs, 60000);
  assert.strictEqual(xmpp.headless.xmppReconnectDelayMs, 60000);
  assert.ok(!formatExplainOutput(xmpp).includes('hidden-value'));
});

test('CLI validates required XMPP fields and MUC settings', () => {
  const missing = parseCommandLineArgs([
    '/node', '/app', 'runMode=headless', 'protocol=xmpp', 'mode=client',
  ]);
  assert.strictEqual(missing.mode, 'error');
  assert.ok(missing.errors.some((error) => error.includes('xmppUsername')));
  const missingDomain = parseCommandLineArgs([
    '/node', '/app', 'runMode=headless', 'protocol=xmpp', 'mode=server', 'xmppDomain=',
  ]);
  assert.strictEqual(missingDomain.mode, 'error');
  assert.ok(missingDomain.errors.some((error) => error.includes('xmppDomain')));
  const muc = parseCommandLineArgs([
    '/node', '/app', 'runMode=headless', 'protocol=xmpp', 'mode=client',
    'xmppUsername=logger', 'xmppPassword=secret', 'xmppConversation=muc',
  ]);
  assert.strictEqual(muc.mode, 'error');
  assert.ok(muc.errors.some((error) => error.includes('xmppRoom')));
});

test('CLI and the account store accept a present-but-empty XMPP password', () => {
  const { createAccountStore, readExternalAccountFromEnv } = require('../src/xmpp-accounts');

  const client = parseCommandLineArgs([
    '/node', '/app', 'runMode=headless', 'protocol=xmpp', 'mode=client',
    'xmppUsername=velocity-logger', 'xmppPassword=',
  ]);
  assert.strictEqual(client.mode, 'headless');
  assert.strictEqual(client.headless.xmppPassword, '');

  const server = parseCommandLineArgs([
    '/node', '/app', 'runMode=headless', 'protocol=xmpp', 'mode=server',
    'xmppExternalUsername=simulator', 'xmppExternalPassword=',
  ]);
  assert.strictEqual(server.mode, 'headless');
  assert.strictEqual(server.headless.xmppExternalPassword, '');

  const store = createAccountStore({
    domain: 'localhost',
    externalAccount: { username: 'simulator', password: '' },
  });
  assert.strictEqual(store.verifyPassword('simulator', ''), true);
  assert.strictEqual(store.verifyPassword('simulator', 'wrong'), false);
  assert.strictEqual(store.getPassword('simulator'), '');
  assert.strictEqual(store.describe().external.password, '<empty>');

  // A missing password is still rejected; an empty one is not.
  assert.throws(
    () => createAccountStore({ domain: 'localhost', externalAccount: { username: 'simulator' } }),
    /password may be empty/,
  );

  // Environment account path: empty password accepted, missing username rejected.
  assert.deepStrictEqual(
    readExternalAccountFromEnv({ XMPP_EXTERNAL_USERNAME: 'simulator', XMPP_EXTERNAL_PASSWORD: '' }),
    { username: 'simulator', password: '' },
  );
  assert.strictEqual(readExternalAccountFromEnv({ XMPP_EXTERNAL_USERNAME: 'simulator' }), null);
  assert.strictEqual(readExternalAccountFromEnv({ XMPP_EXTERNAL_PASSWORD: '' }), null);
  const envStore = createAccountStore({
    domain: 'localhost',
    env: { XMPP_EXTERNAL_USERNAME: 'simulator', XMPP_EXTERNAL_PASSWORD: '' },
  });
  assert.strictEqual(envStore.verifyPassword('simulator', ''), true);
});

test('canonical XMPP launch config is portable without repository-specific aliases', () => {
  const configPath = path.join(os.tmpdir(), `logger-xmpp-config-${process.pid}.json`);
  fs.writeFileSync(configPath, JSON.stringify({
    runMode: 'headless',
    protocol: 'xmpp',
    mode: 'server',
    ip: '127.0.0.1',
    xmppDomain: 'localhost',
    xmppExternalUsername: 'velocity',
    xmppExternalPassword: ' exact ',
    xmppConversation: 'direct',
    xmppAllowUnverifiedTls: false,
    xmppConnectTimeoutMs: 30000,
    xmppReplyTimeoutMs: 15000,
    xmppPingIntervalMs: 60000,
    xmppReconnectDelayMs: 60000,
  }));
  try {
    const parsed = parseCommandLineArgs(['/node', '/app', `config=${configPath}`]);
    assert.strictEqual(parsed.mode, 'headless');
    assert.strictEqual(parsed.headless.port, 5222);
    assert.strictEqual(parsed.headless.xmppConversation, 'direct');
    assert.strictEqual(parsed.headless.xmppAllowUnverifiedTls, false);
    assert.strictEqual(parsed.headless.xmppExternalPassword, ' exact ');
  } finally {
    fs.unlinkSync(configPath);
  }
});

test('retired XMPP public option names are rejected', () => {
  for (const retired of [
    'xmppChatMode=direct',
    'xmppAllowLoopbackTlsBypass=true',
    'xmppHost=localhost',
  ]) {
    const parsed = parseCommandLineArgs(['/node', '/app', 'runMode=headless', retired]);
    assert.strictEqual(parsed.mode, 'error');
    assert.ok(parsed.errors.some((error) => error.includes('Unknown CLI parameter')));
  }
});

test('CLI preserves XMPP passwords exactly and rejects partial TLS paths', () => {
  const parsed = parseCommandLineArgs([
    '/node', '/app', 'runMode=headless', 'protocol=xmpp', 'mode=server',
    'xmppExternalUsername=velocity', 'xmppExternalPassword=  exact secret  ',
    'xmppRoomPassword= room secret ', 'xmppTlsCertPath=./cert.pem',
  ]);
  assert.strictEqual(parsed.mode, 'error');
  assert.strictEqual(parsed.headless.xmppExternalPassword, '  exact secret  ');
  assert.strictEqual(parsed.headless.xmppRoomPassword, ' room secret ');
  assert.ok(parsed.errors.some((error) => error.includes('xmppTlsCertPath')));
});

test('Velocity XMPP output mapping merges settings without recovering secrets', () => {
  const parsed = parseOutputItem({
    id: 'output-1',
    label: 'XMPP output',
    output: {
      name: 'xmpp',
      properties: {
        'xmpp.domain': 'example.com',
        'xmpp.host': 'xmpp.example.com',
        'xmpp.port': 5222,
        'xmpp.username': 'velocity',
        'xmpp.password': 'stored-secret',
        'xmpp.resource': 'output',
        'xmpp.connectionType': 'room',
        'xmpp.destination': 'events@conference.example.com',
        'xmpp.roomNickname': 'velocity',
        'xmpp.roomPassword': 'stored-room-secret',
        'xmpp.connectTimeoutSeconds': 31,
        'xmpp.replyTimeoutSeconds': 16,
        'xmpp.pingIntervalSeconds': 61,
      },
    },
  });

  assert.strictEqual(parsed.supported, true);
  assert.strictEqual(parsed.domain, 'example.com');
  assert.strictEqual(parsed.host, 'xmpp.example.com');
  assert.strictEqual(parsed.conversation, 'muc');
  assert.strictEqual(parsed.room, 'events@conference.example.com');
  assert.strictEqual(parsed.username, '');
  assert.strictEqual(parsed.connectTimeoutMs, 31000);
  assert.strictEqual(parsed.replyTimeoutMs, 16000);
  assert.strictEqual(parsed.pingIntervalMs, 61000);
  assert.strictEqual(parsed.password, undefined);
  assert.strictEqual(parsed.roomPassword, undefined);
  assert.strictEqual(parsed.tlsPolicy, 'required');
});

test('Velocity direct XMPP output derives a static receiving account', () => {
  const parsed = parseOutputItem({
    output: {
      name: 'xmpp',
      properties: {
        'xmpp.domain': 'sender.example.com',
        'xmpp.username': 'sender-account',
        'xmpp.destination': 'receiver@receive.example.com/device',
        'xmpp.connectionType': 'chat',
      },
    },
  });
  assert.strictEqual(parsed.conversation, 'direct');
  assert.strictEqual(parsed.username, 'receiver');
  assert.strictEqual(parsed.domain, 'receive.example.com');
  assert.strictEqual(parsed.localJid, 'receiver@receive.example.com');
});

test('Velocity XMPP output does not treat a dynamic destination as receiver credentials', () => {
  const parsed = parseOutputItem({
    output: {
      name: 'xmpp',
      properties: {
        'xmpp.domain': 'example.com',
        'xmpp.destination': '${recipient}',
        'xmpp.connectionType': 'chat',
      },
    },
  });
  assert.strictEqual(parsed.username, '');
  assert.strictEqual(parsed.localJid, '');
  assert.strictEqual(parsed.domain, 'example.com');
});

test('UI and help expose XMPP controls, accessibility, lifecycle and TLS', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
  const help = fs.readFileSync(path.join(__dirname, '..', 'src', 'help.html'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.ok(html.includes('value="xmpp-server"'));
  assert.ok(html.includes('value="xmpp-client"'));
  assert.ok(html.includes('data-tooltip='));
  assert.ok(html.includes('aria-label='));
  assert.ok(html.includes('id="xmpp-conversation"'));
  assert.ok(html.includes('id="xmpp-allow-unverified"'));
  assert.ok(html.includes('id="xmpp-reply-timeout"'));
  assert.ok(renderer.includes("'connect-xmpp'"));
  assert.ok(renderer.includes("'disconnect-xmpp'"));
  assert.ok(renderer.includes("'xmpp-status'"));
  assert.ok(renderer.includes("'xmpp-warning'"));
  assert.ok(renderer.includes('XMPP_TLS_POLICY_TOOLTIPS'));
  assert.ok(renderer.includes('XMPP_CONVERSATION_TOOLTIPS'));
  assert.ok(renderer.includes("xmppCopyPasswordCheckbox.checked = false"));
  assert.ok(renderer.includes("state === 'connected' && connectionTypeSelect.value === 'xmpp-server'"));
  assert.ok(renderer.includes("setStatus(message, { category: 'connection' })"));
  assert.ok(renderer.includes("'xmpp-copy-client-settings'"));
  assert.ok(preload.includes("'xmpp-copy-client-settings'"));
  assert.ok(preload.includes("'xmpp-status', 'xmpp-error', 'xmpp-warning', 'xmpp-server-settings'"));
  assert.ok(main.includes("ipcMain.handle('xmpp-copy-client-settings'"));
  assert.ok(main.includes('xmppTransport.getClientSettings'));
  assert.ok(main.includes("mainWindow.webContents.send('xmpp-warning'"));
  assert.ok(main.includes('if (xmppTransport)'));
  assert.ok(html.includes('id="xmpp-receiving-jid"'));
  assert.ok(html.includes('role="log"'));
  assert.ok(renderer.includes("accountPassword.value = ''"));
  assert.ok(renderer.includes("roomPassword.value = ''"));
  assert.ok(help.includes('XMPP'));
  assert.ok(help.includes('/Users/hano4470/Backup/data/faa.csv'));
  assert.ok(help.includes('xmppExternalUsername=simulator xmppExternalPassword='));
  assert.ok(help.includes('xmppUsername=simulator xmppPassword='));
  assert.ok(help.includes('xmppDestination=velocity-logger@localhost xmppAllowUnverifiedTls=true'));
  assert.ok(help.includes('Local XMPP — Logger Server / Simulator Client'));
  assert.ok(help.includes('a password may be present but empty'));
  assert.doesNotMatch(help, /loopback-only certificate bypass/);
});

console.log(`\n${passed} passed`);
