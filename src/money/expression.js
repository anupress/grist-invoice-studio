// A very small arithmetic evaluator, so shipping cost formulas never go near eval().
//
// WooCommerce's flat-rate cost field takes arithmetic — `10 + ( 2 * [qty] )` — and a shop owner
// typing that is entirely reasonable. Running it through eval() or `new Function()` would not be:
// the formula is stored in a Grist document, anyone who can edit that document could put anything
// they liked in it, and it would then execute in every viewer's browser with the widget's origin.
// That is a stored cross-site scripting hole dressed up as a convenience.
//
// Arithmetic is a small enough language to just parse. Numbers, + - * /, and parentheses.
//
//   expr    := term (('+' | '-') term)*
//   term    := factor (('*' | '/') factor)*
//   factor  := ('-' | '+')? primary
//   primary := number | '(' expr ')'

const NUMBER = /^\d+(\.\d+)?/;

function tokenize(input) {
  const tokens = [];
  let i = 0;
  const s = String(input);
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    if ('+-*/()'.includes(ch)) { tokens.push({ type: ch }); i++; continue; }
    const m = NUMBER.exec(s.slice(i));
    if (m) { tokens.push({ type: 'num', value: parseFloat(m[0]) }); i += m[0].length; continue; }
    // Anything else at all — a letter, a bracket, a semicolon — is not arithmetic, and guessing
    // what someone meant by it is how a wrong shipping charge reaches a customer.
    return null;
  }
  return tokens;
}

/**
 * Evaluate an arithmetic string. Returns a number, or null if it is not valid arithmetic.
 *
 * Null rather than 0 or a thrown error: the caller needs to tell "this formula says nothing to
 * charge" apart from "this formula is broken", because one is free shipping and the other is a
 * configuration mistake somebody should be told about.
 */
export function evaluate(input) {
  const tokens = tokenize(input);
  if (!tokens || !tokens.length) return null;

  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (type) => (peek() && peek().type === type ? tokens[pos++] : null);

  function primary() {
    const n = eat('num');
    if (n) return n.value;
    if (eat('(')) {
      const v = expr();
      if (v === null || !eat(')')) return null;
      return v;
    }
    return null;
  }

  function factor() {
    if (eat('-')) { const v = factor(); return v === null ? null : -v; }
    if (eat('+')) return factor();
    return primary();
  }

  function term() {
    let left = factor();
    if (left === null) return null;
    for (;;) {
      if (eat('*')) { const r = factor(); if (r === null) return null; left *= r; continue; }
      if (eat('/')) {
        const r = factor();
        if (r === null) return null;
        // Division by zero yields Infinity in JavaScript, which would render as a shipping charge
        // of "∞". A formula that divides by nothing is broken, and saying so is better.
        if (r === 0) return null;
        left /= r;
        continue;
      }
      return left;
    }
  }

  function expr() {
    let left = term();
    if (left === null) return null;
    for (;;) {
      if (eat('+')) { const r = term(); if (r === null) return null; left += r; continue; }
      if (eat('-')) { const r = term(); if (r === null) return null; left -= r; continue; }
      return left;
    }
  }

  const value = expr();
  // Trailing tokens mean the input was not one complete expression — "10 20" is not 10.
  if (value === null || pos !== tokens.length || !isFinite(value)) return null;
  return value;
}
