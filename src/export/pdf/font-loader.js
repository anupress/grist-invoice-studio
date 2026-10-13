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

// Where the faces live, when that is not beside the page. The widget is served as its own page
// with fonts/ next to it, so the page's own base is right; the web version is a script loaded into
// somebody's article, where the page's base is the article's URL and the fonts are wherever the
// plugin put its assets. Setting this wrong loses no document — the PDF falls back to the standard
// fonts — but it loses the letters those fonts cannot draw, which is most of central Europe.
let assetBase = null;

/** Point the loader at the directory that contains `fonts/`. Clears anything already loaded. */
export function setAssetBase(url) {
  if (!url) return;
  assetBase = String(url);
  pending = null;
}

function fontUrl(name) {
  const base = assetBase || (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');
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
