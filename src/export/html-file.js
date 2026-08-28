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
  .inv-brand__logo { max-height: 46px; max-width: 180px; object-fit: contain; }
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
  .inv-slate .inv-brand__logo { background: #fff; padding: 4px 8px; border-radius: 4px; }
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
  @media print {
    body { padding: 0; background: #fff; }
    .sheet { max-width: none; border: 0; border-radius: 0; }
    .inv-doc { padding: 0; --bleed-x: 0px; --bleed-y: 0px; }
    .inv-band, .inv-strip, .inv-slate { padding-left: 20px; padding-right: 20px; }
    @page { margin: 14mm; }
  }
`;

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
export function documentToHtml(draft, settings = {}) {
  const node = renderDocument(draft, settings);
  const title = [draft.number, draft.client?.name].filter(Boolean).join(' — ') || 'Document';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(title)}</title>
<style>${FILE_CSS}</style>
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
