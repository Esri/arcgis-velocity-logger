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

TCP connections here are unsecure. Use a TLS-capable transport when encryption
is required; see the [TLS guide](tls.md).

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
change Format while disconnected; the connected Summary is read-only.

| Control | Default | Tooltip |
|---|---|---|
| Format | Delimited (CSV) | TCP payload format: Delimited (CSV). One comma-separated record; quoted fields may contain commas, quotes, and line breaks. |

## Tooltip reference

The Format label tooltip is `Payload format for the TCP connection`.
The initial select tooltip is `TCP payload format. Must match the peer. Delimited (CSV) is the default.`
After initialization or a selection change, the select tooltip is
`TCP payload format: ` followed by the selected option's exact text below.

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
