// A TrueType reader and subsetter.
//
// The standard PDF fonts are WinAnsi, and WinAnsi has no ł, no č, no ő, no Greek, no Cyrillic and
// no rupee sign. For a widget whose stated focus is Europe that is not a corner case: a Polish
// client's name, a Czech street, a Hungarian company — every one of them came out of the PDF with
// question marks in it. The fix is to embed a font, and embedding a font means being able to read
// one and write a smaller one back out, because the whole DejaVu Sans is three quarters of a
// megabyte and an invoice uses forty of its six thousand glyphs.
//
// Two jobs, one file:
//
//   parse(bytes)                 the tables a PDF and a layout engine need: which glyph a character
//                                is, how wide it is, and the metrics that describe the face.
//   subset(font, codepoints)     a new TrueType file containing only those characters' glyphs,
//                                renumbered from zero, with a fresh cmap and a rebuilt loca/hmtx.
//
// The subset is used twice. Once at build time, to cut the shipped font down to the scripts a
// business document in Europe and the major markets actually uses; and again at PDF time, to cut
// THAT down to the characters on this one document. Same function, two repertoires.
//
// Hinting is dropped on the way through. PDF viewers do not run TrueType instructions for embedded
// fonts of this kind, and the instructions are a third of every glyph's bytes.
//
// Pure: Uint8Array in, Uint8Array out, no DOM, so it runs under Node for the tests and the build.

const ARG_1_AND_2_ARE_WORDS = 0x0001;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;
const WE_HAVE_INSTRUCTIONS = 0x0100;

const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/**
 * Read the parts of a TrueType file that matter here.
 *
 * Returns an object rather than a class because everything downstream only ever reads it: the
 * glyph lookup, the advance widths, the metrics, and the raw tables the subsetter copies through.
 */
export function parse(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const version = dv.getUint32(0);
  if (version !== 0x00010000 && version !== 0x74727565) {   // 1.0, or 'true'
    throw new Error('Not a TrueType font');
  }

  const tables = {};
  const count = dv.getUint16(4);
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 16;
    tables[tag(b, o)] = { offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) };
  }
  for (const need of ['head', 'hhea', 'maxp', 'hmtx', 'loca', 'glyf', 'cmap']) {
    if (!tables[need]) throw new Error(`Font has no ${need} table`);
  }
  const slice = (t) => b.subarray(tables[t].offset, tables[t].offset + tables[t].length);

  const head = tables.head.offset;
  const unitsPerEm = dv.getUint16(head + 18);
  const indexToLocFormat = dv.getInt16(head + 50);
  const bbox = [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)];

  const hhea = tables.hhea.offset;
  const ascent = dv.getInt16(hhea + 4);
  const descent = dv.getInt16(hhea + 6);
  const numberOfHMetrics = dv.getUint16(hhea + 34);
  const numGlyphs = dv.getUint16(tables.maxp.offset + 4);

  // Advance widths. Past numberOfHMetrics every glyph shares the last advance, which is how a
  // monospaced font stores one number rather than thousands.
  const hmtx = tables.hmtx.offset;
  const advances = new Uint16Array(numGlyphs);
  let last = 0;
  for (let g = 0; g < numGlyphs; g++) {
    if (g < numberOfHMetrics) last = dv.getUint16(hmtx + g * 4);
    advances[g] = last;
  }

  // Glyph locations. Long format is 32-bit offsets; short is 16-bit offsets halved.
  const loca = tables.loca.offset;
  const offsets = new Uint32Array(numGlyphs + 1);
  for (let g = 0; g <= numGlyphs; g++) {
    offsets[g] = indexToLocFormat === 1 ? dv.getUint32(loca + g * 4) : dv.getUint16(loca + g * 2) * 2;
  }

  const cmap = readCmap(dv, tables.cmap.offset);

  // Cap height from OS/2 when the version carries it, else a sensible guess against the ascent.
  let capHeight = Math.round(ascent * 0.72);
  if (tables['OS/2'] && dv.getUint16(tables['OS/2'].offset) >= 2) {
    capHeight = dv.getInt16(tables['OS/2'].offset + 88) || capHeight;
  }

  return {
    bytes: b,
    tables,
    unitsPerEm, bbox, ascent, descent, capHeight, numGlyphs,
    advances, offsets, cmap,
    glyf: slice('glyf'),
    raw: (t) => (tables[t] ? slice(t) : null),
    /** The glyph for a code point, or 0 (.notdef) when the font has none. */
    glyphFor(cp) { return cmap.get(cp) || 0; },
    /** A code point's advance, in font units. */
    advanceOf(cp) { return advances[cmap.get(cp) || 0]; },
  };
}

/**
 * The character-to-glyph map, as a Map of code point → glyph id.
 *
 * Reads a format 12 subtable when there is one (the whole of Unicode) and a format 4 otherwise
 * (the Basic Multilingual Plane, which is everything an invoice says). Other formats are ignored;
 * a font with neither is not a font this will be handed.
 */
function readCmap(dv, base) {
  const n = dv.getUint16(base + 2);
  let f4 = null, f12 = null;
  for (let i = 0; i < n; i++) {
    const o = base + 4 + i * 8;
    const platform = dv.getUint16(o), encoding = dv.getUint16(o + 2), off = base + dv.getUint32(o + 4);
    const format = dv.getUint16(off);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12 && !f12) f12 = off;
    if (format === 4 && !f4) f4 = off;
  }

  const map = new Map();
  if (f12) {
    const groups = dv.getUint32(f12 + 12);
    for (let i = 0; i < groups; i++) {
      const o = f12 + 16 + i * 12;
      const start = dv.getUint32(o), end = dv.getUint32(o + 4), gid = dv.getUint32(o + 8);
      for (let cp = start; cp <= end && cp - start < 0x10000; cp++) map.set(cp, gid + (cp - start));
    }
    return map;
  }
  if (!f4) return map;

  const segX2 = dv.getUint16(f4 + 6);
  const ends = f4 + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const end = dv.getUint16(ends + s * 2), start = dv.getUint16(starts + s * 2);
    const delta = dv.getInt16(deltas + s * 2), rangeOffset = dv.getUint16(ranges + s * 2);
    if (start === 0xFFFF) continue;
    for (let cp = start; cp <= end; cp++) {
      let gid;
      if (rangeOffset === 0) gid = (cp + delta) & 0xFFFF;
      else {
        const addr = ranges + s * 2 + rangeOffset + (cp - start) * 2;
        if (addr + 1 >= dv.byteLength) continue;
        gid = dv.getUint16(addr);
        if (gid) gid = (gid + delta) & 0xFFFF;
      }
      if (gid) map.set(cp, gid);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------------------------
// Subsetting
// ---------------------------------------------------------------------------------------------

/**
 * The component glyphs a composite refers to, so they come along with it.
 *
 * An "é" in most fonts is not drawn; it is an "e" and an acute accent placed by reference, and a
 * subset that kept the é record without the two glyphs it points at would draw nothing.
 */
function componentsOf(font, gid) {
  const start = font.offsets[gid], end = font.offsets[gid + 1];
  if (end - start < 10) return [];
  const g = font.glyf;
  const dv = new DataView(g.buffer, g.byteOffset + start, end - start);
  if (dv.getInt16(0) >= 0) return [];   // a simple glyph

  const out = [];
  let p = 10;
  for (;;) {
    const flags = dv.getUint16(p), component = dv.getUint16(p + 2);
    out.push(component);
    p += 4 + (flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2);
    if (flags & WE_HAVE_A_SCALE) p += 2;
    else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) p += 4;
    else if (flags & WE_HAVE_A_TWO_BY_TWO) p += 8;
    if (!(flags & MORE_COMPONENTS)) break;
  }
  return out;
}

/**
 * One glyph's record with its hinting instructions removed and, for a composite, its component
 * ids rewritten to the new numbering.
 */
function rewriteGlyph(font, gid, renumber) {
  const start = font.offsets[gid], end = font.offsets[gid + 1];
  if (end <= start) return new Uint8Array(0);   // an empty glyph — space, for instance
  const src = font.glyf.subarray(start, end);
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const contours = dv.getInt16(0);

  if (contours >= 0) {
    // Simple: header, end points, then the instructions we are dropping, then flags and points.
    const instrAt = 10 + contours * 2;
    const instrLen = dv.getUint16(instrAt);
    const out = new Uint8Array(src.length - instrLen);
    out.set(src.subarray(0, instrAt), 0);
    out[instrAt] = 0; out[instrAt + 1] = 0;
    out.set(src.subarray(instrAt + 2 + instrLen), instrAt + 2);
    return out;
  }

  // Composite: walk the components, renumbering and clearing the instructions flag, and stop
  // before the trailing instructions if there were any.
  const out = new Uint8Array(src.length);
  out.set(src.subarray(0, 10), 0);
  const odv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let p = 10;
  for (;;) {
    const flags = dv.getUint16(p), component = dv.getUint16(p + 2);
    const argBytes = flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2;
    const xform = flags & WE_HAVE_A_SCALE ? 2 : flags & WE_HAVE_AN_X_AND_Y_SCALE ? 4 : flags & WE_HAVE_A_TWO_BY_TWO ? 8 : 0;
    const len = 4 + argBytes + xform;
    out.set(src.subarray(p, p + len), p);
    odv.setUint16(p, flags & ~WE_HAVE_INSTRUCTIONS);
    odv.setUint16(p + 2, renumber.get(component) ?? 0);
    p += len;
    if (!(flags & MORE_COMPONENTS)) break;
  }
  return out.subarray(0, p);
}

const pad4 = (n) => (n + 3) & ~3;

function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    sum = (sum + (((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0)) >>> 0;
  }
  return sum;
}

/**
 * A TrueType file holding only the given code points.
 *
 * Glyph 0 (.notdef) is always kept, because a viewer asked for a glyph the font does not have
 * draws that one. Every code point the font cannot supply is silently absent from the new cmap and
 * maps to .notdef when drawn — which is the same box a browser shows, and honest.
 *
 * Returns `{ bytes, glyphMap, advances }`: the file, a Map of code point → NEW glyph id, and the
 * advance width of every new glyph in font units, in id order — exactly what a PDF's /W array wants.
 */
export function subset(font, codepoints) {
  // 1. Which old glyphs, in a stable order, with composites' components pulled in after them.
  const wanted = [0];
  const seen = new Set([0]);
  const cps = [...new Set([...codepoints].filter((cp) => Number.isInteger(cp) && cp >= 0))].sort((a, b) => a - b);
  for (const cp of cps) {
    const gid = font.cmap.get(cp);
    if (gid && !seen.has(gid)) { seen.add(gid); wanted.push(gid); }
  }
  for (let i = 0; i < wanted.length; i++) {
    for (const c of componentsOf(font, wanted[i])) {
      if (!seen.has(c)) { seen.add(c); wanted.push(c); }
    }
  }

  const renumber = new Map(wanted.map((old, i) => [old, i]));
  const glyphMap = new Map();
  for (const cp of cps) {
    const gid = font.cmap.get(cp);
    if (gid) glyphMap.set(cp, renumber.get(gid));
  }

  // 2. glyf + loca, long format throughout — simpler, and the file is small anyway.
  const glyphs = wanted.map((old) => rewriteGlyph(font, old, renumber));
  const glyfLen = glyphs.reduce((a, g) => a + pad4(g.length), 0);
  const glyf = new Uint8Array(glyfLen);
  const loca = new Uint8Array((glyphs.length + 1) * 4);
  const ldv = new DataView(loca.buffer);
  let at = 0;
  glyphs.forEach((g, i) => {
    ldv.setUint32(i * 4, at);
    glyf.set(g, at);
    at += pad4(g.length);
  });
  ldv.setUint32(glyphs.length * 4, at);

  // 3. hmtx: an advance and a left side bearing per glyph. The bearing is read from the old
  //    table where one exists and taken as zero past numberOfHMetrics, where it is stored in a
  //    separate array we do not need to carry.
  const oldHmtx = font.raw('hmtx');
  const oldHdv = new DataView(oldHmtx.buffer, oldHmtx.byteOffset, oldHmtx.byteLength);
  const oldNumH = new DataView(font.raw('hhea').buffer, font.raw('hhea').byteOffset).getUint16(34);
  const hmtx = new Uint8Array(glyphs.length * 4);
  const hdv = new DataView(hmtx.buffer);
  const advances = new Uint16Array(glyphs.length);
  wanted.forEach((old, i) => {
    const adv = font.advances[old];
    let lsb = 0;
    if (old < oldNumH) lsb = oldHdv.getInt16(old * 4 + 2);
    else if (oldNumH * 4 + (old - oldNumH) * 2 + 1 < oldHmtx.length) lsb = oldHdv.getInt16(oldNumH * 4 + (old - oldNumH) * 2);
    hdv.setUint16(i * 4, adv);
    hdv.setInt16(i * 4 + 2, lsb);
    advances[i] = adv;
  });

  // 4. The small tables, copied and patched.
  const head = new Uint8Array(font.raw('head'));
  new DataView(head.buffer).setUint32(8, 0);          // checkSumAdjustment, recomputed below
  new DataView(head.buffer).setInt16(50, 1);          // indexToLocFormat: long
  const hhea = new Uint8Array(font.raw('hhea'));
  new DataView(hhea.buffer).setUint16(34, glyphs.length);
  const maxp = new Uint8Array(font.raw('maxp'));
  new DataView(maxp.buffer).setUint16(4, glyphs.length);
  // post format 3: no glyph names. A PDF never asks for them, and the original table is 60KB.
  const post = new Uint8Array(32);
  new DataView(post.buffer).setUint32(0, 0x00030000);
  const old = font.raw('post');
  if (old && old.length >= 32) post.set(old.subarray(4, 32), 4);

  const cmap = buildCmap4(glyphMap);

  const out = [
    ['cmap', cmap], ['glyf', glyf], ['head', head], ['hhea', hhea], ['hmtx', hmtx],
    ['loca', loca], ['maxp', maxp], ['post', post],
  ];
  for (const t of ['OS/2', 'name']) { const r = font.raw(t); if (r) out.push([t, new Uint8Array(r)]); }
  out.sort((a, b) => (a[0] < b[0] ? -1 : 1));

  return { bytes: assemble(out), glyphMap, advances, glyphCount: glyphs.length };
}

/** A format 4 cmap subtable (platform 3, encoding 1) for a code point → glyph map. */
function buildCmap4(glyphMap) {
  const cps = [...glyphMap.keys()].filter((cp) => cp <= 0xFFFF).sort((a, b) => a - b);
  // Runs of consecutive code points whose glyphs are also consecutive share a delta segment.
  const segs = [];
  for (const cp of cps) {
    const gid = glyphMap.get(cp);
    const last = segs[segs.length - 1];
    if (last && cp === last.end + 1 && gid === last.gidStart + (cp - last.start)) last.end = cp;
    else segs.push({ start: cp, end: cp, gidStart: gid });
  }
  segs.push({ start: 0xFFFF, end: 0xFFFF, gidStart: 0, sentinel: true });

  const n = segs.length;
  const len = 16 + n * 8;
  const sub = new Uint8Array(len);
  const dv = new DataView(sub.buffer);
  dv.setUint16(0, 4); dv.setUint16(2, len); dv.setUint16(4, 0);
  dv.setUint16(6, n * 2);
  const searchRange = 2 * (1 << Math.floor(Math.log2(n)));
  dv.setUint16(8, searchRange); dv.setUint16(10, Math.floor(Math.log2(n))); dv.setUint16(12, n * 2 - searchRange);
  segs.forEach((s, i) => {
    dv.setUint16(14 + i * 2, s.end);
    dv.setUint16(16 + n * 2 + i * 2, s.start);
    const delta = s.sentinel ? 1 : (s.gidStart - s.start) & 0xFFFF;
    dv.setUint16(16 + n * 4 + i * 2, delta);
    dv.setUint16(16 + n * 6 + i * 2, 0);
  });

  const table = new Uint8Array(4 + 8 + len);
  const tdv = new DataView(table.buffer);
  tdv.setUint16(0, 0); tdv.setUint16(2, 1);
  tdv.setUint16(4, 3); tdv.setUint16(6, 1); tdv.setUint32(8, 12);
  table.set(sub, 12);
  return table;
}

/** Lay the tables out as a file: the directory, then each table on a four-byte boundary. */
function assemble(tables) {
  const n = tables.length;
  let size = 12 + n * 16;
  for (const [, data] of tables) size += pad4(data.length);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x00010000);
  dv.setUint16(4, n);
  const es = Math.floor(Math.log2(n));
  dv.setUint16(6, 16 << es); dv.setUint16(8, es); dv.setUint16(10, n * 16 - (16 << es));

  let at = 12 + n * 16;
  let headAt = -1;
  tables.forEach(([name, data], i) => {
    const o = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[o + k] = name.charCodeAt(k);
    dv.setUint32(o + 4, checksum(data));
    dv.setUint32(o + 8, at);
    dv.setUint32(o + 12, data.length);
    out.set(data, at);
    if (name === 'head') headAt = at;
    at += pad4(data.length);
  });
  // The whole-file checksum adjustment lives in head. Viewers rarely check it; done properly anyway.
  if (headAt >= 0) dv.setUint32(headAt + 8, (0xB1B0AFBA - checksum(out)) >>> 0);
  return out;
}

/**
 * The code points worth shipping: the scripts a business document in Europe and the major markets
 * is written in, plus the punctuation and symbols such documents use. Everything else — CJK,
 * Arabic, Devanagari — would need a different font family altogether and is out of scope here.
 */
export const SHIPPED_REPERTOIRE = [
  [0x0020, 0x007E],   // Basic Latin
  [0x00A0, 0x00FF],   // Latin-1 Supplement
  [0x0100, 0x017F],   // Latin Extended-A: ł ś ż č ř ő ű ğ ș ț …
  [0x0180, 0x024F],   // Latin Extended-B: ơ ư ǎ ș ț and friends
  [0x0370, 0x03FF],   // Greek
  [0x0400, 0x04FF],   // Cyrillic
  [0x1E00, 0x1EFF],   // Latin Extended Additional: Vietnamese
  [0x2000, 0x206F],   // General punctuation: dashes, quotes, ellipsis, bullet
  [0x20A0, 0x20CF],   // Currency symbols: € ₹ ₺ ₽ ₩ ₫ ₪ ₦ ৳ (the last is elsewhere, below)
  [0x2100, 0x214F],   // Letterlike: ™ № ℮
  [0x2150, 0x218F],   // Number forms: fractions
  [0x2190, 0x21FF],   // Arrows
  [0x2200, 0x22FF],   // Mathematical operators: − × ÷ ≤ ≥ ≠ ∞
  [0x25A0, 0x25FF],   // Geometric shapes: ■ ● ○
  [0x2600, 0x26FF],   // Miscellaneous symbols: ☐ ☑ ☒ ★
  [0x2700, 0x27BF],   // Dingbats: ✓ ✗
  [0x09F2, 0x09F3],   // ৲ ৳ Bengali rupee and taka signs
  [0x0E3F, 0x0E3F],   // ฿ baht
  [0x060B, 0x060B],   // ؋ afghani
  [0xFDFC, 0xFDFC],   // ﷼ rial
  [0xFB01, 0xFB02],   // ﬁ ﬂ ligatures, in case text arrives with them
];

/** Expand the repertoire into code points. */
export function repertoireCodepoints(ranges = SHIPPED_REPERTOIRE) {
  const out = [];
  for (const [a, b] of ranges) for (let cp = a; cp <= b; cp++) out.push(cp);
  return out;
}
