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

**UDP Server** binds the selected local host and port and receives datagrams
from senders. Both ArcGIS Velocity UDP output types send to a preconfigured
destination, so applying either output selects UDP Server. The bind address
defaults to `127.0.0.1`; choose a local interface that the output's advertised
destination routes to. Applying an output reports that expected destination
but does not claim that routing or firewall configuration is reachable.

**UDP Client** is available for compatible custom servers. It connects its
socket to a remote server and announces its receiving address using the exact
UTF-8 text `UDP Client connected`, without a newline, regardless of the
selected payload format. This registration packet is a Logger/Simulator
pairing convention, not part of the ArcGIS Velocity UDP output contract.
While the client stays connected, Logger renews the announcement every 30
seconds by default. This lets a restarted Simulator server rediscover the
existing reply endpoint without reconnecting Logger.

The default local endpoint is `127.0.0.1:5565`. For a paired Logger and
Simulator test, select the matching [connection preset](connection-presets.md)
in both applications. Start the Simulator server first; a receiving Logger
client registers before the Simulator begins sending.

The Logger UDP Client sends that custom registration packet but does not count
it as captured data. UDP Server treats every incoming datagram as application
data, including the same literal text, so ArcGIS Velocity output payloads are
never silently removed. A Logger UDP Server does not send a registration
packet. UDP connections here are unsecure and do not provide delivery,
ordering, or retransmission guarantees. Registration send success is not an
acknowledgment, liveness probe, or delivery guarantee. Renewal stops on
disconnect or transport failure.

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
change Format and **Settings → Advanced** to change UDP Client registration
renewal while disconnected; the connected Summary is read-only.

| Control | Default | Tooltip |
|---|---|---|
| Format | Delimited (CSV) | UDP payload format: Delimited (CSV). One comma-separated record; quoted fields may contain commas, quotes, and line breaks. |
| Registration renewal | 30000 ms | Renew the custom UDP client registration every 30000 milliseconds. Positive values up to 2147483647 are accepted. This does not apply to ArcGIS Velocity UDP outputs. |

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

The Registration renewal label tooltip is `Renew the custom UDP client registration at this interval so a restarted Simulator server can rediscover the reply endpoint. This is not an acknowledgment or delivery check.` The control appears only for UDP Client.
After initialization or an edit, the input tooltip is `Renew the custom UDP
client registration every ` followed by the current interval and ` milliseconds.
Positive values up to 2147483647 are accepted. This does not apply to ArcGIS
Velocity UDP outputs.`

## Command-line usage

Capture GeoJSON datagrams as received text:

```bash
npm run start:headless -- protocol=udp mode=server ip=127.0.0.1 port=5565 udpFormat=geo-json outputFormat=jsonl outputFile=captured.jsonl
```

Set `connection.udpFormat` in a Launch Config to restore the same choice.
Set `connection.udpRegistrationIntervalMs` to change the custom UDP Client
renewal cadence. The defaults are `delimited` and `30000`; older configurations
do not need either field.
`outputFormat` remains the capture-file format, not the incoming payload format.

See the [complete option reference](command-line.md) and
[launch configuration guide](configuration.md).

## Related documentation

- [Data formats](data-formats.md)
- [TCP transport](tcp.md)
- [Connection presets](connection-presets.md)
- [Protocol Settings and Summary](connection-summary.md)
- [Headless capture](headless.md)
