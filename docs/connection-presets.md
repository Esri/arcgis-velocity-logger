# Connection presets

Connection presets pre-fill the connection fields for a paired local test
between the ArcGIS Velocity Logger and the ArcGIS Velocity Simulator. The
**Preset** dropdown sits at the start of the connection row, ahead of
**Connection Type**.

## Table of contents

- [What a preset is](#what-a-preset-is)
- [The twelve paired presets](#the-twelve-paired-presets)
- [What each preset fills](#what-each-preset-fills)
- [Custom and Custom (modified)](#custom-and-custom-modified)
- [Progressive disclosure](#progressive-disclosure)
- [Minimal local test with the Simulator](#minimal-local-test-with-the-simulator)
- [UI controls](#ui-controls)
- [Tooltip reference](#tooltip-reference)

## What a preset is

A preset is a named bundle of connection field values. Selecting one **only
pre-fills editable fields**. A preset never:

- connects or disconnects,
- starts or stops capture,
- saves a password or any other secret,
- changes the application startup defaults or the persisted configuration.

Every field stays editable after a preset is applied, and every preset writes
the complete connection field set, so optional fields that the preset does not
use are reset to their documented defaults. Two consecutive preset selections
therefore always produce the same result, with no leftovers from the previous
protocol.

Preset definitions live in `src/connection-presets.js` and are shared by the
renderer and the tests. The identifiers and labels are a cross-application
contract: the ArcGIS Velocity Simulator exposes the same twelve identifiers and
labels with the roles inverted, so both applications are configured by picking
the same entry by name.

## The twelve paired presets

Each label names which application listens. In this repository:

- **Logger Server / Simulator Client** selects a Logger `*-server` connection
  type. The Simulator connects to the Logger.
- **Simulator Server / Logger Client** selects a Logger `*-client` connection
  type. The Logger connects to the Simulator.

| Identifier | Label | Logger connection type | Endpoint |
|---|---|---|---|
| `local-tcp-logger-server` | Local TCP — Logger Server / Simulator Client | TCP Server | 127.0.0.1:5565 |
| `local-tcp-simulator-server` | Local TCP — Simulator Server / Logger Client | TCP Client | 127.0.0.1:5565 |
| `local-udp-logger-server` | Local UDP — Logger Server / Simulator Client | UDP Server | 127.0.0.1:5565 |
| `local-udp-simulator-server` | Local UDP — Simulator Server / Logger Client | UDP Client | 127.0.0.1:5565 |
| `local-grpc-logger-server` | Local gRPC — Logger Server / Simulator Client | gRPC Server | 127.0.0.1:5565 |
| `local-grpc-simulator-server` | Local gRPC — Simulator Server / Logger Client | gRPC Client | 127.0.0.1:5565 |
| `local-http-logger-server` | Local HTTP — Logger Server / Simulator Client | HTTP Server | 127.0.0.1:8080 |
| `local-http-simulator-server` | Local HTTP — Simulator Server / Logger Client | HTTP Client | 127.0.0.1:8080 |
| `local-ws-logger-server` | Local WebSocket — Logger Server / Simulator Client | WebSocket Server | 127.0.0.1:8080 |
| `local-ws-simulator-server` | Local WebSocket — Simulator Server / Logger Client | WebSocket Client | 127.0.0.1:8080 |
| `local-xmpp-logger-server` | Local XMPP — Logger Server / Simulator Client | XMPP Server | 127.0.0.1:5222 |
| `local-xmpp-simulator-server` | Local XMPP — Simulator Server / Logger Client | XMPP Client | 127.0.0.1:5222 |

## What each preset fills

| Protocol | Values |
|---|---|
| TCP, UDP | Host `127.0.0.1`, port `5565`. |
| gRPC | Host `127.0.0.1`, port `5565`, Text serialization, Client Streaming, TLS off. |
| HTTP | Host `127.0.0.1`, port `8080`, Delimited (CSV), path `/`, TLS off. |
| WebSocket | Host `127.0.0.1`, port `8080`, Delimited (CSV), path `/`, TLS off, no subscription message, first message kept. |
| XMPP (both) | Host `127.0.0.1`, port `5222`, domain `localhost`, Direct conversation, Required STARTTLS. |
| XMPP server variant | External user `simulator`, external password intentionally empty, Allow remote off. |
| XMPP client variant | Username `velocity-logger`, password intentionally empty, resource `velocity-logger`, local JID `velocity-logger@localhost`, Allow unverified on. |

The XMPP passwords are intentionally left empty. A present-but-empty password
is accepted end to end for both PLAIN and SCRAM-SHA-1, so a local pairing needs
no shared secret. See [XMPP transport](xmpp.md#empty-passwords) for the full
behavior.

The XMPP client preset is the only place where the certificate-verification
bypass is enabled automatically, because the paired Simulator presents an
ephemeral self-signed certificate on loopback. Every other **Allow unverified**
control stays off until you turn it on. See
[TLS and SSL security](tls.md#explicit-certificate-verification-bypass).

## Custom and Custom (modified)

- **Custom** is the default. Selecting it keeps the current connection fields
  exactly as they are — nothing is filled and nothing is reset.
- Editing any populated connection or protocol field after applying a preset
  switches the displayed state to **Custom (modified)**. Your edit is kept; only
  the indicator changes. A small **Modified** badge appears next to the dropdown
  and the tooltip names the preset the fields started from.
- Selecting the same preset again restores its values.

Command-line prepopulation (`npm start -- protocol=… mode=…`) fills the same
fields without marking the state as modified, because it is not a manual edit.

## Progressive disclosure

Each protocol row shows its essentials directly and keeps certificates,
verification, timing, and metadata options one click away under an **Advanced**
disclosure:

| Row | Essentials | Advanced |
|---|---|---|
| gRPC | Serialization, RPC type, endpoint header path, TLS | CA/cert/key paths, Allow unverified |
| HTTP | Format, TLS, path | CA/cert/key paths, Allow unverified |
| WebSocket | Format, TLS, path | CA/cert/key paths, Allow unverified, subscription message, Skip 1st, headers |
| XMPP | Domain, TLS policy, conversation, account and room fields | CA/cert/key paths, Allow unverified, Allow remote, timing values |

No field required to connect is hidden: validation reveals and focuses the
offending control, opening every collapsed disclosure above it.

## Minimal local test with the Simulator

Start the Logger first, then the Simulator.

1. In the Logger, select the preset **Local XMPP — Logger Server / Simulator
   Client**, then select **Connect**.
2. In the Simulator, select the preset with the same name, choose the FAA
   sample file, then select **Connect** and **Play**.

The equivalent command line uses empty passwords and no other options.

**Terminal 1 — Logger:**

```bash
npm start -- protocol=xmpp mode=server ip=127.0.0.1 xmppExternalUsername=simulator xmppExternalPassword=
```

**Terminal 2 — Simulator:**

```bash
npm start -- filename=/Users/hano4470/Backup/data/faa.csv protocol=xmpp mode=client ip=127.0.0.1 xmppUsername=simulator xmppPassword= xmppDestination=velocity-logger@localhost xmppAllowUnverifiedTls=true
```

`xmppAllowUnverifiedTls=true` lets the Simulator accept the Logger's automatic
self-signed certificate while STARTTLS still encrypts the stream.

## UI controls

| Control | Description |
|---|---|
| Preset | Pre-fills the connection fields for a paired local Logger and Simulator test. Defaults to Custom. |
| Modified badge | Appears after a populated field is edited; names the preset the fields started from. |
| Advanced (gRPC, HTTP, WebSocket, XMPP) | Shows or hides the advanced certificate, verification, subscription, and timing options for that protocol. |

## Tooltip reference

These strings are produced by `describeConnectionPreset()` in
`src/connection-presets.js` and applied by `renderer.js`.

| Element | Tooltip |
|---|---|
| Preset (Custom) | `Custom` / `Keeps the current connection fields exactly as they are. Choose a paired preset to pre-fill a local Logger and Simulator test.` / `Preset: pre-fills the connection fields for a paired local Logger and Simulator test. It only fills editable fields — it never connects, starts capture, or saves a secret.` |
| Preset (applied) | `<label>` / `<preset summary>` / `Preset: pre-fills the connection fields for a paired local Logger and Simulator test. It only fills editable fields — it never connects, starts capture, or saves a secret.` |
| Preset (modified) | `Custom (modified)` / `These fields started from "<label>" and were edited. Select the preset again to restore its values.` / `Preset: pre-fills the connection fields for a paired local Logger and Simulator test. It only fills editable fields — it never connects, starts capture, or saves a secret.` |
| Modified badge | `Modified` / `These fields started from "<label>" and were edited. Select the preset again to restore its values.` |
| Advanced (gRPC) | `Show or hide the advanced gRPC certificate and verification options. The essential gRPC settings stay visible above.` |
| Advanced (HTTP) | `Show or hide the advanced HTTP certificate and verification options. Format, path, and TLS stay visible above.` |
| Advanced (WebSocket) | `Show or hide the advanced WebSocket certificate, verification, subscription, and header options. Format, path, and TLS stay visible above.` |
| Advanced (XMPP) | `Show or hide the advanced XMPP certificate, verification, remote-bind, and timing options. Domain, TLS policy, conversation, and account fields stay visible above.` |

## Related documentation

- [Documentation index](README.md)
- [XMPP transport](xmpp.md)
- [TLS and SSL security](tls.md)
- [Command-line reference](command-line.md)
