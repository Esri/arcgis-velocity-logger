# Agent Guidelines — ArcGIS Velocity Logger

This file provides rules and guidance for AI coding agents (e.g. GitHub Copilot, OpenAI Codex) working in this repository.

## General

- Follow the existing code style and conventions found in the source files.
- Do not introduce new dependencies without updating `package.json`.
- Keep all documentation in the `docs/` folder up to date when changing related functionality.
- In help text and documentation examples, always use full long option names rather than short aliases. This includes wrapper options (for example `--sign-script`, not `-x`) and pass-through external signing options (for example `--jenkins-email-to`, not `-je`).
- Run `npm test` after making code changes and ensure all tests pass.
- **Always prefer a DRY (Don't Repeat Yourself) implementation approach.** When logic is shared across modules (e.g. TLS utilities used by both gRPC, HTTP, and WebSocket transports), extract it into a dedicated shared module rather than duplicating it. Reference `src/tls-utils.js` and `src/format-utils.js` as examples of this pattern.
- Work in the repository's existing main checkout by default. Do not create a
  worktree unless the user explicitly requests isolation or concurrent work in
  this same repository cannot be performed safely in one checkout. Parallel
  work in separate repositories should use each repository's existing checkout.

## Model and delegation efficiency

- Use the smallest, fastest model that reliably fits the task and risk. Use
  mini or fast models for focused searches, CSS or docs edits, straightforward
  tests, and mechanical parity changes.
- Reserve larger or higher-effort models for architecture, security-critical
  work, ambiguous cross-cutting changes, and difficult debugging.
- Do work directly when it fits in about 2-5 tool calls; delegate only
  substantial independent scopes.
- Split work by repository or non-overlapping workstream, never duplicate
  investigation, and run independent agents or tools in parallel while
  respecting dependencies.
- Give agents complete standalone prompts and explicit done criteria. Prefer
  synchronous agents unless real independent work can continue in parallel.
- Reuse existing agents for follow-ups. Stop exploration once sufficient
  evidence exists.
- Centralize final parity review and targeted validation, and optimize total
  wall time and token use without sacrificing correctness.

## Copyright Headers

**Every new JavaScript file** added to this repository **must** begin with the following copyright header:

```js
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
```

This applies to all `.js` files under `src/` only.  
Do **not** add this header to files under `scripts/` or `test/` — script files often begin with a `#!/usr/bin/env node` shebang that must stay on line 1, and the copyright block would break them.  
Do not skip this header in `src/`, even for small utility files.

## Documentation Standards

These rules govern every Markdown file in the repository (`docs/*.md`, root
`README.md`, `AGENTS.md`, and any other `.md` file), and apply whenever
documentation is added, renamed, or updated.

### Placement

- **All maintained documentation lives in `docs/`.** The only Markdown files
  allowed outside `docs/` are: the root `README.md`; `AGENTS.md`; license or
  other legal files (e.g. `LICENSE.md`); GitHub metadata under `.github/`
  (issue/PR templates and pull request templates); and tooling metadata that is
  not maintained product or developer documentation.
- Do not create a new top-level `.md` file for a guide, summary, or reference —
  put it in `docs/`.

### Content policy

- **Documentation describes current behavior and actionable tasks.** Every
  maintained guide answers "how do I do this now?" — not "how did this evolve?".
- **Historical narratives are not maintained guides.** Do not add or restore
  release chronologies, development summaries, migration stories, "changes
  made" lists, achievements, benefits, benchmark timings, file-size
  comparisons, or future-enhancement wish lists. Record that history in commit
  messages and pull requests instead.
- **Duplicate summaries are not maintained guides.** A topic is documented once,
  in the guide that owns it; other guides link to it rather than restating it.
- **Content boundaries** — respect the owning guide for each topic:

  | Guide | Owns |
  |---|---|
  | Protocol guides (`grpc.md`, `http.md`, `websocket.md`, `xmpp.md`) | Transport behavior, UI controls, exact tooltip strings, and transport troubleshooting. |
  | `tls.md` | Shared certificate, trust-store, and mTLS concepts used by every transport. |
  | `command-line.md` | The complete option reference, defaults, and help layouts. |
  | `headless.md` | No-UI capture workflows, stop conditions, and automation. |
  | `configuration.md` | Persisted settings and launch configuration files. |
  | `developer-guide.md` | Local development, testing, debugging, and extension patterns. |
  | `build-and-release.md` | Build prerequisites, packaging, signing, and releases. |

- The maintained set is the root `README.md` and `AGENTS.md`, the guides listed
  in `docs/README.md`, and the JSON templates under `docs/examples/`. Adding a
  guide outside that set requires updating both indexes and the boundaries
  table above.

### Naming

- Every file in `docs/` uses **lowercase-kebab-case** (e.g. `command-line.md`,
  `build-and-release.md`). `README.md` is the allowed index filename exception.
- Root `README.md` and `AGENTS.md` keep their conventional uppercase names —
  the kebab-case rule applies only within `docs/`.

### Required indexes

- **Root `README.md`** stays concise: a short "Documentation" section linking
  to `docs/README.md` plus a handful of the most relevant guides for a new
  reader. It is not the detailed catalog and does not need the full guide
  skeleton below.
- **`docs/README.md`** is the single detailed documentation index: every guide
  listed with an icon, title, one-line purpose, and audience, plus the
  configuration-template list and the documentation maintenance summary.
  Adding, removing, or renaming a guide requires updating this file (and, if
  the guide is significant enough for a new user to discover it quickly, the
  root `README.md` too). `docs/examples/` has no index file — link the JSON
  templates directly from `docs/README.md` and `docs/configuration.md`.

### Guide skeleton

Every file in `docs/` other than `docs/README.md` must follow this structure:

1. Line 1: one H1 in **sentence case** (capitalize only the first word and
   proper nouns/acronyms — `TLS`, `gRPC`, `HTTP`, `WebSocket`, `XMPP`,
   `ArcGIS Velocity`, `ArcGIS GeoEvent Server`, etc. stay capitalized; do not
   use Title Case). No emoji in headings.
2. Line 2: blank.
3. Line 3: the navigation line for top-level guides, exactly:
   `[← Documentation index](README.md) · [Repository overview](../README.md#documentation)`
   Nested guides use the equivalent paths for their directory depth.
4. One to two concise paragraphs stating the guide's scope, audience, and any
   prerequisites.
5. A `## Table of contents` section (H2 anchors only, no H3/H4) when the guide
   is roughly longer than 80 lines or has 4 or more H2 sections.
6. The body, with valid heading hierarchy (H1 → H2 → H3 → H4, no skipped
   levels; headings inside fenced code blocks do not count).
7. A closing `## Related documentation` section (use `## Related files` or
   `## References` only when that is a more accurate label for the list)
   linking sibling guides and, where useful, `../README.md`. This is the only
   navigation — do not add a repetitive prev/next bar.

### Table of contents and headings

- TOC entries must match the guide's actual H2 headings and their GitHub
  auto-generated anchors (lowercase, spaces → hyphens, punctuation stripped).
- Remove emoji from every heading (H1–H4). Emoji/icons stay fine in
  non-heading prose, tables, or the `docs/README.md` catalog's icon column.

### Links and anchors

- All cross-references use **relative links with no leading `./`**. For example,
  use `[TLS guide](tls.md)` rather than a dot-prefixed path.
- Use **descriptive link text**, not a bare filename, except when the link
  genuinely refers to a file/artifact by name — in that case wrap the
  filename in backticks (for example,
  `` [`launch-config.xmpp.sample.json`](docs/examples/launch-config.xmpp.sample.json) ``).
- Anchors are lowercase and must match a real heading's auto-generated slug in
  the target file.
- Never use reference-style links (`[text][ref]` + a separate `[ref]: url`
  definition) — always inline `[text](path)`.
- Backtick filenames, paths, CLI flags, and commands referenced in prose.

### Code fences and alerts

- Every fenced code block needs a language tag on the opening fence (` ```bash `,
  ` ```text `, ` ```json `, ` ```js `, etc.) — never a bare ` ``` `.
- Prefer sparse GitHub alerts over bold "Note:" labels. Replace
  `**Note:**`/`**Notes:**`-style paragraphs with:
  ```text
  > [!NOTE]
  > The note text here.
  ```
  Use `[!WARNING]` only for genuinely cautionary/destructive/security content.

### Tooltips and terminology

- When a doc describes a UI control, its tooltip text must be copied
  **verbatim** from the `data-tooltip`/`title` string in `index.html` (or the
  relevant dialog HTML) — do not paraphrase. See the Tooltip Authoring Rules
  above for how tooltips are authored in the app itself; documentation must
  stay a faithful mirror of those exact strings.
- Use the product names **ArcGIS Velocity** and **ArcGIS GeoEvent Server**
  exactly (not "Velocity" or "GeoEvent" alone) on first mention in a section;
  shorter forms are fine on repeat mentions within the same section.
- Follow the existing Terminology section (below) for "unsecure" vs.
  "insecure" and for preserving third-party API identifiers unchanged.

### Renames

- Renaming or removing a guide requires updating every reference to it across
  the repo: `docs/README.md`, root `README.md`, other `docs/*.md` guides,
  `src/help.html`, `AGENTS.md`, JS/tests that print doc paths in help text or
  error messages, and `package.json`/build/release script metadata.

### New protocol, transport, or major feature

When adding a new protocol, transport, or major feature:

1. **`src/help.html`** — update the **Getting Started** description, add the
   new protocol to the **Connection Types** list, and add a dedicated
   **Options** section describing every control and its tooltip content.
2. **`docs/*.md`** — the corresponding transport doc (e.g. `docs/http.md`,
   `docs/grpc.md`, `docs/websocket.md`, `docs/xmpp.md`) must include a
   **UI controls** section listing every control with its tooltip text, and a
   **Tooltip reference** section with the exact tooltip strings used in
   `renderer.js` / `index.html`.
3. **`docs/README.md`** and, if the feature is significant, root `README.md`
   — add the new guide following the required-indexes rules above.

### Validation

Before finishing a documentation change, check that: every guide still has
its H1/nav-line/skeleton intact; no bare code fences remain; no `**Note`-style
bold labels remain; no `./`-prefixed or reference-style links remain; every
cross-reference resolves to a real file and (if anchored) a real heading; and
heading levels are not skipped. Do not add new linting tools to automate
this — check by inspection (`grep`/`view`) as part of the change.

## Terminology

- Use **"unsecure"** (not "insecure") when writing prose, comments, or documentation that describes a connection or mode lacking TLS/encryption.
- Exception: do **not** rename third-party API identifiers such as `createInsecure()`, `InsecureServerCredentials`, or any gRPC/library symbol — those are external API names and must stay unchanged.

## Code Organization

- `src/` — application source (main process, renderer, preload, helpers)
- `scripts/` — build and developer utility scripts
- `test/` — unit and integration tests
- `docs/` — all documentation

## UI / CSS Conventions

- All text-input controls (e.g. file paths, cert paths, URL paths) and dropdown selects (e.g. format, serialization) must use **`text-align: left`** (and `text-align-last: left` for selects). When adding a new text input or select dropdown to the connection controls, add an explicit `text-align: left` override in `style.css` following the existing patterns. Protocol-specific controls live in the Protocol Settings dialog: `.protocol-settings-field > input`, `.protocol-settings-field > select`, and `.xmpp-options-grid` already left-align their text inputs and selects, and only numeric fields stay right-aligned.
- Protocol-specific controls belong inside `#protocol-settings-dialog`, in the `.protocol-settings-group` for their protocol and section (`data-protocol` and `data-section`). Only fields shared by every protocol stay in the connection row. Never duplicate a control between the two places: the authoritative copy stays this in-document dialog, and the detached Protocol Settings window only mirrors it through `src/protocol-settings-mirror.js` rather than ever owning a control of its own.
- **Every interactive control** (buttons, checkboxes, dropdowns, text inputs) must have a meaningful `title` attribute (tooltip) that describes its purpose, accepted values, and any important context. For `<select>` dropdowns, add a `title` on each `<option>` as well as on the `<select>` itself. Use the JavaScript tooltip-updater pattern (see existing `*_TOOLTIPS` objects and `update*Tooltip()` functions in `renderer.js`) to keep each `<select>` element's tooltip in sync with the currently selected value. All tooltip text must also be captured in the corresponding `docs/*.md` file so documentation stays consistent with the UI.
- Use polished, theme-friendly **SVG icons** for persistent icon controls. Prefer `currentColor` masks or inline SVGs, avoid emoji/icon fonts for durable controls, and provide clear on/off variants for stateful buttons.

### Tooltip Authoring Rules

Tooltips in this app use the shared custom tooltip system in `src/tooltip-utils.js`, enabled on all operating systems because native Electron/macOS `title` tooltips are unreliable. Follow these rules every time you add or edit a control:

1. **Always add tooltip content.** Every `<button>`, `<input>`, `<select>`, `<label>`, and `<textarea>` must have a meaningful `data-tooltip` and `aria-label` (or a `title` that `tooltip-utils.js` can migrate at runtime). Prefer explicit `data-tooltip` for new controls.

2. **Be descriptive, not just a label echo.** `data-tooltip="Save"` on a save button tells the user nothing new. Instead write what it does and when: `data-tooltip="Save logs to a file (Cmd+S)"`. Include the keyboard shortcut if one exists.

3. **Use structured tooltip attributes.** Custom tooltips may use Unicode icons and theme-aware colors through approved attributes such as `data-tooltip-icon="🔑"` and `data-tooltip-kind="auth|info|success|warning|error|secure"`. Do not put arbitrary HTML in tooltip strings.

4. **Use `&#10;` for multi-line tooltip text in HTML attributes.** Newlines inside `data-tooltip` or `title` attributes must be written as the HTML entity `&#10;` (not a literal newline or `\n`). Example:
   ```html
   data-tooltip="Sign In to ArcGIS Velocity: browse outputs and auto-configure connection" data-tooltip-icon="🔑" data-tooltip-kind="auth"
   ```
   Limit multi-line tooltips to buttons that have several distinct behaviors worth listing. Keep each line short.

5. **Match the pattern of existing working buttons.** Before writing a new tooltip, look at a nearby working button in `index.html` (e.g. `toggle-connection-line`, `save-logs-btn`) and follow exactly the same quoting, attribute placement, and text style.

6. **Dynamic tooltips go in `renderer.js`, not in HTML.** When a button or select changes state (e.g. Ascending/Descending, Show/Hide), update `element.dataset.tooltip` (or `element.title`, which is migrated by `tooltip-utils.js`) in JavaScript alongside the icon/label swap. Never hard-code a state-dependent tooltip into the HTML - it will become stale.

7. **Test on hover before committing.** After adding a tooltip, run the app with `npm start` and hover/focus the control to confirm the custom tooltip appears with the expected icon, color, and line wrapping.

## UX Design Standards

Aim for the polish and refinement found in industry-leading desktop applications (VS Code, GitHub Desktop, Figma, Linear, Slack). Every user-facing interaction should feel intentional, responsive, and well-crafted:

- **Error and status feedback** must never obscure other UI elements. Use inline banners or toast notifications within the relevant context area rather than cramming messages into fixed-height footers. Errors should be dismissible, wrap naturally for long messages, and use clear visual hierarchy (icon + colored border + readable text).
- **Dialogs and panels** should have breathing room, consistent spacing, and a clear visual flow from top to bottom. Avoid overloading a single row with competing elements.
- **Transitions and animations** should be subtle (150-200ms), purposeful, and never block interaction. Use them to orient the user, not to decorate.
- **Progressive disclosure** — show only what the user needs at each step. Hide advanced options behind expandable sections or secondary views.
- **Accessibility** — use semantic HTML, ARIA attributes (`role`, `aria-live`), and ensure keyboard navigation works for all interactive elements.

## Logging Best Practices

All network-facing operations (authentication, API queries, token refresh) must include structured console logging:

- Use the shared `appLogger` (a `RunLogger` instance) via the `velocityLog(level, message)` helper. Levels: `'error'`, `'warn'`, `'info'`, `'debug'` (ordered by priority, lowest to highest).
- Default log level is `'info'`. Configure via the `logLevel` CLI parameter (e.g. `logLevel=debug` for verbose output, `logLevel=error` for quiet operation). Works in both UI and headless modes.
- All log output goes to both the console and a log file. The log file defaults to `./logs/velocity-logger-YYYYMMDDTHHMMSS.log`. Override with `logFile=/custom/path.log`.
- Log entries use the `RunLogger` format: `[timestamp] [LEVEL] [message]`.
- Prefix each message with a context tag in brackets: `[Auth]`, `[API]`, `[Token]`, `[Transport]`, `[Startup]`, etc.
- Log the operation being attempted on entry, and the outcome (success summary or error message) on completion.
- Never log sensitive data (passwords). Tokens, usernames, and client IDs are acceptable for debugging context.

## Commit Messages

Use the conventional-commits style:
- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance (build, deps, tooling, compliance)
- `docs:` documentation-only changes
- `test:` test additions or fixes

When suggesting, drafting, or creating a commit message, do not mention
Copilot or add Copilot attribution or co-author trailers unless the user
explicitly asks for that wording.

Prefer a detailed commit message with a concise subject and a body that explains
the meaningful changes and rationale. Use a brief subject-only message only when
the user explicitly asks for a brief message.

## Git / GitHub Commit Workflow (Agent Tool Usage)

When creating commits with multi-line messages, **never** construct the message inline in a chained shell command. The zsh parser inside the IDE's `run_in_terminal` tool mishandles embedded newlines, apostrophes, em dashes, and other punctuation in heredocs or `printf '…' | git commit -F -` chains — leading to mangled messages, stuck pager prompts (requiring the user to press `q`), or failed commits.

### Required Pattern — Two Separate Tool Calls

**Call 1** — write the message to a temp file:
```zsh
cat > /tmp/cm.txt << 'EOF'
feat(scope): short subject line

Longer body paragraph explaining what changed and why.
Another line of detail.

- bullet one
- bullet two
EOF
```

**Call 2** — stage and commit using that file:
```zsh
cd /path/to/repo && git add -A && git commit -F /tmp/cm.txt
```

**Verification step (required).** Some terminals collapse blank lines inside pasted heredocs, which produces a commit object where the subject and body are stuck on consecutive lines (no separator). Always inspect the file before committing:

```zsh
cat -en /tmp/cm.txt | head -5
```

Line 1 must be the subject, **line 2 must be blank** (just `$`), and the body must start on line 3. If line 2 is not blank, regenerate the file using Node, which is unambiguous:

```zsh
node -e 'require("fs").writeFileSync("/tmp/cm.txt", `subject\n\nbody line 1\nbody line 2\n`)'
```

### Commit Message Format

- **Keep the subject line short and imperative (≤ 72 chars).** Use the conventional-commits prefix (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). The subject should name *what* changed, not explain *why* or list details.
- **Always leave a blank line** between the subject and the body.
- **Move all detail into the body.** The body should be well-formatted prose or a bullet list explaining what changed and why. Never run detail on into the subject line.
- **Good example:**
  ```
  feat: add cross-platform prereq installer and --install-prereqs switch

  Adds an opt-in workflow for installing missing build/release
  prerequisites on macOS, Linux, and Windows. Default behaviour is
  unchanged (fail-fast with install hints).

  - New scripts/install-prereqs.js: installs via brew/apt/winget,
    skips things too risky to auto-install (Node upgrades, gh auth).
  - check-build-prereqs.js gains --json flag for machine-readable output.
  - release.sh gains --install-prereqs switch and portable mktemp fix.
  ```

### When to Commit and Push

- **Do not auto-commit after every change.** Wait until the user explicitly asks to "commit" or "commit and push". At that point, group all pending changes into a single logical commit (or the fewest meaningful commits).
- **Never commit and push in the same turn as making code changes.** After implementing a change, stop and wait for the user to review and approve before staging anything.
- **Always show the proposed commit message and list of files** to be staged, and wait for the user's "go ahead" before running `git commit`.
- **Always ask the user before pushing.** Show the commit(s) that will be pushed and wait for explicit approval before running `git push`.
- **Pushing is always a separate tool call** after verifying the commit landed cleanly:
  ```zsh
  git --no-pager log --oneline -3   # verify first
  git push                           # then push
  ```

### Amending Commits

- Use `git commit --amend --no-edit` for small follow-up tweaks (no message change needed).
- For message changes, write a new `/tmp/cm.txt` and use `git commit --amend -F /tmp/cm.txt`.

### Rebase Over Merge

- Always use `git pull --rebase` instead of `git pull`. Never create merge commits.
- Configure with `git config pull.rebase true` if needed.

### Pager Prevention

Always use `git --no-pager` (or append `| cat`) for any `git log`, `git diff`, `git show`, or `git tag` command — these invoke the pager by default, blocking the terminal until the user presses `q`.

```zsh
git --no-pager log --oneline -10
git --no-pager diff HEAD~1 --stat
```

### One Tool Call Per Action

- Never chain commit + push + log verification into a single command string. Run them as separate sequential tool calls so a failure in one step is isolated and visible.
- Never use `git commit -m "…"` for messages longer than a subject line — apostrophes and punctuation break shell quoting. Always write to a file first.

## Sister Repository: ArcGIS Velocity Simulator

This app (the **Logger**) and the **ArcGIS Velocity Simulator** are companion applications. They share a nearly identical Velocity Login dialog, but serve opposite roles:

- **Logger** — the login dialog queries **outputs** (data outputs that this app connects to for receiving/logging data).
- **Simulator** — the login dialog queries **feeds** (data inputs that receive data sent by the companion app).

When making changes or enhancements to the **outputs** logic in this repository (e.g. output picker UI, output listing API calls, output type icons/colors, dropdown styling), **apply the equivalent change to the feeds logic in the Simulator repository**. The same applies in reverse: feed-related improvements in the Simulator should be mirrored here for outputs.

Key mapping between the two apps:

| Logger (this repo)          | Simulator (sister repo)     |
|-----------------------------|------------------------------|
| `listOutputs()`           | `listFeeds()`              |
| `parseOutputItem()`       | `parseFeedItem()`          |
| `item.outputType`         | `item.feedType`            |
| `velocity:output-applied` | `velocity:feed-applied`    |
| Output Picker dropdown    | Feed Picker dropdown       |
| "not yet supported by the Logger" | "not yet supported by the Simulator" |

### Transport parity

The two apps also share every network transport — TCP, UDP, HTTP, WebSocket, gRPC, and XMPP — with the roles inverted: the Simulator **publishes** the data that the Logger **consumes**. Whenever a transport changes here, plan the mirrored change in the Simulator, and vice versa.

Treat the following as one shared surface that must not drift between the repositories:

- **Protocol modules.** The `src/<protocol>-transport.js` facades and protocol-specific helpers such as `src/xmpp-*.js` should keep the same module names, option names, and public function shapes in both repositories.
- **Option vocabulary.** CLI keys, launch-config keys, and UI element ids must be identical. For XMPP, canonical shared names include `xmppConversation`, `xmppAllowUnverifiedTls`, and the connect/reply/ping/reconnect timing fields.
- **Defaults and bounds.** Ports, positive timeouts, size caps, TLS/STARTTLS policies, and validation rules must match. XMPP itself defaults to **client** mode in the Simulator and **server** mode in the Logger; neither changes the app-wide default transport.
- **Wire-level guarantees.** Framing, message types, self-echo handling, and error conditions must stay compatible because one app's send path is the other app's receive path.
- **XMPP safeguards.** Keep account/JID canonicalization, password-whitespace handling, explicit opt-in unverified TLS, empty-password acceptance for PLAIN and SCRAM-SHA-1, Direct/MUC semantics, waiter cancellation, reconnect cleanup, and acknowledgement-only XEP-0198 claims aligned.
- **Client TLS verification.** Client-mode certificate verification is on by default and is bypassed only through the explicit `allowUnverifiedTls` (gRPC), `httpAllowUnverifiedTls`, `wsAllowUnverifiedTls`, and `xmppAllowUnverifiedTls` options. Keep the option names, defaults, warning styling, and log wording identical in both repositories, and keep the decision in one shared TLS helper rather than duplicating it per transport.
- **Documentation.** Matching transport guides, help sections, and tooltip references should describe the same behavior, adjusted only for data direction.

### Connection preset parity

`src/connection-presets.js` defines twelve paired connection presets. The preset
**identifiers and labels are a cross-application contract** and must match the
Simulator exactly, character for character, including the em dash in each label:

| Identifier | Label |
|---|---|
| `local-tcp-logger-server` | Local TCP — Logger Server / Simulator Client |
| `local-tcp-simulator-server` | Local TCP — Simulator Server / Logger Client |
| `local-udp-logger-server` | Local UDP — Logger Server / Simulator Client |
| `local-udp-simulator-server` | Local UDP — Simulator Server / Logger Client |
| `local-grpc-logger-server` | Local gRPC — Logger Server / Simulator Client |
| `local-grpc-simulator-server` | Local gRPC — Simulator Server / Logger Client |
| `local-http-logger-server` | Local HTTP — Logger Server / Simulator Client |
| `local-http-simulator-server` | Local HTTP — Simulator Server / Logger Client |
| `local-ws-logger-server` | Local WebSocket — Logger Server / Simulator Client |
| `local-ws-simulator-server` | Local WebSocket — Simulator Server / Logger Client |
| `local-xmpp-logger-server` | Local XMPP — Logger Server / Simulator Client |
| `local-xmpp-simulator-server` | Local XMPP — Simulator Server / Logger Client |

Only the **role mapping** is inverted. In the Logger, a label naming *Logger
Server* selects a `*-server` connection type and a label naming *Simulator
Server* selects a `*-client` connection type; the Simulator maps the same labels
the other way. Hosts, ports, formats, serialization, paths, and TLS choices must
stay identical.

Preset semantics must also match: a preset only pre-fills editable fields, never
connects, never starts capture or sending, never saves a secret, and never
changes startup defaults. Selecting **Custom** preserves current values, and
editing any populated field switches the display to **Custom (modified)**.
Adding, renaming, or repurposing a preset requires the same change in the
sister repository in the same release.

### Protocol Settings window and Connection Summary parity

The connection surface is shared between the ArcGIS Velocity Simulator and the
ArcGIS Velocity Logger and must not drift. Both applications keep only the
fields every protocol shares inline, and edit everything protocol-specific in
one consolidated Protocol Settings surface with Basics, Security, Advanced,
and a read-only Summary. The authoritative copy of every protocol-specific
control is still the in-document `<dialog id="protocol-settings-dialog">`
nested inside the connection controls container: it owns every default,
preset, lock, validation rule, and the Summary generator, and it is the only
thing a jsdom or other no-window environment ever renders. In the running
application, main opens or focuses one dedicated, non-modal, resizable
Electron `BrowserWindow` that mirrors that `<dialog>` and reports the user's
intent — an edit, a click, a section change — over IPC to be replayed on the
authoritative control, so no form rule, default, or transport decision is ever
duplicated in the window. No control is duplicated between the row and
Protocol Settings.

Keep the following shared files and IPC contract identical in both
repositories, byte-identical where the code itself is byte-identical:

- **Detached window files.** `src/protocol-settings-window-manager.js` (the
  secure main-process owner: window creation, focus-on-reopen, bounds
  resolution and persistence, and payload sanitization for every channel),
  `src/protocol-settings-mirror.js` (the dependency-free serializer and
  replayer loaded by both documents), `src/protocol-settings-window.js` (the
  detached window's controller, which owns no rule of its own), and
  `src/protocol-settings-preload.js` (the narrowly scoped preload exposing
  exactly `ready`, `emit`, `requestClose`, `onState`, and `onCommand` on
  `window.protocolSettingsClient`) are byte-identical in both repositories.
  `src/protocol-settings.html` (a minimal shell around
  `#protocol-settings-root` with a strict Content Security Policy) and
  `src/protocol-settings-window.css` (window-only chrome that reuses every
  Protocol Settings rule from `style.css`) follow the same pattern.
- **IPC channels**, all under the `protocol-settings:` prefix and validated by
  sender identity in the manager: `open`, `close`, `sync`, and `command` flow
  main → window and are accepted only from the main window's sender;
  `window-ready`, `window-event`, and `window-close` flow window → main and
  are accepted only from the settings window's sender. The main renderer's own
  bridge, `window.protocolSettingsHost` in `src/preload.js`, exposes `open`,
  `close`, `sync`, `command`, `onReady`, `onClosed`, and `onEvent`.
- **Security.** The detached window runs with `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, and no
  remote module; its document carries a strict CSP with no remote origins.
  The manager sanitizes every incoming payload — control ids, attribute
  names, class and style values, and the theme stylesheet href — before it
  reaches either process.
- **Window behavior.** The window is non-modal, and independently movable and
  resizable, including taller than the main window; its bounds are clamped to
  the display's work area and persisted under `dialogSizes.protocolSettings`
  in App Config, the same pattern already used for the App Config, Launch
  Config, and ArcGIS Velocity sign-in dialogs. Reopening while the window
  already exists focuses it rather than creating a second one. Closing it
  from its own title bar behaves exactly like **Done**: the edits are kept
  and focus returns to the opener. Closing the main window closes it too.

Keep the following identical in both repositories.

- **Element identifiers.** `protocol-settings-dialog`, `protocol-settings-btn`,
  `protocol-settings-count`, `protocol-settings-title`,
  `protocol-settings-subtitle`, `protocol-settings-close`,
  `protocol-settings-readonly`, `protocol-settings-alert`,
  `protocol-settings-tablist`, `protocol-settings-tab-<section>`,
  `protocol-settings-panel-<section>`, `protocol-settings-empty`,
  `protocol-settings-summary-rows`, `protocol-settings-done`,
  `protocol-settings-revert`, `protocol-settings-reset`,
  `connection-summary-card`, `connection-summary-rows`,
  and `connection-summary-copy`.
  `connection-summary-card` is the warning-only alert: it holds
  `connection-summary-rows`, renders at most one condensed line, is `hidden`
  whenever no warning applies, and sits outside the collapsible connection
  controls so a warning survives hiding the connection row.
  `connection-summary-copy` lives inside `protocol-settings-panel-summary` with
  the section it copies. Summary is part of the same dialog and has no separate
  connection-row action.
  Pre-existing protocol control ids are preserved unchanged, including
  `grpc-advanced`, `http-advanced`, `ws-advanced`, and `xmpp-advanced`, which
  identify the Advanced group of each protocol.
- **Sections.** `basics`, `security`, `advanced`, and `summary`, offered only
  when they hold something for the selected protocol and mode, with `tablist`,
  `tab`, and `tabpanel` roles, a roving tab stop, Arrow keys, and `Home` and
  `End`. The dialog is resizable in both dimensions within viewport bounds.
  Each protocol owns one
  `.protocol-settings-group[data-protocol][data-section]` per section, and a new
  protocol starts on its own first section rather than inheriting the previous
  one.
- **Control placement.** Format, path, serialization, RPC type, and the XMPP
  conversation, domain, account, and room fields are Basics; TLS, certificate
  paths, certificate verification, and remote binding are Security; the gRPC
  endpoint header, the WebSocket subscription message, first-message handling,
  and upgrade headers, and the XMPP timings are Advanced.
- **Editing model.** Controls update renderer state immediately and reach the
  network only on Connect. **Done** and `Esc` close and keep the edits,
  **Revert changes** restores the snapshot taken when the dialog opened and is
  enabled only while something still differs from it, and **Reset to preset** is
  enabled only while the fields derive from a modified preset. Focus returns to
  the opener.
- **Locking.** Disconnected is editable; connecting and connected are read-only
  with `protocol-settings-readonly` filled in; connected opens the read-only
  Summary section. Locking is one scoped query over the dialog, never a
  hand-maintained control list, and it also locks the shared preset, connection
  type, host, and port. The XMPP server **Copy Client Settings** and **Include
  password** actions stay available exactly while an XMPP Server is connected.
- **Validation.** A failed Connect fills the assertive `protocol-settings-alert`
  banner, opens the dialog on the section that owns the offending control,
  reveals and focuses it, sets `aria-invalid`, and adds the banner id to
  `aria-describedby` without discarding the tokens already there, and it still
  writes the message to the status log. Clearing the error removes only the
  banner's own token.
- **Shortcut.** `Cmd/Ctrl+Shift+P` opens Protocol Settings through
  `handleConnectionShortcut()` in the renderer, or focuses it — including the
  detached window — if it is already open. The **Settings** button behaves
  the same way. Neither the shortcut nor the button ever closes Protocol
  Settings; only **Done**, `Esc`, the close control, or the detached window's
  own close does that. Summary is reached through the Summary tab, not a
  separate button or shortcut.
- **Summary generator.** `src/connection-summary.js` is a pure module with no
  DOM access. `buildConnectionSummary(state)` drives the warning alert, the
  read-only Summary section and the configured-state
  count. `formatConnectionWarningLine(summary)` condenses every warning into the
  single line the alert renders, returning `null` when nothing is wrong; a lone
  warning keeps its own `label` and `value`, and several become `N warnings`
  followed by the highest-priority warning. It covers all twelve protocol and
  mode combinations, sorts warnings
  first with the certificate-verification bypass leading them, composes
  effective HTTP and WebSocket URLs, and reports a secret only as
  `Set (hidden)`, `Empty`, or `Not set`. Row objects carry `key`, `label`,
  `value`, `group`, `kind`, `severity`, `secret`, `isDefault`, and `detail`;
  groups are `Security`, `Connection`, `Protocol`, and `Session`; kinds are
  `warning`, `state`, `endpoint`, `preset`, `security`, `setting`, and `secret`.
  The WebSocket subscription message and upgrade headers are secrets in every
  surface. A server with neither a certificate nor a key reports the automatic
  self-signed pair, and only a half-configured pair raises a warning. The
  certificate-verification row is reported whenever encryption applies. The
  configured-state label always reports the changed count and appends any
  warnings rather than replacing the count with them. `settings.shortLabel` is
  the compact chip text: empty when the protocol has no settings or none are
  changed, and otherwise the count alone. `settings.label` keeps the full
  sentence and remains the button's tooltip and accessible name.
- **Compact connection row.** Only the preset, connection type, host, port,
  **Settings**, **Connect**, and **Disconnect** are inline, on one
  non-wrapping row. Every shrinkable control sets `min-width: 0` so a long
  option label can never push **Connect** out of view, and **Settings** drops its
  label below roughly 760 pixels while retaining its icon, tooltip, and
  accessible name.
  **Connect** and **Disconnect** stay separate controls and are never merged.
- **Tooltip utility.** `src/tooltip-utils.js` stays byte-identical in both
  repositories. It owns title migration, dynamic content, and additive
  `aria-describedby`. Visual tooltips require roughly 900 ms of stationary
  fine-pointer hover within a 4 px tolerance. Movement, pointer interaction,
  keyboard input, form input, scrolling, dragging, resizing, target removal,
  focus alone, and an open modal dialog suppress or dismiss them. The utility
  never invents fallback tooltips from visible labels, select option text, or
  placeholders. Focus associates the same content as a hidden accessible
  description without opening a visual popup, and visible tooltips do not
  intercept pointer input. Fix shared behavior there rather than working around
  it in a renderer.

Only these differences are allowed, and each one follows from the direction of
data flow or from a control that only one application has.

| Difference | Simulator | Logger |
|---|---|---|
| XMPP role row | `xmppDestination`, labelled Destination, reported for a direct conversation. | `xmppLocalJid`, labelled Receiving JID, reported for a direct conversation. |
| Role wording | Publishing to for a client; Listening on for a server. | Receiving from for a client; Listening on for a server. |
| Copy heading | `ArcGIS Velocity Simulator — connection summary`. | `ArcGIS Velocity Logger — connection summary`. |
| Identity defaults | `xmppResource` and `xmppNickname` default to `velocity-simulator`. | `xmppResource` defaults to `velocity-logger`, `xmppNickname` to `logger`, and `xmppExternalUsername` to `velocity-client`. |
| Host control id | The pre-existing host input is `ip-address`. | The pre-existing host input is `host`. |
| Inline-only controls | File selection, the lines and interval rate fields, and the playback actions stay inline. | The log controls stay inline. |
| Server identity output | None. | `xmpp-receiving-jid` reports the JID the running server receives on. |

Anything else — element ids, section names, row keys, labels, defaults, tooltip
text, warning wording, and shortcut assignments — stays the same. Adding a
section, a footer action, a warning, or a summary row requires the same change
in the sister repository in the same release.

Invert only genuine role differences. The Simulator publishes to role-specific `xmppDestination`; the Logger receives and may filter with role-specific `xmppLocalJid`. Do not add send behavior or `xmppDestination` to the Logger, and do not rename these asymmetric fields to make them appear identical.

When a transport-level change cannot be mirrored immediately, document the drift explicitly rather than leaving the apps quietly incompatible.
