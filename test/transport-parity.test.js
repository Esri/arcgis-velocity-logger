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
 * @file transport-parity.test.js
 * @description
 * Programmatic comparison of the shared transport lifecycle surface between
 * this repository (the ArcGIS Velocity Logger) and the ArcGIS Velocity
 * Simulator.
 *
 * The two applications are one protocol: the Simulator's send path is the
 * Logger's receive path. Lifecycle helpers, option vocabulary, bounds, and
 * diagnostic wording are a cross-application contract and must not drift.
 *
 * The Simulator checkout is optional. When it is not present next to this
 * repository the comparisons are skipped and only the local invariants run, so
 * the suite still passes on a machine that has only one of the two. Set
 * `VELOCITY_SIMULATOR_ROOT` to compare against a checkout somewhere else.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SIMULATOR_ROOT = process.env.VELOCITY_SIMULATOR_ROOT
  || path.resolve(__dirname, '..', '..', 'arcgis-velocity-simulator');
const hasSimulator = fs.existsSync(path.join(SIMULATOR_ROOT, 'src', 'ws-transport.js'));

let passed = 0;
let skipped = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed += 1; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.stack || err.message}`); process.exitCode = 1; }
}

function compare(name, fn) {
  if (!hasSimulator) { console.log(`  – ${name} (Simulator checkout not found)`); skipped += 1; return; }
  test(name, fn);
}

function readLocal(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function readSimulator(relative) {
  return fs.readFileSync(path.join(SIMULATOR_ROOT, relative), 'utf8');
}

/** Extracts one top-level function declaration by name, whitespace-normalized. */
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `function ${name} was not found`);
  let depth = 0;
  let seenBrace = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') { depth += 1; seenBrace = true; }
    else if (char === '}') {
      depth -= 1;
      if (seenBrace && depth === 0) {
        return source.slice(start, index + 1).replace(/\s+/g, ' ').trim();
      }
    }
  }
  throw new Error(`function ${name} was not terminated`);
}

console.log('transport-parity.test.js');

// ---------------------------------------------------------------------------
// Local invariants: these hold whether or not the Simulator is checked out.
// ---------------------------------------------------------------------------

test('the WebSocket teardown bound is a single named constant', () => {
  const source = readLocal('src/ws-transport.js');
  assert.match(source, /const WS_CLOSE_TIMEOUT_MS = 2000;/);
  assert.strictEqual((source.match(/WS_CLOSE_TIMEOUT_MS/g) || []).length, 3,
    'the bound is declared once and used by both close helpers');
});

test('both gRPC client implementations share one teardown helper', () => {
  const source = readLocal('src/grpc-transport.js');
  assert.strictEqual((source.match(/return teardownGrpcClient\(this, '/g) || []).length, 2,
    'each client implementation delegates to teardownGrpcClient');
  assert.strictEqual((source.match(/async function teardownGrpcClient\(/g) || []).length, 1,
    'teardown is defined exactly once');
  assert.doesNotMatch(source, /async disconnect\(\) \{\s*if \(this\.stream\) \{ this\.stream\.cancel\(\);/,
    'no client implementation still tears down inline');
});

test('the HTTP client applies authorization headers through one helper', () => {
  const source = readLocal('src/http-transport.js');
  assert.strictEqual((source.match(/_applyAuthHeaders\(/g) || []).length, 3,
    'the helper is defined once and used by the subscription and the send path');
});

test('the HTTP client stops subscribing after a definitive non-SSE answer', () => {
  const { createHttpClientTransport } = require('../src/http-transport.js');
  const client = createHttpClientTransport({ ip: '127.0.0.1', port: 1, httpTls: false });
  assert.strictEqual(client._sseSupported, true);
  assert.strictEqual(client._sseEstablished, false);
  assert.strictEqual(client._sseReconnectDelayMs, 1000);
  assert.strictEqual(client._sseErrorRetryDelayMs, 2000);
});

// ---------------------------------------------------------------------------
// Cross-application comparisons.
// ---------------------------------------------------------------------------

compare('the WebSocket close helpers are character-for-character identical', () => {
  const local = readLocal('src/ws-transport.js');
  const simulator = readSimulator('src/ws-transport.js');
  for (const name of ['closeWebSocket', 'closeWithTimeout']) {
    assert.strictEqual(extractFunction(local, name), extractFunction(simulator, name),
      `${name} drifted between the two repositories`);
  }
});

compare('the WebSocket teardown bound matches', () => {
  const localBound = /const WS_CLOSE_TIMEOUT_MS = (\d+);/.exec(readLocal('src/ws-transport.js'));
  const simulatorBound = /const WS_CLOSE_TIMEOUT_MS = (\d+);/.exec(readSimulator('src/ws-transport.js'));
  assert.ok(localBound && simulatorBound, 'both repositories declare the bound');
  assert.strictEqual(localBound[1], simulatorBound[1]);
});

compare('the WebSocket bind failure message matches', () => {
  const pattern = /WebSocket server failed to bind on \$\{ip\}:\$\{port\}: \$\{err\.message\}/;
  assert.match(readLocal('src/ws-transport.js'), pattern);
  assert.match(readSimulator('src/ws-transport.js'), pattern);
});

compare('the WebSocket transports expose the same public shape', () => {
  const localWs = require('../src/ws-transport.js');
  const simulatorWs = require(path.join(SIMULATOR_ROOT, 'src', 'ws-transport.js'));
  assert.deepStrictEqual(Object.keys(localWs).sort(), Object.keys(simulatorWs).sort());
  assert.strictEqual(localWs.WS_DEFAULT_PORT, simulatorWs.WS_DEFAULT_PORT);
  assert.strictEqual(localWs.WSS_DEFAULT_PORT, simulatorWs.WSS_DEFAULT_PORT);
  assert.strictEqual(localWs.DEFAULT_FORMAT, simulatorWs.DEFAULT_FORMAT);

  const options = { ip: '127.0.0.1', port: 19994, wsTls: false };
  const localClient = localWs.createWsClientTransport(options);
  const simulatorClient = simulatorWs.createWsClientTransport(options);
  assert.deepStrictEqual(Object.keys(localClient).sort(), Object.keys(simulatorClient).sort());

  const localServer = localWs.createWsServerTransport(options);
  const simulatorServer = simulatorWs.createWsServerTransport(options);
  assert.deepStrictEqual(Object.keys(localServer).sort(), Object.keys(simulatorServer).sort());
  for (const key of Object.keys(localServer)) {
    assert.strictEqual(localServer[key].constructor.name, simulatorServer[key].constructor.name,
      `${key} changed kind between the two repositories`);
  }
  assert.strictEqual(localServer.disconnect.constructor.name, 'AsyncFunction');
  assert.strictEqual(localClient.disconnect.constructor.name, 'AsyncFunction');
});

compare('the HTTP transport file is identical apart from the product name', () => {
  const normalize = (source) => source
    .replace('HTTP/HTTPS transport for the ArcGIS Velocity Logger.', 'HTTP/HTTPS transport for the ArcGIS Velocity Simulator.')
    .replace(/\s+$/, '');
  assert.strictEqual(normalize(readLocal('src/http-transport.js')), normalize(readSimulator('src/http-transport.js')));
});

compare('the HTTP subscription pacing constants match', () => {
  const read = (source) => ({
    reconnect: /_sseReconnectDelayMs = (\d+);/.exec(source)[1],
    errorRetry: /_sseErrorRetryDelayMs = (\d+);/.exec(source)[1],
  });
  assert.deepStrictEqual(read(readLocal('src/http-transport.js')), read(readSimulator('src/http-transport.js')));
});

compare('the gRPC teardown diagnostic wording matches', () => {
  const pattern = /\[Transport\] gRPC teardown reported: \$\{message\}/;
  assert.match(readLocal('src/grpc-transport.js'), pattern);
  assert.match(readSimulator('src/grpc-transport.js'), pattern);
  const channelPattern = /Closing the gRPC channel reported: \$\{error\.message\}/;
  assert.match(readLocal('src/grpc-transport.js'), channelPattern);
  assert.match(readSimulator('src/grpc-transport.js'), channelPattern);
});

compare('waitForGrpcCompletion is identical and bounded the same way', () => {
  assert.strictEqual(
    extractFunction(readLocal('src/grpc-transport.js'), 'waitForGrpcCompletion'),
    extractFunction(readSimulator('src/grpc-transport.js'), 'waitForGrpcCompletion')
  );
});

compare('gRPC teardown returns the same diagnostics shape in both repositories', () => {
  const localTeardown = extractFunction(readLocal('src/grpc-transport.js'), 'teardownGrpcClient');
  const simulatorTeardown = extractFunction(readSimulator('src/grpc-transport.js'), 'teardownGrpcClient');
  for (const teardown of [localTeardown, simulatorTeardown]) {
    assert.match(teardown, /const warnings = \[\];/);
    assert.match(teardown, /transport\._connected = false;/);
    assert.match(teardown, /return \{ warnings \};/);
    assert.match(teardown, /transport\.client = null;/);
  }
  // The one honest difference: the Simulator half-closes the call it writes to,
  // the Logger cancels the call it reads from.
  assert.match(simulatorTeardown, /endGrpcStream\(stream\)/);
  assert.match(localTeardown, /cancelGrpcStream\(stream\)/);
});

compare('the gRPC serialization vocabulary matches', () => {
  const local = require('../src/grpc-transport.js');
  const simulator = require(path.join(SIMULATOR_ROOT, 'src', 'grpc-transport.js'));
  assert.deepStrictEqual(local.SERIALIZATION_FORMATS, simulator.SERIALIZATION_FORMATS);
  assert.deepStrictEqual([...local.VALID_SERIALIZATION_FORMATS].sort(), [...simulator.VALID_SERIALIZATION_FORMATS].sort());
});

compare('the shared TLS verification helper is identical', () => {
  for (const name of ['resolveClientTlsVerification', 'buildHttpsServerOptions', 'buildHttpsAgentOptions']) {
    assert.strictEqual(
      extractFunction(readLocal('src/tls-utils.js'), name),
      extractFunction(readSimulator('src/tls-utils.js'), name),
      `${name} drifted between the two repositories`
    );
  }
});

compare('both server transports bind their TLS certificate to the bind address', () => {
  for (const file of ['src/ws-transport.js', 'src/http-transport.js']) {
    assert.match(readLocal(file), /buildHttpsServerOptions\(\{[^)]*ip[:,]/,
      `${file} does not pass the bind address to buildHttpsServerOptions`);
    assert.match(readSimulator(file), /buildHttpsServerOptions\(\{[^)]*ip[:,]/,
      `the Simulator's ${file} does not pass the bind address to buildHttpsServerOptions`);
  }
});

compare('the connection preset identifiers and labels match exactly', () => {
  const local = require('../src/connection-presets.js');
  const simulator = require(path.join(SIMULATOR_ROOT, 'src', 'connection-presets.js'));
  const identify = (module) => module.listConnectionPresets()
    .map((preset) => [preset.id, preset.label]);
  assert.deepStrictEqual(identify(local), identify(simulator));
  assert.strictEqual(local.CUSTOM_PRESET_ID, simulator.CUSTOM_PRESET_ID);
  assert.strictEqual(local.CUSTOM_PRESET_LABEL, simulator.CUSTOM_PRESET_LABEL);
  assert.deepStrictEqual(local.CONNECTION_PRESET_PORTS, simulator.CONNECTION_PRESET_PORTS);
});

compare('both apps expose one Protocol Settings dialog shortcut', () => {
  for (const [label, source] of [['Logger', readLocal('src/renderer.js')], ['Simulator', readSimulator('src/renderer.js')]]) {
    assert.match(source, /function handleConnectionShortcut\(\)/, `${label} has no shared shortcut entry point`);
    assert.doesNotMatch(source, /handleConnectionShortcut\('connection-summary'\)/,
      `${label} still exposes the removed Summary shortcut`);
  }
});

compare('App Configuration remains limited to its unshifted shortcut', () => {
  // The Simulator reaches App Configuration through a before-input-event
  // handler, so it has to exclude the shifted key explicitly. The Logger binds
  // App Configuration to a plain CmdOrCtrl+I menu accelerator.
  const simulatorMain = readSimulator('src/main.js');
  assert.match(simulatorMain, /\(input\.control \|\| input\.meta\) && !input\.shift && !input\.alt/,
    'the Simulator no longer guards App Configuration against the shifted key');

  const localMain = readLocal('src/main.js');
  assert.doesNotMatch(localMain, /before-input-event/,
    'the Logger gained an unexpected raw key handler');
  assert.match(localMain, /accelerator: 'CmdOrCtrl\+I'/,
    'the Logger no longer binds App Configuration to the unshifted accelerator');
  assert.doesNotMatch(localMain, /accelerator: 'CmdOrCtrl\+Shift\+I'/,
    'the Logger bound a menu accelerator that would consume the summary shortcut');
});

console.log(`\n${passed} passed${skipped ? `, ${skipped} skipped` : ''}`);
