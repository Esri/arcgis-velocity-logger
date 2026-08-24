/**
 * Theme cascade contract tests.
 *
 * These tests resolve the real CSS cascade for the secondary windows instead
 * of inspecting theme metadata. Every theme file declares its palette on
 * `body.theme-*`, so any derived token declared on `:root` is substituted
 * against the html element — where only the dark defaults live — and the
 * frozen dark result is inherited by the whole document. That is exactly the
 * failure the Help and Command Line Interface windows had, so the assertions
 * below compare resolved colors, not class names or stylesheet hrefs.
 *
 * Run with: node test/theme-cascade.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

/* ------------------------------------------------------------------ *
 * Minimal CSS reader: rules, media blocks, and declarations.
 * ------------------------------------------------------------------ */

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function splitTopLevel(value, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

function parseDeclarations(block) {
  const declarations = [];
  splitTopLevel(block, ';').forEach((entry) => {
    const text = entry.trim();
    if (!text) return;
    const colon = text.indexOf(':');
    if (colon < 0) return;
    const property = text.slice(0, colon).trim();
    const value = text.slice(colon + 1).trim();
    if (!property) return;
    declarations.push({ property, value });
  });
  return declarations;
}

/**
 * Parse a stylesheet into a flat rule list. `@media` blocks are kept with
 * their condition so a caller can decide whether they apply.
 */
function parseCss(css, source) {
  const rules = [];

  const collect = (body, media) => {
    let cursor = 0;
    while (cursor < body.length) {
      const brace = body.indexOf('{', cursor);
      if (brace < 0) break;
      // Statement at-rules such as `@import` end at a semicolon, so the
      // selector is only the text after the last statement boundary.
      const raw = body.slice(cursor, brace);
      const boundary = Math.max(raw.lastIndexOf(';'), raw.lastIndexOf('}'));
      const prelude = raw.slice(boundary + 1).trim();

      let depth = 0;
      let end = -1;
      for (let i = brace; i < body.length; i += 1) {
        if (body[i] === '{') depth += 1;
        else if (body[i] === '}') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end < 0) break;

      const inner = body.slice(brace + 1, end);
      if (prelude.startsWith('@media')) {
        const condition = prelude.slice('@media'.length).trim();
        collect(inner, media ? `${media} and ${condition}` : condition);
      } else if (prelude.startsWith('@supports')) {
        collect(inner, media);
      } else if (!prelude.startsWith('@')) {
        rules.push({ media, selector: prelude, declarations: parseDeclarations(inner), source });
      }
      cursor = end + 1;
    }
  };

  collect(stripComments(css), null);
  return rules;
}

/* ------------------------------------------------------------------ *
 * Document model: html and body only, which is where themes live.
 * ------------------------------------------------------------------ */

const THEME_FILES = [
  'blue', 'color-blind', 'dark', 'dark-gray', 'green', 'high-contrast',
  'light', 'light-gray', 'midnight', 'mocha', 'ocean', 'rose', 'rose-dark',
  'sunset', 'system',
];

const sheetCache = new Map();

function loadSheet(relativePath) {
  if (!sheetCache.has(relativePath)) {
    const css = fs.readFileSync(path.join(SRC, relativePath), 'utf8');
    sheetCache.set(relativePath, parseCss(css, relativePath));
  }
  return sheetCache.get(relativePath);
}

/** themes.css pulls every theme in through `@import`, ahead of its own rules. */
function loadThemesCss() {
  const imported = THEME_FILES.flatMap((name) => loadSheet(`themes/theme-${name}.css`));
  return imported.concat(loadSheet('themes.css'));
}

const DOCUMENTS = {
  help: () => [...loadThemesCss(), ...loadSheet('help.css'), ...loadSheet('accessibility.css')],
  cli: () => [
    ...loadThemesCss(),
    ...loadSheet('help.css'),
    ...loadSheet('cli.css'),
    ...loadSheet('accessibility.css'),
  ],
  protocolSettings: () => [
    ...loadThemesCss(),
    ...loadSheet('style.css'),
    ...loadSheet('protocol-settings-window.css'),
    ...loadSheet('accessibility.css'),
  ],
};

function mediaApplies(media, colorScheme) {
  if (!media) return true;
  const condition = media.toLowerCase();
  if (condition.includes('print')) return false;
  if (condition.includes('max-width') || condition.includes('min-width')) return false;
  if (condition.includes('prefers-reduced-motion')) return false;
  if (condition.includes('prefers-contrast')) return false;
  if (condition.includes('prefers-color-scheme')) {
    return condition.includes(`prefers-color-scheme: ${colorScheme}`);
  }
  return false;
}

/**
 * Match a compound selector against one of the two modelled elements.
 * Selectors with combinators or unrelated subjects simply do not match.
 */
function matchCompound(compound, element) {
  const text = compound.trim();
  if (!text || /[\s>+~]/.test(text)) return null;
  if (text === ':root') return element.tag === 'html' ? { classes: 1, types: 0 } : null;

  const tagMatch = text.match(/^[a-z]+/);
  const tag = tagMatch ? tagMatch[0] : '';
  const rest = tag ? text.slice(tag.length) : text;
  if (tag && tag !== element.tag) return null;
  if (!tag && rest.startsWith('.') === false) return null;

  const classes = rest ? rest.split('.').filter(Boolean) : [];
  if (rest && !/^(\.[A-Za-z0-9_-]+)+$/.test(rest)) return null;
  if (!classes.every((name) => element.classes.includes(name))) return null;
  return { classes: classes.length, types: tag ? 1 : 0 };
}

function cascadeFor(rules, element, colorScheme) {
  const winners = new Map();
  rules.forEach((rule, order) => {
    if (!mediaApplies(rule.media, colorScheme)) return;
    splitTopLevel(rule.selector, ',').forEach((compound) => {
      const match = matchCompound(compound, element);
      if (!match) return;
      // Rules inside a matching media query are ordered after their sheet's
      // plain rules, which the flat rule order already reflects.
      const specificity = match.classes * 1000 + match.types;
      rule.declarations.forEach(({ property, value }) => {
        const previous = winners.get(property);
        if (!previous || specificity >= previous.specificity) {
          winners.set(property, { specificity, order, value });
        } else if (specificity === previous.specificity && order > previous.order) {
          winners.set(property, { specificity, order, value });
        }
      });
    });
  });
  return winners;
}

function createResolver(documentName, theme, colorScheme = 'light') {
  const rules = DOCUMENTS[documentName]();
  const bodyClasses = [`theme-${theme}`];
  if (documentName === 'protocolSettings') bodyClasses.push('protocol-settings-window');
  const html = { tag: 'html', classes: [] };
  const body = { tag: 'body', classes: bodyClasses };
  const maps = {
    html: cascadeFor(rules, html, colorScheme),
    body: cascadeFor(rules, body, colorScheme),
  };

  function declaredValue(scope, property) {
    const entry = maps[scope].get(property);
    return entry ? entry.value : undefined;
  }

  function computeProperty(scope, property, seen) {
    const own = declaredValue(scope, property);
    if (own === undefined) {
      if (scope === 'body' && property.startsWith('--')) {
        return computeProperty('html', property, seen);
      }
      return undefined;
    }
    return substitute(own, scope, seen);
  }

  function substitute(value, scope, seen = new Set()) {
    let result = '';
    let index = 0;
    while (index < value.length) {
      const start = value.indexOf('var(', index);
      if (start < 0) {
        result += value.slice(index);
        break;
      }
      result += value.slice(index, start);
      let depth = 0;
      let end = -1;
      for (let i = start + 3; i < value.length; i += 1) {
        if (value[i] === '(') depth += 1;
        else if (value[i] === ')') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end < 0) return undefined;
      const inner = value.slice(start + 4, end);
      const comma = splitTopLevel(inner, ',');
      const name = comma[0].trim();
      const fallback = comma.slice(1).join(',').trim();
      if (seen.has(name)) return undefined;
      const nextSeen = new Set(seen);
      nextSeen.add(name);
      const resolved = computeProperty(scope, name, nextSeen);
      if (resolved === undefined || resolved === '') {
        if (!fallback) return undefined;
        const fallbackValue = substitute(fallback, scope, nextSeen);
        if (fallbackValue === undefined) return undefined;
        result += fallbackValue;
      } else {
        result += resolved;
      }
      index = end + 1;
    }
    return result;
  }

  return {
    theme,
    colorScheme,
    /** Resolved custom property value on the body element. */
    token(name) {
      return computeProperty('body', name, new Set());
    },
    /** Resolve an arbitrary declaration value in body (or descendant) context. */
    evaluate(value) {
      return substitute(value, 'body', new Set());
    },
    /** Resolved value of a real property declared on body. */
    bodyProperty(property) {
      return computeProperty('body', property, new Set());
    },
    /** The declared value of a property for a selector, unresolved. */
    declarationFor(selector, property) {
      const rule = DOCUMENTS[documentName]()
        .filter((entry) => mediaApplies(entry.media, colorScheme))
        .reverse()
        .find((entry) => splitTopLevel(entry.selector, ',').some((part) => part.trim() === selector)
          && entry.declarations.some((declaration) => declaration.property === property));
      if (!rule) return undefined;
      const declaration = [...rule.declarations].reverse()
        .find((entry) => entry.property === property);
      return declaration.value;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Colour maths: parse, mix, composite, and measure contrast.
 * ------------------------------------------------------------------ */

const NAMED_COLORS = {
  transparent: [0, 0, 0, 0],
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
};

function parseColor(input) {
  if (input === undefined || input === null) return null;
  const value = String(input).trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (NAMED_COLORS[lower]) return NAMED_COLORS[lower].slice();

  if (lower.startsWith('#')) {
    const hex = lower.slice(1);
    const expand = (part) => parseInt(part.length === 1 ? part + part : part, 16);
    if (hex.length === 3 || hex.length === 4) {
      const channels = hex.split('').map(expand);
      return [channels[0], channels[1], channels[2], hex.length === 4 ? channels[3] / 255 : 1];
    }
    if (hex.length === 6 || hex.length === 8) {
      const channels = [];
      for (let i = 0; i < hex.length; i += 2) channels.push(parseInt(hex.slice(i, i + 2), 16));
      return [channels[0], channels[1], channels[2], hex.length === 8 ? channels[3] / 255 : 1];
    }
    return null;
  }

  if (lower.startsWith('rgb')) {
    const open = value.indexOf('(');
    const body = value.slice(open + 1, value.lastIndexOf(')'));
    const parts = body.includes(',')
      ? splitTopLevel(body, ',').map((part) => part.trim())
      : body.split('/').join(' ').split(/\s+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = (part) => (part.endsWith('%')
      ? (parseFloat(part) / 100) * 255
      : parseFloat(part));
    const alpha = parts[3] === undefined
      ? 1
      : (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]));
    return [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha];
  }

  if (lower.startsWith('color-mix(')) {
    const body = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'));
    const parts = splitTopLevel(body, ',').map((part) => part.trim());
    if (parts.length !== 3) return null;
    if (!/^in\s+srgb$/i.test(parts[0])) return null;
    const readSide = (side) => {
      const match = side.match(/\s(-?[\d.]+)%$/);
      if (match) {
        return { color: parseColor(side.slice(0, match.index).trim()), percent: parseFloat(match[1]) };
      }
      return { color: parseColor(side), percent: null };
    };
    const first = readSide(parts[1]);
    const second = readSide(parts[2]);
    if (!first.color || !second.color) return null;
    return mixSrgb(first, second);
  }

  return null;
}

function mixSrgb(first, second) {
  let p1 = first.percent;
  let p2 = second.percent;
  if (p1 === null && p2 === null) {
    p1 = 50;
    p2 = 50;
  } else if (p1 === null) {
    p1 = 100 - p2;
  } else if (p2 === null) {
    p2 = 100 - p1;
  }
  const sum = p1 + p2;
  if (sum === 0) return null;
  let alphaMultiplier = 1;
  if (sum !== 100) {
    if (sum < 100) alphaMultiplier = sum / 100;
    p1 = (p1 / sum) * 100;
    p2 = (p2 / sum) * 100;
  }
  const w1 = p1 / 100;
  const w2 = p2 / 100;
  const [r1, g1, b1, a1] = first.color;
  const [r2, g2, b2, a2] = second.color;
  const alpha = w1 * a1 + w2 * a2;
  const channel = (c1, c2) => {
    const premultiplied = w1 * c1 * a1 + w2 * c2 * a2;
    return alpha === 0 ? 0 : premultiplied / alpha;
  };
  return [channel(r1, r2), channel(g1, g2), channel(b1, b2), alpha * alphaMultiplier];
}

function composite(foreground, backdrop) {
  const [r, g, b, a] = foreground;
  if (a >= 1) return [r, g, b, 1];
  const [br, bg, bb] = backdrop;
  return [
    r * a + br * (1 - a),
    g * a + bg * (1 - a),
    b * a + bb * (1 - a),
    1,
  ];
}

function relativeLuminance(color) {
  const channel = (value) => {
    const scaled = Math.min(Math.max(value / 255, 0), 1);
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2]);
}

function contrastRatio(foreground, backdrop) {
  const front = composite(foreground, backdrop);
  const lighter = Math.max(relativeLuminance(front), relativeLuminance(backdrop));
  const darker = Math.min(relativeLuminance(front), relativeLuminance(backdrop));
  return (lighter + 0.05) / (darker + 0.05);
}

function resolveColor(resolver, token) {
  const value = resolver.token(token);
  const color = parseColor(value);
  assert.ok(color, `${token} did not resolve to a color for theme ${resolver.theme} (got ${value})`);
  return color;
}

function describe(color) {
  return `rgba(${color.map((part, index) => (index === 3 ? part.toFixed(3) : Math.round(part))).join(', ')})`;
}

function assertSameColor(actual, expected, message) {
  const close = actual.every((part, index) => Math.abs(part - expected[index]) < 0.51);
  assert.ok(close, `${message}: ${describe(actual)} !== ${describe(expected)}`);
}

/* ------------------------------------------------------------------ *
 * The theme matrix under test.
 * ------------------------------------------------------------------ */

const THEME_CASES = THEME_FILES
  .filter((name) => name !== 'system')
  .map((name) => ({ theme: name, colorScheme: 'light' }))
  .concat([
    { theme: 'system', colorScheme: 'light' },
    { theme: 'system', colorScheme: 'dark' },
  ]);

function run() {
  console.log('theme-cascade.test.js');
  let passed = 0;
  const test = (name, fn) => {
    try {
      fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      console.error(`  ✗ ${name}\n    ${error.stack || error.message}`);
      process.exitCode = 1;
    }
  };

  test('the parser sees every theme palette and the shared semantic block', () => {
    const rules = loadThemesCss();
    THEME_FILES.filter((name) => name !== 'system').forEach((name) => {
      const found = rules.some((rule) => splitTopLevel(rule.selector, ',')
        .some((part) => part.trim() === `body.theme-${name}`));
      assert.ok(found, `themes.css never reaches body.theme-${name}`);
    });
    const shared = rules.find((rule) => rule.selector.trim() === 'body'
      && rule.declarations.some((entry) => entry.property === '--app-surface'));
    assert.ok(shared, 'the shared semantic palette must be declared on body, not :root');
  });

  test('the resolver reproduces the frozen :root regression it guards against', () => {
    // A token derived at :root keeps the dark default even under theme-light.
    const rules = [
      ...loadThemesCss(),
      { media: null, selector: ':root', declarations: [{ property: '--frozen', value: 'var(--background-color)' }], source: 'probe' },
      { media: null, selector: 'body', declarations: [{ property: '--live', value: 'var(--background-color)' }], source: 'probe' },
    ];
    DOCUMENTS.probe = () => rules;
    const resolver = createResolver('probe', 'light');
    assertSameColor(parseColor(resolver.token('--frozen')), parseColor('#1e1e1e'),
      'a :root-derived token should stay dark, proving the regression is detectable');
    assertSameColor(parseColor(resolver.token('--live')), parseColor('#f4f4f9'),
      'a body-derived token should follow the light theme');
    delete DOCUMENTS.probe;
  });

  THEME_CASES.forEach(({ theme, colorScheme }) => {
    const label = theme === 'system' ? `system (${colorScheme})` : theme;

    test(`Help matches the Protocol Settings palette in ${label}`, () => {
      const help = createResolver('help', theme, colorScheme);
      const settings = createResolver('protocolSettings', theme, colorScheme);

      const settingsWindowBg = parseColor(settings.evaluate(
        settings.declarationFor('body.protocol-settings-window', 'background'),
      ));
      const settingsSurface = parseColor(settings.evaluate('var(--surface-color, var(--bg-color))'));
      const settingsText = parseColor(settings.evaluate('var(--text-color)'));
      const settingsBorder = parseColor(settings.evaluate('var(--border-color)'));
      const settingsHeading = parseColor(settings.evaluate('var(--header-color, var(--text-color))'));

      assertSameColor(resolveColor(help, '--help-background'), settingsWindowBg,
        `${label}: Help page background must match the Protocol Settings window background`);
      assertSameColor(resolveColor(help, '--help-surface'), settingsSurface,
        `${label}: Help cards must match the Protocol Settings surface`);
      assertSameColor(resolveColor(help, '--help-text'), settingsText,
        `${label}: Help body text must match Protocol Settings body text`);
      assertSameColor(resolveColor(help, '--help-border'), settingsBorder,
        `${label}: Help borders must match Protocol Settings borders`);
      assertSameColor(resolveColor(help, '--help-heading'), settingsHeading,
        `${label}: Help headings must match Protocol Settings headings`);
    });

    test(`Help stays readable in ${label}`, () => {
      const help = createResolver('help', theme, colorScheme);
      const background = resolveColor(help, '--help-background');
      const surface = resolveColor(help, '--help-surface');
      const raised = composite(resolveColor(help, '--help-raised'), surface);
      const text = resolveColor(help, '--help-text');
      const muted = resolveColor(help, '--help-muted');
      const heading = resolveColor(help, '--help-heading');
      const link = resolveColor(help, '--help-link');

      // The page and its text must sit on opposite sides of the mid tone. A
      // dark surface under near-black text is the exact reported failure.
      const backgroundIsLight = relativeLuminance(background) > 0.5;
      const textIsLight = relativeLuminance(text) > 0.5;
      assert.notStrictEqual(backgroundIsLight, textIsLight,
        `${label}: Help text and background must not share the same tone `
        + `(background ${describe(background)}, text ${describe(text)})`);
      assert.strictEqual(relativeLuminance(surface) > 0.5, backgroundIsLight,
        `${label}: Help cards must follow the page tone`);
      assert.strictEqual(relativeLuminance(raised) > 0.5, backgroundIsLight,
        `${label}: Help raised surfaces must follow the page tone`);

      assert.ok(contrastRatio(text, surface) >= 4.5,
        `${label}: Help body text contrast is ${contrastRatio(text, surface).toFixed(2)}`);
      assert.ok(contrastRatio(text, background) >= 4.5,
        `${label}: Help page text contrast is ${contrastRatio(text, background).toFixed(2)}`);
      assert.ok(contrastRatio(muted, surface) >= 3,
        `${label}: Help muted text contrast is ${contrastRatio(muted, surface).toFixed(2)}`);
      assert.ok(contrastRatio(heading, surface) >= 4.5,
        `${label}: Help heading contrast is ${contrastRatio(heading, surface).toFixed(2)}`);
      assert.ok(contrastRatio(link, surface) >= 4.5,
        `${label}: Help link contrast is ${contrastRatio(link, surface).toFixed(2)}`);
      const border = resolveColor(help, '--help-border');
      assert.notDeepStrictEqual(border.slice(0, 3).map(Math.round), surface.slice(0, 3).map(Math.round),
        `${label}: Help borders must not be identical to the card surface`);
    });

    test(`Command Line Interface shares the Help palette in ${label}`, () => {
      const cli = createResolver('cli', theme, colorScheme);
      const help = createResolver('help', theme, colorScheme);

      ['--help-background', '--help-surface', '--help-text', '--help-border', '--help-muted']
        .forEach((token) => {
          assertSameColor(resolveColor(cli, token), resolveColor(help, token),
            `${label}: ${token} must be identical in the Command Line Interface`);
        });

      const surface = resolveColor(cli, '--help-surface');
      const text = resolveColor(cli, '--help-text');
      const controls = [
        ['.cli-filter-input', 'background', 'color'],
        ['.cli-format-select', 'background', 'color'],
      ];
      controls.forEach(([selector, backgroundProperty, colorProperty]) => {
        const controlBg = parseColor(cli.evaluate(cli.declarationFor(selector, backgroundProperty)));
        const controlText = parseColor(cli.evaluate(cli.declarationFor(selector, colorProperty)));
        assert.ok(controlBg && controlText, `${label}: ${selector} colors did not resolve`);
        assertSameColor(controlBg, surface, `${label}: ${selector} background must use the shared surface`);
        assertSameColor(controlText, text, `${label}: ${selector} text must use the shared text color`);
      });

      // Interaction surfaces are tinted with the theme's own text color, so a
      // light theme darkens on hover instead of washing out with white.
      const hover = composite(parseColor(cli.evaluate('var(--app-hover-bg)')), surface);
      const backgroundIsLight = relativeLuminance(surface) > 0.5;
      assert.strictEqual(relativeLuminance(hover) < relativeLuminance(surface), backgroundIsLight,
        `${label}: hover tint must darken light themes and lighten dark themes`);
      const subtle = composite(parseColor(cli.evaluate('var(--app-subtle-bg)')), surface);
      assert.ok(contrastRatio(text, subtle) >= 4.5,
        `${label}: inline code contrast is ${contrastRatio(text, subtle).toFixed(2)}`);
    });

    test(`shared link and focus tokens follow ${label}`, () => {
      const help = createResolver('help', theme, colorScheme);
      const surface = resolveColor(help, '--help-surface');
      ['--link-color', '--link-hover-color', '--link-visited-color', '--link-active-color']
        .forEach((token) => {
          const color = resolveColor(help, token);
          assert.ok(contrastRatio(color, surface) >= 4.5,
            `${label}: ${token} contrast is ${contrastRatio(color, surface).toFixed(2)}`);
        });
      const ring = resolveColor(help, '--link-focus-ring');
      assert.ok(contrastRatio(ring, surface) >= 3,
        `${label}: focus ring contrast is ${contrastRatio(ring, surface).toFixed(2)}`);
    });
  });

  test('Help and CLI never derive palette tokens on :root or html', () => {
    ['help.css', 'cli.css', 'accessibility.css'].forEach((file) => {
      loadSheet(file).forEach((rule) => {
        const subjects = splitTopLevel(rule.selector, ',').map((part) => part.trim());
        const rootish = subjects.some((part) => part === ':root' || part === 'html'
          || part.startsWith('html,') || part.startsWith(':root'));
        if (!rootish) return;
        const custom = rule.declarations.filter((entry) => entry.property.startsWith('--'));
        assert.strictEqual(custom.length, 0,
          `${file} declares ${custom.map((entry) => entry.property).join(', ')} on `
          + `"${rule.selector.trim()}"; theme variables only exist from body downwards`);
      });
    });
  });

  test('Help and CLI carry no hard-coded theme colors', () => {
    ['help.css', 'cli.css'].forEach((file) => {
      const css = stripComments(fs.readFileSync(path.join(SRC, file), 'utf8'));
      const printIndex = css.indexOf('@media print');
      const themed = printIndex >= 0 ? css.slice(0, printIndex) : css;

      const varFallbacks = themed.match(/var\(\s*--[A-Za-z0-9-]+\s*,\s*(#[0-9a-fA-F]{3,8}|rgba?\()/g) || [];
      assert.deepStrictEqual(varFallbacks, [],
        `${file} falls back to a fixed color when a theme variable is missing: ${varFallbacks.join(', ')}`);

      const overlays = themed.match(/rgba?\(\s*(255,\s*255,\s*255|0,\s*0,\s*0)[^)]*\)/g) || [];
      assert.deepStrictEqual(overlays, [],
        `${file} paints a fixed black or white overlay: ${overlays.join(', ')}`);

      const literals = themed.match(/:\s*#[0-9a-fA-F]{3,8}\b/g) || [];
      assert.deepStrictEqual(literals, [],
        `${file} sets a literal color: ${literals.join(', ')}`);
    });
  });

  test('Help and CLI load the shared accessibility styles', () => {
    ['help.html', 'cli.html', 'protocol-settings.html'].forEach((file) => {
      const html = fs.readFileSync(path.join(SRC, file), 'utf8');
      assert.ok(/href="\.?\/?accessibility\.css"/.test(html),
        `${file} must link accessibility.css so links and focus rings match`);
      assert.ok(/href="\.?\/?themes\.css"/.test(html),
        `${file} must link themes.css so the shared palette exists`);
    });
  });

  console.log(`All ${passed} theme cascade tests passed.`);
  if (process.exitCode) process.exit(process.exitCode);
}

if (require.main === module) {
  run();
}

module.exports = {
  contrastRatio,
  createResolver,
  parseColor,
  relativeLuminance,
};
