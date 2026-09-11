const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const {
  composite, contrastRatio, createRuleResolver, loadSheet, mediaApplies,
  parseCss, parseColor, splitTopLevel,
} = require('./theme-cascade.test');

const source = path.join(__dirname, '../src');
const themes = fs.readdirSync(path.join(source, 'themes'))
  .filter((name) => /^theme-.+\.css$/.test(name)).map((name) => name.slice(6, -4));
const views = [
  { file: 'index.html', name: 'Main' },
  { file: 'index.html', name: 'Main narrow', width: 720 },
  ...['velocity-login', 'config', 'launch-config', 'error', 'about', 'help', 'cli'].map((name) => ({ file: `${name}.html`, name })),
  { file: 'protocol-settings.html', name: 'Detached Protocol Settings' },
];
const states = [
  {}, { hover: true }, { focus: true }, { hover: true, focus: true },
  { active: true }, { active: true, hover: true }, { active: true, focus: true },
  { disabled: true }, { disabled: true, hover: true }, { disabled: true, focus: true },
];

function specificity(selector) {
  let remainder = selector;
  let score = 0;
  let match;
  while ((match = /:(where|is|not|has)\(/.exec(remainder))) {
    const start = match.index + match[0].length;
    let end = start;
    let depth = 1;
    while (end < remainder.length && depth) {
      if (remainder[end] === '(') depth++;
      if (remainder[end] === ')') depth--;
      end++;
    }
    if (match[1] !== 'where') score += Math.max(...splitTopLevel(remainder.slice(start, end - 1), ',').map(specificity));
    remainder = remainder.slice(0, match.index) + remainder.slice(end);
  }
  return score + (remainder.match(/#[\w-]+/g) || []).length * 10000
    + ((remainder.match(/\.[\w-]+/g) || []).length + (remainder.match(/\[[^\]]*\]/g) || []).length
      + (remainder.match(/:(?!:)[\w-]+/g) || []).length) * 100
    + (remainder.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
}

function backgroundColors(value, foreground) {
  if (!value || value === 'none') return [[0, 0, 0, 0]];
  const replaced = value.replace(/currentColor/g, `rgba(${foreground.join(',')})`);
  const values = replaced.startsWith('linear-gradient(')
    ? splitTopLevel(replaced.slice(replaced.indexOf('(') + 1, -1), ',').slice(1)
    : [replaced];
  return values.map((part) => {
    const color = parseColor(part.trim().replace(/\s+[\d.]+%$/, ''));
    assert.ok(color, `Unresolved background: ${part}`);
    return color;
  });
}

function measurements(view, theme, scheme) {
  const dom = new JSDOM(fs.readFileSync(path.join(source, view.file), 'utf8'));
  const { document } = dom.window;
  document.body.classList.add(`theme-${theme}`);
  document.body.dataset.theme = theme;
  const count = document.querySelector('.protocol-settings-count');
  if (count) { count.textContent = '2'; count.hidden = false; }
  if (view.file === 'protocol-settings.html') {
    const main = new JSDOM(fs.readFileSync(path.join(source, 'index.html'), 'utf8'));
    document.getElementById('protocol-settings-root').innerHTML = main.window.document.getElementById('protocol-settings-dialog').outerHTML;
    document.body.classList.add('protocol-settings-window');
    main.window.close();
  }
  if (view.file === 'cli.html') {
    const extra = document.createElement('div');
    extra.innerHTML = '<button class="cli-copy-button">Copy example</button><button class="cli-active-filter-pill is-removable">Remove filter</button>';
    document.querySelector('.help-container').appendChild(extra);
  }
  const rules = [...document.querySelectorAll('link[rel="stylesheet"], style')].flatMap((node) => node.tagName === 'STYLE'
    ? parseCss(node.textContent, view.file)
    : loadSheet(node.getAttribute('href').replace(/^\.\//, '')))
    .concat(loadSheet(`themes/theme-${theme}.css`));
  const resolver = createRuleResolver(rules, theme, scheme, [...document.body.classList]);
  const matchesMedia = (media) => {
    const widths = [...(media || '').matchAll(/(max|min)-width:\s*(\d+)px/g)];
    if (widths.length && view.width) return widths.every(([, bound, size]) => bound === 'max' ? view.width <= Number(size) : view.width >= Number(size));
    return mediaApplies(media, scheme);
  };
  const compiled = rules.filter((rule) => matchesMedia(rule.media)).flatMap((rule, order) => {
    const declarations = rule.declarations.filter(({ property }) => ['color', 'background', 'background-color', 'background-image', 'opacity'].includes(property));
    if (!declarations.length) return [];
    return splitTopLevel(rule.selector, ',').filter((selector) => !selector.includes('::')).map((selector) => ({
      query: selector.replace(/:(hover|focus-visible|focus|active)\b/g, '[data-contrast-$1]'),
      weight: specificity(selector) * 100000 + order,
      declarations,
    }));
  });
  const canvas = { color: parseColor(resolver.token('--text-color')), backgrounds: [parseColor(resolver.token('--background-color'))], opacity: 1 };
  const cache = new Map();
  const colorOf = (element, parent) => {
    const declarations = new Map();
    const add = ({ property, value }, weight) => {
      const important = /\s*!important\s*$/.test(value);
      const rank = weight + (important ? 1e15 : 0);
      const raw = value.replace(/\s*!important\s*$/, '');
      const entries = property === 'background'
        ? [
          ['background-color', resolver.evaluate(raw)?.startsWith('linear-gradient(') ? 'transparent' : raw],
          ['background-image', resolver.evaluate(raw)?.startsWith('linear-gradient(') || raw === 'inherit' ? raw : 'none'],
        ] : [[property, raw]];
      for (const [name, entry] of entries) {
        const previous = declarations.get(name);
        if (!previous || rank >= previous.rank) declarations.set(name, { value: entry, rank });
      }
    };
    for (const rule of compiled) if (element.matches(rule.query)) rule.declarations.forEach((entry) => add(entry, rule.weight));
    parseCss(`x { ${element.getAttribute('style') || ''} }`, 'inline')
      .flatMap((rule) => rule.declarations).forEach((entry) => add(entry, 1e14));
    const value = (name) => {
      const entry = declarations.get(name);
      if (!entry) return undefined;
      const resolved = resolver.evaluate(entry.value);
      assert.notStrictEqual(resolved, undefined, `Unresolved ${name}: ${entry.value} on ${element.id || element.className}`);
      return resolved;
    };
    const foreground = value('color');
    const color = !foreground || ['inherit', 'currentColor'].includes(foreground) ? parent.color : parseColor(foreground);
    assert.ok(color, `Unresolved foreground: ${foreground}`);
    const bg = value('background-color');
    let backgrounds = bg === 'inherit' ? parent.backgrounds
      : backgroundColors(bg, color).flatMap((item) => parent.backgrounds.map((backdrop) => composite(item, backdrop)));
    const image = value('background-image');
    if (image && !['none', 'inherit'].includes(image)) {
      backgrounds = backgroundColors(image, color).flatMap((item) => backgrounds.map((backdrop) => composite(item, backdrop)));
    }
    return { color, backgrounds, opacity: Number(value('opacity') ?? 1) };
  };
  const ancestors = (element) => {
    if (!element) return canvas;
    if (!cache.has(element)) cache.set(element, colorOf(element, ancestors(element.parentElement)));
    return cache.get(element);
  };
  const rows = [];
  const cases = [...document.querySelectorAll('button, [role="button"]')].flatMap((button) => (
    button.id === 'protocol-settings-btn' ? ['configured', 'warning']
      : button.id === 'auth-badge' ? ['on', 'off', 'warning', 'error'] : ['']
  ).map((appearance) => ({ button, appearance })));
  try {
    for (const { button, appearance } of cases) {
      button.closest('.activity-strip')?.classList.remove('hidden');
      if (button.id === 'protocol-settings-btn') count.dataset.warning = String(appearance === 'warning');
      if (button.id === 'auth-badge') button.dataset.authState = appearance;
      const protocol = button.closest('.protocol-settings-dialog');
      const selectedStates = button.matches('.scope-btn, .auth-tab, .protocol-settings-tab, .cli-filter-chip, .control-button, .activity-action-btn, .tls-badge')
        ? [false, true] : [button.classList.contains('active')];
      const toggleStates = selectedStates.map((selected) => ({ selected, dataOnly: false }));
      if (button.hasAttribute('data-enabled')) toggleStates.push({ selected: true, dataOnly: true });
      const bannerStates = button.classList.contains('status-banner-dismiss') ? ['info', 'success', 'error', 'warning'] : [''];
      for (const readOnly of protocol ? [false, true] : [false]) {
        if (protocol) { protocol.dataset.readOnly = String(readOnly); protocol.setAttribute('open', ''); }
        for (const banner of bannerStates) {
          if (banner) button.parentElement.className = `status-banner ${banner}`;
          for (const { selected, dataOnly } of toggleStates) {
            button.classList.toggle(button.matches('.cli-filter-chip') ? 'is-active' : button.matches('.tls-badge') ? 'pinned' : 'active', selected && !dataOnly);
            if (button.matches('.protocol-settings-tab')) button.setAttribute('aria-selected', String(selected));
            if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', String(selected));
            if (button.hasAttribute('data-enabled')) button.dataset.enabled = String(selected && dataOnly);
            for (const state of states.filter((item) => button.tagName === 'BUTTON' || !item.disabled)) {
              cache.clear();
              button.disabled = Boolean(state.disabled);
              for (const pseudo of ['hover', 'focus-visible', 'focus', 'active']) {
                button.toggleAttribute(`data-contrast-${pseudo}`, Boolean(pseudo.startsWith('focus') ? state.focus : state[pseudo]));
              }
              const parent = ancestors(button.parentElement);
              const paint = colorOf(button, parent);
              const role = button.id === 'connect-btn' ? 'success' : button.id === 'disconnect-btn' ? 'danger'
                : button.matches('.control-button') ? (selected ? 'toggle' : 'info')
                  : button.id === 'protocol-settings-btn' ? 'info' : null;
              if (role) {
                const prefix = state.disabled ? '--action-button-disabled' : `--action-${role}${state.hover ? '-hover' : ''}`;
                assert.deepStrictEqual(paint.color, parseColor(resolver.token(`${prefix}-text`)), `${button.id}: wrong ${role} foreground`);
                assert.deepStrictEqual(paint.backgrounds[0], parseColor(resolver.token(`${prefix}-bg`)), `${button.id}: wrong ${role} background`);
              }
              let opacity = paint.opacity;
              for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) opacity *= ancestors(ancestor).opacity;
              let minimum = Infinity;
              for (const backdrop of parent.backgrounds) for (const background of paint.backgrounds) {
                const foreground = composite(paint.color, background);
                minimum = Math.min(minimum, contrastRatio(
                  composite([...foreground.slice(0, 3), opacity], backdrop),
                  composite([...background.slice(0, 3), opacity], backdrop),
                ));
              }
              for (const span of button.querySelectorAll('span')) {
                if (!span.textContent.trim()) continue;
                const child = colorOf(span, paint);
                for (const background of child.backgrounds) {
                  minimum = Math.min(minimum, contrastRatio(
                    composite([...child.color.slice(0, 3), child.color[3] * child.opacity * opacity], background), background,
                  ));
                }
              }
              rows.push({
                view: view.name, theme, scheme, button: button.id || button.className,
                selected, dataOnly, readOnly, banner, appearance, state, ratio: minimum,
              });
            }
          }
        }
      }
    }
    return rows;
  } finally {
    dom.window.close();
  }
}

const rows = views.flatMap((view) => themes.flatMap((theme) => (
  theme === 'system' ? ['light', 'dark'] : ['light']
).flatMap((scheme) => measurements(view, theme, scheme))));
const failures = rows.filter((row) => row.ratio < 4.5);
console.log(`Measured ${rows.length} button combinations across ${views.length} surfaces and ${themes.length} themes.`);
console.log(`Enabled minimum: ${Math.min(...rows.filter((row) => !row.state.disabled).map((row) => row.ratio)).toFixed(3)}:1`);
console.log(`Disabled minimum: ${Math.min(...rows.filter((row) => row.state.disabled).map((row) => row.ratio)).toFixed(3)}:1`);
if (failures.length) {
  const groups = new Map();
  for (const row of failures) {
    const key = `${row.view}: ${row.button} (${row.state.disabled ? 'disabled' : 'enabled'})`;
    groups.set(key, Math.min(groups.get(key) ?? Infinity, row.ratio));
  }
  console.log([...groups].map(([key, ratio]) => `${key}: ${ratio.toFixed(3)}:1`).join('\n'));
}
assert.strictEqual(failures.length, 0, `${failures.length} contrast failures:\n${JSON.stringify(failures.slice(0, 20), null, 2)}`);
