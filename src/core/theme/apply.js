// Applies a theme (palette + font pair + light/dark) onto CSS custom properties.

import { getPalette, getFontPair } from './palettes.js';

// Light or dark? Three states, and 'auto' is the default a template or a blank site ships with.
//
// Grist gives a custom widget no way to read the app's own theme — there is nothing theme-related
// in the plugin API and the request for it is still open upstream (grist-core#552). The closest
// honest signal is the OS colour-scheme preference, which is what Grist's own default theme
// setting follows, so a user running Grist dark is almost always running their system dark too.
//
//   'light' | 'dark'  an explicit choice, made by the person using the widget — always wins
//   'auto'            follow the system, and keep following it if the system changes
//   absent            legacy configs: fall back to the palette's own mode, then the system
//
// Templates ship 'auto' on purpose. Before this, every template carried a hard-coded mode, so
// applying one flipped the page between light and dark each time you switched — the reported bug.
const systemPrefersDark = () => {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
};
export function resolveMode(theme = {}, palette = null) {
  if (theme.mode === 'light' || theme.mode === 'dark') return theme.mode;
  if (theme.mode === 'auto') return systemPrefersDark() ? 'dark' : 'light';
  if (palette?.mode) return palette.mode;              // legacy config, palette had an opinion
  return systemPrefersDark() ? 'dark' : 'light';
}

// Re-apply when the system flips, but only while the site is actually on 'auto' — an explicit
// choice must not be overridden by someone's laptop switching at sunset. Registered once.
let _autoWatch = null;
function watchSystemMode(getTheme, root) {
  if (_autoWatch) { _autoWatch.getTheme = getTheme; _autoWatch.root = root; return; }
  let mq; try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return; }
  _autoWatch = { getTheme, root };
  const onChange = () => {
    const t = _autoWatch.getTheme?.();
    if (t && t.mode === 'auto') applyTheme(t, _autoWatch.root);
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}

// ---- Contrast ----
//
// Two colours have to be DERIVED from the brand primary rather than fixed, because the primary is
// whatever a palette or a user chose and nothing else can know whether it is pale coral or deep
// navy:
//
//   --ap-on-primary : the label printed ON a primary-filled button. It was hard-coded #ffffff, so
//                     five shipped palettes had white text on a light fill — Candy measured 3.0:1
//                     and Sunset 2.78:1, both under the 4.5:1 that normal text needs.
//   --ap-link       : the primary used AS text, on the page surface. Same colour, opposite
//                     problem: Graphite's slate primary on the dark surface measured 2.05:1, which
//                     is very nearly invisible. This walks the primary toward the readable end
//                     until it clears, so the hue survives and the text can be read.
//
// Deriving both also means a palette added later, or a custom colour picked in the editor, is
// legible without anyone having to remember to check.

const _rgb = (h) => {
  const s = String(h || '').trim().replace(/^#/, '');
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  if (!/^[0-9a-f]{6}$/i.test(f)) return null;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
};
const _hex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const _lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const _ratio = (a, b) => { const x = _lum(a), y = _lum(b); const [hi, lo] = x > y ? [x, y] : [y, x]; return (hi + 0.05) / (lo + 0.05); };
const _mix = (rgb, towards, amount) => rgb.map((v, i) => v + (towards[i] - v) * amount);

/**
 * Black or white, whichever the fill can actually carry.
 *
 * Best effort, not a guarantee: a mid-tone fill reaches 4.5:1 with neither. #1c7ed6 — Ocean's
 * primary until this was measured — managed 4.20 against white and 4.36 against black, so the
 * button label failed whichever way it went. There is no label colour that fixes that; the fill
 * has to move, which is why Ocean's did. Every palette shipped here now clears 4.5, and a custom
 * colour picked in the editor gets the better of the two.
 */
export function onColor(fill) {
  const rgb = _rgb(fill);
  if (!rgb) return '#ffffff';
  return _ratio(rgb, [255, 255, 255]) >= _ratio(rgb, [17, 20, 34]) ? '#ffffff' : '#111422';
}

// The same hue, nudged toward white or black in small steps until it is readable on `surface`.
// Gives up at the extreme rather than looping, so a pathological colour still yields something.
export function readableInk(color, surface, target = 4.5) {
  const rgb = _rgb(color), bg = _rgb(surface);
  if (!rgb || !bg) return color;
  if (_ratio(rgb, bg) >= target) return color;
  const towards = _lum(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  for (let step = 1; step <= 40; step++) {
    // Measure what will actually be emitted. Checking the un-rounded mix and rounding afterwards
    // let a colour through that missed the target by a hundredth once its channels were squared
    // off to integers — passing by calculation and failing when drawn.
    const candidate = _hex(_mix(rgb, towards, step / 40));
    if (_ratio(_rgb(candidate), bg) >= target) return candidate;
  }
  return _hex(towards);
}

export function applyTheme(theme = {}, rootEl) {
  const root = rootEl || document.getElementById('anupress-root') || document.documentElement;
  const style = document.documentElement.style;

  const pal = theme.palette && theme.palette.series ? theme.palette : getPalette(theme.paletteId);
  const fonts = theme.fonts && theme.fonts.head ? theme.fonts : getFontPair(theme.fontId);
  const mode = resolveMode(theme, pal);
  watchSystemMode(() => theme, root);

  const primary = theme.primary || pal.primary;
  const accent = theme.accent || pal.accent;
  set(style, '--ap-primary', primary);
  set(style, '--ap-accent', accent);
  // Derived from whatever primary is in force, palette or custom. The surfaces match tokens.css:
  // #ffffff in light, #1a1d2b in dark.
  const surface = mode === 'dark' ? '#1a1d2b' : '#ffffff';
  set(style, '--ap-on-primary', onColor(primary));
  set(style, '--ap-on-accent', onColor(accent));
  set(style, '--ap-link', readableInk(primary, surface));
  (pal.series || []).forEach((c, i) => set(style, `--ap-series-${i + 1}`, c));
  if (theme.primary) set(style, '--ap-series-1', theme.primary);
  if (theme.accent) set(style, '--ap-series-2', theme.accent);
  set(style, '--ap-font-head', fonts.head);
  set(style, '--ap-font-body', fonts.body);

  root.setAttribute('data-mode', mode);
  // Also flip mode on <html> so dark vars cascade to overlays appended to <body>
  // (drawer, consent modal, toasts) — they live outside .ap-root.
  document.documentElement.setAttribute('data-mode', mode);
  // expose the active series list for the chart engine
  root._apSeries = pal.series || [];
  // Embed blocks render into opaque-origin iframes, which cannot read these variables or inherit
  // any colour from the page — so they have to be told. Announced as an event rather than called
  // directly to keep the theme layer free of any dependency on the render layer.
  document.dispatchEvent(new CustomEvent('ap:theme'));
}

function set(style, k, v) { if (v) style.setProperty(k, v); }

export function currentSeriesColors(rootEl) {
  const root = rootEl || document.getElementById('anupress-root');
  if (root && root._apSeries && root._apSeries.length) return root._apSeries.slice();
  const cs = getComputedStyle(document.documentElement);
  const out = [];
  for (let i = 1; i <= 8; i++) { const c = cs.getPropertyValue(`--ap-series-${i}`).trim(); if (c) out.push(c); }
  return out.length ? out : ['#6d5efc', '#16c4a6', '#ff8a5b', '#ffd166', '#ef476f', '#4cc9f0'];
}

export function readVar(name) {
  const root = document.getElementById('anupress-root') || document.documentElement;
  return getComputedStyle(root).getPropertyValue(name).trim();
}

// Site-wide "design" controls (corners, density, width, shadows, text size). Applied as inline
// vars on the .ap-root element so they win in BOTH light and dark themes. Only set what's chosen.
const DESIGN_SHADOWS = {
  flat: ['0 1px 1px rgba(20,22,40,.05)', '0 2px 5px rgba(20,22,40,.07)', '0 10px 26px rgba(20,22,40,.14)'],
  soft: ['0 1px 2px rgba(20,22,40,.06), 0 1px 1px rgba(20,22,40,.04)', '0 8px 24px rgba(31,34,51,.08), 0 2px 6px rgba(31,34,51,.05)', '0 24px 60px rgba(31,34,51,.16), 0 8px 20px rgba(31,34,51,.08)'],
  bold: ['0 2px 4px rgba(20,22,40,.12)', '0 14px 32px rgba(31,34,51,.18), 0 4px 10px rgba(31,34,51,.10)', '0 30px 70px rgba(31,34,51,.30), 0 12px 28px rgba(31,34,51,.18)'],
};
const FS_KEYS = ['--ap-fs-xs', '--ap-fs-sm', '--ap-fs-md', '--ap-fs-lg', '--ap-fs-xl', '--ap-fs-2xl', '--ap-fs-3xl'];
const FS_BASE = [12, 13, 15, 18, 24, 34, 46];

export function applyDesign(design = {}, rootEl) {
  const root = rootEl || document.getElementById('anupress-root') || document.documentElement;
  const s = root.style;
  if (design.radius != null) {
    s.setProperty('--ap-radius', design.radius + 'px');
    s.setProperty('--ap-radius-sm', Math.max(4, design.radius - 6) + 'px');
    s.setProperty('--ap-radius-lg', (Number(design.radius) + 8) + 'px');
  } else { ['--ap-radius', '--ap-radius-sm', '--ap-radius-lg'].forEach((k) => s.removeProperty(k)); }
  if (design.gap != null) { s.setProperty('--ap-gap', design.gap + 'px'); s.setProperty('--ap-pad', (Number(design.gap) + 4) + 'px'); }
  else { s.removeProperty('--ap-gap'); s.removeProperty('--ap-pad'); }
  if (design.maxw) s.setProperty('--ap-maxw', design.maxw === 'full' ? '100%' : design.maxw + 'px'); else s.removeProperty('--ap-maxw');
  if (design.shadow && DESIGN_SHADOWS[design.shadow]) {
    const [sm, md, lg] = DESIGN_SHADOWS[design.shadow];
    s.setProperty('--ap-shadow-sm', sm); s.setProperty('--ap-shadow', md); s.setProperty('--ap-shadow-lg', lg);
  } else { ['--ap-shadow-sm', '--ap-shadow', '--ap-shadow-lg'].forEach((k) => s.removeProperty(k)); }
  if (design.fontScale && Number(design.fontScale) !== 1) {
    FS_KEYS.forEach((k, i) => s.setProperty(k, Math.round(FS_BASE[i] * design.fontScale) + 'px'));
  } else { FS_KEYS.forEach((k) => s.removeProperty(k)); }
}
