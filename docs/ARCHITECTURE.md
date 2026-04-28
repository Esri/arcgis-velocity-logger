# Architecture Guide

## Application Overview

The ArcGIS Velocity Logger is an Electron desktop app for capturing network data over TCP, UDP, and gRPC. It runs in two modes:

- **UI mode** (default) — `npm start`; restores saved config (theme, fonts, window, opacity).
- **Headless mode** — `electron . runMode=headless`; no BrowserWindow, suitable for servers and CI. See [HEADLESS.md](./HEADLESS.md).

## Process Topology

```
process.argv
     │
     ▼
cli-options.parseCommandLineArgs()  →  help/error: print + exit
     │
     ├── headless ──► headless-runner.js  (TCP/UDP/gRPC → file/stdout)
     │
     └── ui ────────► BrowserWindow + IPC + ConfigManager
```

### UI Mode

```
Main Process                          Renderer Process
────────────────────────────────      ────────────────────────────────
main.js          Network I/O          renderer.js      UI / DOM events
config.js        ConfigManager        style.css        Layout & themes
cli-options.js   CLI parsing          themes/*.css     Per-theme CSS vars
headless-runner  (unused in UI)       preload.js       IPC security bridge
```

IPC is the only communication path between main and renderer. `preload.js` enforces a whitelist of allowed channels (see [Security Bridge](#security-bridge)).

## Core Components

### `main.js`
- Parses CLI args early via `cli-options.parseCommandLineArgs()`; decides `ui` / `headless` / `help` / `error` before any window is created
- Manages TCP/UDP/gRPC network connections and forwards data to the renderer via IPC
- Owns `ConfigManager`, window lifecycle, file I/O, and error dialogs
- In headless mode delegates to `headless-runner.runHeadlessSession()` and preserves exit codes: `0` success, `1` config error, `2` runtime error

### `renderer.js`
- DOM event handling, log display, status updates, theme switching
- Receives `log-data` / `log-metadata` IPC events and maintains parallel buffers for retroactive Show Metadata toggling

### `config.js`
- Persists UI preferences to platform data dir (`config.json`); auto-recovers from corruption
- Separate from headless launch-config files — see [CONFIG.md](./CONFIG.md)

### `cli-options.js`
- Pure Node module (no Electron coupling); parses `name=value` args into a validated startup descriptor
- Returns mode: `ui`, `headless`, `help`, or `error`
- Feeds the in-app CLI dialog (`F3`) so terminal help, UI table, and markdown docs stay aligned

### `headless-runner.js`
- No-UI TCP/UDP/gRPC capture pipeline
- Applies `filter`/`exclude` regexes, writes `text`/`jsonl`/`csv` output, honours `maxLogCount`/`durationMs`/`idleTimeoutMs`
- Writes a JSON `doneFile` on success and failure
- Exit codes: `0` / `1` / `2`

### `run-logger.js`
- Diagnostic logger for the headless runner only (runner diagnostics → stdout/`logFile`; captured data → output sink)

### Security Bridge (`preload.js`)
- Whitelists IPC channels for `send`, `invoke`, and `on`; renderer has no direct access to Node/system APIs

## File Layout

```
src/
├── main.js              # Main process: CLI + UI/headless branch
├── renderer.js          # Renderer: UI logic, log display
├── preload.js           # IPC security bridge
├── config.js            # ConfigManager: UI preferences
├── cli-options.js       # CLI parser + help generator
├── headless-runner.js   # No-UI capture runner
├── run-logger.js        # Headless diagnostic logger
├── *.html               # UI templates
├── *.css / style.css    # Styling
└── themes/              # theme-*.css + theme-loader.js

test/
├── run-all-tests.js
├── cli-options.test.js
├── headless-runner.test.js
└── help.test.js / grpc-transport.test.js

docs/
├── BUILD.md             # Build & package scripts
├── COMMAND-LINE.md      # CLI reference
├── HEADLESS.md          # Headless mode guide
└── ...
```

## Network Architecture

| Protocol | Server mode | Client mode |
|----------|-------------|-------------|
| TCP | Listens on port, accepts connections | Connects to remote host:port |
| UDP | Binds port, receives datagrams | Sends datagrams to remote |
| gRPC | Hosts `GrpcFeed` / `GrpcFeatureService` | Calls `Watch`/`watch` to subscribe |

Metadata capture: every received message is preceded by a `log-metadata` IPC event. The renderer buffers these in parallel with log lines; Show Metadata toggle shows/hides them retroactively without reconnecting.

See [GRPC.md](./GRPC.md) for full gRPC details.

## UI Components

### Theme System
15 built-in themes, each a `src/themes/theme-*.css` file loaded dynamically by `theme-loader.js`. A minimal fallback in `themes.css` ensures a usable UI if the loader fails.

### Header Controls
Single-row layout; progressively hides lower-priority controls as the window narrows. gRPC options live in a collapsible second row that auto-shows when a gRPC mode is selected.

### Dialog System

| Dialog | Trigger |
|--------|---------|
| Help | `F1` |
| About | `F2` |
| CLI Reference | `F3`, toolbar `>_`, Help menu, context menu |
| Configuration | `Ctrl/Cmd+I`, context menu |
| Error | on runtime error |

## Security Architecture

### Context Isolation

- **Renderer Process**: No direct Node.js access
- **Preload Script**: Secure API exposure only via context bridge
- **Main Process**: Full system access with input validation

### IPC Security

- **Channel Whitelists**: All IPC channels explicitly enumerated in `preload.js`
- **Validated Input**: All IPC messages are validated before processing
- **Limited API**: Only necessary functions exposed to renderer

### File System Security

- **Sandboxed Access**: Config limited to platform data directory
- **Path Validation**: Prevents directory traversal
- **Permission Checks**: Validates file access permissions

## Performance Considerations

### Memory Management

- **Event Cleanup**: Proper event listener removal on disconnect/close
- **Log Buffering**: Parallel log/metadata buffers with bounded growth
- **Resource Disposal**: Network socket and gRPC stream cleanup

### Network Optimization

- **Connection Management**: Efficient TCP/UDP/gRPC lifecycle handling
- **Data Buffering**: Optimized receive-path for high-throughput streams
- **Error Recovery**: Graceful network failure handling with reconnect support

### UI Performance

- **Debounced Updates**: Prevents excessive DOM updates during high-frequency data
- **Efficient Rendering**: Minimal DOM manipulation for log line insertion
- **Theme Optimization**: CSS variables for fast theme switching

## Error Handling Strategy

### Multi-Level Error Handling

1. **Process Level**: Global error handlers for uncaught exceptions
2. **Component Level**: Try-catch blocks in critical network/file functions
3. **User Level**: User-friendly error dialogs and status bar notifications
4. **Recovery Level**: Automatic retry and fallback mechanisms (configurable)

### Error Categories

- **Network Errors**: Connection failures, port conflicts, timeout handling
- **File System Errors**: Permission issues, disk full, corrupted config
- **gRPC Errors**: Certificate issues, serialization failures, stream resets
- **Configuration Errors**: Invalid settings, malformed JSON, migration issues

## Testing Architecture

### Test Structure

```
test/
├── cli-options.test.js      # CLI parsing, mode resolution, aliases, validation
├── headless-runner.test.js  # Output formats, stop conditions, doneFile, exit codes
├── help.test.js             # Help dialog + CLI Reference dialog interactions
├── grpc-transport.test.js   # All 3 serialization formats; server + client paths
└── run-all-tests.js         # Unified test runner
```

### Testing Strategy

- **Unit Tests**: Individual component testing with Node.js (no Electron required)
- **Integration Tests**: IPC communication and headless end-to-end capture
- **CLI/Docs Parity**: Shared metadata validation ensures terminal help and CLI dialog stay in sync
- **Error Testing**: Comprehensive error scenario and exit-code coverage

## Build and Distribution

### Electron Builder Configuration

- **Multi-Platform**: macOS, Windows, Linux support
- **Code Signing**: Platform-specific signing (see [BUILD.md](./BUILD.md))
- **Asset Management**: Icon and installer asset handling

### Package Structure

```
dist/
├── mac/     # macOS packages (.dmg, .zip)
├── win/     # Windows packages (.exe installer, portable, .zip via package:win:zip)
└── linux/   # Linux packages (.AppImage, .deb)
```

See [BUILD.md](./BUILD.md) for all build commands and options.

## Future Architecture Considerations

### Design Principles

- **DRY (Don't Repeat Yourself)**: Shared logic must be extracted into dedicated utility modules. For example, TLS/certificate-store operations are centralized in `src/tls-utils.js` and consumed by both `grpc-transport.js` and `http-transport.js` rather than duplicated.

### Scalability

- **Plugin System**: Extensible architecture for additional capture protocols
- **Modular Components**: Component-based architecture for feature additions
- **API Extensions**: Extensible IPC API for third-party integrations

### Performance Improvements

- **Web Workers**: Background processing for high-volume capture
- **Streaming Architecture**: Real-time filtering pipeline at the capture layer
- **Caching Strategy**: Intelligent buffering for burst traffic

### Security Enhancements

- **Content Security Policy**: Stricter CSP implementation
- **Sandboxing**: Enhanced process isolation
- **Code Signing**: Comprehensive code signing strategy
