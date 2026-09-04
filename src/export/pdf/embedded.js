// An embedded font family for the PDF writer.
//
// The standard fonts (./fonts.js) cost nothing and draw Latin-1. This draws everything the shipped
// DejaVu subset has — every European Latin extension, Greek, Cyrillic, Vietnamese, the currency
// signs — at the price of embedding a font program in the file. That price is kept small the same
// way it is everywhere else in this codebase: by doing the work ourselves. The font is cut down to
// the glyphs the document uses (./ttf.js), so an invoice in Polish carries about twenty kilobytes
// of font rather than seven hundred.
//
// The writer sees the same three things it sees from the standard family — measure, encode, and
// the objects to write — so the layout code does not know which it is drawing with. The one
// visible difference is italic: DejaVu ships no oblique here, so italic text is the regular face
// sheared by the text matrix, which is what every word processor did before real italics.
//
// The PDF side is a Type 0 font over a CIDFontType2 with Identity-H encoding: two bytes per glyph,
// the bytes ARE the glyph ids, and a ToUnicode map so the text survives copy-and-paste and search.

import { subset } from './ttf.js';

/** Italic is a shear of 0.2 — about eleven degrees, the slant of most oblique faces. */
export const ITALIC_SKEW = 0.2;

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');

/** The invisible replacements: characters our own templates use that have exact equivalents. */
const SOFTEN = { ' ': ' ', ' ': ' ', ' ': ' ' };

export class EmbeddedFonts {
  /**
   * `regular` and `bold` are parsed fonts (ttf.js `parse`). Bold falls back to regular when the
   * bold face failed to load, so a missing file costs weight, never text.
   */
  constructor({ regular, bold }) {
    if (!regular) throw new Error('An embedded family needs at least a regular face');
    this.kind = 'embedded';
    this.italicSkew = true;
    this.faces = { regular, bold: bold || regular };
    this.prepared = null;
  }

  face(bold) { return bold ? this.faces.bold : this.faces.regular; }

  /** Width of a string in points. Unknown characters measure as .notdef, which is what they draw as. */
  measure(text, size, bold = false) {
    const f = this.face(bold);
    let units = 0;
    for (const ch of String(text == null ? '' : text)) units += f.advanceOf((SOFTEN[ch] || ch).codePointAt(0));
    return (units * size) / f.unitsPerEm;
  }

  /**
   * Cut each face down to the characters that will be drawn with it.
   *
   * Called once, by the writer, with everything it has been asked to draw — after layout, before
   * the file is assembled. Until then the family measures against the full font; afterwards it
   * encodes against the subset. The two agree, because a subset keeps every advance.
   */
  prepare({ regular = [], bold = [] } = {}) {
    const cps = (strings) => {
      const set = new Set();
      for (const s of strings) for (const ch of String(s)) set.add((SOFTEN[ch] || ch).codePointAt(0));
      set.add(0x20);
      return [...set];
    };
    this.prepared = {
      regular: subset(this.faces.regular, cps(regular)),
      bold: subset(this.faces.bold, cps(bold)),
    };
    return this;
  }

  /** A string as a hex-encoded run of two-byte glyph ids. */
  encode(text, bold = false) {
    if (!this.prepared) throw new Error('prepare() before encode()');
    const map = (bold ? this.prepared.bold : this.prepared.regular).glyphMap;
    let out = '';
    for (const ch of String(text == null ? '' : text)) out += hex4(map.get((SOFTEN[ch] || ch).codePointAt(0)) || 0);
    return { hex: true, raw: out };
  }

  /** How many PDF objects the family writes: five per face. */
  objectCount() { return 10; }

  /**
   * The font resource entries for a page, given the number of the first font object.
   * F1 regular, F2 bold, F3 italic — which is the regular face again, sheared at draw time.
   */
  resourceEntries(first) {
    return `/F1 ${first} 0 R /F2 ${first + 5} 0 R /F3 ${first} 0 R`;
  }

  /**
   * The objects, in numbering order from `first`. Each is `{ dict }` or `{ dict, stream }`; the
   * writer adds the object wrapper, the stream keywords and the exact /Length.
   */
  objects(first) {
    if (!this.prepared) throw new Error('prepare() before objects()');
    return [
      ...faceObjects(this.faces.regular, this.prepared.regular, first, 'INVSTU+DejaVuSans', false),
      ...faceObjects(this.faces.bold, this.prepared.bold, first + 5, 'INVSTB+DejaVuSans-Bold', true),
    ];
  }
}

/** The five objects that describe one embedded face. */
function faceObjects(font, cut, n, name, bold) {
  const scale = 1000 / font.unitsPerEm;
  const k = (v) => Math.round(v * scale);
  const bbox = font.bbox.map(k);

  // /W: every glyph in the subset, in order, as one run. The subset renumbers from zero, so a
  // single "0 [w0 w1 …]" entry covers the lot and there is nothing for a viewer to search.
  const widths = Array.from(cut.advances, (a) => k(a));

  const type0 = `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [ ${n + 1} 0 R ] /ToUnicode ${n + 3} 0 R >>`;
  const cid = `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} `
    + '/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> '
    + `/FontDescriptor ${n + 2} 0 R /DW ${widths[0] || 600} /W [ 0 [ ${widths.join(' ')} ] ] /CIDToGIDMap /Identity >>`;
  const descriptor = `<< /Type /FontDescriptor /FontName /${name} /Flags ${bold ? 32 | (1 << 18) : 32} `
    + `/FontBBox [ ${bbox.join(' ')} ] /ItalicAngle 0 /Ascent ${k(font.ascent)} /Descent ${k(font.descent)} `
    + `/CapHeight ${k(font.capHeight)} /StemV ${bold ? 120 : 80} /FontFile2 ${n + 4} 0 R >>`;

  return [
    { dict: type0 },
    { dict: cid },
    { dict: descriptor },
    { dict: '<< /Length %LEN% >>', stream: latin1(toUnicodeCMap(cut.glyphMap)) },
    { dict: `<< /Length %LEN% /Length1 ${cut.bytes.length} >>`, stream: cut.bytes },
  ];
}

/**
 * The ToUnicode CMap: glyph id → the character it stands for.
 *
 * Without it a PDF drawn through Identity-H is a picture of text — nothing can be searched, and
 * copying the invoice number out of it yields garbage. With it, every viewer and every indexer
 * reads the document as the text it is.
 */
function toUnicodeCMap(glyphMap) {
  const pairs = [...glyphMap.entries()].filter(([cp, gid]) => gid > 0 && cp <= 0xFFFF).sort((a, b) => a[1] - b[1]);
  const blocks = [];
  for (let i = 0; i < pairs.length; i += 100) {
    const chunk = pairs.slice(i, i + 100);
    blocks.push(`${chunk.length} beginbfchar\n${chunk.map(([cp, gid]) => `<${hex4(gid)}> <${hex4(cp)}>`).join('\n')}\nendbfchar`);
  }
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    ...blocks,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

function latin1(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
  return out;
}

export { hex2 };
