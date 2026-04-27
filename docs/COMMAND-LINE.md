# Command-Line Reference

The **ArcGIS Velocity Logger** supports both normal UI startup and true headless execution from a console that has no GUI or window-manager support.

## Default Behavior

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

## In-App Command Line Interface Dialog

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

## Required vs Optional Parameters

### Required in headless mode

Headless mode has **no required parameters**. All headless options have sensible defaults.

### Required only to switch from the normal launcher into headless mode

- `runMode=headless` or `runMode=silent` — required when using the normal app launcher instead of `npm run start:headless`.

### Default output sink

- When `outputFile` is **omitted or empty**, captured records are written to the **console (stdout)** using the selected `outputFormat` (`text` by default).
- When `outputFile` is provided, captured records are written to that file and the optional raw-line console echo is controlled by `stdout=true|false`.

### Optional in headless mode

All headless parameters are optional because documented defaults are applied automatically.

## Parameter Reference

The table below mirrors the in-app Command Line Interface dialog columns.

| Name | Supported Values | Default | Required in Headless Mode | Example | Purpose |
| --- | --- | --- | --- | --- | --- |
| `appendOutput` | `true`, `false` | `false` | No | `appendOutput=true` | Append to `outputFile` instead of overwriting (no effect when `outputFile` is omitted). |
| `autoConnect` | `true`, `false` | `true` | No | `autoConnect=false` | Connect/bind automatically on headless start. |
| `config` | path | `(none)` | No | `config=./docs/launch-config.server.sample.json` | JSON launch-config file. CLI overrides config values. |
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
| `port` | `1-65535` | `5565` | No | `port=6000` | Target or bind port. |
| `protocol` | `tcp`, `udp`, `grpc` | `tcp` | No | `protocol=udp` | Network transport to listen on or connect to. See [GRPC.md](GRPC.md) for gRPC details. |
| `grpcHeaderPath` | `string` | `replace.with.dedicated.uid` | No | `grpcHeaderPath=my.feed.uid` | Value sent as the gRPC endpoint header path. Injected as gRPC metadata on every outgoing call. Only applies when `protocol=grpc` and `mode=client`. See [GRPC.md](GRPC.md). |
| `grpcHeaderPathKey` | `string` | `grpc-path` | No | `grpcHeaderPathKey=grpc-path` | Key name for the gRPC endpoint header path metadata entry. Only applies when `protocol=grpc` and `mode=client`. See [GRPC.md](GRPC.md). |
| `runId` | string | `(none)` | No | `runId=nightly-01` | Identifier stamped into logs and done file. |
| `runMode` | `ui`, `headless`, `silent` | `ui` | Only when using the normal launcher to enter headless mode | `runMode=headless` | Select startup mode. No parameters means normal UI mode with saved behavior restored. |
| `grpcSerialization` | `protobuf`, `kryo`, `text` | `protobuf` | No | `grpcSerialization=text` | gRPC feature serialization format. `protobuf` uses the Velocity external GrpcFeed protocol with typed Any-wrapped attributes. `kryo` uses the internal GrpcFeatureService protocol with raw bytes. `text` uses the internal protocol with plain UTF-8 text. Only applies when `protocol=grpc`. See [GRPC.md](GRPC.md). |
| `grpcSendMethod` | `stream`, `unary` | `stream` | No | `grpcSendMethod=unary` | gRPC RPC type for client-mode sending. `stream` (default) uses a Client Streaming RPC — multiplexes all messages over a single persistent HTTP/2 stream for higher throughput. `unary` uses a Unary RPC — sends each message as a discrete request/response round-trip, easier to trace and debug. Only applies when `protocol=grpc` and `mode=client`. See [GRPC.md](GRPC.md). |
| `showMetadata` | `true`, `false` | `false` | No | `showMetadata=true` | When `true`, connection/call metadata lines are written to the output (file or stdout) before each received message. Metadata includes protocol, mode, remote address, and (for gRPC) call headers, response headers, and status. Only applies when `protocol=grpc`. See [GRPC.md](GRPC.md). |
| `stdout` | `true`, `false` | `true` | No | `stdout=false` | Echo captured records to stdout when `outputFile` is set. Ignored when `outputFile` is omitted (records always go to stdout in that case). |

## IP Address Behavior

The default `ip` value is **`127.0.0.1`**.

- **`127.0.0.1`** = loopback / localhost only. Safest default for local tests.
- **`0.0.0.0`** = all local network interfaces. Typical for server-mode receiving from remote senders.

## Aliases and Shortcuts

- `runMode=silent` is treated the same as `runMode=headless`
- `host=<value>` is accepted as an alias for `ip=<value>`
- `h`, `-h`, `--help`, and `help=true` all print the compact 4-column summary and exit
- Unknown CLI parameters are not ignored: the app prints a startup-aborted message, shows an inline example such as `electron . help-table-narrow=true`, prints the compact CLI help automatically, and exits without launching
- Bare arguments that are not help shortcuts must use `name=value` syntax (for example, `port=5565`)
- `--help-detailed` and `help-detailed=true` print the full verbose parameter-by-parameter listing and exit
- `--help-table-wide` and `help-table-wide=true` print the wide ASCII table help layout and exit
- `--help-table-narrow` and `help-table-narrow=true` print the narrow ASCII table help layout and exit
- `--help-wide` and `help-wide=true` print the compact 5-column summary and exit
- If multiple help layouts are requested together, `help-table-narrow` wins over `help-table-wide`, wins over `help-detailed`, wins over `help-wide`, wins over `help`

## Help Layout Parameters

| Layout | Supported Forms | Typical Use |
| --- | --- | --- |
| Compact (default) | `h`, `--help`, `-h`, `help=true` | Fastest overview — 4 columns: name, values, default, purpose. |
| Detailed | `--help-detailed`, `help-detailed=true` | Full parameter-by-parameter listing with complete purpose text. |
| Wide table | `npm run help:cli:wide`, `--help-table-wide`, `help-table-wide=true` | Best for larger terminals. |
| Narrow table | `npm run help:cli:narrow`, `--help-table-narrow`, `help-table-narrow=true` | Best for narrower terminals. |
| Compact (with example) | `--help-wide`, `help-wide=true` | Compact 5-column summary when you also want the example column. |

## Usage Examples

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

### Headless gRPC server (Protobuf serialization — default)

Starts a gRPC server on port 50051 using the Velocity external GrpcFeed protocol. The ArcGIS Velocity platform or the ArcGIS Velocity Simulator (in gRPC client mode) can connect and push features:

```bash
npm run start:headless -- protocol=grpc mode=server ip=0.0.0.0 port=50051 grpcSerialization=protobuf
```

### Headless gRPC server (Text serialization)

Uses the internal GrpcFeatureService protocol with plain UTF-8 text payloads — useful for simple human-readable testing:

```bash
npm run start:headless -- protocol=grpc mode=server ip=0.0.0.0 port=50051 grpcSerialization=text
```

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
npm run start:headless -- config=./docs/launch-config.server.sample.json
```

### Headless batch using a config file plus overrides

```bash
npm run start:headless -- config=./docs/launch-config.client.sample.json ip=192.168.1.25 port=6000 runId=manual-override
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

## Related Files

- [`HEADLESS.md`](./HEADLESS.md) — Headless mode guide and config-template launch examples
- [`launch-config.sample.json`](./launch-config.sample.json) — Generic headless config template
- [`launch-config.server.sample.json`](./launch-config.server.sample.json) — Server-mode sample template
- [`launch-config.client.sample.json`](./launch-config.client.sample.json) — Client-mode sample template
- [`TESTING.md`](./TESTING.md) — Test runner and manual testing notes

