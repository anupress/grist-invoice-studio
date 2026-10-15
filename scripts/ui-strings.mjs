// The interface text the widget's code writes, found by the calls that put text on screen: field(),
// section(), button(), toast(), say(), opt(), and the text / label / placeholder / title / hint
// properties. Used by the interface-language test to say which of them German does not cover yet;
// `node scripts/ui-strings.mjs` prints the uncovered ones.
//
// Only plain quoted literals are collected. Text built with ${…} is the patterns' job (i18n/de.js),
// and is checked by example in the test.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const UI_FILES = [
  'src/main.js', 'src/compose/composer.js', 'src/compose/lines-grid.js', 'src/compose/record-form.js',
  'src/compose/send-panel.js', 'src/settings/panel.js', 'src/model/records.js', 'src/model/listing.js',
  'src/model/lifecycle.js', 'src/doc/kinds.js', 'src/doc/layouts.js', 'src/templates/index.js',
  'src/money/tax/exemptions.js', 'src/money/tax/rates.js', 'src/send/email-shell.js', 'src/einvoice/index.js', 'src/einvoice/check.js',
  'src/grist/writer.js', 'src/send/endpoint.js', 'src/send/clipboard.js', 'src/send/outbox.js',
];

// A call or property that puts its first string on screen. The literal is single- or double-quoted
// with no ${…} in it.
const STR = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"`;
const SITES = [
  String.raw`\b(?:field|section|button|toast|say|hintStrip)\(\s*(?:${STR})`,
  String.raw`\bopt\(\s*'[^']*',\s*(?:${STR})`,
  String.raw`\b(?:text|label|placeholder|title|hint|ariaLabel|why|error|message|note|'aria-label'):\s*(?:${STR})`,
];

const unescape = (s) => s
  .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c));

/** Every interface literal in the files, once each, with where it was first seen. */
export function uiStrings(files = UI_FILES) {
  const seen = new Map();
  for (const f of files) {
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    for (const site of SITES) {
      for (const m of src.matchAll(new RegExp(site, 'g'))) {
        const s = unescape(m[1] ?? m[2] ?? '').trim();
        if (!s || !/[A-Za-z]{2}/.test(s)) continue;
        if (/^(cmp|studio|set|snd|inv|rec)-/.test(s) || /^[a-z]+(-[a-z]+)*$/.test(s)) continue; // classes, ids
        if (!seen.has(s)) seen.set(s, `${f}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  return seen;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { translateText } = await import(pathToFileURL(resolve(ROOT, 'src/i18n/ui.js')).href);
  let missing = 0;
  for (const [s, at] of uiStrings()) {
    if (translateText(s, 'de') === s) { missing++; console.log(`${at}\t${JSON.stringify(s)}`); }
  }
  console.log(`${missing} uncovered`);
}
