# Documentation

[Repository overview](../README.md#documentation)

This index covers the maintained user, operator, and developer documentation for
ArcGIS Velocity Logger. Start with the repository overview, then choose a guide
by purpose and audience.

## Table of contents

- [Guides](#guides)
- [Configuration templates](#configuration-templates)
- [Documentation maintenance](#documentation-maintenance)
- [Related documentation](#related-documentation)

## Guides

| Icon | Title | Purpose | Audience |
|---|---|---|---|
| 📦 | [Build and release](build-and-release.md) | Covers build prerequisites, local builds, platform packaging, signing, and the release workflow. | Developers |
| ⌨️ | [Command-line reference](command-line.md) | Lists every CLI parameter, its default, and its help layouts. | Users and developers |
| 🎚 | [Connection presets](connection-presets.md) | Documents the paired Logger and Simulator presets, what they pre-fill, and the progressive-disclosure layout. | Users and developers |
| ▤ | [Connection summary and protocol settings](connection-summary.md) | Documents the Protocol Settings dialog, its sections, warning alert, and read-only summary. | Users and developers |
| ⚙️ | [Configuration](configuration.md) | Covers persisted settings, appearance, and launch configuration files. | Users and developers |
| 🛠️ | [Developer guide](developer-guide.md) | Covers repository structure, local development, testing, debugging, and extension patterns. | Developers |
| 🔌 | [gRPC transport](grpc.md) | Documents gRPC modes, serialization, TLS, RPC behavior, and metadata. | Users and developers |
| 🖥️ | [Headless mode](headless.md) | Explains no-UI capture, output formats, completion files, and automation. | Users and developers |
| 🌐 | [HTTP transport](http.md) | Documents HTTP and HTTPS modes, formats, paths, TLS, and metadata. | Users and developers |
| ⌘ | [Keyboard shortcuts](keyboard-shortcuts.md) | Lists global, dialog, context-menu, and navigation shortcuts. | Users |
| 🔐 | [TLS and SSL security](tls.md) | Explains certificates, trust stores, mTLS, self-signed TLS, and protocol settings. | Users and developers |
| 🔑 | [ArcGIS Velocity login](velocity-login.md) | Explains sign-in, output selection, token handling, and auto-configuration. | Users |
| 🔄 | [WebSocket transport](websocket.md) | Documents WebSocket modes, formats, TLS, subscriptions, and headers. | Users and developers |
| 💬 | [XMPP transport](xmpp.md) | Documents receive-oriented XMPP, STARTTLS, Direct and MUC delivery, controls, and ArcGIS mapping. | Users and developers |

## Configuration templates

| File | Purpose |
|---|---|
| [`launch-config.sample.json`](examples/launch-config.sample.json) | Provides a generic headless capture template. |
| [`launch-config.server.sample.json`](examples/launch-config.server.sample.json) | Starts a bounded server-mode capture. |
| [`launch-config.client.sample.json`](examples/launch-config.client.sample.json) | Connects as a client and writes JSON Lines output. |
| [`launch-config.xmpp.sample.json`](examples/launch-config.xmpp.sample.json) | Starts the receive-oriented XMPP server without storing its external password. |

Copy a template outside the repository before adding credentials or
environment-specific paths. See the [configuration guide](configuration.md) for
how launch configuration is merged with command-line parameters.

## Documentation maintenance

Documentation describes current behavior and the tasks a reader can perform.
Historical narratives, release chronologies, and duplicate summaries are not
maintained guides. Keep each topic in the guide that owns it:

| Guide | Owns |
|---|---|
| Protocol guides (gRPC, HTTP, WebSocket, XMPP) | Transport behavior, UI controls, exact tooltip strings, and transport troubleshooting. |
| [Connection presets](connection-presets.md) | The shared Logger/Simulator preset contract and preset field values. |
| [Connection summary and protocol settings](connection-summary.md) | The Protocol Settings dialog, its sections and editing model, the connection summary row schema, and secret redaction. |
| [TLS and SSL security](tls.md) | Shared certificate, trust-store, and mTLS concepts referenced by every transport. |
| [Command-line reference](command-line.md) | The complete option reference, defaults, and help layouts. |
| [Headless mode](headless.md) | No-UI capture workflows, stop conditions, and automation. |
| [Configuration](configuration.md) | Persisted settings and launch configuration files. |
| [Developer guide](developer-guide.md) | Local development, testing, debugging, and extension patterns. |
| [Build and release](build-and-release.md) | Packaging, signing, and publishing releases. |

New maintained guides belong in `docs/`, use lowercase kebab-case filenames,
follow the shared guide structure in `AGENTS.md`, and require entries here and
in the repository catalog. Internal links use relative paths without `./`, and
every code fence includes a language.

## Related documentation

- [Repository overview](../README.md)
- [Contribution and agent guidance](../AGENTS.md)
