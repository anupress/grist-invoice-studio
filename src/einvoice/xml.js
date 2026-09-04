// A very small XML builder.
//
// The two e-invoice syntaxes are order-sensitive trees of a few hundred elements, and a template
// string with holes in it is exactly how a stray "&" in a client's name produces a file that no
// validator will open. So: a node is `{ name, attrs, children }`, text is escaped once, on the
// way out, and an element with nothing in it is simply not emitted — which is how optional
// elements stay optional without a conditional at every call site.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * An element. `attrs` may be omitted; children may be strings, numbers, nodes, arrays, or null.
 *
 *   el('cbc:ID', 'INV-1')
 *   el('cbc:Amount', { currencyID: 'EUR' }, '12.00')
 *   el('cac:Party', [child, child])
 */
export function el(name, attrs, ...children) {
  if (attrs != null && (typeof attrs !== 'object' || Array.isArray(attrs) || attrs.name)) {
    children.unshift(attrs);
    attrs = null;
  }
  return { name, attrs: attrs || {}, children: children.flat(Infinity).filter((c) => c != null && c !== '') };
}

/** An element only when its value is present — the optional case, spelled once. */
export function opt(name, attrs, value) {
  if (value === undefined) { value = attrs; attrs = null; }
  const s = value == null ? '' : String(value).trim();
  return s ? el(name, attrs, s) : null;
}

/**
 * The tree as text, indented, with a declaration.
 *
 * An element whose children are all absent is dropped: a `cac:Contact` with no name, phone or
 * email should not exist, and asking every caller to check is how one of them forgets.
 */
export function toXml(root) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
  write(root, 0, lines);
  return lines.join('\n') + '\n';
}

function write(node, depth, lines) {
  const pad = '  '.repeat(depth);
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  const kids = node.children.filter((c) => c != null && c !== '');
  if (!kids.length) return;   // nothing inside: nothing written
  const textOnly = kids.every((c) => typeof c !== 'object');
  if (textOnly) {
    lines.push(`${pad}<${node.name}${attrs}>${kids.map(esc).join('')}</${node.name}>`);
    return;
  }
  const before = lines.length;
  lines.push(`${pad}<${node.name}${attrs}>`);
  for (const c of kids) {
    if (typeof c === 'object') write(c, depth + 1, lines);
    else lines.push(`${pad}  ${esc(c)}`);
  }
  if (lines.length === before + 1) { lines.pop(); return; }   // every child turned out empty
  lines.push(`${pad}</${node.name}>`);
}

/** Money to two places, as the standards want. */
export const amt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

/** A quantity or a percentage: up to four decimals, trailing zeros trimmed, never exponent form. */
export const num = (n) => {
  const v = Number(n) || 0;
  const s = v.toFixed(4).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

/** Well-formed enough to trust: every opened tag closed, in order. For tests and self-checks. */
export function balanced(xml) {
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w.:-]*)[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith('<?')) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; }
    else if (!m[3]) stack.push(m[2]);
  }
  return stack.length === 0;
}
