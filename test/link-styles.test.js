/**
 * Link styling and contrast regression tests.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../src');
const THEMES_DIR = path.join(SRC, 'themes');

const themesCss = fs.readFileSync(path.join(SRC, 'themes.css'), 'utf8');
const helpCss = fs.readFileSync(path.join(SRC, 'help.css'), 'utf8');
const helpHtml = fs.readFileSync(path.join(SRC, 'help.html'), 'utf8');
const aboutCss = fs.readFileSync(path.join(SRC, 'about.css'), 'utf8');
const velocityLoginCss = fs.readFileSync(path.join(SRC, 'velocity-login.css'), 'utf8');
const errorHtml = fs.readFileSync(path.join(SRC, 'error.html'), 'utf8');
const configHtml = fs.readFileSync(path.join(SRC, 'config.html'), 'utf8');
const launchConfigHtml = fs.readFileSync(path.join(SRC, 'launch-config.html'), 'utf8');

const auditedHtmlFiles = [
  'about.html',
  'cli.html',
  'config.html',
  'error.html',
  'launch-config.html',
  'protocol-settings.html',
  'velocity-login.html',
];

function parseVars(block) {
  const vars = {};
  const pattern = /--([a-z0-9-]+):\s*([^;]+);/gi;
  let match;
  while ((match = pattern.exec(block)) !== null) {
    vars[match[1]] = match[2].trim();
  }
  return vars;
}

function parseHexColor(input) {
  const hex = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex.split('').map((ch) => parseInt(ch + ch, 16));
    return { r, g, b };
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  throw new Error(`Unsupported color value: ${input}`);
}

function mixColor(primary, secondary, primaryWeight) {
  return {
    r: Math.round(primary.r * primaryWeight + secondary.r * (1 - primaryWeight)),
    g: Math.round(primary.g * primaryWeight + secondary.g * (1 - primaryWeight)),
    b: Math.round(primary.b * primaryWeight + secondary.b * (1 - primaryWeight)),
  };
}

function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color) {
  return (0.2126 * channelToLinear(color.r))
    + (0.7152 * channelToLinear(color.g))
    + (0.0722 * channelToLinear(color.b));
}

function contrastRatio(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractThemeBlocks(fileName, content) {
  const blocks = [];
  const selector = /body\.theme-[a-z0-9-]+\s*\{([\s\S]*?)\n\}/gi;
  let match;
  while ((match = selector.exec(content)) !== null) {
    blocks.push({
      label: fileName.replace(/\.css$/, ''),
      vars: parseVars(match[1]),
    });
  }

  if (fileName === 'theme-system.css') {
    const systemBlocks = [];
    const darkPattern = /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*?body\.theme-system\s*\{([\s\S]*?)\n\}\s*\n\s*@media\s*\(prefers-color-scheme:\s*light\)/i;
    const lightPattern = /@media\s*\(prefers-color-scheme:\s*light\)[\s\S]*?body\.theme-system\s*\{([\s\S]*?)\n\}\s*$/i;
    const darkMatch = content.match(darkPattern);
    const lightMatch = content.match(lightPattern);
    if (darkMatch) systemBlocks.push({ label: 'theme-system (dark)', vars: parseVars(darkMatch[1]) });
    if (lightMatch) systemBlocks.push({ label: 'theme-system (light)', vars: parseVars(lightMatch[1]) });
    return systemBlocks;
  }

  return blocks;
}

function resolveLinkColors(vars) {
  const text = parseHexColor(vars['text-color']);
  const accent = parseHexColor(vars['accent-color'] || vars['primary-color']);
  const primary = parseHexColor(vars['primary-color'] || vars['accent-color']);
  const header = parseHexColor(vars['header-color'] || vars['text-color']);
  const background = parseHexColor(vars['background-color'] || vars['bg-color']);

  const link = mixColor(text, accent, 0.86);
  const hover = mixColor(link, accent, 0.78);
  const visited = mixColor(link, primary, 0.80);
  const focusRing = mixColor(header, accent, 0.72);

  return {
    background,
    link,
    hover,
    visited,
    focusRing,
  };
}

console.log('link-styles.test.js');

assert.match(themesCss, /--link-color:/, 'themes.css must define a semantic link color token');
assert.match(themesCss, /--link-hover-color:/, 'themes.css must define a semantic link hover token');
assert.match(themesCss, /--link-visited-color:/, 'themes.css must define a semantic link visited token');
assert.match(themesCss, /--link-focus-ring:/, 'themes.css must define a semantic link focus-ring token');
assert.match(helpCss, /\.help-content a\[href\]\s*\{/);
assert.match(helpCss, /text-decoration-line:\s*underline;/);
assert.match(helpCss, /\.help-content a\[href\]:visited\s*\{/);
assert.match(helpCss, /\.help-content a\[href\]:focus-visible\s*\{/);
assert.match(helpCss, /--help-link-focus-ring:/);
assert.match(helpCss, /:where\(\.help-container button, \.help-container input, \.help-container select, \.help-container summary\):focus-visible/);
assert.match(aboutCss, /\.about-close:focus-visible\s*\{/);
assert.match(velocityLoginCss, /button:focus-visible\s*\{/);
assert.match(errorHtml, /button:focus-visible,\s*textarea:focus-visible/);
assert.match(configHtml, /button:focus-visible/);
assert.match(launchConfigHtml, /button:focus-visible/);

assert.match(helpHtml, /target="_blank" rel="noreferrer"/, 'Help external docs links must open in a new tab');
assert.ok(!helpHtml.includes('href="../docs/'), 'Help must not link to local Markdown files');

for (const fileName of auditedHtmlFiles) {
  const html = fs.readFileSync(path.join(SRC, fileName), 'utf8');
  assert.ok(!/<a\b/i.test(html), `${fileName} must not contain anchor links`);
  assert.ok(!/role="link"/i.test(html), `${fileName} must not use link roles`);
}

const themeFiles = fs.readdirSync(THEMES_DIR)
  .filter((name) => /^theme-.*\.css$/.test(name));

for (const fileName of themeFiles) {
  const content = fs.readFileSync(path.join(THEMES_DIR, fileName), 'utf8');
  for (const block of extractThemeBlocks(fileName, content)) {
    const { background, link, visited, focusRing } = resolveLinkColors(block.vars);
    const linkContrast = contrastRatio(link, background);
    const visitedContrast = contrastRatio(visited, background);
    const focusContrast = contrastRatio(focusRing, background);

    assert.ok(
      linkContrast >= 4.5,
      `${block.label} link contrast ${linkContrast.toFixed(2)}:1 must meet WCAG 2.1 AA against its background`,
    );
    assert.ok(
      visitedContrast >= 4.5,
      `${block.label} visited link contrast ${visitedContrast.toFixed(2)}:1 must meet WCAG 2.1 AA against its background`,
    );
    assert.ok(
      focusContrast >= 3,
      `${block.label} focus ring contrast ${focusContrast.toFixed(2)}:1 must remain visible against its background`,
    );
  }
}

console.log('Link styling tokens, page usage, and theme contrast checks passed.');
