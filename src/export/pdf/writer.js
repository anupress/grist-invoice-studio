// A small PDF writer.
//
// Written rather than vendored, for the same reason this codebase hand-rolls its QR encoder and its
// barcode generator: a PDF of an invoice is text, rules and one image, and the libraries that do
// this weigh several hundred kilobytes because they also do things we will never ask for. What is
// here is the format itself — objects, a cross-reference table, a content stream — and nothing else.
//
// Two things about PDF that shape everything below:
//
//   THE ORIGIN IS BOTTOM-LEFT and y increases upwards, which is upside down from every other
//   coordinate system in this project. Rather than think in it, the public methods take top-left
//   coordinates and convert on the way in. Getting that wrong once, quietly, produces a document
//   that is perfect except that it is mirrored vertically.
//
//   THE CROSS-REFERENCE TABLE IS BYTE OFFSETS into the finished file, so the file cannot be
//   assembled out of order and the offsets have to be counted as it is built. Every entry is
//   exactly twenty bytes, and a viewer that finds nineteen refuses the whole document.

import { encodeString, measure } from './fonts.js';

/** Points per millimetre, for anyone who thinks in paper rather than in typography. */
export const MM = 72 / 25.4;

/**
 * The paper, in points.
 *
 * The two till rolls are a different shape rather than a smaller sheet. A thermal printer's paper is
 * a fixed WIDTH and effectively unlimited length, and the print area is narrower than the roll —
 * 72mm of usable width on 80mm paper, 48mm on 58mm — because the mechanism does not reach the edge.
 * The heights below are a generous default; a receipt that needs more simply runs onto a second
 * "page", which on a continuous roll is invisible.
 */
export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89, margin: 40 },
  letter: { width: 612, height: 792, margin: 40 },
  legal: { width: 612, height: 1008, margin: 40 },
  a5: { width: 419.53, height: 595.28, margin: 28 },
  // 72mm of printable width on an 80mm roll, 48mm on a 58mm one — a thermal mechanism does not
  // reach the edge of its paper. The height is a generous default; a longer receipt runs onto a
  // second page, which on a continuous roll nobody can see.
  receipt80: { width: 204.09, height: 841.89, margin: 8, narrow: true },
  receipt58: { width: 136.06, height: 841.89, margin: 6, narrow: true },
};

const FONTS = [
  { key: 'F1', base: 'Helvetica' },
  { key: 'F2', base: 'Helvetica-Bold' },
  { key: 'F3', base: 'Helvetica-Oblique' },
];

/** A colour as PDF's 0–1 triple. Accepts "#14509b" or [r,g,b] already in 0–1. */
export function rgb(color) {
  if (Array.isArray(color)) return color;
  const hex = String(color || '#000000').replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  if (!isFinite(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const fmt = (n) => {
  // Three decimals is well inside a printer's resolution, and trimming the trailing zeros keeps the
  // content stream readable when something has to be debugged by eye.
  const s = (Math.round(n * 1000) / 1000).toString();
  return s === '-0' ? '0' : s;
};

export class PdfWriter {
  constructor({ size = 'a4', margin = null, title = '', author = '' } = {}) {
    const paper = PAGE_SIZES[size] || PAGE_SIZES.a4;
    this.width = paper.width;
    this.height = paper.height;
    // Each paper knows its own sensible margin — 40pt on A4 would eat a third of a till roll.
    this.margin = margin != null ? margin : paper.margin;
    this.narrow = !!paper.narrow;
    this.title = title;
    this.author = author;
    this.pages = [];
    this.images = [];
    this.addPage();
  }

  /**
   * Register a JPEG so pages can draw it.
   *
   * JPEG only, and that is a fact about PDF rather than a shortcut here: DCTDecode is the one
   * image filter where the file's own bytes go into the stream untouched. Anything else means
   * shipping a compressor. The dictionary must state the pixel dimensions and colour space, so
   * both are read from the SOF marker — a JPEG that cannot be parsed is refused rather than
   * embedded blind, because a wrong /Width corrupts the whole object stream.
   *
   * Returns { key, width, height }, or null for anything that is not an embeddable JPEG.
   */
  addImage(jpegBytes) {
    const info = jpegInfo(jpegBytes);
    if (!info) return null;
    const image = { key: 'Im' + (this.images.length + 1), bytes: jpegBytes, ...info };
    this.images.push(image);
    return image;
  }

  /** Draw a registered image, top-left anchored like everything else here. */
  drawImage(image, x, top, w, h) {
    if (!image) return this;
    this.ops.push(`q ${fmt(w)} 0 0 ${fmt(h)} ${fmt(x)} ${fmt(this.y(top + h))} cm /${image.key} Do Q`);
    return this;
  }

  addPage() {
    this.ops = [];
    this.pages.push(this.ops);
    return this;
  }

  get pageCount() { return this.pages.length; }

  /** Convert a top-left y into PDF's bottom-left space. */
  y(top) { return this.height - top; }

  /**
   * Draw text.
   *
   * `align` is honoured here rather than by the caller because it needs the measured width, and
   * measuring is this module's job — a caller that right-aligns by guessing is a column of figures
   * that does not line up.
   */
  text(x, top, string, opts = {}) {
    const str = String(string == null ? '' : string);
    if (!str) return this;
    const size = opts.size || 10;
    const bold = !!opts.bold;
    const italic = !!opts.italic;
    const font = bold ? 'F2' : (italic ? 'F3' : 'F1');
    const [r, g, b] = rgb(opts.color || '#000000');

    let left = x;
    if (opts.align === 'right') left = x - measure(str, size, bold);
    else if (opts.align === 'center') left = x - measure(str, size, bold) / 2;

    const bytes = encodeString(str);
    this.ops.push(`${fmt(r)} ${fmt(g)} ${fmt(b)} rg`);
    this.ops.push('BT');
    this.ops.push(`/${font} ${fmt(size)} Tf`);
    this.ops.push(`1 0 0 1 ${fmt(left)} ${fmt(this.y(top) - size * 0.78)} Tm`);
    this.ops.push({ raw: bytes });     // handed through unescaped-but-encoded; see flush()
    this.ops.push('ET');
    return this;
  }

  line(x1, top1, x2, top2, opts = {}) {
    const [r, g, b] = rgb(opts.color || '#000000');
    this.ops.push(`${fmt(r)} ${fmt(g)} ${fmt(b)} RG`);
    this.ops.push(`${fmt(opts.width || 0.5)} w`);
    this.ops.push(`${fmt(x1)} ${fmt(this.y(top1))} m ${fmt(x2)} ${fmt(this.y(top2))} l S`);
    return this;
  }

  /** A filled rectangle, given its top-left corner. */
  rect(x, top, w, h, opts = {}) {
    const [r, g, b] = rgb(opts.fill || '#000000');
    this.ops.push(`${fmt(r)} ${fmt(g)} ${fmt(b)} rg`);
    this.ops.push(`${fmt(x)} ${fmt(this.y(top + h))} ${fmt(w)} ${fmt(h)} re f`);
    return this;
  }

  /** One page's content stream, as bytes. */
  flush(ops) {
    const out = [];
    const put = (s) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xFF); };
    for (const op of ops) {
      if (typeof op === 'string') { put(op); out.push(10); continue; }
      // A text-showing operator: the string bytes are already encoded and escaped, so they are
      // spliced in rather than re-encoded, which would double the backslashes.
      out.push(0x28);                       // (
      for (const b of op.raw) out.push(b);
      out.push(0x29, 32, 0x54, 0x6A, 10);   // ) Tj \n
    }
    return out;
  }

  /** The finished file. */
  bytes() {
    const buf = [];
    const put = (s) => { for (let i = 0; i < s.length; i++) buf.push(s.charCodeAt(i) & 0xFF); };
    const putBytes = (arr) => { for (const b of arr) buf.push(b); };

    const objects = [];        // index → byte offset, filled as each is written
    const startObject = (n) => { objects[n] = buf.length; put(`${n} 0 obj\n`); };
    const endObject = () => put('endobj\n');

    put('%PDF-1.4\n');
    // A comment of high bytes, which is what tells a transfer program the file is binary rather
    // than text. Without it, something well-meaning may "helpfully" convert the line endings.
    putBytes([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 10]);

    const pageCount = this.pages.length;
    const fontFirst = 3 + pageCount * 2;         // pages and their contents come first
    const imageFirst = fontFirst + FONTS.length;
    const infoNum = imageFirst + this.images.length;
    const total = infoNum;

    // 1: catalogue
    startObject(1);
    put('<< /Type /Catalog /Pages 2 0 R >>\n');
    endObject();

    // 2: the page tree
    const kids = this.pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
    startObject(2);
    put(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageCount} >>\n`);
    endObject();

    // 3..: each page, then its content stream
    const fontRes = FONTS.map((f, i) => `/${f.key} ${fontFirst + i} 0 R`).join(' ');
    const imageRes = this.images.length
      ? ` /XObject << ${this.images.map((im, i) => `/${im.key} ${imageFirst + i} 0 R`).join(' ')} >>`
      : '';
    this.pages.forEach((ops, i) => {
      const pageNum = 3 + i * 2;
      const contentNum = pageNum + 1;
      startObject(pageNum);
      put(`<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${fmt(this.width)} ${fmt(this.height)} ] `);
      put(`/Resources << /Font << ${fontRes} >>${imageRes} >> /Contents ${contentNum} 0 R >>\n`);
      endObject();

      const stream = this.flush(ops);
      startObject(contentNum);
      put(`<< /Length ${stream.length} >>\nstream\n`);
      putBytes(stream);
      put('\nendstream\n');
      endObject();
    });

    // The standard fonts. No font data: every viewer already has these, which is the whole reason
    // an invoice from here is twenty kilobytes rather than four hundred.
    FONTS.forEach((f, i) => {
      startObject(fontFirst + i);
      put(`<< /Type /Font /Subtype /Type1 /BaseFont /${f.base} /Encoding /WinAnsiEncoding >>\n`);
      endObject();
    });

    // The images, each a stream of the JPEG's own bytes. /Length is the byte count of exactly what
    // sits between stream and endstream — the same exactness rule the content streams live by.
    this.images.forEach((im, i) => {
      startObject(imageFirst + i);
      put(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} `);
      put(`/ColorSpace /${im.gray ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);
      putBytes(im.bytes);
      put('\nendstream\n');
      endObject();
    });

    startObject(infoNum);
    put(`<< /Producer (Invoice Studio by ANUPRESS) /Title (${str(this.title)}) `);
    put(`/Author (${str(this.author)}) /CreationDate (${pdfDate(new Date())}) >>\n`);
    endObject();

    // The cross-reference table. Every entry is exactly twenty bytes; a viewer that counts
    // nineteen rejects the file outright.
    const xrefAt = buf.length;
    put(`xref\n0 ${total + 1}\n`);
    put('0000000000 65535 f \n');
    for (let n = 1; n <= total; n++) {
      put(`${String(objects[n] ?? 0).padStart(10, '0')} 00000 n \n`);
    }
    put(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

    return new Uint8Array(buf);
  }
}

const str = (s) => String(s || '').replace(/[\\()]/g, '\\$&');

/**
 * Width, height and colour space, read from a JPEG's start-of-frame marker.
 *
 * A JPEG is SOI then a chain of length-prefixed segments; the SOF segment (C0–CF, minus the C4/C8/CC
 * markers that mean other things) carries height, width and the component count — 1 is greyscale,
 * 3 is YCbCr, which PDF treats as DeviceRGB under DCTDecode. Four components is CMYK, which needs a
 * /Decode array to not come out inverted, so it is refused rather than embedded wrongly.
 */
function jpegInfo(b) {
  if (!b || b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) return null;
    const marker = b[i + 1];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      const components = b[i + 9];
      if (!width || !height || (components !== 1 && components !== 3)) return null;
      return { width, height, gray: components === 1 };
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

/** PDF's own date format: D:YYYYMMDDHHmmSS. */
function pdfDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
