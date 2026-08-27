// Hand-authored SVG icon set. Strings so they bundle with the JS (no loader, no fetch).
// UI icons are 24x24 stroke icons inheriting currentColor; chart icons are little glyphs.

import { fromHTML } from '../util.js';
import { ANUPRESS_LOGO } from './brand-logo.js';
import { ICON_LIBRARY, ICON_ALIASES, ICON_GROUPS } from './icon-library.js';

const S = (body, opts = '') =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${opts}>${body}</svg>`;

export const ICONS = {
  // --- UI ---
  edit: S('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  check: S('<path d="M20 6 9 17l-5-5"/>'),
  checkCircle: S('<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
  close: S('<path d="M18 6 6 18M6 6l12 12"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  trash: S('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>'),
  grip: S('<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>', 'fill="currentColor" stroke="none"'),
  shield: S('<path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z"/><path d="m9 12 2 2 4-4"/>'),
  lock: S('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  eye: S('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>'),
  save: S('<path d="M5 3h11l3 3v15H5Z"/><path d="M8 3v6h7"/><path d="M8 14h8v7H8Z"/>'),
  menu: S('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  chevron: S('<path d="m6 9 6 6 6-6"/>'),
  arrowUp: S('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: S('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  palette: S('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-.4-.2-.7-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/><circle cx="17" cy="11" r="1"/>'),
  layout: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>'),
  calendar: S('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  image: S('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 18 5-5 4 4 3-3 4 4"/>'),
  type: S('<path d="M4 6V4h16v2M9 20h6M12 4v16"/>'),
  sparkles: S('<path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6.3 6.3 4 4M20 20l-2.3-2.3M17.7 6.3 20 4M4 20l2.3-2.3"/><circle cx="12" cy="12" r="3"/>'),
  sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: S('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'),
  sliders: S('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  // A gear, for the one button that now gathers theme, design, pages, header and templates.
  // 'sliders' would have done but already means Design, one level inside it.
  settings: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  database: S('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  download: S('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  globe: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"/>'),
  star: S('<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7Z"/>'),
  copy: S('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  // stat glyphs
  trending: S('<path d="M3 17 9 11l4 4 8-8M21 7v5M21 7h-5"/>'),
  barchart: S('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
  buttonEl: S('<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M9 12h6"/>'),
  spacer: S('<path d="M4 5h16M4 19h16M12 8v8M9 10l3-3 3 3M9 14l3 3 3-3"/>'),
  progress: S('<rect x="3" y="9" width="18" height="6" rx="3"/><rect x="3" y="9" width="12" height="6" rx="3" fill="currentColor" opacity=".85"/>'),
  counter: S('<rect x="3" y="6" width="5" height="12" rx="1.5"/><rect x="9.5" y="6" width="5" height="12" rx="1.5"/><rect x="16" y="6" width="5" height="12" rx="1.5"/>'),
  accordion: S('<rect x="3" y="3" width="18" height="7" rx="1.5"/><path d="m15 6.5 2 2 2-2"/><rect x="3" y="13" width="18" height="3.5" rx="1.5"/><rect x="3" y="18.5" width="18" height="3.5" rx="1.5"/>'),
  code: S('<path d="m8 6-5 6 5 6M16 6l5 6-5 6"/>'),
  qrcode: S('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3" fill="currentColor" stroke="none"/><rect x="18" y="18" width="3" height="3" fill="currentColor" stroke="none"/><rect x="14" y="19" width="2" height="2" fill="currentColor" stroke="none"/><rect x="19" y="14" width="2" height="2" fill="currentColor" stroke="none"/>'),
  barcode: S('<path d="M3 5v14M6 5v14M9 5v10M12 5v14M15 5v10M18 5v14M21 5v14"/>'),
  countdown: S('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'),
  timeline: S('<path d="M4 4v16"/><circle cx="4" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="4" cy="13" r="2" fill="currentColor" stroke="none"/><circle cx="4" cy="20" r="2" fill="currentColor" stroke="none"/><path d="M9 6h11M9 13h11M9 20h11"/>'),
  divider: S('<path d="M4 12h4M10 12h4M16 12h4"/>'),
  pricing: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h5"/><circle cx="16.5" cy="15.5" r="2.5"/>'),
  coins: S('<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.6 2.7 3 6 3M15 13v4c0 1.6-2.7 3-6 3s-6-1.4-6-3v-4"/><ellipse cx="15" cy="13" rx="6" ry="3"/>'),
  users: S('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.2a3.2 3.2 0 0 1 0 6.2M18 20a5.5 5.5 0 0 0-3-4.9"/>'),
  cart: S('<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.2 11.2a1 1 0 0 0 1 .8h8.4a1 1 0 0 0 1-.8L20 8H6"/>'),
  pulse: S('<path d="M3 12h4l2-7 4 14 2-7h6"/>'),
  refresh: S('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  target: S('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>'),
};

// The content library (assets/icon-library.js) folded in, so icon(name) resolves anything.
//
// The UI set above WINS every collision, and that direction is not a style preference: those names
// are wired into buttons and into the chart-type picker, while the library's are stored in saved
// designs. A library glyph quietly taking over 'check' would change the tick on every confirm
// button in the product. Library names that clash are dropped and reported by the test instead.
export const ICON_CATEGORIES = ICON_GROUPS.filter((g) => ICON_LIBRARY[g.id]).map((g) => ({
  ...g,
  icons: Object.keys(ICON_LIBRARY[g.id]).filter((n) => !(n in ICONS)),
}));

for (const group of Object.values(ICON_LIBRARY)) {
  for (const [name, body] of Object.entries(group)) {
    if (name in ICONS) continue;
    ICONS[name] = S(body);
  }
}

// name -> the words someone might type to find it. The name itself is always searchable; this adds
// the synonyms, so "money" reaches coins and "customer" reaches person.
export const ICON_SEARCH_TERMS = ICON_ALIASES;

/** Every pickable content icon, in category order. */
export function allIconNames() {
  return ICON_CATEGORIES.flatMap((c) => c.icons);
}

/**
 * Icons matching a search, or everything when the box is empty. Matches the name and its synonyms,
 * so a picker over 500 glyphs is usable without knowing what any of them were called.
 */
export function searchIcons(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return ICON_CATEGORIES;
  const hit = (name) => name.toLowerCase().includes(q)
    || (ICON_ALIASES[name] || '').toLowerCase().includes(q);
  return ICON_CATEGORIES
    .map((c) => ({ ...c, icons: c.icons.filter(hit) }))
    .filter((c) => c.icons.length);
}

// Chart-type glyphs for the picker (filled, distinct silhouettes).
const CS = (body) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const CHART_ICONS = {
  bar: CS('<path d="M4 20V10M9 20V5M14 20v-8M19 20V8"/><path d="M3 20h18"/>'),
  column: CS('<path d="M4 20h4v-7H4ZM10 20h4V8h-4ZM16 20h4v-4h-4Z"/><path d="M3 20h18"/>'),
  line: CS('<path d="M3 16l5-5 4 3 8-8"/><path d="M3 20h18"/>'),
  area: CS('<path d="M3 16l5-5 4 3 8-8v8H3Z" fill="currentColor" opacity=".25"/><path d="M3 16l5-5 4 3 8-8"/>'),
  pie: CS('<path d="M12 3a9 9 0 1 0 9 9h-9Z" fill="currentColor" opacity=".25"/><path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M12 12V3"/>'),
  doughnut: CS('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v5"/>'),
  scatter: CS('<circle cx="7" cy="15" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="16" cy="13" r="1.6"/><circle cx="18" cy="7" r="1.6"/><path d="M3 20h18"/>'),
  radar: CS('<path d="M12 3l8 6-3 9H7L4 9Z"/><path d="M12 8l4 3-1.5 4.5h-5L8 11Z" fill="currentColor" opacity=".25"/>'),
  treemap: CS('<rect x="3" y="4" width="11" height="9" rx="1"/><rect x="15" y="4" width="6" height="6" rx="1"/><rect x="3" y="14" width="6" height="6" rx="1"/><rect x="10" y="12" width="11" height="8" rx="1"/>'),
  gauge: CS('<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-4"/><circle cx="12" cy="16" r="1.3" fill="currentColor"/>'),
  funnel: CS('<path d="M3 5h18l-6 7v6l-6-3v-3Z"/>'),
  stat: CS('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 14l3-3 2 2 5-5"/>'),
};

// ANUPRESS brand mark (an "A" monogram in a rounded gradient tile) + wordmark.
export const BRAND_MARK = `
<svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="apg" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
    <stop stop-color="#6d5efc"/><stop offset="1" stop-color="#16c4a6"/></linearGradient></defs>
  <rect width="44" height="44" rx="12" fill="url(#apg)"/>
  <path d="M14 31 22 12l8 19" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17.5 25.5h9" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="22" cy="9.5" r="1.7" fill="#fff"/>
</svg>`;

// The real ANUPRESS logo (embedded, resized). Used as the default brand everywhere.
export const brandLogoHTML = (h = 40) =>
  `<img src="${ANUPRESS_LOGO}" alt="ANUPRESS" style="height:${h}px;width:auto;display:block" />`;
export function brandLogo(h = 40) { return fromHTML(brandLogoHTML(h)); }

// Empty-state illustration (friendly, non-robotic).
export const EMPTY_ART = `
<svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="ea" x1="0" y1="0" x2="200" y2="140" gradientUnits="userSpaceOnUse">
    <stop stop-color="#6d5efc" stop-opacity=".18"/><stop offset="1" stop-color="#16c4a6" stop-opacity=".18"/></linearGradient></defs>
  <rect x="24" y="30" width="152" height="86" rx="12" fill="url(#ea)"/>
  <rect x="40" y="78" width="16" height="26" rx="3" fill="#6d5efc" opacity=".55"/>
  <rect x="64" y="64" width="16" height="40" rx="3" fill="#16c4a6" opacity=".65"/>
  <rect x="88" y="52" width="16" height="52" rx="3" fill="#6d5efc" opacity=".75"/>
  <rect x="112" y="70" width="16" height="34" rx="3" fill="#ff8a5b" opacity=".7"/>
  <rect x="136" y="58" width="16" height="46" rx="3" fill="#16c4a6" opacity=".55"/>
  <circle cx="100" cy="22" r="9" fill="#ffd166"/>
  <path d="M40 116h120" stroke="#6d5efc" stroke-opacity=".3" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// Icons here are decoration: every button and link that carries one already has its own
// aria-label or visible text, so announcing the glyph as well only adds an unlabelled graphic to
// each pass through the page — 96 of them on the demo. Hiding them from the accessibility tree
// leaves the label as the single thing announced. focusable="false" is for IE/Edge legacy, where
// inline SVG lands in the tab order otherwise; it costs nothing elsewhere.
function decorative(node) {
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  return node;
}

export function icon(name, cls) {
  const node = decorative(fromHTML(ICONS[name] || ICONS.sparkles));
  if (cls) node.setAttribute('class', cls);
  return node;
}
export function chartIcon(name) { return decorative(fromHTML(CHART_ICONS[name] || CHART_ICONS.bar)); }
export function iconHTML(name) { return ICONS[name] || ''; }
