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
 * @file xmpp-constants.js
 * @description
 * Shared XMPP protocol constants for the ArcGIS Velocity Logger.
 */

/**
 * XML namespaces used by the spike. Only the namespaces actually implemented
 * are listed — the spike deliberately makes no broader XEP claims.
 */
const XMPP_NS = Object.freeze({
  STREAM: 'http://etherx.jabber.org/streams',
  CLIENT: 'jabber:client',
  STREAM_ERROR: 'urn:ietf:params:xml:ns:xmpp-streams',
  STANZA_ERROR: 'urn:ietf:params:xml:ns:xmpp-stanzas',
  TLS: 'urn:ietf:params:xml:ns:xmpp-tls',
  SASL: 'urn:ietf:params:xml:ns:xmpp-sasl',
  BIND: 'urn:ietf:params:xml:ns:xmpp-bind',
  SM: 'urn:xmpp:sm:3',
  PING: 'urn:xmpp:ping',
  MUC: 'http://jabber.org/protocol/muc',
  MUC_USER: 'http://jabber.org/protocol/muc#user',
});

/** Default client-to-server port (RFC 6120). */
const XMPP_DEFAULT_C2S_PORT = 5222;

/**
 * Loopback-safe default bind address. The spike server refuses to bind a
 * non-loopback interface unless the caller explicitly opts in.
 */
const XMPP_DEFAULT_BIND_HOST = '127.0.0.1';

/** Default served domain and MUC sub-domain. */
const XMPP_DEFAULT_DOMAIN = 'localhost';
const XMPP_DEFAULT_MUC_SUBDOMAIN = 'conference';

/** STARTTLS negotiation policies advertised by the server. */
const STARTTLS_POLICIES = Object.freeze({
  REQUIRED: 'required',
  PREFERRED: 'preferred',
  DISABLED: 'disabled',
});
const VALID_STARTTLS_POLICIES = Object.freeze(new Set(Object.values(STARTTLS_POLICIES)));

/** Behavior when a resource binds over an already-bound identical full JID. */
const RESOURCE_CONFLICT_POLICIES = Object.freeze({
  /** Close the older stream with a `<conflict/>` stream error (RFC 6120 default). */
  REPLACE: 'replace',
  /** Reject the new bind request with a `<conflict/>` stanza error. */
  REJECT: 'reject',
});
const VALID_RESOURCE_CONFLICT_POLICIES = Object.freeze(
  new Set(Object.values(RESOURCE_CONFLICT_POLICIES)),
);

/** SASL mechanisms implemented server-side. */
const SASL_MECHANISMS = Object.freeze({
  PLAIN: 'PLAIN',
  SCRAM_SHA_1: 'SCRAM-SHA-1',
});
const VALID_SASL_MECHANISMS = Object.freeze(new Set(Object.values(SASL_MECHANISMS)));
const DEFAULT_SASL_MECHANISMS = Object.freeze([
  SASL_MECHANISMS.SCRAM_SHA_1,
  SASL_MECHANISMS.PLAIN,
]);

/** SCRAM-SHA-1 salting parameters (RFC 5802). */
const SCRAM_SHA_1_ITERATIONS = 4096;
const SCRAM_SHA_1_SALT_BYTES = 16;

/**
 * Bounds and rate limits. The stanza cap is evaluated after every socket chunk
 * against the number of bytes received since the last complete top-level
 * element, so an oversized stanza may exceed the cap by at most one socket
 * chunk before the stream is terminated.
 */
const DEFAULT_MAX_STANZA_BYTES = 64 * 1024;
const DEFAULT_MAX_AUTH_ATTEMPTS_PER_CONNECTION = 3;
const DEFAULT_AUTH_RATE_LIMIT = Object.freeze({
  windowMs: 60_000,
  maxFailures: 10,
});

/** Client lifecycle defaults (milliseconds). */
const DEFAULT_CLIENT_TIMEOUT_MS = 30_000;
const DEFAULT_REPLY_TIMEOUT_MS = 15_000;
const DEFAULT_PING_INTERVAL_MS = 60_000;
const DEFAULT_RECONNECT_DELAY_MS = 60_000;

/**
 * Exactly what XEP-0198 support was implemented and verified in phase 1.
 * Kept as data so tests and docs cannot drift from the implementation, and so
 * the spike never overstates its support.
 */
const STREAM_MANAGEMENT_SUPPORT = Object.freeze({
  namespace: XMPP_NS.SM,
  /** `<sm/>` is advertised after SASL, alongside `<bind/>`. */
  advertised: true,
  /** `<enable/>` → `<enabled resume='false'/>` is implemented. */
  enable: true,
  /** `<r/>` → `<a h='N'/>` in both directions is implemented. */
  ackRequests: true,
  /** Inbound/outbound stanza counters are maintained per stream. */
  counters: true,
  /** Stream resumption (`<resume/>` / `<resumed/>`) is NOT implemented. */
  resumption: false,
  /** Unacked outbound stanzas are NOT queued or replayed by the server. */
  outboundReplay: false,
  limitations: Object.freeze([
    'Resumption is not implemented; the server always answers <enabled resume="false"/>.',
    'The server does not queue or replay unacknowledged outbound stanzas after a disconnect.',
    'Acks are advisory only — they are counted and reported but never used to retransmit.',
  ]),
});

module.exports = {
  XMPP_NS,
  XMPP_DEFAULT_C2S_PORT,
  XMPP_DEFAULT_BIND_HOST,
  XMPP_DEFAULT_DOMAIN,
  XMPP_DEFAULT_MUC_SUBDOMAIN,
  STARTTLS_POLICIES,
  VALID_STARTTLS_POLICIES,
  RESOURCE_CONFLICT_POLICIES,
  VALID_RESOURCE_CONFLICT_POLICIES,
  SASL_MECHANISMS,
  VALID_SASL_MECHANISMS,
  DEFAULT_SASL_MECHANISMS,
  SCRAM_SHA_1_ITERATIONS,
  SCRAM_SHA_1_SALT_BYTES,
  DEFAULT_MAX_STANZA_BYTES,
  DEFAULT_MAX_AUTH_ATTEMPTS_PER_CONNECTION,
  DEFAULT_AUTH_RATE_LIMIT,
  DEFAULT_CLIENT_TIMEOUT_MS,
  DEFAULT_REPLY_TIMEOUT_MS,
  DEFAULT_PING_INTERVAL_MS,
  DEFAULT_RECONNECT_DELAY_MS,
  STREAM_MANAGEMENT_SUPPORT,
};
