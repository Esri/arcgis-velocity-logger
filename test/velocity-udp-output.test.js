const assert = require('assert');
const dgram = require('dgram');
const { buildVelocityConnectionOptions } = require('../src/velocity-connection-options.js');
const { createUdpPayloadReceiver } = require('../src/socket-payload-receiver.js');
const {
  UDP_CLIENT_REGISTRATION_MESSAGE,
  isUdpClientRegistrationMessage,
} = require('../src/udp-utils.js');

function closeSocket(socket) {
  return new Promise((resolve) => {
    try { socket.close(resolve); } catch (_) { resolve(); }
  });
}

function bindEphemeral(socket) {
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      socket.removeListener('error', reject);
      resolve(socket.address());
    });
  });
}

function send(socket, payload, port) {
  return new Promise((resolve, reject) => {
    socket.send(Buffer.from(payload), port, '127.0.0.1', (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function verifyVelocityOutput(outputType) {
  const receiver = dgram.createSocket('udp4');
  const sender = dgram.createSocket('udp4');
  const received = [];
  const warnings = [];
  let unexpectedOutboundPackets = 0;

  try {
    const address = await bindEphemeral(receiver);
    await bindEphemeral(sender);
    const options = buildVelocityConnectionOptions({
      outputType,
      host: '127.0.0.1',
      port: address.port,
      format: 'delimited',
    });
    assert.strictEqual(options.connectionType, 'udp-server');
    assert.strictEqual(options.ip, '127.0.0.1');

    sender.on('message', () => { unexpectedOutboundPackets += 1; });
    const receive = createUdpPayloadReceiver({
      format: options.udpFormat,
      onRecord: (raw) => received.push(raw),
      onWarning: (warning) => warnings.push(warning),
    });
    receiver.on('message', receive);

    const whitespacePayload = '  café,雪  \n';
    await send(sender, whitespacePayload, address.port);
    await send(sender, UDP_CLIENT_REGISTRATION_MESSAGE, address.port);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out receiving Velocity UDP datagrams')), 1000);
      const check = () => {
        if (received.length < 2) return setTimeout(check, 5);
        clearTimeout(timeout);
        resolve();
      };
      check();
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.deepStrictEqual(received, [whitespacePayload, UDP_CLIENT_REGISTRATION_MESSAGE]);
    assert.deepStrictEqual(warnings, []);
    assert.strictEqual(unexpectedOutboundPackets, 0);
  } finally {
    await closeSocket(sender);
    await closeSocket(receiver);
  }
}

(async () => {
  for (const outputType of ['udp-client', 'udp-server']) {
    await verifyVelocityOutput(outputType);
  }
  assert.strictEqual(
    isUdpClientRegistrationMessage(Buffer.from(UDP_CLIENT_REGISTRATION_MESSAGE)),
    true,
  );
  console.log('velocity UDP output tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
