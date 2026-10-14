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

import { PdfWriter, MM } from './writer.js';
import { formatMoney } from '../../money/currency.js';
import { fieldsFor, lineColumns, totalLabels } from '../../doc/fields.js';
import { docDate, taxLabel } from '../../doc/render.js';
import { labelOr, localiseStatus, fillLabel } from '../../doc/lang.js';
import { paymentCode, accountLines } from '../../doc/payment.js';
import { isDin, DIN, DIN_FORMS, returnLine } from '../../doc/layouts.js';
import { addressLines } from '../../doc/address.js';

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

/**
 * How much room a numeric column needs: its widest possible content, plus breathing space. The
 * running-number column is measured the same way, so "1" to "12" get a column as wide as "12".
 */
function columnWidth(pdf, col, rows, S, gap) {
  if (!col.numeric && col.id !== 'position') return 0;
  let widest = pdf.measure(col.label, S.label, true);
  for (const r of rows) widest = Math.max(widest, pdf.measure(r[col.id] || '', S.body, false));
  return Math.ceil(widest) + gap;
}

/** Every cell as the string it will print as, so widths are measured on the truth. */
function cellText(line, col, money, lang, index = 0) {
  switch (col.id) {
    case 'position': return String(index + 1);
    case 'description': return String(line.description || '');
    case 'hsn': return String(line.hsn || '—');
    case 'quantity': return String(line.quantity ?? '');
    case 'unit': return String(line.unit || '');
    case 'unitPrice': return money(line.unitPrice);
    case 'discount': return line.discountAmount ? '-' + money(line.discountAmount) : '';
    case 'amount': return money(line.amount);
    case 'date': return docDate(line.date, lang);
    case 'reference': return String(line.reference || '');
    case 'charge': return line.charge != null ? money(line.charge) : '';
    case 'paid': return line.paid != null ? money(line.paid) : '';
    case 'balance': return line.balance != null ? money(line.balance) : '';
    default: return '';
  }
}

// The address lines come from doc/address.js, which knows which countries write the postcode
// before the town — the same function the screen and the email use.

/**
 * The JPEG bytes inside a data URI, or null.
 *
 * Strict on shape because the writer splices these bytes straight into an object stream. A PNG
 * comes back null rather than being forced through: the settings keep a JPEG copy of every
 * uploaded logo precisely so this never has to transcode.
 */
function jpegBytes(dataUri) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUri || ''));
  if (!m) return null;
  try {
    const bin = atob(m[1]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

/**
 * Build the PDF.
 *
 * Returns a Uint8Array. Nothing here touches the DOM, so it also runs under Node — which is what
 * makes the output testable rather than only lookable-at.
 *
 * `opts.fonts` is an embedded family (see ./embedded.js). Without one the standard fonts are used,
 * which draw Latin-1 and transliterate the rest; with one, every character the family has is drawn
 * as itself. Which to pass is the caller's call — `invoiceNeedsEmbeddedFont` below answers it.
 */
export function invoiceToPdf(draft, settings = {}, opts = {}) {
  return layoutInvoice(draft, settings, opts).bytes();
}

/**
 * Would the standard fonts lose a character of this document?
 *
 * Lays the document out against the standard family and asks the writer whether anything it drew
 * fell outside WinAnsi. Cheap — a layout is a few milliseconds — and exact, because it sees the
 * same strings the real render will: the labels, the money with its currency sign, every line.
 */
export function invoiceNeedsEmbeddedFont(draft, settings = {}, opts = {}) {
  return layoutInvoice(draft, settings, { ...opts, fonts: null }).needsEmbedding;
}

/** The whole layout, onto a fresh writer, which is returned rather than serialised. */
export function layoutInvoice(draft, settings = {}, opts = {}) {
  const fields = fieldsFor(draft, settings);
  const { kind, L, lang } = fields;
  const cols = lineColumns(fields);
  const TL = totalLabels(fields, draft.totals);
  const t = draft.totals || {};
  const sender = draft.sender || {};
  const client = draft.client || {};
  const fmtMoney = draft.format || { currency: draft.currency };
  const money = (v) => formatMoney(v, fmtMoney);
  const date = (v) => docDate(v, lang);
  const taxIdLabel = labelOr(settings.taxNumberLabel, 'Tax ID', L.taxId);
  const accent = settings.accent || '#14509b';

  const pdf = new PdfWriter({
    size: opts.size || settings.paperSize || 'a4',
    title: [kind.word, draft.number].filter(Boolean).join(' '),
    author: sender.name || '',
    fonts: opts.fonts || null,
  });

  const narrow = pdf.narrow;
  const S = sizesFor(opts.density || settings.density, narrow);
  const lead = Math.round(S.body * 1.16 * 10) / 10;   // line spacing, tied to the type size

  // The ledger layout (doc/layouts.js): the client in the window, the mark opposite, a grid of
  // dates and numbers, the word as a heading, and the sender in a three-column foot on every
  // page. The DIN 5008 sheets put the client in the window and the sender in the foot the same
  // way, at the standard's own positions, and keep the letter's margins — 25mm on the left,
  // 20mm on the right — rather than the paper's. A till roll has no room for any of that and
  // keeps its own single column.
  const ledger = draft.layout === 'ledger' && !narrow;
  const din = !narrow && isDin(draft.layout) ? DIN_FORMS[draft.layout] : null;
  const windowed = ledger || !!din;
  const address = (p) => addressLines(p, lang);

  const M = din ? DIN.textLeft * MM : pdf.margin;
  const right = din ? pdf.width - DIN.textRight * MM : pdf.width - M;
  let y = M;
  const clientLabel = kind.showsMoney ? L.billTo : L.deliverTo;
  const clientMeta = [
    client.email, client.phone,
    fields.showClientTaxNumber ? `${taxIdLabel}: ${client.taxNumber}` : '',
  ].filter(Boolean);
  const shipTo = draft.shipTo && draft.shipTo.name && draft.shipTo.name !== client.name ? draft.shipTo : null;

  // The foot's three columns, worked out first because the body has to stop above them. Each
  // line is wrapped to its column here, so a long registration sentence makes the foot taller
  // rather than being cut at the column's edge.
  const colophonLine = 10;
  const colophonColW = (right - M) / 3;
  const wrapCol = (items) => items.flatMap((l) =>
    pdf.wrap(l.text, colophonColW - 16, S.small, l.bold).map((text) => ({ text, bold: l.bold })));
  const colophon = windowed ? [
    wrapCol([{ text: sender.name || 'Your business', bold: true }, ...address(sender).map((text) => ({ text }))]),
    wrapCol([
      String(sender.taxNumber || '').trim() ? { text: `${taxIdLabel}: ${sender.taxNumber}` } : null,
      ...String(sender.legalText || '').split(/\n+/).map((s) => s.trim()).filter(Boolean).map((text) => ({ text })),
    ].filter(Boolean)),
    wrapCol([sender.email, sender.phone, sender.website].filter(Boolean).map((text) => ({ text }))),
  ] : null;
  const colophonH = colophon ? Math.max(...colophon.map((c) => c.length)) * colophonLine + 6 : 0;
  const bottom = pdf.height - M - (windowed ? colophonH + 14 : 0);

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
  } else if (ledger) {
    // The window: who this is for, where an envelope shows it.
    const windowEnd = drawParty(M, y, clientLabel, client.name, address(client), clientMeta);

    // The mark alone opposite the window when there is one — the foot says the name — and the
    // name as a wordmark when there is not, so the corner is never empty.
    let ry = y;
    const logo = pdf.addImage(jpegBytes(sender.logoJpeg || sender.logoData));
    const cap = { small: 22, normal: 30, large: 44 }[settings.logoSize] || 30;
    if (logo) {
      const h = Math.min(cap, (140 * cap / 30) * (logo.height / logo.width));
      const w = h * (logo.width / logo.height);
      pdf.drawImage(logo, right - w, y - 2, w, h);
      ry = y + h + 6;
    } else {
      pdf.text(right, ry, sender.name || 'Your business', { size: S.name, bold: true, color: INK, align: 'right' });
      ry += lead + 1;
    }
    y = Math.max(windowEnd, ry) + 12;

    // The grid: the number first, then what the meta column would have said, four to a row,
    // ruled above and below.
    const cells = [
      { label: L.number || 'Number', value: draft.number || '—' },
      { label: kind.dateLabels.issued, value: date(draft.issued) },
      fields.showSecondDate ? { label: kind.dateLabels.second, value: date(draft.due) } : null,
      fields.showServiceDate ? { label: L.serviceDate, value: date(draft.serviceDate) } : null,
      fields.showReference ? { label: labelOr(settings.referenceLabel, 'Your reference', L.yourReference), value: draft.reference } : null,
      fields.showRelated ? { label: L.refersTo, value: draft.relatedTo } : null,
      fields.showTotals ? { label: kind.totalLabel, value: money(fields.showPaid ? t.balance : t.total), big: true } : null,
    ].filter(Boolean);
    const perRow = 4;
    const cw = (right - M) / perRow;
    pdf.line(M, y, right, y, { color: RULE, width: 0.6 });
    y += 10;
    for (let i = 0; i < cells.length; i += perRow) {
      cells.slice(i, i + perRow).forEach((c, j) => {
        const x = M + j * cw;
        pdf.text(x, y, c.label.toUpperCase(), { size: S.label, bold: true, color: MUTED });
        pdf.text(x, y + 11, c.value, { size: c.big ? S.number : S.body, bold: !!c.big, color: INK });
      });
      y += 11 + lead + 8;
    }
    pdf.line(M, y - 2, right, y - 2, { color: RULE, width: 0.6 });
    y += 16;

    // The heading, with the status opposite it.
    pdf.text(M, y, kind.word, { size: S.big, bold: true, color: INK });
    if (draft.status) {
      pdf.text(right, y + 4, localiseStatus(draft.status, lang).toUpperCase(), { size: S.label, bold: true, color: MUTED, align: 'right' });
    }
    y += S.big + 14;
  } else if (din) {
    // The DIN 5008 sheet. Every position is the standard's, in millimetres from the paper's
    // edges — DIN in doc/layouts.js — so the folded sheet shows the address, and only the
    // address, through a DIN lang window envelope.
    const mm = MM;
    const pitch = DIN.line * mm;   // the standard's line: 12pt

    // The letterhead: name and website ranged right, the mark at the far right of them, never
    // taller than the room above the address field — Form A leaves 27mm in all.
    const logo = pdf.addImage(jpegBytes(sender.logoJpeg || sender.logoData));
    const cap = { small: 22, normal: 30, large: 44 }[settings.logoSize] || 30;
    const headTop = 10 * mm;
    let nameRight = right;
    if (logo) {
      const room = (din.addrTop - 13) * mm;
      const h = Math.min(cap, room, (140 * cap / 30) * (logo.height / logo.width));
      const w = h * (logo.width / logo.height);
      pdf.drawImage(logo, right - w, headTop, w, h);
      nameRight = right - w - 10;
    }
    if (!(logo && settings.logoOnly)) {
      pdf.text(nameRight, headTop, sender.name || 'Your business', { size: S.big, bold: true, color: INK, align: 'right' });
      if (sender.website) pdf.text(nameRight, headTop + S.big + 4, sender.website, { size: S.small, color: MUTED, align: 'right' });
    }

    // The address field: the return line in its 5mm zone with a rule under it, three blank
    // lines for remarks, then the postal address — and nothing but the postal address, because
    // that is what the window shows and what the sorting machine reads.
    const ax = DIN.addrLeft * mm;
    const ay = din.addrTop * mm;
    const ret = returnLine(sender, lang);
    if (ret) {
      pdf.text(ax, ay + 1.2 * mm, ret, { size: 6.5, color: MUTED });
      pdf.line(ax, ay + DIN.returnZone * mm, ax + DIN.addrWidth * mm, ay + DIN.returnZone * mm, { color: RULE, width: 0.4 });
    }
    let ly = ay + (DIN.returnZone + DIN.remarkZone) * mm;
    pdf.text(ax, ly, client.name || '—', { size: S.body, bold: true, color: INK });
    ly += pitch;
    for (const l of address(client)) { pdf.text(ax, ly, l, { size: S.body, color: INK }); ly += pitch; }

    // The information block: one line each, label on the left, value against the right margin.
    const ix = DIN.infoLeft * mm;
    let iy = din.infoTop * mm;
    const block = [
      { label: L.number || 'Number', value: draft.number || '—' },
      { label: kind.dateLabels.issued, value: date(draft.issued) },
      fields.showSecondDate ? { label: kind.dateLabels.second, value: date(draft.due) } : null,
      fields.showServiceDate ? { label: L.serviceDate, value: date(draft.serviceDate) } : null,
      fields.showReference ? { label: labelOr(settings.referenceLabel, 'Your reference', L.yourReference), value: draft.reference } : null,
      fields.showRelated ? { label: L.refersTo, value: draft.relatedTo } : null,
      fields.showClientTaxNumber ? { label: taxIdLabel, value: client.taxNumber } : null,
    ].filter(Boolean);
    for (const r of block) {
      pdf.text(ix, iy, r.label, { size: S.small, color: MUTED });
      pdf.text(right, iy, r.value, { size: S.body, color: INK, align: 'right' });
      iy += pitch;
    }

    // The subject, two lines below the field — or lower, if the address or the block ran long.
    y = Math.max((din.addrTop + DIN.addrHeight + DIN.subjectGap) * mm, ly + pitch, iy + pitch);
    pdf.text(M, y, `${kind.word} ${draft.number || ''}`.trim(), { size: S.name, bold: true, color: INK });
    if (draft.status) {
      pdf.text(right, y + 2, localiseStatus(draft.status, lang).toUpperCase(), { size: S.label, bold: true, color: MUTED, align: 'right' });
    }
    y += 3 * pitch;   // the subject line and the two blank lines the standard puts after it

    // Fold and punch marks on the first page: short hairlines in from the left edge.
    for (const f of din.fold) pdf.line(0, f * mm, DIN.foldLength * mm, f * mm, { color: MUTED, width: 0.4 });
    pdf.line(0, din.punch * mm, DIN.punchLength * mm, din.punch * mm, { color: MUTED, width: 0.4 });
  } else {
    // The logo sits left of the name, the way the screen's masthead has it. Height leads and width
    // follows the image's own aspect, capped so a wide wordmark cannot run into the title block.
    let nameX = M;
    const logo = pdf.addImage(jpegBytes(sender.logoJpeg || sender.logoData));
    // The same three sizes the screen offers; width follows the aspect and is capped in proportion.
    const cap = { small: 22, normal: 30, large: 44 }[settings.logoSize] || 30;
    if (logo) {
      const h = Math.min(cap, (140 * cap / 30) * (logo.height / logo.width));
      const w = h * (logo.width / logo.height);
      pdf.drawImage(logo, M, y - 2, w, h);
      nameX = M + w + 12;
    }
    // The mark can carry the name: then the masthead prints no words beside it.
    if (!(logo && settings.logoOnly)) {
      pdf.text(nameX, y, sender.name || 'Your business', { size: S.big, bold: true, color: INK });
      if (sender.website) pdf.text(nameX, y + 20, sender.website, { size: S.small, color: MUTED });
    }

    pdf.text(right, y, kind.word.toUpperCase(), { size: S.label, bold: true, color: accent, align: 'right' });
    pdf.text(right, y + 11, draft.number || '—', { size: S.number, color: INK, align: 'right' });
    if (draft.status) {
      pdf.text(right, y + 28, localiseStatus(draft.status, lang).toUpperCase(), { size: S.label, bold: true, color: MUTED, align: 'right' });
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
    pdf.text(M, y, `${kind.dateLabels.issued}: ${date(draft.issued)}`, { size: S.small, color: MUTED });
    y += lead + 4;
  } else if (!windowed) {
    layoutParties();
  }

  /** One party as a stacked block from `top`: label, name, address, then the small print. Returns where it ends. */
  function drawParty(x, top, label, name, lines, meta) {
    let ly = top;
    pdf.text(x, ly, label.toUpperCase(), { size: S.label, bold: true, color: MUTED });
    ly += 12;
    pdf.text(x, ly, name || '—', { size: S.name, bold: true, color: INK });
    ly += 13;
    for (const l of lines) { pdf.text(x, ly, l, { size: S.body, color: INK }); ly += lead; }
    for (const l of (meta || []).filter(Boolean)) { pdf.text(x, ly, l, { size: S.small, color: MUTED }); ly += 10; }
    return ly;
  }

  function layoutParties() {
  const colW = (right - M) / 3 - 10;
  const partyTop = y;
  const party = (x, label, name, lines, meta) => drawParty(x, partyTop, label, name, lines, meta);

  const leftEnd = party(M, L.from, sender.name, address(sender), [
    sender.email, sender.phone,
    fields.showSenderTaxNumber ? `${taxIdLabel}: ${sender.taxNumber}` : '',
  ]);
  const midEnd = party(M + colW + 10, clientLabel, client.name, address(client), clientMeta);

  // The meta column is right-aligned against the page edge, which is where a reader's eye goes for
  // the amount due.
  let my = partyTop;
  const meta = (label, value, big) => {
    pdf.text(right, my, label.toUpperCase(), { size: S.label, bold: true, color: MUTED, align: 'right' });
    my += big ? lead + 2 : lead;
    pdf.text(right, my, value, { size: big ? S.total : S.body, bold: !!big, color: big ? accent : INK, align: 'right' });
    my += big ? 20 : 13;
  };
  meta(kind.dateLabels.issued, date(draft.issued));
  if (fields.showSecondDate) meta(kind.dateLabels.second, date(draft.due));
  if (fields.showServiceDate) meta(L.serviceDate, date(draft.serviceDate));
  if (fields.showReference) meta(labelOr(settings.referenceLabel, 'Your reference', L.yourReference), draft.reference);
  if (fields.showRelated) meta(L.refersTo, draft.relatedTo);
  if (fields.showTotals) meta(kind.totalLabel, money(fields.showPaid ? t.balance : t.total), true);

  y = Math.max(leftEnd, midEnd, my) + 16;
  }

  // ---- the lines table ------------------------------------------------------------------------
  const rows = (draft.lines || []).map((line, index) => {
    const cells = {};
    for (const c of cols) cells[c.id] = cellText(line, c, money, lang, index);
    return cells;
  });

  // Numeric columns take what they need; the description gets whatever is left. Sizing the other
  // way round is how a total ends up wrapping onto two lines.
  const fixed = cols.filter((c) => c.id !== 'description');
  const widths = {};
  let used = 0;
  for (const c of fixed) { widths[c.id] = columnWidth(pdf, c, rows, S, narrow ? 6 : 14) || 70; used += widths[c.id]; }
  widths.description = Math.max(narrow ? 60 : 120, (right - M) - used);

  const xOf = {};
  let cx = M;
  for (const c of cols) { xOf[c.id] = cx; cx += widths[c.id]; }

  // The ledger rules its table the way a ledger is ruled: a heavy line over the headings, one
  // under them, one under the last row, and nothing between the rows.
  const header = () => {
    if (ledger) { pdf.line(M, y - 2, right, y - 2, { color: INK, width: 1.2 }); y += 6; }
    for (const c of cols) {
      const x = c.numeric ? xOf[c.id] + widths[c.id] - 4 : xOf[c.id];
      pdf.text(x, y, c.label.toUpperCase(), { size: S.label, bold: true, color: ledger ? INK : MUTED, align: c.numeric ? 'right' : 'left' });
    }
    y += lead;
    pdf.line(M, y, right, y, { color: ledger ? INK : RULE, width: 0.6 });
    y += 7;
  };
  header();

  for (const cells of rows) {
    const descLines = pdf.wrap(cells.description, widths.description - 8, S.body);
    const rowHeight = Math.max(descLines.length * lead, lead) + 8;

    // Break at a row boundary, never through one, and repeat the header so the second page is
    // readable on its own.
    if (y + rowHeight > bottom - 40) {
      pdf.addPage();
      y = M;
      pdf.text(M, y, fillLabel(L.continued, { word: kind.word, number: draft.number }), { size: S.small, color: MUTED });
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
    if (!ledger) pdf.line(M, y - 4, right, y - 4, { color: RULE, width: 0.4 });
  }
  if (ledger) { pdf.line(M, y - 2, right, y - 2, { color: INK, width: 1.2 }); y += 4; }

  // ---- totals -----------------------------------------------------------------------------------
  // On the ledger the delivery address shares the row with the totals, the way a shop's invoice
  // closes: where it went on the left, what it cost on the right.
  if (windowed && shipTo && !fields.showTotals) {
    y += 10;
    if (y > bottom - 80) { pdf.addPage(); y = M; }
    y = drawParty(M, y, L.shipTo, shipTo.name, address(shipTo), []) + 6;
  }
  if (fields.showTotals) {
    y += 10;
    if (y > bottom - 120) { pdf.addPage(); y = M; }
    const totalsTop = y;
    // The totals column is as wide as its widest row needs, never narrower than 150pt. A fixed
    // width was fine for "Total" in Helvetica and not for "Gesamtbetrag" in the embedded face,
    // where the label ran into its own amount.
    const planned = [];
    const row = (label, value, big) => planned.push({ label, value, big: !!big });
    const drawRows = () => {
      const need = planned.reduce((w, r) => {
        const size = r.big ? 11 : S.body;
        return Math.max(w, pdf.measure(r.label, size, r.big) + pdf.measure(r.value, size, r.big) + 16);
      }, 150);
      const labelX = narrow ? M : Math.max(M, right - need);
      for (const r of planned) {
        if (r.rule) { pdf.line(labelX, y, right, y, { color: RULE, width: 0.6 }); y += 6; continue; }
        if (r.note) {
          for (const l of pdf.wrap(r.note, Math.max(150, need), S.small)) {
            pdf.text(right, y, l, { size: S.small, italic: true, color: MUTED, align: 'right' });
            y += 10;
          }
          continue;
        }
        pdf.text(labelX, y, r.label, { size: r.big ? 11 : S.body, bold: r.big, color: r.big ? INK : MUTED });
        pdf.text(right, y, r.value, { size: r.big ? 11 : S.body, bold: r.big, color: INK, align: 'right' });
        y += r.big ? lead + 4 : lead + 1;
      }
    };
    row(TL.subtotal, money((t.discountTotal ? (t.subtotalBeforeDiscount ?? t.subtotal) : t.subtotal)));
    if (t.discountTotal) row(TL.discount, '-' + money((t.discountShown ?? t.discountTotal)));
    if (t.shipping?.amount) row(TL.shipping, money(t.shipping.amount));
    if (fields.showTax) {
      for (const l of t.taxLines || []) row(taxLabel(l, L.tax), money(l.amount));
    }
    if (t.exempt) planned.push({ note: t.exempt.reason, label: '', value: '' });
    planned.push({ rule: true, label: '', value: '' });
    row(TL.total, money(t.total), true);
    if (fields.showPaid) {
      row(TL.paid, '-' + money(t.amountPaid));
      row(kind.totalLabel, money(t.balance), true);
    }
    drawRows();
    if (windowed && shipTo) {
      const shipEnd = drawParty(M, totalsTop, L.shipTo, shipTo.name, address(shipTo), []);
      y = Math.max(y, shipEnd + 6);
    }
  }

  // ---- the standing wording ----------------------------------------------------------------------
  y += 14;
  const block = (label, body, italic) => {
    const lines = pdf.wrap(body, right - M, italic ? S.small : S.body, false);
    const needed = lines.length * lead + (label ? 14 : 0) + 10;
    if (y + needed > bottom) { pdf.addPage(); y = M; }
    if (label) { pdf.text(M, y, label.toUpperCase(), { size: S.label, bold: true, color: MUTED }); y += 12; }
    for (const l of lines) { pdf.text(M, y, l, { size: italic ? S.small : S.body, italic, color: italic ? MUTED : INK }); y += lead; }
    y += 8;
  };

  if (fields.legend) block('', fields.legend, true);
  if (fields.showNote) block(L.note, draft.note);
  if (fields.showTerms) block(L.paymentTerms, draft.terms);
  if (fields.showPaymentDetails) block(labelOr(settings.paymentDetailsLabel, 'How to pay', L.howToPay), settings.paymentDetails);

  // The payment code as vector squares, its caption and account lines beside it.
  const pay = paymentCode(draft, settings, fields);
  if (pay) {
    const side = narrow ? 54 : 64;
    if (y + side + 12 > bottom) { pdf.addPage(); y = M; }
    pdf.qr(M, y, side, pay.code);
    const tx = M + side + 10;
    let ty = y;
    pdf.text(tx, ty, pay.caption.toUpperCase(), { size: S.label, bold: true, color: MUTED });
    ty += 12;
    for (const l of pay.lines) {
      for (const piece of pdf.wrap(l, right - tx, S.small)) { pdf.text(tx, ty, piece, { size: S.small, color: INK }); ty += 10; }
    }
    y += Math.max(side, ty - y) + 12;
  }

  // The account in words when no code carried it — see doc/payment.js accountLines.
  const bank = accountLines(draft, settings, fields);
  if (bank && !(pay && pay.kind === 'epc')) {
    const needed = bank.lines.length * 10 + 12 + 8;
    if (y + needed > bottom) { pdf.addPage(); y = M; }
    pdf.text(M, y, bank.caption.toUpperCase(), { size: S.label, bold: true, color: MUTED });
    y += 12;
    for (const l of bank.lines) { pdf.text(M, y, l, { size: S.small, color: INK }); y += 10; }
    y += 8;
  }

  if (settings.closingText) block('', settings.closingText, true);
  // The legal line — except on the windowed layouts, whose foot carries it in its middle column.
  if (sender.legalText && !windowed) block('', sender.legalText, true);
  // The credit line, in the document's language — see doc/render.js for why it is a setting.
  if (settings.creditLine) block('', L.madeWith, true);

  // ---- the ledger's foot, on every page --------------------------------------------------------------
  // Three columns with a bar down the left of each, the way commercial stationery prints its
  // registrations: who and where, the numbers, how to reach them. The body was told to stop above
  // it (see `bottom`), so it never collides with a table that ran long.
  if (windowed) {
    const top = pdf.height - M - colophonH + 2;
    pdf.pages.forEach((ops) => {
      const saved = pdf.ops;
      pdf.ops = ops;
      pdf.line(M, top - 8, right, top - 8, { color: RULE, width: 0.6 });
      colophon.forEach((lines, i) => {
        const x = M + i * colophonColW;
        if (!lines.length) return;
        pdf.line(x, top - 1, x, top + lines.length * colophonLine - 3, { color: INK, width: 1.2 });
        lines.forEach((l, j) => {
          pdf.text(x + 7, top + j * colophonLine, l.text, { size: S.small, bold: !!l.bold, color: l.bold ? INK : MUTED });
        });
      });
      pdf.ops = saved;
    });
  }

  // ---- page numbers --------------------------------------------------------------------------------
  // Added last, once the total is known — a footer saying "page 1 of 1" on a document that turned
  // out to have two pages is the sort of small wrongness that makes a reader distrust the rest.
  if (pdf.pageCount > 1) {
    pdf.pages.forEach((ops, i) => {
      const saved = pdf.ops;
      pdf.ops = ops;
      pdf.text(pdf.width / 2, pdf.height - 28, fillLabel(L.pageOf, { n: i + 1, m: pdf.pageCount }), {
        size: S.small, color: MUTED, align: 'center',
      });
      pdf.ops = saved;
    });
  }

  return pdf;
}
