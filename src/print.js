// What the printer is told.
//
// Pressing Print used to produce the invoice with the browser's own furniture around it: the date
// and the page title across the top, the document's URL and a page count across the bottom, and
// above the invoice the hint strip that happened to be on screen. Chrome draws that furniture in
// the page margin, and a page has no switch to flip that stops it — but a page with no margin has
// nowhere to draw it. So the sheet's margin is zero, and the white space a document needs is made
// inside the sheet instead.
//
// Inside, and on every page: a block with 14mm of padding gives page one a margin and page two
// none, because padding is not paged. A table's header and footer rows are — a browser repeats
// them at the top and bottom of every page a table runs across — so the document is placed in a
// one-cell table whose header and footer are empty rows exactly one margin tall. On screen the
// same table is displayed as plain blocks and the two rows are not shown at all.
//
// The title matters too: Chrome names a saved PDF after the page title, so a document saved from
// the print dialog used to be called "Invoice Studio — by ANUPRESS.pdf", every one of them. For
// the duration of a print it is the same name the Download button would have given the file.

import { el } from './core/util.js';
import { fileNameFor } from './export/html-file.js';

/** CSS page sizes for the paper choices in Settings → Document. */
export const PAPER = {
  a4: 'A4', letter: 'letter', legal: 'legal', a5: 'A5',
  receipt80: '72mm auto', receipt58: '48mm auto',
};

/**
 * The @page rule for a paper size, and the inset the document keeps inside it.
 *
 * `@page` cannot be scoped by a selector — it is a page-level at-rule, so there is no way to
 * write one rule per paper size and pick between them with a class. The caller puts this text
 * into a managed style element instead. The margin is always zero (see the top of this file);
 * the inset is what the document draws for itself in its place — a normal sheet's 14mm, or the
 * 3mm a till roll can afford.
 */
export function pageRuleFor(size) {
  const css = PAPER[size] || 'A4';
  const narrow = size === 'receipt80' || size === 'receipt58';
  return {
    css: `@media print { @page { size: ${css}; margin: 0; } }`,
    inset: narrow ? '3mm' : '14mm',
  };
}

/** The page title while printing: what the Download button would have named this file. */
export function printTitleFor(draft) {
  return fileNameFor(draft || {}).replace(/\.html$/, '');
}

/**
 * The document in its printing frame.
 *
 * A real table, not divs displayed as one: a browser repeats `<thead>` and `<tfoot>` across pages,
 * and whether it does the same for a div told to look like one is not something to bet a printed
 * invoice on. `role="presentation"`, because a layout table is not a table to a screen reader.
 */
export function printFrame(page) {
  const gap = () => el('tr', {}, [el('td', { class: 'studio-printframe__gap', 'aria-hidden': 'true' })]);
  return el('table', { class: 'studio-printframe', role: 'presentation' }, [
    el('thead', {}, [gap()]),
    el('tbody', {}, [el('tr', {}, [el('td', { class: 'studio-printframe__cell' }, [page])])]),
    el('tfoot', {}, [gap()]),
  ]);
}

/**
 * Name the page after the document while it is being printed, and put the name back afterwards.
 *
 * `getTitle` is asked at print time, so it always describes the document on screen at that
 * moment. An empty answer leaves the title alone.
 */
export function installPrintTitle(getTitle) {
  if (typeof window === 'undefined') return;
  let before = null;
  window.addEventListener('beforeprint', () => {
    const title = getTitle();
    if (!title) return;
    before = document.title;
    document.title = title;
  });
  window.addEventListener('afterprint', () => {
    if (before != null) document.title = before;
    before = null;
  });
}
