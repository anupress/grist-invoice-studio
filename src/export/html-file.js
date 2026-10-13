// The document as a file somebody can keep.
//
// One self-contained HTML file: no stylesheet to lose, no fonts to fetch, no script, nothing that
// reaches the network when it is opened. It survives being emailed, filed on a shared drive and
// opened in ten years, which is what an invoice has to do — and it prints to PDF from any browser,
// which is how it becomes a PDF until the real writer lands in the last phase.
//
// The stylesheet below is deliberately a COPY rather than a link to the app's own CSS. The app's
// styles will keep changing; a file already sent to a client must never change, so it carries its
// own. That is duplication with a reason, and the reason is that the two have different lifetimes.

import { renderDocument } from '../doc/render.js';
import { languageOf } from '../doc/lang.js';
import { isDin } from '../doc/layouts.js';

const FILE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px;
    background: #f4f6f8; color: #16212c;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: 15px; line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet {
    max-width: 820px; margin: 0 auto; background: #fff;
    border: 1px solid #dfe5ec; border-radius: 6px; overflow: hidden;
  }
  .inv-doc { --bleed-x: 44px; --bleed-y: 40px; padding: 40px 44px 48px; display: flex; flex-direction: column; gap: 26px; }
  .inv-brand { display: flex; align-items: center; gap: 14px; }
  .inv-brand__logo { max-height: var(--logo-h, 46px); max-width: calc(var(--logo-h, 46px) * 4); object-fit: contain; }
  .inv-band__logo.is-plated, .inv-strip__logo.is-plated, .inv-slate .inv-brand__logo.is-plated { background: #fff; padding: 4px 8px; border-radius: 4px; }
  .inv-brand__name { font-size: 21px; font-weight: 600; letter-spacing: -.015em; }
  .inv-brand__web { font-size: 13px; color: #5f7285; margin-top: 2px; }
  .inv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 20px; border-bottom: 2px solid #14509b; }
  .inv-head.is-minimal { border-bottom: 1px solid #16212c; }
  .inv-head.is-banded, .inv-head.is-letterhead { display: block; padding-bottom: 0; border-bottom: 0; }
  .inv-band { background: #14509b; color: #fff; margin: calc(-1 * var(--bleed-y)) calc(-1 * var(--bleed-x)) 0; padding: 26px var(--bleed-x) 22px; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
  .inv-band__name { font-size: 22px; font-weight: 600; }
  .inv-band__meta { font-family: system-ui, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; display: flex; gap: 8px; }
  .inv-strip { background: #eaf1fa; border-left: 3px solid #14509b; margin: calc(-1 * var(--bleed-y)) calc(-1 * var(--bleed-x)) 0; padding: 22px var(--bleed-x); display: flex; justify-content: space-between; align-items: center; gap: 20px; }
  .inv-strip__tag { font-family: ui-monospace, Consolas, monospace; font-size: 13px; color: #5f7285; margin-top: 3px; }
  .inv-strip__initials { width: 48px; height: 48px; border-radius: 4px; background: #14509b; color: #fff; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; font-size: 19px; font-weight: 700; }
  .inv-title { text-align: right; }
  .inv-title__word { font-family: system-ui, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #14509b; }
  .inv-title__number { font-family: ui-monospace, Consolas, monospace; font-size: 19px; margin-top: 2px; display: flex; gap: 6px; justify-content: flex-end; }
  .inv-title__warn { display: none; }
  .inv-status { display: inline-block; margin-top: 6px; font-family: system-ui, sans-serif; font-size: 10.5px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; padding: 3px 9px; border-radius: 3px; background: #eef1f5; color: #5f7285; }
  .inv-status[data-status="paid"] { background: #e2f2eb; color: #16704a; }
  .inv-status[data-status="sent"] { background: #e6eefa; color: #14509b; }
  .inv-status[data-status="overdue"] { background: #f8e8e6; color: #a33830; }
  .inv-statusrow { margin-top: 14px; }
  .inv-parties { display: grid; gap: 28px; grid-template-columns: 1fr 1fr auto; }
  .inv-party__label { font-family: system-ui, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #5f7285; margin-bottom: 6px; }
  .inv-party__name { font-weight: 600; font-size: 15px; }
  .inv-party__line { font-size: 13.5px; }
  .inv-party__line--meta { color: #5f7285; font-size: 13px; }
  .inv-metas { display: flex; flex-direction: column; gap: 10px; text-align: right; min-width: 150px; }
  .inv-meta__label { font-family: system-ui, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #5f7285; }
  .inv-meta__value { font-size: 14px; font-variant-numeric: tabular-nums; }
  .inv-meta.is-total .inv-meta__value { font-size: 20px; font-weight: 600; color: #14509b; }
  .inv-lines { width: 100%; border-collapse: collapse; font-size: 14px; }
  .inv-lines th { text-align: left; padding: 8px 12px; font-family: system-ui, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #5f7285; border-bottom: 1px solid #dfe5ec; }
  .inv-lines td { padding: 10px 12px; border-bottom: 1px solid #dfe5ec; vertical-align: top; }
  .inv-lines th:first-child, .inv-lines td:first-child { padding-left: 0; }
  .inv-lines th:last-child, .inv-lines td:last-child { padding-right: 0; }
  .inv-lines .is-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .inv-lines th.is-img, .inv-lines td.is-img { width: 44px; padding-right: 8px; }
  .inv-lines__img { width: 36px; height: 36px; object-fit: cover; display: block; border: 1px solid #dfe5ec; border-radius: 4px; background: #fff; }
  .inv-totals { display: flex; flex-direction: column; gap: 6px; margin-left: auto; min-width: 260px; }
  .inv-total { display: flex; justify-content: space-between; gap: 24px; font-size: 14px; }
  .inv-total__label { color: #5f7285; }
  .inv-total__value { font-variant-numeric: tabular-nums; }
  .inv-total.is-grand { border-top: 1px solid #dfe5ec; margin-top: 4px; padding-top: 8px; font-size: 17px; font-weight: 600; }
  .inv-total.is-grand .inv-total__label { color: #16212c; }
  .inv-total--note { display: block; font-size: 12.5px; color: #5f7285; font-style: italic; text-align: right; max-width: 34ch; margin-left: auto; }
  .inv-foot { border-top: 1px solid #dfe5ec; padding-top: 18px; display: flex; flex-direction: column; gap: 16px; }
  .inv-foot__item { max-width: 62ch; }
  .inv-foot__item p { margin: 0; font-size: 13.5px; white-space: pre-line; }
  .inv-legend { margin: 0; padding: 10px 14px; background: #eef1f5; border-radius: 3px; font-size: 13px; max-width: 62ch; }
  .inv-sign__rule { border-bottom: 1px solid #16212c; height: 36px; margin-bottom: 6px; }
  .inv-closing { margin: 0; text-align: center; font-size: 13px; color: #5f7285; border-top: 1px solid #dfe5ec; padding-top: 16px; }
  @media (max-width: 700px) {
    body { padding: 0; }
    .sheet { border: 0; border-radius: 0; }
    .inv-doc { padding: 24px 20px 32px; --bleed-x: 20px; --bleed-y: 24px; }
    .inv-parties { grid-template-columns: 1fr; gap: 18px; }
    .inv-metas { text-align: left; }
  }
  .inv-slate { background: #16212c; color: #fff; margin: calc(-1 * var(--bleed-y)) calc(-1 * var(--bleed-x)) 0; padding: 26px var(--bleed-x) 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .inv-head.is-slate { display: block; }
  .inv-slate .inv-brand__name { color: #fff; }
  .inv-slate .inv-brand__web { color: rgba(255,255,255,.65); }
  .inv-slate .inv-title__word { color: rgba(255,255,255,.72); }
  .inv-slate .inv-title__number { color: #fff; }
  .inv-head.is-headline { display: block; padding-bottom: 18px; border-bottom: 1px solid #dfe5ec; }
  .inv-hl__word { font-family: system-ui, sans-serif; font-size: 46px; font-weight: 300; letter-spacing: .14em; line-height: 1; color: #16212c; border-bottom: 1px solid #16212c; padding-bottom: 14px; margin-bottom: 16px; overflow-wrap: anywhere; }
  .inv-hl__row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .inv-hl__meta { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .inv-hl__meta .inv-title__number { font-size: 16px; }
  .inv-head.is-rail { display: block; }
  .inv-rail { border-left: 4px solid var(--doc-accent, #14509b); padding: 4px 0 4px 22px; display: flex; flex-direction: column; gap: 14px; }
  .inv-head.is-centred { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 5px; padding-bottom: 20px; border-bottom: 1px solid #dfe5ec; }
  .inv-head.is-centred .inv-title__number { justify-content: center; }
  .inv-cent__rule { width: 56px; border-top: 2px solid var(--doc-accent, #14509b); margin: 10px 0 6px; }
  .inv-head.is-ledger { display: flex; flex-direction: column; gap: 20px; }
  .inv-ledger__top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .inv-ledger__window { min-width: 0; padding-top: 4px; }
  .inv-ledger__window .inv-party__label { margin-bottom: 8px; }
  .inv-ledger__brand { flex-direction: row-reverse; text-align: right; flex: none; max-width: 45%; }
  .inv-ledger__meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px 24px; padding: 14px 0; border-top: 1px solid #dfe5ec; border-bottom: 1px solid #dfe5ec; }
  .inv-ledger__meta .inv-meta__label { margin-bottom: 2px; }
  .inv-ledger__meta .inv-meta__value { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
  .inv-ledger__meta .inv-meta.is-total .inv-meta__value { font-size: 17px; color: #16212c; }
  .inv-ledger__title { display: flex; align-items: center; gap: 12px; }
  .inv-ledger__word { font-family: system-ui, sans-serif; font-size: 18px; font-weight: 700; color: #16212c; }
  .inv-ledger__title .inv-status { margin-top: 0; }
  .inv-doc.is-ledger .inv-lines th { border-top: 2px solid #16212c; border-bottom: 1px solid #16212c; color: #16212c; padding-top: 9px; padding-bottom: 7px; }
  .inv-doc.is-ledger .inv-lines td { border-bottom: 0; padding: 7px 12px; }
  .inv-doc.is-ledger .inv-lines tbody tr:last-child td { border-bottom: 2px solid #16212c; padding-bottom: 10px; }
  .inv-doc.is-ledger .inv-lines tbody tr:first-child td { padding-top: 10px; }
  .inv-lines th.is-pos, .inv-lines td.is-pos { width: 1%; white-space: nowrap; color: #5f7285; font-variant-numeric: tabular-nums; }
  .inv-ledger__close { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .inv-ledger__close .inv-totals { margin-left: auto; }
  .inv-colophon { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding-top: 14px; border-top: 1px solid #dfe5ec; font-size: 11px; line-height: 1.45; color: #5f7285; overflow-wrap: anywhere; }
  .inv-colophon__col { border-left: 2px solid #16212c; padding-left: 10px; }
  .inv-colophon__name { color: #16212c; font-weight: 600; }
  @media (max-width: 700px) {
    .inv-ledger__top { flex-direction: column; }
    .inv-ledger__brand { flex-direction: row; text-align: left; max-width: none; }
    .inv-ledger__close { flex-direction: column; }
    .inv-colophon { grid-template-columns: 1fr; }
  }
  .inv-pay { display: flex; align-items: flex-start; gap: 14px; }
  .inv-pay svg { width: 96px; height: 96px; flex: none; border: 1px solid #dfe5ec; border-radius: 4px; background: #fff; }
  .inv-pay__text { min-width: 0; }
  .inv-pay__line { font-size: 13px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .inv-legal { margin: 0; text-align: center; font-size: 11px; line-height: 1.45; color: #5f7285; }
  .inv-credit { margin: 6px 0 0; text-align: center; font-size: 9.5px; line-height: 1.4; color: #5f7285; opacity: .75; }
  [data-density="compact"] .inv-doc { padding: 28px 32px 32px; gap: 16px; font-size: 13.5px; }
  [data-density="compact"] .inv-lines td { padding: 6px 12px; }
  [data-density="roomy"] .inv-doc { padding: 52px 56px 60px; gap: 34px; font-size: 16px; }
  [data-density="roomy"] .inv-lines td { padding: 14px 12px; }
  @media print {
    body { padding: 0; background: #fff; }
    .sheet { max-width: none; border: 0; border-radius: 0; }
    .inv-doc { padding: 0; --bleed-x: 0px; --bleed-y: 0px; }
    .inv-band, .inv-strip, .inv-slate { padding-left: 20px; padding-right: 20px; }
    .inv-doc, .inv-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .inv-lines thead { display: table-header-group; }
    .inv-lines tr, .inv-head, .inv-parties, .inv-totals, .inv-foot__item, .inv-pay, .inv-legend, .inv-colophon { break-inside: avoid; page-break-inside: avoid; }
  }
  /* DIN 5008: the standard's positions in millimetres of the sheet — see document.css and doc/layouts.js.
     The file prints with no page margin of its own (see pageCss), so on paper --din-y0 is nothing. */
  .inv-doc.is-din5008a, .inv-doc.is-din5008b { container-type: inline-size; --mm: calc(100cqw / 210); --din-y0: 0px; position: relative; padding: 0 0 calc(12 * var(--mm)); gap: calc(6 * var(--mm)); }
  .inv-doc.is-din5008b { --din-top: 45; --din-fold-1: 105; --din-fold-2: 210; }
  .inv-doc.is-din5008a { --din-top: 27; --din-fold-1: 87; --din-fold-2: 192; }
  .inv-doc.is-din5008a > *, .inv-doc.is-din5008b > * { margin-left: calc(25 * var(--mm)); margin-right: calc(20 * var(--mm)); }
  .inv-doc.is-din5008a > .inv-head, .inv-doc.is-din5008b > .inv-head { margin: 0; }
  .inv-head.is-din { position: relative; display: flex; flex-direction: column; padding: 0 calc(20 * var(--mm)) calc(2.5 * var(--mm)) calc(25 * var(--mm)); border-bottom: 0; }
  .inv-din__top { height: calc(var(--din-top) * var(--mm) - var(--din-y0)); display: flex; align-items: center; justify-content: flex-end; overflow: hidden; }
  .inv-din__top .inv-brand { flex-direction: row-reverse; text-align: right; gap: calc(3 * var(--mm)); }
  .inv-din__top .inv-brand__name { font-size: calc(5 * var(--mm)); }
  .inv-din__top .inv-brand__web { font-size: calc(3.2 * var(--mm)); }
  .inv-din__top .inv-brand__logo { max-height: min(var(--logo-h, 46px), calc(var(--din-top) * var(--mm) - var(--din-y0) - 3 * var(--mm))); }
  .inv-din__row { display: flex; justify-content: space-between; align-items: flex-start; margin-left: calc(-5 * var(--mm)); }
  .inv-din__window { width: calc(85 * var(--mm)); height: calc(45 * var(--mm)); flex: none; }
  .inv-din__return { height: calc(5 * var(--mm)); display: flex; align-items: center; font-family: system-ui, sans-serif; font-size: calc(2.2 * var(--mm)); line-height: 1; color: #5f7285; border-bottom: 1px solid #dfe5ec; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .inv-din__remarks { height: calc(12.7 * var(--mm)); }
  .inv-din__recipient .inv-party__name, .inv-din__recipient .inv-party__line { font-size: calc(3.5 * var(--mm)); line-height: calc(4.23 * var(--mm)); font-weight: 400; }
  .inv-din__recipient .inv-party__name { font-weight: 600; }
  .inv-din__info { width: calc(65 * var(--mm)); flex: none; padding-top: calc(5 * var(--mm)); font-size: calc(3.3 * var(--mm)); line-height: calc(4.23 * var(--mm)); }
  .inv-din__info .inv-meta { display: flex; justify-content: space-between; gap: calc(3 * var(--mm)); }
  .inv-din__info .inv-meta__label { font-family: inherit; font-size: inherit; font-weight: 400; letter-spacing: 0; text-transform: none; color: #5f7285; white-space: nowrap; }
  .inv-din__info .inv-meta__value { font-size: inherit; text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 4px; font-variant-numeric: tabular-nums; }
  .inv-din__subject { margin-top: calc(8.46 * var(--mm)); display: flex; align-items: center; gap: calc(3 * var(--mm)); font-family: system-ui, sans-serif; font-weight: 700; font-size: calc(4 * var(--mm)); line-height: calc(4.23 * var(--mm)); }
  .inv-din__subject .inv-status { margin: 0 0 0 auto; }
  .inv-din__marks { position: absolute; left: 0; top: 0; width: 0; height: 0; }
  .inv-din__mark { position: absolute; left: 0; width: calc(5 * var(--mm)); border-top: 1px solid #5f7285; opacity: .55; }
  .inv-din__mark--punch { width: calc(8 * var(--mm)); }
  @media print {
    .inv-doc.is-din5008a, .inv-doc.is-din5008b { container-type: normal; --mm: 1mm; --din-y0: 0mm; padding-bottom: 10mm; }
  }
`;

/**
 * The sheet the file prints on.
 *
 * A file kept for years says only how wide its margin is and leaves the paper to whoever prints
 * it. A print sent straight from the page names the paper as well, because the page knows which
 * one was chosen, and asking the print dialog to guess is how an A4 invoice comes out on Letter.
 */
function pageCss({ pageSize, pageMargin } = {}) {
  const margin = pageMargin || '14mm';
  return `@media print { @page { ${pageSize ? `size: ${pageSize}; ` : ''}margin: ${margin}; } }`;
}

const escapeAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * A filename a person can find again.
 *
 * The number goes first because that is what a folder of invoices is sorted and searched by, and
 * the client name follows because that is what somebody scanning the folder is actually looking
 * for. Anything a filesystem dislikes is replaced rather than dropped, so two documents cannot
 * collapse into the same name.
 */
export function fileNameFor(draft) {
  const clean = (s) => String(s || '').replace(/[^\w\-. ]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const kind = clean(draft.kind || 'document');
  const number = clean(draft.number) || 'draft';
  const client = clean(draft.client?.name);
  return [kind, number, client].filter(Boolean).join('_').slice(0, 120) + '.html';
}

/**
 * The whole document as one HTML string.
 *
 * Built from the same renderer the screen uses, so the file and the page can never disagree about
 * what an invoice looks like — which is the failure that makes a business stop trusting its own
 * paperwork.
 */
export function documentToHtml(draft, settings = {}, options = {}) {
  const node = renderDocument(draft, settings);
  const title = options.title || [draft.number, draft.client?.name].filter(Boolean).join(' — ') || 'Document';
  const density = options.density && options.density !== 'normal' ? ` data-density="${escapeAttr(options.density)}"` : '';
  // A DIN sheet measures from the paper's edge, so the page gives it no margin of its own.
  const page = isDin(draft.layout) ? { ...options, pageMargin: '0' } : options;
  return `<!DOCTYPE html>
<html lang="${languageOf(draft, settings)}"${density}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(title)}</title>
<style>${FILE_CSS}
  ${pageCss(page)}
</style>
</head>
<body>
<div class="sheet">${node.outerHTML}</div>
</body>
</html>
`;
}

/**
 * Hand the file to the browser.
 *
 * A Blob and an object URL rather than a data: URI — a long data: URI is refused outright by some
 * browsers and truncated by others, and an invoice with fifty lines is easily long enough to find
 * that limit. The URL is revoked after the click so the blob does not sit in memory for the life
 * of the tab.
 */
export function downloadDocument(draft, settings = {}) {
  const html = documentToHtml(draft, settings);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(draft);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { fileName: a.download, bytes: blob.size };
}
