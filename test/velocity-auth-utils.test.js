const assert = require('assert');
const {
  getVelocityItemType,
  isTokenCapableItem,
  shouldSendVelocityTokenByDefault,
  describeVelocityAuthType,
} = require('../src/velocity-auth-utils');

assert.strictEqual(getVelocityItemType({ outputType: 'grpc' }), 'grpc');
assert.strictEqual(getVelocityItemType({ feedType: 'http-receiver' }), 'http-receiver');
assert.strictEqual(isTokenCapableItem({ outputType: 'tcp' }), false);
assert.strictEqual(isTokenCapableItem({ outputType: 'websocket' }), true);

assert.strictEqual(shouldSendVelocityTokenByDefault({ tokenOnly: true, authType: 'token' }), true);
assert.strictEqual(shouldSendVelocityTokenByDefault({ outputType: 'grpc', authType: 'arcgis' }), true);
assert.strictEqual(shouldSendVelocityTokenByDefault({ outputType: 'http', authType: 'token' }), true);
assert.strictEqual(shouldSendVelocityTokenByDefault({ outputType: 'websocket', authType: '' }), true);
assert.strictEqual(shouldSendVelocityTokenByDefault({ outputType: 'http', authType: 'basic' }), false);
assert.strictEqual(shouldSendVelocityTokenByDefault({ outputType: 'http', authType: 'none' }), false);
assert.strictEqual(shouldSendVelocityTokenByDefault({ outputType: 'tcp', authType: '' }), false);

assert.strictEqual(describeVelocityAuthType('arcgis'), 'ArcGIS token');
assert.strictEqual(describeVelocityAuthType('basic'), 'Basic auth (token not used)');
assert.strictEqual(describeVelocityAuthType('none'), 'No auth required');

console.log('velocity-auth-utils tests passed');

