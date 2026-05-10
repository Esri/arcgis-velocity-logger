# Velocity Login & Output Picker

> **Audience:** Users, integrators  
> **Feature:** ArcGIS Velocity sign-in dialog, output browser, and token-based authentication

## Overview

The **🔑 Sign In to ArcGIS Velocity** button in the toolbar opens a modal dialog that lets you authenticate against your ArcGIS portal, browse available Velocity outputs by type, preview output details, and auto-populate the Logger's connection settings with a single click.

## Workflow

1. Click **🔑** in the toolbar.
2. Enter your Portal URL (default: `https://velocitydemo.maps.arcgis.com`), username, and password.
3. Click **Sign In** — the dialog fetches your organization's Velocity outputs.
4. Use the **Type** dropdown to filter outputs (gRPC, HTTP, WebSocket, TCP, etc.).
5. Select an output to view its details (URL, auth type, format, schema fields).
6. Click **Apply** — the main window auto-configures: connection mode, host, port, path, TLS, and format.
7. Check the footer **🔑 Token On / Token Off** badge. Click it to control whether the Velocity token is sent with new client connections.
8. Click **Connect** as usual to start receiving data.

## Authentication

| Output Auth Type | How the Logger Authenticates |
|---|---|
| `arcgis` (token) | `Authorization: Bearer <token>` header/metadata — used for gRPC, HTTP, WebSocket |
| `basic` | `Authorization: Basic <base64(user:pass)>` header — used for HTTP outputs configured with basic auth |
| `none` | No authentication header is sent (TCP, UDP) |

### Token Refresh and Status

- Tokens refresh at **80% of lifetime** and retry with exponential backoff on failure.
- The footer auth badge shows whether a token is available and sent with new gRPC, HTTP, and WebSocket client connections.
- Token refresh/toggle notices go to the **Activity Strip**; failures still appear in logs.
- The Activity Strip is in the main layout, pinned by default, and filters to connection activity by default. Use its filter toggle for all activity, arrows for history, pin for auto-hide, and status text click for full details/time.
- Raw bearer tokens are never shown; tooltips show safe metadata only.

### Token Sending Toggle

The login dialog supports two usage modes:

1. **Use Token Only** — sign in and use the Velocity token with your own manually configured connection settings. The footer badge defaults to **🔑 Token On**.
2. **Apply an Output** — sign in, select an output, and apply its connection settings. Outputs with `arcgis`, `token`, `bearer`, OAuth, or unspecified auth on token-capable transports default to **🔑 Token On**. Outputs with `basic`, `none`, TCP, or unsupported auth default to **◇ Token Off**.

Click the footer badge to toggle token sending for **new** client connections. Active gRPC and HTTP client transports hot-swap the refreshed token when possible; WebSocket upgrade headers are fixed at connect time, so reconnect after changing the toggle.

The **🔒 TLS badge** is intentionally separate: it describes encryption and certificate trust only. The **🔑 auth badge** describes token availability and whether the token is sent.

## OAuth 2.0

The **OAuth 2.0** tab supports client-credentials flow (Client ID + Client Secret). This is currently only supported by ArcGIS Velocity for HTTP Poller outputs. The Apply button is disabled with a tooltip when the selected output type does not support OAuth.

## Unsupported Output Types

Output types not yet supported by the Logger are displayed with a **⚠** prefix and muted styling in the dropdowns. The **Apply** button is disabled for these types. Use the **Supported / All** radio toggle in the picker header to control their visibility. The default is **Supported** (unsupported types are hidden on first open).

## Output Type Reference

Each output type is visually identified in the picker dropdowns and info panel by a unique Unicode icon and a colour that matches the protocol's brand or role. The icon appears as a prefix character in the dropdown option text, and in the info panel's **Type** row as a coloured badge.

| Icon | Output Type | Colour | Supported by Logger |
|------|-------------|--------|---------------------|
| ⬡ (`\u2B21`) | `grpc` — gRPC | `#7c4dff` (purple) | ✅ Yes |
| ■ (`\u25A0`) | `http` — HTTP | `#0097a7` (teal) | ✅ Yes |
| ◆ (`\u25C6`) | `websocket` — WebSocket | `#00897b` (green) | ✅ Yes |
| ◗ (`\u25D7`) | `tcp` — TCP | `#546e7a` (slate) | ✅ Yes |
| ▲ (`\u25B2`) | `kafka` — Kafka | `#e53935` (red) | ❌ Not yet |
| ◎ (`\u25CE`) | `mqtt` — MQTT | `#f57c00` (orange) | ❌ Not yet |
| ▣ (`\u25A3`) | `file` — File | `#8d6e63` (brown) | ❌ Not yet |
| ❖ (`\u2756`) | `azure-event-hub` — Azure Event Hub | `#0078d4` (Microsoft blue) | ❌ Not yet |
| ❖ (`\u2756`) | `azure-service-bus` — Azure Service Bus | `#0062ad` (dark blue) | ❌ Not yet |
| ○ (`\u25EF`) | *(unknown type)* | `#888` (grey) | ❌ Not yet |

> The icon characters are plain Unicode geometric shapes — no emoji — ensuring consistent rendering across platforms and OS native select dropdowns.

## Scope Toggle

The **My Outputs / ORG Outputs** segmented control in the sign-in row lets you switch between:

- **My Outputs** — returns only outputs owned by the signed-in user (`/iot/outputs`).
- **ORG Outputs** (default) — adds `view=admin` to the API request to return all outputs in the organization. Requires the signed-in account to have administrator privileges.

Switching scope re-fetches from the API. The **⟳ Refresh** button re-requests the current scope without changing scope.

## Dialog Size Persistence

The Velocity Login dialog opens at **590 x 840** pixels by default. After resizing or moving the window, its size and position are automatically saved to `dialogSizes.velocityLogin` in `config.json` and restored on the next open. To reset to the default size, remove the `velocityLogin` key from `dialogSizes` in `config.json`.

## UI Controls

Tooltips use the app's custom renderer with theme-aware icons/colors. Tooltip text is plain text only.

| Control | Tooltip / Behaviour |
|---|---|
| 🔑 button | "Sign In to ArcGIS Velocity — browse and apply output connection settings" |
| Portal URL | "ArcGIS Enterprise or ArcGIS Online portal URL" |
| Username | "ArcGIS account username" |
| Password | "ArcGIS account password" |
| Show / Hide password | SVG eye icon toggles password field between masked and visible. |
| Remember me | "Remember portal URL and username for next session" |
| Sign In | "Authenticate and retrieve outputs from your Velocity organization" |
| My Outputs | "Show only outputs you own" |
| ORG Outputs | "Show all outputs in your organization (requires admin privileges)" — adds `view=admin` (default active scope) |
| ⟳ Refresh | "Refresh: re-request the list of outputs from Velocity" — re-fetches current scope |
| Supported | Show only output types supported by the Logger (default active filter) |
| All | Show all output types, including those not yet supported by the Logger |
| Type dropdown | Each option is prefixed with a type icon. Unsupported types show ⚠ prefix. |
| Output dropdown | Each option is prefixed with a type icon. Unsupported items show ⚠ prefix and italic muted styling. |
| Use Token Only | "Use Velocity token for authentication only — keep your own connection settings in the main window" |
| Apply | "Apply the selected output connection settings to the main window." Disabled for unsupported types. |
| Close | "Close this dialog without applying." |
| Footer auth badge | Shows token on/off/error state, selected output, auth type, expiry, and next toggle action. |
| Footer TLS badge | Mirrors the selected protocol's TLS checkbox while disconnected; connected tooltips describe encryption and certificate trust. |
| Activity Strip | Shows operational status, time, history, connection-only/all-activity filter, pin, and full-detail click tooltip. |

## Credential Storage

When **Remember me** is checked, the portal URL and username are stored in the app's user data directory (`velocity-credentials.json`). The password is never persisted to disk.

