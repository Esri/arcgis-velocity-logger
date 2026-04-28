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
 * @file cli-options.js
 * @description
 * Command-line parsing and validation for UI and headless startup paths of
 * the ArcGIS Velocity Logger.
 *
 * Purpose:
 * - parse the app's `name=value` command-line convention
 * - normalize aliases such as `runMode=silent` and `host=<value>` (alias of `ip`)
 * - merge an optional JSON launch-config file with CLI overrides
 * - validate headless-only options before startup begins
 * - generate user-facing help output for terminal usage
 *
 * Precedence model:
 * 1. defaults
 * 2. optional `config=/path/to/file.json`
 * 3. explicit CLI values
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WINDOWS_CONSOLE = os.platform() === 'win32';
const CLI_SYMBOLS = {
  divider: IS_WINDOWS_CONSOLE ? '-' : '─',
  separator: IS_WINDOWS_CONSOLE ? ' - ' : ' — ',
  arrow: IS_WINDOWS_CONSOLE ? '->' : '→',
  warning: IS_WINDOWS_CONSOLE ? '!' : '⚠',
  error: IS_WINDOWS_CONSOLE ? 'x' : '✖',
};

function cliDivider(width) {
  return CLI_SYMBOLS.divider.repeat(width);
}

const BOOLEAN_TRUE = new Set(['true', '1', 'yes', 'y', 'on']);
const BOOLEAN_FALSE = new Set(['false', '0', 'no', 'n', 'off']);
const VALID_RUN_MODES = new Set(['ui', 'silent', 'headless']);
const VALID_PROTOCOLS = new Set(['tcp', 'udp', 'grpc', 'http', 'ws']);
const VALID_MODES = new Set(['server', 'client']);
const VALID_SERIALIZATIONS = new Set(['protobuf', 'kryo', 'text']);
const VALID_GRPC_SEND_METHODS = new Set(['stream', 'unary']);
const VALID_LOG_LEVELS = new Set(['error', 'warn', 'info', 'debug']);
const VALID_ON_ERROR = new Set(['exit', 'continue', 'pause']);
const VALID_OUTPUT_FORMATS = new Set(['text', 'jsonl', 'csv']);
const VALID_DATA_FORMATS = new Set(['json', 'delimited', 'esriJson', 'geojson', 'xml']);

const CLI_OPTION_KEYS = new Set([
  'runMode',
  'protocol',
  'mode',
  'ip',
  'port',
  'autoConnect',
  'connectTimeoutMs',
  'connectRetryIntervalMs',
  'connectWaitForServer',
  'outputFile',
  'outputFormat',
  'appendOutput',
  'maxLogCount',
  'durationMs',
  'idleTimeoutMs',
  'filter',
  'exclude',
  'explain',
  'stdout',
  'logLevel',
  'logFile',
  'exitOnComplete',
  'onError',
  'doneFile',
  'runId',
  'grpcHeaderPath',
  'grpcHeaderPathKey',
  'grpcSerialization',
  'grpcSendMethod',
  'useTls',
  'tlsCaPath',
  'tlsCertPath',
  'tlsKeyPath',
  'httpFormat',
  'httpTls',
  'httpPath',
  'httpTlsCaPath',
  'httpTlsCertPath',
  'httpTlsKeyPath',
  'wsFormat',
  'wsTls',
  'wsPath',
  'wsTlsCaPath',
  'wsTlsCertPath',
  'wsTlsKeyPath',
  'wsSubscriptionMsg',
  'wsIgnoreFirstMsg',
  'wsHeaders',
  'showMetadata',
  'config',
  'help',
  'h',
  'help-detailed',
  'help-table-narrow',
  'help-table-wide',
  'help-wide',
]);

const DEFAULT_HEADLESS_OPTIONS = {
  runMode: 'headless',
  protocol: 'tcp',
  mode: 'server',
  ip: '127.0.0.1',
  port: 5565,
  autoConnect: true,
  connectTimeoutMs: 0,
  connectRetryIntervalMs: 1000,
  connectWaitForServer: false,
  outputFile: null,
  outputFormat: 'text',
  appendOutput: false,
  maxLogCount: null,
  durationMs: null,
  idleTimeoutMs: 0,
  filter: null,
  exclude: null,
  explain: true,
  stdout: true,
  logLevel: 'info',
  logFile: null,
  exitOnComplete: true,
  onError: 'exit',
  doneFile: null,
  runId: null,
  grpcHeaderPath: 'replace.with.dedicated.uid',
  grpcHeaderPathKey: 'grpc-path',
  grpcSerialization: 'protobuf',
  grpcSendMethod: 'stream',
  useTls: true,
  tlsCaPath: null,
  tlsCertPath: null,
  tlsKeyPath: null,
  httpFormat: 'delimited',
  httpTls: true,
  httpPath: '/',
  httpTlsCaPath: null,
  httpTlsCertPath: null,
  httpTlsKeyPath: null,
  wsFormat: 'delimited',
  wsTls: true,
  wsPath: '/',
  wsTlsCaPath: null,
  wsTlsCertPath: null,
  wsTlsKeyPath: null,
  wsSubscriptionMsg: null,
  wsIgnoreFirstMsg: false,
  wsHeaders: null,
  showMetadata: false,
  config: null,
};

const HELP_LAYOUTS = Object.freeze({
  standard: 'standard',            // help-detailed: full parameter-by-parameter listing
  compact: 'compact',              // help-wide: 5-column summary with example
  compactNoExample: 'compact-no-example', // help: 4-column summary without example
  tableWide: 'table-wide',
  tableNarrow: 'table-narrow',
});

/**
 * Shared CLI parameter metadata used by terminal help output and documentation.
 *
 * Required-in-headless rules:
 * - `runMode` is only needed when the user is launching from the regular app entry point
 *   and wants to switch from the default UI mode into headless mode.
 * - `outputFile` is optional; when omitted or empty the captured records are written to
 *   the console (stdout) using the selected outputFormat.
 * - all other headless parameters are optional because they have defaults.
 */
const CLI_PARAMETER_DEFINITIONS = [
  {
    key: 'appendOutput',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.appendOutput,
    options: ['true', 'false'],
    example: 'appendOutput=true',
    requiredInHeadless: 'No',
    purpose: 'Append to outputFile if it exists instead of overwriting it. Has no effect when outputFile is omitted.',
  },
  {
    key: 'autoConnect',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.autoConnect,
    options: ['true', 'false'],
    example: 'autoConnect=false',
    requiredInHeadless: 'No',
    purpose: 'Connect/bind automatically on headless start. Set to false to initialize and wait for external control.',
  },
  {
    key: 'config',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.config,
    options: ['path', 'omitted'],
    example: 'config=./docs/launch-config.server.sample.json',
    requiredInHeadless: 'No',
    purpose: 'Optional JSON launch-config file. CLI values override config-file values.',
  },
  {
    key: 'connectRetryIntervalMs',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.connectRetryIntervalMs,
    options: ['integer >= 1'],
    example: 'connectRetryIntervalMs=2000',
    requiredInHeadless: 'No',
    purpose: 'Milliseconds to wait between connection retry attempts when connectWaitForServer=true. Has no effect when connectWaitForServer=false. Only applies to TCP client mode.',
  },
  {
    key: 'connectTimeoutMs',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.connectTimeoutMs,
    options: ['integer >= 0'],
    example: 'connectTimeoutMs=5000',
    requiredInHeadless: 'No',
    purpose: 'Timeout for initial connect/bind operations. 0 = wait indefinitely.',
  },
  {
    key: 'connectWaitForServer',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.connectWaitForServer,
    options: ['true', 'false'],
    example: 'connectWaitForServer=true',
    requiredInHeadless: 'No',
    purpose: 'In client mode, retry the connection on failure until the server is available. When false (the default), a failed connection attempt immediately aborts the run. Only applies to TCP client mode; ignored in server mode and UDP client mode. Covers both initial connection and automatic reconnection after a server restart. Use connectTimeoutMs to set an overall deadline and connectRetryIntervalMs to tune the retry interval.',
  },
  {
    key: 'doneFile',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.doneFile,
    options: ['path', 'omitted'],
    example: 'doneFile=./logs/run.done.json',
    requiredInHeadless: 'No',
    purpose: 'Optional JSON completion/failure artifact for schedulers and CI.',
  },
  {
    key: 'durationMs',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.durationMs,
    options: ['integer >= 1', 'null/omitted'],
    example: 'durationMs=60000',
    requiredInHeadless: 'No',
    purpose: 'Stop the headless session after N milliseconds of elapsed time.',
  },
  {
    key: 'exclude',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.exclude,
    options: ['regex string', 'omitted'],
    example: 'exclude=^heartbeat',
    requiredInHeadless: 'No',
    purpose: 'Drop lines matching this JavaScript regular expression (applied after filter).',
  },
  {
    key: 'explain',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.explain,
    options: ['true', 'false'],
    example: 'explain=false',
    requiredInHeadless: 'No',
    purpose: 'Print a detailed startup explanation showing how the app will run based on the resolved parameters. In both UI and headless modes, this includes a configuration section and a Behavior Summary, plus warnings for ignored options. Set to false to suppress the explanation.',
  },
  {
    key: 'exitOnComplete',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.exitOnComplete,
    options: ['true', 'false'],
    example: 'exitOnComplete=false',
    requiredInHeadless: 'No',
    purpose: 'Exit the process after maxLogCount, durationMs, or idleTimeoutMs is reached. Set to false to keep the process alive. Has no effect when no termination trigger is configured.',
  },
  {
    key: 'filter',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.filter,
    options: ['regex string', 'omitted'],
    example: 'filter=ERROR|WARN',
    requiredInHeadless: 'No',
    purpose: 'Only capture/write lines matching this JavaScript regular expression.',
  },
  {
    key: 'help',
    defaultValue: false,
    options: ['true', 'false'],
    example: 'help=true',
    requiredInHeadless: 'No',
    purpose: 'Print a compact four-column parameter summary (name, supported values, default, purpose) without the example column, then exit without running the app. Also available as --help, -h, or h.',
  },
  {
    key: 'help-detailed',
    defaultValue: false,
    options: ['true', 'false'],
    example: 'help-detailed=true',
    requiredInHeadless: 'No',
    purpose: 'Print the full verbose parameter-by-parameter help listing and exit without running the app. Includes all values, defaults, examples, and full purpose text for every parameter.',
  },
  {
    key: 'help-table-narrow',
    defaultValue: false,
    options: ['true', 'false'],
    example: 'help-table-narrow=true',
    requiredInHeadless: 'No',
    purpose: 'Print help in a narrower ASCII table layout for smaller terminals, then exit without running the app.',
  },
  {
    key: 'help-table-wide',
    defaultValue: false,
    options: ['true', 'false'],
    example: 'help-table-wide=true',
    requiredInHeadless: 'No',
    purpose: 'Print help in a wide ASCII table layout for larger terminals, then exit without running the app.',
  },
  {
    key: 'help-wide',
    defaultValue: false,
    options: ['true', 'false'],
    example: 'help-wide=true',
    requiredInHeadless: 'No',
    purpose: 'Print a compact five-column parameter summary (name, supported values, default, example, purpose) and exit without running the app.',
  },
  {
    key: 'idleTimeoutMs',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.idleTimeoutMs,
    options: ['integer >= 0'],
    example: 'idleTimeoutMs=15000',
    requiredInHeadless: 'No',
    purpose: 'Stop the headless session after N milliseconds with no received data. 0 disables the idle timeout.',
  },
  {
    key: 'ip',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.ip,
    options: ['IPv4-or-host-bind-address'],
    example: 'ip=127.0.0.1',
    requiredInHeadless: 'No',
    purpose: 'Bind address (server mode) or target address (client mode). Default 127.0.0.1 is loopback/local-only; server mode often uses 0.0.0.0 to listen on all interfaces. Alias: host.',
  },
  {
    key: 'logFile',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.logFile,
    options: ['path', 'omitted'],
    example: 'logFile=./logs/run.log',
    requiredInHeadless: 'No',
    purpose: 'Optional file for runner diagnostics (separate from outputFile).',
  },
  {
    key: 'logLevel',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.logLevel,
    options: ['error', 'warn', 'info', 'debug'],
    example: 'logLevel=debug',
    requiredInHeadless: 'No',
    purpose: 'Minimum diagnostic log level (separate from captured data) written to stdout/logFile.',
  },
  {
    key: 'maxLogCount',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.maxLogCount,
    options: ['integer >= 1', 'null/omitted'],
    example: 'maxLogCount=10000',
    requiredInHeadless: 'No',
    purpose: 'Stop the headless session after capturing N records.',
  },
  {
    key: 'mode',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.mode,
    options: ['server', 'client'],
    example: 'mode=server',
    requiredInHeadless: 'No',
    purpose: 'Choose whether the logger binds locally as a server (receiver) or connects outward as a client (receiver).',
  },
  {
    key: 'onError',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.onError,
    options: ['exit', 'continue', 'pause'],
    example: 'onError=continue',
    requiredInHeadless: 'No',
    purpose: 'Choose how the headless runner responds to transport errors.',
  },
  {
    key: 'outputFile',
    defaultValue: null,
    options: ['absolute-or-relative-path', 'omitted'],
    example: 'outputFile=./captured.log',
    requiredInHeadless: 'No',
    purpose: 'Destination file for captured records in headless mode. When omitted or empty, captured records are written to the console (stdout) using the selected outputFormat.',
  },
  {
    key: 'outputFormat',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.outputFormat,
    options: ['text', 'jsonl', 'csv'],
    example: 'outputFormat=jsonl',
    requiredInHeadless: 'No',
    purpose: 'Serialization of each captured record: raw text lines, JSON-lines with timestamp/sequence metadata, or CSV.',
  },
  {
    key: 'port',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.port,
    options: ['1-65535'],
    example: 'port=5565',
    requiredInHeadless: 'No',
    purpose: 'Target or bind port used by the selected transport.',
  },
  {
    key: 'protocol',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.protocol,
    options: ['tcp', 'udp', 'grpc', 'http', 'ws'],
    example: 'protocol=tcp',
    requiredInHeadless: 'No',
    purpose: 'Choose the network transport to listen on or connect to.',
  },
  {
    key: 'runId',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.runId,
    options: ['string', 'omitted'],
    example: 'runId=nightly-01',
    requiredInHeadless: 'No',
    purpose: 'Optional identifier added to logs and done-file output.',
  },
  {
    key: 'runMode',
    defaultValue: 'ui',
    options: ['ui', 'headless', 'silent'],
    example: 'runMode=headless',
    requiredInHeadless: 'Only when using the normal app entry point',
    purpose: 'Select startup mode. No parameters means the app opens in normal UI mode and restores saved UI behavior from configuration (theme, fonts, window state, opacity, etc.).',
  },
  {
    key: 'grpcHeaderPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.grpcHeaderPath,
    options: ['string'],
    example: 'grpcHeaderPath=my.feed.uid',
    requiredInHeadless: 'No',
    purpose: 'Value sent as the gRPC endpoint header path. Injected as metadata on every outgoing gRPC call. Only applies when protocol=grpc and mode=client. Has no effect in server mode.',
  },
  {
    key: 'grpcHeaderPathKey',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.grpcHeaderPathKey,
    options: ['string'],
    example: 'grpcHeaderPathKey=grpc-path',
    requiredInHeadless: 'No',
    purpose: 'Key name for the gRPC endpoint header path metadata entry. Only applies when protocol=grpc and mode=client. Has no effect in server mode.',
  },
  {
    key: 'grpcSerialization',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.grpcSerialization,
    options: ['protobuf', 'kryo', 'text'],
    example: 'grpcSerialization=protobuf',
    requiredInHeadless: 'No',
    purpose: 'gRPC feature serialization format. "protobuf" uses the Velocity external GrpcFeed protocol with typed Any-wrapped attributes. "kryo" uses the internal GrpcFeatureService protocol with raw bytes. "text" uses the internal protocol with plain UTF-8 text. Only applies when protocol=grpc.',
  },
  {
    key: 'grpcSendMethod',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.grpcSendMethod,
    options: ['stream', 'unary'],
    example: 'grpcSendMethod=stream',
    requiredInHeadless: 'No',
    purpose: 'gRPC RPC type for client-mode sending. "stream" (default) uses a Client Streaming RPC that multiplexes all messages over a single persistent HTTP/2 stream for higher throughput. "unary" uses a Unary RPC that sends each message as a discrete request/response round-trip, easier to trace and debug. Only applies when protocol=grpc and mode=client.',
  },
  {
    key: 'httpFormat',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.httpFormat,
    options: ['json', 'delimited', 'esriJson', 'geojson', 'xml'],
    example: 'httpFormat=json',
    requiredInHeadless: 'No',
    purpose: 'HTTP data format controlling the Content-Type header. "json" (application/json), "delimited" (text/plain, CSV), "esriJson" (application/json), "geojson" (application/geo+json), or "xml" (application/xml). Only applies when protocol=http.',
  },
  {
    key: 'httpPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.httpPath,
    options: ['string'],
    example: 'httpPath=/receiver/feed-id',
    requiredInHeadless: 'No',
    purpose: 'URL path appended after host:port. In server mode, only POST requests matching this path are accepted. In client mode, this path is used in outgoing POST URLs. Only applies when protocol=http.',
  },
  {
    key: 'httpTls',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.httpTls,
    options: ['true', 'false'],
    example: 'httpTls=true',
    requiredInHeadless: 'No',
    purpose: 'Enable HTTPS (port 443 by default). Uses the OS certificate store automatically in client mode. Server mode requires a certificate and key. Only applies when protocol=http.',
  },
  {
    key: 'httpTlsCaPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.httpTlsCaPath,
    options: ['path', 'omitted'],
    example: 'httpTlsCaPath=./certs/ca.pem',
    requiredInHeadless: 'No',
    purpose: 'Custom CA certificate file (PEM) for HTTP TLS. Leave empty to use the OS certificate store. Only applies when protocol=http and httpTls=true.',
  },
  {
    key: 'httpTlsCertPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.httpTlsCertPath,
    options: ['path', 'omitted'],
    example: 'httpTlsCertPath=./certs/server.pem',
    requiredInHeadless: 'No',
    purpose: 'Client or server certificate file (PEM) for HTTP TLS. Required for server-mode TLS; only needed in client mode for mutual TLS (mTLS). Only applies when protocol=http and httpTls=true.',
  },
  {
    key: 'httpTlsKeyPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.httpTlsKeyPath,
    options: ['path', 'omitted'],
    example: 'httpTlsKeyPath=./certs/server-key.pem',
    requiredInHeadless: 'No',
    purpose: 'Private key file (PEM) for HTTP TLS. Required for server-mode TLS and client-side mTLS. Only applies when protocol=http and httpTls=true.',
  },
  {
    key: 'showMetadata',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.showMetadata,
    options: ['true', 'false'],
    example: 'showMetadata=true',
    requiredInHeadless: 'No',
    purpose: 'When true, connection/call metadata lines are written to the output (file or stdout) before each received message. Metadata includes protocol, mode, remote address, and (for gRPC) call headers, response headers, and status. Applies to gRPC server and client modes. Default is false.',
  },
  {
    key: 'tlsCaPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.tlsCaPath,
    options: ['path', 'omitted'],
    example: 'tlsCaPath=./certs/ca.pem',
    requiredInHeadless: 'No',
    purpose: 'Path to a custom CA certificate file (PEM) for gRPC TLS connections. When omitted, the system default CA bundle is used. Only applies when useTls=true and protocol=grpc.',
  },
  {
    key: 'tlsCertPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.tlsCertPath,
    options: ['path', 'omitted'],
    example: 'tlsCertPath=./certs/client.pem',
    requiredInHeadless: 'No',
    purpose: 'Path to a client/server certificate file (PEM) for mutual TLS. Required for TLS server mode. Only applies when useTls=true and protocol=grpc.',
  },
  {
    key: 'tlsKeyPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.tlsKeyPath,
    options: ['path', 'omitted'],
    example: 'tlsKeyPath=./certs/client-key.pem',
    requiredInHeadless: 'No',
    purpose: 'Path to a private key file (PEM) for mutual TLS. Required for TLS server mode. Only applies when useTls=true and protocol=grpc.',
  },
  {
    key: 'useTls',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.useTls,
    options: ['true', 'false'],
    example: 'useTls=true',
    requiredInHeadless: 'No',
    purpose: 'Use TLS (SSL) for gRPC connections. When true, the connection uses SSL credentials instead of plaintext. Only applies when protocol=grpc.',
  },
  {
    key: 'wsFormat',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.wsFormat,
    options: ['json', 'delimited', 'esriJson', 'geojson', 'xml'],
    example: 'wsFormat=json',
    requiredInHeadless: 'No',
    purpose: 'WebSocket data format. "json" (application/json), "delimited" (text/plain, CSV), "esriJson" (application/json), "geojson" (application/geo+json), or "xml" (application/xml). Only applies when protocol=ws.',
  },
  {
    key: 'wsHeaders',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.wsHeaders,
    options: ['JSON string', 'omitted'],
    example: 'wsHeaders={"Authorization":"Bearer token"}',
    requiredInHeadless: 'No',
    purpose: 'Optional JSON object of custom HTTP headers for the WebSocket upgrade request (client mode only). Only applies when protocol=ws and mode=client.',
  },
  {
    key: 'wsIgnoreFirstMsg',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.wsIgnoreFirstMsg,
    options: ['true', 'false'],
    example: 'wsIgnoreFirstMsg=true',
    requiredInHeadless: 'No',
    purpose: 'When true, the first message received after connecting is silently discarded. Useful when the server sends an initial handshake or acknowledgement. Only applies when protocol=ws.',
  },
  {
    key: 'wsPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.wsPath,
    options: ['string'],
    example: 'wsPath=/feed',
    requiredInHeadless: 'No',
    purpose: 'URL path appended after host:port for the WebSocket connection. In server mode, only upgrade requests matching this path are accepted. Only applies when protocol=ws.',
  },
  {
    key: 'wsSubscriptionMsg',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.wsSubscriptionMsg,
    options: ['string', 'omitted'],
    example: 'wsSubscriptionMsg=subscribe:feed1',
    requiredInHeadless: 'No',
    purpose: 'Optional text message sent to the server immediately after the WebSocket connection is established. Useful for subscribing to a specific data feed. Only applies when protocol=ws and mode=client.',
  },
  {
    key: 'wsTls',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.wsTls,
    options: ['true', 'false'],
    example: 'wsTls=true',
    requiredInHeadless: 'No',
    purpose: 'Enable WSS (WebSocket Secure, port 443 by default). Uses the OS certificate store automatically in client mode. Server mode requires a certificate and key. Only applies when protocol=ws.',
  },
  {
    key: 'wsTlsCaPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.wsTlsCaPath,
    options: ['path', 'omitted'],
    example: 'wsTlsCaPath=./certs/ca.pem',
    requiredInHeadless: 'No',
    purpose: 'Custom CA certificate file (PEM) for WebSocket TLS. Leave empty to use the OS certificate store. Only applies when protocol=ws and wsTls=true.',
  },
  {
    key: 'wsTlsCertPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.wsTlsCertPath,
    options: ['path', 'omitted'],
    example: 'wsTlsCertPath=./certs/server.pem',
    requiredInHeadless: 'No',
    purpose: 'Client or server certificate file (PEM) for WebSocket TLS. Required for server-mode TLS; only needed in client mode for mutual TLS (mTLS). Only applies when protocol=ws and wsTls=true.',
  },
  {
    key: 'wsTlsKeyPath',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.wsTlsKeyPath,
    options: ['path', 'omitted'],
    example: 'wsTlsKeyPath=./certs/server-key.pem',
    requiredInHeadless: 'No',
    purpose: 'Private key file (PEM) for WebSocket TLS. Required for server-mode TLS and client-side mTLS. Only applies when protocol=ws and wsTls=true.',
  },
  {
    key: 'stdout',
    defaultValue: DEFAULT_HEADLESS_OPTIONS.stdout,
    options: ['true', 'false'],
    example: 'stdout=false',
    requiredInHeadless: 'No',
    purpose: 'Echo captured records to the console in addition to outputFile. When outputFile is omitted, console output is always produced regardless of this flag.',
  },
];

function formatDefaultValue(value) {
  return value === null ? '(none)' : String(value);
}

function wrapTableText(value, width) {
  const text = String(value ?? '');
  if (text.length === 0) return [''];

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  const pushChunkedWord = (word) => {
    const chunks = [];
    for (let index = 0; index < word.length; index += width) {
      chunks.push(word.slice(index, index + width));
    }

    if (chunks.length > 1) {
      const minBalancedChunkLength = Math.ceil(width / 3);
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk.length > 0 && lastChunk.length < minBalancedChunkLength) {
        const previousChunk = chunks[chunks.length - 2];
        const merged = previousChunk + lastChunk;
        const splitIndex = Math.ceil(merged.length / 2);
        chunks.splice(chunks.length - 2, 2, merged.slice(0, splitIndex), merged.slice(splitIndex));
      }
    }

    for (const chunk of chunks) {
      lines.push(chunk);
    }
  };

  for (const word of words) {
    if (word.length > width) {
      if (currentLine) { lines.push(currentLine); currentLine = ''; }
      pushChunkedWord(word);
      continue;
    }
    if (!currentLine) { currentLine = word; continue; }
    if (`${currentLine} ${word}`.length <= width) {
      currentLine = `${currentLine} ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

function buildAsciiTable(headers, rows, widths) {
  const border = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  const formatLine = (cells) => `| ${cells.map((cell, index) => String(cell ?? '').padEnd(widths[index])).join(' | ')} |`;

  const output = [border, formatLine(headers), border];
  rows.forEach((row) => {
    const wrappedCells = row.map((cell, index) => wrapTableText(cell, widths[index]));
    const maxHeight = Math.max(...wrappedCells.map((cellLines) => cellLines.length));
    for (let lineIndex = 0; lineIndex < maxHeight; lineIndex += 1) {
      output.push(formatLine(wrappedCells.map((cellLines) => cellLines[lineIndex] || '')));
    }
    output.push(border);
  });
  return output.join('\n');
}

function formatLabeledWrappedLine(label, value, { indent = '    ', width = 96 } = {}) {
  const prefix = `${indent}${label.padEnd(8)}: `;
  const continuationPrefix = ' '.repeat(prefix.length);
  const wrappedLines = wrapTableText(value, Math.max(width - prefix.length, 12));
  return wrappedLines.map((line, index) => `${index === 0 ? prefix : continuationPrefix}${line}`);
}

function buildHelpSection(title, lines = []) {
  return [title, ...lines, ''];
}

function getCompactExampleUsageLines() {
  const entries = [
    ['UI default', 'electron .'],
    ['Help overview', 'electron . help=true  (or: h  -h  --help)'],
    ['Narrow help', 'electron . help-table-narrow=true'],
    ['TCP server', 'electron . runMode=headless protocol=tcp mode=server ip=0.0.0.0 port=5565'],
    ['Capture to file', 'electron . runMode=headless outputFile=./captured.log protocol=tcp mode=server ip=0.0.0.0 port=5565'],
    ['UDP JSONL', 'electron . runMode=headless outputFile=./captured.jsonl outputFormat=jsonl protocol=udp mode=client ip=192.168.1.25 port=6000 durationMs=60000'],
    ['TCP retry', 'electron . runMode=headless protocol=tcp mode=client ip=192.168.1.10 port=5565 connectWaitForServer=true connectRetryIntervalMs=2000 connectTimeoutMs=60000'],
    ['Config override', 'electron . runMode=headless config=./docs/launch-config.server.sample.json outputFile=./custom.log runId=manual-override'],
  ];

  const labelWidth = Math.max(...entries.map(([label]) => label.length));
  const lines = [];

  entries.forEach(([label, command]) => {
    const prefix = `  ${label.padEnd(labelWidth)} : `;
    const continuationPrefix = ' '.repeat(prefix.length);
    const wrappedLines = wrapTableText(command, Math.max(118 - prefix.length, 24));
    wrappedLines.forEach((line, index) => {
      lines.push(`${index === 0 ? prefix : continuationPrefix}${line}`);
    });
  });

  return buildHelpSection('Example usages', lines);
}

function getHelpRows() {
  const parameterRows = CLI_PARAMETER_DEFINITIONS.map((entry) => [
    'parameter',
    entry.key,
    formatDefaultValue(entry.defaultValue),
    entry.requiredInHeadless,
    `${Array.isArray(entry.options) ? entry.options.join(' | ') : String(entry.options || '')}; e.g. ${entry.example}`,
    entry.purpose,
  ]);

  return [
    ['behavior', 'no parameters', 'ui', 'No', 'electron .', 'Starts in normal UI mode and restores saved UI behavior from configuration (theme, fonts, window state, opacity, connection controls visibility).'],
    ['behavior', 'headless launch', 'headless', 'Yes for regular launcher', 'runMode=headless', 'Use runMode=headless (or runMode=silent) unless you use npm run start:headless.'],
    ['behavior', 'headless default sink', 'stdout', 'No', '(omit outputFile)', 'When outputFile is omitted, captured records are written to the console (stdout) in the selected outputFormat.'],
    ['requirement', 'all headless params', '(varies)', 'No', 'optional', 'All headless parameters are optional; defaults are applied automatically.'],
    ...parameterRows,
    ['alias', 'runMode=silent', 'headless', 'No', 'runMode=silent', 'Alias for runMode=headless.'],
    ['alias', 'host', 'alias', 'No', 'host=0.0.0.0', 'Accepted as an alias for ip.'],
    ['alias', '--help / -h / h', 'false', 'No', '--help', 'Print compact help and exit without running the app.'],
    ['alias', '--help-table-wide', 'false', 'No', '--help-table-wide', 'Print wide table help and exit without running the app.'],
    ['alias', '--help-table-narrow', 'false', 'No', '--help-table-narrow', 'Print narrow table help and exit without running the app.'],
    ['note', 'config support', '(none)', 'No', 'config=/path/to/file.json', 'Accepts JSON with either top-level keys or nested headless/connection/capture/output sections. CLI values override config-file values.'],
    ['note', '127.0.0.1', 'default ip', 'No', 'ip=127.0.0.1', 'Loopback/local-only. Use it when sender and receiver are on the same machine.'],
    ['note', '0.0.0.0', 'server bind', 'No', 'ip=0.0.0.0', 'Typical server bind value; listens on all interfaces so other machines can connect.'],
    ['note', 'help layouts', 'compact', 'No', 'help=true / help-detailed=true / help-table-wide=true / help-table-narrow=true / help-wide=true', 'help gives a 4-column compact summary. help-wide adds the example column. help-detailed gives the full parameter-by-parameter listing. help-table-* give ASCII table layouts.'],
    ['example', 'help (default)', '-', '-', 'electron . help=true', 'Print 4-column compact help (no example column) and exit.'],
    ['example', 'help with examples', '-', '-', 'electron . help-wide=true', 'Print 5-column compact help and exit.'],
    ['example', 'detailed help', '-', '-', 'electron . help-detailed=true', 'Print full verbose parameter-by-parameter help and exit.'],
    ['example', 'headless TCP client with retry', '-', '-', 'electron . runMode=headless protocol=tcp mode=client ip=192.168.1.10 port=5565 connectWaitForServer=true connectRetryIntervalMs=2000 connectTimeoutMs=60000', 'TCP client mode that waits up to 60 seconds for the server to become available, retrying every 2 seconds.'],
    ['example', 'UI default', '-', '-', 'electron .', 'Launch the app in normal UI mode.'],
    ['example', 'headless to stdout', '-', '-', 'electron . runMode=headless protocol=tcp mode=server ip=0.0.0.0 port=5565', 'Headless TCP server writing captured records to the console (no outputFile).'],
    ['example', 'headless TCP server', '-', '-', 'electron . runMode=headless outputFile=./captured.log protocol=tcp mode=server ip=0.0.0.0 port=5565 maxLogCount=10000 doneFile=./run.done.json', 'Headless TCP server listening beyond localhost, capturing up to 10000 lines.'],
    ['example', 'headless UDP client', '-', '-', 'electron . runMode=headless outputFile=./captured.jsonl outputFormat=jsonl protocol=udp mode=client ip=192.168.1.25 port=6000 durationMs=60000', 'Headless UDP client capturing for one minute.'],
    ['example', 'config override', '-', '-', 'electron . runMode=headless config=./docs/launch-config.server.sample.json outputFile=./custom.log runId=manual-override', 'Headless run using a config file plus CLI overrides.'],
    ['example', 'help only', '-', '-', 'electron . help=true', 'Print compact help and exit without running the app.'],
    ['example', 'wide table help', '-', '-', 'electron . help-table-wide=true', 'Print help in a wider table layout for large terminals.'],
    ['example', 'narrow table help', '-', '-', 'electron . help-table-narrow=true', 'Print help in a narrower table layout for smaller terminals.'],
  ];
}

function getParameterComment(entry) {
  switch (entry.key) {
    case 'help': return 'Also available as --help, -h, or h. Prints a 4-column compact summary without the Example column; fastest way to get an overview.';
    case 'help-detailed': return 'Also available as --help-detailed. Prints the full listing with all details for every parameter.';
    case 'help-table-wide': return 'Also available as --help-table-wide and npm run help:cli:wide.';
    case 'help-table-narrow': return 'Also available as --help-table-narrow and npm run help:cli:narrow.';
    case 'help-wide': return 'Also available as --help-wide. Same as help but adds the Example column.';
    case 'runMode': return 'Use runMode=headless (or runMode=silent) only when switching from the normal launcher.';
    case 'ip': return '127.0.0.1 is local-only; 0.0.0.0 is commonly used for server-mode listening on all interfaces. host=<value> is an alias.';
    case 'outputFile': return 'Optional in headless mode. When omitted, captured records are written to the console (stdout) using the selected outputFormat. Parent directories are created if missing.';
    case 'outputFormat': return 'text writes raw lines; jsonl writes {timestamp, seq, data} per line; csv writes timestamp,seq,data with standard CSV escaping.';
    case 'filter': return 'Applied before exclude. Invalid regex causes a configuration error.';
    case 'exclude': return 'Applied after filter. Invalid regex causes a configuration error.';
    case 'config': return 'CLI values override config-file values.';
    case 'onError': return 'onError=pause may keep the process alive until it is externally stopped.';
    case 'connectRetryIntervalMs': return `Only used when connectWaitForServer=true. Default 1000 means the client retries every second${CLI_SYMBOLS.separator}both on startup and after a server restart.`;
    case 'connectWaitForServer': return 'Ignored in server mode. Pair with connectTimeoutMs for a deadline and connectRetryIntervalMs to control retry spacing.';
    case 'exitOnComplete': return 'When false, the runner stays alive after maxLogCount/durationMs/idleTimeoutMs triggers.';
    default: return '';
  }
}

function getParameterUsageCategory(entry) {
  if (entry.key.startsWith('help')) return 'help';
  if (entry.key === 'runMode') return 'launcher';
  return 'headless-only';
}

function getCommandLineReferenceData() {
  return {
    title: 'ArcGIS Velocity Logger command-line reference',
    overview: [
      'No parameters start the app in normal UI mode and restore saved UI behavior from configuration (theme, fonts, window state, opacity, connection controls visibility).',
      `Headless mode has no required parameters${CLI_SYMBOLS.separator}all headless options have sensible defaults.`,
      'When outputFile is omitted or empty in headless mode, captured records are written to the console (stdout) using the selected outputFormat.',
    ],
    helpLayouts: [
      'help=true, --help, -h, or h prints the compact 4-column summary without the example column (fastest overview).',
      'help-detailed=true or --help-detailed prints the full verbose parameter-by-parameter listing.',
      'help-table-wide=true, --help-table-wide, or npm run help:cli:wide prints the wide ASCII table help output.',
      'help-table-narrow=true, --help-table-narrow, or npm run help:cli:narrow prints the narrow ASCII table help output.',
      'help-wide=true or --help-wide prints the compact 5-column summary with the example column included.',
    ],
    parameters: CLI_PARAMETER_DEFINITIONS.map((entry) => ({
      name: entry.key,
      supportedValues: Array.isArray(entry.options) ? entry.options.join(', ') : String(entry.options || ''),
      required: entry.requiredInHeadless,
      defaultValue: formatDefaultValue(entry.defaultValue),
      example: entry.example,
      purpose: getParameterComment(entry)
        ? `${entry.purpose} ${getParameterComment(entry)}`
        : entry.purpose,
      usageCategory: getParameterUsageCategory(entry),
    })),
    notes: [
      'runMode=silent is treated the same as runMode=headless.',
      'host=<value> is accepted as an alias for ip=<value>.',
      'config=/path/to/file.json accepts top-level or nested headless/connection/capture/output sections.',
      '127.0.0.1 is the default loopback/local-only address; 0.0.0.0 is a typical server bind value when remote clients should connect.',
      'connectWaitForServer and connectRetryIntervalMs apply to TCP client mode only. connectWaitForServer=false (the default) disables retry. Pair connectWaitForServer=true with connectTimeoutMs for a deadline and connectRetryIntervalMs to tune retry spacing.',
      'help is the compact default without the example column. help-wide adds examples. help-table-narrow / help-table-wide give full ASCII table layouts. Aliases: --help, -h, h.',
      'When multiple help layouts are requested together, help-table-narrow wins over help-table-wide, wins over help-detailed, wins over help-wide, wins over help.',
    ],
    examples: [
      'electron .',
      'electron . runMode=headless protocol=tcp mode=server ip=0.0.0.0 port=5565',
      'electron . runMode=headless outputFile=./captured.log protocol=tcp mode=server ip=0.0.0.0 port=5565 maxLogCount=10000 doneFile=./run.done.json',
      'electron . runMode=headless outputFile=./captured.jsonl outputFormat=jsonl protocol=udp mode=client ip=192.168.1.25 port=6000 durationMs=60000',
      'electron . runMode=headless protocol=tcp mode=client ip=192.168.1.10 port=5565 connectWaitForServer=true connectRetryIntervalMs=2000 connectTimeoutMs=60000',      'electron . runMode=headless config=./docs/launch-config.server.sample.json outputFile=./custom.log runId=manual-override',
      'electron . help=true',
      'electron . help-detailed=true',
      'electron . help-table-wide=true',
      'electron . help-table-narrow=true',
      'electron . help-wide=true',
    ],
  };
}

function getStandardHelpText() {
  const lines = [
    'ArcGIS Velocity Logger command-line help',
    'Layout: help-detailed (non-table)',
    '',
    ...buildHelpSection('Behavior', [
      '  - No parameters: starts in normal UI mode and restores saved UI behavior from configuration.',
      '  - Headless launch: use runMode=headless (or runMode=silent) unless you are using npm run start:headless.',
      '  - Headless defaults: all headless parameters are optional. When outputFile is omitted, captured records are written to the console (stdout) using the selected outputFormat.',
    ]),
    ...buildHelpSection('Help layouts', [
      '  - help=true, --help, -h, or h: prints the compact 4-column summary (fastest overview).',
      '  - help-detailed=true or --help-detailed: prints this full verbose parameter-by-parameter listing.',
      '  - help-table-wide=true or --help-table-wide: prints a wide ASCII table layout for larger terminals.',
      '  - help-table-narrow=true or --help-table-narrow: prints a narrower ASCII table layout for smaller terminals.',
      '  - help-wide=true or --help-wide: prints the compact 5-column summary with the Example column included.',
    ]),
    'Parameters',
  ];

  CLI_PARAMETER_DEFINITIONS.forEach((entry) => {
    lines.push(`  ${entry.key}`);
    lines.push(`    default : ${formatDefaultValue(entry.defaultValue)}`);
    lines.push(`    required: ${entry.requiredInHeadless}`);
    lines.push(`    values  : ${Array.isArray(entry.options) ? entry.options.join(' | ') : String(entry.options || '')}`);
    lines.push(`    example : ${entry.example}`);
    lines.push(...formatLabeledWrappedLine('purpose', entry.purpose));
    lines.push('');
  });

  lines.push(...buildHelpSection('Aliases and notes', [
    '  - runMode=silent is treated the same as runMode=headless.',
    '  - host=<value> is accepted as an alias for ip=<value>.',
    '  - config=/path/to/file.json accepts top-level or nested headless/connection/capture/output sections; CLI values override config-file values.',
    '  - Default ip is 127.0.0.1 for loopback/local-only use. 0.0.0.0 is a typical server bind value when other machines should be allowed to connect.',
    '  - connectWaitForServer / connectRetryIntervalMs apply to TCP client mode only. connectWaitForServer=false (the default) disables retry. Pair with connectTimeoutMs for a deadline.',
    '  - help is the compact default. help-wide adds the Example column. help-detailed gives the full verbose listing. help-table-narrow / help-table-wide give full ASCII table layouts. Aliases: --help, -h, h.',
  ]));

  lines.push(...buildHelpSection('Examples', [
    '  electron .',
    '  electron . runMode=headless protocol=tcp mode=server ip=0.0.0.0 port=5565',
    '  electron . runMode=headless outputFile=./captured.log protocol=tcp mode=server ip=0.0.0.0 port=5565 maxLogCount=10000 doneFile=./run.done.json',
    '  electron . runMode=headless outputFile=./captured.jsonl outputFormat=jsonl protocol=udp mode=client ip=192.168.1.25 port=6000 durationMs=60000',
    '  electron . runMode=headless protocol=tcp mode=client ip=192.168.1.10 port=5565 connectWaitForServer=true connectRetryIntervalMs=2000 connectTimeoutMs=60000',
    '  electron . runMode=headless config=./docs/launch-config.server.sample.json outputFile=./custom.log runId=manual-override',
    '  electron . help=true',
    '  electron . help-detailed=true',
    '  electron . help-table-wide=true',
    '  electron . help-table-narrow=true',
    '  electron . help-wide=true',
  ]));

  return lines.join('\n').trimEnd();
}

function getTableHelpText({ layout = HELP_LAYOUTS.tableWide } = {}) {
  const widths = layout === HELP_LAYOUTS.tableNarrow
    ? [10, 20, 10, 16, 28, 44]
    : [11, 22, 12, 24, 38, 62];

  const layoutLabel = layout === HELP_LAYOUTS.tableNarrow
    ? 'Layout: help-table-narrow (ASCII table for narrower terminals)'
    : 'Layout: help-table-wide (ASCII table for wider terminals)';

  return [
    'ArcGIS Velocity Logger command-line help',
    layoutLabel,
    '',
    buildAsciiTable(
      ['Kind', 'Name', 'Default', 'Required', 'Values / Example', 'Details'],
      getHelpRows(),
      widths,
    ),
  ].join('\n');
}

function getHelpLayoutPriority(layout) {
  if (layout === HELP_LAYOUTS.tableNarrow) return 5;
  if (layout === HELP_LAYOUTS.tableWide) return 4;
  if (layout === HELP_LAYOUTS.standard) return 3;
  if (layout === HELP_LAYOUTS.compact) return 2;
  if (layout === HELP_LAYOUTS.compactNoExample) return 1;
  return 0;
}

function mergeHelpLayout(currentLayout, nextLayout) {
  if (!currentLayout) return nextLayout;
  return getHelpLayoutPriority(nextLayout) >= getHelpLayoutPriority(currentLayout)
    ? nextLayout : currentLayout;
}

function expandHomeDir(value) {
  if (typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function resolvePathValue(value) {
  if (!value) return value;
  return path.resolve(expandHomeDir(value));
}

function parseBoolean(value, key, errors) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') {
    errors.push(`Missing boolean value for '${key}'.`);
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (BOOLEAN_TRUE.has(normalized)) return true;
  if (BOOLEAN_FALSE.has(normalized)) return false;
  errors.push(`Invalid boolean value for '${key}': '${value}'. Use true/false.`);
  return null;
}

function parseInteger(value, key, errors, { min = null, max = null, allowNull = false } = {}) {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    errors.push(`Invalid integer value for '${key}': '${value}'.`);
    return null;
  }
  if (min !== null && parsed < min) { errors.push(`'${key}' must be >= ${min}.`); return null; }
  if (max !== null && parsed > max) { errors.push(`'${key}' must be <= ${max}.`); return null; }
  return parsed;
}

function compileRegex(value, key, errors) {
  try {
    return new RegExp(value);
  } catch (err) {
    errors.push(`Invalid regular expression for '${key}': ${err.message}`);
    return null;
  }
}

function flattenConfigObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const flattened = { ...input };
  ['headless', 'connection', 'capture', 'output'].forEach((section) => {
    if (input[section] && typeof input[section] === 'object' && !Array.isArray(input[section])) {
      Object.assign(flattened, input[section]);
    }
  });
  return flattened;
}

function loadRunConfig(configPath, errors) {
  const resolvedConfigPath = resolvePathValue(configPath);
  try {
    const raw = fs.readFileSync(resolvedConfigPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { path: resolvedConfigPath, values: flattenConfigObject(parsed) };
  } catch (error) {
    errors.push(`Unable to read config file '${resolvedConfigPath}': ${error.message}`);
    return { path: resolvedConfigPath, values: {} };
  }
}

function normalizeKnownKeys(values) {
  const normalized = { ...values };
  if (normalized.host !== undefined && normalized.ip === undefined) {
    normalized.ip = normalized.host;
  }
  if (normalized.silent !== undefined && normalized.runMode === undefined) {
    normalized.runMode = parseBoolean(normalized.silent, 'silent', []) ? 'headless' : 'ui';
  }
  return normalized;
}

function sliceUserArgs(rawArgv, isPackaged) {
  const startIndex = isPackaged ? 1 : 2;
  return rawArgv.slice(startIndex).filter((arg) => arg !== '.');
}

function parseRawArgs(rawArgs) {
  const values = {};
  const positional = [];
  let helpLayout = null;

  rawArgs.forEach((arg) => {
    if (arg === '--help' || arg === '-h' || arg === 'help' || arg === 'h') {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.compactNoExample);
      return;
    }
    if (arg === '--help-detailed' || arg === 'help-detailed') {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.standard);
      return;
    }
    if (arg === '--help-table-wide' || arg === 'help-table-wide') {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.tableWide);
      return;
    }
    if (arg === '--help-table-narrow' || arg === 'help-table-narrow') {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.tableNarrow);
      return;
    }
    if (arg === '--help-wide' || arg === 'help-wide') {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.compact);
      return;
    }

    const normalizedArg = arg.startsWith('--') ? arg.slice(2) : arg;
    const separatorIndex = normalizedArg.indexOf('=');

    if (separatorIndex === -1) { positional.push(arg); return; }

    const key = normalizedArg.slice(0, separatorIndex).trim();
    const value = normalizedArg.slice(separatorIndex + 1).trim();

    if (!key) { positional.push(arg); return; }

    values[key] = value;
    if ((key === 'help' || key === 'h') && BOOLEAN_TRUE.has(String(value).toLowerCase())) {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.compactNoExample);
    }
    if (key === 'help-detailed' && BOOLEAN_TRUE.has(String(value).toLowerCase())) {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.standard);
    }
    if (key === 'help-wide' && BOOLEAN_TRUE.has(String(value).toLowerCase())) {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.compact);
    }
    if (key === 'help-table-wide' && BOOLEAN_TRUE.has(String(value).toLowerCase())) {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.tableWide);
    }
    if (key === 'help-table-narrow' && BOOLEAN_TRUE.has(String(value).toLowerCase())) {
      helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.tableNarrow);
    }
  });

  return { values, positional, helpLayout };
}

function validateHeadlessOptions(values, errors, warnings) {
  const options = { ...DEFAULT_HEADLESS_OPTIONS };
  const normalized = normalizeKnownKeys(values);

  if (normalized.runMode !== undefined) {
    const runMode = String(normalized.runMode).trim().toLowerCase();
    if (!VALID_RUN_MODES.has(runMode)) {
      errors.push(`Invalid runMode '${normalized.runMode}'. Use ui, silent, or headless.`);
    } else {
      options.runMode = runMode === 'silent' ? 'headless' : runMode;
    }
  }

  if (normalized.protocol !== undefined) {
    const protocol = String(normalized.protocol).trim().toLowerCase();
    if (!VALID_PROTOCOLS.has(protocol)) {
      errors.push(`Invalid protocol '${normalized.protocol}'. Use tcp, udp, grpc, http, or ws.`);
    } else { options.protocol = protocol; }
  }

  if (normalized.mode !== undefined) {
    const mode = String(normalized.mode).trim().toLowerCase();
    if (!VALID_MODES.has(mode)) {
      errors.push(`Invalid mode '${normalized.mode}'. Use server or client.`);
    } else { options.mode = mode; }
  }

  if (normalized.ip !== undefined) options.ip = String(normalized.ip).trim();
  if (normalized.port !== undefined) {
    options.port = parseInteger(normalized.port, 'port', errors, { min: 1, max: 65535 });
  }
  if (normalized.autoConnect !== undefined) {
    options.autoConnect = parseBoolean(normalized.autoConnect, 'autoConnect', errors);
  }
  if (normalized.connectTimeoutMs !== undefined) {
    options.connectTimeoutMs = parseInteger(normalized.connectTimeoutMs, 'connectTimeoutMs', errors, { min: 0 });
  }
  if (normalized.connectRetryIntervalMs !== undefined) {
    options.connectRetryIntervalMs = parseInteger(normalized.connectRetryIntervalMs, 'connectRetryIntervalMs', errors, { min: 1 });
  }
  if (normalized.connectWaitForServer !== undefined) {
    options.connectWaitForServer = parseBoolean(normalized.connectWaitForServer, 'connectWaitForServer', errors);
  }
  if (normalized.outputFile !== undefined && normalized.outputFile !== '') {
    options.outputFile = resolvePathValue(normalized.outputFile);
  }
  if (normalized.outputFormat !== undefined) {
    const outputFormat = String(normalized.outputFormat).trim().toLowerCase();
    if (!VALID_OUTPUT_FORMATS.has(outputFormat)) {
      errors.push(`Invalid outputFormat '${normalized.outputFormat}'. Use text, jsonl, or csv.`);
    } else { options.outputFormat = outputFormat; }
  }
  if (normalized.appendOutput !== undefined) {
    options.appendOutput = parseBoolean(normalized.appendOutput, 'appendOutput', errors);
  }
  if (normalized.maxLogCount !== undefined && normalized.maxLogCount !== '') {
    options.maxLogCount = parseInteger(normalized.maxLogCount, 'maxLogCount', errors, { min: 1, allowNull: true });
  }
  if (normalized.durationMs !== undefined && normalized.durationMs !== '') {
    options.durationMs = parseInteger(normalized.durationMs, 'durationMs', errors, { min: 1, allowNull: true });
  }
  if (normalized.idleTimeoutMs !== undefined) {
    options.idleTimeoutMs = parseInteger(normalized.idleTimeoutMs, 'idleTimeoutMs', errors, { min: 0 });
  }
  if (normalized.filter !== undefined && normalized.filter !== '') {
    const regex = compileRegex(normalized.filter, 'filter', errors);
    if (regex) options.filter = normalized.filter;
  }
  if (normalized.exclude !== undefined && normalized.exclude !== '') {
    const regex = compileRegex(normalized.exclude, 'exclude', errors);
    if (regex) options.exclude = normalized.exclude;
  }
  if (normalized.explain !== undefined) {
    options.explain = parseBoolean(normalized.explain, 'explain', errors);
  }
  if (normalized.stdout !== undefined) {
    options.stdout = parseBoolean(normalized.stdout, 'stdout', errors);
  }
  if (normalized.logLevel !== undefined) {
    const logLevel = String(normalized.logLevel).trim().toLowerCase();
    if (!VALID_LOG_LEVELS.has(logLevel)) {
      errors.push(`Invalid logLevel '${normalized.logLevel}'. Use error, warn, info, or debug.`);
    } else { options.logLevel = logLevel; }
  }
  if (normalized.logFile !== undefined && normalized.logFile !== '') {
    options.logFile = resolvePathValue(normalized.logFile);
  }
  if (normalized.exitOnComplete !== undefined) {
    options.exitOnComplete = parseBoolean(normalized.exitOnComplete, 'exitOnComplete', errors);
  }
  if (normalized.onError !== undefined) {
    const onError = String(normalized.onError).trim().toLowerCase();
    if (!VALID_ON_ERROR.has(onError)) {
      errors.push(`Invalid onError '${normalized.onError}'. Use exit, continue, or pause.`);
    } else { options.onError = onError; }
  }
  if (normalized.doneFile !== undefined && normalized.doneFile !== '') {
    options.doneFile = resolvePathValue(normalized.doneFile);
  }
  if (normalized.runId !== undefined && normalized.runId !== '') {
    options.runId = String(normalized.runId).trim();
  }
  if (normalized.config !== undefined && normalized.config !== '') {
    options.config = resolvePathValue(normalized.config);
  }

  if (normalized.grpcHeaderPathKey !== undefined && normalized.grpcHeaderPathKey !== '') {
    options.grpcHeaderPathKey = String(normalized.grpcHeaderPathKey).trim();
  }

  if (normalized.grpcHeaderPath !== undefined && normalized.grpcHeaderPath !== '') {
    options.grpcHeaderPath = String(normalized.grpcHeaderPath).trim();
  }

  if (normalized.grpcSendMethod !== undefined) {
    const method = String(normalized.grpcSendMethod).trim().toLowerCase();
    if (!VALID_GRPC_SEND_METHODS.has(method)) {
      errors.push(`Invalid grpcSendMethod '${normalized.grpcSendMethod}'. Use stream or unary.`);
    } else {
      options.grpcSendMethod = method;
    }
  }

  if (normalized.showMetadata !== undefined) {
    options.showMetadata = parseBoolean(normalized.showMetadata, 'showMetadata', errors);
  }

  if (normalized.useTls !== undefined) {
    options.useTls = normalized.useTls === true || normalized.useTls === 'true';
  }
  if (normalized.tlsCaPath !== undefined && normalized.tlsCaPath !== '') {
    options.tlsCaPath = resolvePathValue(normalized.tlsCaPath);
  }
  if (normalized.tlsCertPath !== undefined && normalized.tlsCertPath !== '') {
    options.tlsCertPath = resolvePathValue(normalized.tlsCertPath);
  }
  if (normalized.tlsKeyPath !== undefined && normalized.tlsKeyPath !== '') {
    options.tlsKeyPath = resolvePathValue(normalized.tlsKeyPath);
  }

  // --- HTTP params ---
  if (normalized.httpFormat !== undefined) {
    const fmt = String(normalized.httpFormat).trim().toLowerCase();
    if (!VALID_DATA_FORMATS.has(fmt)) {
      errors.push(`Invalid httpFormat '${normalized.httpFormat}'. Use json, delimited, esriJson, geojson, or xml.`);
    } else { options.httpFormat = fmt; }
  }
  if (normalized.httpTls !== undefined) {
    options.httpTls = parseBoolean(normalized.httpTls, 'httpTls', errors);
  }
  if (normalized.httpPath !== undefined && normalized.httpPath !== '') {
    options.httpPath = String(normalized.httpPath).trim();
  }
  if (normalized.httpTlsCaPath !== undefined && normalized.httpTlsCaPath !== '') {
    options.httpTlsCaPath = resolvePathValue(normalized.httpTlsCaPath);
  }
  if (normalized.httpTlsCertPath !== undefined && normalized.httpTlsCertPath !== '') {
    options.httpTlsCertPath = resolvePathValue(normalized.httpTlsCertPath);
  }
  if (normalized.httpTlsKeyPath !== undefined && normalized.httpTlsKeyPath !== '') {
    options.httpTlsKeyPath = resolvePathValue(normalized.httpTlsKeyPath);
  }

  // --- WebSocket params ---
  if (normalized.wsFormat !== undefined) {
    const fmt = String(normalized.wsFormat).trim().toLowerCase();
    if (!VALID_DATA_FORMATS.has(fmt)) {
      errors.push(`Invalid wsFormat '${normalized.wsFormat}'. Use json, delimited, esriJson, geojson, or xml.`);
    } else { options.wsFormat = fmt; }
  }
  if (normalized.wsTls !== undefined) {
    options.wsTls = parseBoolean(normalized.wsTls, 'wsTls', errors);
  }
  if (normalized.wsPath !== undefined && normalized.wsPath !== '') {
    options.wsPath = String(normalized.wsPath).trim();
  }
  if (normalized.wsTlsCaPath !== undefined && normalized.wsTlsCaPath !== '') {
    options.wsTlsCaPath = resolvePathValue(normalized.wsTlsCaPath);
  }
  if (normalized.wsTlsCertPath !== undefined && normalized.wsTlsCertPath !== '') {
    options.wsTlsCertPath = resolvePathValue(normalized.wsTlsCertPath);
  }
  if (normalized.wsTlsKeyPath !== undefined && normalized.wsTlsKeyPath !== '') {
    options.wsTlsKeyPath = resolvePathValue(normalized.wsTlsKeyPath);
  }
  if (normalized.wsSubscriptionMsg !== undefined && normalized.wsSubscriptionMsg !== '') {
    options.wsSubscriptionMsg = String(normalized.wsSubscriptionMsg);
  }
  if (normalized.wsIgnoreFirstMsg !== undefined) {
    options.wsIgnoreFirstMsg = parseBoolean(normalized.wsIgnoreFirstMsg, 'wsIgnoreFirstMsg', errors);
  }
  if (normalized.wsHeaders !== undefined && normalized.wsHeaders !== '') {
    options.wsHeaders = String(normalized.wsHeaders);
  }

  if (!options.outputFile) {
    warnings.push("No 'outputFile' provided: captured records will be written to the console (stdout) using the selected outputFormat.");
  }
  if (options.mode === 'client' && !options.ip) {
    errors.push("Client mode requires 'ip=<address>' (or 'host=<address>').");
  }
  if (options.onError === 'pause' && options.exitOnComplete) {
    warnings.push("'onError=pause' may keep the process alive until it is externally stopped.");
  }
  if (options.connectWaitForServer && options.mode === 'server') {
    warnings.push("'connectWaitForServer' is ignored in server mode. It only applies to TCP client mode.");
    options.connectWaitForServer = false;
  }

  // Warn about explicitly provided parameters that have no effect given the resolved options.
  const isClient = options.mode === 'client';
  const isTcp = options.protocol === 'tcp';
  const isTcpClient = isTcp && isClient;
  const waitEnabled = options.connectWaitForServer;

  if (normalized.connectWaitForServer !== undefined && !isTcpClient && isClient) {
    warnings.push("'connectWaitForServer' is ignored for UDP client mode. It only applies to TCP client mode.");
  }
  if (normalized.connectRetryIntervalMs !== undefined && !waitEnabled) {
    warnings.push("'connectRetryIntervalMs' has no effect because connectWaitForServer is false (the default). Set connectWaitForServer=true to enable connection retry.");
  }
  if (normalized.connectRetryIntervalMs !== undefined && !isTcpClient) {
    warnings.push("'connectRetryIntervalMs' is ignored outside TCP client mode. It only applies when protocol=tcp and mode=client.");
  }
  if (normalized.appendOutput !== undefined && !options.outputFile) {
    warnings.push("'appendOutput' has no effect because no outputFile is specified. Records are written to stdout instead.");
  }
  if (normalized.stdout !== undefined && !options.outputFile) {
    warnings.push("'stdout' has no effect because no outputFile is specified. Records always go to stdout when outputFile is omitted.");
  }
  if (normalized.exitOnComplete !== undefined && !options.maxLogCount && !options.durationMs && !options.idleTimeoutMs) {
    warnings.push("'exitOnComplete' has no effect because no termination trigger is configured (maxLogCount, durationMs, or idleTimeoutMs).");
  }
  if (normalized.filter !== undefined && normalized.exclude !== undefined && options.filter === options.exclude) {
    warnings.push("'filter' and 'exclude' are identical, which means no records will be captured.");
  }

  return options;
}

function getCompactHelpText() {
  const COL = { name: 22, values: 22, def: 12, example: 36, purpose: 50 };

  const firstSentence = (text) => {
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : text.trim();
  };

  const widths = [COL.name, COL.values, COL.def, COL.example, COL.purpose];
  const rows = CLI_PARAMETER_DEFINITIONS.map((entry) => {
    const values = Array.isArray(entry.options) ? entry.options.join(' | ') : String(entry.options || '');
    return [
      entry.key,
      values,
      formatDefaultValue(entry.defaultValue),
      entry.example,
      firstSentence(entry.purpose),
    ];
  });

  const lines = [
    'ArcGIS Velocity Logger command-line help',
    'Layout: help (Name | Supported Values | Default | Example | Purpose)',
    '',
    buildAsciiTable(
      ['Name', 'Supported Values', 'Default', 'Example', 'Purpose'],
      rows,
      widths,
    ),
  ];

  lines.push('');
  lines.push(...getCompactExampleUsageLines());
  lines.push('Aliases: runMode=silent = runMode=headless  |  host=<value> = ip=<value>  |  h / -h / --help = help=true');
  lines.push('More help: help-wide=true  |  help-detailed=true  |  help-table-wide=true  |  help-table-narrow=true');

  return lines.join('\n').trimEnd();
}

function getCompactNoExampleHelpText() {
  const COL = { name: 22, values: 24, def: 12, purpose: 50 };

  const firstSentence = (text) => {
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : text.trim();
  };

  const widths = [COL.name, COL.values, COL.def, COL.purpose];
  const rows = CLI_PARAMETER_DEFINITIONS.map((entry) => {
    const values = Array.isArray(entry.options) ? entry.options.join(' | ') : String(entry.options || '');
    return [
      entry.key,
      values,
      formatDefaultValue(entry.defaultValue),
      firstSentence(entry.purpose),
    ];
  });

  const lines = [
    'ArcGIS Velocity Logger command-line help',
    'Layout: help (Name | Supported Values | Default | Purpose)',
    '',
    buildAsciiTable(
      ['Name', 'Supported Values', 'Default', 'Purpose'],
      rows,
      widths,
    ),
  ];

  lines.push('');
  lines.push(...getCompactExampleUsageLines());
  lines.push('Aliases: runMode=silent = runMode=headless  |  host=<value> = ip=<value>  |  h / -h / --help = help=true');
  lines.push('More help: help-wide=true  |  help-detailed=true  |  help-table-wide=true  |  help-table-narrow=true');

  return lines.join('\n').trimEnd();
}

function getCommandHelpText({ layout = HELP_LAYOUTS.compactNoExample } = {}) {
  if (layout === HELP_LAYOUTS.compactNoExample) return getCompactNoExampleHelpText();
  if (layout === HELP_LAYOUTS.compact) return getCompactHelpText();
  if (layout === HELP_LAYOUTS.tableWide) return getTableHelpText({ layout: HELP_LAYOUTS.tableWide });
  if (layout === HELP_LAYOUTS.tableNarrow) return getTableHelpText({ layout: HELP_LAYOUTS.tableNarrow });
  return getStandardHelpText();
}

function formatCliStartupErrorOutput(cliArgs, {
  helpCommandExample = 'electron . help=true',
} = {}) {
  const normalizedErrors = Array.isArray(cliArgs?.errors) ? cliArgs.errors : [];
  const helpText = cliArgs?.helpText || getCommandHelpText();

  const startupLines = [
    'CLI startup aborted due to invalid command-line parameters. The application will exit without launching.',
  ];

  normalizedErrors.forEach((error) => {
    let detail = String(error || '').trim();
    if (detail.startsWith('Unknown CLI parameter') && !detail.includes('not supported')) {
      detail = `${detail} These parameters are not supported.`;
    }
    startupLines.push(`CLI error: ${detail} Review valid CLI parameters with: ${helpCommandExample}`);
  });

  return `${startupLines.join('\n')}\n\n${helpText}`;
}

/**
 * Main CLI entry point used by `src/main.js`.
 *
 * Returns a structured object describing:
 * - the resolved startup mode (`ui`, `headless`, `help`, or `error`)
 * - validation errors and non-fatal warnings
 * - fully normalized headless options when applicable
 */
function parseCommandLineArgs(rawArgv, { isPackaged = false } = {}) {
  const rawArgs = sliceUserArgs(rawArgv, isPackaged);
  const { values: rawValues, positional, helpLayout: rawHelpLayout } = parseRawArgs(rawArgs);
  let helpLayout = rawHelpLayout;

  if (parseBoolean(rawValues.help, 'help', []) === true || parseBoolean(rawValues.h, 'h', []) === true) {
    helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.compactNoExample);
  }
  if (parseBoolean(rawValues['help-detailed'], 'help-detailed', []) === true) {
    helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.standard);
  }
  if (parseBoolean(rawValues['help-wide'], 'help-wide', []) === true) {
    helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.compact);
  }
  if (parseBoolean(rawValues['help-table-wide'], 'help-table-wide', []) === true) {
    helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.tableWide);
  }
  if (parseBoolean(rawValues['help-table-narrow'], 'help-table-narrow', []) === true) {
    helpLayout = mergeHelpLayout(helpLayout, HELP_LAYOUTS.tableNarrow);
  }

  const helpRequested = Boolean(helpLayout);

  if (helpRequested) {
    return {
      mode: 'help',
      explain: false,
      errors: [],
      warnings: [],
      rawArgs,
      positional,
      presets: null,
      ui: {},
      headless: null,
      helpText: getCommandHelpText({ layout: helpLayout }),
      explainText: null,
      configPath: rawValues.config ? resolvePathValue(rawValues.config) : null,
    };
  }

  const errors = [];
  const warnings = [];
  if (positional.length > 0) {
    errors.push(
      `Unknown CLI argument${positional.length === 1 ? '' : 's'}: ${positional.join(', ')}. Use name=value syntax for supported CLI parameters.`,
    );
  }
  const unknownKeys = Object.keys(rawValues).filter((key) => !CLI_OPTION_KEYS.has(key) && key !== 'host' && key !== 'silent');
  if (unknownKeys.length > 0) {
    errors.push(
      `Unknown CLI parameter${unknownKeys.length === 1 ? '' : 's'}: ${unknownKeys.join(', ')}.`,
    );
  }

  let configLoad = { path: null, values: {} };
  if (rawValues.config) {
    configLoad = loadRunConfig(rawValues.config, errors);
  }

  const mergedValues = { ...configLoad.values, ...rawValues };

  const requestedRunMode = (mergedValues.runMode || 'ui').toString().trim().toLowerCase();
  const normalizedRunMode = requestedRunMode === 'silent' ? 'headless' : requestedRunMode;
  const headlessRequested = normalizedRunMode === 'headless';

  if (!VALID_RUN_MODES.has(requestedRunMode)) {
    errors.push(`Invalid runMode '${mergedValues.runMode}'. Use ui, silent, or headless.`);
  }

  const headlessOptions = headlessRequested ? validateHeadlessOptions(mergedValues, errors, warnings) : null;
  let uiStartupPresets = null;

  if (!headlessRequested && errors.length === 0) {
    // Keys that can prepopulate the UI when passed in UI mode.
    const uiPresetKeys = new Set([
      'protocol', 'mode', 'ip', 'port', 'grpcSerialization', 'grpcSendMethod',
      'grpcHeaderPath', 'grpcHeaderPathKey', 'useTls', 'tlsCaPath', 'tlsCertPath', 'tlsKeyPath',
      'httpFormat', 'httpTls', 'httpPath', 'httpTlsCaPath', 'httpTlsCertPath', 'httpTlsKeyPath',
      'wsFormat', 'wsTls', 'wsPath', 'wsTlsCaPath', 'wsTlsCertPath', 'wsTlsKeyPath',
      'wsSubscriptionMsg', 'wsIgnoreFirstMsg', 'wsHeaders',
    ]);
    const uiRecognizedKeys = new Set(['runMode', 'help', 'help-detailed', 'help-wide', 'config', 'help-table-wide', 'help-table-narrow', 'explain', ...uiPresetKeys]);
    const ignoredKeys = Object.keys(mergedValues).filter(
      (key) => !uiRecognizedKeys.has(key),
    );
    if (ignoredKeys.length > 0) {
      warnings.push(`UI mode ignores these CLI parameters: ${ignoredKeys.join(', ')}`);
    }

    // Build presets for UI prepopulation
    const presets = {};
    for (const key of uiPresetKeys) {
      if (mergedValues[key] !== undefined) {
        presets[key] = mergedValues[key];
      }
    }
    // host alias
    if (mergedValues.host !== undefined && presets.ip === undefined) {
      presets.ip = mergedValues.host;
    }
    uiStartupPresets = Object.keys(presets).length > 0 ? presets : null;
  }

  let mode = 'ui';
  if (headlessRequested) mode = 'headless';
  if (errors.length > 0) mode = 'error';

  // Resolve explain: defaults to true when not provided
  const explainRaw = rawValues.explain;
  const explain = explainRaw === undefined ? true : parseBoolean(explainRaw, 'explain', []) !== false;

  const result = {
    mode,
    explain,
    errors,
    warnings,
    rawArgs,
    positional,
    presets: uiStartupPresets,
    ui: {
      presets: uiStartupPresets,
    },
    headless: headlessOptions,
    helpText: getCommandHelpText(),
    configPath: configLoad.path,
  };

  // Build explain text for any mode when explain is enabled.
  result.explainText = explain ? formatExplainOutput(result) : null;

  return result;
}

/**
 * Build a detailed startup explanation describing how the app will run
 * based on the resolved options, including any warnings and errors.
 * Works for both UI and headless modes.
 */
function formatExplainOutput(cliOptions) {
  const divider = cliDivider(72);
  const sectionDivider = '  ' + cliDivider(40);
  const lines = [];

  lines.push('');
  lines.push(divider);
  lines.push(`  ArcGIS Velocity Logger${CLI_SYMBOLS.separator}Startup Explanation`);
  lines.push(divider);
  lines.push('');

  // --- Mode ---
  const modeLabel = {
    ui: 'UI (interactive)',
    headless: 'Headless (no UI)',
    help: 'Help (print help and exit)',
    error: 'Error (startup aborted)',
  }[cliOptions.mode] || cliOptions.mode;

  lines.push(`  Run mode : ${modeLabel}`);

  // --- Config file ---
  if (cliOptions.configPath) {
    lines.push(`  Config   : ${cliOptions.configPath}`);
  }

  // --- UI mode details ---
  if (cliOptions.mode === 'ui') {
    const presets = cliOptions.ui && cliOptions.ui.presets;

    lines.push('');
    lines.push('  UI Configuration');
    lines.push(sectionDivider);

    const d = DEFAULT_HEADLESS_OPTIONS;
    const configLines = [
      ['protocol', (presets && presets.protocol) || `(default: ${d.protocol})`],
      ['mode', (presets && presets.mode) || `(default: ${d.mode})`],
      ['ip', (presets && presets.ip) || `(default: ${d.ip})`],
      ['port', (presets && presets.port) || `(default: ${d.port})`],
      ['grpcSerialization', (presets && presets.grpcSerialization) || `(default: ${d.grpcSerialization})`],
      ['grpcSendMethod', (presets && presets.grpcSendMethod) || `(default: ${d.grpcSendMethod})`],
      ['grpcHeaderPath', (presets && presets.grpcHeaderPath) || `(default: ${d.grpcHeaderPath})`],
      ['grpcHeaderPathKey', (presets && presets.grpcHeaderPathKey) || `(default: ${d.grpcHeaderPathKey})`],
      ['useTls', presets && presets.useTls !== undefined ? presets.useTls : `(default: ${d.useTls})`],
      ['httpFormat', (presets && presets.httpFormat) || `(default: ${d.httpFormat})`],
      ['httpTls', presets && presets.httpTls !== undefined ? presets.httpTls : `(default: ${d.httpTls})`],
      ['httpPath', (presets && presets.httpPath) || `(default: ${d.httpPath})`],
      ['wsFormat', (presets && presets.wsFormat) || `(default: ${d.wsFormat})`],
      ['wsTls', presets && presets.wsTls !== undefined ? presets.wsTls : `(default: ${d.wsTls})`],
      ['wsPath', (presets && presets.wsPath) || `(default: ${d.wsPath})`],
    ];

    const maxKeyLen = Math.max(...configLines.map(([key]) => key.length));
    configLines.forEach(([key, value]) => {
      lines.push(`    ${key.padEnd(maxKeyLen)}  ${value}`);
    });

    // --- UI behavior summary ---
    lines.push('');
    lines.push('  Behavior Summary');
    lines.push(sectionDivider);
    lines.push('    The app will open in normal UI mode and restore saved behavior');
    lines.push('    from the configuration file (theme, fonts, window state, opacity,');
    lines.push('    connection controls visibility).');

    if (presets && presets.protocol && presets.mode) {
      const addr = `${presets.ip || 'localhost'}:${presets.port || '5000'}`;
      if (presets.mode === 'server') {
        const bindDesc = presets.ip === '0.0.0.0'
          ? 'all interfaces (remote clients can connect)'
          : presets.ip === '127.0.0.1'
            ? 'loopback only (local connections only)'
            : `interface ${presets.ip || 'localhost'}`;
        lines.push(`    Transport : ${presets.protocol.toUpperCase()} server listening on ${addr}`);
        lines.push(`    Bind      : ${bindDesc}`);
      } else {
        lines.push(`    Transport : ${presets.protocol.toUpperCase()} client connecting to ${addr}`);
      }
    } else {
      lines.push('    Transport : will use UI-selected protocol and mode');
    }

    lines.push('    Output    : received data displayed in log panel');
  }

  // --- Headless mode details ---
  if (cliOptions.mode === 'headless' && cliOptions.headless) {
    const h = cliOptions.headless;

    lines.push('');
    lines.push('  Headless Configuration');
    lines.push(sectionDivider);

    const paramLines = [
      ['protocol', h.protocol.toUpperCase()],
      ['mode', h.mode],
      ['ip', h.ip],
      ['port', h.port],
      ['autoConnect', h.autoConnect],
      ['connectWaitForServer', h.connectWaitForServer],
      ['connectRetryIntervalMs', `${h.connectRetryIntervalMs}ms`],
      ['connectTimeoutMs', h.connectTimeoutMs === 0 ? '0 (indefinite)' : `${h.connectTimeoutMs}ms`],
      ['outputFile', h.outputFile || '(stdout)'],
      ['outputFormat', h.outputFormat],
      ['appendOutput', h.appendOutput],
      ['stdout', h.stdout],
      ['maxLogCount', h.maxLogCount === null ? '(unlimited)' : h.maxLogCount],
      ['durationMs', h.durationMs === null ? '(unlimited)' : `${h.durationMs}ms`],
      ['idleTimeoutMs', h.idleTimeoutMs === 0 ? '0 (disabled)' : `${h.idleTimeoutMs}ms`],
      ['filter', h.filter || '(none)'],
      ['exclude', h.exclude || '(none)'],
      ['exitOnComplete', h.exitOnComplete],
      ['onError', h.onError],
      ['logLevel', h.logLevel],
      ['logFile', h.logFile || '(none)'],
      ['doneFile', h.doneFile || '(none)'],
      ['runId', h.runId || '(none)'],
    ];

    const maxKeyLen = Math.max(...paramLines.map(([key]) => key.length));
    paramLines.forEach(([key, value]) => {
      lines.push(`    ${key.padEnd(maxKeyLen)}  ${value}`);
    });

    // --- Behavior summary ---
    lines.push('');
    lines.push('  Behavior Summary');
    lines.push(sectionDivider);

    if (h.mode === 'server') {
      const bindDesc = h.ip === '0.0.0.0'
        ? 'all interfaces (remote clients can connect)'
        : h.ip === '127.0.0.1'
          ? 'loopback only (local connections only)'
          : `interface ${h.ip}`;
      lines.push(`    Transport : ${h.protocol.toUpperCase()} server listening on ${h.ip}:${h.port}`);
      lines.push(`    Bind      : ${bindDesc}`);
    } else {
      lines.push(`    Transport : ${h.protocol.toUpperCase()} client connecting to ${h.ip}:${h.port}`);
      if (h.connectWaitForServer) {
        const deadline = h.connectTimeoutMs === 0 ? 'indefinitely' : `up to ${h.connectTimeoutMs}ms`;
        lines.push(`    Retry     : will retry every ${h.connectRetryIntervalMs}ms, waiting ${deadline}`);
      } else {
        lines.push('    Retry     : disabled (a failed connection attempt aborts the run)');
      }
    }

    if (h.outputFile) {
      lines.push(`    Output    : ${h.outputFormat} ${CLI_SYMBOLS.arrow} ${h.outputFile}${h.appendOutput ? ' (append)' : ''}`);
      lines.push(`    Stdout    : ${h.stdout ? 'echo to console' : 'file only'}`);
    } else {
      lines.push(`    Output    : ${h.outputFormat} ${CLI_SYMBOLS.arrow} stdout`);
    }

    const triggers = [];
    if (h.maxLogCount) triggers.push(`maxLogCount=${h.maxLogCount}`);
    if (h.durationMs) triggers.push(`durationMs=${h.durationMs}`);
    if (h.idleTimeoutMs > 0) triggers.push(`idleTimeoutMs=${h.idleTimeoutMs}`);
    lines.push(`    Triggers  : ${triggers.length > 0 ? triggers.join(', ') : 'none (run until stopped manually)'}`);
    lines.push(`    On error  : ${h.onError}`);
    lines.push(`    Exit      : ${h.exitOnComplete ? `yes${CLI_SYMBOLS.separator}process exits after completion` : `no${CLI_SYMBOLS.separator}process stays alive after completion`}`);
    if (h.doneFile) {
      lines.push(`    Done file : ${h.doneFile}`);
    }
  }

  // --- Warnings ---
  if (cliOptions.warnings && cliOptions.warnings.length > 0) {
    lines.push('');
    lines.push('  Warnings');
    lines.push(sectionDivider);
    cliOptions.warnings.forEach((w) => {
      lines.push(`    ${CLI_SYMBOLS.warning}  ${w}`);
    });
  }

  // --- Errors ---
  if (cliOptions.errors && cliOptions.errors.length > 0) {
    lines.push('');
    lines.push('  Errors');
    lines.push(sectionDivider);
    cliOptions.errors.forEach((e) => {
      lines.push(`    ${CLI_SYMBOLS.error}  ${e}`);
    });
  }

  lines.push('');
  lines.push(divider);
  lines.push('');

  return lines.join('\n');
}

module.exports = {
  DEFAULT_HEADLESS_OPTIONS,
  CLI_PARAMETER_DEFINITIONS,
  formatCliStartupErrorOutput,
  formatExplainOutput,
  getCommandLineReferenceData,
  getCommandHelpText,
  parseCommandLineArgs,
  resolvePathValue,
};
