/**
 * Secondary window theme contract tests.
 * Run with: node test/window-theme-contract.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src');
const themeLoaderSource = fs.readFileSync(path.join(SRC, 'themes/theme-loader.js'), 'utf8');
const aboutScriptSource = fs.readFileSync(path.join(SRC, 'about.js'), 'utf8');

function injectScriptSource(html, scriptPath, source) {
  const pattern = new RegExp(`<script src="${scriptPath}"></script>`, 'g');
  return html.replace(pattern, `<script>${source}</script>`);
}

function removeExternalScripts(html, scriptPaths) {
  return scriptPaths.reduce((content, scriptPath) => {
    const pattern = new RegExp(`<script src="${scriptPath}"></script>`, 'g');
    return content.replace(pattern, '');
  }, html);
}

function buildHtml(fileName, { includeAboutScript = false } = {}) {
  const htmlPath = path.join(SRC, fileName);
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = injectScriptSource(html, '\\./themes/theme-loader\\.js', themeLoaderSource);
  if (includeAboutScript) {
    html = injectScriptSource(html, 'about\\.js', aboutScriptSource);
  }
  return removeExternalScripts(html, [
    '\\./tooltip-utils\\.js',
    'tooltip-utils\\.js',
    '\\./themes/theme-loader\\.js',
    'about\\.js',
  ]);
}

function createElectronApiMock() {
  const listeners = new Map();
  const sent = [];
  return {
    sent,
    on(channel, callback) {
      if (!listeners.has(channel)) listeners.set(channel, []);
      listeners.get(channel).push(callback);
    },
    send(channel, payload) {
      sent.push({ channel, payload });
    },
    invoke(channel) {
      if (channel === 'get-app-version') return Promise.resolve('1.2.3');
      return Promise.resolve(null);
    },
    emit(channel, payload) {
      (listeners.get(channel) || []).forEach((callback) => callback(payload));
    },
  };
}

function createDom(fileName, theme, options = {}) {
  const api = createElectronApiMock();
  const themeHref = `./themes/theme-${theme.replace(/^theme-/, '')}.css`;
  const dom = new JSDOM(buildHtml(fileName, options), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: `file://${path.join(SRC, fileName)}?theme=${encodeURIComponent(theme)}&themeHref=${encodeURIComponent(themeHref)}`,
    beforeParse(window) {
      window.electronAPI = api;
      window.navigator.clipboard = {
        writeText: async () => {},
      };
      window.close = () => {
        window._closed = true;
      };
      window.URL.createObjectURL = () => 'blob:test-theme';
      window.URL.revokeObjectURL = () => {};
    },
  });
  return { api, dom, window: dom.window, document: dom.window.document };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function currentThemeHref(document) {
  return document.getElementById('current-theme-stylesheet')?.getAttribute('href') || '';
}

function assertTheme(document, theme, href = `./themes/theme-${theme}.css`) {
  assert.strictEqual(document.body.dataset.theme, theme);
  assert.ok(document.body.classList.contains(`theme-${theme}`));
  assert.strictEqual(currentThemeHref(document), href);
}

async function run() {
  console.log('window-theme-contract.test.js');
  let passed = 0;
  const test = async (name, fn) => {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      console.error(`  ✗ ${name}\n    ${error.stack || error.message}`);
      process.exitCode = 1;
    }
  };

  await test('theme loader preserves non-theme body classes', async () => {
    const dom = new JSDOM('<!doctype html><html><body class="compact"></body></html>', {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    dom.window.eval(themeLoaderSource);
    dom.window.themeLoader.loadTheme('rose', './themes/theme-rose.css');
    assert.ok(dom.window.document.body.classList.contains('compact'));
    assertTheme(dom.window.document, 'rose');
  });

  await test('theme loader rejects names outside the theme catalog', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    dom.window.eval(themeLoaderSource);
    dom.window.themeLoader.loadTheme('../../outside');
    assertTheme(dom.window.document, 'dark');
  });

  await test('theme loader rejects stylesheet hrefs outside the selected theme', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    dom.window.eval(themeLoaderSource);
    dom.window.themeLoader.loadTheme('blue', 'file:///tmp/other.css');
    assertTheme(dom.window.document, 'blue');
    dom.window.themeLoader.loadTheme('rose', './themes/theme-blue.css');
    assertTheme(dom.window.document, 'rose');
  });

  await test('Help initializes and updates live for named themes', async () => {
    const { api, document } = createDom('help.html', 'blue');
    await flush();
    assertTheme(document, 'blue');
    api.emit('load-saved-theme', 'rose-dark');
    assertTheme(document, 'rose-dark');
  });

  await test('CLI initializes with system theme and updates live', async () => {
    const { api, document } = createDom('cli.html', 'system');
    await flush();
    assertTheme(document, 'system');
    api.emit('load-saved-theme', 'ocean');
    assertTheme(document, 'ocean');
  });

  await test('About initializes and updates live', async () => {
    const { api, document } = createDom('about.html', 'mocha', { includeAboutScript: true });
    await flush();
    assertTheme(document, 'mocha');
    api.emit('load-saved-theme', 'light-gray');
    assertTheme(document, 'light-gray');
    assert.strictEqual(document.getElementById('about-version').textContent, 'Version 1.2.3');
  });

  await test('App Configuration keeps the initial theme until a live update arrives', async () => {
    const { api, document } = createDom('config.html', 'midnight');
    await flush();
    assertTheme(document, 'midnight');
    api.emit('load-config-data', {
      config: { theme: 'light' },
      configPath: '/tmp/config.json',
      theme: 'light',
    });
    assertTheme(document, 'midnight');
    api.emit('load-saved-theme', 'color-blind');
    assertTheme(document, 'color-blind');
  });

  await test('Launch Configuration keeps the initial theme until a live update arrives', async () => {
    const { api, document } = createDom('launch-config.html', 'dark-gray');
    await flush();
    assertTheme(document, 'dark-gray');
    api.emit('load-launch-config-data', {
      config: { theme: 'light' },
      theme: 'light',
    });
    assertTheme(document, 'dark-gray');
    api.emit('load-saved-theme', 'high-contrast');
    assertTheme(document, 'high-contrast');
  });

  await test('Error dialog keeps the initial theme until a live update arrives', async () => {
    const { api, document } = createDom('error.html', 'green');
    await flush();
    assertTheme(document, 'green');
    api.emit('load-error-data', {
      message: 'Unexpected error',
      details: 'stack trace',
      theme: 'light',
    });
    assertTheme(document, 'green');
    api.emit('load-saved-theme', 'sunset');
    assertTheme(document, 'sunset');
  });

  console.log(`All ${passed} window theme contract tests passed.`);
  if (process.exitCode) process.exit(process.exitCode);
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
