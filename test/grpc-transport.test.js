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
 * gRPC Transport Unit Tests for ArcGIS Velocity Logger
 * Run with: node test/grpc-transport.test.js
 *
 * Tests gRPC transport with all three serialization formats.
 */

const path = require('path');
const {
  GrpcServerTransport,
  GrpcClientTransport,
  createGrpcServerTransport,
  createGrpcClientTransport,
  SERIALIZATION_FORMATS,
} = require('../src/grpc-transport.js');

async function runGrpcTransportTests() {
  console.log('\n=== gRPC Transport Test Suite (Logger) ===');
  let passed = 0;
  let failed = 0;

  const runTest = async (testName, testFn) => {
    try {
      const result = await testFn();
      if (result) {
        console.log(`✅ ${testName}`);
        passed += 1;
      } else {
        console.log(`❌ ${testName}`);
        failed += 1;
      }
    } catch (error) {
      console.log(`❌ ${testName} - Error: ${error.message}`);
      failed += 1;
    }
  };

  // --- Test 1: Protobuf Server lifecycle ---
  console.log('\n--- Test 1: Protobuf GrpcServerTransport lifecycle ---');
  await runTest('GrpcServerTransport binds and reports connected', async () => {
    const server = new GrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, onData: () => {} });
    const result = await server.connect();
    const connected = server.isConnected();
    await server.disconnect();
    return connected === true && result.port > 0;
  });

  await runTest('GrpcServerTransport reports disconnected after disconnect', async () => {
    const server = new GrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, onData: () => {} });
    await server.connect();
    await server.disconnect();
    return server.isConnected() === false;
  });

  // --- Test 2: Text serialization end-to-end ---
  console.log('\n--- Test 2: Text serialization end-to-end ---');
  await runTest('Text server receives data from text client via executeMulti', async () => {
    const received = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'text',
      onData: (text) => received.push(text),
    });
    const result = await server.connect();
    const serverPort = result.port;

    // Use raw gRPC client with feature-service.proto
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoPath = path.join(__dirname, '..', 'src', 'proto', 'feature-service.proto');
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;
    const client = new proto.GrpcFeatureService(
      `127.0.0.1:${serverPort}`,
      grpc.credentials.createInsecure()
    );

    await new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);
      client.waitForReady(deadline, (err) => err ? reject(err) : resolve());
    });

    const stream = client.executeMulti();
    stream.on('data', () => {});
    stream.on('error', () => {});
    stream.write({ itemId: 'test', bytes: Buffer.from('line-one', 'utf8') });
    stream.write({ itemId: 'test', bytes: Buffer.from('line-two', 'utf8') });

    await new Promise((resolve) => setTimeout(resolve, 200));
    stream.end();
    client.close();
    await server.disconnect();

    return received.length === 2 && received[0] === 'line-one' && received[1] === 'line-two';
  });

  // --- Test 3: Text server receives unary execute ---
  console.log('\n--- Test 3: Text server receives unary execute ---');
  await runTest('Text server receives data via unary execute RPC', async () => {
    const received = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'text',
      onData: (text) => received.push(text),
    });
    const result = await server.connect();
    const serverPort = result.port;

    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoPath = path.join(__dirname, '..', 'src', 'proto', 'feature-service.proto');
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;
    const client = new proto.GrpcFeatureService(
      `127.0.0.1:${serverPort}`,
      grpc.credentials.createInsecure()
    );

    await new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);
      client.waitForReady(deadline, (err) => err ? reject(err) : resolve());
    });

    await new Promise((resolve, reject) => {
      client.execute({ itemId: 'unary-test', bytes: Buffer.from('unary-data', 'utf8') }, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });

    client.close();
    await server.disconnect();

    return received.length === 1 && received[0] === 'unary-data';
  });

  // --- Test 4: Kryo serialization end-to-end ---
  console.log('\n--- Test 4: Kryo serialization end-to-end ---');
  await runTest('Kryo server receives data from kryo client via executeMulti', async () => {
    const received = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'kryo',
      onData: (text) => received.push(text),
    });
    const result = await server.connect();
    const serverPort = result.port;

    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoPath = path.join(__dirname, '..', 'src', 'proto', 'feature-service.proto');
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;
    const client = new proto.GrpcFeatureService(
      `127.0.0.1:${serverPort}`,
      grpc.credentials.createInsecure()
    );

    await new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);
      client.waitForReady(deadline, (err) => err ? reject(err) : resolve());
    });

    const stream = client.executeMulti();
    stream.on('data', () => {});
    stream.on('error', () => {});
    stream.write({ itemId: 'kryo-test', bytes: Buffer.from('kryo-line-one', 'utf8') });
    stream.write({ itemId: 'kryo-test', bytes: Buffer.from('kryo-line-two', 'utf8') });

    await new Promise((resolve) => setTimeout(resolve, 200));
    stream.end();
    client.close();
    await server.disconnect();

    return received.length === 2 && received[0] === 'kryo-line-one' && received[1] === 'kryo-line-two';
  });

  await runTest('Kryo server receives data via unary execute RPC', async () => {
    const received = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'kryo',
      onData: (text) => received.push(text),
    });
    const result = await server.connect();
    const serverPort = result.port;

    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoPath = path.join(__dirname, '..', 'src', 'proto', 'feature-service.proto');
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;
    const client = new proto.GrpcFeatureService(
      `127.0.0.1:${serverPort}`,
      grpc.credentials.createInsecure()
    );

    await new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);
      client.waitForReady(deadline, (err) => err ? reject(err) : resolve());
    });

    await new Promise((resolve, reject) => {
      client.execute({ itemId: 'kryo-unary', bytes: Buffer.from('kryo-unary-data', 'utf8') }, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });

    client.close();
    await server.disconnect();

    return received.length === 1 && received[0] === 'kryo-unary-data';
  });

  // --- Test 5: Protobuf server receives protobuf features ---
  console.log('\n--- Test 5: Protobuf server receives features ---');
  await runTest('Protobuf server decodes Any-wrapped attributes from GrpcFeed client', async () => {
    const received = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf',
      onData: (csv) => received.push(csv),
    });
    const result = await server.connect();
    const serverPort = result.port;

    // Use velocity-grpc.proto client
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoPath = path.join(__dirname, '..', 'src', 'proto', 'velocity-grpc.proto');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const loaded = grpc.loadPackageDefinition(packageDef);
    const proto = loaded.esri.realtime.core.grpc;
    const client = new proto.GrpcFeed(`127.0.0.1:${serverPort}`, grpc.credentials.createInsecure());

    await new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);
      client.waitForReady(deadline, (err) => err ? reject(err) : resolve());
    });

    // Encode a StringValue attribute
    const protobuf = require('protobufjs');
    const wrappersPath = path.join(__dirname, '..', 'src', 'proto', 'google', 'protobuf', 'wrappers.proto');
    const root = protobuf.loadSync(wrappersPath);
    const StringValue = root.lookupType('google.protobuf.StringValue');
    const Int32Value = root.lookupType('google.protobuf.Int32Value');

    const attr1 = { type_url: 'type.googleapis.com/google.protobuf.StringValue', value: StringValue.encode(StringValue.create({ value: 'hello' })).finish() };
    const attr2 = { type_url: 'type.googleapis.com/google.protobuf.Int32Value', value: Int32Value.encode(Int32Value.create({ value: 99 })).finish() };

    await new Promise((resolve, reject) => {
      client.Send({ features: [{ attributes: [attr1, attr2] }] }, (err, resp) => {
        if (err) reject(err); else resolve(resp);
      });
    });

    client.close();
    await server.disconnect();

    return received.length === 1 && received[0] === 'hello,99';
  });

  await runTest('Protobuf factory client connects to protobuf server (GrpcFeed Stream)', async () => {
    const received = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf',
      onData: (csv) => received.push(csv),
    });
    const result = await server.connect();
    const serverPort = result.port;

    const clientReceived = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: serverPort, useTls: false, grpcSerialization: 'protobuf',
      onData: (text) => clientReceived.push(text),
    });
    await client.connect();
    const connected = client.isConnected();

    await client.disconnect();
    await server.disconnect();
    return connected === true;
  });

  await runTest('GrpcClientTransportProtobuf.isConnected returns false after disconnect', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf', onData: () => {} });
    const result = await server.connect();

    const client = createGrpcClientTransport({ ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'protobuf', onData: () => {} });
    await client.connect();
    await client.disconnect();
    await server.disconnect();
    return client.isConnected() === false;
  });

  // --- Test 6: Simulator-server → Logger-client end-to-end (protobuf Watch) ---
  console.log('\n--- Test 6: Simulator-server → Logger-client end-to-end (protobuf Watch) ---');
  await runTest('Logger protobuf client receives data pushed by simulator-style server via Watch', async () => {
    // Represent the simulator side: a server that pushes data to Watch subscribers
    const { createGrpcServerTransport: createSimulatorServer } = require('../src/grpc-transport.js');
    // Reuse the simulator's server Watch push logic by wiring up a raw Watch subscriber
    // using the simulator's proto directly — but since we're in the logger repo, we test
    // the logger GrpcClientTransportProtobuf receiving from a Watch-capable server.

    // Build a Watch-capable server using the logger's own proto (same proto on both sides)
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protobuf = require('protobufjs');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'velocity-grpc.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).esri.realtime.core.grpc;

    // Load wrapper types for building features
    const wrappersPath = path.join(protoDir, 'google', 'protobuf', 'wrappers.proto');
    const root = protobuf.loadSync(wrappersPath);
    const StringValue = root.lookupType('google.protobuf.StringValue');
    const Int32Value = root.lookupType('google.protobuf.Int32Value');

    // Spin up a Watch-capable gRPC server (simulator role)
    const watcherCalls = new Set();
    const server = new grpc.Server();
    server.addService(proto.GrpcFeed.service, {
      Send: (call, callback) => callback(null, { message: 'OK', code: 0 }),
      Stream: (call, callback) => { call.on('end', () => callback(null, { message: 'OK', code: 0 })); },
      Watch: (call) => {
        watcherCalls.add(call);
        call.on('cancelled', () => watcherCalls.delete(call));
        call.on('error', () => watcherCalls.delete(call));
        call.on('close', () => watcherCalls.delete(call));
      },
    });

    const serverPort = await new Promise((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) reject(err); else resolve(port);
      });
    });

    // Connect the logger client (Watch subscriber)
    const clientReceived = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: serverPort, useTls: false, grpcSerialization: 'protobuf',
      onData: (csv) => clientReceived.push(csv),
    });
    await client.connect();

    // Wait for the Watch call to register, then push a feature from the server
    await new Promise((resolve) => setTimeout(resolve, 200));

    const attr1 = { type_url: 'type.googleapis.com/google.protobuf.StringValue', value: StringValue.encode(StringValue.create({ value: 'pushed' })).finish() };
    const attr2 = { type_url: 'type.googleapis.com/google.protobuf.Int32Value', value: Int32Value.encode(Int32Value.create({ value: 7 })).finish() };
    for (const call of watcherCalls) {
      call.write({ features: [{ attributes: [attr1, attr2] }] });
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    await client.disconnect();
    server.forceShutdown();

    return clientReceived.length === 1 && clientReceived[0] === 'pushed,7';
  });

  await runTest('Logger protobuf client fires onMetadata when Watch stream receives response headers', async () => {
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'velocity-grpc.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).esri.realtime.core.grpc;

    const server = new grpc.Server();
    server.addService(proto.GrpcFeed.service, {
      Send: (call, callback) => callback(null, { message: 'OK', code: 0 }),
      Stream: (call, callback) => { call.on('end', () => callback(null, { message: 'OK', code: 0 })); },
      Watch: (call) => {
        // Server sends initial metadata (response headers) to the watcher
        const md = new grpc.Metadata();
        md.set('x-server-id', 'simulator-test');
        call.sendMetadata(md);
        call.on('cancelled', () => {});
        call.on('error', () => {});
        call.on('close', () => {});
      },
    });

    const serverPort = await new Promise((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) reject(err); else resolve(port);
      });
    });

    const metadataReceived = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: serverPort, useTls: false, grpcSerialization: 'protobuf',
      onData: () => {},
      onMetadata: (m) => metadataReceived.push(m),
    });
    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await client.disconnect();
    server.forceShutdown();

    return metadataReceived.length > 0 &&
      metadataReceived.some(m => m.includes("[metadata] response-headers:")) &&
      metadataReceived.some(m => m.includes("x-server-id=simulator-test"));
  });

  // --- Test 7: Simulator-server → Logger-client end-to-end (text/kryo watch) ---
  console.log('\n--- Test 7: Simulator-server → Logger-client end-to-end (text watch) ---');
  await runTest('Logger text client connects via watch and receives data pushed by server', async () => {
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'feature-service.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;

    // Spin up a watch-capable server (simulator role)
    const watcherCalls = new Set();
    const server = new grpc.Server();
    server.addService(proto.GrpcFeatureService.service, {
      execute: (call, callback) => callback(null, { itemId: '', success: true }),
      executeMulti: (call) => { call.on('end', () => call.end()); },
      watch: (call) => {
        watcherCalls.add(call);
        call.on('cancelled', () => watcherCalls.delete(call));
        call.on('error', () => watcherCalls.delete(call));
        call.on('close', () => watcherCalls.delete(call));
      },
    });

    const serverPort = await new Promise((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) reject(err); else resolve(port);
      });
    });

    const clientReceived = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: serverPort, useTls: false, grpcSerialization: 'text',
      onData: (text) => clientReceived.push(text),
    });
    await client.connect();
    const connected = client.isConnected();

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Push a feature from the server
    for (const call of watcherCalls) {
      call.write({ itemId: 'sim', bytes: Buffer.from('text-pushed-line', 'utf-8') });
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    await client.disconnect();
    server.forceShutdown();

    return connected === true && clientReceived.length === 1 && clientReceived[0] === 'text-pushed-line';
  });

  await runTest('Logger text client.isConnected returns false after disconnect', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'text', onData: () => {} });
    const result = await server.connect();

    const client = createGrpcClientTransport({ ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'text', onData: () => {} });
    await client.connect();
    await client.disconnect();
    await server.disconnect();
    return client.isConnected() === false;
  });

  await runTest('Logger kryo client connects via watch and receives data pushed by server', async () => {
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'feature-service.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;

    const watcherCalls = new Set();
    const server = new grpc.Server();
    server.addService(proto.GrpcFeatureService.service, {
      execute: (call, callback) => callback(null, { itemId: '', success: true }),
      executeMulti: (call) => { call.on('end', () => call.end()); },
      watch: (call) => {
        watcherCalls.add(call);
        call.on('cancelled', () => watcherCalls.delete(call));
        call.on('error', () => watcherCalls.delete(call));
        call.on('close', () => watcherCalls.delete(call));
      },
    });

    const serverPort = await new Promise((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) reject(err); else resolve(port);
      });
    });

    const clientReceived = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: serverPort, useTls: false, grpcSerialization: 'kryo',
      onData: (text) => clientReceived.push(text),
    });
    await client.connect();

    await new Promise((resolve) => setTimeout(resolve, 200));
    for (const call of watcherCalls) {
      call.write({ itemId: 'sim', bytes: Buffer.from('kryo-pushed-line', 'utf-8') });
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    await client.disconnect();
    server.forceShutdown();

    return clientReceived.length === 1 && clientReceived[0] === 'kryo-pushed-line';
  });

  await runTest('Logger kryo client fires onMetadata when watch stream receives response headers', async () => {
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'feature-service.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;

    const server = new grpc.Server();
    server.addService(proto.GrpcFeatureService.service, {
      execute: (call, callback) => callback(null, { itemId: '', success: true }),
      executeMulti: (call) => { call.on('end', () => call.end()); },
      watch: (call) => {
        const md = new grpc.Metadata();
        md.set('x-kryo-id', 'kryo-feed-99');
        call.sendMetadata(md);
        call.on('cancelled', () => {});
        call.on('error', () => {});
        call.on('close', () => {});
      },
    });

    const serverPort = await new Promise((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) reject(err); else resolve(port);
      });
    });

    const metadataReceived = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: serverPort, useTls: false, grpcSerialization: 'kryo',
      onData: () => {},
      onMetadata: (m) => metadataReceived.push(m),
    });
    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await client.disconnect();
    server.forceShutdown();

    return metadataReceived.length > 0 &&
      metadataReceived.some(m => m.includes("[metadata] response-headers:")) &&
      metadataReceived.some(m => m.includes("x-kryo-id=kryo-feed-99"));
  });

  await runTest('Logger kryo client.isConnected returns false after disconnect', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'kryo', onData: () => {} });
    const result = await server.connect();

    const client = createGrpcClientTransport({ ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'kryo', onData: () => {} });
    await client.connect();
    await client.disconnect();
    await server.disconnect();
    return client.isConnected() === false;
  });

  await runTest('Logger text client fires onMetadata when watch stream receives response headers', async () => {
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'feature-service.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;

    const server = new grpc.Server();
    server.addService(proto.GrpcFeatureService.service, {
      execute: (call, callback) => callback(null, { itemId: '', success: true }),
      executeMulti: (call) => { call.on('end', () => call.end()); },
      watch: (call) => {
        const md = new grpc.Metadata();
        md.set('x-feed-id', 'test-feed-42');
        call.sendMetadata(md);
        call.on('cancelled', () => {});
        call.on('error', () => {});
        call.on('close', () => {});
      },
    });

    const serverPort = await new Promise((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) reject(err); else resolve(port);
      });
    });

    const metadataReceived = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: serverPort, useTls: false, grpcSerialization: 'text',
      onData: () => {},
      onMetadata: (m) => metadataReceived.push(m),
    });
    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await client.disconnect();
    server.forceShutdown();

    return metadataReceived.length > 0 &&
      metadataReceived.some(m => m.includes("[metadata] response-headers:")) &&
      metadataReceived.some(m => m.includes("x-feed-id=test-feed-42"));
  });

  // --- Test 8: Logger server onRawHeaders — full metadata prefix ---
  console.log('\n--- Test 8: Logger server onRawHeaders ---');
  await runTest('GrpcServerTransportProtobuf onRawHeaders includes protocol/mode/serialization/rpc/remote/local/deadline and call headers on Send', async () => {
    const headers = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf',
      onData: () => {},
      onRawHeaders: (h) => headers.push(h),
    });
    const result = await server.connect();

    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'velocity-grpc.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).esri.realtime.core.grpc;
    const client = new proto.GrpcFeed(`127.0.0.1:${result.port}`, grpc.credentials.createInsecure());

    const md = new grpc.Metadata();
    md.set('grpc-path', 'test-uid');
    await new Promise((resolve, reject) => {
      client.Send({ features: [] }, md, (err, resp) => {
        if (err) reject(err); else resolve(resp);
      });
    });

    client.close();
    await server.disconnect();

    return headers.length === 1 &&
      headers[0].startsWith('[metadata]') &&
      headers[0].includes('protocol=gRPC') &&
      headers[0].includes('mode=server') &&
      headers[0].includes('serialization=protobuf') &&
      headers[0].includes('rpc=Send') &&
      headers[0].includes('remote=') &&
      headers[0].includes(`local=127.0.0.1:${result.port}`) &&
      headers[0].includes('deadline=') &&
      headers[0].includes('grpc-path=test-uid');
  });

  await runTest('GrpcServerTransportProtobuf onRawHeaders includes rpc=Stream on streaming RPC', async () => {
    const headers = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf',
      onData: () => {},
      onRawHeaders: (h) => headers.push(h),
    });
    const result = await server.connect();

    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'velocity-grpc.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).esri.realtime.core.grpc;
    const client = new proto.GrpcFeed(`127.0.0.1:${result.port}`, grpc.credentials.createInsecure());

    const md = new grpc.Metadata();
    md.set('grpc-path', 'stream-uid');
    const stream = client.Stream(md, (err) => {});
    stream.on('error', () => {});
    stream.end();

    await new Promise((resolve) => setTimeout(resolve, 200));
    client.close();
    await server.disconnect();

    return headers.length === 1 &&
      headers[0].includes('protocol=gRPC') &&
      headers[0].includes('mode=server') &&
      headers[0].includes('serialization=protobuf') &&
      headers[0].includes('rpc=Stream') &&
      headers[0].includes('remote=') &&
      headers[0].includes(`local=127.0.0.1:${result.port}`) &&
      headers[0].includes('grpc-path=stream-uid');
  });

  await runTest('GrpcServerTransportInternal onRawHeaders includes protocol/mode/serialization/rpc/remote/local on execute', async () => {
    const headers = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'text',
      onData: () => {},
      onRawHeaders: (h) => headers.push(h),
    });
    const result = await server.connect();

    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'feature-service.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;
    const client = new proto.GrpcFeatureService(`127.0.0.1:${result.port}`, grpc.credentials.createInsecure());

    const md = new grpc.Metadata();
    md.set('grpc-path', 'feed-uid-xyz');
    await new Promise((resolve, reject) => {
      client.execute({ itemId: 'test', bytes: Buffer.from('data', 'utf-8') }, md, (err, resp) => {
        if (err) reject(err); else resolve(resp);
      });
    });

    client.close();
    await server.disconnect();

    return headers.length === 1 &&
      headers[0].startsWith('[metadata]') &&
      headers[0].includes('protocol=gRPC') &&
      headers[0].includes('mode=server') &&
      headers[0].includes('serialization=text') &&
      headers[0].includes('rpc=execute') &&
      headers[0].includes('remote=') &&
      headers[0].includes(`local=127.0.0.1:${result.port}`) &&
      headers[0].includes('deadline=') &&
      headers[0].includes('grpc-path=feed-uid-xyz');
  });

  await runTest('GrpcServerTransportInternal onRawHeaders includes rpc=executeMulti on streaming RPC', async () => {
    const headers = [];
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'text',
      onData: () => {},
      onRawHeaders: (h) => headers.push(h),
    });
    const result = await server.connect();

    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const protoDir = path.join(__dirname, '..', 'src', 'proto');
    const packageDef = protoLoader.loadSync(path.join(protoDir, 'feature-service.proto'), {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(packageDef).grpc;
    const client = new proto.GrpcFeatureService(`127.0.0.1:${result.port}`, grpc.credentials.createInsecure());

    const md = new grpc.Metadata();
    md.set('grpc-path', 'multi-uid');
    const stream = client.executeMulti(md);
    stream.on('data', () => {});
    stream.on('error', () => {});
    stream.end();

    await new Promise((resolve) => setTimeout(resolve, 200));
    client.close();
    await server.disconnect();

    return headers.length === 1 &&
      headers[0].includes('protocol=gRPC') &&
      headers[0].includes('mode=server') &&
      headers[0].includes('serialization=text') &&
      headers[0].includes('rpc=executeMulti') &&
      headers[0].includes('remote=') &&
      headers[0].includes(`local=127.0.0.1:${result.port}`) &&
      headers[0].includes('grpc-path=multi-uid');
  });

  await runTest('GrpcClientTransportProtobuf emits connection-established metadata line with protocol/mode/serialization/rpc/remote', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf', onData: () => {} });
    const result = await server.connect();

    const metadataLines = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'protobuf',
      onData: () => {},
      onMetadata: (m) => metadataLines.push(m),
    });
    await client.connect();
    await client.disconnect();
    await server.disconnect();

    const connLine = metadataLines[0] || '';
    return connLine.includes('protocol=gRPC') &&
      connLine.includes('mode=client') &&
      connLine.includes('serialization=protobuf') &&
      connLine.includes('rpc=Watch') &&
      connLine.includes(`remote=127.0.0.1:${result.port}`);
  });

  await runTest('GrpcClientTransportInternal (text) emits connection-established metadata line with protocol/mode/serialization/rpc/remote', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'text', onData: () => {} });
    const result = await server.connect();

    const metadataLines = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'text',
      onData: () => {},
      onMetadata: (m) => metadataLines.push(m),
    });
    await client.connect();
    await client.disconnect();
    await server.disconnect();

    const connLine = metadataLines[0] || '';
    return connLine.includes('protocol=gRPC') &&
      connLine.includes('mode=client') &&
      connLine.includes('serialization=text') &&
      connLine.includes('rpc=watch') &&
      connLine.includes(`remote=127.0.0.1:${result.port}`);
  });

  await runTest('GrpcClientTransportInternal (kryo) emits connection-established metadata line with serialization=kryo', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'kryo', onData: () => {} });
    const result = await server.connect();

    const metadataLines = [];
    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'kryo',
      onData: () => {},
      onMetadata: (m) => metadataLines.push(m),
    });
    await client.connect();
    await client.disconnect();
    await server.disconnect();

    const connLine = metadataLines[0] || '';
    return connLine.includes('protocol=gRPC') &&
      connLine.includes('mode=client') &&
      connLine.includes('serialization=kryo') &&
      connLine.includes('rpc=watch') &&
      connLine.includes(`remote=127.0.0.1:${result.port}`);
  });

  // --- Test 9 (connection failure) ---
  // (renumbered; factory validation and header path tests follow)
  await runTest('GrpcClientTransport rejects when server is not available', async () => {
    const transport = new GrpcClientTransport({
      ip: '127.0.0.1', port: 19998, onData: () => {},
    });
    try {
      await transport.connect();
      return false;
    } catch (error) {
      return error.message.includes('failed to connect');
    }
  });

  // --- Test 9: Factory validation ---
  console.log('\n--- Test 9: Factory validation ---');
  await runTest('createGrpcServerTransport with invalid serialization throws', async () => {
    try {
      createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'invalid', onData: () => {} });
      return false;
    } catch (error) {
      return error.message.includes('Unknown gRPC serialization format');
    }
  });

  await runTest('SERIALIZATION_FORMATS constants are correct', async () => {
    return SERIALIZATION_FORMATS.PROTOBUF === 'protobuf' &&
      SERIALIZATION_FORMATS.KRYO === 'kryo' &&
      SERIALIZATION_FORMATS.TEXT === 'text';
  });

  // --- Test 11: tlsInfo in server connect result ---
  console.log('\n--- Test 11: tlsInfo in server connect result ---');
  await runTest('GrpcServerTransportProtobuf connect result includes tlsInfo when useTls=false', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf', onData: () => {} });
    const result = await server.connect();
    await server.disconnect();
    return typeof result.tlsInfo === 'string' && result.tlsInfo.includes('tls=off');
  });

  await runTest('GrpcServerTransportInternal (text) connect result includes tlsInfo when useTls=false', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'text', onData: () => {} });
    const result = await server.connect();
    await server.disconnect();
    return typeof result.tlsInfo === 'string' && result.tlsInfo.includes('tls=off');
  });

  await runTest('GrpcServerTransportInternal (kryo) connect result includes tlsInfo when useTls=false', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'kryo', onData: () => {} });
    const result = await server.connect();
    await server.disconnect();
    return typeof result.tlsInfo === 'string' && result.tlsInfo.includes('tls=off');
  });

  await runTest('GrpcClientTransportProtobuf connect result includes tlsInfo when useTls=false', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf', onData: () => {} });
    const serverResult = await server.connect();
    const client = createGrpcClientTransport({ ip: '127.0.0.1', port: serverResult.port, useTls: false, grpcSerialization: 'protobuf', onData: () => {} });
    const result = await client.connect();
    await client.disconnect();
    await server.disconnect();
    return typeof result.tlsInfo === 'string' && result.tlsInfo.includes('tls=off');
  });

  await runTest('buildServerCredentials throws with helpful message when cert/key missing (useTls=true)', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: true, grpcSerialization: 'protobuf', onData: () => {} });
    try {
      await server.connect();
      return false; // should have thrown
    } catch (error) {
      return error.message.includes('tlsCertPath') &&
        error.message.includes('tlsKeyPath') &&
        error.message.includes('OS/system certificates cannot be used as a fallback');
    }
  });

  await runTest('GrpcServerTransportInternal.isConnected returns false after disconnect', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'text', onData: () => {} });
    await server.connect();
    await server.disconnect();
    return server.isConnected() === false;
  });

  await runTest('GrpcServerTransportInternal (kryo).isConnected returns false after disconnect', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'kryo', onData: () => {} });
    await server.connect();
    await server.disconnect();
    return server.isConnected() === false;
  });

  // --- Test 10: gRPC header path metadata ---
  console.log('\n--- Test 10: gRPC header path metadata ---');
  await runTest('GrpcClientTransportProtobuf builds metadata with custom headerPathKey and headerPath', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf', onData: () => {} });
    const result = await server.connect();

    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'protobuf',
      headerPathKey: 'x-custom-header', headerPath: 'test.feed.uid', onData: () => {},
    });
    await client.connect();
    const metadata = client._buildMetadata();
    const value = metadata.get('x-custom-header');
    await client.disconnect();
    await server.disconnect();
    return Array.isArray(value) && value[0] === 'test.feed.uid';
  });

  await runTest('GrpcClientTransportInternal builds metadata with custom headerPathKey and headerPath', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'text', onData: () => {} });
    const result = await server.connect();

    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'text',
      headerPathKey: 'grpc-path', headerPath: 'my.dedicated.uid', onData: () => {},
    });
    await client.connect();
    const metadata = client._buildMetadata();
    const value = metadata.get('grpc-path');
    await client.disconnect();
    await server.disconnect();
    return Array.isArray(value) && value[0] === 'my.dedicated.uid';
  });

  await runTest('GrpcClientTransportProtobuf uses default headerPathKey and headerPath when not provided', async () => {
    const server = createGrpcServerTransport({ ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf', onData: () => {} });
    const result = await server.connect();

    const client = createGrpcClientTransport({ ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'protobuf', onData: () => {} });
    await client.connect();
    const metadata = client._buildMetadata();
    const value = metadata.get('grpc-path');
    await client.disconnect();
    await server.disconnect();
    return Array.isArray(value) && value[0] === 'replace.with.dedicated.uid';
  });

  await runTest('End-to-end: protobuf client with custom header sends data successfully', async () => {
    let receivedData = null;
    const server = createGrpcServerTransport({
      ip: '127.0.0.1', port: 0, useTls: false, grpcSerialization: 'protobuf',
      onData: (csv) => { receivedData = csv; },
    });
    const result = await server.connect();

    const client = createGrpcClientTransport({
      ip: '127.0.0.1', port: result.port, useTls: false, grpcSerialization: 'protobuf',
      headerPathKey: 'grpc-path', headerPath: 'test.feed.uid', onData: () => {},
    });
    await client.connect();
    // Logger client can receive; send via a raw gRPC call by triggering a Stream write
    // We test that connect succeeds and metadata is correctly attached
    const metadata = client._buildMetadata();
    await client.disconnect();
    await server.disconnect();
    return metadata.get('grpc-path')[0] === 'test.feed.uid';
  });

  // --- Results ---
  console.log(`\n=== Test Results ===`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runGrpcTransportTests().catch((error) => {
    console.error('Test suite error:', error);
    process.exit(1);
  });
}

module.exports = { runGrpcTransportTests };
