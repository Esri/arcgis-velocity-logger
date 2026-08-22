# Command-line reference

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

This guide is the complete parameter reference for launching the **ArcGIS Velocity Logger** from a terminal, whether starting the normal UI, running fully headless, or overriding a saved launch-config file. It documents every supported `name=value` parameter, its default, and when it is required, and it mirrors the same metadata used to generate the in-app Command Line Interface dialog and the terminal help output.

This guide is intended for users and developers who automate runs, script CI pipelines, or need to look up an exact flag, default, or example. It assumes Node.js and the project dependencies are already installed; see the repository overview for setup instructions.

## Table of contents

- [Default behavior](#default-behavior)
- [In-app command line interface dialog](#in-app-command-line-interface-dialog)
- [Required vs optional parameters](#required-vs-optional-parameters)
- [Parameter reference](#parameter-reference)
- [Connection presets and the command line](#connection-presets-and-the-command-line)
- [IP address behavior](#ip-address-behavior)
- [Aliases and shortcuts](#aliases-and-shortcuts)
- [Help layout parameters](#help-layout-parameters)
- [Typo suggestions](#typo-suggestions)
- [Usage examples](#usage-examples)
- [Related documentation](#related-documentation)

## Default behavior

When you launch the app with **no parameters**, it starts in the normal **UI mode** and restores all saved UI behavior from the configuration file (theme, fonts, window state, opacity, connection controls visibility).

```bash
npm start
```

To run without any UI, launch headless mode explicitly. Headless mode has **no required parameters** — when `outputFile` is omitted, captured records are written to the console (stdout) in the selected `outputFormat`:

```bash
# Headless TCP server on 127.0.0.1:5565, records echoed to stdout
npm run start:headless

# Headless capture to a file
npm run start:headless -- outputFile=./captured.log
```

You can also use the regular launcher and pass `runMode=headless` (or `runMode=silent`):

```bash
npm start -- runMode=headless
npm start -- runMode=headless outputFile=./captured.log
```

## In-app command line interface dialog

Press <kbd>F3</kbd> while the app is open to view the dedicated **Command Line Interface** dialog. You can also open it from **Help → Command Line Interface**, via the main window context menu, or the toolbar button (`>_`). The dialog is generated from the same metadata used by terminal help output and this markdown guide, so the in-app table, the terminal help, and the CLI docs stay aligned.

The dialog supports:

- **Search filtering** across parameter names, defaults, supported values, examples, and purpose text
- **Quick filter chips** for All, Required, Optional, Headless-only, and Help-related parameters
- **Active filter pills** showing the current search, category, and sort state; search/category pills can be cleared directly
- **Sortable columns** for every visible field
- **Copy example commands** directly from the examples list
- **Copy visible rows** as `TSV`, `CSV`, `Markdown`, or `JSON`
- **Export visible rows** in the same `TSV`, `CSV`, `Markdown`, or `JSON` formats
- **Collapsible reference panels** for **Behavior & Help Layouts** and **Notes**, both collapsed by default so the parameter table and examples are easier to scan
- **Resizable parameter table area** so you can drag the table taller or shorter within the dialog
- **Visible resize affordance** with hint text below the table so the adjustable rows area is easier to discover
- **Wider default dialog layout** so the shipped example commands are easier to read on first open
- **Keyboard shortcuts**: <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>F</kbd> or <kbd>/</kbd> to focus the filter, <kbd>Escape</kbd> to close

## Required vs optional parameters

### Required in headless mode

Headless mode has **no required parameters**. All headless options have sensible defaults.

### Required only to switch from the normal launcher into headless mode

- `runMode=headless` or `runMode=silent` — required when using the normal app launcher instead of `npm run start:headless`.

### Default output sink

- When `outputFile` is **omitted or empty**, captured records are written to the **console (stdout)** using the selected `outputFormat` (`text` by default).
- When `outputFile` is provided, captured records are written to that file and the optional raw-line console echo is controlled by `stdout=true|false`.

### Optional in headless mode

All headless parameters are optional because documented defaults are applied automatically.

## Parameter reference

The tables below mirror the in-app Command Line Interface dialog columns. The first table lists parameters that apply regardless of transport; the sections that follow list parameters specific to gRPC, HTTP, WebSocket, and XMPP.

| Name | Supported values | Default | Required in headless mode | Example | Purpose |
| --- | --- | --- | --- | --- | --- |
| `appendOutput` | `true`, `false` | `false` | No | `appendOutput=true` | Append to `outputFile` instead of overwriting (no effect when `outputFile` is omitted). |
| `autoConnect` | `true`, `false` | `true` | No | `autoConnect=false` | Connect/bind automatically on headless start. |
| `config` | path | `(none)` | No | `config=docs/examples/launch-config.server.sample.json` | JSON launch-config file. CLI overrides config values. |
| `connectRetryIntervalMs` | `integer >= 1` | `1000` | No | `connectRetryIntervalMs=2000` | Milliseconds between retry attempts when `connectWaitForServer=true`. Has no effect when `connectWaitForServer=false`. Only applies to TCP client mode. |
| `connectTimeoutMs` | `integer >= 0` | `0` | No | `connectTimeoutMs=5000` | Timeout for initial connect/bind. `0` waits indefinitely. |
| `connectWaitForServer` | `true`, `false` | `false` | No | `connectWaitForServer=true` | In client mode, retry on connection failure until the server is available. When `false` (default), a failed attempt aborts the run. Only applies to TCP client mode; ignored in server mode and UDP client mode. Use `connectTimeoutMs` for a deadline and `connectRetryIntervalMs` for retry spacing. |
| `doneFile` | path | `(none)` | No | `doneFile=./logs/run.done.json` | JSON success/failure artifact. |
| `durationMs` | `integer >= 1`, `null` | `(none)` | No | `durationMs=60000` | Stop after N ms of elapsed time. |
| `exclude` | regex string | `(none)` | No | `exclude=^heartbeat` | Drop lines matching this regex (applied after `filter`). |
| `explain` | `true`, `false` | `true` | No | `explain=false` | Print a detailed startup explanation showing how the app will run based on the resolved parameters, including a "UI Configuration" or "Headless Configuration" section, a "Behavior Summary" section, and warnings for ignored options. Set to `false` to suppress. |
| `exitOnComplete` | `true`, `false` | `true` | No | `exitOnComplete=false` | Exit after a termination trigger (`maxLogCount`, `durationMs`, or `idleTimeoutMs`). Has no effect when no termination trigger is configured. |
| `filter` | regex string | `(none)` | No | `filter=ERROR\|WARN` | Only capture lines matching this regex. |
| `help` | `true`, `false` | `false` | No | `help=true` | Print the compact 4-column parameter summary (name, supported values, default, purpose) without the example column, then exit. Also available as `--help`, `-h`, or `h`. |
| `help-detailed` | `true`, `false` | `false` | No | `help-detailed=true` | Print the full verbose parameter-by-parameter help listing with all details, then exit. |
| `help-table-narrow` | `true`, `false` | `false` | No | `help-table-narrow=true` | Print CLI help in a narrower ASCII table layout for smaller terminals, then exit. |
| `help-table-wide` | `true`, `false` | `false` | No | `help-table-wide=true` | Print CLI help in a wide ASCII table layout for larger terminals, then exit. |
| `help-wide` | `true`, `false` | `false` | No | `help-wide=true` | Print the compact 5-column parameter summary (name, supported values, default, example, purpose) and exit. |
| `idleTimeoutMs` | `integer >= 0` | `0` | No | `idleTimeoutMs=15000` | Stop after N ms with no data. `0` disables. |
| `ip` | IPv4 / host address | `127.0.0.1` | No | `ip=0.0.0.0` | Bind address (server) or target address (client). Alias: `host`. |
| `logFile` | path | `(none)` | No | `logFile=./logs/run.log` | Optional file for runner diagnostics. |
| `logLevel` | `error`, `warn`, `info`, `debug` | `info` | No | `logLevel=debug` | Minimum diagnostic log level. |
| `maxLogCount` | `integer >= 1`, `null` | `(none)` | No | `maxLogCount=10000` | Stop after writing N records. |
| `mode` | `server`, `client` | `server` | No | `mode=client` | Logger binds locally as a receiver server or dials a remote sender as a client. |
| `onError` | `exit`, `continue`, `pause` | `exit` | No | `onError=continue` | How transport errors are handled. |
| `outputFile` | path | `(none)` | No | `outputFile=./captured.log` | Destination file for captured records. When omitted/empty, records are written to the console (stdout) in the selected `outputFormat`. |
| `outputFormat` | `text`, `jsonl`, `csv` | `text` | No | `outputFormat=jsonl` | Raw text lines, JSON-lines with timestamp/seq, or CSV. Applies to both file output and stdout-only mode. |
| `port` | `1-65535` | `5565` | No | `port=6000` | Target or bind port. XMPP defaults to `5222` instead of `5565` when `port` is omitted and `protocol=xmpp`. |
| `protocol` | `tcp`, `udp`, `grpc`, `http`, `ws`, `xmpp` | `tcp` | No | `protocol=udp` | Network transport to listen on or connect to. XMPP defaults to server mode when selected. See the [gRPC parameters](#grpc-parameters), [HTTP parameters](#http-parameters), [WebSocket parameters](#websocket-parameters), and [XMPP parameters](#xmpp-parameters) sections below, and the dedicated [gRPC guide](grpc.md), [HTTP guide](http.md), [WebSocket guide](websocket.md), and [XMPP guide](xmpp.md). |
| `runId` | string | `(none)` | No | `runId=nightly-01` | Identifier stamped into logs and done file. |
| `runMode` | `ui`, `headless`, `silent` | `ui` | Only when using the normal launcher to enter headless mode | `runMode=headless` | Select startup mode. No parameters means normal UI mode with saved behavior restored. |
| `stdout` | `true`, `false` | `true` | No | `stdout=false` | Echo captured records to stdout when `outputFile` is set. Ignored when `outputFile` is omitted (records always go to stdout in that case). |

### gRPC parameters

These parameters only apply when `protocol=grpc`. See the [gRPC guide](grpc.md) for the full transport walkthrough.

| Name | Supported values | Default | Required in headless mode | Example | Purpose |
| --- | --- | --- | --- | --- | --- |
| `grpcHeaderPath` | `string` | `replace.with.dedicated.uid` | No | `grpcHeaderPath=my.feed.uid` | Value sent as the gRPC endpoint header path. Injected as gRPC metadata on every outgoing call. Only applies when `protocol=grpc` and `mode=client`. |
| `grpcHeaderPathKey` | `string` | `grpc-path` | No | `grpcHeaderPathKey=grpc-path` | Key name for the gRPC endpoint header path metadata entry. Only applies when `protocol=grpc` and `mode=client`. |
| `grpcSerialization` | `protobuf`, `kryo`, `text` | `protobuf` | No | `grpcSerialization=text` | gRPC feature serialization format. `protobuf` uses the Velocity external GrpcFeed protocol with typed Any-wrapped attributes. `kryo` uses the internal GrpcFeatureService protocol with raw bytes. `text` uses the internal protocol with plain UTF-8 text. |
| `grpcSendMethod` | `stream`, `unary` | `stream` | No | `grpcSendMethod=unary` | gRPC RPC type for client-mode sending. `stream` (default) uses a Client Streaming RPC — multiplexes all messages over a single persistent HTTP/2 stream for higher throughput. `unary` uses a Unary RPC — sends each message as a discrete request/response round-trip, easier to trace and debug. Only applies when `mode=client`. |
| `showMetadata` | `true`, `false` | `false` | No | `showMetadata=true` | When `true`, connection/call metadata lines are written to the output (file or stdout) before each received message. Metadata includes protocol, mode, remote address, and (for gRPC) call headers, response headers, and status. |
| `useTls` | `true`, `false` | `true` | No | `useTls=true` | Use TLS (SSL) for gRPC connections. When `true`, the connection uses SSL credentials instead of plaintext. |
| `tlsCaPath` | path, omitted | `(none)` | No | `tlsCaPath=./certs/ca.pem` | Custom CA certificate file (PEM) for gRPC TLS. When omitted, the system default CA bundle is used. Only applies when `useTls=true`. |
| `tlsCertPath` | path, omitted | `(none)` | No | `tlsCertPath=./certs/client.pem` | Client/server certificate file (PEM) for gRPC mutual TLS (mTLS). Required for TLS server mode. Only applies when `useTls=true`. |
| `tlsKeyPath` | path, omitted | `(none)` | No | `tlsKeyPath=./certs/client-key.pem` | Private key file (PEM) for gRPC mutual TLS (mTLS). Required for TLS server mode. Only applies when `useTls=true`. |
| `allowUnverifiedTls` | `true`, `false` | `false` | No | `allowUnverifiedTls=true` | Explicitly accept an unverified gRPC server certificate in client mode. The connection stays encrypted, but the server identity is not checked and the bypass applies to any host, not only localhost. Server mode is unaffected. Only applies when `protocol=grpc`, `mode=client`, and `useTls=true`. |

### HTTP parameters

These parameters only apply when `protocol=http`. See the [HTTP guide](http.md) for the full transport walkthrough.

| Name | Supported values | Default | Required in headless mode | Example | Purpose |
| --- | --- | --- | --- | --- | --- |
| `httpFormat` | `json`, `delimited`, `esriJson`, `geojson`, `xml` | `delimited` | No | `httpFormat=json` | HTTP data format controlling the `Content-Type` header: `json` (`application/json`), `delimited` (`text/plain`, CSV), `esriJson` (`application/json`), `geojson` (`application/geo+json`), or `xml` (`application/xml`). |
| `httpPath` | string | `/` | No | `httpPath=/receiver/feed-id` | URL path appended after host:port. In server mode, only POST requests matching this path are accepted; in client mode, this path is used in outgoing POST URLs. |
| `httpTls` | `true`, `false` | `true` | No | `httpTls=true` | Enable HTTPS (port 8443 by default). Uses the OS certificate store automatically in client mode; server mode requires a certificate and key. |
| `httpTlsCaPath` | path, omitted | `(none)` | No | `httpTlsCaPath=./certs/ca.pem` | Custom CA certificate file (PEM) for HTTP TLS. Leave empty to use the OS certificate store. Only applies when `httpTls=true`. |
| `httpTlsCertPath` | path, omitted | `(none)` | No | `httpTlsCertPath=./certs/server.pem` | Client or server certificate file (PEM) for HTTP TLS. Required for server-mode TLS; only needed in client mode for mutual TLS (mTLS). Only applies when `httpTls=true`. |
| `httpTlsKeyPath` | path, omitted | `(none)` | No | `httpTlsKeyPath=./certs/server-key.pem` | Private key file (PEM) for HTTP TLS. Required for server-mode TLS and client-side mTLS. Only applies when `httpTls=true`. |
| `httpAllowUnverifiedTls` | `true`, `false` | `false` | No | `httpAllowUnverifiedTls=true` | Explicitly accept an unverified HTTPS server certificate in client mode. The connection stays encrypted, but the server identity is not checked and the bypass applies to any host, not only localhost. Server mode is unaffected. Only applies when `protocol=http`, `mode=client`, and `httpTls=true`. |

### WebSocket parameters

These parameters only apply when `protocol=ws`. See the [WebSocket guide](websocket.md) for the full transport walkthrough.

| Name | Supported values | Default | Required in headless mode | Example | Purpose |
| --- | --- | --- | --- | --- | --- |
| `wsFormat` | `json`, `delimited`, `esriJson`, `geojson`, `xml` | `delimited` | No | `wsFormat=json` | WebSocket data format: `json` (`application/json`), `delimited` (`text/plain`, CSV), `esriJson` (`application/json`), `geojson` (`application/geo+json`), or `xml` (`application/xml`). |
| `wsHeaders` | JSON string, omitted | `(none)` | No | `wsHeaders={"Authorization":"******"}` | Optional JSON object of custom HTTP headers for the WebSocket upgrade request. Only applies when `mode=client`. |
| `wsIgnoreFirstMsg` | `true`, `false` | `false` | No | `wsIgnoreFirstMsg=true` | When `true`, the first message received after connecting is silently discarded. Useful when the server sends an initial handshake or acknowledgement. |
| `wsPath` | string | `/` | No | `wsPath=/feed` | URL path appended after host:port for the WebSocket connection. In server mode, only upgrade requests matching this path are accepted. |
| `wsSubscriptionMsg` | string, omitted | `(none)` | No | `wsSubscriptionMsg=subscribe:feed1` | Optional text message sent to the server immediately after the WebSocket connection is established. Useful for subscribing to a specific data feed. Only applies when `mode=client`. |
| `wsTls` | `true`, `false` | `true` | No | `wsTls=true` | Enable WSS (WebSocket Secure, port 8443 by default). Uses the OS certificate store automatically in client mode; server mode requires a certificate and key. |
| `wsTlsCaPath` | path, omitted | `(none)` | No | `wsTlsCaPath=./certs/ca.pem` | Custom CA certificate file (PEM) for WebSocket TLS. Leave empty to use the OS certificate store. Only applies when `wsTls=true`. |
| `wsTlsCertPath` | path, omitted | `(none)` | No | `wsTlsCertPath=./certs/server.pem` | Client or server certificate file (PEM) for WebSocket TLS. Required for server-mode TLS; only needed in client mode for mutual TLS (mTLS). Only applies when `wsTls=true`. |
| `wsTlsKeyPath` | path, omitted | `(none)` | No | `wsTlsKeyPath=./certs/server-key.pem` | Private key file (PEM) for WebSocket TLS. Required for server-mode TLS and client-side mTLS. Only applies when `wsTls=true`. |
| `wsAllowUnverifiedTls` | `true`, `false` | `false` | No | `wsAllowUnverifiedTls=true` | Explicitly accept an unverified WSS server certificate in client mode. The connection stays encrypted, but the server identity is not checked and the bypass applies to any host, not only localhost. Server mode is unaffected. Only applies when `protocol=ws`, `mode=client`, and `wsTls=true`. |

### XMPP parameters

These parameters only apply when `protocol=xmpp`. See the [XMPP guide](xmpp.md) for JID, STARTTLS, Direct/MUC, and ArcGIS mapping concepts. When `port` is omitted, XMPP defaults to port `5222` instead of the generic `5565` default.

| Name | Supported values | Default | Required in headless mode | Example | Purpose |
| --- | --- | --- | --- | --- | --- |
| `xmppDomain` | XMPP domain | `localhost` | No | `xmppDomain=example.com` | XMPP service domain, separate from the top-level `ip` network host override. |
| `xmppUsername` | string | (empty string) | No | `xmppUsername=logger` | XMPP client account username. |
| `xmppPassword` | secret, empty | (empty string) | No | `xmppPassword=secret` | XMPP client password; may be present but empty (`xmppPassword=`). Never written to logs or metadata. |
| `xmppResource` | string | `velocity-logger` | No | `xmppResource=velocity-logger` | Resource appended to the authenticated XMPP JID. |
| `xmppLocalJid` | bare JID, omitted | (empty string) | No | `xmppLocalJid=logger@example.com` | Optional local bare JID used to filter direct messages. |
| `xmppExternalUsername` | string | `velocity-client` | No | `xmppExternalUsername=velocity` | External account accepted by XMPP server mode. |
| `xmppExternalPassword` | secret, empty | (empty string) | No | `xmppExternalPassword=secret` | External account password; may be present but empty (`xmppExternalPassword=`). Never logged. |
| `xmppTlsPolicy` | `required`, `preferred`, `disabled` | `required` | No | `xmppTlsPolicy=required` | STARTTLS policy. `required` is the secure default. |
| `xmppTlsCaPath` | PEM path, omitted | `(none)` | No | `xmppTlsCaPath=./ca.pem` | Custom CA certificate path; OS trust is used when omitted. |
| `xmppTlsCertPath` | PEM path, omitted | `(none)` | No | `xmppTlsCertPath=./server.pem` | Server certificate path; an ephemeral self-signed certificate is automatic when omitted. |
| `xmppTlsKeyPath` | PEM path, omitted | `(none)` | No | `xmppTlsKeyPath=./server-key.pem` | Private key corresponding to `xmppTlsCertPath`. |
| `xmppAllowUnverifiedTls` | `true`, `false` | `false` | No | `xmppAllowUnverifiedTls=true` | Explicitly accept an unverified XMPP server certificate. STARTTLS still encrypts the stream, but the server identity is not checked and the bypass applies to any host, not only localhost. |
| `xmppAllowRemote` | `true`, `false` | `false` | No | `xmppAllowRemote=true` | Allow XMPP server binding outside loopback. |
| `xmppConversation` | `direct`, `muc` | `direct` | No | `xmppConversation=muc` | Receive direct chat or Multi-User Chat (MUC) messages. |
| `xmppRoom` | bare room JID, omitted | (empty string) | No | `xmppRoom=events@conference.example.com` | Room JID used in MUC mode. |
| `xmppNickname` | string | `logger` | No | `xmppNickname=logger` | MUC nickname; matching self-echoes are ignored. |
| `xmppRoomPassword` | secret, omitted | (empty string) | No | `xmppRoomPassword=secret` | Optional MUC room password; never logged. |
| `xmppConnectTimeoutMs` | `integer >= 1` | `30000` | No | `xmppConnectTimeoutMs=30000` | XMPP stream connection and authentication timeout. |
| `xmppReplyTimeoutMs` | `integer >= 1` | `15000` | No | `xmppReplyTimeoutMs=15000` | Timeout for stanza, IQ, room join, and ping replies. |
| `xmppPingIntervalMs` | `integer >= 1` | `60000` | No | `xmppPingIntervalMs=60000` | XMPP keepalive ping interval. |
| `xmppReconnectDelayMs` | `integer >= 1` | `60000` | No | `xmppReconnectDelayMs=60000` | Delay before reconnecting an interrupted XMPP client session. |

XMPP client mode requires `xmppUsername` and XMPP server mode requires
`xmppExternalUsername`. The matching password parameter must be present, but it
may be empty: `xmppPassword=` and `xmppExternalPassword=` are accepted for both
PLAIN and SCRAM-SHA-1 and keep a local Logger/Simulator pairing free of a shared
secret. Password whitespace is preserved exactly.

## Connection presets and the command line

The UI **Preset** dropdown pre-fills the same connection fields these parameters
set. A preset only fills editable fields: it never connects, starts capture,
saves a secret, or changes startup defaults, and the equivalent command line is
always spelled out. See [Connection presets](connection-presets.md) for the
twelve paired Logger and Simulator entries.

Passing connection parameters in UI mode prepopulates the same controls without
selecting a preset; the dropdown stays on **Custom**.

## IP address behavior

The default `ip` value is **`127.0.0.1`**.

- **`127.0.0.1`** = loopback / localhost only. Safest default for local tests.
- **`0.0.0.0`** = all local network interfaces. Typical for server-mode receiving from remote senders.

## Aliases and shortcuts

- `runMode=silent` is treated the same as `runMode=headless`
- `host=<value>` is accepted as an alias for `ip=<value>`
- `h`, `-h`, `--help`, and `help=true` all print the compact 4-column summary and exit
- Unknown CLI parameters are not ignored: the app prints a startup-aborted message, shows a `Did you mean ...?` suggestion when a close valid name exists, shows how to open help (for example `electron . help=true` or `--help`), and exits without launching. It does **not** dump the full help table for unknown-parameter errors because that output is too verbose.
- Bare arguments that are not help shortcuts must use `name=value` syntax (for example, `port=5565`)
- `--help-detailed` and `help-detailed=true` print the full verbose parameter-by-parameter listing and exit
- `--help-table-wide` and `help-table-wide=true` print the wide ASCII table help layout and exit
- `--help-table-narrow` and `help-table-narrow=true` print the narrow ASCII table help layout and exit
- `--help-wide` and `help-wide=true` print the compact 5-column summary and exit
- If multiple help layouts are requested together, `help-table-narrow` wins over `help-table-wide`, wins over `help-detailed`, wins over `help-wide`, wins over `help`

## Help layout parameters

| Layout | Supported forms | Typical use |
| --- | --- | --- |
| Compact (default) | `h`, `--help`, `-h`, `help=true` | Fastest overview — 4 columns: name, values, default, purpose. |
| Detailed | `--help-detailed`, `help-detailed=true` | Full parameter-by-parameter listing with complete purpose text. |
| Wide table | `npm run help:cli:wide`, `--help-table-wide`, `help-table-wide=true` | Best for larger terminals. |
| Narrow table | `npm run help:cli:narrow`, `--help-table-narrow`, `help-table-narrow=true` | Best for narrower terminals. |
| Compact (with example) | `--help-wide`, `help-wide=true` | Compact 5-column summary when you also want the example column. |

## Typo suggestions

Unknown CLI parameter names and unknown help flags use **Levenshtein edit distance** to choose `Did you mean ...?` suggestions when the misspelling is close enough to a supported option.

Levenshtein distance is a formal edit-distance algorithm: it counts the minimum number of single-character **insertions**, **deletions**, and **substitutions** needed to transform one string into another. That is different from the previous release-script character-overlap heuristic, which only counted whether the misspelled input's characters appeared somewhere in a candidate option. Character overlap is fast, but it ignores character order and can over-score unrelated options that happen to share letters. Edit distance is the better CLI choice because typical mistakes are missing letters, extra letters, swapped-adjacent letters counted as two edits, or one wrong character.

| Approach | What it does | Pros | Cons | Used here? |
| --- | --- | --- | --- | --- |
| Exact allowlist validation | Checks whether the provided parameter exactly matches a supported parameter or alias. | Safe, deterministic, prevents unsupported options from being accepted. | No typo recovery by itself. | **Yes** — always used first to decide whether input is valid. |
| Character-overlap scoring | Counts shared characters between the typo and each candidate. | Very simple and shell-friendly. | Ignores order and edit operations; unrelated options with shared letters can score too high. | **No** — replaced for suggestions. |
| Levenshtein edit distance | Counts insertions, deletions, and substitutions. | Predictable for CLI typos such as missing letters, extra letters, missing hyphens, and substitutions; dependency-free implementation. | Adjacent transpositions count as two edits. | **Yes** — used for `Did you mean ...?` suggestions in the app CLI. |
| Damerau-Levenshtein | Like Levenshtein, but adjacent transpositions count as one edit. | Slightly better for swapped adjacent letters. | More complex; current thresholds already handle common swapped-letter cases well enough. | No — considered but not needed. |
| Prefix/substring matching | Suggests candidates that start with or contain the typo. | Useful for autocomplete. | Poor fit for misspellings in the middle of a flag or parameter. | No. |

The validation flow is: **exact allowlist check first**, then if the name is unknown, **Levenshtein suggestion only when the edit distance is below a conservative threshold**. Distant unknown parameters do not get a suggestion, avoiding misleading output. Unknown-parameter startup errors stay concise: they show the bad parameter, any `Did you mean ...?` suggestion, and a help command such as `electron . help=true`; the full help table is only shown when you explicitly request help.

Examples:

```text
Unknown CLI parameter: protocl. Did you mean 'protocol'? These parameters are not supported.
Unknown CLI parameter: outputFil. Did you mean 'outputFile'? These parameters are not supported.
Unknown CLI parameter: --help-detaled. Did you mean '--help-detailed'? These parameters are not supported.
```

## Usage examples

### Normal UI startup (default)

```bash
npm start
```

### Minimal headless run (TCP server, records echoed to the console)

No required parameters — defaults to `protocol=tcp mode=server ip=127.0.0.1 port=5565 outputFormat=text` and writes to stdout:

```bash
npm run start:headless
```

### Headless run capturing to a file

```bash
npm run start:headless -- outputFile=./captured.log
```

### Headless TCP server that captures 10 000 lines then exits

```bash
npm run start:headless -- outputFile=./captured.log protocol=tcp mode=server ip=0.0.0.0 port=5565 maxLogCount=10000 doneFile=./run.done.json
```

### Headless UDP client capturing for one minute as JSONL

```bash
npm run start:headless -- outputFile=./captured.jsonl outputFormat=jsonl protocol=udp mode=client ip=192.168.1.25 port=6000 durationMs=60000
```

### Headless TCP client that waits for the server

Retries every 2 seconds for up to 60 seconds before giving up:

```bash
npm run start:headless -- protocol=tcp mode=client ip=192.168.1.10 port=5565 connectWaitForServer=true connectRetryIntervalMs=2000 connectTimeoutMs=60000
```

Retry forever until the server appears (set `connectTimeoutMs=0`, the default):

```bash
npm run start:headless -- protocol=tcp mode=client ip=192.168.1.10 port=5565 connectWaitForServer=true
```

### Headless gRPC server (`protobuf` serialization — default)

Starts a gRPC server on port 50051 using the Velocity external GrpcFeed protocol. The ArcGIS Velocity platform or the ArcGIS Velocity Simulator (in gRPC client mode) can connect and push features:

```bash
npm run start:headless -- protocol=grpc mode=server ip=0.0.0.0 port=50051 grpcSerialization=protobuf
```

### Headless gRPC server (`text` serialization)

Uses the internal GrpcFeatureService protocol with plain UTF-8 text payloads — useful for simple human-readable testing:

```bash
npm run start:headless -- protocol=grpc mode=server ip=0.0.0.0 port=50051 grpcSerialization=text
```

### Headless XMPP server using a launch-config file

XMPP has several required parameters (domain, external account, TLS policy), so the simplest way to start it headless is a launch-config template plus a CLI override for the secret:

```bash
npm run start:headless -- config=docs/examples/launch-config.xmpp.sample.json xmppExternalPassword=change-me
```

See the [XMPP guide](xmpp.md) for Direct-chat vs Multi-User Chat (MUC) mode, STARTTLS policy, and JID concepts.

### Headless capture with filter + exclude

```bash
npm run start:headless -- outputFile=./errors.log filter=ERROR|WARN exclude=^heartbeat
```

### Headless stdout capture as JSONL (useful for piping into other tools)

```bash
npm run start:headless -- outputFormat=jsonl | jq .
```

### Headless batch using a config file

```bash
npm run start:headless -- config=docs/examples/launch-config.server.sample.json
```

### Headless batch using a config file plus overrides

```bash
npm run start:headless -- config=docs/examples/launch-config.client.sample.json ip=192.168.1.25 port=6000 runId=manual-override
```

### Print CLI help (compact 4-column summary)

The default help layout — fastest way to get an overview:

```bash
npm start -- help=true
npm start -- --help
npm start -- h
```

### Print the full verbose parameter listing

```bash
npm start -- help-detailed=true
npm start -- --help-detailed
```

### Print compact help with the example column

```bash
npm start -- help-wide=true
npm start -- --help-wide
```

### Print CLI help in a wide or narrow table layout

```bash
npm run help:cli:wide
npm run help:cli:narrow
npm start -- help-table-narrow=true
```

## Related documentation

- [Headless mode](headless.md) — headless launch examples using these parameters
- [Developer guide](developer-guide.md) — testing, debugging, and local development
- [XMPP guide](xmpp.md) — Direct-chat and MUC concepts, STARTTLS, and JID mapping
- [Configuration](configuration.md) — persisted settings and launch configuration files
- [Repository overview](../README.md)
