/**
 * Copyright 2026 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
const {
  DEFAULT_UDP_CLIENT_REGISTRATION_INTERVAL_MS,
  isUdpClientRegistrationMessage,
  normalizeUdpConnectionMode,
  startUdpClientRegistration,
} = require('./udp-utils.js');
const {
  formatUdpEndpoint,
  resolveUdpEndpoint,
  formatSocketEndpoint,
  resolveSocketEndpoint,
  tcpSocketOptions,
} = require('./socket-address-utils.js');
const {
  decodeTcpHandshake,
  writeTcpHandshake,
} = require('./tcp-handshake-utils.js');
const {
  assertSocketPayloadFormat,
  attachTcpPayloadReceiver,
  finishTcpPayloadReceiver,
  createUdpPayloadReceiver,
} = require('./socket-payload-receiver.js');

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
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatTextRecord(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
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
      formatted = formatTextRecord(line);
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
 * Internal: creates a protocol receiver and emits each incoming record via `onLine`.
 *
 * The returned object exposes a `stop()` function and a `startedPromise` that resolves
 * when the socket is ready (listening or connected), respecting `connectTimeoutMs`.
 */
function createReceiver(options, {
  logger,
  onLine,
  onError,
  resolveSocket = resolveSocketEndpoint,
  writeHandshake = writeTcpHandshake,
}) {
  const { protocol, mode, ip, port, connectTimeoutMs } = options;
  let tcpHandshakeBytes = Buffer.alloc(0);
  let stopped = false;
  const closers = [];
  let cancelStartup = null;

  function payloadCallbacks(context) {
    return {
      format: options[`${protocol}Format`],
      isControlDatagram: isUdpClientRegistrationMessage,
      context,
      onRecord: (raw) => { if (!stopped) onLine(raw); },
      onWarning: (message, remote) => {
        const peer = remote?.address ? ` from ${remote.address}:${remote.port}` : '';
        logger.warn(`[Transport] ${protocol.toUpperCase()} payload${peer}: ${message}`);
      },
    };
  }

  const startedPromise = new Promise((resolve, reject) => {
    if (protocol === 'tcp') {
      try {
        tcpHandshakeBytes = decodeTcpHandshake(options.tcpHandshakeText, {
          useEscapes: options.tcpHandshakeUseEscapes,
        });
      } catch (error) {
        reject(error);
        return;
      }
    }
    if (protocol === 'tcp' || protocol === 'udp') {
      assertSocketPayloadFormat(options[`${protocol}Format`], `${protocol}Format`);
    }
    let timeoutHandle = null;
    if (connectTimeoutMs && connectTimeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        cancelStartup?.();
        reject(new Error(`Connect/bind timeout after ${connectTimeoutMs}ms`));
      }, connectTimeoutMs);
    }
    const clearTimer = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      cancelStartup = null;
    };

    if (protocol === 'tcp' && mode === 'server') {
      const sockets = [];
      const handshakeControllers = new Map();
      const server = net.createServer((socket) => {
        sockets.push(socket);
        logger.info(`TCP client connected from ${formatSocketEndpoint({ address: socket.remoteAddress, port: socket.remotePort })}`);
        attachTcpPayloadReceiver(socket, payloadCallbacks({ address: socket.remoteAddress, port: socket.remotePort }));
        const controller = new AbortController();
        handshakeControllers.set(socket, controller);
        writeHandshake(socket, tcpHandshakeBytes, {
          signal: controller.signal,
          timeoutMs: connectTimeoutMs,
        })
          .then(({ bytesWritten }) => {
            if (bytesWritten > 0) logger.debug(`TCP server greeting sent (${bytesWritten} bytes)`);
          })
          .catch((error) => {
            if (error.code !== 'TCP_HANDSHAKE_CANCELLED') {
              logger.warn('TCP server greeting could not be sent to one client.');
            }
          })
          .finally(() => handshakeControllers.delete(socket));
        socket.on('error', (err) => {
          if (!handshakeControllers.has(socket)) onError(err);
        });
        socket.on('close', () => {
          handshakeControllers.get(socket)?.abort();
          handshakeControllers.delete(socket);
          const idx = sockets.indexOf(socket);
          if (idx !== -1) sockets.splice(idx, 1);
        });
      });
      server.on('error', (err) => { clearTimer(); reject(err); onError(err); });
      closers.push(() => new Promise((res) => {
        sockets.forEach((s) => {
          handshakeControllers.get(s)?.abort();
          handshakeControllers.delete(s);
          finishTcpPayloadReceiver(s);
          try { s.destroy(); } catch (_) {}
        });
        server.close(() => res());
      }));
      resolveSocket(ip, options.tcpAddressFamily, {
        bind: true,
        protocol: 'TCP',
      }).then((endpoint) => {
        if (stopped) return;
        server.listen(tcpSocketOptions(endpoint, port, { bind: true }), () => {
          clearTimer();
          logger.info(`TCP server listening on ${formatSocketEndpoint(server.address())}`);
          resolve();
        });
      }).catch((error) => {
        clearTimer();
        reject(error);
      });
    } else if (protocol === 'tcp' && mode === 'client') {
      const { connectWaitForServer = false, connectRetryIntervalMs = 1000, connectTimeoutMs = 0 } = options;
      const retryEnabled = connectWaitForServer;
      let activeSocket = null;
      let activeHandshakeController = null;
      let everConnected = false;
      // retryStartTime tracks when the current retry cycle began so connectTimeoutMs
      // can enforce an overall deadline. Reset on each successful connection.
      let retryStartTime = Date.now();
      cancelStartup = () => {
        activeHandshakeController?.abort();
        try { activeSocket?.destroy(); } catch (_) {}
      };

      closers.push(() => new Promise((res) => {
        if (activeSocket) {
          activeHandshakeController?.abort();
          activeHandshakeController = null;
          finishTcpPayloadReceiver(activeSocket);
          try { activeSocket.destroy(); } catch (_) {}
        }
        res();
      }));

      const handleFailure = (resolve, reject, endpointLabel, cause) => {
        const wasConnected = everConnected;
        if (!retryEnabled) {
          const error = new Error(wasConnected
            ? `TCP connection to ${endpointLabel} closed`
            : `TCP connect to ${endpointLabel} failed`, { cause });
          clearTimer();
          onError(error);
          if (!wasConnected) reject(error);
          return;
        }
        const elapsed = Date.now() - retryStartTime;
        if (connectTimeoutMs > 0 && elapsed + connectRetryIntervalMs > connectTimeoutMs) {
          const label = wasConnected ? 'reconnect to' : 'connect to';
          const error = new Error(
            `Could not ${label} ${endpointLabel} within ${connectTimeoutMs}ms`,
            { cause },
          );
          clearTimer();
          onError(error);
          if (!wasConnected) reject(error);
          return;
        }
        const action = wasConnected ? 'lost — reconnecting' : 'failed — retrying';
        logger.warn(`TCP connection to ${endpointLabel} ${action} in ${connectRetryIntervalMs}ms…`);
        setTimeout(() => attempt(resolve, reject), connectRetryIntervalMs);
      };

      const connectEndpoint = (resolve, reject, endpoint) => {
        if (stopped) return;
        const endpointLabel = formatSocketEndpoint({ address: endpoint.address, port });
        const socket = new net.Socket();
        let handshakeFailed = false;
        let handshakePending = false;
        activeSocket = socket;
        attachTcpPayloadReceiver(socket, payloadCallbacks({ address: endpoint.address, port }));

        // 'error' must be handled to prevent an unhandled-exception crash.
        // The 'close' event always follows 'error' and is where we decide what to do.
        socket.once('error', (err) => {
          if (!handshakePending) {
            logger.warn(`TCP socket error (${endpointLabel}): ${err.message}`);
          }
        });

        socket.on('close', () => {
          if (stopped) return;
          if (activeSocket === socket) activeSocket = null;
          if (handshakeFailed) return;
          handleFailure(resolve, reject, endpointLabel);
        });

        socket.once('connect', () => {
          // Reset the retry start so connectTimeoutMs is measured from the most
          // recent successful connection, not from the very start of the session.
          handshakePending = true;
          const handshakeController = new AbortController();
          activeHandshakeController = handshakeController;
          writeHandshake(socket, tcpHandshakeBytes, {
            signal: handshakeController.signal,
            timeoutMs: connectTimeoutMs,
          })
            .then(({ bytesWritten }) => {
              if (stopped || socket !== activeSocket) return;
              retryStartTime = Date.now();
              if (!everConnected) {
                clearTimer();
                everConnected = true;
                logger.info(`TCP client connected to ${endpointLabel}`);
                resolve();
              } else {
                logger.info(`TCP client reconnected to ${endpointLabel}`);
              }
              if (bytesWritten > 0) logger.debug(`TCP client greeting sent (${bytesWritten} bytes)`);
            })
            .catch((error) => {
              if (stopped || error.code === 'TCP_HANDSHAKE_CANCELLED') return;
              handshakeFailed = true;
              clearTimer();
              onError(error);
              if (!everConnected) reject(error);
            })
            .finally(() => {
              handshakePending = false;
              if (activeHandshakeController === handshakeController) {
                activeHandshakeController = null;
              }
            });
        });

        socket.connect(tcpSocketOptions(endpoint, port));
      };

      const attempt = (resolve, reject) => {
        if (stopped) return;
        resolveSocket(ip, options.tcpAddressFamily, { protocol: 'TCP' })
          .then((endpoint) => connectEndpoint(resolve, reject, endpoint))
          .catch((error) => {
            if (stopped) return;
            handleFailure(resolve, reject, formatSocketEndpoint({ address: ip, port }), error);
          });
      };
      attempt(resolve, reject);
    } else if (protocol === 'udp' && mode === 'server') {
      let socket = null;
      closers.push(() => new Promise((res) => {
        if (!socket) return res();
        try { socket.close(() => res()); } catch (_) { res(); }
      }));
      resolveUdpEndpoint(ip, options.udpAddressFamily, { bind: true }).then((endpoint) => {
        if (stopped) return;
        socket = dgram.createSocket(endpoint.socketOptions);
        socket.on('message', createUdpPayloadReceiver({
          ...payloadCallbacks(),
          isControlDatagram: undefined,
        }));
        socket.on('error', (err) => { clearTimer(); onError(err); reject(err); });
        socket.on('listening', () => {
          clearTimer();
          const addr = socket.address();
          logger.info(`UDP server listening on ${formatUdpEndpoint(addr)}`);
          resolve();
        });
        socket.bind(port, endpoint.address);
      }).catch((error) => {
        clearTimer();
        reject(error);
      });
    } else if (protocol === 'udp' && mode === 'client') {
      const registrationIntervalMs = options.udpRegistrationIntervalMs
        ?? DEFAULT_UDP_CLIENT_REGISTRATION_INTERVAL_MS;
      const direct = normalizeUdpConnectionMode(options.udpConnectionMode) === 'direct';
      let socket = null;
      let registration = null;
      let registered = false;
      let receivedDatagram = false;
      closers.push(() => new Promise((res) => {
        if (registration) registration.stop();
        if (!socket) return res();
        try {
          if (typeof socket.remoteAddress === 'string') {
            try { socket.disconnect(); } catch (_) {}
          }
          socket.close(() => res());
        } catch (_) { res(); }
      }));
      resolveUdpEndpoint(
        direct ? options.udpLocalHost : ip,
        options.udpAddressFamily,
        { bind: direct },
      ).then((endpoint) => {
        if (stopped) return;
        const remoteLabel = formatUdpEndpoint({ address: endpoint.address, port });
        socket = dgram.createSocket(endpoint.socketOptions);
        const callbacks = payloadCallbacks();
        const receivePayload = createUdpPayloadReceiver({
          ...callbacks,
          isControlDatagram: direct ? undefined : isUdpClientRegistrationMessage,
          onRecord: (raw, remote) => {
            if (!receivedDatagram) {
              receivedDatagram = true;
              logger.info(`First UDP datagram received from ${formatUdpEndpoint(remote)}`);
            }
            callbacks.onRecord(raw, remote);
          },
        });
        socket.on('message', receivePayload);
        socket.on('error', (err) => {
          if (!direct && registered && err.code === 'ECONNREFUSED') {
            logger.warn(`UDP endpoint ${remoteLabel} refused a datagram; registration renewal remains active.`);
            return;
          }
          clearTimer();
          onError(err);
          reject(err);
        });
        if (direct) {
          socket.on('listening', () => {
            clearTimer();
            const local = socket.address();
            logger.info(
              `UDP client direct receiver ready at ${formatUdpEndpoint(local)}; no registration was sent. Awaiting datagrams from any source address and port.`
            );
            resolve();
          });
          socket.bind(options.udpLocalPort, endpoint.address);
          return;
        }
        socket.on('connect', () => {
          registration = startUdpClientRegistration(socket, {
            intervalMs: registrationIntervalMs,
            onError: (error) => {
              logger.warn(`UDP registration renewal failed for ${remoteLabel}: ${error.message}`);
            },
          });
          registration.ready.then(() => {
            if (stopped) return;
            clearTimer();
            registered = true;
            logger.info(
              `UDP client socket ready for ${remoteLabel}; registration sent and renews every ${registrationIntervalMs}ms without acknowledgment. Awaiting datagrams from that exact address and port.`
            );
            resolve();
          }).catch((error) => {
            if (stopped) return;
            clearTimer();
            reject(new Error(`UDP client registration failed: ${error.message}`));
          });
        });
        socket.on('listening', () => {
          try { socket.connect(port, endpoint.address); } catch (err) { reject(err); }
        });
        socket.bind();
      }).catch((error) => {
        clearTimer();
        reject(error);
      });
    } else if (protocol === 'http' || protocol === 'ws') {
      const isHttp = protocol === 'http';
      const {
        createHttpClientTransport,
        createHttpServerTransport,
      } = isHttp ? require('./http-transport.js') : {};
      const {
        createWsClientTransport,
        createWsServerTransport,
      } = !isHttp ? require('./ws-transport.js') : {};
      const createTransport = isHttp
        ? (mode === 'server' ? createHttpServerTransport : createHttpClientTransport)
        : (mode === 'server' ? createWsServerTransport : createWsClientTransport);
      const transport = createTransport({
        ...options,
        ip,
        port,
        onData: (data, metadata) => {
          if (options.showMetadata && metadata) {
            const fields = Object.entries(metadata)
              .filter(([, value]) => value !== '')
              .map(([key, value]) => `${key}=${value}`)
              .join(' ');
            onLine(`[metadata] ${fields}`);
          }
          onLine(data);
        },
      });
      closers.push(() => Promise.resolve(transport.disconnect()));
      transport.connect().then((result) => {
        clearTimer();
        const endpoint = mode === 'server'
          ? `${result.address.address}:${result.address.port}`
          : result.address;
        const label = isHttp ? 'HTTP' : 'WebSocket';
        logger.info(`${label} ${mode} ready at ${endpoint}; ${result.tlsInfo}`);
        resolve();
      }).catch((err) => {
        clearTimer();
        reject(err);
      });
    } else if (protocol === 'xmpp') {
      const { createXmppClientTransport, createXmppServerTransport } = require('./xmpp-transport');
      const createTransport = mode === 'server' ? createXmppServerTransport : createXmppClientTransport;
      const transport = createTransport({
        ...options,
        ip,
        port,
        onData: (body, metadata) => {
          if (options.showMetadata && metadata) {
            const fields = Object.entries(metadata)
              .filter(([, value]) => value !== '')
              .map(([key, value]) => `${key}=${value}`)
              .join(' ');
            onLine(`[metadata] ${fields}`);
          }
          onLine(body);
        },
        onStatus: (status) => logger.info(`[XMPP] ${status}`),
        onError,
      });
      closers.push(() => transport.disconnect());
      transport.connect().then((result) => {
        clearTimer();
        const endpoint = mode === 'server'
          ? `${result.address.address}:${result.address.port}`
          : result.address;
        logger.info(`[XMPP] ${mode} ready at ${endpoint}; ${result.tlsInfo}`);
        resolve();
      }).catch((err) => { clearTimer(); reject(err); });
    } else if (protocol === 'grpc') {
      const { createGrpcServerTransport, createGrpcClientTransport } = require('./grpc-transport.js');
      const grpcSerialization = options.grpcSerialization || 'protobuf';
      const headerPathKey = options.grpcHeaderPathKey || 'grpc-path';
      const headerPath = options.grpcHeaderPath || 'replace.with.dedicated.uid';
      const useTls = options.useTls === true || options.useTls === 'true';
      const tlsCaPath = options.tlsCaPath || undefined;
      const tlsCertPath = options.tlsCertPath || undefined;
      const tlsKeyPath = options.tlsKeyPath || undefined;
      const allowUnverifiedTls = options.allowUnverifiedTls === true || options.allowUnverifiedTls === 'true';
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
        // Registered before connect: a bind that fails part-way still has to
        // release whatever the transport already allocated.
        closers.push(async () => transport.disconnect());
        transport.connect().then((result) => {
          clearTimer();
          logger.info(`gRPC server listening on ${result.address}:${result.port} [${grpcSerialization}]`);
          logger.info(`  ${result.tlsInfo || tlsLabel}`);
          resolve();
        }).catch((err) => { clearTimer(); reject(err); });
      } else {
        const transport = createGrpcClientTransport({
          ip, port, grpcSerialization, headerPathKey, headerPath,
          useTls, tlsCaPath, tlsCertPath, tlsKeyPath, allowUnverifiedTls,
          onData: (text) => onLine(text),
          onMetadata: onMetaLine,
          onStatus: onMetaLine,
          onLog: (level, message) => logger[level] && logger[level](message),
        });
        // Registered before connect: a connect that fails after the channel was
        // created still has to close that channel.
        closers.push(async () => transport.disconnect());
        transport.connect().then((result) => {
          clearTimer();
          logger.info(`gRPC client connected to ${result.address} [${grpcSerialization}] ${headerPathKey}=${headerPath}`);
          logger.info(`  ${result.tlsInfo || 'tls=off'}`);
          resolve();
        }).catch((err) => { clearTimer(); reject(err); });
      }
    } else {
      reject(new Error(`Unsupported protocol/mode combination: ${protocol}/${mode}`));
    }
  });

  return {
    startedPromise,
    /**
     * Tears down every receiver resource without letting a teardown failure
     * change the outcome of the run.
     *
     * A peer that disappeared before shutdown, or a socket that never answered
     * its close handshake, is a diagnostic: a capture that already collected
     * its records must still report success and exit 0.
     */
    stop: async (context = 'after the run') => {
      if (stopped) return;
      stopped = true;
      for (const close of closers) {
        try { await close(); } catch (err) { logger.warn(`[Transport] Teardown ${context} reported: ${err.message}`); }
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
async function runHeadlessSession(options, { app = null, logger = null } = {}) {
  if (!logger) {
    logger = new RunLogger({
      logLevel: options.logLevel,
      stdout: options.stdout,
      logFile: options.logFile,
      runId: options.runId,
    });
  }

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
        process.stdout.write(formatTextRecord(line));
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
    const teardownContext = runtimeError ? 'after a failed run' : 'after the run';
    try {
      await receiver.stop(teardownContext);
    } catch (err) {
      // Teardown is total: it is reported, never allowed to fail a completed run.
      logger.warn(`[Transport] Teardown ${teardownContext} reported: ${err.message}`);
    }
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
  createReceiver,
  runHeadlessSession,
  writeDoneFile,
};
