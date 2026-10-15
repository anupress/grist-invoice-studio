// The interface's language: English, or German.
//
// The code writes its interface in English, and that stays the single source of what it says. In
// German, every piece of interface text that reaches the page (a label, a button, a hint, a toast,
// a placeholder, a tooltip) is looked up in ./de.js on its way in and replaced when there is an
// entry. Anything without one stays English, which is the safe failure: a missing translation is
// a word in English, never a broken screen.
//
// What is NEVER touched: the document itself (it has its own words per language, doc/lang.js),
// what a person typed (inputs and text areas hold values, not text nodes), code blocks, and the
// places that show data from the person's tables (client names, table and column ids), which are
// marked data-nt where they are built.
//
// The choice is per browser rather than per document: it is how one person reads the widget, and
// two people on one document may read different languages. Automatic follows the browser.

import { DE, DE_PATTERNS } from './de.js';

const KEY = 'invoiceStudio.uiLanguage';

export const UI_LANGUAGES = [
  { id: 'auto', label: 'Automatic (this browser’s language)' },
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
];

/** What was chosen in this browser: 'auto', 'en' or 'de'. */
export function storedUiLanguage() {
  try {
    const v = localStorage.getItem(KEY);
    return UI_LANGUAGES.some((l) => l.id === v) ? v : 'auto';
  } catch { return 'auto'; }
}

export function storeUiLanguage(v) {
  try { localStorage.setItem(KEY, v); } catch { /* the choice lasts the session */ }
}

/** The language the interface is drawn in, from the choice and the browser's own language. */
export function resolveUiLanguage(choice = storedUiLanguage(), browser = (typeof navigator !== 'undefined' ? navigator.language : 'en')) {
  if (choice === 'en' || choice === 'de') return choice;
  return /^de\b/i.test(String(browser || '')) ? 'de' : 'en';
}

let current = 'en';
export const uiLanguage = () => current;

/** One piece of interface text, in the current language. Leading and trailing space are kept. */
export function translateText(s, lang = current) {
  if (lang !== 'de' || s == null) return s;
  const str = String(s);
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
  const core = m[2];
  if (!core || !/[A-Za-z]/.test(core)) return str;
  const out = lookup(core);
  return out == null ? str : m[1] + out + m[3];
}

function lookup(core) {
  if (Object.prototype.hasOwnProperty.call(DE, core)) return DE[core];
  for (const [re, fn] of DE_PATTERNS) {
    const r = re.exec(core);
    if (r) return fn(...r.slice(1));
  }
  // A required field's label carries a star, and a list item's reason follows a dash; the words
  // around them are what the dictionary knows.
  const star = /^(.+?)( \*)$/.exec(core);
  if (star) { const t = lookup(star[1]); return t == null ? null : t + star[2]; }
  const dash = /^([—·] )(.+)$/.exec(core);
  if (dash) { const t = lookup(dash[2]); return t == null ? null : dash[1] + t; }
  return null;
}

// Where interface text is NOT: the document, data from the person's tables, and code.
const SKIP = '[data-nt], .inv-doc, .inv-party__name, .inv-party__line, .rec-preview__price, .studio-side__num, .studio-side__client, .studio-side__name, .studio-side__total, .studio-cols__role, code, textarea, script, style';
const ATTRS = ['placeholder', 'title', 'aria-label', 'label'];

const skipped = (el) => !el || !!el.closest(SKIP);

function translateNode(node) {
  if (current !== 'de' || !node) return;
  if (node.nodeType === 3) {
    if (skipped(node.parentElement)) return;
    const next = translateText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== 1) return;
  if (skipped(node)) return;
  for (const a of ATTRS) {
    if (!node.hasAttribute(a)) continue;
    const v = node.getAttribute(a);
    const next = translateText(v);
    if (next !== v) node.setAttribute(a, next);
  }
  for (const child of node.childNodes) translateNode(child);
}

let observer = null;

/**
 * Set the language and keep the page in it. In German, everything already on the page is
 * translated, and a mutation observer translates what is added or changed from then on; in
 * English the observer stops. Switching back to English needs the page drawn again from the code,
 * which is what the caller does after choosing.
 */
export function applyUiLanguage(lang, root = typeof document !== 'undefined' ? document.body : null) {
  current = lang === 'de' ? 'de' : 'en';
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-ui-lang', current);
  if (!root || typeof MutationObserver === 'undefined') return;
  if (observer) { observer.disconnect(); observer = null; }
  if (current !== 'de') return;
  translateNode(root);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(translateNode);
      else if (r.type === 'characterData') translateNode(r.target);
      else if (r.type === 'attributes') translateNode(r.target);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
