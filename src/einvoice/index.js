// The electronic invoice, in the three forms a receiver might ask for.
//
//   UBL XML        Peppol, XRechnung (UBL), the Nordics, Belgium, the Netherlands
//   CII XML        XRechnung (CII), and the inside of every Factur-X
//   Factur-X PDF   a PDF/A-3 with the CII inside: what a person reads and a machine reads, one
//                  file. Also known as ZUGFeRD. This is what most small businesses will send.
//
// One model feeds all three (./model.js), and the compliance check (./check.js) reads that same
// model, so what it checks is exactly what is written.

import { einvoiceModel, profileOf, PROFILES } from './model.js';
import { toUbl } from './ubl.js';
import { toCii } from './cii.js';
import { checkEInvoice } from './check.js';
import { layoutInvoice } from '../export/pdf/invoice.js';
import { pdfaPlugin } from '../export/pdf/pdfa.js';

export { PROFILES, profileOf, einvoiceModel, checkEInvoice, toUbl, toCii };

/** The XML in the syntax asked for. */
export function einvoiceXml(draft, settings = {}, syntax = 'cii') {
  const model = einvoiceModel(draft, settings);
  return syntax === 'ubl' ? toUbl(model) : toCii(model);
}

/** The document as Factur-X: the PDF laid out as usual, as PDF/A-3, with the CII embedded. */
export function facturXPdf(draft, settings = {}, opts = {}) {
  if (!opts.fonts) throw new Error('A Factur-X PDF must embed its fonts; pass the embedded family.');
  const model = einvoiceModel(draft, settings);
  const xml = new TextEncoder().encode(toCii(model));
  const pdf = layoutInvoice(draft, settings, opts);
  pdf.plugins.push(pdfaPlugin({
    attachment: {
      bytes: xml,
      fileName: 'factur-x.xml',
      description: 'Factur-X / ZUGFeRD invoice (EN 16931)',
      documentType: model.kind === 'credit_note' ? 'CREDITNOTE' : 'INVOICE',
      conformance: model.profile.facturx,
    },
  }));
  return pdf.bytes();
}

/** A plain PDF/A-3 — archival, fonts embedded, nothing inside. */
export function archivalPdf(draft, settings = {}, opts = {}) {
  if (!opts.fonts) throw new Error('A PDF/A must embed its fonts; pass the embedded family.');
  const pdf = layoutInvoice(draft, settings, opts);
  pdf.plugins.push(pdfaPlugin({ attachment: null }));
  return pdf.bytes();
}

/** Which of the attachable formats are e-invoices, and what each is called. */
export const EINVOICE_FORMATS = [
  { id: 'facturx', label: 'Factur-X / ZUGFeRD — PDF with the invoice inside', ext: '.pdf', contentType: 'application/pdf' },
  { id: 'ubl', label: 'XML — UBL 2.1 (Peppol, XRechnung)', ext: '.xml', contentType: 'application/xml' },
  { id: 'cii', label: 'XML — UN/CEFACT CII (XRechnung, Factur-X)', ext: '.xml', contentType: 'application/xml' },
];

export const isEInvoiceFormat = (id) => EINVOICE_FORMATS.some((f) => f.id === id);
