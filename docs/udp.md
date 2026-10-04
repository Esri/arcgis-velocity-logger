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
Select **IPv4** or **IPv6** to match the local bind address and peer. IPv6 uses
an IPv6-only socket; use `::1` for local testing or a local IPv6 interface for
remote peers. IPv4 remains the default.

**UDP Client** binds the configured Local host and Local port and receives
datagrams from any source address and port. It remains unconnected and sends
no control packet. This accepts ArcGIS Velocity outputs and compatible custom
senders that use an ephemeral source port. The connection-row Host and Port are
unused for this role.

For a same-machine output, bind the exact local interface and port configured
as the output destination. Only one receiver can own that
unicast host and port: stop the existing listener before connecting Logger, or
choose another local port and retarget the output. Logger reports a bind error
rather than Ready when the endpoint is already occupied. Do not enter another
computer's address as a local bind address. For a remote Logger, configure the
output destination to that Logger's reachable address and local receive port,
then permit the UDP route and firewall traffic. A wildcard local bind is
optional and must be selected explicitly; it does not configure routing or a
firewall.

UDP readiness is local state, not a remote handshake. UDP Client reports
**Ready** after its local endpoint binds; UDP Server reports **Listening** after
its bind. Both change to **Receiving** after the first accepted record. Neither
state acknowledges a remote peer or delivery.

The default local endpoint is `127.0.0.1:5565`. For either paired preset, start
the Logger receiver first and configure the Simulator destination to the
Logger's bound endpoint.

For paired Delimited (CSV) publishing, ArcGIS Velocity Simulator LF-terminates
UDP datagrams by default for compatibility with ArcGIS Velocity sampling and
newline-framed receivers. Logger has no **Append LF** control: it is
receive-only and preserves the incoming datagram exactly. See
[data formats](data-formats.md#transport-boundaries) for framing details.

UDP Client and UDP Server treat every incoming datagram as application data,
including the literal text `UDP Client connected`. Neither role sends a
registration or acknowledgment packet. UDP connections here are unsecure and
do not provide delivery, ordering, or retransmission guarantees.

## Datagram boundaries and size

One datagram must contain one complete CSV record or JSON document. Logger
never combines datagrams, even from the same sender. Embedded newlines inside
a quoted CSV field or JSON document remain part of that record. A final LF on
a Delimited datagram is validated as its record delimiter and remains present
in the captured raw text.

The application UDP payload limit is 65,507 bytes for both families, measured
after UTF-8 encoding. This preserves the IPv4 UDP ceiling as one shared bound;
it is not a recommended Internet packet size. Larger datagrams can require IP
fragmentation and are more vulnerable to loss.
JSON and geometry-bearing records can be substantially larger than their
source CSV rows.

Complete malformed data is retained as raw text with a warning. Invalid UTF-8
datagrams are reported and dropped rather than shown as invented replacement
text. Oversized datagrams are rejected explicitly. There is no application
reassembly of partial JSON documents or CSV records across datagrams.

See [data formats](data-formats.md) for format meanings and capture containers.

## UI controls

Host and port remain in the connection row for UDP Server. Select
**Settings → Basics** to change Format and Address family. UDP Client uses
**Settings → Advanced** for its Local host and Local port; its connection-row
Host and Port are disabled and ignored. The connected Summary is read-only.

| Control | Default | Tooltip |
|---|---|---|
| Format | Delimited (CSV) | UDP payload format: Delimited (CSV). One comma-separated record; quoted fields may contain commas, quotes, and line breaks. |
| Address family | IPv4 | IPv4 - use IPv4 addresses and resolve hostnames to IPv4. This is the default. |
| Local host | 127.0.0.1 | Local UDP interface to bind. Loopback is local-only; choose another interface explicitly for remote traffic. |
| Local port | 5565 | Stable local UDP receive port. The sender must target this port. |

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

The Address family label tooltip is `Choose IPv4 or IPv6 for UDP. The host
must match the selected family. IPv6 sockets accept IPv6 only.` The select
tooltip follows the selected option:

| Option | Tooltip |
|---|---|
| IPv4 | IPv4 - use IPv4 addresses and resolve hostnames to IPv4. This is the default. |
| IPv6 | IPv6 - use IPv6 addresses and resolve hostnames to IPv6. IPv4-mapped addresses are not supported. |

The shared Host input follows the selected UDP role and family:

| Mode | Tooltip |
|---|---|
| Client | Remote Host and Port are not used in UDP Client receive mode. Configure the stable local receive endpoint in Protocol Settings → Advanced. |
| Server, IPv4 | Local bind address: 127.0.0.1 accepts same-machine traffic only. A local LAN IP restricts listening to that interface. Use 0.0.0.0 to listen on all local IPv4 interfaces for remote peers or multiple interfaces. This expands network exposure; firewall rules still apply. |
| Server, IPv6 | Local bind address: ::1 accepts same-machine traffic only. A local IPv6 address restricts listening to that interface. Use :: to listen on all local IPv6 interfaces for remote peers or multiple interfaces. Explicit IPv6 listeners accept IPv6 only. This expands network exposure; firewall rules still apply. |

The Local host label and input use
`Local UDP interface to bind. Loopback is local-only; choose
another interface explicitly for remote traffic.` The Local port label and
input use `Stable local UDP receive port. The sender must target this port.`

## Command-line usage

Capture GeoJSON datagrams as received text:

```bash
npm run start:headless -- protocol=udp mode=server ip=127.0.0.1 port=5565 udpFormat=geo-json outputFormat=jsonl outputFile=captured.jsonl
```

Set `connection.udpFormat` in a Launch Config to restore the same choice.
Set `connection.udpAddressFamily` to `ipv4` or `ipv6`; host names resolve only
within that family, and literal addresses must match it.
Set `connection.udpLocalHost` and `connection.udpLocalPort` for UDP Client.
The retired `udpConnectionMode` and `udpRegistrationIntervalMs` keys are
rejected; remove them and review the configured local endpoint.
`outputFormat` remains the capture-file format, not the incoming payload format.

See the [complete option reference](command-line.md) and
[launch configuration guide](configuration.md).

## Related documentation

- [Data formats](data-formats.md)
- [TCP transport](tcp.md)
- [Connection presets](connection-presets.md)
- [Protocol Settings and Summary](connection-summary.md)
- [Headless capture](headless.md)
