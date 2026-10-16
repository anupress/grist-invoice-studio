// A field's hint can be a node that repaints itself (the IBAN note under Getting paid). It used to be set as text, so the page showed
// "[object HTMLSpanElement]" under the IBAN box (since 1.17, seen 2026-10-16). 1.28.2.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
// the smallest DOM the helper needs: createElement, createTextNode, className, textContent, dataset, append, addEventListener
const node = (tag) => ({
  nodeType: 1, tag, children: [], dataset: {}, className: '', _text: '',
  set textContent(v) { this._text = String(v); }, get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
  append(...c) { this.children.push(...c); }, addEventListener() {}, setAttribute() {},
});
globalThis.document = { createElement: node, createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }) };
const { field } = await import(pathToFileURL(_resolve(ROOT, 'src/compose/ui.js')).href);

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const note = node('span'); note.className = 'cmp-field__hint'; note.textContent = 'Will print as DE89 3704 0044 0532 0130 00.';
const withNode = field('IBAN', node('input'), note);
ok('a hint node is placed in the field as it is', withNode.children.includes(note));
ok('its sentence is the field text, not "[object ...]"', !/\[object/.test(withNode.textContent) && /Will print as/.test(withNode.textContent));
const withText = field('BIC', node('input'), 'optional');
ok('a sentence still becomes a hint span', withText.children.some((c) => c.className === 'cmp-field__hint' && c.textContent === 'optional'));
ok('no hint, no span', field('UPI', node('input')).children.length === 2);

console.log(`field-hint-node: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
