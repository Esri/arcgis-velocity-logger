# Installing and running the application

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

This guide covers release package selection, installation, first launch, logs,
and startup troubleshooting for ArcGIS Velocity Logger. Release packages include
Electron and do not require a separate Node.js installation.

## Table of contents

- [Choose a package](#choose-a-package)
- [Install and launch](#install-and-launch)
- [Find diagnostic logs](#find-diagnostic-logs)
- [Troubleshooting](#troubleshooting)
- [Related documentation](#related-documentation)

## Choose a package

Download only from the repository's official GitHub release page. Match the CPU:
`arm64` for Apple silicon or ARM Linux, `x64` for Intel/AMD. Both are 64-bit;
only combinations actually present in the release are supported.

| Platform | Filename suffix | Use |
|---|---|---|
| macOS | `-mac-arm64.dmg` or `-mac-arm64.zip` | Install or extract the complete application bundle. |
| Windows | `-win-x64-setup.exe` | Install with shortcuts and an uninstaller. |
| Windows | `-win-x64-portable.exe` | Self-extracting, no-install launch. |
| Windows | `-win-x64.zip` | Extract all application and supporting files together. |
| Linux | `-linux-<arch>.deb` | Install with `apt`/`dpkg`, resolving dependencies on Debian/Ubuntu. |
| Linux | `-linux-<arch>.AppImage` | Portable executable containing the app and many dependencies. |

Names begin with `arcgis-velocity-logger-<version>`. Maintainers keep target
manifests for checksum and provenance validation; manifests are not application
downloads.

Linux support targets Ubuntu 24.04 LTS and Debian 13 on `x64` and `arm64`,
for GUI and no-display headless operation. GUI use requires a working desktop
session and the native libraries declared by the package. Headless execution
uses the bundled Node runtime before Chromium starts; see
[headless launch patterns](headless.md#launch-patterns).

A DEB installs into the system, declares dependencies, and integrates with the
package manager. An AppImage needs executable permission and a compatible
host; it does not install dependencies or make arbitrary Linux ABIs compatible.
Some systems require FUSE or the extraction fallback below. Neither format
supports Alpine/musl. `.deb` is a package format, while Debian and Ubuntu are
distributions; the suffix alone does not establish OS or ABI compatibility.

The supported matrix is deliberately bounded to maintained glibc-based
distributions aligned with official Electron binaries. Ubuntu 24.04 LTS and
Debian 13 provide APT dependency management and desktop integration while
covering both desktop and server use. The operating system running ArcGIS
Velocity or another network service need not match the Logger's operating
system.

Native Alpine 3.23.7 is unsupported for **both GUI and headless use**. Alpine
uses musl, while Electron and its bundled Node mode require compatible glibc.
Avoiding Chromium startup does not change that native ABI requirement.
Remote X11 supplies a display, not a libc compatibility layer. AppImage or
renaming a package to APK does not bridge the ABI either. Do not mix another
distribution's libraries to bypass this limit; no separate native-Alpine CLI
distribution is currently provided.

## Install and launch

### macOS

macOS 13 or later is required. Open the DMG and drag `VelocityLogger.app` into
`/Applications`, or extract the ZIP and move the complete application bundle
there. Quit any running copy before replacing it. Launch the installed copy,
not the one inside a mounted DMG.

```bash
VERSION=1.1.1
hdiutil verify "$HOME/Downloads/arcgis-velocity-logger-${VERSION}-mac-arm64.dmg"
shasum -a 256 "$HOME/Downloads/arcgis-velocity-logger-${VERSION}-mac-arm64.dmg"
```

Compare the SHA-256 with GitHub's published asset digest. Disk-image integrity
and checksums do not establish Developer ID signing or notarization.

#### Unsigned package workaround

If Gatekeeper blocks an intact, trusted official download, first verify its
origin and checksum. Only then quit the application and remove its quarantine:

```bash
xattr -dr com.apple.quarantine "/Applications/VelocityLogger.app"
open "/Applications/VelocityLogger.app"
```

> [!WARNING]
> Removing quarantine bypasses a macOS security control. Ad-hoc signing is not
> Developer ID notarization. Do not use this workaround for an untrusted
> download, use `sudo`, or disable Gatekeeper globally.

### Windows

Run the setup executable for installation or the portable executable for
no-install use. For ZIP packages, extract everything to a writable folder and
run `VelocityLogger.exe`; do not separate the executable from its resources.
Check the publisher if SmartScreen displays a warning. A signed package can
still need to establish SmartScreen reputation.

### Linux

Choose `ARCH=arm64` or `ARCH=x64` to match the machine.

```bash
VERSION=1.1.1
ARCH=x64
sudo apt install "./arcgis-velocity-logger-${VERSION}-linux-${ARCH}.deb"
```

For portable use:

```bash
VERSION=1.1.1
ARCH=x64
chmod +x "arcgis-velocity-logger-${VERSION}-linux-${ARCH}.AppImage"
"./arcgis-velocity-logger-${VERSION}-linux-${ARCH}.AppImage"
```

When FUSE is unavailable, use the AppImage's extraction-and-run facility:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./arcgis-velocity-logger-1.1.1-linux-x64.AppImage \
  runMode=headless port=5565 maxLogCount=5 outputFile=./capture.txt
```

The DEB's executable is `/opt/ArcGIS Velocity Logger/VelocityLogger`.
Always use this launcher or the AppImage for headless operation, not the
internal native `.bin` file. No display server or Xvfb is required for help,
configuration errors, or headless capture.

Run the GUI as a normal user in a supported desktop session. The upstream
AppImage launcher may add `--no-sandbox` when its user-namespace probe fails,
including in restricted containers. A window opening under those conditions
does not prove sandbox-enabled GUI operation. Do not treat rootless container
launch or a no-display capture test as desktop sandbox validation.

## Find diagnostic logs

Packaged applications create timestamped logs without depending on the launch
directory:

| Platform | Default directory |
|---|---|
| macOS | `~/Library/Logs/arcgis-velocity-logger/` |
| Windows | `%APPDATA%\arcgis-velocity-logger\logs\` |
| Linux | `~/.config/arcgis-velocity-logger/logs/` |

Linux follows `XDG_CONFIG_HOME` when set. An explicit `logFile=<path>` overrides
the default; relative overrides resolve against the process working directory.
Use absolute paths for scheduled jobs and shortcuts. Saved settings retain the
canonical [configuration location](configuration.md#file-location).

## Troubleshooting

| Symptom | Action |
|---|---|
| macOS reports damage or blocks launch | Verify the asset checksum first; see [Unsigned package workaround](#unsigned-package-workaround) only for trusted, intact downloads. |
| macOS reports an unsupported application | Check macOS version and CPU architecture. |
| Windows shows a SmartScreen warning | Verify origin and publisher; do not assume signing proves runtime behavior. |
| Linux cannot execute the AppImage | Check architecture, execute permission, supported distribution, and FUSE/extraction mode. |
| Linux headless reports a missing display | Use the packaged launcher, not the native `.bin` executable. |
| Linux GUI cannot start | Run inside a supported desktop session; resolve native dependencies with the distribution package manager. |
| The application starts but cannot connect | Review [connection presets](connection-presets.md) and the selected transport guide. |

## Related documentation

- [Headless mode](headless.md)
- [Configuration](configuration.md)
- [Command-line reference](command-line.md)
- [Build and release](build-and-release.md)
