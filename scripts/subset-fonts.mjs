// Cut the shipped fonts down to what a business document needs.
//
//   node scripts/subset-fonts.mjs <dir containing DejaVuSans.ttf and DejaVuSans-Bold.ttf>
//
// DejaVu Sans in full is three quarters of a megabyte because it covers scripts an invoice from
// here can never be set in. What is kept is listed in src/export/pdf/ttf.js as SHIPPED_REPERTOIRE
// — Latin in every European extension, Greek, Cyrillic, Vietnamese, the currency signs and the
// symbols a document uses. The result lands in fonts/ and is what the widget fetches, once, the
// first time a PDF needs a glyph the standard fonts cannot draw.
//
// Run by hand when the repertoire changes; the output is committed. The full fonts are not in the
// repository — they are a download away and this script is the record of what was done to them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, subset, repertoireCodepoints } from '../src/export/pdf/ttf.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/subset-fonts.mjs <dir with DejaVuSans.ttf and DejaVuSans-Bold.ttf>'); process.exit(1); }

const OUT = path.join(ROOT, 'fonts');
fs.mkdirSync(OUT, { recursive: true });

const cps = repertoireCodepoints();
for (const [from, to] of [['DejaVuSans.ttf', 'DejaVuSans-Regular.ttf'], ['DejaVuSans-Bold.ttf', 'DejaVuSans-Bold.ttf']]) {
  const full = new Uint8Array(fs.readFileSync(path.join(src, from)));
  const font = parse(full);
  const cut = subset(font, cps);
  fs.writeFileSync(path.join(OUT, to), cut.bytes);
  console.log(`${from}: ${full.length} bytes, ${font.numGlyphs} glyphs  ->  ${to}: ${cut.bytes.length} bytes, ${cut.glyphCount} glyphs`);
}

const licence = path.join(src, 'LICENSE_DEJAVU');
if (fs.existsSync(licence)) fs.copyFileSync(licence, path.join(OUT, 'LICENSE_DEJAVU'));
