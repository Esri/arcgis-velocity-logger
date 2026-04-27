# Headless Mode Guide

The **ArcGIS Velocity Logger** can run with no UI at all. This is useful for servers, CI pipelines, remote hosts, and any environment that has no GUI or window-manager support.

When launched in headless mode, the logger opens a TCP or UDP receiver (server or client), writes every received record to the destination sink in the requested format, honors termination triggers (`maxLogCount`, `durationMs`, `idleTimeoutMs`), and optionally writes a completion artifact (`doneFile`) for schedulers/CI.

The destination sink is the **console (stdout)** by default. Provide `outputFile=<path>` to write records to a file instead.

The default behavior, when you run the app without any parameters, is **normal UI mode** with saved configuration restored.

## Quick Start

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

## Launch Patterns

The logger can be launched in headless mode two equivalent ways:

```bash
# explicit script
npm run start:headless

# regular launcher + runMode
npm start -- runMode=headless
```

`runMode=silent` is an alias for `runMode=headless`.

## In-App Command Line Interface Dialog

While the UI is open, press <kbd>F3</kbd> to open the dedicated **Command Line Interface** dialog. You can also open it from **Help → Command Line Interface**, the context menu, or the toolbar `>_` button.

The dialog mirrors the same metadata used by terminal help and [`COMMAND-LINE.md`](./COMMAND-LINE.md), and adds:

- search filtering across parameters, defaults, supported values, examples, and purpose text
- quick filter chips plus active filter pills for the current search/category/sort state
- sortable columns and sticky headers
- copy/export of visible rows as `TSV`, `CSV`, `Markdown`, or `JSON`
- a resizable parameter table with a visible hint explaining that you can drag the table’s bottom edge to resize the visible rows area

## Required Parameters

Headless mode has **no required parameters**. The only parameter that may be required is:

| Parameter | When required |
| --- | --- |
| `runMode=headless` (or `silent`) | Only when launching through the normal `electron .` / `npm start` entry point instead of `npm run start:headless`. |

All other parameters have defaults. See [`COMMAND-LINE.md`](./COMMAND-LINE.md) for the full list.

## Output Sink

| `outputFile` value | Behavior |
| --- | --- |
| omitted or empty (default) | Captured records are written to the **console (stdout)** in the selected `outputFormat`. |
| file path | Captured records are written to the given file. The raw-line console echo is controlled by `stdout=true|false` (default `true`). |

When `outputFile` is omitted the `stdout` flag and `appendOutput` flag are not applicable.

## Output Formats

| `outputFormat` | Content per record |
| --- | --- |
| `text` (default) | Raw line as received. |
| `jsonl` | `{"timestamp":"...","seq":N,"data":"..."}` per line. |
| `csv` | `timestamp,seq,data` with standard CSV escaping; header row written once at the start of the run (both for files and stdout). |

Formats apply to **both** the file sink and the stdout sink, so `outputFormat=jsonl` without an `outputFile` produces a stream suitable for piping:

```bash
npm run start:headless -- outputFormat=jsonl | jq .
```

## TCP Client Retry and Reconnection (Waiting for a Server)

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

> **Note:** `connectWaitForServer` and `connectRetryIntervalMs` apply only to TCP client mode. Server mode and UDP client mode are unaffected.



The runner stops the capture when **any** of these conditions are met:

- `maxLogCount` records have been written
- `durationMs` elapsed since start
- `idleTimeoutMs` elapsed with no incoming data
- a transport error occurs and `onError=exit` (default)

When `exitOnComplete=false`, the process stays alive after the trigger; terminate externally to exit.

## Done File

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

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Configuration error (bad CLI parameters, unreadable config file, etc.). |
| `2` | Runtime error (transport failure with `onError=exit`). |

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

### Using a launch-config file

```bash
npm run start:headless -- config=./docs/launch-config.server.sample.json
```

CLI values override config-file values, so you can partially override a template:

```bash
npm run start:headless -- config=./docs/launch-config.server.sample.json runId=manual-override outputFile=./custom.log
```

## Config File Structure

The launch-config JSON accepts either top-level keys or nested sections `headless` / `connection` / `capture` / `output`. All sections are flattened during load and validated by the CLI.

See [`launch-config.sample.json`](./launch-config.sample.json), [`launch-config.server.sample.json`](./launch-config.server.sample.json), and [`launch-config.client.sample.json`](./launch-config.client.sample.json).

## Related

- [`COMMAND-LINE.md`](./COMMAND-LINE.md) — full parameter reference
- [`TESTING.md`](./TESTING.md) — how to test CLI + headless code

