// Laying an invoice onto pages.
//
// Reads the SAME description of the document that the HTML renderer reads — doc/kinds.js for what
// kind of document this is, doc/fields.js for which parts appear and which columns the table has.
// That is what stops the PDF and the screen drifting apart: a delivery note has no price column
// here for exactly the reason it has none there, decided once, in one file.
//
// Everything is measured rather than guessed. Column positions come from the widths in ./fonts.js,
// text wraps to the space it actually has, and a long invoice breaks onto a second page at a row
// boundary rather than through the middle of one.

import { PdfWriter, rgb } from './writer.js';
import { measure, wrap } from './fonts.js';
import { formatMoney } from '../../money/currency.js';
import { documentKind } from '../../doc/kinds.js';
import { fieldsFor, lineColumns } from '../../doc/fields.js';
import { docDate } from '../../doc/render.js';

const INK = '#16212c';
const MUTED = '#5f7285';
const RULE = '#dfe5ec';

const BASE = { label: 7.5, body: 9.5, small: 8.5, name: 11, big: 16, total: 15, number: 13 };

/** How tightly the document is set. Scales the type and the leading together, so it stays in tune. */
const DENSITY = { compact: 0.9, normal: 1, roomy: 1.12 };

/** Type sizes for a given density and paper. A till roll is set smaller because it is 72mm wide. */
function sizesFor(density, narrow) {
  const k = (DENSITY[density] || 1) * (narrow ? 0.82 : 1);
  const out = {};
  for (const [key, value] of Object.entries(BASE)) out[key] = Math.round(value * k * 10) / 10;
  return out;
}

/** How much room a numeric column needs: its widest possible content, plus breathing space. */
function columnWidth(col, rows, S, gap) {
  if (!col.numeric) return 0;
  let widest = measure(col.label, S.label, true);
  for (const r of rows) widest = Math.max(widest, measure(r[col.id] || '', S.body, false));
  return Math.ceil(widest) + gap;
}

/** Every cell as the string it will print as, so widths are measured on the truth. */
function cellText(line, col, money) {
  switch (col.id) {
    case 'description': return String(line.description || '');
    case 'hsn': return String(line.hsn || '—');
    case 'quantity': return String(line.quantity ?? '');
    case 'unit': return String(line.unit || '');
    case 'unitPrice': return money(line.unitPrice);
    case 'discount': return line.discountAmount ? '-' + money(line.discountAmount) : '';
    case 'amount': return money(line.amount);
    case 'date': return docDate(line.date);
    case 'reference': return String(line.reference || '');
    case 'charge': return line.charge != null ? money(line.charge) : '';
    case 'paid': return line.paid != null ? money(line.paid) : '';
    case 'balance': return line.balance != null ? money(line.balance) : '';
    default: return '';
  }
}

const addressLines = (p) => [
  p.street1, p.street2,
  [p.city, p.state, p.postcode].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
  p.country,
].map((x) => String(x || '').trim()).filter(Boolean);

/**
 * Build the PDF.
 *
 * Returns a Uint8Array. Nothing here touches the DOM, so it also runs under Node — which is what
 * makes the output testable rather than only lookable-at.
 */
export function invoiceToPdf(draft, settings = {}, opts = {}) {
  const kind = documentKind(draft.kind);
  const fields = fieldsFor(draft, settings);
  const cols = lineColumns(fields);
  const t = draft.totals || {};
  const sender = draft.sender || {};
  const client = draft.client || {};
  const fmtMoney = draft.format || { currency: draft.currency };
  const money = (v) => formatMoney(v, fmtMoney);
  const accent = settings.accent || '#14509b';

  const pdf = new PdfWriter({
    size: opts.size || settings.paperSize || 'a4',
    title: [kind.word, draft.number].filter(Boolean).join(' '),
    author: sender.name || '',
  });

  const narrow = pdf.narrow;
  const S = sizesFor(opts.density || settings.density, narrow);
  const lead = Math.round(S.body * 1.16 * 10) / 10;   // line spacing, tied to the type size

  const M = pdf.margin;
  const right = pdf.width - M;
  const bottom = pdf.height - M;
  let y = M;

  // ---- masthead ----------------------------------------------------------------------------
  // A till roll has one column and no right-hand side, so the masthead centres and stacks rather
  // than splitting. Everything below follows the same rule.
  if (narrow) {
    const mid = pdf.width / 2;
    pdf.text(mid, y, sender.name || 'Your business', { size: S.name, bold: true, color: INK, align: 'center' });
    y += lead + 2;
    pdf.text(mid, y, kind.word.toUpperCase(), { size: S.label, bold: true, color: INK, align: 'center' });
    y += lead;
    pdf.text(mid, y, draft.number || '—', { size: S.body, color: INK, align: 'center' });
    y += lead + 4;
    pdf.line(M, y, right, y, { color: INK, width: 0.6 });
    y += lead;
  } else {
    pdf.text(M, y, sender.name || 'Your business', { size: S.big, bold: true, color: INK });
    if (sender.website) pdf.text(M, y + 20, sender.website, { size: S.small, color: MUTED });

    pdf.text(right, y, kind.word.toUpperCase(), { size: S.label, bold: true, color: accent, align: 'right' });
    pdf.text(right, y + 11, draft.number || '—', { size: S.number, color: INK, align: 'right' });
    if (draft.status) {
      pdf.text(right, y + 28, draft.status.toUpperCase(), { size: S.label, bold: true, color: MUTED, align: 'right' });
    }

    y += 44;
    pdf.line(M, y, right, y, { color: accent, width: 1.6 });
    y += 20;
  }

  // ---- parties -----------------------------------------------------------------------------
  if (narrow) {
    // A receipt does not carry a From-and-Bill-to spread. It says who the client is if it knows,
    // the date, and nothing else — anyone holding one is standing in front of the business already.
    if (client.name) {
      pdf.text(M, y, client.name, { size: S.body, bold: true, color: INK });
      y += lead;
    }
    pdf.text(M, y, `${kind.dateLabels.issued}: ${docDate(draft.issued)}`, { size: S.small, color: MUTED });
    y += lead + 4;
  } else {
    layoutParties();
  }

  function layoutParties() {
  const colW = (right - M) / 3 - 10;
  const partyTop = y;

  const party = (x, label, name, lines, meta) => {
    let ly = partyTop;
    pdf.text(x, ly, label.toUpperCase(), { size: S.label, bold: true, color: MUTED });
    ly += 12;
    pdf.text(x, ly, name || '—', { size: S.name, bold: true, color: INK });
    ly += 13;
    for (const l of lines) { pdf.text(x, ly, l, { size: S.body, color: INK }); ly += lead; }
    for (const l of (meta || []).filter(Boolean)) { pdf.text(x, ly, l, { size: S.small, color: MUTED }); ly += 10; }
    return ly;
  };

  const leftEnd = party(M, 'From', sender.name, addressLines(sender), [
    sender.email, sender.phone,
    fields.showSenderTaxNumber ? `${settings.taxNumberLabel || 'Tax ID'}: ${sender.taxNumber}` : '',
  ]);
  const midEnd = party(M + colW + 10, kind.showsMoney ? 'Bill to' : 'Deliver to', client.name, addressLines(client), [
    client.email, client.phone,
    fields.showClientTaxNumber ? `${settings.taxNumberLabel || 'Tax ID'}: ${client.taxNumber}` : '',
  ]);

  // The meta column is right-aligned against the page edge, which is where a reader's eye goes for
  // the amount due.
  let my = partyTop;
  const meta = (label, value, big) => {
    pdf.text(right, my, label.toUpperCase(), { size: S.label, bold: true, color: MUTED, align: 'right' });
    my += big ? lead + 2 : lead;
    pdf.text(right, my, value, { size: big ? S.total : S.body, bold: !!big, color: big ? accent : INK, align: 'right' });
    my += big ? 20 : 13;
  };
  meta(kind.dateLabels.issued, docDate(draft.issued));
  if (fields.showSecondDate) meta(kind.dateLabels.second, docDate(draft.due));
  if (fields.showReference) meta(settings.referenceLabel || 'Your reference', draft.reference);
  if (fields.showTotals) meta(kind.totalLabel, money(fields.showPaid ? t.balance : t.total), true);

  y = Math.max(leftEnd, midEnd, my) + 16;
  }

  // ---- the lines table ------------------------------------------------------------------------
  const rows = (draft.lines || []).map((line) => {
    const cells = {};
    for (const c of cols) cells[c.id] = cellText(line, c, money);
    return cells;
  });

  // Numeric columns take what they need; the description gets whatever is left. Sizing the other
  // way round is how a total ends up wrapping onto two lines.
  const fixed = cols.filter((c) => c.id !== 'description');
  const widths = {};
  let used = 0;
  for (const c of fixed) { widths[c.id] = columnWidth(c, rows, S, narrow ? 6 : 14) || 70; used += widths[c.id]; }
  widths.description = Math.max(narrow ? 60 : 120, (right - M) - used);

  const xOf = {};
  let cx = M;
  for (const c of cols) { xOf[c.id] = cx; cx += widths[c.id]; }

  const header = () => {
    for (const c of cols) {
      const x = c.numeric ? xOf[c.id] + widths[c.id] - 4 : xOf[c.id];
      pdf.text(x, y, c.label.toUpperCase(), { size: S.label, bold: true, color: MUTED, align: c.numeric ? 'right' : 'left' });
    }
    y += lead;
    pdf.line(M, y, right, y, { color: RULE, width: 0.6 });
    y += 7;
  };
  header();

  for (const cells of rows) {
    const descLines = wrap(cells.description, widths.description - 8, S.body);
    const rowHeight = Math.max(descLines.length * lead, lead) + 8;

    // Break at a row boundary, never through one, and repeat the header so the second page is
    // readable on its own.
    if (y + rowHeight > bottom - 40) {
      pdf.addPage();
      y = M;
      pdf.text(M, y, `${kind.word} ${draft.number} — continued`, { size: S.small, color: MUTED });
      y += 18;
      header();
    }

    descLines.forEach((l, i) => pdf.text(xOf.description, y + i * lead, l, { size: S.body, color: INK }));
    for (const c of cols) {
      if (c.id === 'description') continue;
      const x = c.numeric ? xOf[c.id] + widths[c.id] - 4 : xOf[c.id];
      pdf.text(x, y, cells[c.id], { size: S.body, color: INK, align: c.numeric ? 'right' : 'left' });
    }
    y += rowHeight;
    pdf.line(M, y - 4, right, y - 4, { color: RULE, width: 0.4 });
  }

  // ---- totals -----------------------------------------------------------------------------------
  if (fields.showTotals) {
    y += 10;
    if (y > bottom - 120) { pdf.addPage(); y = M; }
    const labelX = narrow ? M : right - 150;
    const row = (label, value, big) => {
      pdf.text(labelX, y, label, { size: big ? 11 : S.body, bold: !!big, color: big ? INK : MUTED });
      pdf.text(right, y, value, { size: big ? 11 : S.body, bold: !!big, color: INK, align: 'right' });
      y += big ? lead + 4 : lead + 1;
    };
    row('Subtotal', money(t.subtotal));
    if (t.discountTotal) row(t.discounts?.[0]?.label || 'Discount', '-' + money(t.discountTotal));
    if (t.shipping?.amount) row(t.shipping.label || 'Shipping', money(t.shipping.amount));
    if (fields.showTax) {
      for (const l of t.taxLines || []) {
        row(l.rate != null ? `${l.name} ${Number(l.rate)}%` : l.name, money(l.amount));
      }
    }
    if (t.exempt) {
      for (const l of wrap(t.exempt.reason, 150, S.small)) {
        pdf.text(right, y, l, { size: S.small, italic: true, color: MUTED, align: 'right' });
        y += 10;
      }
    }
    pdf.line(labelX, y, right, y, { color: RULE, width: 0.6 });
    y += 6;
    row(kind.id === 'credit_note' ? 'Total credit' : 'Total', money(t.total), true);
    if (fields.showPaid) {
      row('Paid', '-' + money(t.amountPaid));
      row(kind.totalLabel, money(t.balance), true);
    }
  }

  // ---- the standing wording ----------------------------------------------------------------------
  y += 14;
  const block = (label, body, italic) => {
    const lines = wrap(body, right - M, italic ? S.small : S.body, false);
    const needed = lines.length * lead + (label ? 14 : 0) + 10;
    if (y + needed > bottom) { pdf.addPage(); y = M; }
    if (label) { pdf.text(M, y, label.toUpperCase(), { size: S.label, bold: true, color: MUTED }); y += 12; }
    for (const l of lines) { pdf.text(M, y, l, { size: italic ? S.small : S.body, italic, color: italic ? MUTED : INK }); y += lead; }
    y += 8;
  };

  if (fields.legend) block('', fields.legend, true);
  if (fields.showNote) block('Note', draft.note);
  if (fields.showTerms) block('Payment terms', draft.terms);
  if (fields.showPaymentDetails) block(settings.paymentDetailsLabel || 'How to pay', settings.paymentDetails);
  if (settings.closingText) block('', settings.closingText, true);

  // ---- page numbers --------------------------------------------------------------------------------
  // Added last, once the total is known — a footer saying "page 1 of 1" on a document that turned
  // out to have two pages is the sort of small wrongness that makes a reader distrust the rest.
  if (pdf.pageCount > 1) {
    pdf.pages.forEach((ops, i) => {
      const saved = pdf.ops;
      pdf.ops = ops;
      pdf.text(pdf.width / 2, pdf.height - 28, `Page ${i + 1} of ${pdf.pageCount}`, {
        size: S.small, color: MUTED, align: 'center',
      });
      pdf.ops = saved;
    });
  }

  return pdf.bytes();
}
