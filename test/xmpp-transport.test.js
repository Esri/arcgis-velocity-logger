const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { xml } = require('@xmpp/client');
const { XmppClientCore } = require('../src/xmpp-client-core');
const {
  createXmppClientTransport,
  createXmppServerTransport,
  normalizeBareJid,
  MAX_MESSAGE_BYTES,
} = require('../src/xmpp-transport');
const { XmppServerCore } = require('../src/xmpp-server-core');
const { createAccountStore } = require('../src/xmpp-accounts');
const { EXIT_CODES, runHeadlessSession } = require('../src/headless-runner');
const { DEFAULT_HEADLESS_OPTIONS } = require('../src/cli-options');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}\n    ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

function waitFor(predicate, timeout = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const value = predicate();
      if (value) return resolve(value);
      if (Date.now() - started >= timeout) return reject(new Error('Timed out waiting for condition'));
      setTimeout(poll, 20);
    };
    poll();
  });
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

(async () => {
  console.log('xmpp-transport.test.js');

  await test('normalizes bare JIDs and exposes bounded message size', async () => {
    assert.strictEqual(normalizeBareJid('User@Example.com/Resource'), 'user@example.com');
    assert.strictEqual(MAX_MESSAGE_BYTES, 65536);
  });

  await test('server receives direct message bodies over required STARTTLS', async () => {
    const received = [];
    const server = createXmppServerTransport({
      ip: '127.0.0.1',
      port: 0,
      xmppDomain: 'localhost',
      xmppTlsPolicy: 'required',
      xmppExternalUsername: 'velocity',
      xmppExternalPassword: 'direct-secret',
      onData: (body, metadata) => received.push({ body, metadata }),
    });

    await test('mixed-case configured domains accept canonical direct JIDs', async () => {
      const received = [];
      const server = createXmppServerTransport({
        ip: '127.0.0.1',
        port: 0,
        xmppDomain: 'LocalHost',
        xmppTlsPolicy: 'disabled',
        xmppExternalUsername: 'velocity',
        xmppExternalPassword: 'domain-secret',
        onData: (body) => received.push(body),
      });
      const started = await server.connect();
      const client = new XmppClientCore({
        service: `xmpp://127.0.0.1:${started.address.port}`,
        domain: 'LOCALHOST',
        username: 'velocity',
        password: 'domain-secret',
        startTlsPolicy: 'disabled',
      });
      try {
        await client.connect();
        await client.sendChat('velocity-logger@localhost', 'canonical-domain');
        await waitFor(() => received.length === 1);
        assert.deepStrictEqual(received, ['canonical-domain']);
      } finally {
        await client.close();
        await server.disconnect();
      }
    });
    const started = await server.connect();
    const client = new XmppClientCore({
      service: `xmpp://127.0.0.1:${started.address.port}`,
      domain: 'localhost',
      username: 'velocity',
      password: 'direct-secret',
      resource: 'sender',
      rejectUnauthorized: false,
    });
    try {
      await client.connect();
      assert.strictEqual(client.isSecure(), true);
      await client.sendChat('velocity-logger@localhost', '{"id":1}');
      await waitFor(() => received.length === 1);
      assert.strictEqual(received[0].body, '{"id":1}');
      assert.strictEqual(received[0].metadata.protocol, 'XMPP');
      assert.strictEqual(received[0].metadata.chatMode, 'direct');
      assert.ok(!JSON.stringify(received).includes('direct-secret'));
    } finally {
      await client.close();
      await server.disconnect();
    }
  });

  await test('server receives MUC bodies without self echoes', async () => {
    const received = [];
    const room = 'events@conference.localhost';
    const server = createXmppServerTransport({
      ip: '127.0.0.1',
      port: 0,
      xmppDomain: 'localhost',
      xmppTlsPolicy: 'required',
      xmppExternalUsername: 'velocity',
      xmppExternalPassword: 'muc-secret',
      xmppRoom: room,
      xmppConversation: 'muc',
      xmppRoomPassword: 'room-secret',
      xmppNickname: 'logger',
      onData: (body, metadata) => received.push({ body, metadata }),
    });
    const started = await server.connect();
    const client = new XmppClientCore({
      service: `xmpp://127.0.0.1:${started.address.port}`,
      domain: 'localhost',
      username: 'velocity',
      password: 'muc-secret',
      resource: 'sender',
      rejectUnauthorized: false,
    });
    try {
      await client.connect();
      await client.joinMuc(room, 'velocity-output', 'room-secret');
      await client.sendMuc(room, 'room-body');
      await waitFor(() => received.length === 1);
      assert.strictEqual(received[0].body, 'room-body');
      assert.strictEqual(received[0].metadata.chatMode, 'muc');
      assert.strictEqual(received[0].metadata.room, room);
    } finally {
      await client.close();
      await server.disconnect();
    }
  });

  await test('client enforces credentials and loopback-only verification bypass', async () => {
    await assert.rejects(
      () => createXmppClientTransport({
        ip: '127.0.0.1', port: 5222, xmppDomain: 'localhost',
      }).connect(),
      /Username and Password/,
    );
    await assert.rejects(
      () => createXmppClientTransport({
        ip: 'xmpp.example.com',
        port: 5222,
        xmppDomain: 'example.com',
        xmppUsername: 'logger',
        xmppPassword: 'secret',
        xmppAllowUnverifiedTls: true,
      }).connect(),
      /loopback/,
    );
  });

  await test('required client refuses credentials when a server disables STARTTLS', async () => {
    const server = new XmppServerCore({
      host: '127.0.0.1',
      port: 0,
      domain: 'localhost',
      tlsPolicy: 'disabled',
      externalAccount: { username: 'velocity', password: 'never-sent' },
    });
    let authenticated = 0;
    server.on('authenticated', () => { authenticated += 1; });
    const started = await server.listen();
    const client = new XmppClientCore({
      service: `xmpp://127.0.0.1:${started.address.port}`,
      domain: 'localhost',
      username: 'velocity',
      password: 'never-sent',
      startTlsPolicy: 'required',
    });
    client.on('error', () => {});
    try {
      await assert.rejects(() => client.connect(), /STARTTLS is required/);
      assert.strictEqual(authenticated, 0);
    } finally {
      await client.close().catch(() => {});
      await server.close();
    }
  });

  await test('account usernames are canonical and cannot collide with the app identity', async () => {
    assert.throws(() => createAccountStore({
      domain: 'localhost',
      externalAccount: { username: 'Velocity-Logger', password: 'secret' },
    }), /must differ/);
    const store = createAccountStore({
      domain: 'localhost',
      externalAccount: { username: 'MixedCase', password: 'exact secret' },
    });
    assert.deepStrictEqual(store.listUsernames(), ['velocity-logger', 'mixedcase']);
    assert.strictEqual(store.verifyPassword('MIXEDCASE', 'exact secret'), true);
  });

  await test('direct paths accept only chat messages', async () => {
    const serverReceived = [];
    const server = createXmppServerTransport({
      ip: '127.0.0.1',
      port: 0,
      xmppDomain: 'localhost',
      xmppTlsPolicy: 'disabled',
      xmppExternalUsername: 'velocity',
      xmppExternalPassword: 'type-secret',
      onData: (body) => serverReceived.push(body),
    });
    const started = await server.connect();
    const client = new XmppClientCore({
      service: `xmpp://127.0.0.1:${started.address.port}`,
      domain: 'localhost',
      username: 'velocity',
      password: 'type-secret',
      startTlsPolicy: 'disabled',
    });
    try {
      await client.connect();
      for (const type of ['normal', 'headline', 'error', 'groupchat']) {
        await client.entity.send(xml('message', { type, to: 'velocity-logger@localhost' },
          xml('body', {}, type)));
      }
      await client.sendChat('velocity-logger@localhost', 'chat');
      await waitFor(() => serverReceived.length === 1);
      assert.deepStrictEqual(serverReceived, ['chat']);

      let clientChats = 0;
      client.on('chat', () => { clientChats += 1; });
      for (const type of ['normal', 'headline', 'error', 'groupchat']) {
        client._onStanza(xml('message', {
          type,
          from: 'sender@localhost/source',
          to: client.jid,
        }, xml('body', {}, type)));
      }
      assert.strictEqual(clientChats, 0);
    } finally {
      await client.close();
      await server.disconnect();
    }
  });

  await test('disabled policy stays unsecure with canonical positive timing values', async () => {
    const server = createXmppServerTransport({
      ip: '127.0.0.1',
      port: 0,
      xmppDomain: 'localhost',
      xmppTlsPolicy: 'disabled',
      xmppExternalUsername: 'velocity',
      xmppExternalPassword: 'disabled-secret',
    });

    await test('preferred server reports plaintext origin metadata accurately', async () => {
      const received = [];
      const server = createXmppServerTransport({
        ip: '127.0.0.1',
        port: 0,
        xmppDomain: 'localhost',
        xmppTlsPolicy: 'preferred',
        xmppExternalUsername: 'velocity',
        xmppExternalPassword: 'preferred-secret',
        onData: (body, metadata) => received.push({ body, metadata }),
      });
      const started = await server.connect();
      const client = new XmppClientCore({
        service: `xmpp://127.0.0.1:${started.address.port}`,
        domain: 'localhost',
        username: 'velocity',
        password: 'preferred-secret',
        startTlsPolicy: 'disabled',
      });
      try {
        await client.connect();
        assert.strictEqual(client.isSecure(), false);
        await client.sendChat('velocity-logger@localhost', 'plaintext');
        await waitFor(() => received.length === 1);
        assert.strictEqual(received[0].metadata.tls, 'off (unsecure)');
      } finally {
        await client.close();
        await server.disconnect();
      }
    });

    await test('custom TLS certificate configuration requires complete pairs', async () => {
      assert.throws(() => new XmppServerCore({
        host: '127.0.0.1',
        externalAccount: { username: 'velocity', password: 'secret' },
        tlsCertPath: '/tmp/cert.pem',
      }), /TLS Certificate and Key paths/);
      assert.throws(() => new XmppServerCore({
        host: '127.0.0.1',
        externalAccount: { username: 'velocity', password: 'secret' },
        tlsKey: 'inline-key',
      }), /TLS Certificate and Key PEM values/);
    });
    const started = await server.connect();
    const client = createXmppClientTransport({
      ip: '127.0.0.1',
      port: started.address.port,
      xmppDomain: 'localhost',
      xmppUsername: 'velocity',
      xmppPassword: 'disabled-secret',
      xmppTlsPolicy: 'disabled',
      xmppPingIntervalMs: 60000,
      xmppReconnectDelayMs: 60000,
    });

    await test('XMPP timing values must be positive integers', async () => {
      assert.throws(() => createXmppClientTransport({
        ip: '127.0.0.1',
        port: 5222,
        xmppDomain: 'localhost',
        xmppPingIntervalMs: 0,
      }), /Ping ms must be a positive integer/);
      assert.throws(() => createXmppServerTransport({
        ip: '127.0.0.1',
        port: 5222,
        xmppDomain: 'localhost',
        xmppReplyTimeoutMs: 1.5,
      }), /Reply ms must be a positive integer/);
    });

    await test('copied client settings use canonical keys and the live bound address', async () => {
      const server = createXmppServerTransport({
        ip: '127.0.0.1',
        port: 0,
        xmppDomain: 'localhost',
        xmppExternalUsername: 'velocity',
        xmppExternalPassword: 'copy-secret',
      });
      const started = await server.connect();
      try {
        const withoutPassword = server.getClientSettings();
        assert.strictEqual(withoutPassword.ip, started.address.address);
        assert.strictEqual(withoutPassword.port, started.address.port);
        assert.strictEqual(withoutPassword.xmppConversation, 'direct');
        assert.strictEqual(withoutPassword.xmppDestination, 'velocity-logger@localhost');
        assert.strictEqual(withoutPassword.xmppReplyTimeoutMs, 15000);
        assert.strictEqual(withoutPassword.xmppPingIntervalMs, 60000);
        assert.strictEqual(withoutPassword.xmppPassword, undefined);
        assert.strictEqual(withoutPassword.xmppAllowUnverifiedTls, true);
        assert.strictEqual(withoutPassword.xmppHost, undefined);
        const withPassword = server.getClientSettings({ includePassword: true });
        assert.strictEqual(withPassword.xmppPassword, 'copy-secret');
      } finally {
        await server.disconnect();
      }
    });
    await test('wildcard server binds copy a connectable loopback host', async () => {
      const server = createXmppServerTransport({
        ip: '0.0.0.0',
        port: 0,
        xmppDomain: 'localhost',
        xmppAllowRemote: true,
        xmppExternalUsername: 'velocity',
        xmppExternalPassword: 'copy-secret',
      });
      await server.connect();
      try {
        const settings = server.getClientSettings();
        assert.strictEqual(settings.ip, '127.0.0.1');
        assert.strictEqual(settings.xmppAllowUnverifiedTls, true);
      } finally {
        await server.disconnect();
      }
    });
    try {
      const connected = await client.connect();
      assert.strictEqual(connected.tlsInfo, 'tls=off (unsecure)');
      assert.strictEqual(connected.reconnectDelayMs, 60000);
    } finally {
      await client.disconnect();
      await server.disconnect();
    }
  });

  await test('client reconnects after a server restart using the configured delay', async () => {
    const credentials = { username: 'velocity', password: 'reconnect-secret' };
    let server = new XmppServerCore({
      host: '127.0.0.1', port: 0, domain: 'localhost', externalAccount: credentials,
    });
    const first = await server.listen();
    const port = first.address.port;
    const client = new XmppClientCore({
      service: `xmpp://127.0.0.1:${port}`,
      domain: 'localhost',
      ...credentials,
      rejectUnauthorized: false,
    });
    client.entity.reconnect.delay = 50;
    let onlineCount = 0;
    let reconnectingCount = 0;
    let reconnectedCount = 0;
    client.on('online', () => { onlineCount += 1; });
    client.on('reconnecting', () => { reconnectingCount += 1; });
    client.on('reconnected', () => { reconnectedCount += 1; });
    try {
      await client.connect();
      await waitFor(() => onlineCount === 1);
      await server.close();
      await waitFor(() => !client.isOnline());
      server = new XmppServerCore({
        host: '127.0.0.1', port, domain: 'localhost', externalAccount: credentials,
      });
      await server.listen();
      await waitFor(() => onlineCount >= 2, 8000);
      assert.strictEqual(client.isOnline(), true);
      assert.ok(reconnectingCount >= 1);
      assert.strictEqual(reconnectedCount, 1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  await test('oversized message stanzas are rejected before body delivery', async () => {
    const received = [];
    const warnings = [];
    const fatalErrors = [];
    const server = createXmppServerTransport({
      ip: '127.0.0.1',
      port: 0,
      xmppDomain: 'localhost',
      xmppExternalUsername: 'velocity',
      xmppExternalPassword: 'limit-secret',
      xmppMaxMessageBytes: 512,
      onData: (body) => received.push(body),
      onWarning: (error) => warnings.push(error.message),
      onError: (error) => fatalErrors.push(error.message),
    });

    const started = await server.connect();
    const client = new XmppClientCore({
      service: `xmpp://127.0.0.1:${started.address.port}`,
      domain: 'localhost',
      username: 'velocity',
      password: 'limit-secret',
      rejectUnauthorized: false,
    });
    client.on('error', () => {});
    try {
      await client.connect();
      await client.sendChat('velocity-logger@localhost', 'x'.repeat(1024)).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.deepStrictEqual(received, []);
      assert.ok(warnings.length > 0);
      assert.deepStrictEqual(fatalErrors, []);
      assert.strictEqual(server.isConnected(), true);
    } finally {
      await client.close().catch(() => {});
      await server.disconnect();
    }
  });

  await test('headless server captures an XMPP body and exits at maxLogCount', async () => {
    const port = await pickFreePort();
    const outputFile = path.join(os.tmpdir(), `logger-xmpp-${process.pid}-${Date.now()}.log`);
    const runPromise = runHeadlessSession({
      ...DEFAULT_HEADLESS_OPTIONS,
      protocol: 'xmpp',
      mode: 'server',
      ip: '127.0.0.1',
      port,
      xmppDomain: 'localhost',
      xmppExternalUsername: 'velocity',
      xmppExternalPassword: 'headless-secret',
      outputFile,
      stdout: false,
      logLevel: 'error',
      maxLogCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const client = new XmppClientCore({
      service: `xmpp://127.0.0.1:${port}`,
      domain: 'localhost',
      username: 'velocity',
      password: 'headless-secret',
      rejectUnauthorized: false,
    });
    try {
      await client.connect();
      await client.sendChat('velocity-logger@localhost', 'headless-body');
      assert.strictEqual(await runPromise, 0);
      assert.strictEqual(fs.readFileSync(outputFile, 'utf8').trim(), 'headless-body');
    } finally {
      await client.close().catch(() => {});
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    }
  });

  await test('headless XMPP timeout closes the pending transport without reconnecting', async () => {
    let accepted = 0;
    let closed = 0;
    const sockets = new Set();
    const stalledServer = net.createServer((socket) => {
      accepted += 1;
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => {
        closed += 1;
        sockets.delete(socket);
      });
    });
    await new Promise((resolve) => stalledServer.listen(0, '127.0.0.1', resolve));
    const port = stalledServer.address().port;
    try {
      const exitCode = await runHeadlessSession({
        ...DEFAULT_HEADLESS_OPTIONS,
        protocol: 'xmpp',
        mode: 'client',
        ip: '127.0.0.1',
        port,
        xmppDomain: 'localhost',
        xmppUsername: 'velocity',
        xmppPassword: 'timeout-secret',
        connectTimeoutMs: 100,
        xmppConnectTimeoutMs: 5000,
        stdout: false,
        logLevel: 'error',
      });
      assert.strictEqual(exitCode, EXIT_CODES.runtimeError);
      await waitFor(() => closed === accepted).catch(() => {
        throw new Error(`Pending XMPP sockets remained open: accepted=${accepted} closed=${closed} active=${sockets.size}`);
      });
      const acceptedAtCompletion = accepted;
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.strictEqual(accepted, acceptedAtCompletion);
      assert.strictEqual(sockets.size, 0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => stalledServer.close(resolve));
    }
  });

  console.log(`\n${passed} passed`);
})();
