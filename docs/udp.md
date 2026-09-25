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

**UDP Client** is available for compatible custom servers. It connects its
socket to a remote server and announces its receiving address using the exact
UTF-8 text `UDP Client connected`, without a newline, regardless of the
selected payload format. This registration packet is a Logger/Simulator
pairing convention, not part of the ArcGIS Velocity UDP output contract.
While the client stays connected, Logger renews the announcement every 30
seconds by default. This lets a restarted Simulator server rediscover the
existing reply endpoint without reconnecting Logger.

UDP Client offers two explicit modes:

- **Direct** (the default for new configurations) binds the configured Local
  host and Local port, sends no registration packet, and accepts datagrams from
  any source address and port. This matches a conventional UDP receiver and
  avoids filtering senders that use an ephemeral source port.
- **Registered** preserves the legacy paired Logger/Simulator behavior above.
  It sends the custom marker and uses a connected socket, so the operating
  system accepts datagrams only from the configured remote address and port.

Older saved UDP Client configurations without `udpConnectionMode` migrate to
Registered. The existing inverse-role local preset also selects Registered
explicitly. New manual and command-line configurations default to Direct.

For the known same-machine case, a UDP output targeting
`10.15.52.11:17001` requires Logger Direct mode on that machine with Local host
`10.15.52.11` and Local port `17001` (or another local interface selected
explicitly). Only one receiver can own that unicast host and port: stop the
existing listener before connecting Logger, or choose another local port and
retarget the output. Logger reports a bind error rather than Ready when the
endpoint is already occupied. Do not enter `10.15.52.11` as a bind address on
a different computer. For a remote Logger, configure the output destination to
that Logger's reachable address and Direct local port, then permit the UDP
route and firewall traffic. A wildcard local bind is optional and must be
selected explicitly; it does not configure routing or a firewall.

UDP Client socket readiness is local state, not a remote handshake. The status
reports the local endpoint and says that Logger is awaiting datagrams. A
connected UDP socket accepts datagrams only from the configured remote address
and port; a sender using a different source port is filtered by the operating
system. The first accepted datagram is reported separately. Registration send
success is not an acknowledgment that the peer received it.

The default local endpoint is `127.0.0.1:5565`. For a paired Logger and
Simulator test, select the matching [connection preset](connection-presets.md)
in both applications. Start the Simulator server first; a receiving Logger
client registers before the Simulator begins sending.

For paired Delimited (CSV) publishing, ArcGIS Velocity Simulator LF-terminates
UDP datagrams by default for compatibility with ArcGIS Velocity sampling and
newline-framed receivers. Logger has no **Append LF** control: it is
receive-only and preserves the incoming datagram exactly. See
[data formats](data-formats.md#transport-boundaries) for framing details.

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

Host and port remain in the connection row. Select **Settings → Basics** to
change Format and Address family, and **Settings → Advanced** to change UDP
Client registration renewal while disconnected; the connected Summary is
read-only.

| Control | Default | Tooltip |
|---|---|---|
| Format | Delimited (CSV) | UDP payload format: Delimited (CSV). One comma-separated record; quoted fields may contain commas, quotes, and line breaks. |
| Address family | IPv4 | IPv4 - use IPv4 addresses and resolve hostnames to IPv4. This is the default. |
| UDP mode | Direct | Direct - use configured endpoints without registration or acknowledgment. |
| Local host | 127.0.0.1 | Local UDP interface to bind in Direct mode. Loopback is local-only; choose another interface explicitly for remote traffic. |
| Local port | 5565 | Local UDP bind port in Direct mode. Receivers require a stable port; a publisher may use 0 for an ephemeral port. |
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
| Client | Destination address: enter a reachable peer IP address or DNS name matching the selected address family. Do not use 0.0.0.0 or :: as a destination. |
| Server, IPv4 | Local bind address: 127.0.0.1 accepts same-machine traffic only. A local LAN IP restricts listening to that interface. Use 0.0.0.0 to listen on all local IPv4 interfaces for remote peers or multiple interfaces. This expands network exposure; firewall rules still apply. |
| Server, IPv6 | Local bind address: ::1 accepts same-machine traffic only. A local IPv6 address restricts listening to that interface. Use :: to listen on all local IPv6 interfaces for remote peers or multiple interfaces. Explicit IPv6 listeners accept IPv6 only. This expands network exposure; firewall rules still apply. |

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
Set `connection.udpAddressFamily` to `ipv4` or `ipv6`; host names resolve only
within that family, and literal addresses must match it.
Set `connection.udpRegistrationIntervalMs` to change the custom UDP Client
renewal cadence. The defaults are `delimited` and `30000`; older configurations
use `ipv4` and do not need any of these fields.
Set `connection.udpConnectionMode=direct` with `connection.udpLocalHost` and
`connection.udpLocalPort` for conventional receive-only operation. Registered
mode uses `ip` and `port` as the exact remote tuple.
`outputFormat` remains the capture-file format, not the incoming payload format.

See the [complete option reference](command-line.md) and
[launch configuration guide](configuration.md).

## Related documentation

- [Data formats](data-formats.md)
- [TCP transport](tcp.md)
- [Connection presets](connection-presets.md)
- [Protocol Settings and Summary](connection-summary.md)
- [Headless capture](headless.md)
