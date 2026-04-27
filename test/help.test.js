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
 * Help and Command Line Interface Dialog Unit Tests
 * Run with: node test/help.test.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const helpHtmlPath = path.resolve(__dirname, '../src/help.html');
const cliHtmlPath = path.resolve(__dirname, '../src/cli.html');
const cliCssPath = path.resolve(__dirname, '../src/cli.css');
const helpHtml = fs.readFileSync(helpHtmlPath, 'utf-8');
const cliHtml = fs.readFileSync(cliHtmlPath, 'utf-8');
const cliCss = fs.readFileSync(cliCssPath, 'utf-8');

const mockCliReference = {
  overview: [
    'No parameters start the app in normal UI mode.',
    'Headless mode requires outputFile only when you do not want stdout.',
  ],
  helpLayouts: [
    'help=true prints the compact ASCII-table help without the example column.',
    'help-table-wide=true prints the wide table help output.',
  ],
  parameters: [
    {
      name: 'help',
      supportedValues: 'true, false',
      required: 'No',
      defaultValue: 'false',
      example: 'help=true',
      purpose: 'Print a compact ASCII-table parameter summary and exit.',
      usageCategory: 'help',
    },
    {
      name: 'outputFile',
      supportedValues: 'path, omitted',
      required: 'No',
      defaultValue: '(none)',
      example: 'outputFile=./logs/captured.txt',
      purpose: 'Write captured output to a file instead of stdout.',
      usageCategory: 'headless-only',
    },
    {
      name: 'runMode',
      supportedValues: 'ui, headless, silent',
      required: 'Only when using the normal app entry point',
      defaultValue: 'ui',
      example: 'runMode=headless',
      purpose: 'Select startup mode. Use it when switching from the normal launcher into headless mode.',
      usageCategory: 'launcher',
    },
  ],
  notes: [
    'runMode=silent is treated the same as runMode=headless.',
  ],
  examples: [
    'electron .',
    'electron . help-table-wide=true',
  ],
};

function createDialogDom(html, { includeCliApi = false } = {}) {
  return new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'file://' + path.resolve(__dirname, '../src/'),
    beforeParse(window) {
      window.themeLoader = {
        loadTheme(theme) {
          window.document.body.className = theme;
          window._loadedTheme = theme;
        },
      };
      window.URL.createObjectURL = () => {
        window._exportObjectUrlCreated = true;
        return 'blob:test-visible-rows';
      };
      window.URL.revokeObjectURL = (url) => {
        window._revokedObjectUrl = url;
      };
      window.navigator.clipboard = {
        writeText: async (text) => {
          window._copiedText = text;
        },
      };
      window.electronAPI = {
        send: (channel, data) => {
          window._sentMessages = window._sentMessages || [];
          window._sentMessages.push({ channel, data });
          if (channel === 'close-dialog') {
            window._closeCalled = true;
          }
        },
        invoke: (channel) => {
          if (channel === 'get-cli-help-reference' && includeCliApi) {
            window._getCliHelpReferenceCalled = true;
            return Promise.resolve(mockCliReference);
          }
          return Promise.resolve(null);
        },
      };
      window.close = () => {
        window._closeCalled = true;
      };
    },
  });
}

async function runHelpTests() {
  console.log('\n=== Help + Command Line Interface Dialog Test Suite ===');
  let passed = 0;
  let failed = 0;

  const runTest = (testName, testFn) => {
    try {
      if (testFn()) {
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

  const runAsyncTest = async (testName, testFn) => {
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

  const helpDom = createDialogDom(helpHtml);
  global.window = helpDom.window;
  global.document = helpDom.window.document;

  console.log('\nWaiting for Help dialog setup...');
  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log('\n--- Test 1: Help dialog content ---');
  runTest('Help dialog title is rendered', () => document.querySelector('.help-title')?.textContent.includes('ArcGIS Velocity Logger Help'));
  runTest('Help dialog points users to the dedicated Command Line Interface dialog', () => document.body.textContent.includes('Command Line Interface') && document.body.textContent.includes('F3'));
  runTest('Help dialog close button exists', () => document.getElementById('close-button') !== null);
  runTest('Help dialog signals ready to the main process', () => Array.isArray(global.window._sentMessages) && global.window._sentMessages.some((entry) => entry.channel === 'help-dialog-ready'));
  runTest('Escape key closes the Help dialog', () => {
    global.window._closeCalled = false;
    document.dispatchEvent(new helpDom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return global.window._closeCalled === true;
  });

  const cliDom = createDialogDom(cliHtml, { includeCliApi: true });
  const originalClick = cliDom.window.HTMLAnchorElement.prototype.click;
  cliDom.window.HTMLAnchorElement.prototype.click = function clickStub() {
    global.window._lastDownload = {
      href: this.href,
      download: this.download,
    };
  };

  global.window = cliDom.window;
  global.document = cliDom.window.document;

  console.log('\nWaiting for Command Line Interface dialog setup...');
  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log('\n--- Test 2: Command-line reference rendering ---');
  runTest('CLI reference loader is called', () => global.window._getCliHelpReferenceCalled === true);
  runTest('CLI dialog title is rendered', () => document.querySelector('.help-title')?.textContent.includes('Command Line Interface'));
  runTest('CLI rows are rendered from metadata', () => document.querySelectorAll('#cli-reference-body tr').length === mockCliReference.parameters.length);
  runTest('Resizable CLI table wrapper styling is present', () => cliCss.includes('.cli-reference-table-wrapper') && cliCss.includes('resize: vertical'));
  runTest('Resize hint styling is present', () => cliCss.includes('.cli-table-resize-hint') && cliCss.includes('.cli-reference-table-wrapper::after'));
  runTest('CLI dialog signals ready to the main process', () => Array.isArray(global.window._sentMessages) && global.window._sentMessages.some((entry) => entry.channel === 'cli-dialog-ready'));

  console.log('\n--- Test 3: Resize and interaction behavior ---');
  runTest('CLI resize hint is rendered and wired to the wrapper', () => {
    const wrapper = document.getElementById('cli-reference-table-wrapper');
    const hint = document.getElementById('cli-reference-table-resize-hint');
    return hint !== null
      && hint.textContent.includes('Drag the table’s bottom edge')
      && wrapper?.getAttribute('aria-describedby') === 'cli-reference-table-resize-hint';
  });
  runTest('CLI table wrapper auto-sizes to fit visible rows before user resizing', () => {
    const wrapper = document.getElementById('cli-reference-table-wrapper');
    const table = document.querySelector('.cli-reference-table');
    const filterInput = document.getElementById('cli-filter-input');
    Object.defineProperty(table, 'offsetHeight', {
      configurable: true,
      get: () => 428,
    });
    filterInput.value = 'outputFile';
    filterInput.dispatchEvent(new cliDom.window.Event('input', { bubbles: true }));
    return wrapper.style.height === '430px';
  });
  runTest('Manual CLI table resize is preserved across rerenders', () => {
    const wrapper = document.getElementById('cli-reference-table-wrapper');
    const table = document.querySelector('.cli-reference-table');
    const filterInput = document.getElementById('cli-filter-input');

    Object.defineProperty(table, 'offsetHeight', {
      configurable: true,
      get: () => 180,
    });

    wrapper.getBoundingClientRect = () => ({ bottom: 300, height: 240 });
    wrapper.dispatchEvent(new cliDom.window.MouseEvent('mousedown', { bubbles: true, clientY: 295 }));
    wrapper.style.height = '320px';
    wrapper.getBoundingClientRect = () => ({ bottom: 320, height: 320 });
    cliDom.window.dispatchEvent(new cliDom.window.MouseEvent('mouseup', { bubbles: true, clientY: 320 }));

    filterInput.value = 'help';
    filterInput.dispatchEvent(new cliDom.window.Event('input', { bubbles: true }));

    return wrapper.style.height === '320px';
  });
  runTest('Ctrl/Cmd+F focuses the CLI filter', () => {
    const filterInput = document.getElementById('cli-filter-input');
    document.body.focus();
    document.dispatchEvent(new cliDom.window.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
    return document.activeElement === filterInput;
  });
  await runAsyncTest('Copy visible rows works for TSV output', async () => {
    const filterInput = document.getElementById('cli-filter-input');
    filterInput.value = 'outputFile';
    filterInput.dispatchEvent(new cliDom.window.Event('input', { bubbles: true }));
    global.window._copiedText = null;
    document.getElementById('cli-copy-visible-rows').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return global.window._copiedText.includes('Name\tSupported Values\tDefault')
      && global.window._copiedText.includes('outputFile');
  });
  runTest('Export visible rows creates a CSV download', () => {
    const formatSelect = document.getElementById('cli-visible-rows-format');
    formatSelect.value = 'csv';
    formatSelect.dispatchEvent(new cliDom.window.Event('change', { bubbles: true }));
    global.window._lastDownload = null;
    global.window._exportObjectUrlCreated = false;
    global.window._revokedObjectUrl = null;
    document.getElementById('cli-export-visible-rows').click();
    return global.window._exportObjectUrlCreated === true
      && global.window._lastDownload?.download === 'arcgis-velocity-logger-visible-cli-rows.csv'
      && global.window._revokedObjectUrl === 'blob:test-visible-rows';
  });
  runTest('Escape key closes the CLI dialog', () => {
    global.window._closeCalled = false;
    document.dispatchEvent(new cliDom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return global.window._closeCalled === true;
  });

  console.log('\n=== Test Results ===');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);

  cliDom.window.HTMLAnchorElement.prototype.click = originalClick;
  helpDom.window.close();
  cliDom.window.close();

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runHelpTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runHelpTests };

