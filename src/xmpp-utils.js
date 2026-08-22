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

/**
 * @file xmpp-utils.js
 * @description
 * Shared helpers for secret handling, loopback detection, identifiers, input
 * validation, and authentication rate limiting.
 *
 * Kept in one place so the server, the client wrapper and the MUC service never
 * duplicate the same logic (see the DRY guidance in AGENTS.md).
 */

const crypto = require('crypto');
const { jid } = require('@xmpp/jid');

/**
 * Replaces a secret with a non-reversible marker so it can be mentioned in logs
 * without ever disclosing its value. Only the byte length is revealed.
 *
 * @param {string|Buffer|null|undefined} secret
 * @returns {string}
 */
function redactSecret(secret) {
  if (secret === null || secret === undefined || secret === '') return '<empty>';
  const length = Buffer.byteLength(String(secret), 'utf8');
  return `<redacted:${length}B>`;
}

/**
 * True when the host is a loopback address or `localhost`. Used to keep the
 * spike server loopback-only by default and to gate the local-testing TLS
 * verification bypass.
 *
 * @param {string} host
 * @returns {boolean}
 */
function isLoopbackHost(host) {
  if (!host) return false;
  const normalized = String(host).trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost') return true;
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (normalized === '::ffff:127.0.0.1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
}

/**
 * Generates a short, collision-resistant stanza/stream identifier.
 *
 * @param {string} [prefix]
 * @returns {string}
 */
function randomStanzaId(prefix = 'x') {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Constant-time comparison of two UTF-8 strings. Used for password and SCRAM
 * proof comparisons so authentication does not leak timing information.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Constant-time comparison of two buffers of possibly different lengths.
 *
 * @param {Buffer} a
 * @param {Buffer} b
 * @returns {boolean}
 */
function timingSafeEqualBuffer(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function canonicalizeUsername(value, domain = 'localhost') {
  const username = String(value || '');
  if (!username) throw new Error('XMPP username is required');
  return jid(username, domain).local;
}

function canonicalizeDomain(value) {
  const domain = String(value || '');
  if (!domain) throw new Error('XMPP domain is required');
  return jid(null, domain).domain;
}

/**
 * Sanitizes a requested XMPP resource part: control characters, `/` and `@`
 * are removed and the result is length capped. Returns null when nothing
 * usable remains, in which case the server assigns a resource.
 *
 * @param {string} value
 * @returns {string|null}
 */
function sanitizeResource(value) {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F/@]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 128);
}

/**
 * Decodes the text content of a SASL `<auth/>`, `<challenge/>`, `<response/>`
 * or `<success/>` element. Per RFC 6120 a lone `=` denotes an empty payload.
 *
 * @param {string} text
 * @returns {string}
 */
function decodeSaslPayload(text) {
  const raw = (text || '').trim();
  if (raw === '' || raw === '=') return '';
  if (raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) {
    throw new Error('Invalid base64 SASL payload');
  }
  return Buffer.from(raw, 'base64').toString('utf8');
}

/**
 * Sliding-window attempt counter keyed by an arbitrary string (the remote
 * address, in practice). Provisional charges can be refunded after success.
 *
 * @param {object} opts
 * @param {number} opts.windowMs
 * @param {number} opts.maxFailures
 */
function createRateLimiter({ windowMs, maxFailures }) {
  const buckets = new Map();

  function prune(key, now) {
    const entries = buckets.get(key);
    if (!entries) return [];
    const kept = entries.filter((entry) => now - entry.timestamp < windowMs);
    if (kept.length === 0) buckets.delete(key);
    else buckets.set(key, kept);
    return kept;
  }

  return {
    /** @returns {boolean} true when the key has exceeded its failure budget */
    isLimited(key, now = Date.now()) {
      return prune(key, now).length >= maxFailures;
    },
    /** Records one failure and returns the current failure count in-window. */
    recordFailure(key, now = Date.now()) {
      const kept = prune(key, now);
      kept.push({ timestamp: now, token: null });
      buckets.set(key, kept);
      return kept.length;
    },
    /**
     * Atomically reserves one attempt before expensive authentication work.
     * Returns an opaque token, or null when the budget is already exhausted.
     */
    charge(key, now = Date.now()) {
      const kept = prune(key, now);
      if (kept.length >= maxFailures) return null;
      const token = Symbol('rate-limit-charge');
      kept.push({ timestamp: now, token });
      buckets.set(key, kept);
      return token;
    },
    /** Removes exactly one successful attempt's provisional charge. */
    refund(key, token, now = Date.now()) {
      if (!token) return false;
      const kept = prune(key, now);
      const index = kept.findIndex((entry) => entry.token === token);
      if (index < 0) return false;
      kept.splice(index, 1);
      if (kept.length === 0) buckets.delete(key);
      else buckets.set(key, kept);
      return true;
    },
    /** Administratively clears the history for a key. */
    reset(key) {
      buckets.delete(key);
    },
    /** Clears all history — used for deterministic tests. */
    clear() {
      buckets.clear();
    },
    get size() {
      return buckets.size;
    },
  };
}

module.exports = {
  redactSecret,
  isLoopbackHost,
  randomStanzaId,
  timingSafeEqualString,
  timingSafeEqualBuffer,
  canonicalizeUsername,
  canonicalizeDomain,
  sanitizeResource,
  decodeSaslPayload,
  createRateLimiter,
};
