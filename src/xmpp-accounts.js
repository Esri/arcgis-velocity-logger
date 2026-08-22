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
 * @file xmpp-accounts.js
 * @description
 * Minimal in-memory account store for the XMPP feasibility spike.
 *
 * The spike deliberately supports exactly two identities and nothing else — no
 * registration, no roster, no persistence:
 *
 *   1. **Internal app identity** — the account the Simulator/Logger themselves
 *      use. Its password is generated with `crypto.randomBytes` when not
 *      supplied and is never written to a log.
 *   2. **One configurable external account** — the single third-party account
 *      an integrator points at the server (or that the app uses against a real
 *      server). Configurable in code or via environment variables.
 *
 * Passwords are held in memory in cleartext because SCRAM-SHA-1 needs the
 * original password to derive the salted key. This is limited to the loopback
 * feasibility core; a production deployment would store SCRAM salted keys
 * instead.
 */

const crypto = require('crypto');
const { canonicalizeUsername, redactSecret, timingSafeEqualString } = require('./xmpp-utils');

/** Username of the built-in application identity. */
const INTERNAL_APP_USERNAME = 'velocity-logger';

/** Environment variables that configure the single external account. */
const EXTERNAL_ACCOUNT_ENV = Object.freeze({
  USERNAME: 'XMPP_EXTERNAL_USERNAME',
  PASSWORD: 'XMPP_EXTERNAL_PASSWORD',
});

/**
 * Reads the external account from the environment.
 *
 * @param {object} [env=process.env]
 * @returns {{username: string, password: string}|null}
 */
function readExternalAccountFromEnv(env = process.env) {
  const username = env[EXTERNAL_ACCOUNT_ENV.USERNAME];
  const password = env[EXTERNAL_ACCOUNT_ENV.PASSWORD];
  // An empty password is a deliberate relaxed-testing value; only a missing
  // (unset or non-string) password disables the environment account.
  if (!username || typeof password !== 'string') return null;
  return { username: String(username), password };
}

/**
 * Creates the account store.
 *
 * @param {object} opts
 * @param {string} opts.domain - Served XMPP domain, e.g. `localhost`.
 * @param {string} [opts.internalAppUsername=INTERNAL_APP_USERNAME]
 * @param {string} [opts.internalAppPassword] - Generated when omitted.
 * @param {{username: string, password: string}|null} [opts.externalAccount]
 *        The single configurable external account. Falls back to the
 *        environment variables when omitted. The password may be an empty
 *        string for relaxed local testing, but it must be present.
 * @param {object} [opts.env=process.env]
 */
function createAccountStore({
  domain,
  internalAppUsername = INTERNAL_APP_USERNAME,
  internalAppPassword,
  externalAccount,
  env = process.env,
} = {}) {
  if (!domain) throw new Error('createAccountStore requires a domain');

  const accounts = new Map();
  const canonicalInternalUsername = canonicalizeUsername(internalAppUsername, domain);
  const lookupAccount = (username) => {
    try {
      return accounts.get(canonicalizeUsername(username, domain)) || null;
    } catch (_) {
      return null;
    }
  };

  const internalPassword = internalAppPassword || crypto.randomBytes(24).toString('base64url');
  accounts.set(canonicalInternalUsername, {
    username: canonicalInternalUsername,
    password: internalPassword,
    kind: 'internal',
  });

  const resolvedExternal =
    externalAccount === null ? null : externalAccount || readExternalAccountFromEnv(env);

  if (resolvedExternal) {
    if (!resolvedExternal.username || typeof resolvedExternal.password !== 'string') {
      throw new Error('External XMPP account requires a username and a password; the password may be empty');
    }
    const canonicalExternalUsername = canonicalizeUsername(resolvedExternal.username, domain);
    if (canonicalExternalUsername === canonicalInternalUsername) {
      throw new Error('External XMPP account username must differ from the internal app identity');
    }
    accounts.set(canonicalExternalUsername, {
      username: canonicalExternalUsername,
      password: String(resolvedExternal.password),
      kind: 'external',
    });
  }

  return {
    domain,

    /** @returns {boolean} whether the username is known to the store */
    has(username) {
      return Boolean(lookupAccount(username));
    },

    /**
     * Returns the cleartext password for a username, or null. Only the SASL
     * layer may call this; the value must never be logged.
     *
     * @param {string} username
     * @returns {string|null}
     */
    getPassword(username) {
      const account = lookupAccount(username);
      return account ? account.password : null;
    },

    /**
     * Verifies a username/password pair in constant time. Unknown usernames are
     * compared against a dummy value so the response time does not disclose
     * account existence.
     *
     * @param {string} username
     * @param {string} password
     * @returns {boolean}
     */
    verifyPassword(username, password) {
      const account = lookupAccount(username);
      if (!account) {
        timingSafeEqualString(String(password || ''), 'invalid-account-placeholder');
        return false;
      }
      return timingSafeEqualString(account.password, String(password || ''));
    },

    /** @returns {{username: string, password: string, jid: string}} */
    getInternalCredentials() {
      const account = accounts.get(canonicalInternalUsername);
      return {
        username: account.username,
        password: account.password,
        jid: `${account.username}@${domain}`,
      };
    },

    /** @returns {{username: string, password: string, jid: string}|null} */
    getExternalCredentials() {
      if (!resolvedExternal) return null;
      const account = accounts.get(canonicalizeUsername(resolvedExternal.username, domain));
      return {
        username: account.username,
        password: account.password,
        jid: `${account.username}@${domain}`,
      };
    },

    /** @returns {string[]} usernames, for diagnostics */
    listUsernames() {
      return [...accounts.keys()];
    },

    canonicalizeUsername(username) {
      return canonicalizeUsername(username, domain);
    },

    /**
     * Log-safe description of the store. Passwords are redacted to a length
     * marker and never emitted verbatim.
     *
     * @returns {object}
     */
    describe() {
      return {
        domain,
        internal: {
          username: canonicalInternalUsername,
          password: redactSecret(internalPassword),
        },
        external: resolvedExternal
          ? {
            username: canonicalizeUsername(resolvedExternal.username, domain),
            password: redactSecret(resolvedExternal.password),
          }
          : null,
        accountCount: accounts.size,
      };
    },
  };
}

module.exports = {
  INTERNAL_APP_USERNAME,
  EXTERNAL_ACCOUNT_ENV,
  readExternalAccountFromEnv,
  createAccountStore,
};
