# HTTP transport

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

The ArcGIS Velocity Logger supports HTTP/HTTPS as a transport protocol for receiving data from ArcGIS Velocity HTTP Receiver feeds or any HTTP endpoint that accepts POST requests. This guide documents the available connection modes, payload formats, TLS behavior, default ports, UI controls, and CLI/headless usage for the HTTP transport.

It is intended for users and developers connecting the Logger to an HTTP(S) endpoint, and assumes basic familiarity with HTTP requests and TLS certificates. For general certificate concepts and OS trust store behavior shared across transports, see the [TLS guide](tls.md).

## Table of contents

- [Connection modes](#connection-modes)
- [Format options](#format-options)
- [TLS (HTTPS)](#tls-https)
- [Default ports](#default-ports)
- [HTTP path](#http-path)
- [UI controls](#ui-controls)
- [Tooltip reference](#tooltip-reference)
- [CLI parameters](#cli-parameters)
- [Metadata logging](#metadata-logging)
- [Launch configuration](#launch-configuration)
- [Related documentation](#related-documentation)

## Connection modes

| Mode | Description |
|------|-------------|
| HTTP Client | Receives POST data from an HTTP(S) endpoint |
| HTTP Server | Connects to an HTTP(S) server to receive data |

## Format options

The HTTP Format dropdown controls the `Content-Type` header used when sending data. These match the formats supported by the ArcGIS Velocity TCP and HTTP Receiver feeds. **Delimited (CSV) is the default**, matching the order used by ArcGIS Velocity:

| UI label | Value | Content-Type | Description |
|----------|-------|--------------|-------------|
| Delimited (CSV) | `delimited` | `text/plain` | Each line is a comma-separated row of field values. **Default format** - matches the default for ArcGIS Velocity TCP and HTTP feeds. Best for simple tabular data without nested structures. |
| JSON | `json` | `application/json` | The standard format for most HTTP feeds. Each request body is a JSON object or array of features. |
| Esri JSON | `esri-json` | `application/json` | Uses the Esri Feature JSON schema with `geometry` and `attributes` objects. Use when the Velocity HTTP Receiver expects ArcGIS-native feature format. |
| GeoJSON | `geo-json` | `application/geo+json` | Standard GeoJSON per [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946) with `FeatureCollection` and `Feature` objects. Use when the receiver expects standard geospatial interchange format. |
| XML | `xml` | `application/xml` | Sends data as XML-formatted payloads. Use when the Velocity HTTP Receiver is configured for XML input. |

## TLS (HTTPS)

TLS is enabled by default (`Use TLS` checkbox checked), making the connection HTTPS. When TLS is enabled:

- **Client mode**: Uses the OS certificate store (macOS Keychain, Windows certificate store, or Linux CA bundles) plus Node.js bundled root certificates to verify the server. Custom CA, client cert, and key can be provided for mutual TLS or enterprise CAs.
- **Server mode**: Requires a TLS certificate and private key to be provided. The OS certificate store cannot provide a server identity certificate.

When TLS is enabled, additional certificate path fields appear:

| Field | Description |
|-------|-------------|
| **CA cert path** | Path to a custom CA certificate file (PEM). Leave empty to use the OS certificate store automatically. Only needed for enterprise or self-signed CAs not in the system trust store. |
| **TLS cert path** | Path to a client or server certificate file (PEM). Required for server-mode TLS. For client mode, only needed for mutual TLS (mTLS) authentication. |
| **TLS key path** | Path to the private key file (PEM) corresponding to the TLS certificate. Required for server-mode TLS and client-side mTLS. |

## Default ports

| TLS state | Default port |
|-----------|-------------|
| TLS on (HTTPS) | `8443` |
| TLS off (HTTP) | `8080` |

The port automatically switches between `8080` and `8443` when the TLS checkbox is toggled, as long as the user hasn't manually entered a custom port.

## HTTP path

The HTTP Path field (default `/`) specifies the URL path appended after the host and port in the request URL.

- **Server mode**: The server only accepts POST requests whose URL matches this path exactly. All other paths return a `404 Not Found` response. GET requests to this path return a health-check JSON response with the current format and client count.
- **Client mode**: This path is used in the outgoing POST request URL. For example, if the host is `velocity.example.com`, the port is `8443`, and the path is `/receiver/feed-id`, the full URL becomes `https://velocity.example.com:8443/receiver/feed-id`.

When connecting to an ArcGIS Velocity HTTP Receiver endpoint, set this to the system-generated path provided by the feed configuration (typically something like `/receiver/<feed-id>`). For local testing between the Logger and Simulator, the default `/` is usually sufficient.

## UI controls

When HTTP is selected as the connection type in the UI, the following controls appear in the HTTP options row:

- **Mode** - `HTTP Client` or `HTTP Server` (selected from the main Mode dropdown). Hovering over each option shows a description of that connection mode. All connection modes (TCP, UDP, HTTP, gRPC) have descriptive tooltips.
- **Format** - `Delimited (CSV)` (default), `JSON`, `Esri JSON`, `GeoJSON`, or `XML`. Controls the `Content-Type` header sent with each request. Must match the format configured in the ArcGIS Velocity HTTP Receiver feed. Hovering over the dropdown shows a detailed tooltip for the currently selected format.
- **TLS** - Checkbox to enable TLS (HTTPS). When checked, the connection uses HTTPS and the port defaults to `8443`. When unchecked, uses plain HTTP with port `8080`. Toggling this checkbox also reveals/hides the certificate path fields.
- **Advanced** - Disclosure that holds the certificate paths and the verification option. Format, TLS, and HTTP Path stay visible in the row.
- **CA cert path** - Path to a custom CA certificate file (PEM). Leave empty to use the OS certificate store. Only needed for enterprise or self-signed CAs.
- **TLS cert path** - Path to a client or server certificate file (PEM). Required for server-mode TLS; only needed in client mode for mutual TLS (mTLS).
- **TLS key path** - Path to the private key file (PEM). Required for server-mode TLS and client-side mTLS.
- **Allow unverified** - Client-only warning checkbox inside **Advanced**, shown when TLS is enabled. Accepts an unverified server certificate for any host. Off by default; see [TLS and SSL security](tls.md#explicit-certificate-verification-bypass).
- **HTTP Path** - The URL path appended after the host:port (default `/`). In server mode, only POST requests matching this path are accepted. In client mode, this path is used in outgoing POST URLs. Set this to the ArcGIS Velocity feed's system-generated path when connecting to a real endpoint.

## Tooltip reference

The following tooltips appear when hovering over HTTP-related controls in the UI. These are also set dynamically via `HTTP_FORMAT_TOOLTIPS` and `CONNECTION_MODE_TOOLTIPS` in `renderer.js`.

### Connection mode tooltips

| Mode | Tooltip |
|------|---------|
| HTTP Client | HTTP Client - sends data via HTTP/HTTPS POST requests to a remote endpoint. |
| HTTP Server | HTTP Server - starts a local HTTP/HTTPS server that accepts POST requests from clients. |

### Format tooltips

| Format | Tooltip |
|--------|---------|
| JSON | HTTP Format: JSON (application/json). The standard format for most HTTP feeds. Each request body is a JSON object or array of features. |
| Delimited (CSV) | HTTP Format: Delimited / CSV (text/plain). Each line is a comma-separated row of field values. Best for simple tabular data without nested structures. |
| Esri JSON | HTTP Format: Esri JSON (application/json). Uses the Esri Feature JSON schema with geometry and attributes objects. Use when the Velocity HTTP Receiver expects ArcGIS-native feature format. |
| GeoJSON | HTTP Format: GeoJSON (application/geo+json). Standard GeoJSON per RFC 7946 with FeatureCollection and Feature objects. Use when the receiver expects standard geospatial interchange format. |
| XML | HTTP Format: XML (application/xml). Sends data as XML-formatted payloads. Use when the Velocity HTTP Receiver is configured for XML input. |

### Control tooltips

| Control | Tooltip |
|---------|---------|
| TLS checkbox | Enable TLS (HTTPS) for the HTTP connection. When checked, the connection uses HTTPS (port 8443 by default). When unchecked, uses plain HTTP (port 8080). In client mode, the OS certificate store is used automatically; in server mode, a certificate and key must be provided. |
| CA cert path | Path to a custom CA certificate file (PEM). Leave empty to use the OS certificate store automatically. Only needed for enterprise or self-signed CAs not in the system trust store. |
| TLS cert path | Path to a client or server certificate file (PEM). Required for server-mode TLS. For client mode, only needed for mutual TLS (mTLS) authentication. |
| TLS key path | Path to the private key file (PEM) corresponding to the TLS certificate. Required for server-mode TLS and client-side mTLS. |
| Advanced | Show or hide the advanced HTTP certificate and verification options. Format, path, and TLS stay visible above. |
| Allow unverified | Warning: accept any HTTPS server certificate<br>---<br>Certificate verification is disabled for every host, not only localhost. Traffic stays encrypted, but the server identity is not checked. Use only for local self-signed testing. |
| HTTP Path | HTTP endpoint URL path appended after the host:port (e.g. /receiver/feed-id). In server mode, only POST requests matching this path are accepted; all others return 404. In client mode, this path is used in the outgoing POST request URL. Default is /. |

### TLS trust badge

When connected, the status bar displays a lock icon reflecting the trust level at a glance. The icon **shape** and **colour** both encode the trust level so it is unambiguous for colour-blind users. No text label is shown beside the icon - hover or click the badge for full details.

| Icon | Colour | Trust level | Meaning |
|------|--------|-------------|---------|
| 🔓 | Grey / dimmed | off | No TLS - plaintext, unsecure connection |
| 🔒 | Amber | on | TLS on - OS certificate store, trust level not fully determined |
| 🔒⚠ | Amber | self-signed | TLS on, self-signed or cert-chain not verified |
| 🔒✓ | Green | ca-verified | TLS on, CA-verified certificate chain |
| 🔐 | Blue / cyan | mtls | Mutual TLS - both client and server present certificates |

See the [TLS guide](tls.md) for full TLS concepts, certificate file formats, OS trust store behaviour, and setup guides.

## CLI parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--protocol http` | Use HTTP transport | - |
| `--mode client\|server` | Connection mode | `server` |
| `--httpFormat <format>` | Data format (`delimited`, `json`, `esri-json`, `geo-json`, `xml`) | `delimited` |
| `--httpTls` | Enable TLS (HTTPS) | `true` |
| `--httpTlsCaPath <path>` | CA certificate file path | system default |
| `--httpTlsCertPath <path>` | Client/server certificate file path | - |
| `--httpTlsKeyPath <path>` | Private key file path | - |
| `--httpPath <path>` | HTTP endpoint URL path | `/` |

## Metadata logging

When "Show Metadata" is enabled, HTTP connections log request metadata:

```text
[metadata] protocol=HTTP mode=server method=POST path=/ content-type=application/json content-length=245 tls=on (HTTPS) remote=127.0.0.1:52341 format=json
```

## Launch configuration

HTTP parameters can be set in launch configuration JSON files:

```json
{
  "connection": {
    "protocol": "http",
    "mode": "client",
    "ip": "velocity.example.com",
    "port": 8443,
    "httpFormat": "delimited",
    "httpTls": true,
    "httpPath": "/receiver/feed-id"
  }
}
```

## Related documentation

- [TLS guide](tls.md)
- [gRPC transport](grpc.md)
- [WebSocket transport](websocket.md)
- [Repository overview](../README.md)
