// Font metrics for the standard PDF fonts.
//
// A PDF viewer already has Helvetica, Times and Courier — the "standard 14" — so a document using
// them embeds no font data at all. That is why an invoice from here is 6KB rather than 400KB, and
// why this file exists instead of only a font subsetter.
//
// The catch is that WE have to know how wide the text is. The viewer positions each glyph exactly
// where the content stream says, so a right-aligned total is right-aligned only if we measured it
// correctly. These are the published Adobe AFM widths, in 1/1000 em.
//
// The other catch is the alphabet. The standard fonts are encoded WinAnsi — Latin-1 plus a handful
// of extras — so they can write £, € and ü, and cannot write ł, č, ő, ₹, ₺, a word of Greek or a
// word of Hindi. For those the writer switches to the embedded family in ./embedded.js, and
// `needsEmbedding()` below is how it knows to. What this file still does, for the case where the
// embedded fonts could not be loaded, is TRANSLITERATE rather than drop: an Indian invoice then
// reads "Rs.1,400.00" instead of losing its currency symbol to a blank box.

/* eslint-disable */
// ASCII 32–126, in order. Adobe AFM, Helvetica.
const HELVETICA = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
  556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,
];

// Adobe AFM, Helvetica-Bold.
const HELVETICA_BOLD = [
  278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
  975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
  333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
  611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,
];
/* eslint-enable */

// The WinAnsi codes past 127 that a business document actually uses, with their widths. Anything
// not here is transliterated by ascii() below rather than emitted as an unknown glyph.
const HIGH = {
  0x80: { char: '€', w: 556, wb: 556 },
  0xA3: { char: '£', w: 556, wb: 556 },
  0xA5: { char: '¥', w: 556, wb: 556 },
  0xA2: { char: '¢', w: 556, wb: 556 },
  0xA9: { char: '©', w: 737, wb: 737 },
  0xAE: { char: '®', w: 737, wb: 737 },
  0xB0: { char: '°', w: 400, wb: 400 },
  0xB1: { char: '±', w: 584, wb: 584 },
  0xBD: { char: '½', w: 834, wb: 834 },
  0xBC: { char: '¼', w: 834, wb: 834 },
  0xD7: { char: '×', w: 584, wb: 584 },
};

const CHAR_TO_WINANSI = new Map(Object.entries(HIGH).map(([code, v]) => [v.char, Number(code)]));

/**
 * The invisible replacements: typographic characters our own templates use that have exact ASCII
 * equivalents. Swapping them changes nothing a reader would notice, so they never count as a
 * reason to embed a font.
 */
const SOFTEN = {
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', '…': '...', ' ': ' ', ' ': ' ', ' ': ' ',
  '−': '-', '•': '-', '‹': '<', '›': '>',
};

/**
 * Replacements for characters the standard fonts cannot write.
 *
 * Two kinds. The typographic ones above have exact equivalents, so replacing them is invisible.
 * The currency ones do not: a rupee sign becomes "Rs." because that is what the rest of the
 * document would otherwise be missing, and it is far better to be slightly less pretty than to
 * hand a client an invoice with a hole where the amount should be. These are only reached when the
 * embedded family is unavailable — with it loaded, ₹ is drawn as ₹.
 */
const TRANSLITERATE = {
  ...SOFTEN,
  '₹': 'Rs.',   // Indian rupee
  '₨': 'Rs.',   // older rupee sign
  '৳': 'Tk.',   // Bangladeshi taka
  '₺': 'TL',    // Turkish lira
  '₽': 'RUB',   // rouble
  '₫': 'VND',   // dong
  '₩': 'KRW',   // won
  '฿': 'THB',   // baht
  '₪': 'ILS',   // shekel
  '₦': 'NGN',   // naira
  '؋': 'AFN',
  'د.إ': 'AED',   // dirham, written as three Arabic characters
  '﷼': 'SAR',
};

/** Can WinAnsi write this character as itself? */
function winAnsiHas(ch) {
  const code = ch.codePointAt(0);
  return (code >= 32 && code <= 126) || CHAR_TO_WINANSI.has(ch) || (code >= 0xA0 && code <= 0xFF);
}

/**
 * Would this text lose something in the standard fonts?
 *
 * True for any character that is neither WinAnsi nor one of the invisible replacements — a Polish
 * ł, a Greek Ω, a rupee sign. The PDF writer records the answer for every string it is asked to
 * draw, and the caller uses it to decide whether the embedded family is worth loading for this
 * document. A document that never needs it is byte-for-byte the document it always was.
 */
export function needsEmbedding(text) {
  for (const ch of String(text == null ? '' : text)) {
    if (SOFTEN[ch] != null) continue;
    if (!winAnsiHas(ch)) return true;
  }
  return false;
}

/**
 * Make a string writable by a standard font.
 *
 * Anything left that is still outside WinAnsi is replaced with '?', which is ugly and honest —
 * a viewer given a byte it cannot map shows nothing at all, and a silently missing word on an
 * invoice is worse than a visible question mark.
 */
export function ascii(text) {
  let out = '';
  for (const ch of String(text == null ? '' : text)) {
    if (TRANSLITERATE[ch] != null) { out += TRANSLITERATE[ch]; continue; }
    if (winAnsiHas(ch)) { out += ch; continue; }
    out += '?';
  }
  return out;
}

/** The byte for one already-transliterated character. */
function byteFor(ch) {
  if (CHAR_TO_WINANSI.has(ch)) return CHAR_TO_WINANSI.get(ch);
  const code = ch.codePointAt(0);
  return code <= 0xFF ? code : 63;   // '?'
}

/** One character's width, in 1/1000 em. */
function charWidth(ch, bold) {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  const code = ch.codePointAt(0);
  if (code >= 32 && code <= 126) return table[code - 32];
  if (CHAR_TO_WINANSI.has(ch)) { const h = HIGH[CHAR_TO_WINANSI.get(ch)]; return bold ? h.wb : h.w; }
  // Accented Latin letters are close enough to their base letter for layout purposes, and being a
  // point or two out on "Müller" costs nothing — being out on a column of figures would.
  if (code >= 0xC0 && code <= 0xFF) return bold ? 611 : 556;
  return table[31];   // the width of '?'
}

/** How wide a string will be at a given size, in points. */
export function measure(text, size, bold = false) {
  const s = ascii(text);
  let units = 0;
  for (const ch of s) units += charWidth(ch, bold);
  return (units * size) / 1000;
}

/**
 * A string as PDF literal-string bytes.
 *
 * Backslash, and both brackets, have to be escaped or they end the string early — a client name
 * containing "(Ltd)" would otherwise produce a file no viewer can open.
 */
export function encodeString(text) {
  const s = ascii(text);
  const bytes = [];
  for (const ch of s) {
    const b = byteFor(ch);
    if (b === 0x28 || b === 0x29 || b === 0x5C) bytes.push(0x5C);   // ( ) \
    bytes.push(b);
  }
  return bytes;
}

/**
 * Break text into lines that fit a width, measuring with whatever font is in use.
 *
 * Wraps on spaces, and hard-breaks a single word that is longer than the line — a URL or an account
 * number with no spaces in it would otherwise run off the edge of the page and be lost.
 */
export function wrapWith(measureFn, text, width, size, bold = false) {
  const paragraphs = String(text == null ? '' : text).split('\n');
  const lines = [];

  for (const para of paragraphs) {
    if (!para.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureFn(candidate, size, bold) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      if (measureFn(word, size, bold) <= width) { line = word; continue; }
      let chunk = '';
      for (const ch of word) {
        if (measureFn(chunk + ch, size, bold) > width && chunk) { lines.push(chunk); chunk = ''; }
        chunk += ch;
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Wrap against the standard fonts. */
export function wrap(text, width, size, bold = false) {
  return wrapWith(measure, text, width, size, bold);
}

/**
 * The standard family, in the shape the writer wants from any family: measure, encode, and the
 * objects to write. No font data — every viewer already has these three faces, which is the whole
 * reason an invoice from here can be six kilobytes.
 */
export const STANDARD_FONTS = {
  kind: 'standard',
  italicSkew: false,
  measure,
  prepare() { return this; },
  encode(text) { return { hex: false, raw: encodeString(text) }; },
  objectCount() { return 3; },
  resourceEntries(first) { return `/F1 ${first} 0 R /F2 ${first + 1} 0 R /F3 ${first + 2} 0 R`; },
  objects() {
    return ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'].map((base) => ({
      dict: `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`,
    }));
  },
};
