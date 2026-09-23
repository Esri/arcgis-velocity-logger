# ArcGIS Velocity sign-in and output picker

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

The **Sign In to ArcGIS Velocity** toolbar button opens a dialog for Portal
authentication, output browsing, and applying supported connection settings.
This guide covers the workflow, controls, tooltips, and credential storage
for users and integrators with an ArcGIS Online or ArcGIS Enterprise account
authorized to access ArcGIS Velocity.

Use a build whose sign-in dialog includes the **Velocity endpoint** section.

## Table of contents

- [Workflow](#workflow)
- [Authentication](#authentication)
- [OAuth 2.0](#oauth-20)
- [Unsupported output types](#unsupported-output-types)
- [Output type reference](#output-type-reference)
- [Scope toggle](#scope-toggle)
- [Dialog size persistence](#dialog-size-persistence)
- [UI controls](#ui-controls)
- [Tooltip reference](#tooltip-reference)
- [Credential storage](#credential-storage)
- [Related documentation](#related-documentation)

## Workflow

To configure a supported receiving connection:

1. Click **Sign In to ArcGIS Velocity** in the toolbar;
2. enter your complete Portal URL (default:
   `https://velocitydemo.maps.arcgis.com`), username, and password. Preserve
   any published context, for example `https://portal.example.com/portal`;
3. leave **Velocity endpoint** on **Automatic**, or choose **Custom public
   URL** and enter the complete public API base. See
   [Choose the Velocity endpoint](velocity-rest-api.md#choose-the-velocity-endpoint);
4. click **Sign In** and review **Effective URL** and the status message;
5. use **Server** when multiple ArcGIS Velocity servers are available, or
   leave **All Velocity servers** selected to aggregate outputs. Use
   **Type** to filter outputs, then select an output to retrieve any required
   connection details;
6. while disconnected, click **Apply** to populate validated connection
   settings. This does not connect or start capture;
7. check the footer **Token On / Token Off** badge and review the settings;
8. click **Connect** to receive data.

Disconnect before using **Apply** or **Use Token Only**; both actions are
blocked while a transport is connecting or connected. Pending endpoint edits
disable output application until **Apply URL** succeeds.
Changing **Portal URL** requires a new sign-in. A successful Portal sign-in
can still leave endpoint discovery or output listing unavailable; the error
remains visible, and **Use Token Only** is available for a destination that
accepts that Portal token.

The picker shows each output's source server and analytic identity. The
detail table shows **Source server**, **Analytic**, **Analytic ID**, and
**Output ID**. The source server's name and ID are separate from the raw
output ID. Unavailable servers produce an explicit partial-results warning
without hiding outputs from healthy servers.

## Authentication

| Output authentication | Behavior |
|---|---|
| ArcGIS token | Sends bearer authentication through a header or gRPC metadata on token-capable client transports. |
| Basic authentication | Disables token sending; Apply does not recover saved basic-auth credentials. |
| None | Disables token sending. |

### Token refresh

Tokens refresh at **80% of lifetime** and retry with exponential backoff on
failure. The footer auth badge shows whether a token is available and sent
with new gRPC, HTTP, and WebSocket client connections. Raw bearer tokens are
never shown; tooltips show safe metadata only.

### Token sending toggle

The dialog supports two usage modes:

1. **Use Token Only** signs in without changing the manually configured
   transport fields and defaults to **Token On**;
2. **Apply** selects a supported output. ArcGIS, token, bearer, OAuth, and
   unspecified authentication on token-capable transports default to
   **Token On**. Basic, none, and unsupported authentication default to
   **Token Off**.

Applied server roles default to **Token Off** because they receive connections
rather than authenticate to a remote endpoint. Selecting an HTTP output does
not send the Portal token to its configured destination.

Click the footer badge to change token sending for new client connections.
Active gRPC and HTTP clients hot-swap refreshed tokens when possible.
WebSocket upgrade headers are fixed at connect time; reconnect after changing
the toggle. The TLS badge describes encryption and trust, not authentication.
See [TLS and SSL security](tls.md) for that separate surface.

## OAuth 2.0

The **OAuth 2.0** tab supports client-credentials flow using **Client ID** and
**Client Secret**. Portal and endpoint selection are shared with the password
tab. The application's permissions and the deployment determine which
resources its token can access. Signing in does not grant output access or
supply missing transport capabilities or endpoint settings.

## Unsupported output types

Unsupported types have a **⚠** prefix and muted styling. **Apply** is disabled
for these items. **Supported** is the default filter; **All** includes
unsupported types. TCP and UDP output connectors map to the opposite Logger
role, and an HTTP destination maps to an HTTP Server when its settings are
valid. Stream Layers and XMPP retain their existing receiving workflows.
The **Availability** row and disabled Apply tooltip explain why an output
cannot be used.

If the list contains only unsupported destinations, the status reports the
actual total and prompts you to choose **All** beside **Supported**; an empty
supported filter does not mean that the servers returned no outputs.
Stream Layer entries requiring details remain selectable, but Apply stays
disabled until the subscription details have been resolved successfully.

Configured outputs belong to analytics. Their identity combines source server,
analytic kind, analytic ID, and output ID; labels and raw output IDs can repeat.
The `/outputs` connector catalog describes connector definitions, not running
subscriptions. See [Management resources](velocity-rest-api.md#management-resources).

Missing or invalid advertised endpoint properties are errors, not a reason
to reuse the previous output's fields. For endpoint mapping rules, see
[Apply connection settings](velocity-rest-api.md#apply-connection-settings).

## Output type reference

Dropdowns and the detail panel identify each type with a geometric Unicode
icon and a color:

| Icon | Output type | Color | Supported |
|---|---|---|---|
| ◆ | `stream-lyr-new` — Stream Layer | `#00897b` | Requires a usable advertised WebSocket subscription; JSON format. |
| ● | `xmpp` — XMPP | `#5e35b1` | Yes, when receiving settings are available. |
| ⬡ | `grpc` — gRPC | `#7c4dff` | No verified configured-output contract for automatic Apply. |
| ■ | `http` — HTTP | `#0097a7` | HTTP Server with a valid POST destination URL and format. |
| ◆ | `websocket` — WebSocket | `#00897b` | No verified configured-output contract; Stream Layers use the separate entry above. |
| ◗ | `tcp` — TCP; `tcp-client` — TCP Client | `#546e7a` | TCP Server with a valid destination host, port, and format. |
| ◗ | `tcp-server` — TCP Server | `#546e7a` | TCP Client using the owning server's public hostname and configured socket port. |
| ◗ | `udp-client` — UDP Client | `#546e7a` | UDP Server with a valid advertised destination, port, and format. |
| ◗ | `udp-server` — UDP Server | `#546e7a` | UDP Server when the output advertises a concrete routable IPv4 destination and port. |
| ◗ | `udp` — UDP | `#546e7a` | No verified role for this legacy type. |
| ▲ | `kafka` — Kafka | `#e53935` | No. |
| ◎ | `mqtt` — MQTT | `#f57c00` | No. |
| ▣ | `file` — File | `#8d6e63` | No. |
| ❖ | `azure-event-hub` — Azure Event Hub | `#0078d4` | No. |
| ❖ | `azure-service-bus` — Azure Service Bus | `#0062ad` | No. |
| ○ | Unknown type | `#888` | No. |

## Scope toggle

**My Outputs** requests configured outputs from analytics available in the
user's scope. **ORG Outputs**, the default, requests organization scope with
`view=admin` and requires the appropriate organization-wide permissions.
Changing scope re-fetches the list. **Refresh** requests the current scope
without changing it. These controls operate within the selected server scope.

List, detail, and Apply requests use the current authenticated session and
composite output identity. Changing servers invalidates pending requests and
the previous selection, even when the session revision is unchanged.
Malformed responses remain visible errors, not successful empty lists.
Safe TLS diagnostics are displayed as returned; changing credentials or
removing the Portal context does not repair certificate trust.

## Dialog size persistence

The dialog opens at **590 × 840** pixels by default. Its size and position
are saved under `dialogSizes.velocityLogin` in App Config and restored on the
next open. Remove that key to restore the default bounds. See
[Configuration](configuration.md) for storage locations.

The dialog uses the main window's rendered theme when it opens and follows
theme changes while it remains open or hidden.
Buttons pair their text and background colors for the selected theme.
Disabled actions remain fully opaque and readable, with a subtle solid border
and muted background distinguishing them from available actions.

## UI controls

The shared **Portal URL**, expandable **Velocity endpoint**, and **Remember
me** controls sit outside both authentication forms. The endpoint section
contains **Automatic**, **Custom public URL**, **Public API URL**, **Detect
again**, and **Apply URL**. Read-only **Detected URL**, **Effective URL**, and
the endpoint status distinguish discovery from the active browsing endpoint.
With multiple registered servers, **Server** defaults to **All Velocity
servers**, and the section shows each server's URLs and status. Select one
server before editing its custom public URL. A single server retains the
simple endpoint editor without a server selector.
**Apply URL** is disabled in the aggregate view. **Detect again** remains a
Portal-wide preview and never resets individual servers' saved overrides.
See the [REST API guide](velocity-rest-api.md#choose-the-velocity-endpoint)
for endpoint selection and validation.

The password form contains **Username**, **Password**, and its visibility
toggle. OAuth contains **Client ID**, **Client Secret**, and its visibility
toggle. Both use **Sign In**. The picker contains scope and supported-type
filters, **Refresh**, **Type**, **Output**, and a read-only detail table.
**Apply** closes the dialog only after the main window accepts the settings;
errors keep it open. **Use Token Only** preserves manual connection fields,
and **Close** dismisses the dialog without applying an output.

The detail table includes source and analytic identity, type, URL or host,
authentication, format, schema fields, and availability. Displayed output
URLs omit credentials and query parameters. Source-qualified list errors
remain in the endpoint section while healthy outputs can still be inspected;
the status banner also reports partial results and can be dismissed.

## Tooltip reference

Tooltips use the shared custom tooltip utility. These strings match the
controls exactly:

| Control | Tooltip |
|---|---|
| Password tab | Sign in with ArcGIS username and password |
| OAuth tab | Sign in with OAuth 2.0 client credentials; resource access depends on the application permissions |
| Portal URL | ArcGIS Enterprise or ArcGIS Online portal URL |
| Velocity endpoint | Choose the public Velocity API address used to browse resources |
| Server label and initial dropdown | Browse all Velocity servers or select one server to edit its public API URL |
| All Velocity servers option | Browse resources from all Velocity servers |
| Automatic | Use the public API address found through Portal discovery |
| Custom public URL | Use a complete public API base instead of the detected address |
| Public API URL | Complete HTTPS API base, including the public context and optional port; no resource suffix, credentials, query, or fragment |
| Detect again | Refresh discovery without changing the custom URL or active browsing endpoint |
| Apply URL | Validate and apply the endpoint selection with the current Portal session, then reload the list |
| Apply URL in aggregate view | Select one Velocity server before applying a public API URL |
| Username | ArcGIS account username |
| Password | ArcGIS account password (press Enter to sign in) |
| Show password | Show password |
| Hide password | Hide password |
| Client ID | OAuth 2.0 application Client ID |
| Client Secret | OAuth 2.0 application Client Secret (press Enter to sign in) |
| Show client secret | Show client secret |
| Hide client secret | Hide client secret |
| Remember me | Remember the Portal URL, username, server selection, and each server's endpoint preferences; never save passwords or tokens |
| Sign In | Authenticate and retrieve outputs from your Velocity organization |
| My Outputs | Show only outputs you own |
| ORG Outputs | Show all outputs in your organization (requires admin privileges) |
| Refresh | Refresh: re-request the list of outputs from Velocity |
| Supported | Show only output types supported by the Logger |
| All | Show all output types, including those not yet supported by the Logger |
| Type label and initial dropdown | Filter by output type. Types marked with a warning are not yet supported by the Logger. |
| Output label and initial dropdown | Select an output to view its details and apply connection settings. |
| All Types option | Show all output types |
| Empty Output option | Select an output to view its details |
| Use Token Only | Use Velocity token for authentication only — keep your own connection settings in the main window |
| Apply | Apply the selected output's connection settings to the main window. |
| Apply before endpoint validation | Sign in or apply the pending endpoint before applying an output. |
| Apply while resolving details | Loading output details before applying connection settings. |
| Apply with unsupported output | Cannot apply — this output has no supported connection settings. |
| Close | Close this dialog |
| Status dismiss | Dismiss this message |

Dropdown tooltips follow the selected option. A supported type uses
`Show {type label} outputs`; an unsupported type uses
`{type label} - not yet supported by the Logger`. Output options use
`{qualified label} - {type label} output` or
`{qualified label} - {unsupported reason}`. A qualified label includes the
analytic name, kind, ID, and source server name and ID when present.
Server options use `Browse resources from {server label} ({server ID})`.
The detail-panel type badge uses the type label. An explicit unsupported
reason replaces the disabled Apply tooltip with `Cannot apply — {reason}`.

The scope-group tooltip is:

```text
My outputs: show only outputs you own
ORG Outputs: show all outputs in your organization (requires admin privileges)
```

The supported-filter group tooltip is:

```text
Supported: show only output types supported by the Logger
All: show all output types including unsupported ones
```

## Credential storage

With **Remember me**, the Portal URL, username, selected server scope, and
accepted endpoint preferences are stored in `velocity-credentials.json` in
the app's user data directory. Each custom URL belongs to a specific Portal
and registered server ID; it never becomes an override for every server on
that Portal. Changing the Portal or server never silently reuses another
server's custom URL. Passwords, client secrets, and tokens are not persisted.

Preferences are grouped under `endpointProfiles` by normalized Portal URL.
Each Portal stores `selectedServerId` independently from the endpoint mode
and public URL in `serverProfiles[serverId]`. Selecting **All Velocity
servers** stores a viewing scope, not a custom URL for all sources.
A legacy single-endpoint preference is used only when a single source can be
identified; it is not copied to every registered server.

With Remember me off, endpoint preferences remain session-only. Turning it
off removes saved preferences. Password and client-secret inputs are cleared
after a successful sign-in. Browsing requests use current main-process
session metadata, not a cached token in the dialog.

## Related documentation

| Document | Purpose |
|---|---|
| [ArcGIS Velocity REST API](velocity-rest-api.md) | Public URLs, endpoint discovery, server selection, and management versus data endpoints. |
| [Configuration](configuration.md) | App Config, launch settings, and storage locations. |
| [WebSocket transport](websocket.md) | Stream subscriptions, paths, and authentication. |
| [XMPP transport](xmpp.md) | Supported XMPP subscriptions and receiving identities. |
| [TLS and SSL security](tls.md) | Certificate types, trust, and verification. |
