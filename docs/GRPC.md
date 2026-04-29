# gRPC Transport

The ArcGIS Velocity Logger supports gRPC as a transport protocol alongside TCP and UDP. It supports three **gRPC Feature Serialization Formats** for compatibility with different ArcGIS Velocity ingestion paths.

## Feature Serialization Formats

The `grpcSerialization` parameter controls how feature data is decoded from the wire. The default is `protobuf`.

| Format | Service | Proto File | Description |
|--------|---------|-----------|-------------|
| **Protobuf** (default) | `GrpcFeed` | `velocity-grpc.proto` | Velocity external protocol. Features decoded from typed `google.protobuf.Any`-wrapped attributes. |
| **Kryo** | `GrpcFeatureService` | `feature-service.proto` | Velocity internal protocol. Raw bytes received and displayed as UTF-8 text. |
| **Text** | `GrpcFeatureService` | `feature-service.proto` | Velocity internal protocol. Plain UTF-8 text received in the bytes field. |

### Protobuf Format (Default)

Uses the Velocity external gRPC Feed service:

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

### Attribute Decoding (Protobuf Format)

Each attribute in a received `Feature` is a `google.protobuf.Any` message wrapping a standard protobuf wrapper type. The logger unpacks these and displays them as human-readable CSV:

| Protobuf Wrapper | Displayed As |
|---|---|
| `google.protobuf.StringValue` | String value |
| `google.protobuf.Int32Value` | Integer |
| `google.protobuf.Int64Value` | Long integer |
| `google.protobuf.FloatValue` | Float |
| `google.protobuf.DoubleValue` | Double |
| `google.protobuf.BoolValue` | `true` / `false` |

**Null values** (empty `type_url`) are displayed as empty fields in the CSV output.

### Kryo Format

Uses the Velocity internal `GrpcFeatureService`:

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

The logger receives the `bytes` field and displays it as UTF-8 text. In production Velocity deployments this would contain Kryo-serialized `Feature` objects, but for testing purposes the raw bytes are displayed.

### Text Format

Same service as Kryo. The `bytes` field contains plain UTF-8 text (e.g., a CSV line) which is displayed directly in the log view.

### Why Multiple Formats?

ArcGIS Velocity has two gRPC ingestion paths:

- **Path 1 (internal)**: Uses `GrpcFeatureService` with Kryo-serialized bytes. This is the internal fast-path for Velocity's own output connectors.
- **Path 2 (external)**: Uses the `GrpcFeed` service with typed protobuf `Feature` messages. This is the standard protocol for external clients.

The logger supports all three formats to test and debug both paths.

## Modes

### gRPC Server (Default for Logger)

The logger hosts a gRPC server. Depending on the serialization format:

- **Protobuf**: Hosts a `GrpcFeed` server. Inbound clients send features via `Send` (unary) or `Stream` (client-streaming) RPCs. The `Watch` RPC is also defined in the proto but not handled in this direction — it is used when the logger itself acts as a *client* subscribing to a server.
- **Kryo / Text**: Hosts a `GrpcFeatureService` server. Inbound clients send requests via `execute` (unary) or `executeMulti` (bidirectional streaming) RPCs. The `watch` RPC is likewise defined for the reverse client role.

Each received feature is decoded and displayed as a line in the log view.

When **Show Metadata** is enabled, metadata lines are prepended before each received message. The content depends on mode:

#### gRPC Server metadata
One `[metadata]` line is emitted per incoming call. It starts with connection-level context, followed by the deadline and the call-level gRPC headers sent by the client:

```
[metadata] protocol=gRPC mode=server serialization=protobuf rpc=Send remote=ipv4:127.0.0.1:54321 local=127.0.0.1:50051 deadline=none content-type=application/grpc grpc-path=my.feed.uid
```

Fields in order:
- `protocol=gRPC` — always `gRPC` for gRPC connections
- `mode=server` — always `server` for the server transport
- `grpcSerialization=protobuf|text|kryo` — the active serialization format
- `rpc=Send|Stream|execute|executeMulti` — the RPC method that received the call
- `remote=` — the remote client address as reported by `call.getPeer()` (e.g. `ipv4:127.0.0.1:54321`)
- `local=` — the local bind address and port (e.g. `127.0.0.1:50051`)
- `deadline=` — the call deadline set by the client (`none` if no deadline was set, otherwise an ISO-8601 timestamp)
- _call headers_ — all gRPC call metadata key-value pairs sent by the client (HTTP/2 request headers, e.g. `content-type`, `grpc-path`, custom headers)

#### gRPC Client metadata
Three metadata lines are emitted per connection lifecycle, plus one per received data message:

1. **Connection-established line** — emitted immediately after the `Watch`/`watch` stream opens:
   ```
   [metadata] protocol=gRPC mode=client serialization=protobuf method=stream rpc=Watch remote=127.0.0.1:50051
   ```
   Fields:
   - `protocol=gRPC` — always `gRPC`
   - `mode=client` — always `client` for the client transport
   - `serialization=protobuf|text|kryo` — the active serialization format
   - `method=stream|unary` — the configured **gRPC RPC Type** (stream = client-streaming, unary = discrete request/response)
   - `rpc=Watch|watch` — the **server-streaming RPC** the logger called to subscribe to incoming data. `Watch` (capital W) is the RPC name in the `GrpcFeed` service used by the **protobuf** format (`velocity-grpc.proto`); `watch` (lowercase) is the RPC name in the `GrpcFeatureService` service used by the **text** and **kryo** formats (`feature-service.proto`). Both are server-streaming calls — the logger sends one request and the server pushes a continuous stream of messages back.
   - `remote=HOST:PORT` — the address of the gRPC server the logger connected to

2. **Per-message line** — emitted for each data message received, immediately before the data line:
   - Protobuf (`rpc=Watch`): includes `feature=N/TOTAL` indicating which feature within the batch:
     ```
     [metadata] protocol=gRPC mode=client serialization=protobuf method=stream rpc=Watch remote=127.0.0.1:50051 feature=1/3
     ```
   - Text/kryo (`rpc=watch`): includes `size=N` (byte length of the payload):
     ```
     [metadata] protocol=gRPC mode=client serialization=text method=stream rpc=watch remote=127.0.0.1:50051 size=42
     ```

3. **Response-headers line** — initial metadata sent back from the server (emitted on the stream `metadata` event):
   ```
   [metadata] response-headers: content-type=application/grpc x-server-id=simulator
   ```

4. **Status line** — emitted when the stream ends, including the gRPC status code, details, and any trailing metadata:
   ```
   [metadata] status: code=0 details="OK"
   ```


All metadata lines are always captured in memory; toggling **Show Metadata** on/off retroactively shows or hides them for all buffered entries without requiring a reconnect.

### gRPC Client (Logger subscribing to a simulator or Velocity server)

The logger connects to a remote gRPC server and **subscribes to receive data** pushed by the server via a server-streaming RPC. This is the mode to use when pairing with the **ArcGIS Velocity Simulator** in gRPC Server mode.

How it works depending on serialization:

- **Protobuf**: Connects to a `GrpcFeed` server and calls `Watch(WatchRequest)`. The server streams `Request` messages (containing `Feature` attributes) which the logger decodes and displays as CSV lines.
- **Kryo / Text**: Connects to a `GrpcFeatureService` server and calls `watch(GrpcWatchRequest)`. The server streams `GrpcFeatureRequest` messages whose `bytes` field the logger decodes as UTF-8 text.

The optional `grpcHeaderPathKey` / `grpcHeaderPath` parameters inject a metadata header on the `Watch`/`watch` call. This is required when connecting to a real ArcGIS Velocity endpoint so the platform can route the subscription to the correct feed item. When connecting to the Simulator, these parameters are accepted but ignored by the server.

## Feature Examples

Below are examples of features received and displayed by the logger using the **Protobuf** serialization format.

### Example 1: Vehicle Tracking (Fleet GPS)

**Received Feature attributes:**
```
attributes[0] = Any { type_url: "type.googleapis.com/google.protobuf.StringValue", value: <encoded "vehicle-001"> }
attributes[1] = Any { type_url: "type.googleapis.com/google.protobuf.DoubleValue", value: <encoded -117.1956> }
attributes[2] = Any { type_url: "type.googleapis.com/google.protobuf.DoubleValue", value: <encoded 34.0572> }
attributes[3] = Any { type_url: "type.googleapis.com/google.protobuf.DoubleValue", value: <encoded 65.3> }
attributes[4] = Any { type_url: "type.googleapis.com/google.protobuf.BoolValue",   value: <encoded true> }
attributes[5] = Any { type_url: "type.googleapis.com/google.protobuf.Int64Value",  value: <encoded 1609459200000> }
```

**Logger displays:**
```
vehicle-001,-117.1956,34.0572,65.3,true,1609459200000
```

### Example 2: Weather Station Observations

**Logger displays:**
```
WX-SFO-042,37.6213,-122.379,18.5,72,1013.25,false,1714500000000
```

### Example 3: IoT Sensor Alert

**Logger displays:**
```
sensor-9A3F,CRITICAL,Tank overflow detected,98.7,250,true,1714503600000
```

### Example 4: AIS Maritime Vessel Position

**Logger displays:**
```
367596000,EVER GIVEN,-122.4194,37.7749,12.4,245,15,false,1714507200000
```

### Example 5: Geofence Entry Event

**Logger displays:**
```
truck-42,"POLYGON((-118.3 34.0,-118.3 34.1,-118.2 34.1,-118.2 34.0,-118.3 34.0))",ENTER,warehouse-7,1714510800000
```

Note: String values containing commas are automatically quoted in the CSV output.

## CLI / Headless Usage

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
| `grpcSerialization=protobuf` | Use Velocity external GrpcFeed protocol with typed Any-wrapped attributes (default) |
| `grpcSerialization=kryo` | Use Velocity internal GrpcFeatureService protocol with raw bytes |
| `grpcSerialization=text` | Use Velocity internal GrpcFeatureService protocol with plain UTF-8 text |
| `grpcSendMethod=stream` | Client Streaming RPC — multiplexes all messages over a single persistent HTTP/2 stream (default). Higher throughput, lower per-message overhead. Client mode only. |
| `grpcSendMethod=unary` | Unary RPC — sends each message as a discrete request/response round-trip. Simpler to trace and debug. Client mode only. |
| `showMetadata=true` | Write connection/call metadata lines to the output before each received message (default: `false`). For server mode: call headers per incoming RPC. For client mode: connection-established, response-headers, and status lines. |
| `useTls` | Use TLS (SSL) for the gRPC connection (default: `false`). When `true`, uses SSL credentials instead of plaintext. |
| `tlsCaPath` | Path to a custom CA certificate file (PEM). When omitted with `useTls=true`, OS root certificates are loaded automatically (see [TLS & Certificate Stores](#tls--certificate-stores)). |
| `tlsCertPath` | Path to a client/server certificate file (PEM) for mutual TLS. Required for TLS server mode. |
| `tlsKeyPath` | Path to a private key file (PEM) for mutual TLS. Required for TLS server mode. |

## UI Usage

When gRPC is selected as the connection type in the UI, the following controls appear:

- **Serialization** — `Protobuf` (default), `Kryo`, or `Text`
- **RPC type** — `Client Streaming` (default) or `Unary`. Selects the gRPC call pattern for sending data. Client Streaming opens a persistent stream for high-throughput ingestion. Unary sends each message as an independent request/response round-trip. Only applies in gRPC Client mode. **Locked while connected** (the streaming vs. unary choice is baked into the transport at connect time).
- **TLS** — Checkbox to enable TLS (SSL) connections. When checked, additional certificate path fields appear.
- **CA cert path** — Path to a custom CA certificate file (PEM). Leave empty to use OS root certificates automatically.
- **TLS cert path** — Path to a client/server certificate file (PEM) for mutual TLS.
- **TLS key path** — Path to a private key file (PEM) for mutual TLS.
- **Header path key** — gRPC endpoint header path key (default: `grpc-path`). Sent as gRPC metadata on every outgoing call. **Visible only in gRPC Client mode.**
- **Header path** — gRPC endpoint header path value (default: `replace.with.dedicated.uid`). Sent as gRPC metadata on every outgoing call. **Visible only in gRPC Client mode.**

The serialization and TLS controls are shown for both client and server modes. The header controls are shown only when **gRPC Client** is selected, since they have no effect in server mode (the server only receives incoming connections and never initiates outgoing calls).

### Tooltip Reference

The following tooltips appear when hovering over gRPC-related controls in the UI. These are set dynamically via `GRPC_SERIALIZATION_TOOLTIPS` and `GRPC_SEND_METHOD_TOOLTIPS` in `renderer.js`.

#### Serialization Tooltips

| Value | Tooltip |
|-------|---------|
| Protobuf | gRPC Feature Serialization Format: Protobuf. Uses the ArcGIS Velocity external GrpcFeed protocol (velocity-grpc.proto) with typed Feature messages and google.protobuf.Any-wrapped attributes. Recommended for standard external Velocity gRPC interoperability. |
| Kryo | gRPC Feature Serialization Format: Kryo. Uses the internal GrpcFeatureService protocol (feature-service.proto) where the bytes field carries raw binary feature payloads. Intended for internal-path compatibility and advanced testing. |
| Text | gRPC Feature Serialization Format: Text. Uses the internal GrpcFeatureService protocol (feature-service.proto) where the bytes field carries plain UTF-8 text, typically a CSV line. Best for simple human-readable testing. |

#### RPC Type Tooltips

| Value | Tooltip |
|-------|---------|
| Client Streaming | gRPC RPC Type: Client Streaming. Opens a persistent client-streaming RPC and multiplexes all messages over a single long-lived HTTP/2 stream. Ideal for high-throughput ingestion with minimal per-message overhead. |
| Unary | gRPC RPC Type: Unary. Each message is sent as a discrete request/response round-trip. Easier to trace and debug, but incurs per-call overhead. |

### CLI Prepopulation of UI Fields

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

## TLS & Certificate Stores

When `useTls=true` is set without a custom `tlsCaPath`, the app merges the Node.js bundled root CAs with certificates from the OS certificate store. This ensures enterprise/internal CAs (e.g. Esri Root CA) are trusted without requiring a manual PEM file.

| Platform | Source | Method |
|----------|--------|--------|
| **macOS** | System and SystemRoot keychains | `security find-certificate -a -p` |
| **Linux** | System PEM bundle | Reads from `/etc/ssl/certs/ca-certificates.crt`, `/etc/pki/tls/certs/ca-bundle.crt`, or `/etc/ssl/ca-bundle.pem` |
| **Windows** | `LocalMachine\Root` and `CurrentUser\Root` stores | PowerShell `Get-ChildItem Cert:\` via `-EncodedCommand` |

The merged set is deduplicated and passed to `grpc.credentials.createSsl()`. The connection log shows the cert breakdown on connect. Examples:

**Client mode — OS root CAs (no custom cert):**
```
gRPC Client connected to mcstest492.esri.com:7145 [protobuf] grpc-path=dedicated.abc123
  tls=on, 429 trusted CAs loaded, node-bundled=144, os=Windows certificate store (285)
```

**Client mode — custom CA cert:**
```
gRPC Client connected to myserver.example.com:7145 [protobuf] grpc-path=dedicated.abc123
  tls=on, custom certs: ca=./certs/ca.pem
```

**Server mode — TLS with cert and key:**
```
gRPC Server listening on 0.0.0.0:50051 [protobuf]
  tls=on, server certs: cert=./certs/server.pem, key=./certs/server-key.pem
```

**Any mode — TLS off:**
```
  tls=off (unsecure)
```

To override the automatic OS CA lookup on the client side, set `tlsCaPath` to a PEM file path.

### Server-mode TLS requirements

Server-mode TLS has a hard requirement that **both `tlsCertPath` and `tlsKeyPath` must be provided**. There is no fallback to OS or system certificates, because the two roles are fundamentally different:

- **Client TLS** — the client needs *trust anchors* (CA root certs) to verify the server's identity. The OS certificate store is exactly that, which is why client mode can fall back to it automatically.
- **Server TLS** — the server must *present its own identity certificate* to connecting clients. OS root CAs are trust anchors for verifying others; they are not server identity certificates. Without an explicit cert+key pair there is nothing to present, so the connection fails immediately.

If you see the error `TLS server mode requires both tlsCertPath and tlsKeyPath`, your options are:

1. **Disable TLS** — uncheck **TLS** (or omit `useTls`) to use plaintext (unsecure) mode. Suitable for local/dev testing between the Logger and Simulator.
2. **Provide a self-signed cert+key** — generate a pair with OpenSSL and supply both paths:
   ```bash
   openssl req -x509 -newkey rsa:4096 -keyout server-key.pem -out server.pem -days 365 -nodes -subj "/CN=localhost"
   ```
   Then set `tlsCertPath=./server.pem` and `tlsKeyPath=./server-key.pem`. The connecting client will need `useTls=true` and either `tlsCaPath=./server.pem` (self-signed) or have the cert trusted in its OS store.

## Examples

### Example A: Simulator (Client) → Logger (Server)

The classic push scenario: simulator sends features, Logger receives them.

1. Start the Logger in **gRPC Server** mode on port 50051 with **Protobuf** serialization
2. Start the Simulator in **gRPC Client** mode pointing to `127.0.0.1:50051` with **Protobuf** serialization
3. Load a CSV file in the Simulator and press Play — decoded features appear in the Logger

### Example B: Simulator (Server) → Logger (Client)

The reverse scenario: Logger subscribes and receives features pushed by the Simulator.

1. Start the Simulator in **gRPC Server** mode on port 50051 with **Protobuf** serialization
2. Load a CSV file in the Simulator but do **not** press Play yet
3. Start the Logger in **gRPC Client** mode pointing to `127.0.0.1:50051` with **Protobuf** serialization — this calls `Watch` and subscribes
4. Press Play in the Simulator — decoded features are pushed to the Logger in real time

Both scenarios work with all three serialization formats (protobuf, text, kryo).
