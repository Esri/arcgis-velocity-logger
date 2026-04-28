# Debugging Guide

## Debug Commands

| Command | Purpose | Ports |
|---------|---------|-------|
| `npm run debug-main` | Main process only | 9229 |
| `npm run debug-renderer` | Renderer only | 9222 |
| `npm run debug-both` | Both processes | 9229, 9222 |
| `npm run debug-both-brk` | Both + break on start | 9229, 9222 |
| `npm run debug-verbose` | Both + verbose Electron logging | 9229, 9222 |

## Connecting

**Chrome DevTools (renderer):**

1. Run `npm run debug-renderer`
2. Open `chrome://inspect` → inspect the Electron renderer target

**VSCode (main process):** Pre-configured via `.vscode/launch.json`. Run and Debug → "Debug Both Processes" or "Launch and Debug Both".

**Built-in DevTools (quick):** `Cmd+Option+I` / `Ctrl+Shift+I` while the app is running.

**Toggle Developer Tools (`F12`, checkbox):** Available in the Help menu and context menu. The checkbox reflects the true open/closed state of DevTools — it is checked whenever DevTools is open, regardless of how it was opened (F12, Inspect Element Mode, keyboard shortcut). Both the app menu and context menu stay in sync automatically.

**Inspect Element Mode (`F11`, checkbox):** Available in the Help menu and context menu. Select it to enter pick mode — the cursor changes to a crosshair. Click any UI control to jump directly to its HTML element in the DevTools Elements panel. DevTools opens automatically if it is not already open, and the Toggle Developer Tools checkbox will also appear checked. Press `Escape` or toggle the menu item again to cancel. Closing DevTools externally while pick mode is active automatically cancels the mode and unchecks both entries.

## Headless Mode Debugging

Headless never creates a BrowserWindow — attach to the main process only:

```bash
electron --inspect-brk=9229 . runMode=headless \
  protocol=tcp mode=server ip=0.0.0.0 port=9000 logLevel=debug

# or via the npm script:
npm run debug-main -- runMode=headless outputFile=/tmp/cap.log \
  protocol=tcp mode=server ip=0.0.0.0 port=9000 logLevel=debug
```

Useful runtime options while debugging headless:
- `logLevel=debug` — verbose RunLogger diagnostics
- `logFile=/tmp/runner.log` — mirror diagnostics to a file
- `doneFile=/tmp/cap.done.json` — inspect JSON summary after the run
- `idleTimeoutMs=5000` / `durationMs=10000` — keep test runs bounded

Exit codes: `0` success, `1` config error, `2` runtime error.

## Common Issues

### Port conflicts (TCP/UDP)

| Command | Purpose |
|---------|---------|
| `lsof -i :5565` | Check if simulation port is in use |
| `netstat -an \| grep <port>` | Alternative port check |
| `lsof -i :9229` | Check if inspector port is in use |

### Debugger won't connect
| Command | Purpose |
|---------|---------|
| `pkill -f "electron.*inspect"` | Kill stale inspector process |
| `lsof -i :9229` | Verify port is free |
| `node -c src/main.js` | Check for syntax errors |

### Theme not applying
Check that `theme-loader.js` is loaded and the `<link id="current-theme-stylesheet">` element is present; body should have no `theme-*` class (themes are loaded via the `<link>` only).

### IPC not firing
Check `preload.js` channel whitelists — both `send` and `on` channels must be explicitly listed.

### UI header controls wrap or overflow
Verify `.header` and `.theme-controls` have `flex-wrap: nowrap`; check the responsive JS in `index.html` for progressive-hide width thresholds.

## Production Log Files

- **macOS**: `~/Library/Logs/arcgis-velocity-logger/`
- **Windows**: `%APPDATA%\arcgis-velocity-logger\logs\`
- **Linux**: `~/.config/arcgis-velocity-logger/logs/`

## Related

- [HEADLESS.md](./HEADLESS.md) — headless parameters including `logLevel` and `logFile`
- [TESTING.md](./TESTING.md) — automated tests
- [ARCHITECTURE.md](./ARCHITECTURE.md) — component overview
