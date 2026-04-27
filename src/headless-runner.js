/**
 * @file headless-runner.js
 * @description
 * High-level orchestrator for true no-UI execution of the ArcGIS Velocity Logger.
 *
 * Responsibilities:
 * - open a TCP/UDP server or client receiver based on normalized CLI options
 * - write received records to an output file using the requested format
 * - honor maxLogCount, durationMs, and idleTimeoutMs termination triggers
 * - apply filter/exclude regular expressions
 * - write an optional done file for schedulers/CI
 * - map outcomes to stable process exit codes
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const dgram = require('dgram');
const { RunLogger } = require('./run-logger.js');

/**
 * Exit codes used when headless mode is launched from the terminal or Electron main process.
 */
const EXIT_CODES = {
  success: 0,
  configurationError: 1,
  runtimeError: 2,
};

function writeDoneFile(doneFile, payload) {
  if (!doneFile) return;
  const resolvedPath = path.resolve(doneFile);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(payload, null, 2), 'utf8');
}

function csvEscape(value) {
  const normalized = String(value ?? '').replace(/\r?\n/g, ' ');
  return /[",]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

/**
 * Internal: writable record sink abstracting over the output format.
 *
 * When `outputFile` is omitted/empty, records are written directly to `process.stdout`
 * in the selected format; otherwise a file stream is opened and the optional raw stdout
 * echo (controlled by `options.stdout`) is handled by the caller.
 */
class RecordSink {
  constructor({ outputFile, outputFormat, appendOutput }) {
    this.outputFormat = outputFormat;
    this.sequence = 0;
    this.toStdout = !outputFile;

    if (this.toStdout) {
      this.outputFile = null;
      this.stream = null;
      if (outputFormat === 'csv') {
        process.stdout.write('timestamp,seq,data\n');
      }
      return;
    }

    this.outputFile = path.resolve(outputFile);
    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
    const flags = appendOutput ? 'a' : 'w';
    this.stream = fs.createWriteStream(this.outputFile, { flags, encoding: 'utf8' });
    if (outputFormat === 'csv' && !appendOutput) {
      this.stream.write('timestamp,seq,data\n');
    }
  }

  write(line) {
    this.sequence += 1;
    const timestamp = new Date().toISOString();
    let formatted;
    if (this.outputFormat === 'jsonl') {
      formatted = `${JSON.stringify({ timestamp, seq: this.sequence, data: line })}\n`;
    } else if (this.outputFormat === 'csv') {
      formatted = `${csvEscape(timestamp)},${this.sequence},${csvEscape(line)}\n`;
    } else {
      formatted = `${line}\n`;
    }
    if (this.toStdout) {
      process.stdout.write(formatted);
    } else {
      this.stream.write(formatted);
    }
  }

  close() {
    if (this.toStdout || !this.stream) return Promise.resolve();
    return new Promise((resolve) => {
      this.stream.end(resolve);
    });
  }
}

/**
 * Internal: creates a TCP/UDP receiver and emits each incoming line via `onLine`.
 *
 * The returned object exposes a `stop()` function and a `startedPromise` that resolves
 * when the socket is ready (listening or connected), respecting `connectTimeoutMs`.
 */
function createReceiver(options, { logger, onLine, onError }) {
  const { protocol, mode, ip, port, connectTimeoutMs } = options;
  let stopped = false;
  const closers = [];

  function emitLines(chunk) {
    if (stopped) return;
    const text = chunk.toString('utf8');
    const lines = text.split(/\r?\n/);
    // Keep trailing partials simple: if last element is empty, previous lines terminated cleanly;
    // otherwise we still emit it (best-effort for streaming data).
    lines.forEach((line) => {
      if (line.length > 0) onLine(line);
    });
  }

  const startedPromise = new Promise((resolve, reject) => {
    let timeoutHandle = null;
    if (connectTimeoutMs && connectTimeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Connect/bind timeout after ${connectTimeoutMs}ms`));
      }, connectTimeoutMs);
    }
    const clearTimer = () => { if (timeoutHandle) clearTimeout(timeoutHandle); };

    if (protocol === 'tcp' && mode === 'server') {
      const sockets = [];
      const server = net.createServer((socket) => {
        sockets.push(socket);
        logger.info(`TCP client connected from ${socket.remoteAddress}:${socket.remotePort}`);
        socket.on('data', emitLines);
        socket.on('error', (err) => onError(err));
        socket.on('close', () => {
          const idx = sockets.indexOf(socket);
          if (idx !== -1) sockets.splice(idx, 1);
        });
      });
      server.on('error', (err) => { clearTimer(); reject(err); onError(err); });
      server.listen(port, ip, () => {
        clearTimer();
        logger.info(`TCP server listening on ${ip}:${port}`);
        resolve();
      });
      closers.push(() => new Promise((res) => {
        sockets.forEach((s) => { try { s.destroy(); } catch (_) {} });
        server.close(() => res());
      }));
    } else if (protocol === 'tcp' && mode === 'client') {
      const { connectWaitForServer = false, connectRetryIntervalMs = 1000, connectTimeoutMs = 0 } = options;
      const retryEnabled = connectWaitForServer;
      let activeSocket = null;
      let everConnected = false;
      // retryStartTime tracks when the current retry cycle began so connectTimeoutMs
      // can enforce an overall deadline. Reset on each successful connection.
      let retryStartTime = Date.now();

      closers.push(() => new Promise((res) => {
        if (activeSocket) { try { activeSocket.destroy(); } catch (_) {} }
        res();
      }));

      const attempt = (resolve, reject) => {
        if (stopped) return;
        const socket = new net.Socket();
        activeSocket = socket;

        // 'error' must be handled to prevent an unhandled-exception crash.
        // The 'close' event always follows 'error' and is where we decide what to do.
        socket.once('error', (err) => {
          logger.warn(`TCP socket error (${ip}:${port}): ${err.message}`);
        });

        socket.on('close', () => {
          if (stopped) return;
          if (activeSocket === socket) activeSocket = null;

          const wasConnected = everConnected;

          if (!retryEnabled) {
            // Retry disabled: propagate via onError and reject the startedPromise if
            // we never managed to connect even once.
            const e = new Error(wasConnected
              ? `TCP connection to ${ip}:${port} closed`
              : `TCP connect to ${ip}:${port} failed`);
            clearTimer();
            onError(e);
            if (!wasConnected) reject(e);
            return;
          }

          const elapsed = Date.now() - retryStartTime;
          if (connectTimeoutMs > 0 && elapsed + connectRetryIntervalMs > connectTimeoutMs) {
            const label = wasConnected ? 'reconnect to' : 'connect to';
            const e = new Error(`Could not ${label} ${ip}:${port} within ${connectTimeoutMs}ms`);
            clearTimer();
            onError(e);
            if (!wasConnected) reject(e);
            return;
          }

          const action = wasConnected ? 'lost — reconnecting' : 'failed — retrying';
          logger.warn(`TCP connection to ${ip}:${port} ${action} in ${connectRetryIntervalMs}ms…`);
          setTimeout(() => attempt(resolve, reject), connectRetryIntervalMs);
        });

        socket.once('connect', () => {
          // Reset the retry start so connectTimeoutMs is measured from the most
          // recent successful connection, not from the very start of the session.
          retryStartTime = Date.now();
          socket.on('data', emitLines);
          if (!everConnected) {
            clearTimer();
            everConnected = true;
            logger.info(`TCP client connected to ${ip}:${port}`);
            resolve();
          } else {
            logger.info(`TCP client reconnected to ${ip}:${port}`);
          }
        });

        socket.connect(port, ip);
      };

      attempt(resolve, reject);
    } else if (protocol === 'udp' && mode === 'server') {
      const socket = dgram.createSocket('udp4');
      socket.on('message', (msg) => emitLines(msg));
      socket.on('error', (err) => { clearTimer(); onError(err); reject(err); });
      socket.on('listening', () => {
        clearTimer();
        const addr = socket.address();
        logger.info(`UDP server listening on ${addr.address}:${addr.port}`);
        resolve();
      });
      socket.bind(port, ip);
      closers.push(() => new Promise((res) => { try { socket.close(() => res()); } catch (_) { res(); } }));
    } else if (protocol === 'udp' && mode === 'client') {
      const socket = dgram.createSocket('udp4');
      socket.on('message', (msg) => emitLines(msg));
      socket.on('error', (err) => { clearTimer(); onError(err); reject(err); });
      socket.on('connect', () => {
        clearTimer();
        logger.info(`UDP client connected to ${ip}:${port}`);
        resolve();
      });
      socket.on('listening', () => { try { socket.connect(port, ip); } catch (err) { reject(err); } });
      socket.bind();
      closers.push(() => new Promise((res) => {
        try {
          if (typeof socket.remoteAddress === 'string') {
            try { socket.disconnect(); } catch (_) {}
          }
          socket.close(() => res());
        } catch (_) { res(); }
      }));
    } else if (protocol === 'grpc') {
      const { createGrpcServerTransport, createGrpcClientTransport } = require('./grpc-transport.js');
      const grpcSerialization = options.grpcSerialization || 'protobuf';
      const headerPathKey = options.grpcHeaderPathKey || 'grpc-path';
      const headerPath = options.grpcHeaderPath || 'replace.with.dedicated.uid';
      const useTls = options.useTls === true || options.useTls === 'true';
      const tlsCaPath = options.tlsCaPath || undefined;
      const tlsCertPath = options.tlsCertPath || undefined;
      const tlsKeyPath = options.tlsKeyPath || undefined;
      const showMetadata = options.showMetadata === true || options.showMetadata === 'true';
      const onMetaLine = showMetadata ? (text) => onLine(text) : null;
      const tlsLabel = useTls ? 'tls=on' : 'tls=off';
      if (mode === 'server') {
        const transport = createGrpcServerTransport({
          ip, port, grpcSerialization, headerPathKey, headerPath,
          useTls, tlsCaPath, tlsCertPath, tlsKeyPath,
          onData: (text) => onLine(text),
          onRawHeaders: onMetaLine,
        });
        transport.connect().then((result) => {
          clearTimer();
          logger.info(`gRPC server listening on ${result.address}:${result.port} [${grpcSerialization}]`);
          logger.info(`  ${result.tlsInfo || tlsLabel}`);
          closers.push(async () => transport.disconnect());
          resolve();
        }).catch((err) => { clearTimer(); reject(err); });
      } else {
        const transport = createGrpcClientTransport({
          ip, port, grpcSerialization, headerPathKey, headerPath,
          useTls, tlsCaPath, tlsCertPath, tlsKeyPath,
          onData: (text) => onLine(text),
          onMetadata: onMetaLine,
          onStatus: onMetaLine,
        });
        transport.connect().then((result) => {
          clearTimer();
          logger.info(`gRPC client connected to ${result.address} [${grpcSerialization}] ${headerPathKey}=${headerPath}`);
          logger.info(`  ${result.tlsInfo || 'tls=off'}`);
          closers.push(async () => transport.disconnect());
          resolve();
        }).catch((err) => { clearTimer(); reject(err); });
      }
    } else {
      reject(new Error(`Unsupported protocol/mode combination: ${protocol}/${mode}`));
    }
  });

  return {
    startedPromise,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      for (const close of closers) {
        try { await close(); } catch (err) { logger.warn(`Receiver close error: ${err.message}`); }
      }
    },
  };
}

/**
 * Runs one fully configured headless session.
 *
 * Behavior:
 * - constructs a diagnostics logger, a record sink, and a receiver
 * - forwards each received line through filter/exclude, into the sink and (optionally) stdout
 * - terminates when maxLogCount / durationMs / idleTimeoutMs is reached
 * - writes a done file (if requested) and exits the Electron app with a stable code
 */
async function runHeadlessSession(options, { app = null } = {}) {
  const logger = new RunLogger({
    logLevel: options.logLevel,
    stdout: options.stdout,
    logFile: options.logFile,
    runId: options.runId,
  });

  const filterRegex = options.filter ? new RegExp(options.filter) : null;
  const excludeRegex = options.exclude ? new RegExp(options.exclude) : null;

  const sink = new RecordSink({
    outputFile: options.outputFile,
    outputFormat: options.outputFormat,
    appendOutput: options.appendOutput,
  });
  const sinkIsStdout = sink.toStdout;

  const baseDonePayload = {
    runId: options.runId || null,
    protocol: options.protocol,
    mode: options.mode,
    ip: options.ip,
    port: options.port,
    outputFile: options.outputFile || null,
    outputSink: options.outputFile ? 'file' : 'stdout',
    outputFormat: options.outputFormat,
  };

  let linesReceived = 0;
  let linesWritten = 0;
  let byteCount = 0;
  let lastReceivedAt = Date.now();
  let stopReason = null;
  let runtimeError = null;
  let durationTimer = null;
  let idleTimer = null;

  const stopController = { triggered: false, resolve: null };
  const finished = new Promise((resolve) => { stopController.resolve = resolve; });
  const triggerStop = (reason) => {
    if (stopController.triggered) return;
    stopController.triggered = true;
    stopReason = reason;
    stopController.resolve();
  };

  const receiver = createReceiver(options, {
    logger,
    onLine: (line) => {
      if (stopController.triggered) return;
      linesReceived += 1;
      byteCount += Buffer.byteLength(line, 'utf8');
      lastReceivedAt = Date.now();

      if (filterRegex && !filterRegex.test(line)) return;
      if (excludeRegex && excludeRegex.test(line)) return;

      sink.write(line);
      linesWritten += 1;
      if (options.stdout && !sinkIsStdout) {
        process.stdout.write(`${line}\n`);
      }

      if (options.maxLogCount && linesWritten >= options.maxLogCount) {
        triggerStop('maxLogCount');
      }
    },
    onError: (err) => {
      logger.error(`Transport error: ${err.message}`);
      if (options.onError === 'exit' || !options.onError) {
        runtimeError = err;
        triggerStop('error');
      } else if (options.onError === 'pause') {
        logger.warn('onError=pause: keeping process alive after transport error.');
      }
      // onError=continue → keep going
    },
  });

  try {
    logger.info(`Starting headless capture → ${options.outputFile ? options.outputFile : 'stdout'} (${options.outputFormat})`);
    if (options.autoConnect === false) {
      logger.info('autoConnect=false: receiver will not be started.');
    } else {
      await receiver.startedPromise;
    }

    if (options.durationMs) {
      durationTimer = setTimeout(() => triggerStop('durationMs'), options.durationMs);
    }
    if (options.idleTimeoutMs && options.idleTimeoutMs > 0) {
      const checkIdle = () => {
        if (stopController.triggered) return;
        const idleFor = Date.now() - lastReceivedAt;
        if (idleFor >= options.idleTimeoutMs) {
          triggerStop('idleTimeoutMs');
        } else {
          idleTimer = setTimeout(checkIdle, Math.max(250, options.idleTimeoutMs - idleFor));
        }
      };
      idleTimer = setTimeout(checkIdle, options.idleTimeoutMs);
    }

    await finished;
  } catch (err) {
    runtimeError = err;
    stopReason = stopReason || 'error';
    logger.error(`Headless run failed: ${err.message}`);
  } finally {
    if (durationTimer) clearTimeout(durationTimer);
    if (idleTimer) clearTimeout(idleTimer);
    try { await receiver.stop(); } catch (err) { logger.warn(`Receiver stop error: ${err.message}`); }
    try { await sink.close(); } catch (err) { logger.warn(`Sink close error: ${err.message}`); }
  }

  const success = !runtimeError;
  const summary = {
    linesReceived,
    linesWritten,
    byteCount,
    stopReason,
  };

  if (success) {
    logger.info(`Headless run finished. stopReason=${stopReason || 'ok'} linesReceived=${linesReceived} linesWritten=${linesWritten}`);
  }

  writeDoneFile(options.doneFile, {
    ...baseDonePayload,
    success,
    summary,
    ...(runtimeError ? { error: { message: runtimeError.message, stack: runtimeError.stack }, failedAt: new Date().toISOString() } : {}),
  });

  const exitCode = success ? EXIT_CODES.success : EXIT_CODES.runtimeError;

  if (!options.exitOnComplete) {
    logger.info('exitOnComplete=false: keeping process alive. Terminate externally to exit.');
    return new Promise(() => {});
  }

  if (app) {
    app.exit(exitCode);
  }
  return exitCode;
}

module.exports = {
  EXIT_CODES,
  runHeadlessSession,
  writeDoneFile,
};

