# Release Notes

## Latest Updates (April 2026)

### 🆕 Help & Command-Line Improvements
- **Dedicated Command Line Interface Dialog**: The searchable, sortable CLI reference now lives in its own `F3` dialog, separate from the `F1` Help dialog, while still generated from the same metadata used by terminal help and markdown docs.
- **Three Terminal Help Layouts**: Standard help uses the original non-table layout; `help-table-wide` and `help-table-narrow` provide ASCII-table variants for wider or narrower terminals.
- **Quick CLI Filters**: Added All, Required, Optional, Headless-only, and Help-related chips with live result counts and removable active-filter pills.
- **Visible-Row Copy/Export**: The CLI dialog can copy or export currently visible rows as `TSV`, `CSV`, `Markdown`, or `JSON`.
- **CLI Keyboard Shortcuts**: `Ctrl+F` / `Cmd+F` and `/` to focus the filter; `Escape` to close the dialog.
- **Unified CLI Schema**: Terminal docs, headless guide, and CLI dialog use the same six-column reference: Name, Supported Values, Default, Required in Headless Mode, Example, and Purpose.

### 📚 Documentation Updates
- Updated README, command-line guide, headless guide, keyboard shortcut reference, testing guide, and architecture/development summaries for the split Help (`F1`) / CLI Reference (`F3`) workflow.
- Added `DEVELOPMENT-SUMMARY.md`, `DOCUMENTATION.md`, and `RELEASE-NOTES.md`.

### 🔧 Build & Packaging
- **Windows ZIP isolated**: Removed `.zip` from the default `package:win` build targets (now produces only NSIS installer + portable). Use `npm run package:win:zip` for a Windows ZIP archive.
- **Sequential build script**: `package:seq` runs all platforms one at a time with per-step timing and a final summary table; `package:seq:clean` also clears `dist/` first.
- **Parallel build script**: `package:all` spawns all platforms concurrently with labeled, interleaved output and a final summary table.
- **`npm run clean`**: Deletes `dist/` without triggering a rebuild.
- **Compression set to normal**: Changed electron-builder compression from `maximum` to `normal` for faster builds.

## Previous Updates (2025)

### 🆕 New Features
- **Status Log Sort Order**: Sort toggle in the Status Log header to switch between Ascending and Descending order (default: Ascending)
- **Show Metadata Toggle**: Retroactively show/hide captured metadata without reconnecting — renderer buffers parallel log/metadata streams
- **gRPC Transport**: Full support for TCP-replacement gRPC capture with Protobuf, Kryo, and Text serialization; both server-receive and client-Watch (subscribe) paths; TLS and header path support
- **Headless Output Formats**: Capture to `text`, `jsonl`, or `csv`
- **Headless Stop Conditions**: `maxLogCount`, `durationMs`, `idleTimeoutMs` — any combination
- **Filter / Exclude**: Regex-based pre-write filtering of captured lines in headless mode
- **doneFile**: JSON artifact written on session completion for CI orchestration
- **Connection-Controls Visibility**: Show/hide the connection panel; state persisted across sessions

### 🎨 UI Improvements
- **Progressive Header Hiding**: Header controls hide (not wrap) as the window narrows — single clean row at any width
- **gRPC Options Panel**: Collapsible second row; auto-shows when a gRPC mode is selected, auto-hides after 5 s of no hover
- **Modernised Styling**: Consistent border radii, shadows, and subtle blur across all panels
- **Context Menu Opacity**: Opacity submenu (50%–100%) with immediate apply and persistence
- **Auto-scroll Toggle**: Persistent auto-scroll toggle with visual indicator

### 🐛 Bug Fixes
- **Exit Code Consistency**: Headless runner now correctly exits `0` (success), `1` (config error), `2` (runtime error)
- **IPC Handler Duplicate Registration**: Fixed "already registered" error for `export-config` handler
- **gRPC Stream Reset**: Graceful teardown on abrupt client disconnect in server mode
- **UDP Datagram Boundary**: Reassembly buffer prevents split payloads being logged as partial lines

### ⌨️ Keyboard Shortcuts Added
- `F3` — Open CLI Reference dialog
- `Ctrl/Cmd+I` — Open Configuration dialog
- `Ctrl/Cmd+Shift+O` — Toggle log order (ascending/descending)
- `Ctrl/Cmd+Shift+A` — Toggle auto-scroll

### 📚 Documentation
- Complete `docs/` folder with guides for architecture, configuration, CLI, headless, gRPC, build, debugging, testing, and keyboard shortcuts
- `docs/README.md` — quick-link index to all guides

## Version History

### Version 1.0.0 — Initial Release
- Real-time TCP and UDP data capture and logging
- Cross-platform UI with 15 themes (🔵🟡🌙🌫️🟢⚫☀️☁️🌌☕🌊🌸🌺🌅💻)
- Configurable font families and sizes
- Window opacity control
- Persistent configuration with auto-save
- Developer tools and debugging support

