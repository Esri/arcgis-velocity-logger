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
 * @file xmpp-muc.js
 * @description
 * Multi-User Chat (XEP-0045) room registry for the XMPP feasibility spike.
 *
 * Scope is deliberately narrow — exactly what the Simulator and Logger need to
 * publish to, and read from, a room:
 *   - join with a room nickname and an optional room password
 *   - `groupchat` broadcast, including the self-echo back to the sender
 *   - leave
 *   - implicit leave when a stream disconnects
 *
 * Explicitly NOT implemented: history/archive storage, subject changes,
 * affiliation and role administration, invitations, room configuration forms,
 * moderation, and room persistence. `<history/>` requests are parsed but the
 * service never stores nor replays messages, so `maxstanzas='0'` and the
 * default behavior are identical.
 *
 * This module holds no sockets and performs no I/O; `xmpp-server-core.js` turns the
 * returned descriptors into presence and message stanzas.
 */

const { timingSafeEqualString } = require('./xmpp-utils');

/** Stanza error descriptors returned to the stream layer on a failed join. */
const MUC_ERRORS = Object.freeze({
  NOT_AUTHORIZED: Object.freeze({ type: 'auth', condition: 'not-authorized', code: '401' }),
  CONFLICT: Object.freeze({ type: 'cancel', condition: 'conflict', code: '409' }),
  ITEM_NOT_FOUND: Object.freeze({ type: 'cancel', condition: 'item-not-found', code: '404' }),
  JID_MALFORMED: Object.freeze({ type: 'modify', condition: 'jid-malformed', code: '400' }),
  SERVICE_UNAVAILABLE: Object.freeze({ type: 'cancel', condition: 'service-unavailable', code: '503' }),
});

/**
 * Creates the MUC service.
 *
 * @param {object} opts
 * @param {string} opts.mucDomain - e.g. `conference.localhost`
 * @param {boolean} [opts.autoCreate=true] - Create rooms on first join.
 * @param {Array<{jid?: string, name?: string, password?: string}>} [opts.rooms]
 *        Pre-configured rooms. A room listed here with a password requires it.
 */
function createMucService({ mucDomain, autoCreate = true, rooms = [] } = {}) {
  if (!mucDomain) throw new Error('createMucService requires a mucDomain');

  /** @type {Map<string, {jid: string, password: string|null, persistent: boolean, occupants: Map<string, object>}>} */
  const roomMap = new Map();

  function normalizeRoomJid(value) {
    if (!value) return null;
    const bare = String(value).split('/')[0].toLowerCase();
    if (!bare.includes('@')) return null;
    return bare;
  }

  function createRoom(roomJid, { password = null, persistent = false } = {}) {
    const room = { jid: roomJid, password: password || null, persistent, occupants: new Map() };
    roomMap.set(roomJid, room);
    return room;
  }

  for (const configured of rooms) {
    const roomJid = normalizeRoomJid(
      configured.jid || (configured.name ? `${configured.name}@${mucDomain}` : null),
    );
    if (!roomJid) throw new Error(`Invalid pre-configured MUC room: ${JSON.stringify(configured)}`);
    createRoom(roomJid, { password: configured.password || null, persistent: true });
  }

  /** Removes a room once it is empty and was not pre-configured. */
  function reapRoom(room) {
    if (!room.persistent && room.occupants.size === 0) roomMap.delete(room.jid);
  }

  return {
    mucDomain,

    /** @returns {boolean} whether the JID's domain is this MUC service */
    isMucJid(value) {
      if (!value) return false;
      const domain = String(value).split('/')[0].split('@').pop();
      return domain.toLowerCase() === mucDomain.toLowerCase();
    },

    normalizeRoomJid,

    /** @returns {string[]} currently existing room JIDs */
    listRooms() {
      return [...roomMap.keys()];
    },

    /** @returns {object|null} */
    getRoom(roomJid) {
      return roomMap.get(normalizeRoomJid(roomJid)) || null;
    },

    /** @returns {Array<object>} shallow copies of the room's occupants */
    getOccupants(roomJid) {
      const room = roomMap.get(normalizeRoomJid(roomJid));
      if (!room) return [];
      return [...room.occupants.values()].map((o) => ({ ...o }));
    },

    /**
     * Joins a room, creating it when allowed.
     *
     * @param {object} req
     * @param {string} req.roomJid
     * @param {string} req.nick
     * @param {string} [req.password]
     * @param {string} req.sessionId
     * @param {string} req.fullJid
     * @returns {object} `{ ok: true, room, created, nick, existingOccupants, self }`
     *                   or `{ ok: false, error }`
     */
    join({ roomJid, nick, password, sessionId, fullJid }) {
      const normalized = normalizeRoomJid(roomJid);
      if (!normalized) return { ok: false, error: MUC_ERRORS.JID_MALFORMED };
      if (!nick) return { ok: false, error: MUC_ERRORS.JID_MALFORMED };

      let room = roomMap.get(normalized);
      let created = false;
      if (!room) {
        if (!autoCreate) return { ok: false, error: MUC_ERRORS.ITEM_NOT_FOUND };
        room = createRoom(normalized);
        created = true;
      }

      if (room.password && !timingSafeEqualString(room.password, String(password || ''))) {
        if (created) roomMap.delete(normalized);
        return { ok: false, error: MUC_ERRORS.NOT_AUTHORIZED };
      }

      const existing = room.occupants.get(nick);
      if (existing && existing.sessionId !== sessionId) {
        if (created) roomMap.delete(normalized);
        return { ok: false, error: MUC_ERRORS.CONFLICT };
      }

      // A session may only hold one nickname per room in the spike.
      for (const [otherNick, occupant] of room.occupants) {
        if (occupant.sessionId === sessionId && otherNick !== nick) {
          room.occupants.delete(otherNick);
        }
      }

      const existingOccupants = [...room.occupants.values()]
        .filter((o) => o.nick !== nick)
        .map((o) => ({ ...o }));

      const self = {
        nick,
        sessionId,
        fullJid,
        occupantJid: `${normalized}/${nick}`,
        affiliation: created ? 'owner' : 'member',
        role: created ? 'moderator' : 'participant',
      };
      room.occupants.set(nick, self);

      return { ok: true, room, created, nick, existingOccupants, self: { ...self } };
    },

    /**
     * Leaves a room.
     *
     * @param {object} req
     * @param {string} req.roomJid
     * @param {string} req.sessionId
     * @param {string} [req.nick] - Optional; resolved from the session when absent.
     * @returns {object} `{ ok: true, roomJid, nick, self, remaining }` or `{ ok: false, error }`
     */
    leave({ roomJid, sessionId, nick }) {
      const normalized = normalizeRoomJid(roomJid);
      const room = normalized ? roomMap.get(normalized) : null;
      if (!room) return { ok: false, error: MUC_ERRORS.ITEM_NOT_FOUND };

      let resolvedNick = nick;
      if (!resolvedNick || room.occupants.get(resolvedNick)?.sessionId !== sessionId) {
        resolvedNick = null;
        for (const [candidate, occupant] of room.occupants) {
          if (occupant.sessionId === sessionId) {
            resolvedNick = candidate;
            break;
          }
        }
      }
      if (!resolvedNick) return { ok: false, error: MUC_ERRORS.ITEM_NOT_FOUND };

      const self = room.occupants.get(resolvedNick);
      room.occupants.delete(resolvedNick);
      const remaining = [...room.occupants.values()].map((o) => ({ ...o }));
      reapRoom(room);
      return { ok: true, roomJid: normalized, nick: resolvedNick, self: { ...self }, remaining };
    },

    /**
     * Resolves the sender's occupant record and the recipient list for a
     * `groupchat` message. The sender is included so the room echoes the
     * message back — that echo is how a client identifies its own messages.
     *
     * @param {object} req
     * @param {string} req.roomJid
     * @param {string} req.sessionId
     * @returns {object} `{ ok: true, roomJid, sender, recipients }` or `{ ok: false, error }`
     */
    resolveBroadcast({ roomJid, sessionId }) {
      const normalized = normalizeRoomJid(roomJid);
      const room = normalized ? roomMap.get(normalized) : null;
      if (!room) return { ok: false, error: MUC_ERRORS.ITEM_NOT_FOUND };

      const sender = [...room.occupants.values()].find((o) => o.sessionId === sessionId);
      if (!sender) return { ok: false, error: MUC_ERRORS.NOT_AUTHORIZED };

      return {
        ok: true,
        roomJid: normalized,
        sender: { ...sender },
        recipients: [...room.occupants.values()].map((o) => ({ ...o })),
      };
    },

    /**
     * Removes a disconnected session from every room it occupied.
     *
     * @param {string} sessionId
     * @returns {Array<{roomJid: string, nick: string, self: object, remaining: object[]}>}
     */
    removeSession(sessionId) {
      const departures = [];
      for (const room of [...roomMap.values()]) {
        for (const [nick, occupant] of [...room.occupants]) {
          if (occupant.sessionId !== sessionId) continue;
          room.occupants.delete(nick);
          departures.push({
            roomJid: room.jid,
            nick,
            self: { ...occupant },
            remaining: [...room.occupants.values()].map((o) => ({ ...o })),
          });
        }
        reapRoom(room);
      }
      return departures;
    },

    /** Diagnostics snapshot — contains no passwords. */
    describe() {
      return {
        mucDomain,
        autoCreate,
        rooms: [...roomMap.values()].map((room) => ({
          jid: room.jid,
          persistent: room.persistent,
          passwordProtected: Boolean(room.password),
          occupants: [...room.occupants.keys()],
        })),
      };
    },
  };
}

module.exports = {
  MUC_ERRORS,
  createMucService,
};
