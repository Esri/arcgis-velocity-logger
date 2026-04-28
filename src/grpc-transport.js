/**
 * Copyright 2026 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @file grpc-transport.js
 * @description
 * gRPC transport for the ArcGIS Velocity Logger.
 *
 * Supports three gRPC Feature Serialization Formats:
 *
 * 1. "protobuf" (default) — Velocity external gRPC Feed protocol (velocity-grpc.proto):
 *    service GrpcFeed { rpc Send(Request) returns (Response); rpc Stream(stream Request) returns (Response); }
 *    message Request { repeated Feature features = 1; }
 *    message Feature { repeated google.protobuf.Any attributes = 1; }
 *
 * 2. "kryo" — Velocity internal protocol (feature-service.proto):
 *    service GrpcFeatureService { rpc execute / executeMulti }
 *    GrpcFeatureRequest { string itemId, bytes bytes } — raw feature payload.
 *
 * 3. "text" — Velocity internal protocol (feature-service.proto):
 *    Same as kryo but bytes contains plain UTF-8 text (e.g. CSV line).
 *
 * Server mode: hosts a gRPC service, receives features and decodes them for display.
 * Client mode: connects to a gRPC server to observe features or test connectivity.
 */
const path = require('path');
const fs = require('fs');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_DIR = path.join(__dirname, 'proto');
const { getSystemRootCertificates, formatTlsCertSummary } = require('./tls-utils');
const VELOCITY_PROTO_PATH = path.join(PROTO_DIR, 'velocity-grpc.proto');
const FEATURE_SERVICE_PROTO_PATH = path.join(PROTO_DIR, 'feature-service.proto');
const WRAPPERS_PROTO_PATH = path.join(PROTO_DIR, 'google', 'protobuf', 'wrappers.proto');

const TYPE_URL_PREFIX = 'type.googleapis.com/';

const SERIALIZATION_FORMATS = Object.freeze({
  PROTOBUF: 'protobuf',
  KRYO: 'kryo',
  TEXT: 'text',
});

const VALID_SERIALIZATION_FORMATS = new Set(Object.values(SERIALIZATION_FORMATS));

function loadVelocityProto() {
  const packageDefinition = protoLoader.loadSync(VELOCITY_PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_DIR],
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

function loadFeatureServiceProto() {
  const packageDefinition = protoLoader.loadSync(FEATURE_SERVICE_PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_DIR],
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

function loadWrapperTypes() {
  const protobuf = require('protobufjs');
  const root = protobuf.loadSync(WRAPPERS_PROTO_PATH);
  return {
    StringValue: root.lookupType('google.protobuf.StringValue'),
    Int32Value: root.lookupType('google.protobuf.Int32Value'),
    Int64Value: root.lookupType('google.protobuf.Int64Value'),
    FloatValue: root.lookupType('google.protobuf.FloatValue'),
    DoubleValue: root.lookupType('google.protobuf.DoubleValue'),
    BoolValue: root.lookupType('google.protobuf.BoolValue'),
  };
}

function unpackAttribute(any, wrapperTypes) {
  if (!any || !any.type_url || any.type_url === '') return null;

  const typeName = any.type_url.replace(TYPE_URL_PREFIX, '');
  const buf = (any.value instanceof Uint8Array || Buffer.isBuffer(any.value))
    ? Buffer.from(any.value)
    : Buffer.alloc(0);

  switch (typeName) {
    case 'google.protobuf.StringValue':
      return wrapperTypes.StringValue.decode(buf).value;
    case 'google.protobuf.Int32Value':
      return wrapperTypes.Int32Value.decode(buf).value;
    case 'google.protobuf.Int64Value':
      return wrapperTypes.Int64Value.decode(buf).value;
    case 'google.protobuf.FloatValue':
      return wrapperTypes.FloatValue.decode(buf).value;
    case 'google.protobuf.DoubleValue':
      return wrapperTypes.DoubleValue.decode(buf).value;
    case 'google.protobuf.BoolValue':
      return wrapperTypes.BoolValue.decode(buf).value;
    default:
      return `<unknown:${typeName}>`;
  }
}

function featureAttributesToCsv(attributes, wrapperTypes) {
  return attributes.map((any) => {
    const val = unpackAttribute(any, wrapperTypes);
    if (val === null) return '';
    const str = String(val);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }).join(',');
}


// TLS certificate utilities are now provided by tls-utils.js

/**
 * Builds gRPC channel credentials based on TLS options.
 *
 * When useTls is true with no custom certs, loads both the Node.js bundled
 * root certificates AND the OS certificate store so that connections to
 * servers using enterprise/internal CAs (e.g. Esri Root CA) succeed even
 * when running inside Electron.
 *
 * @returns {{ credentials: object, tlsInfo: string }}
 */
function buildChannelCredentials({ useTls = true, tlsCaPath, tlsCertPath, tlsKeyPath } = {}) {
  if (!useTls) {
    return { credentials: grpc.credentials.createInsecure(), tlsInfo: 'tls=off (unsecure)' };
  }
  const hasCustomCerts = tlsCaPath || tlsCertPath || tlsKeyPath;
  if (!hasCustomCerts) {
    const certResult = getSystemRootCertificates();
    return {
      credentials: grpc.credentials.createSsl(certResult.pemBuffer),
      tlsInfo: `tls=on, ${formatTlsCertSummary(certResult)}`,
    };
  }
  const rootCerts = tlsCaPath ? fs.readFileSync(tlsCaPath) : undefined;
  const privateKey = tlsKeyPath ? fs.readFileSync(tlsKeyPath) : undefined;
  const certChain = tlsCertPath ? fs.readFileSync(tlsCertPath) : undefined;
  const customParts = [];
  if (tlsCaPath) customParts.push(`ca=${tlsCaPath}`);
  if (tlsCertPath) customParts.push(`cert=${tlsCertPath}`);
  if (tlsKeyPath) customParts.push(`key=${tlsKeyPath}`);
  return {
    credentials: grpc.credentials.createSsl(rootCerts, privateKey, certChain),
    tlsInfo: `tls=on, custom certs: ${customParts.join(', ')}`,
  };
}

/**
 * Builds gRPC server credentials based on TLS options.
 *
 * NOTE — why server-mode TLS cannot fall back to OS/system certificates:
 *
 * Client TLS only needs *trust anchors* (CA root certs) to verify the server's
 * identity, which is exactly what the OS certificate store provides. That is why
 * {@link buildChannelCredentials} can fall back to OS root CAs automatically.
 *
 * Server TLS is fundamentally different: the server must *present its own identity
 * certificate* to connecting clients. OS root CAs are trust anchors for verifying
 * others — they are not server identity certificates. A gRPC server has no
 * certificate to present unless a `tlsCertPath` + `tlsKeyPath` pair is explicitly
 * provided. There is nothing to fall back to, so missing cert/key is a hard error.
 *
 * Practical options when cert/key are unavailable:
 *   1. Omit `useTls` (or set it to `false`) to use plaintext (unsecure) mode.
 *   2. Generate a self-signed cert+key pair and pass their paths.
 *
 * @returns {{ credentials: object, tlsInfo: string }}
 */
function buildServerCredentials({ useTls = true, tlsCaPath, tlsCertPath, tlsKeyPath } = {}) {
  if (!useTls) return { credentials: grpc.ServerCredentials.createInsecure(), tlsInfo: 'tls=off (unsecure)' };
  const rootCerts = tlsCaPath ? fs.readFileSync(tlsCaPath) : null;
  const privateKey = tlsKeyPath ? fs.readFileSync(tlsKeyPath) : null;
  const certChain = tlsCertPath ? fs.readFileSync(tlsCertPath) : null;
  if (!privateKey || !certChain) {
    throw new Error('TLS server mode requires both tlsCertPath and tlsKeyPath. OS/system certificates cannot be used as a fallback — see buildServerCredentials JSDoc for details.');
  }
  const parts = [];
  if (tlsCaPath) parts.push(`ca=${tlsCaPath}`);
  if (tlsCertPath) parts.push(`cert=${tlsCertPath}`);
  if (tlsKeyPath) parts.push(`key=${tlsKeyPath}`);
  return {
    credentials: grpc.ServerCredentials.createSsl(rootCerts, [{ private_key: privateKey, cert_chain: certChain }], false),
    tlsInfo: `tls=on, server certs: ${parts.join(', ')}`,
  };
}


// =============================================================================
// PROTOBUF FORMAT — GrpcFeed service (velocity-grpc.proto)
// =============================================================================

/**
 * Extracts all metadata key-value pairs from a gRPC call and returns them as a
 * formatted string. Also appends peer address and deadline when available.
 * The prefix provides connection-level context (protocol, mode, serialization, remote/local addresses).
 *
 * Server-mode example:
 *   "[metadata] protocol=gRPC mode=server serialization=protobuf rpc=Send remote=ipv4:127.0.0.1:54321 local=127.0.0.1:50051 deadline=none content-type=application/grpc grpc-path=uid"
 * @param {object} call - gRPC call object with a metadata property
 * @param {string} prefix - pre-built context string, e.g. "protocol=gRPC mode=server serialization=protobuf rpc=Send remote=... local=..."
 * @returns {string}
 */
function formatCallHeaders(call, prefix) {
  try {
    const metadata = call.metadata;
    let pairs = '';
    if (metadata) {
      const map = metadata.getMap();
      pairs = Object.entries(map)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
        .join(' ');
    }

    // deadline
    let deadline = 'none';
    try {
      const d = call.getDeadline ? call.getDeadline() : null;
      if (d !== null && d !== undefined && d !== Infinity) {
        deadline = d instanceof Date ? d.toISOString() : String(d);
      }
    } catch (_) { /* ignore */ }

    const deadlinePart = `deadline=${deadline}`;
    const parts = [prefix, deadlinePart, pairs].filter(Boolean).join(' ');
    return `[metadata] ${parts}`;
  } catch (_) {
    return `[metadata] ${prefix || ''} (error reading metadata)`.trim();
  }
}

class GrpcServerTransportProtobuf {
  constructor({ ip, port, onData, onRawHeaders, useTls = true, tlsCaPath, tlsCertPath, tlsKeyPath }) {
    this.ip = ip;
    this.port = port;
    this.onData = onData;
    this.onRawHeaders = onRawHeaders || null;
    this.useTls = useTls;
    this.tlsCaPath = tlsCaPath;
    this.tlsCertPath = tlsCertPath;
    this.tlsKeyPath = tlsKeyPath;
    this.server = null;
    this._listening = false;
    this._clientCount = 0;
    this.wrapperTypes = loadWrapperTypes();
  }

  async connect() {
    const loaded = loadVelocityProto();
    const proto = loaded.esri.realtime.core.grpc;
    this.server = new grpc.Server();

    const self = this;
    this.server.addService(proto.GrpcFeed.service, {
      Send: (call, callback) => {
        if (self.onRawHeaders) {
          let peer = '?';
          try { peer = call.getPeer ? call.getPeer() : '?'; } catch (_) { /* ignore */ }
          const prefix = `protocol=gRPC mode=server serialization=protobuf rpc=Send remote=${peer} local=${self.ip}:${self._boundPort || self.port}`;
          self.onRawHeaders(formatCallHeaders(call, prefix));
        }
        const request = call.request;
        if (request.features) {
          request.features.forEach((feature) => {
            const csv = featureAttributesToCsv(feature.attributes || [], self.wrapperTypes);
            if (self.onData) self.onData(csv);
          });
        }
        callback(null, { message: 'OK', code: 0 });
      },
      Stream: (call, callback) => {
        self._clientCount++;
        if (self.onRawHeaders) {
          let peer = '?';
          try { peer = call.getPeer ? call.getPeer() : '?'; } catch (_) { /* ignore */ }
          const prefix = `protocol=gRPC mode=server serialization=protobuf rpc=Stream remote=${peer} local=${self.ip}:${self._boundPort || self.port}`;
          self.onRawHeaders(formatCallHeaders(call, prefix));
        }
        call.on('data', (request) => {
          if (request.features) {
            request.features.forEach((feature) => {
              const csv = featureAttributesToCsv(feature.attributes || [], self.wrapperTypes);
              if (self.onData) self.onData(csv);
            });
          }
        });
        call.on('end', () => { self._clientCount--; callback(null, { message: 'OK', code: 0 }); });
        call.on('error', () => { self._clientCount--; });
        call.on('cancelled', () => { self._clientCount--; });
      },
    });

    const address = this.ip + ':' + this.port;
    return new Promise((resolve, reject) => {
      const { credentials: serverCreds, tlsInfo: serverTlsInfo } = buildServerCredentials(this);
      this.server.bindAsync(address, serverCreds, (error, boundPort) => {
        if (error) {
          reject(new Error('gRPC server failed to bind on ' + address + ': ' + error.message));
          return;
        }
        this._listening = true;
        this._boundPort = boundPort;
        resolve({ address: this.ip, port: boundPort, tlsInfo: serverTlsInfo });
      });
    });
  }

  isConnected() { return this._listening; }

  async disconnect() {
    if (this.server) { this.server.forceShutdown(); this.server = null; }
    this._listening = false;
    this._clientCount = 0;
  }
}

class GrpcClientTransportProtobuf {
  constructor({ ip, port, onData, onMetadata, onStatus, headerPathKey = 'grpc-path', headerPath = 'replace.with.dedicated.uid', useTls = true, tlsCaPath, tlsCertPath, tlsKeyPath }) {
    this.ip = ip;
    this.port = port;
    this.onData = onData;
    this.onMetadata = onMetadata || null;
    this.onStatus = onStatus || null;
    this.headerPathKey = headerPathKey;
    this.headerPath = headerPath;
    this.useTls = useTls;
    this.tlsCaPath = tlsCaPath;
    this.tlsCertPath = tlsCertPath;
    this.tlsKeyPath = tlsKeyPath;
    this.client = null;
    this.stream = null;
    this._connected = false;
    this.wrapperTypes = loadWrapperTypes();
  }

  _buildMetadata() {
    const metadata = new grpc.Metadata();
    metadata.set(this.headerPathKey, this.headerPath);
    return metadata;
  }

  async connect() {
    const loaded = loadVelocityProto();
    const proto = loaded.esri.realtime.core.grpc;
    const address = this.ip + ':' + this.port;
    const { credentials, tlsInfo } = buildChannelCredentials(this);
    this.client = new proto.GrpcFeed(address, credentials);
    return new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 10);
      this.client.waitForReady(deadline, (error) => {
        if (error) {
          reject(new Error('gRPC client failed to connect to ' + address + ': ' + error.message));
          return;
        }
        // Emit connection-established metadata line.
        if (this.onMetadata) {
          this.onMetadata(`[metadata] protocol=gRPC mode=client serialization=protobuf rpc=Watch remote=${address}`);
        }
        // Use Watch (server-streaming) to receive data pushed by the server.
        this.stream = this.client.Watch({ client_id: 'logger' }, this._buildMetadata());
        this.stream.on('data', (request) => {
          if (!this.onData) return;
          if (request.features) {
            request.features.forEach((feature) => {
              const csv = featureAttributesToCsv(feature.attributes || [], this.wrapperTypes);
              this.onData(csv);
            });
          }
        });
        if (this.onMetadata) {
          this.stream.on('metadata', (md) => {
            try {
              const map = md.getMap();
              const pairs = Object.entries(map)
                .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
                .join(' ');
              this.onMetadata(`[metadata] response-headers: ${pairs || '(none)'}`);
            } catch (_) { /* ignore */ }
          });
        }
        if (this.onStatus) {
          this.stream.on('status', (status) => {
            try {
              const trailingPairs = status.metadata ? Object.entries(status.metadata.getMap())
                .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
                .join(' ') : '';
              const trailer = trailingPairs ? ` trailers: ${trailingPairs}` : '';
              this.onStatus(`[metadata] status: code=${status.code} details=${JSON.stringify(status.details)}${trailer}`);
            } catch (_) { /* ignore */ }
          });
        }
        this.stream.on('error', (err) => {
          if (err.code !== grpc.status.CANCELLED) this._connected = false;
        });
        this._connected = true;
        resolve({ address, tlsInfo });
      });
    });
  }

  isConnected() { return this._connected && this.stream !== null; }

  async disconnect() {
    if (this.stream) { this.stream.cancel(); this.stream = null; }
    if (this.client) { this.client.close(); this.client = null; }
    this._connected = false;
  }
}


// =============================================================================
// KRYO / TEXT FORMAT — GrpcFeatureService (feature-service.proto)
// =============================================================================

class GrpcServerTransportInternal {
  constructor({ ip, port, grpcSerialization = 'text', onData, onRawHeaders, useTls = true, tlsCaPath, tlsCertPath, tlsKeyPath }) {
    this.ip = ip;
    this.port = port;
    this.grpcSerialization = grpcSerialization;
    this.onData = onData;
    this.onRawHeaders = onRawHeaders || null;
    this.useTls = useTls;
    this.tlsCaPath = tlsCaPath;
    this.tlsCertPath = tlsCertPath;
    this.tlsKeyPath = tlsKeyPath;
    this.server = null;
    this._listening = false;
    this._clientCount = 0;
    this._boundPort = null;
  }

  async connect() {
    const loaded = loadFeatureServiceProto();
    const proto = loaded.grpc;
    this.server = new grpc.Server();

    const self = this;
    this.server.addService(proto.GrpcFeatureService.service, {
      execute: (call, callback) => {
        if (self.onRawHeaders) {
          let peer = '?';
          try { peer = call.getPeer ? call.getPeer() : '?'; } catch (_) { /* ignore */ }
          const prefix = `protocol=gRPC mode=server serialization=${self.grpcSerialization} rpc=execute remote=${peer} local=${self.ip}:${self._boundPort || self.port}`;
          self.onRawHeaders(formatCallHeaders(call, prefix));
        }
        const request = call.request;
        const text = request.bytes ? Buffer.from(request.bytes).toString('utf-8') : '';
        if (self.onData) self.onData(text);
        callback(null, { itemId: request.itemId || '', success: true });
      },
      executeMulti: (call) => {
        self._clientCount++;
        if (self.onRawHeaders) {
          let peer = '?';
          try { peer = call.getPeer ? call.getPeer() : '?'; } catch (_) { /* ignore */ }
          const prefix = `protocol=gRPC mode=server serialization=${self.grpcSerialization} rpc=executeMulti remote=${peer} local=${self.ip}:${self._boundPort || self.port}`;
          self.onRawHeaders(formatCallHeaders(call, prefix));
        }
        call.on('data', (request) => {
          const text = request.bytes ? Buffer.from(request.bytes).toString('utf-8') : '';
          if (self.onData) self.onData(text);
          call.write({ itemId: request.itemId || '', success: true });
        });
        call.on('end', () => { self._clientCount--; call.end(); });
        call.on('error', () => { self._clientCount--; });
        call.on('cancelled', () => { self._clientCount--; });
      },
    });

    const address = this.ip + ':' + this.port;
    return new Promise((resolve, reject) => {
      const { credentials: serverCreds, tlsInfo: serverTlsInfo } = buildServerCredentials(this);
      this.server.bindAsync(address, serverCreds, (error, boundPort) => {
        if (error) {
          reject(new Error('gRPC server failed to bind on ' + address + ': ' + error.message));
          return;
        }
        this._listening = true;
        this._boundPort = boundPort;
        resolve({ address: this.ip, port: boundPort, tlsInfo: serverTlsInfo });
      });
    });
  }

  isConnected() { return this._listening; }

  async disconnect() {
    if (this.server) { this.server.forceShutdown(); this.server = null; }
    this._listening = false;
    this._clientCount = 0;
  }
}

class GrpcClientTransportInternal {
  constructor({ ip, port, grpcSerialization = 'text', onData, onMetadata, onStatus, headerPathKey = 'grpc-path', headerPath = 'replace.with.dedicated.uid', useTls = true, tlsCaPath, tlsCertPath, tlsKeyPath }) {
    this.ip = ip;
    this.port = port;
    this.grpcSerialization = grpcSerialization;
    this.onData = onData;
    this.onMetadata = onMetadata || null;
    this.onStatus = onStatus || null;
    this.headerPathKey = headerPathKey;
    this.headerPath = headerPath;
    this.useTls = useTls;
    this.tlsCaPath = tlsCaPath;
    this.tlsCertPath = tlsCertPath;
    this.tlsKeyPath = tlsKeyPath;
    this.client = null;
    this.stream = null;
    this._connected = false;
  }

  _buildMetadata() {
    const metadata = new grpc.Metadata();
    metadata.set(this.headerPathKey, this.headerPath);
    return metadata;
  }

  async connect() {
    const loaded = loadFeatureServiceProto();
    const proto = loaded.grpc;
    const address = this.ip + ':' + this.port;
    const { credentials, tlsInfo } = buildChannelCredentials(this);
    this.client = new proto.GrpcFeatureService(address, credentials);
    return new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 10);
      this.client.waitForReady(deadline, (error) => {
        if (error) {
          reject(new Error('gRPC client failed to connect to ' + address + ': ' + error.message));
          return;
        }
        // Emit connection-established metadata line.
        if (this.onMetadata) {
          this.onMetadata(`[metadata] protocol=gRPC mode=client serialization=${this.grpcSerialization} rpc=watch remote=${address}`);
        }
        // Use watch (server-streaming) to receive data pushed by the server.
        this.stream = this.client.watch({ client_id: 'logger' }, this._buildMetadata());
        this.stream.on('data', (request) => {
          if (this.onData) {
            const text = request.bytes ? Buffer.from(request.bytes).toString('utf-8') : '';
            this.onData(text);
          }
        });
        if (this.onMetadata) {
          this.stream.on('metadata', (md) => {
            try {
              const map = md.getMap();
              const pairs = Object.entries(map)
                .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
                .join(' ');
              this.onMetadata(`[metadata] response-headers: ${pairs || '(none)'}`);
            } catch (_) { /* ignore */ }
          });
        }
        if (this.onStatus) {
          this.stream.on('status', (status) => {
            try {
              const trailingPairs = status.metadata ? Object.entries(status.metadata.getMap())
                .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
                .join(' ') : '';
              const trailer = trailingPairs ? ` trailers: ${trailingPairs}` : '';
              this.onStatus(`[metadata] status: code=${status.code} details=${JSON.stringify(status.details)}${trailer}`);
            } catch (_) { /* ignore */ }
          });
        }
        this.stream.on('error', (err) => {
          if (err.code !== grpc.status.CANCELLED) this._connected = false;
        });
        this._connected = true;
        resolve({ address, tlsInfo });
      });
    });
  }

  isConnected() { return this._connected && this.stream !== null; }

  async disconnect() {
    if (this.stream) { this.stream.cancel(); this.stream = null; }
    if (this.client) { this.client.close(); this.client = null; }
    this._connected = false;
  }
}


// =============================================================================
// FACTORY
// =============================================================================

function createGrpcServerTransport(opts) {
  const grpcSerialization = opts.grpcSerialization || SERIALIZATION_FORMATS.PROTOBUF;
  switch (grpcSerialization) {
    case SERIALIZATION_FORMATS.PROTOBUF:
      return new GrpcServerTransportProtobuf(opts);
    case SERIALIZATION_FORMATS.KRYO:
    case SERIALIZATION_FORMATS.TEXT:
      return new GrpcServerTransportInternal({ ...opts, grpcSerialization });
    default:
      throw new Error(`Unknown gRPC serialization format: ${grpcSerialization}`);
  }
}

function createGrpcClientTransport(opts) {
  const grpcSerialization = opts.grpcSerialization || SERIALIZATION_FORMATS.PROTOBUF;
  switch (grpcSerialization) {
    case SERIALIZATION_FORMATS.PROTOBUF:
      return new GrpcClientTransportProtobuf(opts);
    case SERIALIZATION_FORMATS.KRYO:
    case SERIALIZATION_FORMATS.TEXT:
      return new GrpcClientTransportInternal({ ...opts, grpcSerialization });
    default:
      throw new Error(`Unknown gRPC serialization format: ${grpcSerialization}`);
  }
}

module.exports = {
  createGrpcServerTransport,
  createGrpcClientTransport,
  GrpcServerTransport: GrpcServerTransportProtobuf,
  GrpcClientTransport: GrpcClientTransportProtobuf,
  SERIALIZATION_FORMATS,
  VALID_SERIALIZATION_FORMATS,
  unpackAttribute,
  featureAttributesToCsv,
  loadWrapperTypes,
};
