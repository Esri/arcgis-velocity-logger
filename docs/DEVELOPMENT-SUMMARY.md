# Development Summary

Technical implementation details and recent changes. For user-facing features, see [RELEASE-NOTES.md](./RELEASE-NOTES.md).

## Recent Features & Improvements

### Dedicated Command Line Interface Dialog
- Added a richer `F3` CLI Reference dialog, separate from the `F1` Help dialog, with quick category chips, sortable columns, active-filter pills, example-copy buttons, and visible-row copy/export actions.
- Supports multi-format output (`TSV`, `CSV`, `Markdown`, `JSON`), collapsible reference panels, sticky table headers, and a resizable parameter table.
- Reused shared CLI metadata so terminal help output, the CLI dialog, and markdown docs describe the same parameter set and the same six-column schema.

### Headless Mode Enhancements
- **Multiple output formats**: captures to `text`, `jsonl`, or `csv`
- **Stop conditions**: `maxLogCount`, `durationMs`, `idleTimeoutMs` — any combination
- **Filter / exclude**: regex-based pre-write filtering of captured lines
- **doneFile**: JSON artifact written on success or failure for CI orchestration
- **Exit codes**: `0` success, `1` config error, `2` runtime error

### gRPC Transport Improvements
- Support for Protobuf, Kryo, and Text serialization formats
- Both server-receive and client-Watch (subscribe) paths
- TLS support via certificate configuration
- Header path forwarding for metadata injection

### UI Refinements
- **Progressive header hiding**: controls hide (not wrap) as the window narrows, maintaining a single clean row
- **Auto-scroll toggle**: preserves scroll position when manually reviewing logs
- **Ascending/descending order toggle**: switch log display order with a single click
- **Show Metadata toggle**: retroactively show/hide metadata without reconnecting — renderer buffers parallel log/metadata streams
- **gRPC options panel**: collapsible second row; auto-shows on gRPC mode selection, auto-hides after 5 s of no hover

### Theme System Refactoring
- Moved from a single monolithic CSS to 15 individual `theme-*.css` files loaded dynamically by `theme-loader.js`
- Minimal fallback in `themes.css` ensures a usable dark UI if the loader fails
- See [THEME-REFACTOR-SUMMARY.md](./THEME-REFACTOR-SUMMARY.md) for migration details

### Keyboard Shortcuts
- Added `F3` to open the CLI Reference dialog
- `Ctrl/Cmd+I` for Configuration dialog
- `Ctrl/Cmd+Shift+O` for Order toggle (ascending/descending)
- `Ctrl/Cmd+Shift+A` for Auto-scroll toggle
- See [KEYBOARD-SHORTCUTS.md](./KEYBOARD-SHORTCUTS.md) for the full reference

## Bug Fixes

### Headless Exit Code Consistency
**Issue**: Headless runner could exit with code `0` on a network error.
**Solution**: Separated config errors (exit `1`) from runtime errors (exit `2`); success path always writes `doneFile` before exit.

### Metadata Toggle without Reconnect
**Issue**: Toggling "Show Metadata" required disconnecting and reconnecting to refresh the log.
**Solution**: Renderer now maintains parallel buffers for log lines and metadata events; toggling re-renders from the existing buffer immediately.

### IPC Handler Registration Error
**Issue**: "Attempted to register a second handler for 'export-config'" error on repeated sends.
**Solution**: Moved config-related IPC handlers outside of the data-receive handler in `src/main.js`.

### UDP Datagram Boundary Handling
**Issue**: Large UDP payloads were split across multiple `message` events.
**Solution**: Added datagram reassembly buffer in the headless runner for UDP capture.

### gRPC Stream Reset on Disconnect
**Issue**: Abrupt client disconnect caused an unhandled stream-reset error in server mode.
**Solution**: Added `try/catch` around server-streaming write and graceful stream teardown in `src/grpc-transport.js`.

## Code Organization

### File Responsibilities

| File | Purpose |
|------|---------|
| `src/main.js` | IPC handlers, network lifecycle, window management |
| `src/renderer.js` | UI logic, log/metadata buffering, state display |
| `src/preload.js` | IPC channel whitelist, context bridge |
| `src/config.js` | ConfigManager: load, save, validate, recover |
| `src/cli-options.js` | CLI parser, help generator, shared metadata |
| `src/headless-runner.js` | No-UI capture pipeline, stop conditions, doneFile |
| `src/run-logger.js` | Headless diagnostic logger (separate from data output) |
| `src/grpc-transport.js` | gRPC client/server transports for all 3 formats |
| `src/themes/theme-loader.js` | Dynamic per-theme CSS loader |

### Key Achievements

1. **Single source of truth** for CLI metadata — terminal, UI dialog, and markdown always match
2. **Clean headless pipeline** with composable stop conditions and a doneFile for orchestration
3. **Retroactive metadata display** without reconnecting
4. **Per-theme CSS files** for easy maintenance and custom theme support
5. **Progressive header hiding** for clean single-row UI at any window width
6. **Comprehensive gRPC support** across 3 serialization formats and 2 transport directions

