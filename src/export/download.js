// Handing a document to the person as a file.
//
// Two formats, and they are for different things rather than one being better:
//
//   PDF   what a client expects to receive, what an accounts department files, and what prints the
//         same everywhere. This is the default.
//   HTML  one file that opens in any browser with no reader at all, and that can be read by a
//         script on the far end of a webhook without a PDF library. Kept because it is genuinely
//         more useful in an automation than a PDF is.
//
// The PDF is asynchronous now, for one reason: a document with a character the standard fonts
// cannot draw — a Polish name, a rupee sign — needs the embedded family, and that is a fetch the
// first time. A document that needs nothing of the sort never waits and never fetches.

import { documentToHtml, fileNameFor } from './html-file.js';
import { invoiceToPdf, invoiceNeedsEmbeddedFont } from './pdf/invoice.js';
import { loadEmbeddedFonts } from './pdf/font-loader.js';
import { einvoiceXml, facturXPdf, EINVOICE_FORMATS } from '../einvoice/index.js';

/** Swap a filename's extension. */
const named = (draft, ext) => fileNameFor(draft).replace(/\.html$/, ext);

/**
 * Trigger a download.
 *
 * A Blob and an object URL rather than a data: URI — a long data: URI is refused outright by some
 * browsers and truncated by others. The URL is revoked afterwards so the blob does not sit in
 * memory for the life of the tab.
 */
function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { fileName, bytes: blob.size };
}

/**
 * Does this document want the embedded family?
 *
 * Yes when a setting insists (a business that wants every PDF to embed, or an archival format
 * that requires it), and otherwise only when the standard fonts would lose a character. The
 * common case — a Latin-1 document — answers no without loading anything.
 */
export function wantsEmbeddedFonts(draft, settings = {}, opts = {}) {
  if (opts.embed || settings.pdfFont === 'embed') return true;
  return invoiceNeedsEmbeddedFont(draft, settings, opts);
}

/**
 * The PDF bytes, with the right family.
 *
 * A failed font load falls back to the standard fonts rather than to no file: the document then
 * carries transliterations ("Rs." for ₹, a question mark for a letter outside Latin-1), which is
 * a worse document than the one intended and a far better one than none.
 */
export async function pdfBytesFor(draft, settings = {}, opts = {}) {
  let fonts = null;
  if (wantsEmbeddedFonts(draft, settings, opts)) {
    try { fonts = await loadEmbeddedFonts(); } catch (e) { console.warn('[Invoice Studio] embedded fonts unavailable, using the standard fonts', e); }
  }
  return invoiceToPdf(draft, settings, { ...opts, fonts });
}

export async function downloadPdf(draft, settings = {}, opts = {}) {
  const bytes = await pdfBytesFor(draft, settings, opts);
  return saveBlob(new Blob([bytes], { type: 'application/pdf' }), named(draft, '.pdf'));
}

/**
 * The e-invoice bytes: a Factur-X PDF (fonts always embedded — PDF/A requires it), or XML.
 *
 * Returns `{ bytes, fileName, contentType }`. The XML travels as UTF-8 text, the PDF as bytes.
 */
export async function einvoiceFile(draft, settings = {}, format = 'facturx') {
  const spec = EINVOICE_FORMATS.find((f) => f.id === format) || EINVOICE_FORMATS[0];
  if (spec.id === 'facturx') {
    const fonts = await loadEmbeddedFonts();
    return { bytes: facturXPdf(draft, settings, { fonts }), fileName: named(draft, '.pdf'), contentType: spec.contentType, text: null };
  }
  const xml = einvoiceXml(draft, settings, spec.id);
  return { bytes: new TextEncoder().encode(xml), fileName: named(draft, '.xml'), contentType: spec.contentType, text: xml };
}

export async function downloadEInvoice(draft, settings = {}, format = 'facturx') {
  const f = await einvoiceFile(draft, settings, format);
  return saveBlob(new Blob([f.bytes], { type: f.contentType }), f.fileName);
}

export function downloadHtml(draft, settings = {}) {
  const html = documentToHtml(draft, settings);
  return saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), named(draft, '.html'));
}

/** Bytes as base64, in chunks — a big apply() on one array blows the argument limit. */
export function toBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * The document as an attachment for something else to send.
 *
 * PDF is binary, so it travels base64 — and the payload says so, rather than leaving whatever is on
 * the far end to guess and double-encode it. `encoding` is part of the contract the recipes read.
 */
export async function attachmentFor(draft, settings = {}, format = 'pdf') {
  if (format === 'facturx' || format === 'ubl' || format === 'cii') {
    const f = await einvoiceFile(draft, settings, format);
    return f.text != null
      ? { fileName: f.fileName, contentType: f.contentType, encoding: 'utf8', content: f.text }
      : { fileName: f.fileName, contentType: f.contentType, encoding: 'base64', content: toBase64(f.bytes) };
  }
  if (format === 'html') {
    return {
      fileName: named(draft, '.html'),
      contentType: 'text/html',
      encoding: 'utf8',
      content: documentToHtml(draft, settings),
    };
  }
  return {
    fileName: named(draft, '.pdf'),
    contentType: 'application/pdf',
    encoding: 'base64',
    content: toBase64(await pdfBytesFor(draft, settings)),
  };
}
