# Configuration Guide

The ArcGIS Velocity Logger uses two separate configuration systems:

- **App Config** (`config.json`) — Persisted UI preferences: theme, font, window geometry, opacity, and dialog sizes. Saved automatically and restored on every launch.
- **Launch Config** (`launch-config*.json`) — Runtime behavior parameters: connection protocol, address, capture limits, and output settings. Passed via `config=<path>` on the CLI for headless runs, or applied interactively through the **Apply Launch Config From…** menu action.

App Config controls how the application _looks_. Launch Config controls what the application _does_.

| Aspect | App Config | Launch Config |
|--------|-----------|---------------|
| **File** | `config.json` (platform data dir) | `launch-config*.json` (any path) |
| **Loaded** | Automatically on every startup | Explicitly via CLI `config=<path>` or menu action |
| **Saved** | Automatically on every UI change | Manually via **Save Launch Config To…** menu action |
| **Scope** | Persistent across sessions | Single run or on-demand application |
| **Contents** | Theme, font, window size/position, opacity, dialog sizes | Protocol, mode, IP, port, capture settings, output settings |
| **Menu actions** | Show / Apply / Save App Config | Show / Apply / Save Launch Config |

> See [HEADLESS.md](./HEADLESS.md) for headless launch-config examples and [COMMAND-LINE.md](./COMMAND-LINE.md) for the full CLI reference.

## File Location

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/arcgis-velocity-logger/config.json` |
| Windows | `%APPDATA%\arcgis-velocity-logger\config.json` |
| Linux | `~/.config/arcgis-velocity-logger/config.json` |

## Configuration Structure

```json
{
  "menuBarVisible": false,
  "windowState": { "width": 970, "height": 410, "x": 370, "y": 310 },
  "theme": "dark",
  "opacity": 1.0,
  "font": { "size": "13px", "family": "monospace" },
  "dialogSizes": {
    "appConfig": { "width": 650, "height": 380, "x": null, "y": null },
    "launchConfig": { "width": 500, "height": 400, "x": null, "y": null }
  }
}
```

## Configuration Options

### Window State
- **width / height**: Window dimensions — saved automatically on resize
- **x / y**: Window position — saved automatically on move
- **menuBarVisible**: Show/hide the native menu bar (Windows/Linux); `false` by default

### Appearance
- **theme**: Selected theme name (see available themes below)
- **opacity**: Window transparency (0.5 to 1.0, default: 1.0)
- **font**: Status log font settings — `size` (6px–25px) and `family`

### Dialog Sizes
- **dialogSizes.appConfig**: Remembered width, height, and position (x, y) of the App Config dialog
- **dialogSizes.launchConfig**: Remembered width, height, and position (x, y) of the Launch Config dialog

Size and position are saved automatically when the user resizes or moves either dialog, and restored on next open. When `x` and `y` are `null` (the default), the dialog is centered by the OS.

## Available Themes

| Theme | ID | Description |
|-------|----|-------------|
| 🔵 Blue | `"blue"` | Professional blue theme |
| 🟡 Color Blind | `"color-blind"` | High contrast accessibility theme |
| 🌙 Dark | `"dark"` | Classic dark theme (default) |
| 🌫️ Dark Gray | `"dark-gray"` | Softer dark theme |
| 🟢 Green | `"green"` | Nature-inspired green theme |
| ⚫ High Contrast | `"high-contrast"` | Maximum contrast for accessibility |
| ☀️ Light | `"light"` | Clean, bright light theme |
| ☁️ Light Gray | `"light-gray"` | Subtle light theme |
| 🌌 Midnight | `"midnight"` | Deep, rich dark theme |
| ☕ Mocha | `"mocha"` | Warm brown coffee-inspired theme |
| 🌊 Ocean | `"ocean"` | Cool blue-green aquatic theme |
| 🌸 Rose | `"rose"` | Elegant pink and rose theme |
| 🌺 Rose Dark | `"rose-dark"` | Dark variant of rose theme |
| 🌅 Sunset | `"sunset"` | Warm orange and yellow theme |
| 💻 System | `"system"` | Matches OS light/dark mode |

Change via: theme dropdown in the header, or right-click → theme.

## Available Fonts

The application supports 16 font families for the status log:

| Font | Category |
|------|----------|
| Default (Monospace) | Monospace |
| Arial | Sans-serif |
| Brush Script MT | Script |
| Comic Sans MS | Sans-serif |
| Courier New | Monospace |
| cursive | Cursive |
| Garamond | Serif |
| Georgia | Serif |
| Helvetica | Sans-serif |
| Lucida Console | Monospace |
| Monospace | Monospace |
| Palatino | Serif |
| Segoe UI | Sans-serif |
| Tahoma | Sans-serif |
| Times New Roman | Serif |
| Verdana | Sans-serif |

Font selection is available through the context menu and configuration dialog.

## Automatic Saving

Configuration is automatically saved when:
- Window is resized or moved
- Theme is changed
- Opacity is changed
- Font size or family is changed
- Menu bar visibility is toggled
- App Config or Launch Config dialog is resized or moved
- Application exits

## Manual Editing

1. Close the application
2. Edit the JSON file with any text editor
3. Ensure valid JSON format
4. Restart the application

## Configuration Dialog

Open with `Ctrl/Cmd+I` or right-click → Show Config. Allows viewing, copying, saving to a custom path, and loading from a file.

## Resetting Configuration

Close the app, delete `config.json`, and restart. The app will recreate it with defaults.

| OS | Command |
|----|---------|
| macOS | `rm ~/Library/Application\ Support/arcgis-velocity-logger/config.json` |
| Linux | `rm ~/.config/arcgis-velocity-logger/config.json` |
| Windows | `del "%APPDATA%\arcgis-velocity-logger\config.json"` |

## Custom Themes

1. Create `src/themes/theme-yourname.css` with the standard CSS variables
2. Add `yourname` to `getAvailableThemes()` in `src/themes/theme-loader.js`
3. Add it to the `<select>` in `src/index.html`

## Headless Run-Config Files

Headless mode also accepts an optional `config=/path/to/launch-config.json` parameter. This file is separate from the UI settings file and is intended for automation or CI runs. CLI values always override values loaded from the launch-config file.

| File | Purpose |
|------|---------|
| `config.json` (platform data dir) | Saved UI preferences — loaded automatically on UI launch |
| `launch-config*.json` (any path) | One-shot headless parameters — passed via `config=<path>` |

Templates: [`launch-config.sample.json`](./launch-config.sample.json), [`launch-config.server.sample.json`](./launch-config.server.sample.json), [`launch-config.client.sample.json`](./launch-config.client.sample.json).

### Supported Headless Keys

- `config`, `runMode`, `explain`
- `protocol`, `mode`, `ip`, `port`
- `connectTimeoutMs`, `connectWaitForServer`, `connectRetryIntervalMs`
- `outputFile`, `outputFormat`, `outputEncoding`
- `maxLogCount`, `durationMs`, `idleTimeoutMs`
- `filter`, `exclude`
- `logLevel`, `logFile`
- `doneFile`, `runId`
- `grpcSerialization`, `grpcHeaderPath`, `grpcHeaderPathKey`

See [COMMAND-LINE.md](./COMMAND-LINE.md) for the full parameter reference and [HEADLESS.md](./HEADLESS.md) for headless examples.

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|---------|
| Settings not loading | Check file exists, valid JSON, correct file permissions |
| Invalid JSON | Use a JSON validator to check syntax |
| Permission errors | Ensure app has read/write access to the config directory |
| Theme not applying | Restart the app; check `theme-loader.js` is loaded |

## Technical Details

- **ConfigManager class**: `src/config.js` — handles all file operations and validation
- **IPC communication**: Secure context bridge for main/renderer communication
- **Automatic saving**: Debounced saves prevent excessive file writes
- **Theme system**: 15 themes with per-file CSS in `src/themes/`
- **Testing**: Unit tests in `test/cli-options.test.js` and `test/headless-runner.test.js`
