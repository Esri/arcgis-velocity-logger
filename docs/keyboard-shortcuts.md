# Keyboard shortcuts

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

This guide lists every keyboard shortcut available in ArcGIS Velocity Logger,
covering global shortcuts, the CLI reference dialog, the context menu, and tab
navigation. It is intended for desktop app users and requires only a running
app.

## Table of contents

- [Global shortcuts](#global-shortcuts)
- [CLI reference dialog (`F3`) shortcuts](#cli-reference-dialog-f3-shortcuts)
- [Context menu (right-click)](#context-menu-right-click)
- [Tab navigation](#tab-navigation)
- [Related documentation](#related-documentation)

## Global shortcuts

| Action | macOS | Windows / Linux |
|--------|-------|-----------------|
| Save logs to file | `Cmd+S` | `Ctrl+S` |
| Clear all logs | `Cmd+Delete` | `Ctrl+Delete` |
| Toggle auto-scroll | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Toggle order (asc/desc) | `Cmd+Shift+O` | `Ctrl+Shift+O` |
| Help dialog | `F1` | `F1` |
| About dialog | `F2` | `F2` |
| CLI reference dialog | `F3` | `F3` |
| Toggle developer tools | `F12` | `F12` |
| Toggle inspect element mode | `F11` | `F11` |
| Configuration dialog | `Cmd+I` | `Ctrl+I` |
| Close open dialog | `Escape` | `Escape` |
| Quit | `Cmd+Q` | `Ctrl+Q` |
| Minimize window | `Cmd+M` | `Ctrl+M` |
| Select all text | `Cmd+A` | `Ctrl+A` |
| Copy | `Cmd+C` | `Ctrl+C` |

## CLI reference dialog (`F3`) shortcuts

| Action | macOS | Windows / Linux |
|--------|-------|-----------------|
| Focus filter | `Cmd+F` or `/` | `Ctrl+F` or `/` |
| Close dialog | `Escape` | `Escape` |

The dialog also supports: quick filter chips (All / Required / Optional / Headless-only / Help-related), sortable columns, active filter pills, and copy/export of visible rows as TSV, CSV, Markdown, or JSON.

## Context menu (right-click)

Available actions:
- **Themes** — 15 built-in themes (🔵🟡🌙🌫️🟢⚫☀️☁️🌌☕🌊🌸🌺🌅💻)
- **Font Size** — 6px–25px
- **Font Family** — monospace (default), Arial, Courier New, Verdana, and more
- **Opacity** — 50%–100% in 5% increments
- **Save / Clear Logs**
- **Show Metadata** — toggle connection/call metadata lines before each log entry
- **CLI Reference** — open the `F3` dialog
- **Developer Tools** (`F12`, checkbox — checked when open) / **Inspect Element Mode** (`F11`, checkbox — checked while pick mode is active; also checks Developer Tools automatically) / **Help** / **About**

> [!NOTE]
> Both checkboxes are fully synced between the app menu and context menu. Closing DevTools externally automatically unchecks both entries and cancels any active pick mode.

- **App Config** — Show, Apply, Save, Reset
- **Launch Config** — Show, Apply, Save

## Tab navigation

`Tab` / `Shift+Tab` between controls; `Enter`/`Space` to activate buttons; arrow keys inside dropdowns.

## Related documentation

- [Repository overview](../README.md)
- [Command-line reference](command-line.md)
- [Configuration](configuration.md)
