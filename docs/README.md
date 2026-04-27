# Documentation

This folder contains all technical and user-facing documentation for the ArcGIS Velocity Logger. Each guide is self-contained and cross-linked where relevant.

## Guides

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design: process topology, component responsibilities, IPC communication, headless execution path, and security model |
| [BUILD.md](./BUILD.md) | All build and packaging scripts — per-platform builds, sequential and parallel multi-platform builds, compression options, output artifacts, and code-signing notes |
| [COMMAND-LINE.md](./COMMAND-LINE.md) | Complete CLI parameter reference: all parameters, supported values, defaults, required/optional rules, help layouts, and usage examples |
| [CONFIG.md](./CONFIG.md) | Configuration file format, all settings, themes, fonts, and platform-specific storage locations |
| [DEBUGGING.md](./DEBUGGING.md) | Debug commands, Chrome DevTools and VSCode setup, headless mode debugging, common issues, and production log file locations |
| [DEVELOPMENT-SUMMARY.md](./DEVELOPMENT-SUMMARY.md) | Technical implementation details, recent changes, and development decisions |
| [DOCUMENTATION.md](./DOCUMENTATION.md) | Full documentation index with audience classification, maintenance schedule, and contribution guidelines |
| [GRPC.md](./GRPC.md) | gRPC transport: modes (client/server), serialization formats (Protobuf, Kryo, Text), TLS, and metadata |
| [HEADLESS.md](./HEADLESS.md) | No-UI capture mode: running headless sessions, all headless-specific parameters, config file workflow, output formats, and the `doneFile` artifact |
| [KEYBOARD-SHORTCUTS.md](./KEYBOARD-SHORTCUTS.md) | All keyboard shortcuts, context menu reference, and in-app Command Line Interface dialog shortcuts |
| [RELEASE-NOTES.md](./RELEASE-NOTES.md) | User-facing features, changes, and fixes by release |
| [RELEASE.md](./RELEASE.md) | Release process: GitHub Actions workflow, version tagging, and code signing for macOS, Windows, and Linux |
| [TESTING.md](./TESTING.md) | Test commands, suite descriptions, manual smoke tests, and troubleshooting |
| [THEME-REFACTOR-SUMMARY.md](./THEME-REFACTOR-SUMMARY.md) | Details of the theme system refactoring: per-file CSS, dynamic loader, and migration notes |
| [WHY-ELECTRON.md](./WHY-ELECTRON.md) | Rationale for choosing Electron: framework comparison, packaging overview, and trade-off analysis |

## Config Templates

| File | Purpose |
|------|---------|
| [`launch-config.sample.json`](./launch-config.sample.json) | Generic headless session template |
| [`launch-config.server.sample.json`](./launch-config.server.sample.json) | Server-mode headless template |
| [`launch-config.client.sample.json`](./launch-config.client.sample.json) | Client-mode headless template |

---

Back to project root: [README.md](../README.md)
