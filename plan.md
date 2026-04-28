# Plan: Add WebSocket Client/Server Transport to Both Electron Apps

Add `ws-client` and `ws-server` connection modes to the simulator and logger, mirroring the HTTP transport pattern with 5 format options, TLS support, and 3 extra WS-specific controls (subscription message, ignore first message, custom headers). Also fix the missing HTTP params in `getCurrentLaunchConfig()`.

---

## Phase 1: DRY Format Refactoring (both repos)

- **Create `src/format-utils.js`** in both repos — extract `DATA_FORMATS`, `VALID_DATA_FORMATS`, `FORMAT_CONTENT_TYPES`, `DEFAULT_FORMAT` (`'delimited'`), `WS_DEFAULT_PORT` (`80`), `WSS_DEFAULT_PORT` (`443`) from `http-transport.js`. Export as frozen constants. Keep HTTP-specific port constants in `http-transport.js` or re-export from here.

- **Update `src/http-transport.js`** in both repos — replace inline `HTTP_FORMATS`, `VALID_HTTP_FORMATS`, `FORMAT_CONTENT_TYPES` with imports from `format-utils.js`. Re-export them for backward compatibility with existing test imports.

- **Create `test/format-utils.test.js`** in both repos — test all exported constants (5 formats, content-type mappings, default port values). Follow the `assert()` pattern from `test/http-transport.test.js`.

---

## Phase 2: WebSocket Transport (both repos)

- **Run `npm install ws`** in both `/Users/hano4470/github/Esri/arcgis-velocity-simulator` and `/Users/hano4470/github/Esri/arcgis-velocity-logger`.

- **Create `src/ws-transport.js`** in both repos with `WsClientTransport` and `WsServerTransport` classes + `createWsClientTransport()` / `createWsServerTransport()` factories:

  **Constructor params:**
  ```
  { ip, port, wsFormat, wsPath, wsTls, wsTlsCaPath, wsTlsCertPath, wsTlsKeyPath,
    wsSubscriptionMsg, wsIgnoreFirstMsg, wsHeaders, onData, onClientConnected }
  ```
  Mirror HTTP transport param naming with `ws` prefix.

  **Client `connect()`:**
  - Build URL as `ws[s]://ip:port/wsPath`.
  - Parse `wsHeaders` as JSON into `options.headers`.
  - Create `new WebSocket(url, { ...tlsOpts, headers })` using `ws` package.
  - On `'open'`, send `wsSubscriptionMsg` if provided.
  - If `wsIgnoreFirstMsg`, skip first `'message'` event.
  - Use `buildHttpsAgentOptions()` from `src/tls-utils.js` for TLS (pass as `agent` option).
  - Return `{ protocol: 'ws', mode: 'client', wsFormat, address, contentType, tlsInfo }`.

  **Client `send(data)`:** `ws.send(payload)` — same payload logic as `HttpClientTransport.send()`.

  **Client `disconnect()`:** `ws.close()`, cleanup listeners.

  **Server `connect()`:**
  - Create HTTP/HTTPS server (reuse `buildHttpsServerOptions()`), then `new WebSocket.Server({ server, path: wsPath })`.
  - On `'connection'`, track clients in a `Set`.
  - On client `'message'`, call `onData(data, metadata)` with metadata including `remote`, `wsFormat`, TLS status.
  - Return `{ protocol: 'ws', mode: 'server', wsFormat, address, contentType, tlsInfo }`.

  **Server `send(data)`:** Broadcast to all connected WS clients.

  **Server `disconnect()`:** Close all clients, close WS server, close HTTP server.

  **Logger-specific:** Server's `onData` callback receives messages; Client connects to a WS endpoint and listens for `'message'` events, passing data to `onData`.

- **Create `test/ws-transport.test.js`** in both repos — test factory functions, initial state, connect/disconnect lifecycle (client unsecure), server bind/listen, and client→server message delivery. Follow `test/http-transport.test.js` pattern.

---

## Phase 3: UI — `index.html` (both repos)

Update `src/index.html` in both repos:

- Add `<option value="ws-client">` and `<option value="ws-server">` to `#connection-type` dropdown, between HTTP and gRPC options. Include descriptive `title` attributes matching the pattern of HTTP options.

- Add control groups (all `style="display: none;"`) after the HTTP groups and before gRPC groups:

  | Element ID | Type | Notes |
    |---|---|---|
  | `#ws-format-group` | `<select id="ws-format">` | Same 5 options as `#http-format`, delimited default |
  | `#ws-tls-group` | `<input type="checkbox" id="ws-tls" checked>` | "Use TLS" |
  | `#ws-tls-ca-group` | `<input type="text">` | Mirrors HTTP TLS CA field |
  | `#ws-tls-cert-group` | `<input type="text">` | Mirrors HTTP TLS cert field |
  | `#ws-tls-key-group` | `<input type="text">` | Mirrors HTTP TLS key field |
  | `#ws-path-group` | `<input type="text" id="ws-path" value="/">` | |
  | `#ws-subscription-msg-group` | `<input type="text" id="ws-subscription-msg" placeholder="(optional)">` | Tooltip: sent after connecting |
  | `#ws-ignore-first-msg-group` | `<input type="checkbox" id="ws-ignore-first-msg">` | "Ignore first message" |
  | `#ws-headers-group` | `<input type="text" id="ws-headers" placeholder='(optional, JSON)'>` | Tooltip: JSON format for custom HTTP headers |

---

## Phase 4: UI — `renderer.js` (both repos)

Update `src/renderer.js` in both repos:

- **DOM refs:** Add refs for all new WS elements (`wsFormatSelect`, `wsTlsCheckbox`, `wsTlsCaInput`, etc.) following the HTTP element reference pattern.

- **Tooltips:** Add `WS_FORMAT_TOOLTIPS` object (same content as `HTTP_FORMAT_TOOLTIPS`), `updateWsFormatTooltip()` function. Add `ws-client`/`ws-server` entries to `CONNECTION_MODE_TOOLTIPS`.

- **Show/hide:** In `connectionTypeSelect` `'change'` listener, add `const isWs = val.startsWith('ws');` block mirroring `isHttp` — show/hide all `ws-*-group` elements. Show TLS cert fields conditionally on `wsTlsCheckbox.checked`.

- **Port switching:** Add `ws` to `DEFAULT_PORTS` as `443`. In smart port logic, handle `isWs` same as `isHttp` (443 for WSS, 80 for WS).

- **TLS checkbox listener:** Add `wsTlsCheckbox.addEventListener('change', ...)` mirroring `httpTlsCheckbox` handler for cert field visibility and port switching.

- **Connect handler (simulator):** In `connectButton` click, add WS params: `wsFormat`, `wsTls`, `wsTlsCaPath`, `wsTlsCertPath`, `wsTlsKeyPath`, `wsPath`, `wsSubscriptionMsg`, `wsIgnoreFirstMsg`, `wsHeaders`. Pass them all in the `window.api.connect(...)` call.

- **Connect handler (logger):** Add `else if (connectionType.startsWith('ws'))` block in `connectBtn` click, sending `window.electronAPI.send('connect-ws', { type, port, host, wsFormat, wsTls, ... })`.

- **Disconnect handler (logger):** Add `else if (connectionType.startsWith('ws'))` sending `'disconnect-ws'`.

- **CLI presets handler:** Add handling for `presets.httpFormat`, `presets.httpTls`, `presets.httpPath`, `presets.httpTlsCaPath`, `presets.httpTlsCertPath`, `presets.httpTlsKeyPath` (fixing existing gap), plus all `presets.ws*` params. Set values and dispatch `change` events for checkboxes.

---

## Phase 5: UI — `style.css` (both repos)

Update `src/style.css` — add `#ws-format`, `#ws-path`, `#ws-subscription-msg`, `#ws-headers`, `#ws-tls-ca-path`, `#ws-tls-cert-path`, `#ws-tls-key-path` to existing `text-align: left` rules for inputs/selects (find the existing rule that includes `#http-format`, `#http-path`, etc.).

---

## Phase 6: Backend — `main.js`

### Simulator `src/main.js`

- Add `require('./ws-transport')` importing `createWsClientTransport`, `createWsServerTransport`.
- Add `let wsTransport = null;` state variable.
- In `ipcMain.handle('connect', ...)` (~line 1911): destructure new WS params from `args`. Add `else if (protocol === 'ws')` block after `protocol === 'http'` block (~line 2047), following exact same pattern — create transport, call `connect()`, set `connection = wsTransport`, `emitConnectionStatus(...)`.
- In `ipcMain.handle('disconnect', ...)` (~line 2057): add `else if (wsTransport)` block after `httpTransport` block (~line 2087), same pattern.
- In `cleanupConnections()` (~line 1222): add WS transport cleanup.
- **FIX `getCurrentLaunchConfig()`** (~line 1293): Add reads for `httpFormat`, `httpTls`, `httpPath`, `httpTlsCaPath`, `httpTlsCertPath`, `httpTlsKeyPath`. Add all WS params: `wsFormat`, `wsTls`, `wsPath`, `wsTlsCaPath`, `wsTlsCertPath`, `wsTlsKeyPath`, `wsSubscriptionMsg`, `wsIgnoreFirstMsg`, `wsHeaders`. Add these to the returned `connection` object.

### Logger `src/main.js`

- Add `require('./ws-transport')` imports.
- Add `let wsTransport = null;`.
- Add `ipcMain.on('connect-ws', ...)` handler (after `connect-http` ~line 1927), following exact same structure: destructure params, create client/server transport with `onData` callback that sends `'log-data'` and metadata to renderer. Add `updateWsButtonStates()` helper or reuse HTTP button state pattern.
- Add `ipcMain.on('disconnect-ws', ...)` handler.
- Add `updateWsButtonStates(state)` function mirroring `updateHttpButtonStates`.
- **FIX `getCurrentLaunchConfig()`** (~line 767): Same HTTP + WS param additions as simulator.

---

## Phase 7: Logger `preload.js`

Update `src/preload.js`:

- Add `'connect-ws'`, `'disconnect-ws'` to `validChannels` in `send` (~line 22).
- Add `'ws-status'`, `'ws-error'` to `validChannels` in `on` (~line 49).

---

## Phase 8: Launch Config & Docs

- **Update `launch-config.sample.json`** in both repos — add `wsFormat`, `wsTls`, `wsPath`, `wsTlsCaPath`, `wsTlsCertPath`, `wsTlsKeyPath`, `wsSubscriptionMsg`, `wsIgnoreFirstMsg`, `wsHeaders` to the `connection` section with comment keys. Also ensure existing `httpFormat`/`httpTls`/`httpPath` entries are present.

- **Create `docs/WEBSOCKET.md`** in both repos — document WS transport: supported modes, formats, TLS, extra controls (subscription message, ignore first message, custom headers), port defaults, launch config params.

- **Update docs:** Add WebSocket to connection modes list in `src/help.html`, `README.md`, `docs/README.md`, `docs/ARCHITECTURE.md`, and `AGENTS.md` in both repos.

---

## Phase 9: Tests

Run all tests in both repos to verify no regressions:

```bash
npm test
```

Ensures format-utils extraction didn't break `http-transport` tests, and new `ws-transport` tests pass.

---

## Further Considerations

- **Logger WS Client "listen" mode:** In logger client mode, after connecting and sending the subscription message, the client should switch to listening for incoming `'message'` events (calling `onData`), unlike the simulator client which primarily sends. Confirm the `WsClientTransport` in the logger repo should have an `onData` constructor param that wires to the `'message'` event.

- **Simulator `transport-manager.js`:** Currently only handles TCP/UDP — gRPC and HTTP are handled directly in `main.js`. WebSocket should follow the same `main.js`-direct pattern, not be added to `transport-manager.js`.

- **Headers validation:** Should `wsHeaders` be validated as valid JSON before connecting, with a user-facing error if malformed? **Recommend yes** — validate in renderer before sending IPC.
