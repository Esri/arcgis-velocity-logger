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

const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
const { EventEmitter } = require('events');
const { client, xml } = require('@xmpp/client');
const { DEFAULT_CLIENT_TIMEOUT_MS, DEFAULT_REPLY_TIMEOUT_MS, XMPP_NS } = require('./xmpp-constants');
const { canonicalizeDomain, isLoopbackHost } = require('./xmpp-utils');
const { getSystemRootCertificates } = require('./tls-utils');

const tlsOptionsContext = new AsyncLocalStorage();
let tlsSocketOverridePromise;

/**
 * @xmpp/starttls does not expose TLS options, so this spike narrowly augments
 * @xmpp/tls's Socket class. Unlike replacing node:tls.connect, this cannot
 * affect unrelated TLS traffic. AsyncLocalStorage keeps simultaneous XMPP
 * clients' CA and verification options isolated. This relies on the
 * @xmpp/tls/lib/Socket.js entry point and must be revalidated on dependency
 * upgrades until xmpp.js exposes per-client STARTTLS options.
 */
function installXmppTlsSocketOverride() {
  if (tlsSocketOverridePromise) return tlsSocketOverridePromise;
  tlsSocketOverridePromise = import('@xmpp/tls/lib/Socket.js').then(({ default: XmppTlsSocket }) => {
    if (XmppTlsSocket.prototype.connect.__velocityTlsOverride) return;
    const originalConnect = XmppTlsSocket.prototype.connect;
    function scopedXmppTlsConnect(...args) {
      const override = tlsOptionsContext.getStore();
      if (override && args[0]?.socket) args[0] = { ...args[0], ...override };
      return originalConnect.apply(this, args);
    }
    Object.defineProperty(scopedXmppTlsConnect, '__velocityTlsOverride', { value: true });
    XmppTlsSocket.prototype.connect = scopedXmppTlsConnect;
  });
  return tlsSocketOverridePromise;
}

function loadPem(value, filePath, label) {
  if (value && filePath) throw new Error(`Specify either ${label} or ${label}Path, not both`);
  return filePath ? fs.readFileSync(filePath) : value;
}

function createCancellableWaiter({ subscribe, timeout, timeoutMessage }) {
  let active = true;
  let timer;
  let unsubscribe = () => {};
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const cleanup = () => {
    clearTimeout(timer);
    unsubscribe();
  };
  const settle = (callback) => (value) => {
    if (!active) return;
    active = false;
    cleanup();
    callback(value);
  };
  const resolve = settle(resolvePromise);
  const reject = settle(rejectPromise);
  unsubscribe = subscribe(resolve);
  if (active) timer = setTimeout(() => reject(new Error(timeoutMessage)), timeout);
  return {
    promise,
    cancel() {
      if (!active) return;
      active = false;
      cleanup();
    },
  };
}

class XmppClientCore extends EventEmitter {
  constructor(options) {
    super();
    if (!options?.service || !options.domain || !options.username || !options.password) {
      throw new Error('service, domain, username, and password are required');
    }
    const serviceUrl = new URL(options.service);
    if (options.rejectUnauthorized === false && !isLoopbackHost(serviceUrl.hostname)) {
      throw new Error('TLS verification bypass is restricted to loopback services');
    }
    this.options = {
      resource: 'velocity',
      timeout: DEFAULT_CLIENT_TIMEOUT_MS,
      replyTimeout: DEFAULT_REPLY_TIMEOUT_MS,
      ...options,
      domain: canonicalizeDomain(options.domain),
    };
    const ca = loadPem(options.ca, options.caPath, 'ca') || getSystemRootCertificates().pemBuffer;
    this.tlsOptions = {
      ...(ca ? { ca } : {}),
      ...(options.rejectUnauthorized === false ? { rejectUnauthorized: false } : {}),
    };
    const credentials = async (authenticate, mechanisms, _fast, entity) => {
      if (options.startTlsPolicy === 'required' && !entity.isSecure()) {
        throw new Error('XMPP STARTTLS is required but the server did not offer or establish TLS');
      }
      const mechanism = options.mechanism ||
        (entity.isSecure() ? mechanisms[0] : mechanisms.find((candidate) => candidate !== 'PLAIN'));
      if (!mechanism || !mechanisms.includes(mechanism)) {
        throw new Error(options.mechanism
          ? `Requested SASL mechanism is unavailable: ${options.mechanism}`
          : 'No safe SASL mechanism is available for this connection');
      }
      await authenticate({ username: options.username, password: options.password }, mechanism);
    };
    this.entity = client({
      service: options.service,
      domain: this.options.domain,
      resource: this.options.resource,
      username: options.username,
      password: options.password,
      credentials,
      timeout: this.options.timeout,
    });
    const reconnect = this.entity.reconnect.reconnect.bind(this.entity.reconnect);
    this.entity.reconnect.reconnect = () => tlsOptionsContext.run(this.tlsOptions, reconnect);
    if (options.startTlsPolicy === 'disabled') {
      this.entity.prependListener('element', (stanza) => {
        if (!stanza.is('features', 'http://etherx.jabber.org/streams')) return;
        stanza.children = stanza.children.filter(
          (child) => !child.is?.('starttls', XMPP_NS.TLS),
        );
      });
    }
    this.joinedRooms = new Map();
    this.waiters = new Set();
    this.onlineCount = 0;
    this.entity.on('error', (error) => this.emit('error', error));
    this.entity.on('status', (status) => this.emit('status', status));
    this.entity.on('stanza', (stanza) => this._onStanza(stanza));
    this.entity.on('online', async (address) => {
      this.address = address;
      this.onlineCount += 1;
      this.emit('online', address);
      if (this.onlineCount > 1) {
        try {
          for (const [room, details] of this.joinedRooms) {
            await this._sendJoin(room, details.nickname, details.password);
          }
          this.emit('reconnected', address);
        } catch (error) {
          this.emit('error', error);
        }
      }
    });
    this.entity.on('offline', () => this.emit('offline'));
    this.entity.reconnect.on('reconnecting', () => this.emit('reconnecting'));
  }

  async connect() {
    await installXmppTlsSocketOverride();
    return tlsOptionsContext.run(this.tlsOptions, () => this.entity.start());
  }

  async close() {
    this.joinedRooms.clear();
    this.entity.reconnect.stop();
    if (!['online', 'offline'].includes(this.entity.status)) {
      this._forceCloseSocket();
      return;
    }
    await this.entity.stop();
  }

  abort() {
    this.joinedRooms.clear();
    this.entity.reconnect.stop();
    this._forceCloseSocket();
  }

  _forceCloseSocket() {
    const socket = this.entity.socket;
    if (!socket || socket.destroyed) return;
    if (typeof socket.resetAndDestroy === 'function') socket.resetAndDestroy();
    else socket.destroy();
  }

  async disconnectForReconnect() {
    await tlsOptionsContext.run(this.tlsOptions, () => this.entity.disconnect());
  }

  isOnline() {
    return this.entity.status === 'online';
  }

  isSecure() {
    return this.entity.isSecure();
  }

  get jid() {
    return this.address?.toString() || null;
  }

  async sendChat(to, body) {
    await this.entity.send(xml('message', { type: 'chat', to }, xml('body', {}, body)));
  }

  async joinMuc(room, nickname, password) {
    const waiter = this._createStanzaWaiter((stanza) => stanza.name === 'presence' &&
      stanza.attrs.from === `${room}/${nickname}` &&
      (stanza.attrs.type === 'error' ||
       stanza.getChild('x', XMPP_NS.MUC_USER)
         ?.getChildren('status')
         .some((status) => status.attrs.code === '110')));
    try {
      await this._sendJoin(room, nickname, password);
    } catch (error) {
      waiter.cancel();
      throw error;
    }
    const presence = await waiter.promise;
    if (presence.attrs.type === 'error') {
      const stanzaError = presence.getChild('error');
      const condition = stanzaError
        ?.children
        .find((child) => child.attrs?.xmlns === XMPP_NS.STANZA_ERROR && child.name !== 'text')
        ?.name || 'undefined-condition';
      const error = new Error(`MUC join failed for ${room}/${nickname}: ${condition}`);
      error.condition = condition;
      error.stanza = presence;
      throw error;
    }
    this.joinedRooms.set(room, { nickname, password });
    return presence;
  }

  async _sendJoin(room, nickname, password) {
    const children = [
      xml('history', { maxstanzas: '0' }),
      ...(password ? [xml('password', {}, password)] : []),
    ];
    await this.entity.send(xml('presence', { to: `${room}/${nickname}` },
      xml('x', { xmlns: XMPP_NS.MUC }, children)));
  }

  async sendMuc(room, body) {
    await this.entity.send(xml('message', { type: 'groupchat', to: room }, xml('body', {}, body)));
  }

  async leaveMuc(room) {
    const details = this.joinedRooms.get(room);
    if (!details) return;
    this.joinedRooms.delete(room);
    await this.entity.send(xml('presence', {
      to: `${room}/${details.nickname}`,
      type: 'unavailable',
    }));
  }

  async ping(to = this.options.domain) {
    return this.entity.iqCaller.request(xml('iq', { type: 'get', to },
      xml('ping', { xmlns: 'urn:xmpp:ping' })), this.options.replyTimeout);
  }

  waitFor(predicate, timeout = this.options.replyTimeout) {
    return this._createStanzaWaiter(predicate, timeout).promise;
  }

  _createStanzaWaiter(predicate, timeout = this.options.replyTimeout) {
    let waiter;
    return createCancellableWaiter({
      timeout,
      timeoutMessage: 'Timed out waiting for XMPP stanza',
      subscribe: (resolve) => {
        waiter = { predicate, resolve };
        this.waiters.add(waiter);
        return () => this.waiters.delete(waiter);
      },
    });
  }

  waitForNonza(predicate, timeout = this.options.replyTimeout) {
    return this._createNonzaWaiter(predicate, timeout).promise;
  }

  _createNonzaWaiter(predicate, timeout = this.options.replyTimeout) {
    return createCancellableWaiter({
      timeout,
      timeoutMessage: 'Timed out waiting for XMPP nonza',
      subscribe: (resolve) => {
        const onNonza = (element) => {
          if (!predicate(element)) return;
          resolve(element);
        };
        this.entity.on('nonza', onNonza);
        return () => this.entity.removeListener('nonza', onNonza);
      },
    });
  }

  async requestServerAck() {
    const waiter = this._createNonzaWaiter((element) => element.is('a', XMPP_NS.SM));
    try {
      await this.entity.send(xml('r', { xmlns: XMPP_NS.SM }));
    } catch (error) {
      waiter.cancel();
      throw error;
    }
    return waiter.promise;
  }

  _onStanza(stanza) {
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(stanza)) continue;
      waiter.resolve(stanza);
    }
    this.emit('stanza', stanza);
    if (stanza.name === 'message') {
      const body = stanza.getChildText('body');
      if (stanza.attrs.type === 'groupchat') {
        const slash = stanza.attrs.from?.indexOf('/') ?? -1;
        this.emit('mucMessage', {
          room: slash < 0 ? stanza.attrs.from : stanza.attrs.from.slice(0, slash),
          nickname: slash < 0 ? null : stanza.attrs.from.slice(slash + 1),
          body,
          self: slash >= 0 && this.joinedRooms.get(stanza.attrs.from.slice(0, slash))?.nickname ===
            stanza.attrs.from.slice(slash + 1),
          stanza,
        });
      } else if (stanza.attrs.type === 'chat') {
        this.emit('chat', { from: stanza.attrs.from, to: stanza.attrs.to, body, stanza });
      }
    }
  }
}

module.exports = {
  XmppClientCore,
  isLoopback: isLoopbackHost,
};
