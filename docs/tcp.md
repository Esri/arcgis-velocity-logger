# TCP transport

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

Use TCP to receive a stream from ArcGIS Velocity Simulator or another compatible
sender. This guide covers both Logger roles, record framing, and the TCP
controls. The sender and Logger must agree on the payload format.

## Table of contents

- [Connection modes](#connection-modes)
- [Record framing](#record-framing)
- [UI controls](#ui-controls)
- [Tooltip reference](#tooltip-reference)
- [Command-line usage](#command-line-usage)
- [Related documentation](#related-documentation)

## Connection modes

**TCP Server** listens on the selected host and port and receives from connected
clients. Each client has an independent decoder, so partial records from
different senders are never combined.

**TCP Client** connects to a remote server and receives its stream. Both roles
default to `127.0.0.1:5565` for local paired tests. Select the corresponding
[connection preset](connection-presets.md) in both applications, start the
server, and then connect the client.

Address family defaults to **Automatic**, preserving operating-system hostname
resolution and existing behavior. Choose IPv4 or IPv6 to require that family.
An explicit IPv6 server bind accepts IPv6 only.

TCP connections here are unsecure. Use a TLS-capable transport when encryption
is required; see the [TLS guide](tls.md).

Both roles can send an optional UTF-8 greeting once per new connection. TCP
Client sends it again after every reconnect; TCP Server sends it independently
to every accepted client. Blank text sends nothing. There is no expected reply,
acknowledgment, challenge, or inbound-data gate.

## Record framing

- **Delimited (CSV)** uses record-ending LF or CRLF outside quoted fields.
  Escaped quotes and embedded line breaks inside quoted fields stay in the
  same record. Empty and whitespace-only separator lines are ignored; quoted
  empty fields are retained.
- **JSON**, **GeoJSON**, and **Esri JSON** use complete top-level objects or
  arrays. Consecutive documents, including newline-delimited JSON, are
  accepted. Pretty-printing does not split a document into separate records.
- UTF-8 characters split across socket reads are retained until complete.
- The per-record application limit is 1 MiB (1,048,576 UTF-8 bytes). A complete
  oversized record from an external sender is retained as raw text with a
  warning rather than accepted as a validated record. If an incomplete buffer
  exceeds the limit, its raw text is reported with a warning and the decoder
  resets instead of retaining an unlimited buffer.
- When a peer ends the connection, an unfinished record is retained as raw text with a
  warning. Complete malformed records also remain visible with a warning.

Logger does not convert the payload or reformat numeric literals. See
[data formats](data-formats.md) for format meanings, precision-safe Simulator
CSV attribute conversion, and the distinction between network data and capture
output.

## UI controls

Host and port remain in the connection row. Select **Settings → Basics** to
change Format and Address family while disconnected; the connected Summary is
read-only.

| Control | Default | Tooltip |
|---|---|---|
| Format | Delimited (CSV) | TCP payload format: Delimited (CSV). One comma-separated record; quoted fields may contain commas, quotes, and line breaks. |
| Address family | Automatic | Automatic - preserve operating-system TCP hostname resolution and use the literal address family when specified. |
| Handshake text | Empty | Optional TCP greeting sent as UTF-8 once on each new client connection or accepted server connection, including reconnects. Blank sends nothing. Whitespace is preserved; no newline is appended and no reply is awaited. Decoded maximum: 1 MiB. |
| Use escapes | On | Interpret Java-style escapes in the TCP greeting (enabled by default): `\r\n` sends CRLF; `\t`, `\b`, `\f`, `\\`, escaped quotes, `\uXXXX`, and octal escapes are supported. When off, backslashes are sent literally. Whitespace is preserved; malformed escapes are rejected without displaying the greeting. |

## Tooltip reference

The Format label tooltip is `Payload format for the TCP connection`.
The initial select tooltip is `TCP payload format. Must match the peer. Delimited (CSV) is the default.`
After initialization or a selection change, the select tooltip is
`TCP payload format: ` followed by the selected option's exact text below.

The Address family label tooltip is `Choose automatic, IPv4, or IPv6
addressing for TCP. Automatic preserves operating-system hostname resolution.`
The select tooltip follows the selected option:

| Option | Tooltip |
|---|---|
| Automatic | Automatic - preserve operating-system TCP hostname resolution and use the literal address family when specified. |
| IPv4 | IPv4 - require IPv4 addresses and resolve hostnames to IPv4. |
| IPv6 | IPv6 - require IPv6 addresses and resolve hostnames to IPv6. Explicit IPv6 server binds accept IPv6 only. |

The shared Host input follows the selected TCP role and family:

| Mode | Tooltip |
|---|---|
| Client | Destination address: enter a reachable peer IP address or DNS name matching the selected address family. Do not use 0.0.0.0 or :: as a destination. |
| Server, Automatic | Local bind address: 127.0.0.1 or ::1 is same-machine only. A local LAN IP restricts listening to that interface. Use 0.0.0.0 for all local IPv4 interfaces or :: for the system IPv6 wildcard when remote peers or multiple interfaces need access. Auto preserves system listen behavior. Wildcard binds expand network exposure; firewall rules still apply. |
| Server, IPv4 | Local bind address: 127.0.0.1 accepts same-machine traffic only. A local LAN IP restricts listening to that interface. Use 0.0.0.0 to listen on all local IPv4 interfaces for remote peers or multiple interfaces. This expands network exposure; firewall rules still apply. |
| Server, IPv6 | Local bind address: ::1 accepts same-machine traffic only. A local IPv6 address restricts listening to that interface. Use :: to listen on all local IPv6 interfaces for remote peers or multiple interfaces. Explicit IPv6 listeners accept IPv6 only. This expands network exposure; firewall rules still apply. |

The **Handshake text:** label and textarea use this exact tooltip:
`Optional TCP greeting sent as UTF-8 once on each new client connection or accepted server connection, including reconnects. Blank sends nothing. Whitespace is preserved; no newline is appended and no reply is awaited. Decoded maximum: 1 MiB.`

The **Use escapes:** label and checkbox use this exact tooltip:
`Interpret Java-style escapes in the TCP greeting (enabled by default): \r\n sends CRLF; \t, \b, \f, \\, escaped quotes, \uXXXX, and octal escapes are supported. When off, backslashes are sent literally. Whitespace is preserved; malformed escapes are rejected without displaying the greeting.`

Handshake text is direct connection setup data, not a CSV record conversion.
Actual spaces and line breaks are preserved. With **Use escapes** enabled,
terminators must be explicit. Invalid or oversized decoded text is rejected
without showing its content in status, logs, or summaries. Raw input is limited
to 1,048,576 characters before it enters the settings surface; decoded UTF-8
bytes are independently limited to 1 MiB, so escape-heavy input may reach the
raw-input limit first.
The interactive app bounds a pending greeting write to 30 seconds. Headless
mode uses `connectTimeoutMs` for the connection and greeting startup deadline.

Summary masking is not encryption. Launch Config files store handshake text as
plain text, and command-line values may be visible in shell history or process
listings. Protect configuration files and prefer them over command-line secrets
when the greeting contains credentials. The greeting travels over the same
unsecure TCP connection as captured data; use a [TLS-capable transport](tls.md)
when encryption is required.

| Option | Tooltip |
|---|---|
| Delimited (CSV) | Delimited (CSV). One comma-separated record; quoted fields may contain commas, quotes, and line breaks. |
| JSON | JSON. A complete JSON object or array. |
| GeoJSON | GeoJSON. A Feature or FeatureCollection with geometry and properties. |
| Esri JSON | Esri JSON. An ArcGIS feature or feature set with attributes and geometry. |

## Command-line usage

Capture JSON documents without converting their content:

```bash
npm run start:headless -- protocol=tcp mode=server ip=127.0.0.1 port=5565 tcpFormat=json outputFormat=jsonl outputFile=captured.jsonl
```

Set `connection.tcpFormat` in a Launch Config to restore the same choice.
The default is `delimited`; omitted values in existing configurations keep
that default. App Config remains responsible for appearance, not payload
conversion or connection formats.

See the [complete option reference](command-line.md) and
[launch configuration guide](configuration.md).

## Related documentation

- [Data formats](data-formats.md)
- [UDP transport](udp.md)
- [Connection presets](connection-presets.md)
- [Protocol Settings and Summary](connection-summary.md)
- [Headless capture](headless.md)
