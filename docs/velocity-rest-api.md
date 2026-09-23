# ArcGIS Velocity REST API

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

This guide explains how to discover or override the ArcGIS Velocity public
REST API address and use it to browse connection settings. It is for users
and integrators with an authorized account and access to their deployment's
public URLs.

Use a build whose sign-in dialog includes the **Velocity endpoint** section.
Endpoint selection is shared by the password and OAuth sign-in tabs. The REST
examples apply to deployments exposing the resource paths shown below;
deployment access and permissions are still required. For authentication and
output selection, see
[ArcGIS Velocity sign-in and output picker](velocity-login.md).

## Table of contents

- [Identify the correct URL](#identify-the-correct-url)
- [Choose the Velocity endpoint](#choose-the-velocity-endpoint)
- [Public contexts and ports](#public-contexts-and-ports)
- [Discovery and authentication](#discovery-and-authentication)
- [Management resources](#management-resources)
- [Data endpoints](#data-endpoints)
- [Apply connection settings](#apply-connection-settings)
- [Troubleshooting](#troubleshooting)
- [Related documentation](#related-documentation)

## Identify the correct URL

Use a separate address for each purpose:

| Address | Purpose | Example |
|---|---|---|
| Portal URL | Sign in and identify the organization. | `https://portal.example.com/portal` |
| Velocity API base URL | List feeds, analytics, and other management resources. | `https://velocity.example.com/velocity` |
| Data endpoint | Send events to a receiver or subscribe to a stream. | The complete address advertised for that feed or stream. |

The API base includes the public path context, but not a resource suffix such
as `/feed`, a user-interface path such as `/home`, or a token query parameter.
Use the complete data endpoint rather than deriving it from the API base.
The two can have different hosts, ports, paths, and authentication requirements.

## Choose the Velocity endpoint

Open **Velocity endpoint** in the sign-in dialog. Use **Automatic** when your
deployment provides a reachable public address. Use **Custom public URL** to
supply an address yourself or override the detected address.

### Browse multiple Velocity servers

A Portal can register multiple Velocity servers. **Server** appears when
more than one is available and defaults to **All Velocity servers**. That
scope aggregates their outputs and displays each server's effective URL,
detected URL, and status. The picker and detail table identify the source
server, so equally named outputs on different servers remain distinct.

If one server fails, the dialog retains results from healthy servers and
shows which servers could not be queried. Select a server to narrow the list
or investigate its endpoint. Resource access and errors are evaluated for
each server rather than treating the Portal as one Velocity installation.

Custom URL editing requires one concrete server. In **All Velocity servers**
with multiple servers, the custom editor and **Apply URL** are disabled.
**Detect again** is a Portal-wide preview, not a reset or revalidation of the
active endpoints. Changing the browsing filter preserves each server's
saved override. A Portal with one server keeps the simple endpoint editor
and applies changes to that server's concrete identity. Apply pending edits before changing server
selection; selecting another server restores that server's accepted settings.

### Use automatic discovery

To use the address associated with your Portal organization:

1. Enter the **Portal URL** and your credentials on the appropriate sign-in
   tab;
2. leave **Velocity endpoint** set to **Automatic** and select **Sign In**;
3. review **Detected URL**, **Effective URL**, and the endpoint status before
   selecting an output.

The detected address comes from available deployment metadata. The effective
address is the validated API base used for the current browsing session.
If discovery cannot identify one usable endpoint, the dialog keeps the error
visible and asks for a custom public URL rather than guessing a hostname or
assuming access to administrative resources.

### Override the public address

To choose a different public host, context, or port:

1. Select the specific **Server** if multiple servers are available, then
   select **Custom public URL**;
2. enter the complete API base in **Public API URL**, for example
   `https://velocity.example.com/velocity` or
   `https://velocity.example.com:8443/team/velocity`;
3. select **Sign In** if you are not signed in, or **Apply URL** to validate
   and load the endpoint with your current Portal session;
4. review **Effective URL** and select an output from the refreshed list.

Enter the full URL, not just `/velocity`. Do not include `/feed`, `/home`,
credentials, a query, or a fragment. HTTPS without a port uses 443. A custom
address takes precedence over discovery; it does not modify Portal settings
or the deployment's public URL configuration.

### Refresh or return to discovery

**Detect again** refreshes the detected address for the signed-in Portal.
It does not overwrite a custom address or silently move the browsing session
to another endpoint. To use discovery again, select **Automatic**, then
**Apply URL**.

Edits remain pending until **Apply URL** or **Sign In** succeeds. The dialog
marks unapplied changes and disables output application while the endpoint
selection is unresolved. A successful endpoint change clears the previous
selection and reloads the list. A failed change leaves an actionable error;
it does not present an empty list as a successful connection.

With **Remember me**, the dialog restores the Portal identity, endpoint mode,
and each server's custom public URL without storing passwords or tokens.
A custom URL is associated with both its Portal and stable server ID; it
does not override the other servers on that Portal. See
[Credential storage](velocity-login.md#credential-storage) for
the sign-in storage location.

## Public contexts and ports

A Velocity Enterprise administrator can publish a public URL such as
`https://velocity.example.com/velocity` using the deployment's `WebContextURL`
setting and a correctly configured reverse proxy. The public context replaces
the native `/arcgis` context; it is not an extra prefix before `/arcgis`.
Configuring a client address does not configure that server setting, proxy,
certificate, or network access.

For a deployment exposing the `/feed` resource, the complete URLs are:

| API base URL | Feed list URL |
|---|---|
| `https://velocity.example.com:8443/arcgis` | `https://velocity.example.com:8443/arcgis/feed` |
| `https://velocity.example.com/velocity` | `https://velocity.example.com/velocity/feed` |
| `https://velocity.example.com:8443/velocity` | `https://velocity.example.com:8443/velocity/feed` |
| `https://velocity.example.com/team/velocity` | `https://velocity.example.com/team/velocity/feed` |
| `https://velocity.example.com` | `https://velocity.example.com/feed` |

The explicit port `8443` is illustrative, not a deployment default. HTTPS
without an explicit port uses **443**; an explicit non-default port must be
preserved. A public root context and a nested context are both possible when
the deployment is configured for them.

For Velocity Online, retain the complete organization-specific URL supplied
by discovery. Do not remove its path, replace it with the hostname alone, or
append another `/arcgis` if it is already part of the resolved API context.
Do not apply a global `/iot` to `/arcgis` replacement to data URLs.

## Discovery and authentication

Portal authentication and Velocity API discovery are separate operations.
An ArcGIS Portal base URL can contain its own context, such as `/portal`.
Password authentication uses the Portal's `/sharing/rest/generateToken`;
OAuth uses `/sharing/rest/oauth2/token`. Neither path moves underneath the
Velocity public context.

Enter the complete published Portal URL, including its configured context:
for example, `https://portal.example.com/portal` or
`https://portal.example.com/team/portal`. Preserve the deployment's actual
context; the dialog does not guess or append `/portal` to an entered address.

Velocity Online discovery can supply the organization's Velocity URL through
`/sharing/rest/portals/self/subscriptionInfo`. A discovered URL still needs to
be interpreted as either an instance address or a complete API base; those
meanings are not interchangeable. If discovery is unavailable or its address
is not reachable from your network, obtain the complete public API base from
the deployment administrator.

Use the token type and authentication method accepted by the target service.
A public URL does not grant access or change organization permissions. Do not
send Portal passwords to a Velocity resource, put credentials in a base URL,
or copy token-bearing URLs into saved configurations or support messages.
List refresh, scope changes, and detail requests use the current authenticated
session rather than a token copied when the list was first loaded. A change
to the Portal URL requires sign-in for that Portal. Changing only the Velocity
endpoint validates the new address with the current session; it does not send
your password to that address.

Token controls and connection refresh behavior are described in
[ArcGIS Velocity sign-in and output picker](velocity-login.md#authentication).

## Management resources

In this table, `A` means the complete public API base. Append the resource
suffix once, retaining all existing context segments:

| Method | Resource | Meaning |
|---|---|---|
| `GET` | `A/feed` | List feed configurations. |
| `GET` | `A/feed/{id}` | Read one feed configuration. |
| `GET` | `A/analytics/realtime` | List real-time analytics, including their configured outputs. |
| `GET` | `A/analytics/realtime/{id}` | Read one real-time analytic. |
| `GET` | `A/analytics/bigdata` | List big-data analytics, including their configured outputs. |
| `GET` | `A/analytics/bigdata/{id}` | Read one big-data analytic. |
| `GET` | `A/outputs` | List output connector definitions, not configured output instances. |
| `GET` | `A/services/stream` | List stream services. |
| `GET` | `A/services/stream/{itemID}` | Read a stream service and its advertised service URL. |

Feed listing uses singular `/feed` for this API contract. Older deployments
can expose a different route family; do not assume that redirects or aliases
make the families interchangeable.

Configured outputs belong to analytics. Keep the analytic identity together
with the output identity rather than selecting an output by its label alone.
The connector catalog is not a list of running subscription endpoints.
Access to organization-wide content depends on the account's permissions;
protected connection properties may be omitted.

## Data endpoints

An API management URL is not automatically a usable event destination or
subscription URL:

| Endpoint type | What to preserve |
|---|---|
| HTTP receiver | The advertised URL, method, full path and query, and required authentication. |
| gRPC receiver | The advertised host and port, TLS requirements, and routing metadata. An HTTP context is not a gRPC method prefix. |
| TCP or UDP connector | The connector role, explicit socket port, payload format, and advertised destination host. Do not substitute the HTTP management API host or port for the data destination. |
| Stream Layer | The advertised StreamServer URL, connection URLs, subscription path, and required token. |
| Outbound connector | Its configured destination and direction. A destination an analytic sends to is not a subscription endpoint. |

StreamServer JSON information can expose `streamUrls` containing connection
URLs and a token. Use the actual `ws` or `wss` URL scheme to determine TLS and
the service's subscription contract, including `/subscribe` where required.
Do not assume that every configured output is a Stream Layer.

A StreamServer descriptor on the same HTTPS origin as the effective API URL
can use the current Portal session. A cross-origin descriptor is read without
the Portal credential. If that cross-origin service requires authentication,
ask the administrator to correct the service configuration; the Logger does
not automatically forward or exchange the Portal token for that service.

Preserve queries required by a data endpoint, but do not persist temporary
credentials embedded in them. If an advertised address points to an
unreachable host or the wrong public context, ask the administrator for a
corrected endpoint rather than rewriting every URL to match the API base.

## Apply connection settings

Select a supported output and review its advertised connection details.
**Apply** transfers validated settings to the main window; it does not connect
or start capture. Missing or invalid required connection properties disable
application instead of retaining values from a previously selected output.

Stream Layer settings use the resolved WebSocket subscription URL and JSON
format. The advertised `ws` or `wss` scheme determines TLS. The subscription
path comes from the data service, not the management API context. Required
authentication is handled separately from the displayed connection URL;
temporary credentials are not saved in connection fields. Applying a stream
clears previous WebSocket upgrade headers, subscription messages, and
first-message handling so settings from an unrelated connection are not reused.

Supported XMPP output settings retain their receiving identity and
conversation settings.

TCP output roles map to the complementary Logger role. UDP outputs differ:
both `udp-client` and `udp-server` outputs send datagrams to a preconfigured
destination, so Logger applies **UDP Server** for either type. The Logger bind
address defaults to loopback and remains editable; it is not replaced with the
advertised destination. Confirm that the destination routes to the selected
local interface and that the UDP port is allowed through any firewall or NAT.
The management API host and HTTPS port are not UDP data settings.

Some deployments do not expose an editable destination host for a UDP Server
output. Logger can apply that output only when the returned configuration
advertises a concrete, routable IPv4 destination. Otherwise configure UDP
Server manually using the deployment's effective destination and socket port.

The output's format selects `tcpFormat` or `udpFormat`. Delimited (CSV) is the
default; JSON, GeoJSON, and Esri JSON are also accepted. XML and missing or
invalid required host, port, or destination settings keep the output
unavailable rather than reusing previous values. See
[Data formats](data-formats.md) for framing and validation behavior.

An `http` output with a valid POST destination URL applies **HTTP Server**.
The URL supplies host, port, path, query, and HTTP/HTTPS mode. Review that the
listening address belongs to this machine and configure any required firewall
or forwarding separately. For HTTPS, provide a certificate trusted by the
sender; an automatically generated self-signed certificate may not be trusted.
The same listening-address check applies to TCP and UDP server roles.

Generic gRPC and WebSocket output types do not have a verified configured
connector contract for automatic Apply. Their manual transports remain
available, but matching a URL scheme alone does not establish compatible
service methods, serialization, or subscription behavior.

Review the populated settings in
[Protocol settings and presets](connection-presets.md) before connecting.
Manual transport settings and local presets remain independent of the
Velocity API URL. Changing the endpoint in the sign-in dialog does not alter
an active transport connection. Disconnect before applying new data endpoint
settings, then connect explicitly when ready.

## Troubleshooting

| Symptom | Action |
|---|---|
| Sign-in works but listing fails. | Review the effective API URL, deployed route family, and account permissions; successful Portal authentication alone does not establish access to every resource. |
| Some servers return outputs and others fail. | Keep using healthy results, review the named failures, and select each affected server to inspect its effective URL and permissions. |
| Custom public URL is disabled. | Select one server rather than All Velocity servers before editing its endpoint. |
| Discovery finds no usable address. | Obtain the complete public API base from the administrator and use Custom public URL. |
| Detect again finds a different address. | Review it, select Automatic, and choose Apply URL to move the browsing session; a custom override is not overwritten. |
| An address contains `/velocity/arcgis/feed`. | Confirm the complete public API base; do not append `/arcgis` after a replacement public context. |
| A request returns a web page instead of JSON. | Check that the address is an API resource rather than a sign-in or user-interface page; confirm proxy routing with the administrator. |
| The service reports an authorization failure. | Check token validity, service access, and organization scope instead of trying unrelated URL prefixes. |
| The public host has no port in its HTTPS URL. | Use 443; do not substitute a port from a different server address. |
| A receiver or stream remains unreachable. | Verify its advertised data endpoint independently of management API access. |
| Certificate verification fails. | Follow [TLS and SSL security](tls.md); changing the context does not fix certificate trust. |
| The error includes `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. | Review the displayed certificate-chain diagnostic, have the administrator verify the server's intermediate certificates, and configure the appropriate trusted certificate authorities. Keep certificate verification enabled; correcting a Portal path does not repair certificate trust. |

## Related documentation

| Document | Purpose |
|----------|---------|
| [ArcGIS Velocity sign-in and output picker](velocity-login.md) | Sign-in controls, output selection, and token behavior. |
| [Protocol settings and presets](connection-presets.md) | Edit transport settings and inspect them before connecting. |
| [HTTP and HTTPS transport](http.md) | HTTP client and server behavior, paths, and authentication. |
| [WebSocket transport](websocket.md) | WebSocket connections, paths, headers, and subscription messages. |
| [gRPC transport](grpc.md) | gRPC modes, TLS, serialization, and routing metadata. |
| [TLS and SSL security](tls.md) | Certificate types, trust, and verification. |
