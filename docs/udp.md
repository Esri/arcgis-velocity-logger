# UDP transport

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

Use UDP to receive individual datagrams from ArcGIS Velocity Simulator or
another compatible sender. This guide covers both Logger roles, datagram
limits, and the UDP controls. Select the same payload format in both peers.

## Table of contents

- [Connection modes](#connection-modes)
- [Datagram boundaries and size](#datagram-boundaries-and-size)
- [UI controls](#ui-controls)
- [Tooltip reference](#tooltip-reference)
- [Command-line usage](#command-line-usage)
- [Related documentation](#related-documentation)

## Connection modes

**UDP Server** binds the selected host and port and receives datagrams from
senders. **UDP Client** connects its socket to a remote server and announces its
receiving address using the existing registration control packet.
The announcement is the exact UTF-8 text `UDP Client connected`, without a
newline, regardless of the selected payload format.

The default local endpoint is `127.0.0.1:5565`. Select the matching
[connection preset](connection-presets.md) in both applications. Start the
server first; a receiving Logger client registers before the Simulator server
begins sending.

Registration packets are control traffic, not data records. They bypass payload
validation and capture counting. UDP connections here are unsecure and do not
provide delivery, ordering, or retransmission guarantees.

## Datagram boundaries and size

One datagram must contain one complete CSV record or JSON document. Logger
never combines datagrams, even from the same sender. Embedded newlines inside
a quoted CSV field or JSON document remain part of that record.

The IPv4 UDP payload limit is 65,507 bytes, measured after UTF-8 encoding.
This is an upper bound, not a recommended Internet packet size: larger
datagrams can require IP fragmentation and are more vulnerable to loss.
JSON and geometry-bearing records can be substantially larger than their
source CSV rows.

Complete malformed data is retained as raw text with a warning. Invalid UTF-8
datagrams are reported and dropped rather than shown as invented replacement
text. Oversized datagrams are rejected explicitly. There is no application
reassembly of partial JSON documents or CSV records across datagrams.

See [data formats](data-formats.md) for format meanings and capture containers.

## UI controls

Host and port remain in the connection row. Select **Settings → Basics** to
change Format while disconnected; the connected Summary is read-only.

| Control | Default | Tooltip |
|---|---|---|
| Format | Delimited (CSV) | UDP payload format: Delimited (CSV). One comma-separated record; quoted fields may contain commas, quotes, and line breaks. |

## Tooltip reference

The Format label tooltip is `Payload format for the UDP connection`.
The initial select tooltip is `UDP payload format. Must match the peer. Delimited (CSV) is the default.`
After initialization or a selection change, the select tooltip is
`UDP payload format: ` followed by the selected option's exact text below.

| Option | Tooltip |
|---|---|
| Delimited (CSV) | Delimited (CSV). One comma-separated record; quoted fields may contain commas, quotes, and line breaks. |
| JSON | JSON. A complete JSON object or array. |
| GeoJSON | GeoJSON. A Feature or FeatureCollection with geometry and properties. |
| Esri JSON | Esri JSON. An ArcGIS feature or feature set with attributes and geometry. |

## Command-line usage

Capture GeoJSON datagrams as received text:

```bash
npm run start:headless -- protocol=udp mode=server ip=127.0.0.1 port=5565 udpFormat=geo-json outputFormat=jsonl outputFile=captured.jsonl
```

Set `connection.udpFormat` in a Launch Config to restore the same choice.
The default is `delimited`; older configurations do not need a new field.
`outputFormat` remains the capture-file format, not the incoming payload format.

See the [complete option reference](command-line.md) and
[launch configuration guide](configuration.md).

## Related documentation

- [Data formats](data-formats.md)
- [TCP transport](tcp.md)
- [Connection presets](connection-presets.md)
- [Protocol Settings and Summary](connection-summary.md)
- [Headless capture](headless.md)
