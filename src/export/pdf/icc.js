// An sRGB ICC profile, built rather than shipped.
//
// PDF/A requires an output intent — an ICC profile that says what the document's colours mean —
// and every tool on earth ships the same three-kilobyte sRGB file for it. The profile is a fixed
// set of numbers: the sRGB primaries adapted to D50, the D65 white point, and the sRGB transfer
// curve. Writing those numbers out is a page of code and costs nothing to ship, so that is what
// this does. Version 2, matrix/TRC, which is the kind every reader understands.

const s15 = (v) => Math.round(v * 65536);

function u32(arr, v) { arr.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
function u16(arr, v) { arr.push((v >>> 8) & 255, v & 255); }
function tag4(arr, s) { for (let i = 0; i < 4; i++) arr.push(s.charCodeAt(i) & 255); }
function pad4(arr) { while (arr.length % 4) arr.push(0); }

function xyzTag(x, y, z) {
  const a = [];
  tag4(a, 'XYZ '); u32(a, 0);
  u32(a, s15(x)); u32(a, s15(y)); u32(a, s15(z));
  return a;
}

/** The sRGB transfer function as a 1024-entry curve. */
function curveTag() {
  const a = [];
  tag4(a, 'curv'); u32(a, 0);
  const n = 1024;
  u32(a, n);
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1);
    const lin = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    u16(a, Math.round(lin * 65535));
  }
  return a;
}

function descTag(text) {
  const a = [];
  tag4(a, 'desc'); u32(a, 0);
  u32(a, text.length + 1);
  for (const ch of text) a.push(ch.charCodeAt(0) & 127);
  a.push(0);
  u32(a, 0); u32(a, 0);          // Unicode language code and count
  u16(a, 0); a.push(0);          // ScriptCode code and count
  for (let i = 0; i < 67; i++) a.push(0);
  return a;
}

function textTag(text) {
  const a = [];
  tag4(a, 'text'); u32(a, 0);
  for (const ch of text) a.push(ch.charCodeAt(0) & 127);
  a.push(0);
  return a;
}

let cached = null;

/** The profile bytes. Built once; a few kilobytes. */
export function sRGBProfile() {
  if (cached) return cached;

  const tags = [
    ['desc', descTag('sRGB IEC61966-2.1')],
    ['cprt', textTag('No copyright, use freely')],
    ['wtpt', xyzTag(0.9505, 1.0, 1.0891)],
    ['rXYZ', xyzTag(0.4360, 0.2225, 0.0139)],
    ['gXYZ', xyzTag(0.3851, 0.7169, 0.0971)],
    ['bXYZ', xyzTag(0.1431, 0.0606, 0.7141)],
    ['rTRC', curveTag()],
    ['gTRC', 'rTRC'],   // the three curves are one and the same table
    ['bTRC', 'rTRC'],
  ];

  // Lay the tag data out after the header and the table, sharing the curve.
  const headerSize = 128;
  const tableSize = 4 + tags.length * 12;
  let at = headerSize + tableSize;
  const placed = new Map();
  const dataParts = [];
  const entries = [];
  for (const [sig, data] of tags) {
    if (typeof data === 'string') { entries.push([sig, placed.get(data)]); continue; }
    const start = at;
    const bytes = [...data];
    pad4(bytes);
    dataParts.push(bytes);
    placed.set(sig, [start, data.length]);
    entries.push([sig, [start, data.length]]);
    at += bytes.length;
  }
  const total = at;

  const out = [];
  u32(out, total);
  u32(out, 0);                     // preferred CMM
  u32(out, 0x02100000);            // version 2.1
  tag4(out, 'mntr'); tag4(out, 'RGB '); tag4(out, 'XYZ ');
  u16(out, 2026); u16(out, 1); u16(out, 1); u16(out, 0); u16(out, 0); u16(out, 0);   // date
  tag4(out, 'acsp');
  u32(out, 0);                     // platform
  u32(out, 0);                     // flags
  u32(out, 0); u32(out, 0);        // manufacturer, model
  u32(out, 0); u32(out, 0);        // attributes
  u32(out, 0);                     // rendering intent: perceptual
  u32(out, s15(0.9642)); u32(out, s15(1.0)); u32(out, s15(0.8249));   // D50 illuminant
  u32(out, 0);                     // creator
  for (let i = 0; i < 44; i++) out.push(0);   // profile id + reserved
  if (out.length !== headerSize) throw new Error('ICC header is ' + out.length + ' bytes');

  u32(out, tags.length);
  for (const [sig, [offset, size]] of entries) { tag4(out, sig); u32(out, offset); u32(out, size); }
  for (const part of dataParts) for (const b of part) out.push(b);

  cached = Uint8Array.from(out);
  return cached;
}
