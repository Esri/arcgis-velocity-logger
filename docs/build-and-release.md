# Build and release

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

This guide covers everything needed to produce and publish distributable
packages of ArcGIS Velocity Logger for macOS, Windows, and Linux: build
prerequisites, local build scripts, per-platform packaging formats, code
signing, and the release workflow driven by `scripts/release.sh`. It is
intended for developers who build artifacts or cut releases, and assumes
Node.js 18 or later, npm, and `npm install` have already been run.

## Table of contents

- [Prerequisites](#prerequisites)
- [Local builds](#local-builds)
- [Platform packaging](#platform-packaging)
- [Code signing](#code-signing)
- [Releasing](#releasing)
- [Release checklist](#release-checklist)
- [Troubleshooting](#troubleshooting)
- [Related documentation](#related-documentation)

## Prerequisites

Every `package:*` script verifies its tooling before building. Run the check
directly at any time:

```bash
npm run prereqs:check              # all build targets
npm run prereqs:check:mac          # macOS build toolchain
npm run prereqs:check:win          # Windows build toolchain
npm run prereqs:check:linux        # Linux toolchain (dpkg, fakeroot, GNU ar)
npm run prereqs:check:release      # also verifies git, gh, and gh auth
npm run check:build-prereqs        # backwards-compatible alias for prereqs:check
```

| Requirement | Used for | Install (macOS) |
|---|---|---|
| Node.js 18 or later and npm | Everything | `brew install node` or [nodejs.org](https://nodejs.org/) |
| `node_modules/` (electron-builder) | Building | `npm install` |
| `dpkg`, `fakeroot`, GNU `ar` | Building `.deb` packages | `brew install dpkg fakeroot binutils` |
| `git` with push access | Committing and pushing the version bump | Ships with macOS, or `brew install git` |
| `gh` GitHub CLI, authenticated | Creating releases and uploading assets | `brew install gh` then `gh auth login` |

> [!WARNING]
> On macOS the system `/usr/bin/ar` is BSD `ar` and silently produces a
> malformed ~100-byte `.deb` stub instead of a real Debian package. After
> `brew install binutils` the build scripts auto-discover Homebrew's GNU `ar`
> — no `PATH` edit is required.

### Installing prerequisites

`scripts/check-build-prereqs.js` defines *what* is required;
`scripts/install-prereqs.js` knows *how* to install each item on the host OS.

| Command | Installs |
|---|---|
| `npm run setup` | `npm install` plus any missing build prerequisites for this host |
| `npm run prereqs:install` | All build targets (no `git`/`gh`) |
| `npm run prereqs:install:mac` | macOS build prerequisites |
| `npm run prereqs:install:win` | Windows build prerequisites |
| `npm run prereqs:install:linux` | Linux build prerequisites |
| `npm run prereqs:install:release` | Build prerequisites plus `git` and `gh` |

Preview the plan without changing anything:

```bash
node scripts/install-prereqs.js --dry-run
node scripts/install-prereqs.js --dry-run --release
```

Set `INSTALL_PREREQS=1` to let a build install what it is missing and continue:

```bash
INSTALL_PREREQS=1 npm run package:linux
```

Host behavior:

- **macOS** — installs through Homebrew.
- **Linux** — detects `apt-get`, `dnf`, or `pacman`. Privileged installs are
  reported as manual steps unless you re-run with `--use-sudo` (requires an
  interactive TTY). `gh` is always a manual step because it requires adding
  GitHub's apt/dnf repository.
- **Windows** — uses `winget`, falling back to `choco`. `.deb` artifacts cannot
  be built natively on Windows; use WSL for that target.

Never auto-installed:

- **Node.js major upgrades** — the installer prints a manual instruction rather
  than changing the host's Node.js version.
- **`gh auth login`** — interactive; run it yourself once `gh` is on `PATH`.
- **Code-signing tools and credentials** (`codesign`, `signtool`, `CSC_LINK`,
  `WIN_CSC_LINK`, `APPLE_*`) — see [Code signing](#code-signing).

## Local builds

All output is written to `dist/`.

| Script | Platforms | Compression | Produces |
|---|---|---|---|
| `npm run dist` | Current host OS | normal | Host-native artifacts |
| `npm run package:mac` | macOS | normal | DMG, ZIP |
| `npm run package:win` | Windows | normal | NSIS installer, portable EXE, ZIP |
| `npm run package:win:zip` | Windows | normal | ZIP only |
| `npm run package:linux` | Linux | normal | AppImage, DEB |
| `npm run package` | All three, parallel | normal | Alias of `package:all` |
| `npm run package:all` | All three, parallel | normal | All artifacts |
| `npm run package:all:clean` | All three, parallel | normal | Cleans `dist/` first |
| `npm run package:seq` | All three, sequential | normal | All artifacts |
| `npm run package:seq:clean` | All three, sequential | normal | Cleans `dist/` first |
| `npm run package:mac:max` | macOS | maximum | DMG, ZIP |
| `npm run package:win:max` | Windows | maximum | NSIS installer, portable EXE, ZIP |
| `npm run package:linux:max` | Linux | maximum | AppImage, DEB |
| `npm run package:all:max` | All three, parallel | maximum | All artifacts |
| `npm run package:all:max:clean` | All three, parallel | maximum | Cleans `dist/` first |
| `npm run package:seq:max` | All three, sequential | maximum | All artifacts |
| `npm run package:seq:max:clean` | All three, sequential | maximum | Cleans `dist/` first |
| `npm run clean` | — | — | Deletes `dist/` |

Build only for your current OS while iterating — it is the fastest loop.
Cross-platform builds (for example a Windows installer from macOS) require Wine
or a host running the target OS.

Sequential builds (`scripts/timed-seq-build.js`) run one platform at a time and
print a per-step summary table; a failing step stops the run and exits non-zero.
Parallel builds (`scripts/timed-parallel-build.js`) start every platform at once
with label-prefixed interleaved output; failing steps are marked in the summary
and the process exits non-zero while the other steps still finish.

### Compression

The default is `normal`, which favors build speed. The `:max` variants add
`--config.compression=maximum` at invocation time for smaller artifacts and
slower builds; no config file edits are needed.

### Key build settings

Defined under `package.json → "build"`:

| Setting | Value | Notes |
|---|---|---|
| `asar` | `true` | App source is bundled into a single ASAR archive |
| `compression` | `"normal"` | The `:max` scripts override this at invocation time |
| `buildResources` | `"src/assets"` | Icons and platform resources |
| `files` | `src/**/*`, `package.json` | Source included in the package |
| `executableName` | `VelocityLogger` | Space-free binary/bundle name; `productName` stays `ArcGIS Velocity Logger` for display metadata |

## Platform packaging

### macOS

| Format | Artifact | Use for |
|---|---|---|
| DMG | `arcgis-velocity-logger-{version}-mac.dmg` | End-user distribution; drag-to-Applications install |
| ZIP | `arcgis-velocity-logger-{version}-mac.zip` | CI pipelines and scripted distribution |

Apple Silicon (arm64) and Intel (x64) are both supported. macOS 12 through 15
are supported; macOS 11 is best-effort (the Electron 41 minimum) and macOS 10.15
is not supported.

### Windows

| Format | Artifact | Use for |
|---|---|---|
| NSIS installer | `arcgis-velocity-logger-{version}-setup.exe` | Standard end-user and managed deployments; adds Start Menu shortcut, uninstaller, and Add/Remove Programs entry |
| Portable EXE | `arcgis-velocity-logger-{version}-portable.exe` | Restricted environments, USB or network use, no install |
| ZIP | `arcgis-velocity-logger-{version}-win.zip` | CI artifacts and scripted distribution; `npm run package:win:zip` builds it on its own |

Windows 10 (1903 or later) and Windows 11 are supported; Windows 8.1 and
Server 2012 R2 are not. The configured architecture is x64; add entries to the
`arch` array under `package.json → build.win.target` for ia32 or arm64.

Executable metadata uses the product name **ArcGIS Velocity Logger**, while
artifact filenames keep the `arcgis-velocity-logger` slug prefix so download
scripts stay stable.

### Linux

| Format | Artifact | Use for |
|---|---|---|
| AppImage | `arcgis-velocity-logger-{version}-linux.AppImage` | Any x86_64 distribution with glibc 2.17 or later; no install or root needed |
| DEB | `arcgis-velocity-logger-{version}-linux.deb` | Debian-family systems that want app-menu integration and `apt` management |

> [!NOTE]
> Linux builds target the build machine's host architecture. Cross-architecture
> builds such as arm64 require additional tooling or a CI host of that
> architecture.

## Code signing

Unsigned builds run, but they trigger OS security warnings on first launch.
Signing is optional for internal tools and recommended for wider distribution.

| Platform | Needed for distribution | Certificate source | Suppresses the warning immediately |
|---|---|---|---|
| macOS | Strongly recommended | Apple Developer Program | Yes, after notarization |
| Windows | Recommended | DigiCert, Sectigo, or GlobalSign | Only with an EV certificate |
| Linux | Not applicable | — | — |

### macOS signing and notarization

Requires a paid Apple Developer account, a Developer ID Application certificate
exported as `.p12`, an app-specific password, and your 10-character Team ID.
Without signing and notarization, Gatekeeper blocks the app on first launch.

```bash
export CSC_LINK=/path/to/DeveloperID.p12       # or a base64-encoded p12
export CSC_KEY_PASSWORD=your-cert-password
export APPLE_ID=your@apple-id.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
npm run package:mac
```

`scripts/release.sh` picks up the same variables — export them in your shell or
source them from a local, git-ignored file before invoking the script.

### Windows signing

Without signing, SmartScreen shows "Windows protected your PC" on first run. EV
certificates suppress that warning immediately; standard OV certificates require
a reputation build-up period.

```bash
export WIN_CSC_LINK=/path/to/certificate.pfx   # or a base64-encoded pfx
export WIN_CSC_KEY_PASSWORD=your-cert-password
npm run package:win
npm run package:win:zip
```

### External Windows signing script

Windows builds can delegate signing to an external script such as Esri's
`sign.sh`, either from a build or from a release:

```bash
npm run package:win -- --sign-script /absolute/path/to/sign.sh

./scripts/release.sh v1.2.3 \
  --sign-script /absolute/path/to/sign.sh \
  --sign-share-dir '\\storm\upload\DigitalSign\Velocity' \
  --sign-product-names "ArcGIS Velocity Logger"
```

| Option | Required | Passed to the external script |
|---|---|---|
| `--sign-script <path>` | Optional | The script to run. Absolute, relative (`../../../sign.sh`), and `~` paths are resolved to an absolute path before use. If omitted or unreadable, the build logs a warning and falls back to normal electron-builder signing or unsigned output. |
| `--sign-share-dir <UNC>` | Optional | `--share-dir <UNC>` |
| `--sign-timeout-minutes <minutes>` | Optional | `--timeout-minutes <minutes>`. Default `20`; must be a positive whole number. |
| `--sign-product-names <names>` | Optional | `--product-names <names>`. Defaults to `ArcGIS Velocity Logger`; use comma-separated names for multiple source directories. |

When a usable script is supplied, a path-aware hook signs in two phases:

| Phase | Auto `--source-dirs` | Files signed externally |
|---|---|---|
| Unpacked app (`afterSign`) | `dist/win-unpacked` | Top-level `*.exe;*.msi;*.msp` (normally `VelocityLogger.exe`), after electron-builder finishes Windows resource editing |
| Final artifacts (`afterAllArtifactBuild`) | The final artifact folder, normally `dist` | Only the current build's signable final artifacts, via an exact file mask such as `arcgis-velocity-logger-<version>-setup.exe;arcgis-velocity-logger-<version>-portable.exe` |

The hook skips electron-builder's built-in Authenticode signing only for those
direct files; nested helpers such as
`dist/win-unpacked/resources/elevate.exe` remain eligible for normal
electron-builder or `signtool` signing. ZIP, DMG, DEB, and AppImage artifacts
are never signed by this Windows path.

> [!WARNING]
> External signing invocations are serialized by a cross-process lock at
> `${TMPDIR}/arcgis-velocity-external-sign.lock` (or the platform temp
> equivalent). The lock is held only around each external signing invocation, so
> `npm run package:all:clean` still builds all three platforms in parallel while
> guaranteeing a single active signing job. The companion ArcGIS Velocity
> Simulator repository uses the same lock name, so two local builds cannot
> submit external signing jobs simultaneously.

Signing output streams live inside the nested signing log, including lock
acquisition, process start, output, and lock release. The external script runs
with stdin closed so interactive prompts fail visibly instead of hanging the
build. Each signing process has a watchdog timeout of at least 45 minutes.

| Variable | Default | Purpose |
|---|---|---|
| `VELOCITY_SIGN_TIMEOUT_MS` | 45 minutes | Watchdog timeout for a signing process. Set to `0` to disable it. |
| `VELOCITY_SIGN_PROGRESS_INTERVAL_MS` | `30000` | Minimum silence before a "Still waiting" heartbeat, and the minimum interval between heartbeats. Set to `0` to disable heartbeat logging. |
| `VELOCITY_SIGN_POLL_INTERVAL_MS` | `5000` | How often the silence clock is checked internally. Must be less than or equal to `VELOCITY_SIGN_PROGRESS_INTERVAL_MS`; it is clamped automatically. |

Running `./scripts/release.sh --dry-run` with a valid `--sign-script` invokes
the external script in its own dry-run mode (without `--run`) for existing
signable Windows files under `dist/win-unpacked` or `dist/`.

## Releasing

`scripts/release.sh`, run from the repository root, is the supported way to cut
a release:

```bash
./scripts/release.sh <version>
```

It runs the full pipeline:

1. Verifies tooling (Node.js 18 or later, npm, `node_modules`, `git`, `gh` plus
   authentication, and on macOS `dpkg`, `fakeroot`, GNU `ar` for `.deb`) and
   that the working tree is clean — no uncommitted changes apart from
   `package.json`, and no unpushed commits.
2. Validates the requested version against `package.json` and blocks downgrades.
3. Bumps `package.json`.
4. Builds every platform in parallel via `npm run package:all:clean`, or
   sequentially with `--seq`.
5. Commits and pushes the version bump, only when the version changed.
6. Publishes a GitHub release with all `dist/` artifacts and generated notes
   (changelog, artifact table, build environment).

### Options

| Option | Description |
|---|---|
| `<version>` | Release version such as `v1.2.3` or `1.2.3`. Must be greater than or equal to the current `package.json` version. Not required with `--upload-only`. |
| `--dry-run`, `--simulate` | Simulate the whole release without writing files, committing, or publishing. Prints each artifact that would be uploaded with its size, plus a full preview of the release notes. |
| `--re-release` | Republish an already-released version with rebuilt artifacts and refreshed notes. Generates the changelog against the previous good tag, deletes the existing GitHub release and git tag, and recreates them pinned to the current `HEAD`. The clean-tree and version-gate checks still apply. |
| `--seq` | Build platforms sequentially instead of in parallel. Slower, but the output is not interleaved. Not required for external Windows signing, which is serialized separately. |
| `--prepare-only` | Run steps 1–5 (checks, bump, build, commit, push) and exit before touching GitHub. Compatible with `--seq`, `--install-prereqs`, and `--dry-run`. |
| `--upload-only` | Skip straight to publishing: create the GitHub release and upload `dist/` artifacts. Reads the version from `package.json`. Only `gh` is required. Compatible with `--re-release` and `--dry-run`. |
| `--install-prereqs`, `--install-deps` | Auto-install missing build and release prerequisites before the checks run. Combine with `--dry-run` to preview the plan. Signing tools and signing environment variables are never auto-installed. |
| `--sign-script <path>` | External Windows signing script; see [External Windows signing script](#external-windows-signing-script). |
| `--sign-share-dir <UNC>` | Signing share passed through as `--share-dir <UNC>`. Only used with `--sign-script`. |
| `--sign-timeout-minutes <minutes>` | External signing timeout passed through as `--timeout-minutes <minutes>`. Default `20`. |
| `--sign-product-names <names>` | External signing product names passed through as `--product-names <names>`. Defaults to `ArcGIS Velocity Logger`. |
| `--list` | List published GitHub releases as a **TAG · DATE · STATUS · URL** table and exit, alongside the local `package.json` version. Requires an authenticated `gh`. |
| `--limit <n>` | Maximum number of releases shown by `--list`. Default `10`. |
| `--help` | Print usage information and exit. |

Flag order is flexible, and unknown long options are matched against the
supported flags by edit distance to produce a `Did you mean …?` suggestion.

```bash
./scripts/release.sh --dry-run v1.2.3                 # preview before anything real
./scripts/release.sh v1.2.3                           # standard release
./scripts/release.sh --seq v1.2.3                     # sequential build output
./scripts/release.sh --re-release v1.2.3              # recover a broken release
./scripts/release.sh --install-prereqs v1.2.3         # install missing tooling first
./scripts/release.sh --list --limit 5                 # inspect recent releases
```

### Two-phase release

`--prepare-only` and `--upload-only` split the pipeline so artifacts can be
inspected, signed, or moved between machines before publishing:

```bash
./scripts/release.sh --prepare-only v1.2.3
# inspect or sign dist/ artifacts, then:
./scripts/release.sh --upload-only
```

This also covers building on one machine and uploading from another, and
publishing artifacts produced by CI without rebuilding.

> [!WARNING]
> `--prepare-only` and `--upload-only` cannot be combined; the script aborts if
> both are passed. `--upload-only` skips the clean-working-tree and build-tool
> checks, so confirm `gh auth login` has been run and `dist/` holds the expected
> artifacts before using it.

### Manual release

If you need to publish without the script:

```bash
npm run package:all:clean           # or package:seq:clean, or a single platform
gh release create v1.2.3 $(find dist -maxdepth 1 -type f) \
  --title "v1.2.3" --generate-notes
```

The `find` filter avoids uploading unpacked directories.

### Host-OS support matrix

Any host can run the release script, but each host builds only certain targets
natively. macOS is the only host that covers everything.

| Host | `.dmg` | mac `.zip` | Windows `setup.exe`, `portable.exe`, `.zip` | `.AppImage` | `.deb` |
|---|:---:|:---:|:---:|:---:|:---:|
| macOS | Yes | Yes | Yes, unsigned without signing variables | Yes | Yes, with `dpkg`, `fakeroot`, `binutils` |
| Linux | No | No | Yes, unsigned | Yes | Yes |
| Windows | No | No | Yes | Via WSL | Via WSL |

> [!NOTE]
> `.dmg` cannot be cross-built and requires a macOS host, as does notarization
> with `xcrun notarytool`. Windows signing requires `WIN_CSC_LINK` and
> `WIN_CSC_KEY_PASSWORD` regardless of host. The release script uploads whatever
> artifacts actually built and skips missing platforms rather than failing.

### Versioning

Follow [Semantic Versioning](https://semver.org/): patch for fixes, minor for
backward-compatible features, major for breaking changes. Tags are the version
prefixed with `v`, for example `v1.2.3`.

## Release checklist

1. `npm test` passes and `npm run docs:link-check` reports no broken links.
2. Documentation is updated for any behavior, option, or tooltip change.
3. The working tree is clean and all commits are pushed.
4. `npm run prereqs:check:release` passes on the release host.
5. Signing variables are exported if the release must be signed.
6. `./scripts/release.sh --dry-run <version>` shows the expected artifacts and
   release notes.
7. `./scripts/release.sh <version>` completes, and the published release lists
   every expected macOS, Windows, and Linux artifact.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `.deb` is roughly 100 bytes | BSD `ar` was used. Run `brew install dpkg fakeroot binutils` and rebuild. |
| Prerequisite check fails on a fresh machine | Run `npm run setup`, or `npm run prereqs:install:release` for release tooling. |
| Release aborts on a dirty working tree | Commit or revert everything except the `package.json` version bump, and push outstanding commits. |
| Release aborts with a version error | The requested version is lower than `package.json`. Choose a higher version, or use `--re-release` to republish the same one. |
| `gh` errors while publishing | Run `gh auth login`, then resume with `./scripts/release.sh --upload-only`. |
| External signing appears to hang | Check the nested signing log for lock acquisition and heartbeat lines. Tune `VELOCITY_SIGN_PROGRESS_INTERVAL_MS`, or raise `VELOCITY_SIGN_TIMEOUT_MS`. Interactive prompts fail rather than hang because stdin is closed. |
| Windows artifacts are unsigned | Export `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`, or pass `--sign-script` with a readable script path. |
| Gatekeeper or SmartScreen warns on launch | The build is unsigned. See [Code signing](#code-signing). |
| A parallel build's output is unreadable | Rebuild with `npm run package:seq` or release with `--seq`. |

## Related documentation

- [Developer guide](developer-guide.md) — local development, testing, and debugging
- [Command-line reference](command-line.md) — CLI parameters for the packaged app
- [Configuration](configuration.md) — persisted settings and launch configuration
- [Repository overview](../README.md)
