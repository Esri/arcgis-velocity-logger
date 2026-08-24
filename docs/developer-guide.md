# Developer guide

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

This guide covers day-to-day development of ArcGIS Velocity Logger: repository
layout, running the app locally, testing, documentation checks, debugging and
DevTools, logging, and the patterns to follow when adding controls, tooltips,
transports, or themes. It is intended for developers changing the source, and
assumes Node.js 18 or later with dependencies installed via `npm install`.

## Table of contents

- [Repository structure](#repository-structure)
- [Local development](#local-development)
- [Testing](#testing)
- [Documentation checks](#documentation-checks)
- [Debugging](#debugging)
- [Secondary window policy](#secondary-window-policy)
- [Logging](#logging)
- [Common failures](#common-failures)
- [Extending the app](#extending-the-app)
- [Validation checklist](#validation-checklist)
- [Related documentation](#related-documentation)

## Repository structure

```text
src/
├── main.js                 # Main process: CLI parsing, UI/headless branch, network lifecycle
├── renderer.js             # Renderer: UI logic, log and metadata buffering, state display
├── preload.js              # Context bridge with explicit IPC channel whitelists
├── config.js               # ConfigManager: load, save, validate, recover persisted settings
├── cli-options.js          # CLI parser, validation, and shared help metadata
├── cli-suggestions.js      # Unknown-option suggestions for CLI help
├── headless-runner.js      # No-UI capture pipeline, stop conditions, doneFile
├── run-logger.js           # Diagnostic logger used by the headless runner
├── grpc-transport.js       # gRPC receive transports (protobuf, kryo, text)
├── http-transport.js       # HTTP and HTTPS receive transports
├── ws-transport.js         # WebSocket and secure WebSocket receive transports
├── xmpp-*.js               # XMPP server core, client core, SASL, MUC, accounts, utils
├── connection-presets.js   # Shared Logger/Simulator connection preset definitions
├── connection-summary.js   # Pure connection summary generator shared by all summary surfaces
├── protocol-settings-window-manager.js # Secure main-process owner of the detached Protocol Settings window
├── protocol-settings-mirror.js         # Dependency-free DOM mirror shared by the renderer and the detached window
├── protocol-settings-window.js         # Detached window controller; reports intent, owns no rule
├── protocol-settings-preload.js        # Narrowly scoped preload for the detached window
├── tls-utils.js            # Shared certificate and trust-store helpers
├── format-utils.js         # Shared data-format constants and helpers
├── tooltip-utils.js        # Shared custom tooltip system
├── velocity-*.js           # ArcGIS Velocity sign-in, API, and output selection
├── *.html / *.css          # Main window, dialog, and detached window templates and styles
├── themes/                 # theme-loader.js and one theme-*.css per theme
└── assets/                 # Icons, images, and packaging resources

scripts/                    # Build, prerequisite, signing, and release tooling
test/                       # Node.js test suites plus browser fixtures
docs/                       # All maintained documentation
```

`src/main.js` parses CLI arguments before any window is created and branches to
UI mode, headless mode, help output, or an error exit. IPC is the only channel
between main and renderer, and `src/preload.js` whitelists every allowed
channel, so the renderer has no direct Node.js or system access.

Shared logic belongs in a dedicated module rather than in each transport.
`tls-utils.js`, `format-utils.js`, and `tooltip-utils.js` are the reference
examples: gRPC, HTTP, WebSocket, and XMPP transports consume them instead of
duplicating certificate, format, or tooltip behavior. `connection-summary.js`
follows the same rule for the user interface: it is a pure module with no DOM
access, so the warning alert and the read-only Summary section of Protocol
Settings are rendered from one generated summary and can never disagree.
`protocol-settings-mirror.js` follows it too, on the window side: it is the one
place that serializes and replays the authoritative Protocol Settings dialog,
so the detached window in `protocol-settings-window.js` never owns a form rule
of its own — see the parity contract in [`AGENTS.md`](../AGENTS.md). See
[Connection summary and protocol settings](connection-summary.md).

## Local development

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm start` | Run the app in UI mode with saved configuration restored |
| `npm run start:headless` | Run a headless capture session; add `--` before CLI parameters |
| `npm run help:cli` | Print the standard command-line help |
| `npm run help:cli:wide` | Print the wide ASCII help table |
| `npm run help:cli:narrow` | Print the narrow ASCII help table |
| `npm test` | Run every test suite |
| `npm run docs:link-check` | Check every Markdown link in the repository |

A UI launch should restore the saved theme, fonts, window size and position, and
connection-controls visibility, and print the startup configuration and behavior
summary to the console.

Headless runs need no parameters — records go to stdout in the selected
`outputFormat` unless `outputFile` is supplied:

```bash
npm run start:headless -- outputFile=./captured.log port=5566 \
  maxLogCount=5 doneFile=./run.done.json
```

Exit codes are `0` for success, `1` for a configuration error, and `2` for a
runtime error.

## Testing

Tests run on Node.js only; no Electron environment or display is required.
`test/run-all-tests.js` executes every `*.test.js` file in `test/` in its own
process and exits non-zero if any file fails.

| Command | Scope |
|---|---|
| `npm test` | Every suite |
| `npm run test:cli` | CLI parsing, mode resolution, aliases, config-file merge, validation |
| `npm run test:help` | Help workspace and Command Line Interface interactions |
| `npm run test:headless-runner` | Output formats, stop conditions, filters, `doneFile`, exit codes |
| `npm run test:grpc` | gRPC transport across all serialization formats and both directions |
| `npm run test:summary` | Connection summary rows, URL composition, secret redaction, warnings, and the settings chip |
| `npm run test:protocol-settings` | The authoritative Protocol Settings dialog: structure, sections, keyboard navigation, revert and reset, locking, and mirroring edits to and from the detached window |
| `npm run test:presets` | Connection preset contract and the renderer behavior that applies presets |
| `npm run test:parity` | Shared transport lifecycle helpers, bounds, and diagnostics compared against the ArcGIS Velocity Simulator |
| `npm run test:prereqs-check` | Build prerequisite detection |
| `npm run test:prereqs-install` | Prerequisite installer planning |

Suites without a dedicated npm script run directly, for example:

```bash
node test/xmpp-transport.test.js
node test/xmpp-integration.test.js
node test/http-transport.test.js
node test/ws-transport.test.js
node test/tooltip-utils.test.js
node test/velocity-auth-utils.test.js
node test/format-utils.test.js
node test/external-sign.test.js
node test/sign-lock.test.js
node test/protocol-settings-window.test.js
node test/reference-window-manager.test.js
node test/theme-cascade.test.js
```

`protocol-settings-window.test.js` covers the detached window: secure
`BrowserWindow` creation and reuse on reopen, bounds resolution and
persistence, sanitized IPC payloads for state, commands, and events, the
dedicated preload's narrow allowlist, the DOM mirror's property, attribute,
text, and structural replay, and the detached renderer's edit, tab, button,
focus, and Escape reporting.

`reference-window-manager.test.js` covers the Help and Command Line Interface
workspace policy: framed non-modal options, secure web preferences, bounds
clamping and persistence, focus-on-reopen, ready lifecycle, and closing both
workspaces when the main window closes. Help documentation links use one
allowlisted GitHub documentation prefix and open externally through the
manager; every other new-window request is denied.

`theme-cascade.test.js` resolves the real CSS cascade for Help, the Command
Line Interface, and the detached Protocol Settings window across every built-in
theme, including System under both operating-system color schemes. It compares
the resolved page, surface, border, text, and heading colors of Help against
Protocol Settings, checks text, muted text, heading, and link contrast, and
fails when a window stylesheet derives a palette token on `:root`, keeps a
fixed color fallback, or paints a fixed black or white overlay.

Run the smallest suite that covers your change first, then `npm test` before
committing.

### Sister-application parity

`npm run test:parity` compares the shared transport lifecycle surface with the
ArcGIS Velocity Simulator: the bounded WebSocket close helpers, the WebSocket
teardown bound and bind-failure message, the HTTP subscription pacing
constants, the gRPC teardown diagnostics and their `{ warnings }` shape, the
shared TLS helpers, and the connection preset identifiers and labels. It expects
the Simulator checked out beside this repository as
`../arcgis-velocity-simulator`, or at the path in `VELOCITY_SIMULATOR_ROOT`.
Without a Simulator checkout the cross-application comparisons are skipped and
only the local invariants run, so the suite still passes on a machine that has
only one of the two applications.

### Browser fixtures

Two fixtures exercise renderer behavior outside the packaged app. Open them
directly in a browser:

- `test/test-theme-loader.html` — theme loader behavior and fallback.
- `test/test-status-truncation.html` — status text truncation.

### Manual smoke checks

- Help output: `npm run help:cli`, `npm run help:cli:wide`, and
  `npm run help:cli:narrow` all exit `0` and print without errors.
- UI launch: `npm start` restores appearance and connection settings.
- Headless capture: run the example above and confirm the exit code is `0`, the
  output file holds the expected records, and the `doneFile` reports
  `success: true` with the expected `linesWritten` and `stopReason`.
- Command Line Interface dialog: press `F3`, then verify search, quick filter
  chips, active filter pills, sortable columns, copy and export, and dragging
  the bottom edge of the table to resize it.
- Help workspace: press `F1`, confirm its table of contents follows the active
  section, search with `Cmd/Ctrl+F` or `/`, resize or maximize it, then reopen
  it and confirm the existing window receives focus.
- Protocol Settings: press `Cmd/Ctrl+Shift+P`, then verify the section
  tabs, arrow-key navigation, **Revert changes**, **Reset to preset**, and that
  `Escape` closes the window, keeps the edits, and returns focus to the
  trigger. Confirm the window resizes and moves independently of the main
  window — including taller than it — and that reopening it, or pressing the
  shortcut again, focuses the existing window instead of closing it. Confirm
  closing the main window also closes it.
- Connection summary: open Protocol Settings, select Summary, then verify the
  card rows, **Copy**, and that a connected window opens read-only.
- Transport receive path: connect the matching ArcGIS Velocity Simulator mode
  and confirm records and metadata arrive.

## Documentation checks

`npm run docs:link-check` runs `markdown-link-check` over every Markdown file
outside `node_modules` and ignores image links. Run it after any documentation
change.

Link checking does not enforce the editorial rules in `AGENTS.md`. Verify by
inspection that each guide keeps its sentence-case H1, navigation line on line
three, accurate table of contents, and closing related-documentation section;
that every code fence has a language tag; that links are relative without a
leading `./`; and that documented tooltip strings match the app verbatim.

## Debugging

| Command | Attaches to | Ports |
|---|---|---|
| `npm run debug-main` | Main process | 9229 |
| `npm run debug-renderer` | Renderer | 9222 |
| `npm run debug-both` | Both processes | 9229, 9222 |
| `npm run debug-both-brk` | Both, breaking on start | 9229, 9222 |
| `npm run debug-verbose` | Both, with verbose Electron logging | 9229, 9222 |

- **Renderer** — run `npm run debug-renderer`, open `chrome://inspect`, and
  inspect the Electron renderer target.
- **Main process** — use the pre-configured Run and Debug entries in
  `.vscode/launch.json`.
- **Quick DevTools** — press `F12`, or `Cmd+Option+I` / `Ctrl+Shift+I`, while
  the app is running.

**Toggle Developer Tools** (`F12`) is available in the Help menu and the
context menu. Its checkbox reflects the real open or closed state of DevTools no
matter how DevTools was opened, and both menus stay in sync.

**Inspect Element Mode** (`F11`) is also in the Help menu and context menu.
Selecting it enters pick mode with a crosshair cursor; clicking a control jumps
to its element in the DevTools Elements panel, opening DevTools if needed. Press
`Escape` or toggle the entry again to cancel. Closing DevTools externally
cancels pick mode and unchecks both entries.

Headless mode never creates a window, so attach to the main process only:

```bash
electron --inspect-brk=9229 . runMode=headless \
  protocol=tcp mode=server ip=0.0.0.0 port=9000 logLevel=debug
```

## Secondary window policy

The application assigns each secondary surface a role before choosing its
window behavior. Reference workspaces are independent of a single task:
**Help** (`F1`), **Command Line Interface** (`F3`), and Protocol Settings are
framed, non-modal, resizable windows with native close, minimize, and maximize
controls. Help and the Command Line Interface use
`reference-window-manager.js` to clamp and persist bounds under
`dialogSizes.help` and `dialogSizes.commandLine`; reopening either restores and
focuses its existing window. Closing the main window closes both workspaces.

Task and alert surfaces remain child dialogs where blocking the main workflow is
appropriate: App Config, Launch Config, ArcGIS Velocity sign-in, unexpected
errors, and About. They retain normal native close affordances and their
existing platform-specific modality and focus behavior. The sign-in window
deliberately hides on close so an in-progress authentication and output
selection remain available on reopen.
The startup splash is intentionally frameless, non-resizable, and always on
top only while the main window is loading. The in-document Protocol Settings
dialog and error overlay remain fallbacks for non-Electron test environments;
the running application uses their dedicated window or inline status treatment.

Useful bounds while debugging a headless session: `logLevel=debug`,
`logFile=./runner.log`, `doneFile=./cap.done.json`, `idleTimeoutMs=5000`, and
`durationMs=10000`.

## Logging

Network-facing operations — authentication, API queries, token refresh, and
transport lifecycle — log through the shared `RunLogger` at `error`, `warn`,
`info`, or `debug`. The default level is `info`; set `logLevel=debug` for
verbose output or `logLevel=error` for quiet runs, in both UI and headless
modes. Diagnostics go to the console by default; add `logFile=./logs/run.log` to
mirror them to a file. Diagnostic output is always separate from captured data,
which goes to stdout or `outputFile`.

Prefix each message with a context tag such as `[Auth]`, `[API]`, `[Token]`,
`[Transport]`, or `[Startup]`. Log the operation on entry and its outcome on
completion. Never log passwords; tokens, usernames, and client IDs are
acceptable debugging context.

Packaged builds write diagnostics to:

- macOS — `~/Library/Logs/arcgis-velocity-logger/`
- Windows — `%APPDATA%\arcgis-velocity-logger\logs\`
- Linux — `~/.config/arcgis-velocity-logger/logs/`

## Common failures

| Symptom | Cause and fix |
|---|---|
| Port already in use | Check with `lsof -i :<port>` or `netstat -an \| grep <port>`, then pick a free port. |
| Debugger will not attach | The inspector port is occupied. Check `lsof -i :9229`, stop the stale Electron process by PID, and re-run. Validate syntax with `node -c src/main.js`. |
| Theme does not apply | Confirm `themes/theme-loader.js` is loaded and `<link id="current-theme-stylesheet">` exists. The loader also puts a `theme-<name>` class and `data-theme` on the body; every theme palette is scoped to that class. |
| A window stays dark under a light theme | A palette token was derived on `:root`. Theme variables exist only from `body` downwards, so a `:root` declaration is substituted against the html element, freezes at the dark defaults in `src/themes.css`, and is then inherited by the whole document. Declare derived tokens on `body`. |
| IPC message never arrives | The channel is missing from the `send`, `invoke`, or `on` whitelist in `src/preload.js`. |
| Header controls wrap or overflow | `.header` and `.theme-controls` must keep `flex-wrap: nowrap`; check the progressive-hide width thresholds in `index.html`. |
| Tooltip does not appear | The control lacks `data-tooltip` and `aria-label`, or a state change updated the icon without updating `element.dataset.tooltip`. |
| Test fails only in `npm test` | A prior suite left a port or file behind. Run the single suite directly to isolate it, and confirm teardown closes sockets and servers. |
| `npm run docs:link-check` reports a missing target | A guide was renamed or removed. Update every reference, including `README.md`, `docs/README.md`, sibling guides, `src/help.html`, and script or test strings. |

## Extending the app

### Adding a control

1. Add the element in `src/index.html` with `data-tooltip` and `aria-label`.
   Protocol-specific controls belong inside `#protocol-settings-dialog`, in the
   `.protocol-settings-group` for their protocol and section; only fields that
   every protocol shares stay in the connection row. A control added to the
   dialog is locked automatically while a connection is live, because locking
   queries the dialog instead of listing controls. The detached Protocol
   Settings window mirrors the new control automatically through
   `src/protocol-settings-mirror.js`; no window-side code is ever touched.
2. Wire behavior and state in `src/renderer.js`; persist anything durable
   through `ConfigManager` and add any new IPC channel to the whitelist in
   `src/preload.js`.
3. Style it in `src/style.css`. Text inputs and selects inside aligned groups
   need an explicit `text-align: left` override (`text-align-last: left` for
   selects); the default right alignment is only for numeric and port fields.
4. Use theme-friendly SVG icons with `currentColor` rather than emoji, and
   provide distinct on and off variants for stateful buttons.
5. Document the control and its exact tooltip text in the owning guide.

### Adding a tooltip

Tooltips use the shared system in `src/tooltip-utils.js` on every operating
system, because native Electron tooltips are unreliable. Write what the control
does and when, not a repeat of its label, and include the keyboard shortcut if
one exists. Multi-line text uses the `&#10;` entity inside the attribute.
Structured attributes such as `data-tooltip-icon` and `data-tooltip-kind`
(`auth`, `info`, `success`, `warning`, `error`, `secure`) are supported;
arbitrary HTML is not. State-dependent tooltips must be updated in
`src/renderer.js` alongside the icon or label swap, never hard-coded in HTML.
`<select>` elements keep a tooltip on the element and on each `<option>`, kept
in sync through the existing `*_TOOLTIPS` objects and `update*Tooltip()`
functions.

### Adding a transport

1. Create `src/<name>-transport.js` with a receive-oriented client and server
   path, reusing `tls-utils.js` and `format-utils.js` instead of duplicating
   certificate or format logic.
2. Wire connection lifecycle and IPC in `src/main.js`, and add the capture path
   to `src/headless-runner.js`.
3. Add the protocol, its options, and validation to `src/cli-options.js` so
   terminal help, the `F3` dialog, and the documented option reference stay
   generated from the same metadata.
4. Add UI controls and tooltips in `src/index.html` and `src/renderer.js`. The
   protocol-specific controls belong in `#protocol-settings-dialog`, in a
   `.protocol-settings-group` per section (`data-protocol`, `data-section`);
   only fields every protocol shares stay in the connection row. Extend
   `readConnectionState()` and `src/connection-summary.js` so the new protocol
   reports its rows, warnings, and settings count.
5. Update `src/help.html`: the Getting Started description, the Connection Types
   list, and a dedicated Options section for every new control.
6. Add `docs/<name>.md` with UI controls, exact tooltip strings, and
   troubleshooting, then list it in `docs/README.md` and, if significant, the
   root `README.md`.
7. Add `test/<name>-transport.test.js` covering both directions and every
   supported format.

### Adding a theme

1. Add `src/themes/theme-<name>.css` defining every custom property the app
   uses, scoped to `body.theme-<name>`: base, surface, and text colors; button
   background, text, and border; border and shadow colors; status and toggle
   colors; compatibility aliases; and `--title-gradient-start`,
   `--title-gradient-mid`, and `--title-gradient-end`.
2. Register the name in `ThemeLoader.getAvailableThemes()` in
   `src/themes/theme-loader.js`.
3. Add the option to every user-facing theme selector.
4. Verify persistence, contrast, title gradients, and the fallback path when a
   stylesheet is missing — `src/themes.css` holds minimal dark fallback values
   so the UI stays usable if dynamic loading fails.
5. Update the [configuration guide](configuration.md) when the available theme
   list changes.
6. Run `node test/theme-cascade.test.js`, which resolves the real cascade for
   Help, the Command Line Interface, and Protocol Settings and checks the new
   theme for palette parity and text contrast.

### Shared semantic palette

`src/themes.css` derives one semantic palette — `--app-bg`, `--app-surface`,
`--app-raised`, `--app-border`, `--app-text`, `--app-muted-text`,
`--app-heading`, `--app-accent`, the `--app-*-bg` interaction surfaces, and the
`--link-*` tokens — that the main window, the detached Protocol Settings
window, Help, and the Command Line Interface all share.

Two rules keep it working:

- Declare derived tokens on `body`, never on `:root`. The theme loader applies
  the theme class to the body element, so `body.theme-*` is the only place a
  theme palette exists. A `var()` in a `:root` declaration is substituted
  against the html element, which only carries the dark defaults, and the
  resolved dark value is then inherited by the whole document.
- Reference the semantic tokens instead of restating per-theme values or
  falling back to a fixed color. A window stylesheet should carry no literal
  hex color and no fixed black or white overlay; tint interaction surfaces with
  `color-mix()` against `--app-text` so a light theme darkens and a dark theme
  lightens.

## Validation checklist

1. The smallest relevant test suite passes, then `npm test` passes.
2. `npm run docs:link-check` reports no broken links.
3. `npm start` launches, restores settings, and exercises the changed path.
4. Headless behavior and exit codes are unchanged, or intentionally updated and
   documented.
5. New or changed controls have tooltips, `aria-label` values, and keyboard
   access.
6. Documentation is updated in the owning guide, with tooltip strings copied
   verbatim from the app.
7. New `src/*.js` files carry the Apache 2.0 copyright header.
8. No new dependencies were added without updating `package.json` deliberately.

## Related documentation

- [Connection summary and protocol settings](connection-summary.md) — Protocol Settings and the summary surfaces
- [Command-line reference](command-line.md) — every CLI parameter and its defaults
- [Headless mode](headless.md) — no-UI capture workflows and automation
- [Configuration](configuration.md) — persisted settings and launch configuration
- [Build and release](build-and-release.md) — packaging, signing, and publishing
- [Repository overview](../README.md)
