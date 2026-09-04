// Minimal, dependency-free QR Code encoder (ISO/IEC 18004). Byte mode only, versions 1-6, all
// four error-correction levels. Runs entirely client-side — nothing about a generated code is
// sent anywhere, matching this app's "zero third-party network calls" privacy claim.
//
// Deliberately capped at version 6 (the spec goes to 40): versions 7+ need multiple alignment
// patterns arranged in a grid (a second, more complex position table) plus a version-information
// block neither of which exists below version 7. Version 6 at error-correction level M already
// holds ~106 bytes, comfortably enough for any realistic URL, so the extra complexity (and extra
// surface area for a transcription mistake in a correctness-critical algorithm) wasn't worth it.
// Longer input throws a clear error instead of silently producing something that might not scan.

// ---- GF(256) arithmetic (primitive polynomial 0x11D, generator 2) ----
const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];

function polyMul(a, b) {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) result[i + j] ^= gfMul(a[i], b[j]);
  return result;
}
// Generator polynomial of the given degree, coefficients highest-degree-first, leading coeff 1.
function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) poly = polyMul(poly, [1, GF_EXP[i]]);
  return poly;
}
// Reed-Solomon EC codewords for one block of data codewords.
function rsEncodeBlock(data, ecCount) {
  const generator = rsGeneratorPoly(ecCount);
  const msg = data.concat(new Array(ecCount).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef === 0) continue;
    for (let j = 0; j < generator.length; j++) msg[i + j] ^= gfMul(generator[j], coef);
  }
  return msg.slice(data.length);
}

// ---- Per-version/level block structure (ISO 18004 Table 9, versions 1-6 only) ----
// ec = EC codewords per block. groups = [[blockCount, dataCodewordsPerBlock], ...] (a second
// group appears when a version/level mixes two different per-block data lengths).
const RS_BLOCKS = {
  1: { L: { ec: 7, groups: [[1, 19]] }, M: { ec: 10, groups: [[1, 16]] }, Q: { ec: 13, groups: [[1, 13]] }, H: { ec: 17, groups: [[1, 9]] } },
  2: { L: { ec: 10, groups: [[1, 34]] }, M: { ec: 16, groups: [[1, 28]] }, Q: { ec: 22, groups: [[1, 22]] }, H: { ec: 28, groups: [[1, 16]] } },
  3: { L: { ec: 15, groups: [[1, 55]] }, M: { ec: 26, groups: [[1, 44]] }, Q: { ec: 18, groups: [[2, 17]] }, H: { ec: 22, groups: [[2, 13]] } },
  4: { L: { ec: 20, groups: [[1, 80]] }, M: { ec: 18, groups: [[2, 32]] }, Q: { ec: 26, groups: [[2, 24]] }, H: { ec: 16, groups: [[4, 9]] } },
  5: { L: { ec: 26, groups: [[1, 108]] }, M: { ec: 24, groups: [[2, 43]] }, Q: { ec: 18, groups: [[2, 15], [2, 16]] }, H: { ec: 22, groups: [[2, 11], [2, 12]] } },
  6: { L: { ec: 18, groups: [[2, 68]] }, M: { ec: 16, groups: [[4, 27]] }, Q: { ec: 24, groups: [[4, 19]] }, H: { ec: 28, groups: [[4, 15]] } },
};
const FORMAT_BITS_BY_LEVEL = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

function totalDataCodewords(version, level) {
  return RS_BLOCKS[version][level].groups.reduce((s, [n, len]) => s + n * len, 0);
}

// ---- Byte-mode data encoding + padding ----
function buildDataCodewords(bytes, version, level) {
  const capacityBits = totalDataCodewords(version, level) * 8;
  const bits = [];
  const pushBits = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  pushBits(0b0100, 4); // byte-mode indicator
  pushBits(bytes.length, version <= 9 ? 8 : 16); // char-count indicator
  for (const b of bytes) pushBits(b, 8);

  if (bits.length > capacityBits) return null; // caller decides how to report "too long"

  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0); // terminator
  while (bits.length % 8 !== 0) bits.push(0); // byte-align
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  const padBytes = [0xec, 0x11];
  let p = 0;
  while (codewords.length < capacityBits / 8) codewords.push(padBytes[p++ % 2]);
  return codewords;
}

// Split into blocks, RS-encode each, then interleave data codewords and EC codewords separately.
function buildFinalCodewords(dataCodewords, version, level) {
  const { ec, groups } = RS_BLOCKS[version][level];
  const blocks = [];
  let offset = 0;
  for (const [count, len] of groups) {
    for (let i = 0; i < count; i++) {
      const data = dataCodewords.slice(offset, offset + len);
      offset += len;
      blocks.push({ data, ec: rsEncodeBlock(data, ec) });
    }
  }
  const result = [];
  const maxDataLen = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxDataLen; i++) for (const b of blocks) if (i < b.data.length) result.push(b.data[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) result.push(b.ec[i]);
  return result;
}

// ---- Matrix construction ----
function createMatrix(version) {
  const size = 17 + 4 * version;
  return {
    size,
    modules: Array.from({ length: size }, () => new Array(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array(size).fill(false)),
  };
}
function isFinderDark(r, c) {
  if (r < 0 || r > 6 || c < 0 || c > 6) return false; // 1-module separator ring
  if (r === 0 || r === 6 || c === 0 || c === 6) return true; // outer 7x7 ring
  if (r === 1 || r === 5 || c === 1 || c === 5) return false; // white ring
  return true; // inner 3x3
}
function placeFinderPattern(m, topRow, topCol) {
  for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
    const rr = topRow + r, cc = topCol + c;
    if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue;
    m.modules[rr][cc] = isFinderDark(r, c);
    m.reserved[rr][cc] = true;
  }
}
function placeAlignmentPattern(m, row, col) {
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
    const dark = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
    m.modules[row + r][col + c] = dark;
    m.reserved[row + r][col + c] = true;
  }
}
function placeFunctionPatterns(m, version) {
  placeFinderPattern(m, 0, 0);
  placeFinderPattern(m, 0, m.size - 7);
  placeFinderPattern(m, m.size - 7, 0);
  for (let i = 8; i < m.size - 8; i++) {
    const dark = i % 2 === 0;
    m.modules[6][i] = dark; m.reserved[6][i] = true;
    m.modules[i][6] = dark; m.reserved[i][6] = true;
  }
  if (version >= 2) {
    const p = 4 * version + 10; // valid for versions 2-6 only (see file header)
    placeAlignmentPattern(m, p, p);
  }
  const dm = 4 * version + 9;
  m.modules[dm][8] = true; m.reserved[dm][8] = true; // fixed dark module
  // Reserve (but don't fill yet — filled once the mask is chosen) the format-info strips.
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { m.reserved[8][i] = true; m.reserved[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    m.reserved[8][m.size - 1 - i] = true;
    m.reserved[m.size - 1 - i][8] = true;
  }
}

// BCH(15,5) error correction for the 15-bit format string, generator 0x537, XOR mask 0x5412.
function formatBits(level, maskId) {
  const data = (FORMAT_BITS_BY_LEVEL[level] << 3) | maskId; // 5 bits
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}
function placeFormatInfo(m, level, maskId) {
  const f = formatBits(level, maskId); // 15 bits, f's bit 14 is the MSB
  const bit = (i) => (f >> i) & 1;
  // Copy A: row 8 columns 0-5,7,8 (bits 14..7), then column 8 rows 7,5,4,3,2,1,0 (bits 6..0).
  const copyA = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  for (let i = 0; i < 15; i++) { const [r, c] = copyA[i]; m.modules[r][c] = !!bit(14 - i); }
  // Copy B: column 8 rows size-1..size-7 (bits 14..8), then row 8 columns size-8..size-1 (bits 7..0).
  const copyB = [];
  for (let i = 0; i < 7; i++) copyB.push([m.size - 1 - i, 8]);
  for (let i = 0; i < 8; i++) copyB.push([8, m.size - 8 + i]);
  for (let i = 0; i < 15; i++) { const [r, c] = copyB[i]; m.modules[r][c] = !!bit(14 - i); }
}

const MASK_FNS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (((r / 2) | 0) + ((c / 3) | 0)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function placeData(m, codewords) {
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  let bitIndex = 0, dir = -1, row = m.size - 1;
  for (let colPair = m.size - 1; colPair > 0; colPair -= 2) {
    if (colPair === 6) colPair--;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const col of [colPair, colPair - 1]) {
        if (!m.reserved[row][col]) { m.modules[row][col] = !!(bitIndex < bits.length ? bits[bitIndex] : 0); bitIndex++; }
      }
      row += dir;
      if (row < 0 || row >= m.size) { row -= dir; dir = -dir; break; }
    }
  }
}
function applyMask(m, maskId) {
  const fn = MASK_FNS[maskId];
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    if (!m.reserved[r][c] && fn(r, c)) m.modules[r][c] = !m.modules[r][c];
  }
}

// Penalty rules 1 (runs), 2 (2x2 blocks) and 4 (dark/light balance) — a deliberately simplified
// version of ISO 18004's four-rule scoring (rule 3, the finder-pattern-lookalike detector, is
// skipped). This only affects *which* of the 8 equally-valid masks looks least noisy — every
// mask, correctly declared via the format bits, produces a fully scannable code regardless.
function penaltyScore(m) {
  let score = 0;
  const run = (getVal, len) => {
    let count = 1;
    for (let i = 1; i < len; i++) {
      if (getVal(i) === getVal(i - 1)) { count++; if (count === 5) score += 3; else if (count > 5) score += 1; }
      else count = 1;
    }
  };
  for (let r = 0; r < m.size; r++) run((c) => m.modules[r][c], m.size);
  for (let c = 0; c < m.size; c++) run((r) => m.modules[r][c], m.size);
  for (let r = 0; r < m.size - 1; r++) for (let c = 0; c < m.size - 1; c++) {
    const v = m.modules[r][c];
    if (m.modules[r][c + 1] === v && m.modules[r + 1][c] === v && m.modules[r + 1][c + 1] === v) score += 3;
  }
  let dark = 0;
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.modules[r][c]) dark++;
  const pct = (dark * 100) / (m.size * m.size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/**
 * Encode `text` (a string, UTF-8 encoded) as a QR code.
 * @param {string} text
 * @param {'L'|'M'|'Q'|'H'} level error-correction level (default 'M')
 * @returns {{ size: number, modules: boolean[][] }} a size x size grid, true = dark module.
 * @throws if text doesn't fit within the supported version range (1-6) at the given level.
 */
export function encodeQR(text, level = 'M') {
  const bytes = [...new TextEncoder().encode(text)];
  let version = null, dataCodewords = null;
  for (let v = 1; v <= 6; v++) {
    const codewords = buildDataCodewords(bytes, v, level);
    if (codewords) { version = v; dataCodewords = codewords; break; }
  }
  if (version === null) {
    const maxBytes = Math.floor((totalDataCodewords(6, level) * 8 - 12) / 8);
    throw new Error(`Too much text for a QR code (max ~${maxBytes} characters at this error-correction level).`);
  }

  const finalCodewords = buildFinalCodewords(dataCodewords, version, level);
  let best = null;
  for (let maskId = 0; maskId < 8; maskId++) {
    const m = createMatrix(version);
    placeFunctionPatterns(m, version);
    placeData(m, finalCodewords);
    applyMask(m, maskId);
    placeFormatInfo(m, level, maskId);
    const score = penaltyScore(m);
    if (!best || score < best.score) best = { m, score };
  }
  return { size: best.m.size, modules: best.m.modules };
}
