/**
 * Copyright 2026 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { XmppClientCore } = require('./xmpp-client-core');
const { XmppServerCore } = require('./xmpp-server-core');
const {
  XMPP_DEFAULT_C2S_PORT,
  XMPP_DEFAULT_BIND_HOST,
  XMPP_DEFAULT_DOMAIN,
  STARTTLS_POLICIES,
  DEFAULT_CLIENT_TIMEOUT_MS,
  DEFAULT_REPLY_TIMEOUT_MS,
  DEFAULT_PING_INTERVAL_MS,
  DEFAULT_RECONNECT_DELAY_MS,
} = require('./xmpp-constants');
const { canonicalizeDomain } = require('./xmpp-utils');

const XMPP_CHAT_MODES = Object.freeze({ DIRECT: 'direct', MUC: 'muc' });
const VALID_CHAT_MODES = new Set(Object.values(XMPP_CHAT_MODES));
const MAX_MESSAGE_BYTES = 64 * 1024;

function normalizeBareJid(value) {
  return String(value || '').trim().toLowerCase().split('/')[0];
}

function toConnectableHost(address) {
  if (address === '0.0.0.0') return '127.0.0.1';
  if (address === '::') return '::1';
  return address;
}

function buildXmppMetadata({ mode, chatMode, from, to, room, nickname, tls }) {
  return {
    protocol: 'XMPP', mode, chatMode, from: from || '', to: to || '',
    room: room || '', nickname: nickname || '', tls,
  };
}

function validateCommon(options) {
  const chatMode = String(options.xmppConversation || XMPP_CHAT_MODES.DIRECT).toLowerCase();
  if (!VALID_CHAT_MODES.has(chatMode)) throw new Error('XMPP Conversation must be Direct or MUC');
  const tlsPolicy = String(options.xmppTlsPolicy || STARTTLS_POLICIES.REQUIRED).toLowerCase();
  if (!Object.values(STARTTLS_POLICIES).includes(tlsPolicy)) {
    throw new Error('XMPP TLS must be Required, Preferred, or Disabled');
  }
  const timings = [
    ['Connect ms', options.xmppConnectTimeoutMs ?? DEFAULT_CLIENT_TIMEOUT_MS],
    ['Reply ms', options.xmppReplyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS],
    ['Ping ms', options.xmppPingIntervalMs ?? DEFAULT_PING_INTERVAL_MS],
    ['Reconnect ms', options.xmppReconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS],
  ];
  for (const [name, rawValue] of timings) {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  }
  return { chatMode, tlsPolicy };
}

function emitBody(options, body, metadata) {
  if (body === undefined || body === null || body === '') return;
  if (Buffer.byteLength(body, 'utf8') > (options.xmppMaxMessageBytes || MAX_MESSAGE_BYTES)) {
    options.onWarning?.(new Error('Message body exceeds the configured size limit and was ignored'));
    return;
  }
  options.onData?.(body, metadata);
}

function createXmppClientTransport(options = {}) {
  const { chatMode, tlsPolicy } = validateCommon(options);
  const domain = canonicalizeDomain(options.xmppDomain || XMPP_DEFAULT_DOMAIN);
  const host = options.ip || domain;
  const port = Number(options.port ?? XMPP_DEFAULT_C2S_PORT);
  const service = `xmpp://${host}:${port}`;
  let core = null;
  let pingTimer = null;
  let connecting = false;

  return {
    async connect() {
      // The password may be present but empty for relaxed local testing.
      if (!options.xmppUsername || typeof options.xmppPassword !== 'string') {
        throw new Error('XMPP Client Username and Password are required; the password may be empty');
      }
      core = new XmppClientCore({
        service,
        domain,
        username: options.xmppUsername,
        password: options.xmppPassword,
        resource: options.xmppResource || 'velocity-logger',
        timeout: Number(options.xmppConnectTimeoutMs || DEFAULT_CLIENT_TIMEOUT_MS),
        replyTimeout: Number(options.xmppReplyTimeoutMs || DEFAULT_REPLY_TIMEOUT_MS),
        caPath: options.xmppTlsCaPath || undefined,
        rejectUnauthorized: options.xmppAllowUnverifiedTls === true ? false : undefined,
        startTlsPolicy: tlsPolicy,
      });
      core.entity.reconnect.delay = Number(options.xmppReconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS);
      core.on('error', (error) => options.onWarning?.(error));
      core.on('status', (status) => options.onStatus?.(status));
      core.on('reconnecting', () => {
        options.onStatus?.('Client connection interrupted; reconnecting');
        options.onState?.('reconnecting');
      });
      core.on('reconnected', () => {
        const tlsInfo = core.isSecure() ? 'tls=on (STARTTLS)' : 'tls=off (unsecure)';
        options.onStatus?.(`Client reconnected to ${service} as ${core.jid}\n  ${tlsInfo}`);
        options.onState?.('connected');
      });
      core.on('chat', (message) => {
        if (chatMode !== XMPP_CHAT_MODES.DIRECT ||
            message.stanza.attrs.type !== 'chat' ||
            message.stanza.getChild('delay', 'urn:xmpp:delay')) return;
        const local = normalizeBareJid(options.xmppLocalJid || core.jid);
        if (local && normalizeBareJid(message.to) !== local) return;
        if (normalizeBareJid(message.from) === normalizeBareJid(core.jid)) return;
        emitBody(options, message.body, buildXmppMetadata({
          mode: 'client', chatMode, from: message.from, to: message.to,
          tls: core.isSecure() ? 'on (STARTTLS)' : 'off (unsecure)',
        }));
      });
      core.on('mucMessage', (message) => {
        if (chatMode !== XMPP_CHAT_MODES.MUC ||
            normalizeBareJid(message.room) !== normalizeBareJid(options.xmppRoom) ||
            message.self || message.stanza.getChild('delay', 'urn:xmpp:delay')) return;
        emitBody(options, message.body, buildXmppMetadata({
          mode: 'client', chatMode, from: message.stanza.attrs.from, to: message.stanza.attrs.to,
          room: message.room, nickname: message.nickname,
          tls: core.isSecure() ? 'on (STARTTLS)' : 'off (unsecure)',
        }));
      });
      connecting = true;
      try {
        await core.connect();
      } finally {
        connecting = false;
      }
      if (tlsPolicy === STARTTLS_POLICIES.REQUIRED && !core.isSecure()) {
        await core.close();
        throw new Error('XMPP STARTTLS is required but the server did not establish TLS');
      }
      if (chatMode === XMPP_CHAT_MODES.MUC) {
        if (!options.xmppRoom || !options.xmppNickname) {
          await core.close();
          throw new Error('XMPP MUC mode requires Room and Nickname');
        }
        await core.joinMuc(options.xmppRoom, options.xmppNickname, options.xmppRoomPassword || '');
      }
      const pingInterval = Number(options.xmppPingIntervalMs ?? DEFAULT_PING_INTERVAL_MS);
      if (pingInterval > 0) {
        pingTimer = setInterval(() => {
          if (core?.isOnline()) core.ping().catch((error) => options.onStatus?.(`ping failed: ${error.message}`));
        }, pingInterval);
        pingTimer.unref?.();
      }
      return {
        success: true, mode: 'client', address: service, jid: core.jid, tlsPolicy,
        tlsInfo: core.isSecure() ? 'tls=on (STARTTLS)' : 'tls=off (unsecure)',
        reconnectDelayMs: Number(options.xmppReconnectDelayMs || DEFAULT_RECONNECT_DELAY_MS),
      };
    },
    async disconnect() {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      if (core) {
        if (connecting) core.abort();
        else await core.close();
      }
      core = null;
    },
    isConnected() { return Boolean(core?.isOnline()); },
  };
}

function createXmppServerTransport(options = {}) {
  const { chatMode, tlsPolicy } = validateCommon(options);
  const domain = canonicalizeDomain(options.xmppDomain || XMPP_DEFAULT_DOMAIN);
  const host = options.ip || XMPP_DEFAULT_BIND_HOST;
  const port = Number(options.port ?? XMPP_DEFAULT_C2S_PORT);
  let core = null;
  let boundAddress = null;
  let allowUnverifiedTls = false;

  return {
    async connect() {
      // The external password may be present but empty for relaxed local testing.
      if (!options.xmppExternalUsername || typeof options.xmppExternalPassword !== 'string') {
        throw new Error('XMPP Server External user and External password are required; the password may be empty');
      }
      core = new XmppServerCore({
        host, port, domain, tlsPolicy,
        allowRemote: options.xmppAllowRemote === true,
        tlsCaPath: options.xmppTlsCaPath || undefined,
        tlsCertPath: options.xmppTlsCertPath || undefined,
        tlsKeyPath: options.xmppTlsKeyPath || undefined,
        internalAccount: { username: 'velocity-logger' },
        externalAccount: {
          username: options.xmppExternalUsername,
          password: options.xmppExternalPassword,
        },
        roomPasswords: options.xmppRoom
          ? { [options.xmppRoom]: options.xmppRoomPassword || '' }
          : {},
        maxXmlBytes: options.xmppMaxMessageBytes || MAX_MESSAGE_BYTES,
      });
      core.on('clientError', ({ message, jid }) => {
        const identity = jid ? ` for ${jid}` : '';
        options.onWarning?.(new Error(`Client${identity}: ${message}`));
      });
      core.on('authenticated', ({ username, mechanism }) => options.onStatus?.(`authenticated ${username} with ${mechanism}`));
      core.on('message', (message) => {
        if (chatMode !== XMPP_CHAT_MODES.DIRECT ||
            normalizeBareJid(message.to) !== `velocity-logger@${domain}`) return;
        emitBody(options, message.body, buildXmppMetadata({
          mode: 'server', chatMode: XMPP_CHAT_MODES.DIRECT,
          from: message.from, to: message.to,
          tls: message.secure ? 'on (STARTTLS)' : 'off (unsecure)',
        }));
      });
      core.on('mucMessage', (message) => {
        if (chatMode !== XMPP_CHAT_MODES.MUC ||
            normalizeBareJid(message.room) !== normalizeBareJid(options.xmppRoom)) return;
        emitBody(options, message.body, buildXmppMetadata({
          mode: 'server', chatMode: XMPP_CHAT_MODES.MUC,
          from: `${message.room}/${message.nickname}`, room: message.room,
          nickname: message.nickname,
          tls: message.secure ? 'on (STARTTLS)' : 'off (unsecure)',
        }));
      });
      const result = await core.listen();
      boundAddress = result.address;
      // Copied client settings advertise the certificate bypass whenever this
      // server presents an ephemeral self-signed certificate, so the paired
      // client can trust it. The value is explicit in the copied JSON; nothing
      // is enabled silently on this side.
      allowUnverifiedTls = Boolean(result.selfSignedCertificate);
      return {
        success: true, mode: 'server', address: result.address, domain,
        appJid: core.internalAccount.jid,
        tlsPolicy,
        tlsInfo: tlsPolicy === STARTTLS_POLICIES.PREFERRED
          ? 'tls=opportunistic (STARTTLS available; plaintext clients allowed)'
          : result.tlsInfo,
      };
    },
    async disconnect() {
      if (core) await core.close();
      core = null;
      boundAddress = null;
      allowUnverifiedTls = false;
    },
    isConnected() { return Boolean(core); },
    getClientCount() { return core?.getConnectionCount() || 0; },
    getClientSettings({ includePassword = false } = {}) {
      if (!core || !boundAddress) throw new Error('The XMPP Server is not listening');
      const connectableHost = toConnectableHost(boundAddress.address);
      const settings = {
        protocol: 'xmpp',
        mode: 'client',
        ip: connectableHost,
        port: boundAddress.port,
        xmppDomain: domain,
        xmppUsername: options.xmppExternalUsername || '',
        xmppResource: options.xmppResource || 'external',
        xmppTlsPolicy: tlsPolicy,
        xmppAllowUnverifiedTls: allowUnverifiedTls,
        xmppConversation: chatMode,
        xmppDestination: core.internalAccount.jid,
        xmppRoom: options.xmppRoom || '',
        xmppNickname: options.xmppNickname || '',
        xmppConnectTimeoutMs: Number(options.xmppConnectTimeoutMs || DEFAULT_CLIENT_TIMEOUT_MS),
        xmppReplyTimeoutMs: Number(options.xmppReplyTimeoutMs || DEFAULT_REPLY_TIMEOUT_MS),
        xmppPingIntervalMs: Number(options.xmppPingIntervalMs ?? DEFAULT_PING_INTERVAL_MS),
        xmppReconnectDelayMs: Number(options.xmppReconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS),
      };
      if (includePassword) settings.xmppPassword = options.xmppExternalPassword || '';
      return settings;
    },
  };
}

module.exports = {
  XMPP_CHAT_MODES,
  MAX_MESSAGE_BYTES,
  normalizeBareJid,
  buildXmppMetadata,
  createXmppClientTransport,
  createXmppServerTransport,
};
