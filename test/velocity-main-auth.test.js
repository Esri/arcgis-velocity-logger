const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const functionSource = (name) => {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  return main.slice(start, main.indexOf('\n}', start) + 2);
};
const context = {
  velocityLoginPending: 0,
  velocityAuthRevision: 1,
  velocitySession: { state: { revision: 1, authRevision: 1 } },
  velocitySendAuthToken: true,
  velocityTokenManager: { isAuthenticated: true, token: 'refreshed-token' },
  grpcTransport: { velocityAuthRevision: 1, authToken: 'original-token' },
  httpTransport: { velocityAuthRevision: 1, authToken: 'original-token' },
};
vm.createContext(context);
vm.runInContext(functionSource('getVelocityAuthTokenForConnection') + '\n' + functionSource('hotSwapVelocityAuthToken'), context);

assert.strictEqual(context.getVelocityAuthTokenForConnection(), 'refreshed-token');
context.hotSwapVelocityAuthToken();
assert.strictEqual(context.grpcTransport.authToken, 'refreshed-token');
assert.strictEqual(context.httpTransport.authToken, 'refreshed-token');
context.velocityLoginPending = 1;
context.velocityTokenManager.token = 'another-portal-token';
context.hotSwapVelocityAuthToken();
assert.strictEqual(context.grpcTransport.authToken, 'refreshed-token');
assert.strictEqual(context.getVelocityAuthTokenForConnection(), null);
context.velocityLoginPending = 0;
context.velocitySession.state.revision = 2;
context.velocitySession.state.authRevision = 2;
context.hotSwapVelocityAuthToken();
assert.strictEqual(context.grpcTransport.authToken, 'refreshed-token');
assert.strictEqual(context.getVelocityAuthTokenForConnection(), null);
context.velocityAuthRevision = 2;
context.hotSwapVelocityAuthToken();
assert.strictEqual(context.grpcTransport.authToken, 'refreshed-token');
context.velocitySendAuthToken = false;
context.hotSwapVelocityAuthToken();
assert.strictEqual(context.grpcTransport.authToken, null);
assert.strictEqual(context.httpTransport.authToken, null);
console.log('velocity-main-auth tests passed');
