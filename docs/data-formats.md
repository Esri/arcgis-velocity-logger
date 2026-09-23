# Data formats

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

This guide distinguishes incoming payload formats from transport framing and
capture-file formats. It is for users pairing ArcGIS Velocity Logger with
ArcGIS Velocity Simulator, ArcGIS Velocity, or another compatible sender.

## Table of contents

- [Payload formats](#payload-formats)
- [Receiving and inspecting data](#receiving-and-inspecting-data)
- [Transport boundaries](#transport-boundaries)
- [Capture formats](#capture-formats)
- [Related documentation](#related-documentation)

## Payload formats

TCP and UDP offer these formats, in this order:

| Label | Value | Payload |
|---|---|---|
| Delimited (CSV) | `delimited` | A comma-separated record with CSV quoting. This is the default. |
| JSON | `json` | A complete JSON object or array. |
| GeoJSON | `geo-json` | A GeoJSON Feature or FeatureCollection. |
| Esri JSON | `esri-json` | An ArcGIS feature or feature set with attributes and geometry. |

Select the same format as the sender. Geometry-bearing formats require an
appropriate feature structure; changing a format label does not supply missing
geometry, attribute names, or coordinate-system information.

HTTP and WebSocket retain their existing format choices, including XML.
XML is not a TCP or UDP format option. gRPC serialization and XMPP message
envelopes are separate from these payload choices.

## Receiving and inspecting data

Logger does not convert incoming CSV into JSON or another payload format.
It extracts records, checks the selected format, and retains the original
record text for display and capture. Complete records that fail validation
remain available with an explicit warning rather than disappearing.

Capture stores decoded record text, not a packet-byte archive. TCP record
separators delimit records; they are not separate data entries. Spaces, quoting,
and embedded line breaks inside a record are not reformatted.

When using ArcGIS Velocity Simulator, configure any source conversion in that
application. Logger does not have source-column, geometry-column, or spatial
reference conversion controls.

During Simulator's automatic CSV attribute-type inference, unsafe integers and
values with more than 15 significant digits remain strings to avoid numeric
precision loss. Nonzero values below the normal floating-point range and
textual negative zero also remain strings rather than being rounded or losing
their sign. Logger preserves the incoming text instead: it does not round
numeric literals or turn numbers in an incoming JSON document into strings.

JSON validation checks syntax. GeoJSON and Esri JSON additionally check their
feature structure; these checks do not replace a full geospatial schema or
coordinate-system validation service.

## Transport boundaries

TCP is a byte stream, not a sequence of socket-sized records. Logger preserves
UTF-8 characters across reads and assembles CSV records or complete JSON
documents. UDP keeps each datagram separate and never joins partial documents
from different datagrams or senders.

For a paired UDP test, ArcGIS Velocity Simulator ensures that Delimited (CSV)
datagrams end with one LF by default for compatibility with ArcGIS Velocity
sampling and newline-framed receivers; a record that already ends with LF is
not given another one. Logger preserves that record-ending LF in the raw capture.
Structured UDP payloads are not given this delimiter, and Logger does not add
or remove bytes for any format.

See the [TCP guide](tcp.md#record-framing) and
[UDP guide](udp.md#datagram-boundaries-and-size) for delimiter, size, and error
behavior. A pretty-printed JSON document or quoted CSV field may contain
physical line breaks without becoming several logical records.
A JSON array, FeatureCollection, or feature set counts as one received document,
not one record per member.

HTTP requests, WebSocket messages, and XMPP message bodies already supply
transport boundaries. Their current behavior is documented in their protocol
guides; TCP/UDP format selection does not change those transports or add a
general-purpose serializer to them.

## Capture formats

`tcpFormat` and `udpFormat` describe incoming data. Headless
`outputFormat=text|jsonl|csv` selects the capture container, not the network
payload. See the [headless output reference](headless.md#output-formats) for the
stored representations and sink behavior.

For example, JSON input with `outputFormat=jsonl` keeps the JSON document as a
string in `data`; it does not merge the document's properties into the capture
envelope. The UI's **Save Logs** writes displayed text even when the chosen
filename ends in `.csv`.

## Related documentation

- [TCP transport](tcp.md)
- [UDP transport](udp.md)
- [HTTP transport](http.md)
- [WebSocket transport](websocket.md)
- [gRPC transport](grpc.md)
- [XMPP transport](xmpp.md)
- [Command-line reference](command-line.md)
