# Installing and running the application

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

This guide explains how users install and start ArcGIS Velocity Logger from a
release package on macOS, Windows, or Linux. It also covers first-launch
security warnings, deployed log locations, and startup troubleshooting.

Release packages include the application runtime; Node.js and npm are not
required to run them.

## Table of contents

- [Choose a package](#choose-a-package)
- [Install and launch](#install-and-launch)
- [Find diagnostic logs](#find-diagnostic-logs)
- [Troubleshooting](#troubleshooting)
- [Related documentation](#related-documentation)

## Choose a package

Download packages only from the repository's official GitHub release page.

| Platform | Package | Use |
|---|---|---|
| macOS | `arcgis-velocity-logger-<version>-<edition>-mac-<arch>.dmg` | Drag-to-Applications installation. |
| macOS | `arcgis-velocity-logger-<version>-<edition>-mac-<arch>.zip` | Extract the complete application bundle. |
| Windows | `arcgis-velocity-logger-<version>-<edition>-win-<arch>-setup.exe` | NSIS installation with shortcuts and an uninstaller. |
| Windows | `arcgis-velocity-logger-<version>-<edition>-win-<arch>-portable.exe` | Self-extracting, no-install launch. |
| Windows | `arcgis-velocity-logger-<version>-<edition>-win-<arch>.zip` | Extract the application and all supporting files. |
| Linux | `arcgis-velocity-logger-<version>-<edition>-linux-<arch>.AppImage` | Portable launch on a compatible Linux distribution. |
| Debian and Ubuntu | `arcgis-velocity-logger-<version>-<edition>-linux-<arch>.deb` | Installation through `apt` or `dpkg`. |

`<edition>` is `standalone` or `compact`; `<arch>` is `x64` or `arm64`.
Download only a format and architecture actually listed in the release.
Release maintainers verify package sizes and SHA-256 checksums using retained
local target manifests; those manifests are not application downloads.
Previously published asset names are unchanged. **Standalone** uses Electron
and bundles Chromium; **Compact** uses Tauri with WKWebView on macOS, WebView2
on Windows, and WebKitGTK on Linux. Compact includes the pinned Node runtime and production transport
dependencies, not Electron.
For why each edition uses its runtime and how the application logic is shared,
see [Desktop runtime choices](developer-guide.md#desktop-runtime-choices).

Windows Tauri portable EXE and ZIP packages require an installed WebView2
runtime; the portable launcher does not install it or register an application.
Linux Tauri requires WebKitGTK 4.1 and the native libraries for the target
distribution. An AppImage is not a guarantee of compatibility with every Linux
release. See the [native prerequisites](build-and-release.md#prerequisites).
Compact Linux packages built with the local container target Ubuntu 24.04 LTS
(glibc 2.39). A DEB is a package format, not an Ubuntu-only or Debian-only
compatibility guarantee: the CPU architecture, required GLIBC/GLIBCXX symbols,
and distribution package dependencies must all match. The DEB declares
`libc6 (>= 2.39)` and `libstdc++6 (>= 12)` along with native desktop dependencies.
Debian 12/glibc 2.36 and Ubuntu 22.04/glibc 2.35 are below that baseline; Alpine's
musl environment is not a supported substitute. Standalone has its own Electron requirements.

ARM64 DEB dependency installation and native headless DEB/AppImage capture
have been verified on Ubuntu 24.04 LTS and Debian 13 (glibc 2.41). These checks
cover CLI behavior and capture completion, not every desktop GUI workflow.
Other distributions and architectures still need their own validation.
Compact is not always the smaller download: its Linux AppImage bundles required
GTK/WebKit libraries for portability and can be larger than Standalone.
The DEB instead declares distribution dependencies that must be installed.
AppImage still relies on the host's compatible libc and desktop services; it
does not make these packages universally self-contained.

Compact's Linux native dialogs require Zenity and a supported XDG Desktop
Portal backend provided by the desktop environment, with `libdbus-1` available.
Use the GTK, GNOME, or KDE portal backend appropriate to the desktop; a wlroots
backend alone does not provide the file chooser API. AppImage users must install
these host prerequisites too: the AppImage does not install or launch portal
services. Missing Zenity is reported as a dialog error, not a user cancellation.
Headless capture does not require dialog tools or a running desktop.

Official distribution WebKitGTK packages may retain known security advisories
until supported updates are published. Use current distribution updates and
review unresolved findings; the application does not build a private WebKit
fork or mix libraries from another distribution. DEB installations receive
system-library fixes through distribution updates; AppImages need to be rebuilt
to refresh the GTK/WebKit libraries bundled in them.

## Install and launch

### macOS

Standalone requires macOS 13 or later with Electron 44. Compact requires macOS
13.5 or later for its bundled Node.js 24 runtime. Choose an edition and
architecture compatible with the target Mac.

To install from a DMG:

1. Download the DMG from the official release page;
2. verify the GitHub-published SHA-256 digest if your workflow requires an
   integrity check;
3. open the DMG;
4. drag the contained application bundle to `/Applications`; and
5. open the application from `/Applications`.

Alternatively, extract the macOS ZIP and move its application bundle into
`/Applications`. Quit any running copy before replacing it, then launch the
installed application rather than a copy inside the mounted DMG.
The Compact bundle is `ArcGIS Velocity Logger Compact.app`, with a separate
application identifier and settings directory, so it can coexist with Electron.
The Standalone bundle is `ArcGIS Velocity Logger Standalone.app`.

To check the downloaded DMG, set `VERSION` to the version you downloaded
(for example, `1.0.6`):

```bash
VERSION=x.y.z
EDITION=compact
ARCH=arm64
hdiutil verify \
  "$HOME/Downloads/arcgis-velocity-logger-${VERSION}-${EDITION}-mac-${ARCH}.dmg"
shasum -a 256 \
  "$HOME/Downloads/arcgis-velocity-logger-${VERSION}-${EDITION}-mac-${ARCH}.dmg"
```

`hdiutil verify` checks the disk image's internal integrity. Compare the
`shasum` value with the asset's SHA-256 digest on GitHub; neither check
establishes Apple signing or notarization.

#### Unsigned package workaround

Browser downloads can carry a quarantine attribute. Without Developer ID
signing and notarization, Gatekeeper may block the application or report it as
damaged even when its download is intact. An ad hoc bundle signature does not
provide Developer ID trust or notarization.

Try opening the installed application normally first. Only if Gatekeeper
blocks a trusted official package whose checksum you have verified, quit the
application and use this workaround:

```bash
xattr -dr com.apple.quarantine \
  "/Applications/ArcGIS Velocity Logger Compact.app"

open "/Applications/ArcGIS Velocity Logger Compact.app"
```

Afterward, launch this installed copy normally from Finder. Quarantine removal
is not a command to repeat on every launch; a replacement download may be
quarantined again. No manual log-directory creation or `logFile` argument is
required. See [Find diagnostic logs](#find-diagnostic-logs).

> [!WARNING]
> Removing quarantine bypasses a macOS security control. Use this workaround
> only after confirming that the application came from the official Esri
> release page and its checksum matches the published digest. This does not
> notarize the application. Do not use `sudo` or disable Gatekeeper globally.

### Windows

Run the setup executable for a standard installation, or run the portable
executable directly. For the Windows ZIP, extract the entire archive into a
writable folder and run `VelocityLogger.exe` there; keep its supporting files
together. Windows can show a SmartScreen warning when a package is
unsigned or its signing certificate has not established reputation. Verify the
publisher and obtain packages only from the official release page.

### Linux

Run these commands from the download directory, replacing `x.y.z` with the
downloaded version. The package architecture must match your system.

For an AppImage:

```bash
VERSION=x.y.z
EDITION=compact
ARCH=x64
chmod +x "arcgis-velocity-logger-${VERSION}-${EDITION}-linux-${ARCH}.AppImage"
"./arcgis-velocity-logger-${VERSION}-${EDITION}-linux-${ARCH}.AppImage"
```

For Debian or Ubuntu:

```bash
VERSION=x.y.z
EDITION=compact
ARCH=x64
sudo apt install "./arcgis-velocity-logger-${VERSION}-${EDITION}-linux-${ARCH}.deb"
```

## Find diagnostic logs

Packaged applications automatically create the diagnostic log directory and
write timestamped files in both UI and headless modes:

| Platform | Default directory |
|---|---|
| macOS | `~/Library/Logs/arcgis-velocity-logger/` |
| Windows | `%APPDATA%\arcgis-velocity-logger\logs\` |
| Linux | `~/.config/arcgis-velocity-logger/logs/` |

For Tauri, replace the `arcgis-velocity-logger` directory component with
`arcgis-velocity-logger-tauri`. Saved UI settings and remembered sign-in
preferences are also separate; see [configuration file locations](configuration.md#file-location).

For example, the same timestamped log is written as:

```text
macOS:  /Users/alice/Library/Logs/arcgis-velocity-logger/velocity-logger-20260922T224947.log
Windows: C:\Users\Alice\AppData\Roaming\arcgis-velocity-logger\logs\velocity-logger-20260922T224947.log
Linux:  /home/alice/.config/arcgis-velocity-logger/logs/velocity-logger-20260922T224947.log
```

This behavior applies to every packaged platform, not only macOS. Packaged
applications do not depend on the launcher's working directory. An explicit
`logFile=<path>` argument always takes precedence.
Relative overrides resolve against the process working directory; use an
absolute path when launching through a desktop shortcut. On Linux, the
application-data base follows `XDG_CONFIG_HOME` when set; the table shows the
usual default.

## Troubleshooting

| Symptom | Cause and action |
|---|---|
| macOS says the application is damaged. | Check disk-image integrity and the published SHA-256 digest first. Do not bypass a checksum mismatch. For an intact, trusted official package blocked by Gatekeeper, see [Unsigned package workaround](#unsigned-package-workaround). |
| macOS shows `ENOENT: no such file or directory, mkdir '/logs'`. | Install v1.0.6 or later and launch the copy in `/Applications`. Default logs no longer depend on Finder's working directory. If the error persists, check for an explicit `logFile` override; do not create `/logs` or run the app with `sudo`. |
| macOS says the application is unsupported. | Check both the package architecture and the runtime's supported macOS version. Choose `arm64` for Apple silicon or `x64` for an Intel Mac. |
| Tauri reports that its bundled backend is missing. | Extract or reinstall the complete package. Do not copy just the executable or remove `node`, `backend`, or application resources. |
| Windows Tauri portable does not open a window. | Confirm WebView2 is installed and the package architecture matches the machine. |
| Windows shows a SmartScreen warning. | Confirm the package came from the official release page and verify its publisher before continuing. |
| Linux cannot execute the AppImage. | Add execute permission with `chmod +x` and confirm the distribution supports AppImage. |
| The application starts but cannot connect. | Open [Protocol settings and presets](connection-presets.md), then use the guide for the selected transport. |

## Related documentation

| Guide | Purpose |
|---|---|
| [Configuration](configuration.md) | Persisted settings and launch configuration files. |
| [Command-line reference](command-line.md) | Parameters including `logFile` and `logLevel`. |
| [Protocol settings and presets](connection-presets.md) | Configure a connection after installation. |
| [Build and release](build-and-release.md) | Build, sign, notarize, and publish packages. |
| [Developer guide](developer-guide.md) | Logging implementation, development, and tests. |
