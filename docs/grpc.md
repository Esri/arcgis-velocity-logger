# gRPC transport

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

The ArcGIS Velocity Logger supports gRPC as a transport protocol alongside TCP and UDP. It supports three gRPC Feature Serialization Formats for compatibility with different ArcGIS Velocity ingestion paths, and can run either as a gRPC server accepting inbound calls or as a gRPC client subscribing to a remote server.

This guide is intended for users and developers configuring gRPC connections between the Logger and ArcGIS Velocity or the ArcGIS Velocity Simulator, and assumes basic familiarity with gRPC/protobuf concepts. For general TLS/certificate concepts shared across transports, see the [TLS guide](tls.md).

## Table of contents

- [Feature serialization formats](#feature-serialization-formats)
- [Modes](#modes)
- [Feature examples](#feature-examples)
- [CLI / headless usage](#cli--headless-usage)
- [UI usage](#ui-usage)
- [Compatibility](#compatibility)
- [TLS and certificate stores](#tls-and-certificate-stores)
- [Examples](#examples)
- [Related documentation](#related-documentation)

## Feature serialization formats

The `grpcSerialization` parameter controls how feature data is decoded from the wire. The default is `protobuf`.

| Format | Service | Proto file | Description |
|--------|---------|-----------|-------------|
| **Protobuf** (default) | `GrpcFeed` | `velocity-grpc.proto` | ArcGIS Velocity external protocol. Features decoded from typed `google.protobuf.Any`-wrapped attributes. |
| **Kryo** | `GrpcFeatureService` | `feature-service.proto` | ArcGIS Velocity internal protocol. Raw bytes received and displayed as UTF-8 text. |
| **Text** | `GrpcFeatureService` | `feature-service.proto` | ArcGIS Velocity internal protocol. Plain UTF-8 text received in the bytes field. |

### Protobuf format (default)

Uses the ArcGIS Velocity external gRPC Feed service:

```protobuf
syntax = "proto3";
package esri.realtime.core.grpc;
import "google/protobuf/any.proto";

message Request {
  repeated Feature features = 1;
}

message Feature {
  repeated google.protobuf.Any attributes = 1;
}

message Response {
  string message = 1;
  int32 code = 2;
}

service GrpcFeed {
  rpc Stream(stream Request) returns (Response);    // client-streaming (logger receives inbound)
  rpc Send(Request) returns (Response);             // unary (logger receives inbound)
  rpc Watch(WatchRequest) returns (stream Request); // server-streaming (logger subscribes as client)
}

message WatchRequest {
  string client_id = 1;
}
```

### Attribute decoding (protobuf format)

Each attribute in a received `Feature` is a `google.protobuf.Any` message wrapping a standard protobuf wrapper type. The logger unpacks these and displays them as human-readable CSV:

| Protobuf wrapper | Displayed as |
|---|---|
| `google.protobuf.StringValue` | String value |
| `google.protobuf.Int32Value` | Integer |
| `google.protobuf.Int64Value` | Long integer |
| `google.protobuf.FloatValue` | Float |
| `google.protobuf.DoubleValue` | Double |
| `google.protobuf.BoolValue` | `true` / `false` |

**Null values** (empty `type_url`) are displayed as empty fields in the CSV output.

### Kryo format

Uses the ArcGIS Velocity internal `GrpcFeatureService`:

```protobuf
service GrpcFeatureService {
  rpc execute(GrpcFeatureRequest) returns (GrpcFeatureResponse);
  rpc executeMulti(stream GrpcFeatureRequest) returns (stream GrpcFeatureResponse);
  rpc watch(GrpcWatchRequest) returns (stream GrpcFeatureRequest); // server-streaming (logger subscribes as client)
}

message GrpcWatchRequest {
  string client_id = 1;
}

message GrpcFeatureRequest {
  string itemId = 1;
  bytes bytes = 2;
}
```

The logger receives the `bytes` field and displays it as UTF-8 text. In production ArcGIS Velocity deployments this would contain Kryo-serialized `Feature` objects, but for testing purposes the raw bytes are displayed.

### Text format

Same service as Kryo. The `bytes` field contains plain UTF-8 text (e.g., a CSV line) which is displayed directly in the log view.

### Why multiple formats?

ArcGIS Velocity has two gRPC ingestion paths:

- **Path 1 (internal)**: Uses `GrpcFeatureService` with Kryo-serialized bytes. This is the internal fast-path for ArcGIS Velocity's own output connectors.
- **Path 2 (external)**: Uses the `GrpcFeed` service with typed protobuf `Feature` messages. This is the standard protocol for external clients.

The logger supports all three formats to test and debug both paths.

## Modes

### gRPC server (default for logger)

The logger hosts a gRPC server. Depending on the serialization format:

- **Protobuf**: Hosts a `GrpcFeed` server. Inbound clients send features via `Send` (unary) or `Stream` (client-streaming) RPCs. The `Watch` RPC is also defined in the proto but not handled in this direction - it is used when the logger itself acts as a *client* subscribing to a server.
- **Kryo / Text**: Hosts a `GrpcFeatureService` server. Inbound clients send requests via `execute` (unary) or `executeMulti` (bidirectional streaming) RPCs. The `watch` RPC is likewise defined for the reverse client role.

Each received feature is decoded and displayed as a line in the log view.

When **Show Metadata** is enabled, metadata lines are prepended before each received message. The content depends on mode:

#### gRPC server metadata

One `[metadata]` line is emitted per incoming call. It starts with connection-level context, followed by the deadline and the call-level gRPC headers sent by the client:

```text
[metadata] protocol=gRPC mode=server serialization=protobuf rpc=Send remote=ipv4:127.0.0.1:54321 local=127.0.0.1:50051 deadline=none content-type=application/grpc grpc-path=my.feed.uid
```

Fields in order:
- `protocol=gRPC` - always `gRPC` for gRPC connections
- `mode=server` - always `server` for the server transport
- `grpcSerialization=protobuf|text|kryo` - the active serialization format
- `rpc=Send|Stream|execute|executeMulti` - the RPC method that received the call
- `remote=` - the remote client address as reported by `call.getPeer()` (e.g. `ipv4:127.0.0.1:54321`)
- `local=` - the local bind address and port (e.g. `127.0.0.1:50051`)
- `deadline=` - the call deadline set by the client (`none` if no deadline was set, otherwise an ISO-8601 timestamp)
- _call headers_ - all gRPC call metadata key-value pairs sent by the client (HTTP/2 request headers, e.g. `content-type`, `grpc-path`, custom headers)

#### gRPC client metadata

Three metadata lines are emitted per connection lifecycle, plus one per received data message:

1. **Connection-established line** - emitted immediately after the `Watch`/`watch` stream opens:
   ```text
   [metadata] protocol=gRPC mode=client serialization=protobuf method=stream rpc=Watch remote=127.0.0.1:50051
   ```
   Fields:
   - `protocol=gRPC` - always `gRPC`
   - `mode=client` - always `client` for the client transport
   - `serialization=protobuf|text|kryo` - the active serialization format
   - `method=stream|unary` - the configured **gRPC RPC Type** (stream = client-streaming, unary = discrete request/response)
   - `rpc=Watch|watch` - the **server-streaming RPC** the logger called to subscribe to incoming data. `Watch` (capital W) is the RPC name in the `GrpcFeed` service used by the **protobuf** format (`velocity-grpc.proto`); `watch` (lowercase) is the RPC name in the `GrpcFeatureService` service used by the **text** and **kryo** formats (`feature-service.proto`). Both are server-streaming calls - the logger sends one request and the server pushes a continuous stream of messages back.
   - `remote=HOST:PORT` - the address of the gRPC server the logger connected to

2. **Per-message line** - emitted for each data message received, immediately before the data line:
   - Protobuf (`rpc=Watch`): includes `feature=N/TOTAL` indicating which feature within the batch:
     ```text
     [metadata] protocol=gRPC mode=client serialization=protobuf method=stream rpc=Watch remote=127.0.0.1:50051 feature=1/3
     ```
   - Text/kryo (`rpc=watch`): includes `size=N` (byte length of the payload):
     ```text
     [metadata] protocol=gRPC mode=client serialization=text method=stream rpc=watch remote=127.0.0.1:50051 size=42
     ```

3. **Response-headers line** - initial metadata sent back from the server (emitted on the stream `metadata` event):
   ```text
   [metadata] response-headers: content-type=application/grpc x-server-id=simulator
   ```

4. **Status line** - emitted when the stream ends, including the gRPC status code, details, and any trailing metadata:
   ```text
   [metadata] status: code=0 details="OK"
   ```

All metadata lines are always captured in memory; toggling **Show Metadata** on/off retroactively shows or hides them for all buffered entries without requiring a reconnect.

### gRPC client (logger subscribing to a simulator or ArcGIS Velocity server)

The logger connects to a remote gRPC server and **subscribes to receive data** pushed by the server via a server-streaming RPC. This is the mode to use when pairing with the **ArcGIS Velocity Simulator** in gRPC Server mode.

How it works depending on serialization:

- **Protobuf**: Connects to a `GrpcFeed` server and calls `Watch(WatchRequest)`. The server streams `Request` messages (containing `Feature` attributes) which the logger decodes and displays as CSV lines.
- **Kryo / Text**: Connects to a `GrpcFeatureService` server and calls `watch(GrpcWatchRequest)`. The server streams `GrpcFeatureRequest` messages whose `bytes` field the logger decodes as UTF-8 text.

The optional `grpcHeaderPathKey` / `grpcHeaderPath` parameters inject a metadata header on the `Watch`/`watch` call. This is required when connecting to a real ArcGIS Velocity endpoint so the platform can route the subscription to the correct feed item. When connecting to the Simulator, these parameters are accepted but ignored by the server.

Disconnect always completes. It cancels the streaming subscription, waits for
that call to settle, and closes the channel. When the peer disappeared first,
the pending call ends with an error such as `14 UNAVAILABLE: Connection
dropped`; that is recorded as a teardown diagnostic in the log, the channel is
still closed, and neither a headless capture that already collected its records
nor the user interface is left reporting a connection that no longer exists.

## Feature examples

Below are examples of features received and displayed by the logger using the **Protobuf** serialization format.

### Example 1: Vehicle tracking (fleet GPS)

**Received Feature attributes:**
```text
attributes[0] = Any { type_url: "type.googleapis.com/google.protobuf.StringValue", value: <encoded "vehicle-001"> }
attributes[1] = Any { type_url: "type.googleapis.com/google.protobuf.DoubleValue", value: <encoded -117.1956> }
attributes[2] = Any { type_url: "type.googleapis.com/google.protobuf.DoubleValue", value: <encoded 34.0572> }
attributes[3] = Any { type_url: "type.googleapis.com/google.protobuf.DoubleValue", value: <encoded 65.3> }
attributes[4] = Any { type_url: "type.googleapis.com/google.protobuf.BoolValue",   value: <encoded true> }
attributes[5] = Any { type_url: "type.googleapis.com/google.protobuf.Int64Value",  value: <encoded 1609459200000> }
```

**Logger displays:**
```text
vehicle-001,-117.1956,34.0572,65.3,true,1609459200000
```

### Example 2: Weather station observations

**Logger displays:**
```text
WX-SFO-042,37.6213,-122.379,18.5,72,1013.25,false,1714500000000
```

### Example 3: IoT sensor alert

**Logger displays:**
```text
sensor-9A3F,CRITICAL,Tank overflow detected,98.7,250,true,1714503600000
```

### Example 4: AIS maritime vessel position

**Logger displays:**
```text
367596000,EVER GIVEN,-122.4194,37.7749,12.4,245,15,false,1714507200000
```

### Example 5: Geofence entry event

**Logger displays:**
```text
truck-42,"POLYGON((-118.3 34.0,-118.3 34.1,-118.2 34.1,-118.2 34.0,-118.3 34.0))",ENTER,warehouse-7,1714510800000
```

> [!NOTE]
> String values containing commas are automatically quoted in the CSV output.

## CLI / headless usage

```bash
# gRPC server mode with Protobuf serialization (default)
electron . runMode=headless protocol=grpc mode=server ip=0.0.0.0 port=50051

# gRPC server mode with Protobuf serialization + metadata output
electron . runMode=headless protocol=grpc mode=server ip=0.0.0.0 port=50051 showMetadata=true

# gRPC server mode with Text serialization
electron . runMode=headless protocol=grpc mode=server ip=0.0.0.0 port=50051 grpcSerialization=text

# gRPC server mode with Kryo serialization
electron . runMode=headless protocol=grpc mode=server ip=0.0.0.0 port=50051 grpcSerialization=kryo

# gRPC client mode
electron . runMode=headless protocol=grpc mode=client ip=127.0.0.1 port=50051 grpcSerialization=protobuf

# gRPC client mode with metadata output
electron . runMode=headless protocol=grpc mode=client ip=127.0.0.1 port=50051 showMetadata=true

# gRPC client mode with a custom header path
electron . runMode=headless protocol=grpc mode=client ip=127.0.0.1 port=50051 grpcHeaderPathKey=grpc-path grpcHeaderPath=my.feed.dedicated.uid

# gRPC client mode with TLS (for connecting to Velocity endpoints with SSL)
electron . runMode=headless protocol=grpc mode=client ip=mcstest492.esri.com port=7145 useTls=true grpcHeaderPathKey=grpc-path grpcHeaderPath=dedicated.c7bf318b252a4b55bf63bb13da8721fd

# gRPC server mode with TLS (requires cert and key)
electron . runMode=headless protocol=grpc mode=server ip=0.0.0.0 port=50051 useTls=true tlsCertPath=./certs/server.pem tlsKeyPath=./certs/server-key.pem
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `grpcHeaderPath` | Value sent as the gRPC endpoint header path (default: `replace.with.dedicated.uid`). Client mode only. |
| `grpcHeaderPathKey` | Key name for the gRPC endpoint header path metadata entry (default: `grpc-path`). Client mode only. |
| `ip` | Bind address (server mode) or target address (client mode) |
| `mode=client` | Connect as a gRPC client to a server |
| `mode=server` | Host a gRPC server and log incoming features |
| `port` | Bind port (server mode) or target port (client mode) |
| `protocol=grpc` | Select gRPC transport |
| `grpcSerialization=protobuf` | Use ArcGIS Velocity external GrpcFeed protocol with typed Any-wrapped attributes (default) |
| `grpcSerialization=kryo` | Use ArcGIS Velocity internal GrpcFeatureService protocol with raw bytes |
| `grpcSerialization=text` | Use ArcGIS Velocity internal GrpcFeatureService protocol with plain UTF-8 text |
| `grpcSendMethod=stream` | Client Streaming RPC - multiplexes all messages over a single persistent HTTP/2 stream (default). Higher throughput, lower per-message overhead. Client mode only. |
| `grpcSendMethod=unary` | Unary RPC - sends each message as a discrete request/response round-trip. Simpler to trace and debug. Client mode only. |
| `showMetadata=true` | Write connection/call metadata lines to the output before each received message (default: `false`). For server mode: call headers per incoming RPC. For client mode: connection-established, response-headers, and status lines. |
| `useTls` | Use TLS (SSL) for the gRPC connection (default: `false`). When `true`, uses SSL credentials instead of plaintext. |
| `tlsCaPath` | Path to a custom CA certificate file (PEM). When omitted with `useTls=true`, OS root certificates are loaded automatically (see [TLS and certificate stores](#tls-and-certificate-stores)). |
| `tlsCertPath` | Path to a client/server certificate file (PEM) for mutual TLS. Required for TLS server mode. |
| `tlsKeyPath` | Path to a private key file (PEM) for mutual TLS. Required for TLS server mode. |
| `allowUnverifiedTls` | Client mode only. Explicitly accept an unverified server certificate (default: `false`). The bypass applies to any host, not only localhost. |

## UI usage

When gRPC is selected as the connection type, its controls live in the **Protocol Settings** dialog (**Settings** in the connection row, or `Cmd/Ctrl+Shift+P`), grouped into **Basics**, **Security**, and — in client mode — **Advanced**. See [Connection summary and protocol settings](connection-summary.md).

The following controls appear:

- **Serialization** - `Protobuf` (default), `Kryo`, or `Text`
- **RPC type** - `Client Streaming` (default) or `Unary`. Selects the gRPC call pattern for sending data. Client Streaming opens a persistent stream for high-throughput ingestion. Unary sends each message as an independent request/response round-trip. Only applies in gRPC Client mode. **Locked while connected** (the streaming vs. unary choice is baked into the transport at connect time).
- **TLS** - Checkbox to enable TLS (SSL) connections. When checked, additional certificate path fields appear.
- **Section** - **Basics** holds Serialization and RPC type; **Security** holds TLS, the certificate paths, and the verification option; **Advanced** holds the client-only endpoint header.
- **CA cert path** - Path to a custom CA certificate file (PEM). Leave empty to use OS root certificates automatically.
- **TLS cert path** - Path to a client/server certificate file (PEM) for mutual TLS.
- **TLS key path** - Path to a private key file (PEM) for mutual TLS.
- **Allow unverified** - Client-only warning checkbox in **Security**, shown when TLS is enabled. Accepts an unverified server certificate for any host. Off by default; see [TLS and SSL security](tls.md#explicit-certificate-verification-bypass).
- **Header path key** - gRPC endpoint header path key (default: `grpc-path`). Sent as gRPC metadata on every outgoing call. **Visible only in gRPC Client mode.**
- **Header path** - gRPC endpoint header path value (default: `replace.with.dedicated.uid`). Sent as gRPC metadata on every outgoing call. **Visible only in gRPC Client mode.**

The serialization and TLS controls are shown for both client and server modes. The header controls are shown only when **gRPC Client** is selected, since they have no effect in server mode (the server only receives incoming connections and never initiates outgoing calls).

### Tooltip reference

The following tooltips appear when hovering over gRPC-related controls in the UI. These are set dynamically via `GRPC_SERIALIZATION_TOOLTIPS` and `GRPC_SEND_METHOD_TOOLTIPS` in `renderer.js`.

#### Serialization tooltips

| Value | Tooltip |
|-------|---------|
| Protobuf | gRPC Feature Serialization Format: Protobuf. Uses the ArcGIS Velocity external GrpcFeed protocol (velocity-grpc.proto) with typed Feature messages and google.protobuf.Any-wrapped attributes. Recommended for standard external Velocity gRPC interoperability. |
| Kryo | gRPC Feature Serialization Format: Kryo. Uses the internal GrpcFeatureService protocol (feature-service.proto) where the bytes field carries raw binary feature payloads. Intended for internal-path compatibility and advanced testing. |
| Text | gRPC Feature Serialization Format: Text. Uses the internal GrpcFeatureService protocol (feature-service.proto) where the bytes field carries plain UTF-8 text, typically a CSV line. Best for simple human-readable testing. |

#### Control tooltips

| Control | Tooltip |
|---------|---------|
| Serialization field label | Feature serialization used by the gRPC connection |
| RPC type field label | RPC pattern used for each message |
| CA certificate field label | Custom certificate authority used to verify the gRPC peer |
| Certificate field label | Certificate presented by this gRPC connection |
| Private key field label | Private key that matches the gRPC certificate |
| Endpoint header key field label | Metadata header key used to route the gRPC endpoint |
| Endpoint header path field label | Metadata header value that identifies the gRPC endpoint |
| Allow unverified | Warning: accept any gRPC server certificate<br>---<br>Certificate verification is disabled for every host, not only localhost. Traffic stays encrypted, but the server identity is not checked. Use only for local self-signed testing. |

#### RPC type tooltips

| Value | Tooltip |
|-------|---------|
| Client Streaming | gRPC RPC Type: Client Streaming. Opens a persistent client-streaming RPC and multiplexes all messages over a single long-lived HTTP/2 stream. Ideal for high-throughput ingestion with minimal per-message overhead. |
| Unary | gRPC RPC Type: Unary. Each message is sent as a discrete request/response round-trip. Easier to trace and debug, but incurs per-call overhead. |

### CLI prepopulation of UI fields

Connection parameters can be passed on the command line even in UI mode to prepopulate the UI controls. For example:

```bash
# Launch Logger UI with gRPC client preset and TLS enabled
electron . protocol=grpc mode=client ip=mcstest492.esri.com port=7145 useTls=true grpcHeaderPath=dedicated.c7bf318b252a4b55bf63bb13da8721fd
```

Supported UI-prepopulable parameters: `protocol`, `mode`, `ip`, `port`, `grpcSerialization`, `grpcHeaderPath`, `grpcHeaderPathKey`, `useTls`, `tlsCaPath`, `tlsCertPath`, `tlsKeyPath`.

## Compatibility

- Works with the **ArcGIS Velocity Simulator** in both gRPC client and server modes (both apps must use the same serialization format)
- Works with any client implementing the `GrpcFeed` protocol from `velocity-grpc.proto` (server mode) or any server implementing `Watch`/`watch` (client mode)
- **Protobuf** format is compatible with ArcGIS Velocity external gRPC feed output
- **Kryo/Text** formats are compatible with ArcGIS Velocity internal gRPC connectors
- Uses `@grpc/grpc-js` + `protobufjs` (pure JavaScript, no native compilation required)
- Supports both plaintext (unsecure) and TLS (SSL) connections

## TLS and certificate stores

When `useTls=true` is set without a custom `tlsCaPath`, the app merges the Node.js bundled root CAs with certificates from the OS certificate store. This ensures enterprise/internal CAs (e.g. Esri Root CA) are trusted without requiring a manual PEM file.

| Platform | Source | Method |
|----------|--------|--------|
| **macOS** | System and SystemRoot keychains | `security find-certificate -a -p` |
| **Linux** | System PEM bundle | Reads from `/etc/ssl/certs/ca-certificates.crt`, `/etc/pki/tls/certs/ca-bundle.crt`, or `/etc/ssl/ca-bundle.pem` |
| **Windows** | `LocalMachine\Root` and `CurrentUser\Root` stores | PowerShell `Get-ChildItem Cert:\` via `-EncodedCommand` |

The merged set is deduplicated and passed to `grpc.credentials.createSsl()`. The connection log shows the cert breakdown on connect. Examples:

**Client mode - OS root CAs (no custom cert):**
```text
gRPC Client connected to mcstest492.esri.com:7145 [protobuf] grpc-path=dedicated.abc123
  tls=on, 429 trusted CAs loaded, node-bundled=144, os=Windows certificate store (285)
```

**Client mode - custom CA cert:**
```text
gRPC Client connected to myserver.example.com:7145 [protobuf] grpc-path=dedicated.abc123
  tls=on, custom certs: ca=./certs/ca.pem
```

**Server mode - TLS with cert and key:**
```text
gRPC Server listening on 0.0.0.0:50051 [protobuf]
  tls=on, server certs: cert=./certs/server.pem, key=./certs/server-key.pem
```

**Any mode - TLS off:**
```text
  tls=off (unsecure)
```

To override the automatic OS CA lookup on the client side, set `tlsCaPath` to a PEM file path.

### Server-mode TLS - automatic self-signed certificate

When `useTls=true` is set on a server transport **without** providing `tlsCertPath` and `tlsKeyPath`, the app automatically generates an **in-memory self-signed certificate** at startup. This lets you run a TLS-secured server immediately with no certificate files required.

The self-signed cert is valid for `localhost` and `127.0.0.1` (SANs). It is regenerated each time the app starts. The connection log will show:

```text
tls=on, cert=self-signed (auto-generated), key=self-signed (auto-generated)
```

**Connecting a client to a self-signed server:**

Because the certificate is not signed by a trusted CA, connecting clients will reject it by default. Options:

- **Logger / Simulator pairing (same machine):** Turn on **Allow unverified** in the gRPC **Security** section, or pass `allowUnverifiedTls=true`. The bypass is explicit and off by default.
- **Custom CA cert:** If you provide your own `tlsCertPath`/`tlsKeyPath`, the cert is used as-is. Clients that have the CA cert in their trust store will connect without warnings.
- **Providing your own cert:** Generate a self-signed pair with OpenSSL and supply both paths:

  ```bash
  openssl req -x509 -newkey rsa:4096 -keyout server-key.pem -out server.pem -days 365 -nodes -subj "/CN=localhost"
  ```

  Then set `tlsCertPath=./server.pem` and `tlsKeyPath=./server-key.pem`.

### TLS trust badge

When connected, the status bar displays a lock icon reflecting the trust level at a glance. No text label is shown beside the icon - hover or click the badge for full details. The icon **shape** and **colour** both encode the trust level so it is unambiguous for colour-blind users.

| Icon | Colour | Trust level | Meaning |
|------|--------|-------------|---------|
| 🔓 | Grey / dimmed | off | No TLS - plaintext, unsecure connection |
| 🔒 | Amber | on | TLS on - OS certificate store, trust level not fully determined |
| 🔒⚠ | Amber | self-signed | TLS on, but self-signed or cert-chain not verified |
| 🔒✓ | Green | ca-verified | TLS on, CA-verified certificate chain |
| 🔐 | Blue / cyan | mtls | Mutual TLS - both client and server present certificates |

See the [TLS guide](tls.md) for full TLS concepts, certificate file formats, OS trust store behaviour, and setup guides.

## Examples

### Example A: Simulator (client) → Logger (server)

The classic push scenario: simulator sends features, Logger receives them.

1. Start the Logger in **gRPC Server** mode on port 50051 with **Protobuf** serialization
2. Start the Simulator in **gRPC Client** mode pointing to `127.0.0.1:50051` with **Protobuf** serialization
3. Load a CSV file in the Simulator and press Play - decoded features appear in the Logger

### Example B: Simulator (server) → Logger (client)

The reverse scenario: Logger subscribes and receives features pushed by the Simulator.

1. Start the Simulator in **gRPC Server** mode on port 50051 with **Protobuf** serialization
2. Load a CSV file in the Simulator but do **not** press Play yet
3. Start the Logger in **gRPC Client** mode pointing to `127.0.0.1:50051` with **Protobuf** serialization - this calls `Watch` and subscribes
4. Press Play in the Simulator - decoded features are pushed to the Logger in real time

Both scenarios work with all three serialization formats (protobuf, text, kryo).

## Related documentation

- [Connection summary and protocol settings](connection-summary.md)
- [TLS guide](tls.md)
- [HTTP transport](http.md)
- [WebSocket transport](websocket.md)
- [Repository overview](../README.md)
