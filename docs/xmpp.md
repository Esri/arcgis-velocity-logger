# XMPP transport

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

The ArcGIS Velocity Logger supports XMPP as a receive-oriented transport alongside TCP, UDP, HTTP, WebSocket, and gRPC. XMPP Server hosts a focused in-process client-to-server (C2S) service with one automatic Logger identity and one external account; XMPP Client connects to an existing XMPP service. Both modes receive direct chat or Multi-User Chat (MUC) message bodies — the Logger does not send outbound chat messages.

This guide is intended for users and developers connecting the Logger to an XMPP service, and assumes basic familiarity with XMPP concepts (JIDs, STARTTLS, resources, MUC rooms). For general TLS/certificate concepts shared across transports, see the [TLS guide](tls.md).

## Table of contents

- [Connection modes](#connection-modes)
- [Domain, host, and port](#domain-host-and-port)
- [TLS and STARTTLS](#tls-and-starttls)
- [Client account and local JID](#client-account-and-local-jid)
- [Server account](#server-account)
- [Applying an ArcGIS Velocity XMPP output](#applying-an-arcgis-velocity-xmpp-output)
- [Conversation: direct and MUC](#conversation-direct-and-muc)
- [Timing parameters](#timing-parameters)
- [Safety: unverified TLS and remote binding](#safety-unverified-tls-and-remote-binding)
- [UI controls](#ui-controls)
- [Tooltip reference](#tooltip-reference)
- [CLI parameters](#cli-parameters)
- [Metadata logging](#metadata-logging)
- [Launch configuration](#launch-configuration)
- [Protocol scope and limitations](#protocol-scope-and-limitations)
- [Related documentation](#related-documentation)

## Connection modes

| Mode | Description |
|------|-------------|
| XMPP Server | Starts a focused in-process C2S service with one automatic Logger identity and one external account. Receives direct or MUC message bodies from the external account. |
| XMPP Client | Connects to an existing XMPP service using a configured account. Receives direct or MUC message bodies. |

## Domain, host, and port

- **Domain** is the XMPP authentication domain (default `localhost`), separate from the network host override.
- **Host** is an optional network address override; when omitted, the domain is also used as the network address.
- **Port** defaults to `5222` (the RFC 6120 client-to-server port) when omitted, in both server and client mode.
- Server mode binds `127.0.0.1` by default; see [Safety: unverified TLS and remote binding](#safety-unverified-tls-and-remote-binding) to allow a non-loopback bind address.

## TLS and STARTTLS

XMPP negotiates TLS in-band with STARTTLS rather than the `useTls`/`tlsCaPath`/`tlsCertPath`/`tlsKeyPath` parameters shared by HTTP, WebSocket, and gRPC (documented in the [TLS guide](tls.md)). The STARTTLS policy is controlled by `xmppTlsPolicy`:

| Policy | Behavior |
|--------|----------|
| `required` (default) | Require STARTTLS and fail the connection if TLS is unavailable. |
| `preferred` | Use STARTTLS when offered, otherwise continue on an unsecure connection. |
| `disabled` | Disable STARTTLS and use an unsecure connection. |

- **Client mode**: Verifies the server certificate using the OS trust store, or a custom CA supplied via `xmppTlsCaPath`.
- **Server mode**: Accepts a custom certificate/key pair (`xmppTlsCertPath` / `xmppTlsKeyPath`), or generates an ephemeral self-signed certificate automatically when neither is supplied.
- **TLS trust badge**: `required` uses the configured secure styling, `preferred` uses a warning badge because encryption is opportunistic, and `disabled` is reported as unsecure. After an XMPP Client connects, the badge and message metadata report whether that live session actually established STARTTLS. XMPP Server message metadata reports the security of each sending client rather than assuming that server capability means every client is encrypted.

## Client account and local JID

Client mode authenticates with a full JID built from `xmppUsername@xmppDomain/xmppResource`:

| Field | Description |
|-------|-------------|
| `xmppUsername` | XMPP client account username. |
| `xmppPassword` | XMPP client account password. Never logged. |
| `xmppResource` | Resource appended to the authenticated JID (default `velocity-logger`). |
| `xmppLocalJid` | Optional bare local JID used to filter direct messages so only messages addressed to this JID are received. Omit to accept direct messages regardless of the `to` address. |

## Server account

Server mode always exposes one automatic Logger identity plus exactly one configurable external account:

| Field | Description |
|-------|-------------|
| `xmppExternalUsername` | Username for the single external account accepted by the server (default `velocity-client`). |
| `xmppExternalPassword` | Password for the external account. Never logged. |

While the server is listening, the panel displays its **Receiving JID** (normally `velocity-logger@<domain>`). This is the destination a direct-message sender must use.

The **Copy Client Settings** control is enabled only while XMPP Server is listening. It copies live, Simulator-compatible client JSON, including the actual bound port and the receiving JID under the canonical `xmppDestination` key. A wildcard bind such as `0.0.0.0` is copied as `127.0.0.1`, because a wildcard is not a connectable destination. The external password is excluded unless **Include password** is explicitly enabled; that checkbox resets after a successful copy.

## Applying an ArcGIS Velocity XMPP output

Applying an ArcGIS Velocity XMPP output selects XMPP Client, opens the XMPP options, and maps host, port, timing, room, and destination settings. For direct outputs, the Logger derives its receiving username and domain from the destination JID rather than reusing the ArcGIS Velocity sender account. ArcGIS Velocity conversation values `chat`, `normal`, and `direct` map to **Direct**; `groupchat`, `room`, and `muc` map to **MUC**.

ArcGIS Velocity does not return stored secrets. The Logger therefore clears account and room passwords, marks and focuses the first missing required field, and always prompts you to enter the required XMPP account credentials before connecting.

## Conversation: direct and MUC

`xmppConversation` selects between two receiving modes:

| Mode | Description |
|------|-------------|
| `direct` (default) | Receive direct chat messages, optionally filtered by `xmppLocalJid`. |
| `muc` | Join a Multi-User Chat room and receive message bodies posted to it. Requires `xmppRoom` (bare room JID) and `xmppNickname`. `xmppRoomPassword` is optional. |

In MUC mode, room history replay, bodyless stanzas (presence-only changes), and self-echoes (messages reflected back under the Logger's own nickname) are all ignored so only new messages from other participants are logged.

## Timing parameters

All timing parameters accept positive integer milliseconds:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `xmppConnectTimeoutMs` | `30000` | Stream connection, authentication, and resource-binding timeout. |
| `xmppReplyTimeoutMs` | `15000` | Timeout for stanza, IQ, room-join, and ping replies. |
| `xmppPingIntervalMs` | `60000` | Client-mode keepalive ping interval. |
| `xmppReconnectDelayMs` | `60000` | Delay before a client-mode session reconnects after an interruption. |

## Safety: unverified TLS and remote binding

Two safety switches are off by default and must be explicitly enabled:

| Field | Default | Purpose |
|-------|---------|---------|
| `xmppAllowUnverifiedTls` | `false` | Skips certificate verification, but only for an explicit loopback client connection — never for a remote host. |
| `xmppAllowRemote` | `false` | Allows the XMPP server to bind to a non-loopback interface. Leave disabled to keep the server reachable only from `127.0.0.1`. |

## UI controls

When XMPP Server or XMPP Client is selected as the connection type, the XMPP Options panel appears with the following controls (fields marked client-only or server-only appear only in the matching mode; MUC-only fields appear only when Conversation is set to MUC):

- **Domain** - XMPP authentication domain (default `localhost`).
- **TLS** - STARTTLS policy: `Required` (default), `Preferred`, or `Disabled`.
- **Conversation** - `Direct` (default) or `MUC`.
- **Username** / **Password** / **Resource** / **Local JID** - client-only account fields.
- **External user** / **External password** - server-only account fields.
- **Room** / **Nickname** / **Room password** - MUC-only fields.
- **CA** - Custom CA certificate path; leave empty to use OS trust.
- **Certificate** / **Key** - server-only TLS certificate/key paths.
- **Allow unverified** - client-only checkbox; skips certificate verification for loopback only.
- **Allow remote** - server-only checkbox; permits the configured Host to bind outside loopback.
- **Connect ms** / **Reply ms** - connection and reply timeouts.
- **Ping ms** / **Reconnect ms** - client-only keepalive and reconnect timing.
- **Include password** - server-only checkbox controlling whether **Copy Client Settings** includes the external password.
- **Receiving JID** - live server identity to use as the Simulator's `xmppDestination`.
- **Copy Client Settings** - server-only action enabled while the server is listening.

## Tooltip reference

### Connection mode tooltips

| Mode | Tooltip |
|------|---------|
| XMPP Server | XMPP Server - starts the focused in-process client-to-server service and receives direct or room message bodies. |
| XMPP Client | XMPP Client - connects to an XMPP service and receives direct or Multi-User Chat message bodies. |

### Control tooltips

| Control | Tooltip |
|---------|---------|
| Domain | XMPP authentication domain, for example example.com |
| TLS — Required | XMPP TLS policy: Require STARTTLS and fail if TLS is unavailable |
| TLS — Preferred | XMPP TLS policy: Prefer STARTTLS, but allow an unsecure connection when TLS is unavailable |
| TLS — Disabled | XMPP TLS policy: Disable STARTTLS and use an unsecure connection |
| Conversation — Direct | XMPP conversation: Receive direct messages addressed to this Logger |
| Conversation — MUC | XMPP conversation: Join and receive messages from a Multi-User Chat room |
| Username | Account username used by XMPP client mode |
| Password | Account password used by XMPP client mode; never logged |
| Resource | Resource appended to the authenticated XMPP JID |
| Local JID | Optional bare local JID used to filter direct messages |
| External user | Username for the one external account accepted by server mode |
| External password | Password for the external XMPP account; never logged or copied by default |
| Room | Bare room JID used in Multi-User Chat mode |
| Nickname | Nickname used in the room; messages echoed from this nickname are ignored |
| Room password | Optional Multi-User Chat room password; never logged |
| CA | Custom CA certificate path; leave empty to use the operating system trust store |
| Certificate | Optional server certificate path; an ephemeral self-signed certificate is generated when omitted |
| Key | Private key path corresponding to the custom server certificate |
| Allow unverified | Skip certificate verification only when connecting to localhost or a loopback address |
| Allow remote | Permit the configured Host to bind outside loopback; wildcard binds are copied as a connectable loopback host |
| Connect ms | Timeout for stream connection, authentication, and resource binding |
| Reply ms | Timeout for stanza, IQ, room join, and ping replies |
| Ping ms | Positive keepalive ping interval in milliseconds |
| Reconnect ms | Delay before reconnecting an interrupted session |
| Include password | Include the external account password when copying client settings; disabled by default |
| Copy Client Settings | Copy live Simulator client settings as JSON; password is excluded unless explicitly enabled |

## CLI parameters

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `protocol` | `xmpp` | `protocol=xmpp` | Selects the XMPP transport. Defaults to server mode when selected. |
| `xmppDomain` | XMPP domain | `xmppDomain=example.com` | XMPP service domain, separate from the top-level `ip` network host override. |
| `xmppUsername` | string | `xmppUsername=logger` | XMPP client account username. |
| `xmppPassword` | secret | `xmppPassword=secret` | XMPP client password; never written to logs or metadata. |
| `xmppResource` | string | `xmppResource=velocity-logger` | Resource appended to the authenticated XMPP JID. |
| `xmppLocalJid` | bare JID \| omitted | `xmppLocalJid=logger@example.com` | Optional local bare JID used to filter direct messages. |
| `xmppExternalUsername` | string | `xmppExternalUsername=velocity` | External account accepted by XMPP server mode. |
| `xmppExternalPassword` | secret | `xmppExternalPassword=secret` | External account password; never logged. |
| `xmppTlsPolicy` | `required` \| `preferred` \| `disabled` | `xmppTlsPolicy=required` | STARTTLS policy. Required is the secure default. |
| `xmppTlsCaPath` | PEM path \| omitted | `xmppTlsCaPath=./ca.pem` | Custom CA certificate path; OS trust is used when omitted. |
| `xmppTlsCertPath` | PEM path \| omitted | `xmppTlsCertPath=./server.pem` | Server certificate path; an ephemeral self-signed certificate is automatic when omitted. |
| `xmppTlsKeyPath` | PEM path \| omitted | `xmppTlsKeyPath=./server-key.pem` | Private key corresponding to `xmppTlsCertPath`. |
| `xmppAllowUnverifiedTls` | `true` \| `false` | `xmppAllowUnverifiedTls=true` | Explicitly skip verification for loopback client connections only. |
| `xmppAllowRemote` | `true` \| `false` | `xmppAllowRemote=true` | Allow XMPP server binding outside loopback. |
| `xmppConversation` | `direct` \| `muc` | `xmppConversation=muc` | Receive direct chat or Multi-User Chat messages. |
| `xmppRoom` | bare room JID \| omitted | `xmppRoom=events@conference.example.com` | Room JID used in MUC mode. |
| `xmppNickname` | string | `xmppNickname=logger` | MUC nickname; matching self-echoes are ignored. |
| `xmppRoomPassword` | secret \| omitted | `xmppRoomPassword=secret` | Optional MUC room password; never logged. |
| `xmppConnectTimeoutMs` | integer >= 1 | `xmppConnectTimeoutMs=30000` | XMPP stream connection and authentication timeout. |
| `xmppReplyTimeoutMs` | integer >= 1 | `xmppReplyTimeoutMs=15000` | Timeout for stanza, IQ, room join, and ping replies. |
| `xmppPingIntervalMs` | integer >= 1 | `xmppPingIntervalMs=60000` | XMPP keepalive ping interval. |
| `xmppReconnectDelayMs` | integer >= 1 | `xmppReconnectDelayMs=60000` | Delay before reconnecting an interrupted XMPP client session. |

`port` defaults to `5222` when omitted and `protocol=xmpp`. Client mode requires `xmppUsername` and `xmppPassword`; server mode requires `xmppExternalUsername` and `xmppExternalPassword`; MUC mode requires `xmppRoom` and `xmppNickname`. See the [Command-line reference](command-line.md) for the full parameter list across all transports.

## Metadata logging

When "Show Metadata" is enabled, XMPP connections log message metadata:

```text
[metadata] protocol=XMPP mode=server chatMode=direct from=velocity-client@localhost/external to=velocity-logger@localhost room= nickname= tls=on
```

For MUC messages, `room` and `nickname` are populated and `from` reflects the room-JID/nickname pair the message was received from.

## Launch configuration

XMPP parameters can be set in launch configuration JSON files. A ready-to-use
template is provided at
[`launch-config.xmpp.sample.json`](examples/launch-config.xmpp.sample.json):

```json
{
  "headless": {
    "runMode": "headless",
    "protocol": "xmpp",
    "mode": "server",
    "ip": "127.0.0.1",
    "port": 5222
  },
  "connection": {
    "xmppDomain": "localhost",
    "xmppExternalUsername": "velocity-client",
    "xmppExternalPassword": "",
    "xmppTlsPolicy": "required",
    "xmppAllowRemote": false,
    "xmppConversation": "direct",
    "xmppConnectTimeoutMs": 30000,
    "xmppReplyTimeoutMs": 15000,
    "xmppPingIntervalMs": 60000,
    "xmppReconnectDelayMs": 60000
  },
  "output": {
    "outputFile": "./captured-xmpp.log",
    "outputFormat": "text",
    "showMetadata": true
  }
}
```

See the [Headless mode guide](headless.md) for how to launch with a config template like this one.

## Protocol scope and limitations

The XMPP server implements a focused subset of RFC 6120 (Core), STARTTLS, SASL `PLAIN` and `SCRAM-SHA-1`, resource binding, and Multi-User Chat (XEP-0045) sufficient to receive direct and room messages from a single external account. It also advertises Stream Management (XEP-0198) with the following verified scope:

> [!NOTE]
> Stream Management support is intentionally partial: `<enable/>` and inbound/outbound stanza acknowledgement counters are implemented, but session **resumption is not implemented** — the server always answers `<enabled resume="false"/>` — and the server does **not** queue or replay unacknowledged outbound stanzas after a disconnect. Acknowledgements are advisory only.

Received message bodies are capped at 64 KB per stanza as a safety limit; oversized messages are rejected rather than truncated.

## Related documentation

- [TLS guide](tls.md)
- [Command-line reference](command-line.md)
- [Headless mode](headless.md)
- [Repository overview](../README.md)
