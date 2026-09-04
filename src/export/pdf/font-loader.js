// Fetching the embedded font family, once.
//
// The two shipped faces live in fonts/ beside the page and are only fetched the first time a PDF
// needs a glyph the standard fonts cannot draw — a document set entirely in Latin-1 never loads
// them and stays the six-kilobyte file it always was. After the first fetch they are held in
// memory for the life of the page, and the browser's own cache keeps the second visit cheap.
//
// The URLs carry the version for the same reason every other asset does: a Grist iframe that
// cached last year's font would otherwise keep it forever.

import { parse } from './ttf.js';
import { EmbeddedFonts } from './embedded.js';
import { APP_VERSION } from '../../version.js';

let pending = null;

const FILES = { regular: 'DejaVuSans-Regular.ttf', bold: 'DejaVuSans-Bold.ttf' };

function fontUrl(name) {
  const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
  return new URL(`fonts/${name}?v=${APP_VERSION}`, base).href;
}

async function fetchFace(name) {
  const res = await fetch(fontUrl(name), { credentials: 'omit' });
  if (!res.ok) throw new Error(`Could not load ${name}: ${res.status}`);
  return parse(new Uint8Array(await res.arrayBuffer()));
}

/**
 * The family, loaded and parsed.
 *
 * The bold face is allowed to fail on its own: a family with only a regular face still draws every
 * word, just without weight, which beats no document at all. A regular face that fails to load
 * rejects, and the caller falls back to the standard fonts with their transliterations.
 */
export function loadEmbeddedFonts() {
  if (pending) return pending;
  pending = (async () => {
    const [regular, bold] = await Promise.all([
      fetchFace(FILES.regular),
      fetchFace(FILES.bold).catch((e) => { console.warn('[Invoice Studio] bold face not loaded', e); return null; }),
    ]);
    return new EmbeddedFonts({ regular, bold });
  })();
  pending.catch(() => { pending = null; });   // a failed load is retried next time, not remembered
  return pending;
}

/** Start the fetch without waiting for it — for the moment a send panel opens. */
export function warmEmbeddedFonts() {
  loadEmbeddedFonts().catch(() => {});
}

/** For tests and tooling: a family from font files already in hand. */
export function embeddedFontsFromBytes(regularBytes, boldBytes) {
  return new EmbeddedFonts({ regular: parse(regularBytes), bold: boldBytes ? parse(boldBytes) : null });
}
