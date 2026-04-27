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
 * Unit tests for src/cli-options.js — pure Node, no test framework.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  parseCommandLineArgs,
  formatCliStartupErrorOutput,
  formatExplainOutput,
  getCommandLineReferenceData,
  getCommandHelpText,
  DEFAULT_HEADLESS_OPTIONS,
} = require('../src/cli-options.js');

function argv(...args) {
  // Simulate unpackaged electron: process.argv = [nodeBinary, mainJs, ...userArgs]
  return ['/fake/node', '/fake/main.js', ...args];
}

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed += 1; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.stack || err.message}`); process.exitCode = 1; }
}

console.log('cli-options.test.js');

test('no args → UI mode', () => {
  const r = parseCommandLineArgs(argv());
  assert.strictEqual(r.mode, 'ui');
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.headless, null);
});

test('help=true → help mode', () => {
  const r = parseCommandLineArgs(argv('help=true'));
  assert.strictEqual(r.mode, 'help');
  assert.ok(r.helpText.includes('ArcGIS Velocity Logger command-line help'));
  assert.ok(r.helpText.includes('help'));
});

test('--help → help mode (help)', () => {
  const r = parseCommandLineArgs(argv('--help'));
  assert.strictEqual(r.mode, 'help');
  assert.ok(r.helpText.includes('help'));
});

test('-h → help mode', () => {
  const r = parseCommandLineArgs(argv('-h'));
  assert.strictEqual(r.mode, 'help');
});

test('h → help mode (alias)', () => {
  const r = parseCommandLineArgs(argv('h'));
  assert.strictEqual(r.mode, 'help');
  assert.ok(r.helpText.includes('ArcGIS Velocity Logger command-line help'));
});

test('h=true → help mode (alias key=value form)', () => {
  const r = parseCommandLineArgs(argv('h=true'));
  assert.strictEqual(r.mode, 'help');
});

test('help-table-wide → wide layout', () => {
  const r = parseCommandLineArgs(argv('--help-table-wide'));
  assert.strictEqual(r.mode, 'help');
  assert.ok(r.helpText.includes('table-wide'));
});

test('help-wide → compact layout with example column', () => {
  const r = parseCommandLineArgs(argv('help-wide=true'));
  assert.strictEqual(r.mode, 'help');
  assert.ok(r.helpText.includes('Layout: help (Name | Supported Values | Default | Example | Purpose)'));
  assert.ok(r.helpText.includes('Example'));
});

test('help layout wraps long purpose text onto aligned continuation lines', () => {
  const txt = getCommandHelpText();
  assert.ok(txt.includes('| connectWaitForServer   | true | false             | false        | In client mode, retry the connection on failure    |'));
  assert.ok(txt.includes('|                        |                          |              | until the server is available.                     |'));
});

test('help layout uses boxed ASCII table separators', () => {
  const txt = getCommandHelpText();
  assert.ok(txt.includes('+------------------------+--------------------------+--------------+----------------------------------------------------+'));
  assert.ok(txt.includes('| appendOutput           | true | false             | false        | Append to outputFile if it exists instead of       |'));
  assert.ok(txt.includes('| autoConnect            | true | false             | true         | Connect/bind automatically on headless start.      |'));
});

test('help layout includes example usages before aliases', () => {
  const txt = getCommandHelpText();
  const exampleIndex = txt.indexOf('Example usages');
  const aliasesIndex = txt.indexOf('Aliases:');
  assert.ok(exampleIndex > -1);
  assert.ok(aliasesIndex > exampleIndex);
  assert.ok(txt.includes('  UI default      : electron .'));
  assert.ok(txt.includes('  TCP retry       : electron . runMode=headless protocol=tcp mode=client'));
});

test('help-wide layout wraps long example/value cells within columns', () => {
  const txt = getCommandHelpText({ layout: 'compact' });
  assert.ok(txt.includes('config=./docs/launch-co'));
  assert.ok(txt.includes('ig.server.sample.json'));
  assert.ok(!txt.includes('\n                                                                n'));
});

test('help-wide layout uses boxed ASCII table separators', () => {
  const txt = getCommandHelpText({ layout: 'compact' });
  assert.ok(txt.includes('+------------------------+------------------------+--------------+--------------------------------------+----------------------------------------------------+'));
  assert.ok(txt.includes('| appendOutput           | true | false           | false        | appendOutput=true                    | Append to outputFile if it exists instead of       |'));
  assert.ok(txt.includes('| autoConnect            | true | false           | true         | autoConnect=false                    | Connect/bind automatically on headless start.      |'));
});

test('help-wide layout includes example usages before aliases', () => {
  const txt = getCommandHelpText({ layout: 'compact' });
  const exampleIndex = txt.indexOf('Example usages');
  const aliasesIndex = txt.indexOf('Aliases:');
  assert.ok(exampleIndex > -1);
  assert.ok(aliasesIndex > exampleIndex);
  assert.ok(txt.includes('  Capture to file : electron . runMode=headless outputFile=./captured.log'));
  assert.ok(txt.includes('  Config override : electron . runMode=headless config=./docs/launch-config.server.sample.json'));
});

test('help-detailed → standard layout', () => {
  const r = parseCommandLineArgs(argv('help-detailed=true'));
  assert.strictEqual(r.mode, 'help');
  assert.ok(r.helpText.includes('Layout: help-detailed (non-table)'));
});

test('help-table-narrow wins over help-table-wide', () => {
  const r = parseCommandLineArgs(argv('help-table-wide=true', 'help-table-narrow=true'));
  assert.ok(r.helpText.includes('table-narrow'));
});

test('runMode=headless without outputFile → headless mode (stdout default) + warning', () => {
  const r = parseCommandLineArgs(argv('runMode=headless'));
  assert.strictEqual(r.mode, 'headless');
  assert.strictEqual(r.headless.outputFile, null);
  assert.ok(r.warnings.some((w) => w.toLowerCase().includes('stdout')));
});

test('runMode=headless outputFile=./x.log → headless mode with defaults', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log'));
  assert.strictEqual(r.mode, 'headless');
  assert.strictEqual(r.headless.protocol, 'tcp');
  assert.strictEqual(r.headless.mode, 'server');
  assert.strictEqual(r.headless.ip, '127.0.0.1');
  assert.strictEqual(r.headless.port, 5565);
  assert.ok(r.headless.outputFile.endsWith('x.log'));
});

test('silent alias → headless', () => {
  const r = parseCommandLineArgs(argv('runMode=silent', 'outputFile=./x.log'));
  assert.strictEqual(r.mode, 'headless');
});

test('host alias → ip', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'host=0.0.0.0'));
  assert.strictEqual(r.headless.ip, '0.0.0.0');
});

test('invalid protocol → error', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'protocol=ftp'));
  assert.strictEqual(r.mode, 'error');
  assert.ok(r.errors.some((e) => e.toLowerCase().includes('protocol')));
});

test('invalid port → error', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'port=99999'));
  assert.strictEqual(r.mode, 'error');
});

test('invalid outputFormat → error', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'outputFormat=xml'));
  assert.strictEqual(r.mode, 'error');
  assert.ok(r.errors.some((e) => e.toLowerCase().includes('outputformat')));
});

test('invalid logLevel → error', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'logLevel=loud'));
  assert.strictEqual(r.mode, 'error');
});

test('invalid regex filter → error', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'filter=(unclosed'));
  assert.strictEqual(r.mode, 'error');
  assert.ok(r.errors.some((e) => e.toLowerCase().includes('filter')));
});

test('unknown key → error', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'bogus=1'));
  assert.strictEqual(r.mode, 'error');
  assert.ok(r.errors.some((e) => e.includes('Unknown CLI parameter')));
  assert.ok(r.errors.some((e) => e.includes('bogus')));
});

test('unknown positional argument → error', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'bogus'));
  assert.strictEqual(r.mode, 'error');
  assert.ok(r.errors.some((e) => e.includes('Unknown CLI argument')));
  assert.ok(r.errors.some((e) => e.includes('name=value')));
});

test('mixed valid and invalid CLI params still fail startup', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'protocol=tcp', 'mystery=42'));
  assert.strictEqual(r.mode, 'error');
  assert.ok(r.errors.some((e) => e.includes('mystery')));
});

test('explicit help still wins over invalid CLI params', () => {
  const r = parseCommandLineArgs(argv('help-table-narrow=true', 'bogus=1'));
  assert.strictEqual(r.mode, 'help');
  assert.strictEqual(r.errors.length, 0);
  assert.ok(r.helpText.includes('help-table-narrow'));
});

test('formatCliStartupErrorOutput matches simulator-style invalid parameter messaging', () => {
  const cliArgs = parseCommandLineArgs(argv('foo=true'));
  assert.strictEqual(cliArgs.mode, 'error');

  const output = formatCliStartupErrorOutput(cliArgs);
  assert.ok(output.includes('CLI startup aborted due to invalid command-line parameters. The application will exit without launching.'));
  assert.ok(output.includes('CLI error: Unknown CLI parameter: foo. These parameters are not supported. Review valid CLI parameters with: electron . help=true'));
  assert.ok(output.includes('ArcGIS Velocity Logger command-line help'));
  assert.ok(output.includes('Layout: help (Name | Supported Values | Default | Purpose)'));
});

test('formatCliStartupErrorOutput keeps positional-argument guidance and appends help', () => {
  const cliArgs = parseCommandLineArgs(argv('bogus'));
  assert.strictEqual(cliArgs.mode, 'error');

  const output = formatCliStartupErrorOutput(cliArgs);
  assert.ok(output.includes('CLI error: Unknown CLI argument: bogus. Use name=value syntax for supported CLI parameters. Review valid CLI parameters with: electron . help=true'));
  assert.ok(output.includes('\n\nArcGIS Velocity Logger command-line help\n'));
});

test('config file merge + CLI override', () => {
  const tmp = path.join(os.tmpdir(), `logger-cli-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({
    connection: { ip: '10.0.0.1', mode: 'client', port: 7000, protocol: 'udp' },
    output: { outputFile: './from-config.log', outputFormat: 'jsonl' },
  }));
  try {
    const r = parseCommandLineArgs(argv('runMode=headless', `config=${tmp}`, 'port=8000'));
    assert.strictEqual(r.mode, 'headless');
    assert.strictEqual(r.headless.protocol, 'udp');
    assert.strictEqual(r.headless.ip, '10.0.0.1');
    assert.strictEqual(r.headless.port, 8000); // CLI override
    assert.strictEqual(r.headless.outputFormat, 'jsonl');
  } finally { fs.unlinkSync(tmp); }
});

test('boolean parsing accepts multiple spellings', () => {
  const r1 = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'stdout=no'));
  assert.strictEqual(r1.headless.stdout, false);
  const r2 = parseCommandLineArgs(argv('runMode=headless', 'outputFile=./x.log', 'stdout=1'));
  assert.strictEqual(r2.headless.stdout, true);
});

test('UI mode with extra CLI params → warning', () => {
  // outputFile and maxLogCount are headless-only params; they should be flagged in UI mode
  const r = parseCommandLineArgs(argv('outputFile=./x.log', 'maxLogCount=100'));
  assert.strictEqual(r.mode, 'ui');
  assert.ok(r.warnings.some((w) => w.includes('UI mode ignores')));
});

test('getCommandLineReferenceData returns full metadata', () => {
  const ref = getCommandLineReferenceData();
  assert.ok(Array.isArray(ref.parameters));
  assert.ok(ref.parameters.length >= 20);
  const outputFile = ref.parameters.find((p) => p.name === 'outputFile');
  assert.strictEqual(outputFile.required, 'No');
});

test('getCommandHelpText default is help', () => {
  const txt = getCommandHelpText();
  assert.ok(txt.includes('help'));
});

test('DEFAULT_HEADLESS_OPTIONS sanity', () => {
  assert.strictEqual(DEFAULT_HEADLESS_OPTIONS.protocol, 'tcp');
  assert.strictEqual(DEFAULT_HEADLESS_OPTIONS.outputFormat, 'text');
  assert.strictEqual(DEFAULT_HEADLESS_OPTIONS.exitOnComplete, true);
});

test('DEFAULT_HEADLESS_OPTIONS has grpcHeaderPathKey and grpcHeaderPath defaults', () => {
  assert.strictEqual(DEFAULT_HEADLESS_OPTIONS.grpcHeaderPathKey, 'grpc-path');
  assert.strictEqual(DEFAULT_HEADLESS_OPTIONS.grpcHeaderPath, 'replace.with.dedicated.uid');
});

test('grpcHeaderPathKey and grpcHeaderPath are parsed in headless mode', () => {
  const r = parseCommandLineArgs(argv(
    'runMode=headless',
    'protocol=grpc',
    'mode=client',
    'ip=127.0.0.1',
    'grpcHeaderPathKey=my-header',
    'grpcHeaderPath=my.feed.uid',
  ));
  assert.strictEqual(r.mode, 'headless');
  assert.strictEqual(r.headless.grpcHeaderPathKey, 'my-header');
  assert.strictEqual(r.headless.grpcHeaderPath, 'my.feed.uid');
});

test('grpcHeaderPathKey and grpcHeaderPath use defaults when not provided', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'protocol=grpc', 'mode=client', 'ip=127.0.0.1'));
  assert.strictEqual(r.headless.grpcHeaderPathKey, 'grpc-path');
  assert.strictEqual(r.headless.grpcHeaderPath, 'replace.with.dedicated.uid');
});

test('grpcHeaderPathKey and grpcHeaderPath appear in command-line reference data', () => {
  const ref = getCommandLineReferenceData();
  assert.ok(ref.parameters.some((p) => p.name === 'grpcHeaderPathKey'));
  assert.ok(ref.parameters.some((p) => p.name === 'grpcHeaderPath'));
});

test('grpcHeaderPathKey in UI mode is recognized as a UI preset, not an ignored param', () => {
  const r = parseCommandLineArgs(argv('grpcHeaderPathKey=my-key'));
  assert.strictEqual(r.mode, 'ui');
  // grpcHeaderPathKey is a valid UI preset — it should NOT appear in ignored-param warnings
  assert.ok(!r.warnings.some((w) => w.includes('grpcHeaderPathKey')));
  // And it should be available in presets
  assert.strictEqual(r.presets && r.presets.grpcHeaderPathKey, 'my-key');
});

test('DEFAULT_HEADLESS_OPTIONS has showMetadata default of false', () => {
  assert.strictEqual(DEFAULT_HEADLESS_OPTIONS.showMetadata, false);
});

test('showMetadata=true is parsed in headless mode', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'protocol=grpc', 'mode=server', 'showMetadata=true'));
  assert.strictEqual(r.mode, 'headless');
  assert.strictEqual(r.headless.showMetadata, true);
});

test('showMetadata defaults to false when not provided', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'protocol=grpc', 'mode=server'));
  assert.strictEqual(r.headless.showMetadata, false);
});

test('showMetadata appears in command-line reference data', () => {
  const ref = getCommandLineReferenceData();
  assert.ok(ref.parameters.some((p) => p.name === 'showMetadata'));
});

test('UI explain output includes mode label and startup explanation heading', () => {
  const r = parseCommandLineArgs(argv());
  const output = formatExplainOutput(r);
  assert.ok(output.includes('Run mode'));
  assert.ok(output.includes('UI (interactive)'));
  assert.ok(output.includes('Startup Explanation'));
});

test('UI explain output shows UI Configuration section when CLI presets are provided', () => {
  const r = parseCommandLineArgs(argv('protocol=grpc', 'ip=192.168.1.10', 'port=6000'));
  const output = formatExplainOutput(r);
  assert.ok(output.includes('UI Configuration'));
  assert.ok(output.includes('Behavior Summary'));
  assert.ok(output.includes('protocol'));
  assert.ok(output.includes('grpc'));
  assert.ok(output.includes('192.168.1.10'));
});

test('UI explain output shows UI Configuration section even without presets', () => {
  const r = parseCommandLineArgs(argv());
  const output = formatExplainOutput(r);
  assert.ok(output.includes('UI Configuration'));
  assert.ok(output.includes('Behavior Summary'));
});

// --- grpcSendMethod tests ---
test('grpcSendMethod defaults to stream', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'protocol=grpc', 'mode=client', 'ip=127.0.0.1'));
  assert.strictEqual(r.headless.grpcSendMethod, 'stream');
});

test('grpcSendMethod=unary is parsed in headless mode', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'protocol=grpc', 'mode=client', 'ip=127.0.0.1', 'grpcSendMethod=unary'));
  assert.strictEqual(r.headless.grpcSendMethod, 'unary');
});

test('Invalid grpcSendMethod produces an error', () => {
  const r = parseCommandLineArgs(argv('runMode=headless', 'protocol=grpc', 'mode=client', 'ip=127.0.0.1', 'grpcSendMethod=invalid'));
  assert.ok(r.errors.some((e) => e.includes('grpcSendMethod')));
});

test('grpcSendMethod appears in CLI parameter definitions', () => {
  const ref = getCommandLineReferenceData();
  assert.ok(ref.parameters.some((p) => p.name === 'grpcSendMethod'));
});

test('grpcSendMethod in UI mode is recognized as a UI preset', () => {
  const r = parseCommandLineArgs(argv('grpcSendMethod=unary'));
  assert.strictEqual(r.mode, 'ui');
  assert.ok(!r.warnings.some((w) => w.includes('grpcSendMethod')));
});

console.log(`\n${passed} passed`);

