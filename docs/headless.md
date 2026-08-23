# Headless mode

[← Documentation index](README.md) · [Repository overview](../README.md#documentation)

This guide explains how to run the ArcGIS Velocity Logger with no UI at all — the mode used for servers, CI pipelines, remote hosts, and any environment without GUI or window-manager support. It covers launch patterns, output sinks and formats, transport behavior, done-file artifacts, exit codes, and launch-config file structure.

This guide is intended for users and developers who automate captures or integrate the logger into scripts and pipelines. It assumes familiarity with the CLI parameters documented in the [command-line reference](command-line.md).

## Table of contents

- [Quick start](#quick-start)
- [Launch patterns](#launch-patterns)
- [In-app command line interface dialog](#in-app-command-line-interface-dialog)
- [Required parameters](#required-parameters)
- [Output sink](#output-sink)
- [Output formats](#output-formats)
- [HTTP and WebSocket capture](#http-and-websocket-capture)
- [TCP client retry and reconnection (waiting for a server)](#tcp-client-retry-and-reconnection-waiting-for-a-server)
- [Done file](#done-file)
- [Exit codes](#exit-codes)
- [Examples](#examples)
- [Config file structure](#config-file-structure)
- [Related documentation](#related-documentation)

## Quick start

```bash
# normal UI (default)
npm start

# headless capture to the console (TCP server, 127.0.0.1:5565) — no parameters required
npm run start:headless

# headless capture to ./captured.log
npm run start:headless -- outputFile=./captured.log

# CLI help (also: npm start -- h  or  npm start -- -h  or  npm start -- --help)
npm run help:cli
```

When launched in headless mode, the logger opens a TCP, UDP, gRPC, HTTP, WebSocket, or XMPP receiver (server or client), writes every received record to the destination sink in the requested format, honors termination triggers (`maxLogCount`, `durationMs`, `idleTimeoutMs`), and optionally writes a completion artifact (`doneFile`) for schedulers/CI.

The destination sink is the **console (stdout)** by default. Provide `outputFile=<path>` to write records to a file instead.

The default behavior, when you run the app without any parameters, is **normal UI mode** with saved configuration restored.

## Launch patterns

The logger can be launched in headless mode two equivalent ways:

```bash
# explicit script
npm run start:headless

# regular launcher + runMode
npm start -- runMode=headless
```

`runMode=silent` is an alias for `runMode=headless`.

## In-app command line interface dialog

While the UI is open, press <kbd>F3</kbd> to open the dedicated **Command Line Interface** dialog. You can also open it from **Help → Command Line Interface**, the context menu, or the toolbar `>_` button.

The dialog mirrors the same metadata used by terminal help and [command-line reference](command-line.md), and adds:

- search filtering across parameters, defaults, supported values, examples, and purpose text
- quick filter chips plus active filter pills for the current search/category/sort state
- sortable columns and sticky headers
- copy/export of visible rows as `TSV`, `CSV`, `Markdown`, or `JSON`
- a resizable parameter table with a visible hint explaining that you can drag the table's bottom edge to resize the visible rows area

## Required parameters

Headless mode has **no required parameters**. The only parameter that may be required is:

| Parameter | When required |
| --- | --- |
| `runMode=headless` (or `silent`) | Only when launching through the normal `electron .` / `npm start` entry point instead of `npm run start:headless`. |

All other parameters have defaults. See [command-line reference](command-line.md) for the full list, including protocol-specific parameters for gRPC, HTTP, WebSocket, and XMPP.

## Output sink

| `outputFile` value | Behavior |
| --- | --- |
| omitted or empty (default) | Captured records are written to the **console (stdout)** in the selected `outputFormat`. |
| file path | Captured records are written to the given file. The raw-line console echo is controlled by `stdout=true|false` (default `true`). |

When `outputFile` is omitted the `stdout` flag and `appendOutput` flag are not applicable.

## Output formats

| `outputFormat` | Content per record |
| --- | --- |
| `text` (default) | Raw line as received. |
| `jsonl` | `{"timestamp":"...","seq":N,"data":"..."}` per line. |
| `csv` | `timestamp,seq,data` with standard CSV escaping; header row written once at the start of the run (both for files and stdout). |

Formats apply to **both** the file sink and the stdout sink, so `outputFormat=jsonl` without an `outputFile` produces a stream suitable for piping:

```bash
npm run start:headless -- outputFormat=jsonl | jq .
```

## HTTP and WebSocket capture

HTTP Server mode captures POST request bodies. HTTP Client mode opens a
persistent Server-Sent Events watch on the configured path and captures each
`data:` event. This client behavior is the receive-side counterpart of a
Simulator HTTP Server preset; it does not poll. If the endpoint answers the
subscription with anything other than HTTP 200 and a `text/event-stream`
content type, the answer is definitive: the watch stops for the life of the
connection and is logged once, rather than re-requesting the endpoint. A watch
that was established and then drops does reconnect, so a restart of the sending
side resumes capture; see
[HTTP and HTTPS transport](http.md#connection-modes).

WebSocket Server mode captures each incoming text frame. WebSocket Client mode
captures each frame sent by the server. `wsSubscriptionMsg` is sent after the
connection opens, and `wsIgnoreFirstMsg=true` discards the first received frame.

The paired local presets use `127.0.0.1:8080`, path `/`, Delimited format, and
TLS off. Their WebSocket presets leave the subscription empty and keep the
first frame.

## TCP client retry and reconnection (waiting for a server)

When `mode=client` and `protocol=tcp`, set `connectWaitForServer=true` to **retry the connection automatically** every `connectRetryIntervalMs` milliseconds. This covers two scenarios:

- **Server not yet available** — the client keeps trying until the server starts accepting connections.
- **Server stopped and restarted** — if the live connection drops (e.g. the server is restarted), the client automatically reconnects using the same retry interval. No data is lost from the logger's perspective; it simply resumes receiving once the server is back.

The `connectTimeoutMs` deadline is **reset on each successful connection**, so it applies to the current reconnect cycle rather than the entire lifetime of the session.

| Option | Default | Behavior |
| --- | --- | --- |
| `connectWaitForServer` | `false` | Enable connection retry. When `false` (default), a failed connection attempt immediately aborts the run. |
| `connectRetryIntervalMs` | `1000` | Delay in ms between reconnect attempts. Only used when `connectWaitForServer=true`. |
| `connectTimeoutMs` | `0` | Overall deadline for retries. `0` = wait indefinitely. Reset on each successful connection. |

**Wait for the server forever (default retry interval):**

```bash
npm run start:headless -- protocol=tcp mode=client ip=192.168.1.10 port=5565 connectWaitForServer=true
```

**Retry every 2 seconds, give up after 60 seconds without a connection:**

```bash
npm run start:headless -- protocol=tcp mode=client ip=192.168.1.10 port=5565 connectWaitForServer=true connectRetryIntervalMs=2000 connectTimeoutMs=60000
```

**No retry (exit immediately on connection failure — the default):**

```bash
npm run start:headless -- protocol=tcp mode=client ip=192.168.1.10 port=5565
```

> [!NOTE]
> `connectWaitForServer` and `connectRetryIntervalMs` apply only to TCP client mode. Server mode and UDP client mode are unaffected.

The runner stops the capture when **any** of these conditions are met:

- `maxLogCount` records have been written
- `durationMs` elapsed since start
- `idleTimeoutMs` elapsed with no incoming data
- a transport error occurs and `onError=exit` (default)

When `exitOnComplete=false`, the process stays alive after the trigger; terminate externally to exit.

## Done file

When `doneFile=./path/to/run.done.json` is set, the runner writes a JSON artifact on both success and failure:

```json
{
  "runId": "nightly-01",
  "protocol": "tcp",
  "mode": "server",
  "ip": "0.0.0.0",
  "port": 5565,
  "outputFile": "/abs/path/to/captured.log",
  "outputSink": "file",
  "outputFormat": "text",
  "success": true,
  "summary": {
    "linesReceived": 10000,
    "linesWritten": 10000,
    "byteCount": 512345,
    "stopReason": "maxLogCount"
  }
}
```

When `outputFile` is omitted, `outputFile` is `null` and `outputSink` is `"stdout"`.

On failure, `success=false` and an `error` block with `message`/`stack` plus `failedAt` is included.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Configuration error (bad CLI parameters, unreadable config file, etc.). |
| `2` | Runtime error (transport failure with `onError=exit`). |

Teardown never changes the outcome of a run. A peer that disappeared before
shutdown, or a socket that never answered its close handshake, is reported as
`[Transport] Teardown after the run reported: <message>` at warning level; the
capture that already collected its records still reports `success` and exits
`0`. A connection attempt that fails part-way is torn down as well, so a channel
or socket is never left open behind a failed run.

## Examples

### Zero-config headless capture to the console

```bash
npm run start:headless
```

### TCP server capturing all interfaces

```bash
npm run start:headless -- outputFile=./captured.log protocol=tcp mode=server ip=0.0.0.0 port=5565 maxLogCount=10000 doneFile=./run.done.json
```

### UDP client capturing for a fixed duration as JSONL

```bash
npm run start:headless -- outputFile=./captured.jsonl outputFormat=jsonl protocol=udp mode=client ip=192.168.1.25 port=6000 durationMs=60000
```

On startup, a UDP client sends one `UDP Client connected` registration
datagram. A paired Simulator UDP server uses that datagram to learn the
client's reply endpoint before replaying records.

### Filter/exclude using regular expressions

```bash
npm run start:headless -- outputFile=./errors.log filter=ERROR|WARN exclude=^heartbeat
```

### gRPC server capturing features (default serialization)

```bash
npm run start:headless -- outputFile=./captured.log protocol=grpc mode=server ip=0.0.0.0 port=50051 grpcSerialization=protobuf
```

### gRPC client connecting to a Velocity endpoint with header path

```bash
npm run start:headless -- outputFile=./captured.log protocol=grpc mode=client ip=127.0.0.1 port=50051 grpcSerialization=protobuf grpcHeaderPathKey=grpc-path grpcHeaderPath=my.feed.dedicated.uid
```

### XMPP server using a launch-config file

XMPP requires a domain, an external server account, and a TLS policy, so the simplest headless start is the bundled sample template with the secret supplied on the command line (the template intentionally omits stored secrets):

```bash
npm run start:headless -- config=docs/examples/launch-config.xmpp.sample.json xmppExternalPassword=change-me
```

The runner creates the transport via `src/xmpp-transport.js`, logs `[XMPP] <mode> ready at <endpoint>; <tlsInfo>` on connect, and — like other protocols — supports `showMetadata=true` to prefix each received line with a `[metadata] key=value ...` line. See the [XMPP guide](xmpp.md) and the [XMPP parameters table](command-line.md#xmpp-parameters) for every `xmpp*` option.

### Using a launch-config file

```bash
npm run start:headless -- config=docs/examples/launch-config.server.sample.json
```

CLI values override config-file values, so you can partially override a template:

```bash
npm run start:headless -- config=docs/examples/launch-config.server.sample.json runId=manual-override outputFile=./custom.log
```

## Config file structure

The launch-config JSON accepts either top-level keys or nested sections `headless` / `connection` / `capture` / `output`. All sections are flattened during load and validated by the CLI.

Ready-made templates are listed in the
[configuration guide](configuration.md#headless-run-config-files):
[`launch-config.sample.json`](examples/launch-config.sample.json),
[`launch-config.server.sample.json`](examples/launch-config.server.sample.json),
[`launch-config.client.sample.json`](examples/launch-config.client.sample.json),
and [`launch-config.xmpp.sample.json`](examples/launch-config.xmpp.sample.json).
The XMPP server template ships without stored secrets.

## Related documentation

- [Command-line reference](command-line.md) — full parameter reference
- [Developer guide](developer-guide.md) — how to test and debug CLI and headless code
- [Repository overview](../README.md)
