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

const crypto = require('crypto');
const net = require('net');
const tls = require('tls');
const { StringDecoder } = require('string_decoder');
const { EventEmitter } = require('events');
const { Parser, escapeXML, xml } = require('@xmpp/xml');
const { jid } = require('@xmpp/jid');
const { buildHttpsServerOptions } = require('./tls-utils');
const {
  XMPP_NS: NS,
  XMPP_DEFAULT_BIND_HOST,
  XMPP_DEFAULT_DOMAIN,
  XMPP_DEFAULT_MUC_SUBDOMAIN,
  STARTTLS_POLICIES: TLS_POLICIES,
  VALID_STARTTLS_POLICIES,
  RESOURCE_CONFLICT_POLICIES,
  VALID_RESOURCE_CONFLICT_POLICIES,
  SASL_MECHANISMS,
  DEFAULT_MAX_STANZA_BYTES,
  DEFAULT_MAX_AUTH_ATTEMPTS_PER_CONNECTION,
  DEFAULT_AUTH_RATE_LIMIT,
} = require('./xmpp-constants');
const { createAccountStore } = require('./xmpp-accounts');
const { createServerMechanism, SASL_CONDITIONS } = require('./xmpp-sasl-server');
const { createMucService } = require('./xmpp-muc');
const {
  isLoopbackHost,
  randomStanzaId,
  sanitizeResource,
  decodeSaslPayload,
  createRateLimiter,
  canonicalizeUsername,
  canonicalizeDomain,
} = require('./xmpp-utils');

class XmppServerCore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      host: XMPP_DEFAULT_BIND_HOST,
      port: 0,
      domain: XMPP_DEFAULT_DOMAIN,
      tlsPolicy: TLS_POLICIES.REQUIRED,
      maxXmlBytes: DEFAULT_MAX_STANZA_BYTES,
      maxAuthAttemptsPerConnection: DEFAULT_MAX_AUTH_ATTEMPTS_PER_CONNECTION,
      authAttempts: DEFAULT_AUTH_RATE_LIMIT.maxFailures,
      authWindowMs: DEFAULT_AUTH_RATE_LIMIT.windowMs,
      resourceConflict: RESOURCE_CONFLICT_POLICIES.REPLACE,
      allowRemote: false,
      ...options,
    };
    this.options.domain = canonicalizeDomain(this.options.domain);
    if (!VALID_STARTTLS_POLICIES.has(this.options.tlsPolicy)) {
      throw new Error(`Invalid TLS policy: ${this.options.tlsPolicy}`);
    }
    if (!VALID_RESOURCE_CONFLICT_POLICIES.has(this.options.resourceConflict)) {
      throw new Error(`Invalid resource conflict policy: ${this.options.resourceConflict}`);
    }
    if (!this.options.allowRemote && !isLoopbackHost(this.options.host)) {
      throw new Error('Enable Allow remote to bind the XMPP Server Host outside loopback');
    }
    this._validateTlsPair(this.options.tlsCert, this.options.tlsKey, 'TLS Certificate and Key PEM values');
    this._validateTlsPair(this.options.tlsCertPath, this.options.tlsKeyPath, 'TLS Certificate and Key paths');

    this.accountStore = createAccountStore({
      domain: this.options.domain,
      internalAppUsername: options.internalAccount?.username || 'velocity-logger',
      internalAppPassword: options.internalAccount?.password,
      externalAccount: options.externalAccount,
    });
    this.internalAccount = this.accountStore.getInternalCredentials();
    this.muc = createMucService({
      mucDomain: `${XMPP_DEFAULT_MUC_SUBDOMAIN}.${this.options.domain}`,
      rooms: Object.entries(options.roomPasswords || {}).map(([room, password]) => ({
        jid: room,
        password,
      })),
    });
    this.connections = new Set();
    this.bound = new Map();
    this.authRateLimiter = createRateLimiter({
      windowMs: this.options.authWindowMs,
      maxFailures: this.options.authAttempts,
    });
    this.server = null;
    this.tlsInfo = 'tls=off (unsecure)';
    this.selfSignedCertificate = null;
  }

  async listen() {
    if (this.server) throw new Error('XMPP server is already listening');
    if (this.options.tlsPolicy !== TLS_POLICIES.DISABLED) {
      const built = this.options.tlsCert
        ? {
          serverOptions: { cert: this.options.tlsCert, key: this.options.tlsKey },
          tlsInfo: 'tls=on, cert=supplied PEM, key=supplied PEM',
          selfSigned: null,
        }
        : buildHttpsServerOptions({
          useTls: true,
          tlsCaPath: this.options.tlsCaPath,
          tlsCertPath: this.options.tlsCertPath,
          tlsKeyPath: this.options.tlsKeyPath,
          ip: this.options.host,
          hostname: this.options.domain,
        });
      this.secureContext = tls.createSecureContext(built.serverOptions);
      this.tlsInfo = built.tlsInfo;
      this.selfSignedCertificate = built.selfSigned;
    }
    this.server = net.createServer((socket) => this._accept(socket));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.options.port, this.options.host, () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });
    const address = this.server.address();
    this.emit('listening', address);
    return {
      address,
      domain: this.options.domain,
      tlsPolicy: this.options.tlsPolicy,
      tlsInfo: this.tlsInfo,
      selfSignedCertificate: this.selfSignedCertificate,
    };
  }

  _validateTlsPair(cert, key, label) {
    if (Boolean(cert) !== Boolean(key)) throw new Error(`Both ${label} are required`);
  }

  async close() {
    if (!this.server) return;
    for (const connection of [...this.connections]) this._closeConnection(connection);
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(resolve));
  }

  getConnectionCount() {
    return this.connections.size;
  }

  getBoundJids() {
    return [...this.bound.keys()];
  }

  _accept(socket) {
    const connection = {
      id: randomStanzaId('session'),
      socket,
      parser: null,
      decoder: new StringDecoder('utf8'),
      secure: false,
      authenticated: false,
      authInitiations: 0,
      authRateCharge: null,
      username: null,
      fullJid: null,
      rooms: new Map(),
      pendingBytes: 0,
      sm: { enabled: false, inbound: 0, outbound: 0, lastAck: 0 },
      remoteAddress: socket.remoteAddress,
      closed: false,
    };
    this.connections.add(connection);
    socket.setNoDelay(true);
    this._attachSocket(connection, socket);
    this._resetParser(connection);
    this.emit('connection', { remoteAddress: connection.remoteAddress });
  }

  _attachSocket(connection, socket) {
    if (connection.socket) {
      connection.socket.removeAllListeners('data');
      connection.socket.removeAllListeners('error');
      connection.socket.removeAllListeners('close');
    }
    connection.socket = socket;
    socket.on('data', (data) => this._onData(connection, data));
    socket.on('error', (error) => {
      this.emit('clientError', { message: error.message, jid: connection.fullJid });
    });
    socket.on('close', () => this._cleanup(connection));
  }

  _resetParser(connection) {
    const parser = new Parser();
    connection.parser = parser;
    connection.decoder = new StringDecoder('utf8');
    connection.pendingBytes = 0;
    parser.on('start', (root) => this._onStreamStart(connection, root));
    parser.on('element', (element) => this._onElement(connection, element));
    parser.on('end', () => this._gracefulClose(connection));
    parser.on('error', () => this._streamError(connection, 'not-well-formed'));
  }

  _onData(connection, data) {
    if (connection.closed) return;
    if (data.includes('<!DOCTYPE') || data.includes('<!ENTITY')) {
      this._streamError(connection, 'restricted-xml');
      return;
    }
    connection.pendingBytes += data.length;
    if (connection.pendingBytes > this.options.maxXmlBytes) {
      this.emit('clientError', {
        message: 'XML size limit exceeded; client stream closed',
        jid: connection.fullJid,
      });
      this._streamError(connection, 'policy-violation', 'XML size limit exceeded');
      return;
    }
    try {
      connection.parser.write(connection.decoder.write(data));
    } catch (_) {
      this._streamError(connection, 'not-well-formed');
    }
  }

  _onStreamStart(connection, root) {
    if (root.name !== 'stream:stream' || root.attrs.to !== this.options.domain) {
      this._streamError(connection, 'host-unknown');
      return;
    }
    connection.pendingBytes = 0;
    const id = randomStanzaId('stream');
    this._write(connection,
      `<?xml version="1.0"?><stream:stream from="${escapeXML(this.options.domain)}" id="${id}" ` +
      `xmlns="${NS.CLIENT}" xmlns:stream="${NS.STREAM}" version="1.0">`);
    this._sendFeatures(connection);
  }

  _sendFeatures(connection) {
    const features = [];
    if (!connection.authenticated) {
      if (!connection.secure && this.options.tlsPolicy !== TLS_POLICIES.DISABLED) {
        const children = this.options.tlsPolicy === TLS_POLICIES.REQUIRED ? [xml('required')] : [];
        features.push(xml('starttls', { xmlns: NS.TLS }, children));
      }
      if (connection.secure || this.options.tlsPolicy !== TLS_POLICIES.REQUIRED) {
        const mechanisms = [xml('mechanism', {}, 'SCRAM-SHA-1')];
        if (connection.secure) mechanisms.push(xml('mechanism', {}, 'PLAIN'));
        features.push(xml('mechanisms', { xmlns: NS.SASL }, mechanisms));
      }
    } else {
      features.push(xml('bind', { xmlns: NS.BIND }));
      features.push(xml('sm', { xmlns: NS.SM }));
    }
    this._send(connection, xml('stream:features', {}, features));
  }

  async _onElement(connection, element) {
    connection.pendingBytes = 0;
    if (Buffer.byteLength(element.toString()) > this.options.maxXmlBytes) {
      this.emit('clientError', {
        message: 'Stanza size limit exceeded; client stream closed',
        jid: connection.fullJid,
      });
      this._streamError(connection, 'policy-violation', 'Stanza size limit exceeded');
      return;
    }
    try {
      if (element.is('starttls', NS.TLS)) return this._startTls(connection);
      if (!connection.secure && this.options.tlsPolicy === TLS_POLICIES.REQUIRED &&
          (element.is('auth', NS.SASL) || element.is('response', NS.SASL) ||
           element.is('abort', NS.SASL))) {
        this._saslFailure(connection, 'encryption-required');
        return this._streamError(connection, 'policy-violation', 'STARTTLS is required before SASL');
      }
      if (element.is('auth', NS.SASL)) return this._authenticate(connection, element);
      if (element.is('response', NS.SASL)) return this._scramResponse(connection, element);
      if (!connection.authenticated) return this._streamError(connection, 'not-authorized');
      if (element.is('resume', NS.SM)) {
        return this._send(connection, xml('failed', { xmlns: NS.SM },
          xml('item-not-found', { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' })));
      }
      if (element.is('enable', NS.SM)) return this._enableSm(connection);
      if (element.is('r', NS.SM)) return this._send(connection, xml('a', { xmlns: NS.SM, h: connection.sm.inbound }));
      if (element.is('a', NS.SM)) {
        connection.sm.lastAck = Number(element.attrs.h) || 0;
        return;
      }
      if (connection.sm.enabled && ['iq', 'message', 'presence'].includes(element.name)) {
        connection.sm.inbound += 1;
      }
      if (element.name === 'iq') return this._handleIq(connection, element);
      if (!connection.fullJid) return this._streamError(connection, 'not-authorized');
      if (element.name === 'message') return this._handleMessage(connection, element);
      if (element.name === 'presence') return this._handlePresence(connection, element);
    } catch (error) {
      this.emit('clientError', { message: error.message, jid: connection.fullJid });
      this._streamError(connection, 'internal-server-error');
    }
  }

  _startTls(connection) {
    if (connection.secure || this.options.tlsPolicy === TLS_POLICIES.DISABLED) {
      this._send(connection, xml('failure', { xmlns: NS.TLS }));
      return this._closeConnection(connection);
    }
    this._write(connection, xml('proceed', { xmlns: NS.TLS }).toString(), () => {
      const rawSocket = connection.socket;
      rawSocket.removeAllListeners('data');
      rawSocket.removeAllListeners('error');
      rawSocket.removeAllListeners('close');
      const tlsSocket = new tls.TLSSocket(rawSocket, {
        isServer: true,
        secureContext: this.secureContext,
      });
      connection.secure = true;
      this._attachSocket(connection, tlsSocket);
      this._resetParser(connection);
      tlsSocket.on('secure', () => this.emit('secure', { remoteAddress: tlsSocket.remoteAddress }));
    });
  }

  _authenticate(connection, element) {
    if (connection.sasl) {
      connection.sasl = null;
      connection.saslMechanism = null;
      return this._recordAuthFailure(connection, SASL_CONDITIONS.MALFORMED_REQUEST);
    }
    if (connection.authInitiations >= this.options.maxAuthAttemptsPerConnection) {
      this._saslFailure(connection, 'temporary-auth-failure');
      return;
    }
    connection.authInitiations += 1;
    const charge = this.authRateLimiter.charge(connection.remoteAddress);
    if (!charge) {
      this._saslFailure(connection, 'temporary-auth-failure');
      return;
    }
    connection.authRateCharge = charge;
    const mechanism = element.attrs.mechanism;
    if (mechanism === SASL_MECHANISMS.PLAIN && !connection.secure) {
      return this._recordAuthFailure(connection, 'encryption-required');
    }
    const sasl = createServerMechanism(mechanism, {
      verifyPassword: (username, password) => this.accountStore.verifyPassword(username, password),
      lookupPassword: (username) => this.accountStore.getPassword(username),
    });
    if (!sasl) {
      this._saslFailure(connection, SASL_CONDITIONS.INVALID_MECHANISM);
      return;
    }
    connection.sasl = sasl;
    connection.saslMechanism = mechanism;
    let initial;
    try {
      initial = decodeSaslPayload(element.text());
    } catch (_) {
      return this._recordAuthFailure(connection, SASL_CONDITIONS.INCORRECT_ENCODING);
    }
    this._applySaslResult(connection, sasl.start(initial));
  }

  _scramResponse(connection, element) {
    if (!connection.sasl) {
      return this._recordAuthFailure(connection, SASL_CONDITIONS.MALFORMED_REQUEST);
    }
    let response;
    try {
      response = decodeSaslPayload(element.text());
    } catch (_) {
      return this._recordAuthFailure(connection, SASL_CONDITIONS.INCORRECT_ENCODING);
    }
    this._applySaslResult(connection, connection.sasl.next(response));
  }

  _applySaslResult(connection, result) {
    if (result.status === 'challenge') {
      this._send(connection, xml('challenge', { xmlns: NS.SASL },
        Buffer.from(result.payload, 'utf8').toString('base64')));
      return;
    }
    if (result.status === 'success') {
      return this._authSuccess(connection, result.username, result.payload || '');
    }
    connection.sasl = null;
    connection.saslMechanism = null;
    return this._recordAuthFailure(connection, result.condition);
  }

  _authSuccess(connection, username, additionalData = '') {
    const mechanism = connection.saslMechanism;
    connection.authenticated = true;
    connection.username = canonicalizeUsername(username, this.options.domain);
    connection.sasl = null;
    connection.saslMechanism = null;
    this.authRateLimiter.refund(connection.remoteAddress, connection.authRateCharge);
    connection.authRateCharge = null;
    this._send(connection, xml('success', { xmlns: NS.SASL },
      additionalData ? Buffer.from(additionalData).toString('base64') : ''));
    this._resetParser(connection);
    this.emit('authenticated', { username: connection.username, mechanism });
  }

  _recordAuthFailure(connection, condition) {
    if (connection.authRateCharge) connection.authRateCharge = null;
    else this.authRateLimiter.recordFailure(connection.remoteAddress);
    this._saslFailure(connection, condition);
  }

  _saslFailure(connection, condition) {
    this._send(connection, xml('failure', { xmlns: NS.SASL }, xml(condition)));
  }

  _handleIq(connection, stanza) {
    const type = stanza.attrs.type;
    const bind = stanza.getChild('bind', NS.BIND);
    if (type === 'set' && bind) return this._bind(connection, stanza, bind);
    const ping = stanza.getChild('ping', NS.PING);
    if (type === 'get' && ping) {
      this._sendTracked(connection, xml('iq', {
        type: 'result',
        id: stanza.attrs.id,
        from: stanza.attrs.to || this.options.domain,
        to: connection.fullJid,
      }));
      return;
    }
    this._iqError(connection, stanza, 'service-unavailable');
  }

  _bind(connection, stanza, bind) {
    const requested = sanitizeResource(bind.getChildText('resource'));
    const resource = requested || crypto.randomBytes(6).toString('base64url');
    const fullJid = jid(connection.username, this.options.domain, resource).toString();
    const existing = this.bound.get(fullJid);
    if (existing && existing !== connection) {
      if (this.options.resourceConflict === RESOURCE_CONFLICT_POLICIES.REJECT) {
        this._iqError(connection, stanza, 'conflict');
        return;
      }
      this._streamError(existing, 'conflict', 'Resource replaced by a new connection');
    }
    if (connection.fullJid) this.bound.delete(connection.fullJid);
    connection.fullJid = fullJid;
    this.bound.set(fullJid, connection);
    this._sendTracked(connection, xml('iq', { type: 'result', id: stanza.attrs.id },
      xml('bind', { xmlns: NS.BIND }, xml('jid', {}, fullJid))));
    this.emit('bound', { jid: fullJid });
  }

  _handleMessage(connection, stanza) {
    const to = stanza.attrs.to;
    const body = stanza.getChildText('body');
    if (!to || body === undefined || body === null) return;
    const target = jid(to);
    if (stanza.attrs.type === 'groupchat' && !target.resource) {
      this._sendMucMessage(connection, target.bare().toString(), body);
      return;
    }
    if (stanza.attrs.type !== 'chat') return;
    const recipient = this._findRecipient(target);
    this.emit('message', {
      from: connection.fullJid,
      to: recipient?.fullJid || target.toString(),
      body,
      secure: connection.secure,
    });
    if (!recipient) return;
    this._sendTracked(recipient, xml('message', {
      type: stanza.attrs.type || 'chat',
      from: connection.fullJid,
      to: recipient.fullJid,
      id: stanza.attrs.id,
    }, xml('body', {}, body)));
  }

  _findRecipient(target) {
    if (target.resource) return this.bound.get(target.toString());
    const bare = target.bare().toString();
    return [...this.bound.entries()].reverse().find(([full]) => jid(full).bare().toString() === bare)?.[1];
  }

  _handlePresence(connection, stanza) {
    if (!stanza.attrs.to) return;
    const target = jid(stanza.attrs.to);
    if (!this.muc.isMucJid(stanza.attrs.to)) return;
    const roomJid = target.bare().toString();
    if (stanza.attrs.type === 'unavailable') {
      this._leaveRoom(connection, roomJid);
      return;
    }
    if (!target.resource || !stanza.getChild('x', NS.MUC)) return;
    const supplied = stanza.getChild('x', NS.MUC).getChildText('password') || '';
    this._joinRoom(connection, roomJid, target.resource, supplied);
  }

  _joinRoom(connection, roomJid, nickname, password) {
    this._leaveRoom(connection, roomJid);
    const result = this.muc.join({
      roomJid,
      nick: nickname,
      password,
      sessionId: connection.id,
      fullJid: connection.fullJid,
    });
    if (!result.ok) {
      this._sendTracked(connection, xml('presence', {
        from: `${roomJid}/${nickname}`,
        to: connection.fullJid,
        type: 'error',
      }, xml('error', { type: result.error.type }, xml(result.error.condition, {
        xmlns: NS.STANZA_ERROR,
      }))));
      return;
    }
    for (const occupant of result.existingOccupants) {
      this._sendMucPresence(connection, roomJid, occupant.nick, occupant, false, false);
    }
    connection.rooms.set(roomJid, nickname);
    for (const occupant of this.muc.getOccupants(roomJid)) {
      const member = this._connectionById(occupant.sessionId);
      if (member) {
        this._sendMucPresence(
          member,
          roomJid,
          nickname,
          result.self,
          member === connection,
          result.created && member === connection,
        );
      }
    }
    this.emit('mucJoin', { room: roomJid, nickname, jid: connection.fullJid });
  }

  _sendMucPresence(recipient, roomJid, nickname, occupant, self, created = false) {
    const statuses = [
      ...(created ? [xml('status', { code: '201' })] : []),
      ...(self ? [xml('status', { code: '110' })] : []),
    ];
    this._sendTracked(recipient, xml('presence', {
      from: `${roomJid}/${nickname}`,
      to: recipient.fullJid,
    }, xml('x', { xmlns: NS.MUC_USER },
      xml('item', {
        affiliation: occupant.affiliation,
        role: occupant.role,
        jid: occupant.fullJid,
      }),
      statuses)));
  }

  _sendMucMessage(connection, roomJid, body) {
    const room = this.muc.resolveBroadcast({ roomJid, sessionId: connection.id });
    const nickname = connection.rooms.get(roomJid);
    if (!room.ok || !nickname) return;
    for (const occupant of room.recipients) {
      const recipient = this._connectionById(occupant.sessionId);
      if (!recipient) continue;
      this._sendTracked(recipient, xml('message', {
        type: 'groupchat',
        from: `${roomJid}/${nickname}`,
        to: recipient.fullJid,
      }, xml('body', {}, body)));
    }
    this.emit('mucMessage', { room: roomJid, nickname, body, secure: connection.secure });
  }

  _leaveRoom(connection, roomJid) {
    const nickname = connection.rooms.get(roomJid);
    if (!nickname) return;
    const result = this.muc.leave({ roomJid, sessionId: connection.id, nick: nickname });
    if (!result.ok) return;
    connection.rooms.delete(roomJid);
    for (const occupant of result.remaining) {
      const recipient = this._connectionById(occupant.sessionId);
      if (!recipient) continue;
      this._sendTracked(recipient, xml('presence', {
        from: `${roomJid}/${nickname}`,
        to: recipient.fullJid,
        type: 'unavailable',
      }));
    }
    this.emit('mucLeave', { room: roomJid, nickname, jid: connection.fullJid });
  }

  _connectionById(id) {
    return [...this.connections].find((connection) => connection.id === id);
  }

  _enableSm(connection) {
    connection.sm = { enabled: true, inbound: 0, outbound: 0, lastAck: 0 };
    this._send(connection, xml('enabled', {
      xmlns: NS.SM,
      id: crypto.randomBytes(12).toString('base64url'),
      resume: 'false',
    }));
  }

  _sendTracked(connection, stanza) {
    if (connection.sm.enabled && ['iq', 'message', 'presence'].includes(stanza.name)) {
      connection.sm.outbound += 1;
    }
    this._send(connection, stanza);
  }

  _iqError(connection, request, condition) {
    this._sendTracked(connection, xml('iq', {
      type: 'error',
      id: request.attrs.id,
      to: connection.fullJid,
    }, xml('error', { type: 'cancel' }, xml(condition, {
      xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas',
    }))));
  }

  _send(connection, element) {
    this._write(connection, element.toString());
  }

  _write(connection, value, callback) {
    if (!connection.closed && connection.socket.writable) connection.socket.write(value, callback);
  }

  _streamError(connection, condition, text) {
    if (connection.closed) return;
    const children = [xml(condition, { xmlns: NS.STREAM_ERROR })];
    if (text) children.push(xml('text', { xmlns: NS.STREAM_ERROR, 'xml:lang': 'en' }, text));
    this._send(connection, xml('stream:error', {}, children));
    this._write(connection, '</stream:stream>', () => this._closeConnection(connection));
  }

  _gracefulClose(connection) {
    if (connection.closed) return;
    this._write(connection, '</stream:stream>', () => this._closeConnection(connection));
  }

  _closeConnection(connection) {
    if (connection.closed) return;
    connection.closed = true;
    connection.socket.end();
    setTimeout(() => {
      if (!connection.socket.destroyed) connection.socket.destroy();
    }, 1000).unref();
    this._cleanup(connection);
  }

  _cleanup(connection) {
    if (!this.connections.has(connection)) return;
    for (const roomJid of [...connection.rooms.keys()]) this._leaveRoom(connection, roomJid);
    if (connection.fullJid && this.bound.get(connection.fullJid) === connection) {
      this.bound.delete(connection.fullJid);
    }
    this.connections.delete(connection);
    this.emit('disconnect', { jid: connection.fullJid });
  }
}

module.exports = {
  NS,
  TLS_POLICIES,
  RESOURCE_CONFLICT_POLICIES,
  XmppServerCore,
};
