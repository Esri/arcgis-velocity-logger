# Testing Guide

Tests run with Node.js only — no Electron environment required.

## Run Tests

| Command | What it tests |
|---------|---------------|
| `npm test` | All suites |
| `npm run test:cli` | CLI parsing / help |
| `npm run test:help` | Help + CLI dialog |
| `npm run test:headless-runner` | Headless runner |
| `npm run test:grpc` | gRPC transport (all 3 formats) |

Or run a file directly: `node test/cli-options.test.js`

Exit code non-zero = failure.

## Test Suites

| Suite | File | What it covers |
|-------|------|----------------|
| CLI Options | `cli-options.test.js` | Parsing, mode resolution, aliases, config-file merge, validation |
| Help / CLI Dialog | `help.test.js` | Help dialog + CLI Reference dialog filters, sorting, copy/export |
| Headless Runner | `headless-runner.test.js` | Output formats (text/jsonl/csv), maxLogCount/durationMs, filter/exclude, doneFile, exit codes |
| gRPC Transport | `grpc-transport.test.js` | All 3 serialization formats; server-receive and client-Watch paths |

## Manual Smoke Tests

### Help output

| Command | Layout |
|---------|--------|
| `npm run help:cli` | Compact |
| `npm run help:cli:wide` | Wide ASCII table |
| `npm run help:cli:narrow` | Narrow ASCII table |

All must exit 0 and print without errors.

### UI launch
```bash
npm start
```
App opens with saved theme, fonts, window size/position, and connection-controls visibility. Console shows "UI Configuration" + "Behavior Summary" in the startup explanation.

### Headless capture
```bash
# terminal A
npm run start:headless -- outputFile=/tmp/captured.log port=5566 maxLogCount=5 doneFile=/tmp/run.done.json

# terminal B
printf 'line-1\nline-2\nline-3\nline-4\nline-5\n' | nc 127.0.0.1 5566
```
Expected: exit 0, `/tmp/captured.log` has 5 lines, `run.done.json` has `success:true`, `linesWritten:5`, `stopReason:"maxLogCount"`.

### gRPC transport
```bash
# Logger as server
npm run start:headless -- protocol=grpc mode=server port=50051 grpcSerialization=protobuf maxLogCount=3 outputFile=/tmp/grpc.log

# Logger as client (start Simulator in gRPC Server mode first)
npm run start:headless -- protocol=grpc mode=client ip=127.0.0.1 port=50051 grpcSerialization=protobuf maxLogCount=3 outputFile=/tmp/grpc-client.log
```
Repeat with `grpcSerialization=text` and `grpcSerialization=kryo`.

### CLI Reference dialog (in-app)
- `F3` → dialog opens, all parameters listed
- Search, quick chips, active pills, sortable columns, copy/export all respond correctly
- Table area can be resized by dragging its bottom edge (hint text visible below table)

## Troubleshooting

- **Dependencies**: `npm install`
- **Node version**: requires Node 18+
- **Debug a test**: `node --inspect test/headless-runner.test.js` then connect Chrome DevTools

## Related

- [DEBUGGING.md](./DEBUGGING.md) — debugger setup and common issues
- [COMMAND-LINE.md](./COMMAND-LINE.md) — full CLI parameter reference

