const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const marker = 'requestStreamService: async (url, options, context, token) => {';
const start = source.indexOf(marker);
const end = source.indexOf('\n  },', start);
assert.ok(start >= 0 && end > start);
const calls = [];
const logs = [];
let requestError = null;
const context = {
  URL,
  velocityLog: (level, message) => logs.push([level, message]),
  velocityRequest: async (url, options) => {
    calls.push({ url, options });
    if (requestError) throw requestError;
    return { streamUrls: [] };
  },
};
vm.createContext(context);
vm.runInContext(`var requestStreamService = ${source.slice(start + 'requestStreamService: '.length, end)}\n};`, context);

(async () => {
  const api = { apiBaseUrl: 'https://api.example.com/velocity' };
  const query = { query: { f: 'json' } };
  await context.requestStreamService('https://api.example.com/services/StreamServer', query, api, 'portal-token');
  assert.strictEqual(calls.at(-1).options.token, 'portal-token');
  assert.strictEqual(new URL(calls.at(-1).url).searchParams.get('f'), 'json');
  assert.ok(!JSON.stringify(logs).includes('portal-token'));

  for (const url of [
    'https://streams.example.com/services/StreamServer',
    'https://api.example.com:7443/services/StreamServer',
  ]) {
    await context.requestStreamService(url, query, api, 'portal-token');
    assert.strictEqual(calls.at(-1).options.token, undefined);
  }

  requestError = new Error('The HTTPS certificate chain could not be verified.');
  await assert.rejects(
    () => context.requestStreamService('https://streams.example.com/services/StreamServer', query, api, 'portal-token'),
    (error) => {
      assert.ok(error.message.startsWith(requestError.message));
      assert.match(error.message, /Portal credentials are not forwarded/);
      assert.ok(!error.message.includes('portal-token'));
      return true;
    },
  );
  await assert.rejects(
    () => context.requestStreamService('https://api.example.com/services/StreamServer', query, api, 'portal-token'),
    (error) => error === requestError,
  );
  console.log('velocity-stream-service tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
