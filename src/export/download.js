// Handing a document to the person as a file.
//
// Two formats, and they are for different things rather than one being better:
//
//   PDF   what a client expects to receive, what an accounts department files, and what prints the
//         same everywhere. This is the default.
//   HTML  one file that opens in any browser with no reader at all, and that can be read by a
//         script on the far end of a webhook without a PDF library. Kept because it is genuinely
//         more useful in an automation than a PDF is.

import { documentToHtml, fileNameFor } from './html-file.js';
import { invoiceToPdf } from './pdf/invoice.js';

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

export function downloadPdf(draft, settings = {}, opts = {}) {
  const bytes = invoiceToPdf(draft, settings, opts);
  return saveBlob(new Blob([bytes], { type: 'application/pdf' }), named(draft, '.pdf'));
}

export function downloadHtml(draft, settings = {}) {
  const html = documentToHtml(draft, settings);
  return saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), named(draft, '.html'));
}

/** Bytes as base64, in chunks — a big apply() on one array blows the argument limit. */
function toBase64(bytes) {
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
export function attachmentFor(draft, settings = {}, format = 'pdf') {
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
    content: toBase64(invoiceToPdf(draft, settings)),
  };
}
