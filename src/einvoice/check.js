// What a receiver's validator will say, said first.
//
// An electronic invoice that fails validation at the buyer's end comes back days later with a
// code nobody can read. The rules that catch most rejections are few and plain — a missing
// country, a VAT number with spaces in it, no buyer reference on an XRechnung — so they are
// checked here, in words, before anything is sent. This is not the whole of EN 16931's two
// hundred rules; it is the twenty that a small business actually trips over.
//
// `errors` mean the file will be rejected. `warnings` mean it will be accepted and somebody
// will ask a question.

const has = (v) => String(v == null ? '' : v).trim() !== '';

export function checkEInvoice(m) {
  const errors = [];
  const warnings = [];
  const err = (code, text) => errors.push({ code, text, level: 'error' });
  const warn = (code, text) => warnings.push({ code, text, level: 'warning' });
  const profile = m.profile.id;

  // ---- the document ------------------------------------------------------------------------
  if (!m.typeCode) {
    err('BR-04', `Only an invoice or a credit note can be an electronic invoice. This is a ${m.kind.replace('_', ' ')} — convert it first.`);
    return { ok: false, errors, warnings };
  }
  if (!has(m.number)) err('BR-02', 'The document has no number. It is assigned when you save.');
  if (!has(m.issueDate)) err('BR-03', 'The document has no issue date.');
  if (!has(m.currency) || !/^[A-Z]{3}$/.test(m.currency)) err('BR-05', 'The currency must be a three-letter code such as EUR.');
  if (m.kind === 'invoice' && !has(m.dueDate) && !has(m.paymentTerms)) {
    err('BR-CO-25', 'An invoice with an amount to pay needs a due date or payment terms.');
  }
  if (m.kind === 'credit_note' && !has(m.precedingInvoice)) {
    warn('BT-25', 'The credit note does not name the invoice it corrects. Fill in "Refers to" so the buyer can match them.');
  }
  if (!m.lines.length) err('BR-16', 'An electronic invoice needs at least one line.');

  // ---- the seller ----------------------------------------------------------------------------
  const s = m.seller;
  if (!has(s.name)) err('BR-06', 'Your business name is empty. Settings → Business.');
  if (!has(s.country)) err('BR-09', 'Your country must be a two-letter code such as DE. Settings → Business → Country.');
  if (!has(s.city) || !has(s.postcode)) warn('BR-09', 'Your address is incomplete: city and postcode are expected. Settings → Business.');
  if (!has(s.vatId) && !has(s.taxId)) {
    err('BR-CO-26', 'Your VAT identifier is missing. Put it in Settings → Business → Tax number, with the country prefix (DE123456789).');
  } else if (!has(s.vatId) && !m.exempt) {
    warn('BR-CO-26', `Your tax number "${s.taxId}" does not start with a country prefix, so it is written as a national registration rather than a VAT identifier. If it is a VAT number, add the prefix.`);
  }
  if (profile === 'xrechnung' || profile === 'peppol') {
    if (!s.endpoint) err('BR-DE-2', 'Your email is missing: it is the seller’s electronic address, which this profile requires. Settings → Business → Email.');
  }
  if (profile === 'xrechnung') {
    if (!has(s.phone) && !has(s.email)) err('BR-DE-5', 'XRechnung requires a seller contact: a phone number or an email. Settings → Business.');
  }

  // ---- the buyer ---------------------------------------------------------------------------
  const b = m.buyer;
  if (!has(b.name)) err('BR-07', 'The client has no name.');
  if (!has(b.country)) err('BR-11', `The client’s country must be a two-letter code such as FR. On the client record${has(b.country) ? '' : ', it is empty'}.`);
  if (profile === 'xrechnung' || profile === 'peppol') {
    if (!b.endpoint) err('BR-DE-3', 'The client has no email, and this profile requires a buyer electronic address. Add one to the client record.');
  }
  if (profile === 'xrechnung' && !has(m.buyerReference)) {
    err('BR-DE-15', 'XRechnung requires a buyer reference — the Leitweg-ID for a public body, or the reference the client gave you. Type it in "Their reference".');
  } else if (profile === 'peppol' && !has(m.buyerReference)) {
    warn('PEPPOL-EN16931-R003', 'Peppol expects a buyer reference or an order reference. Fill in "Their reference" if the client gave one.');
  }
  if (m.exempt?.kind === 'reverse' && !has(b.vatId)) {
    err('BR-AE-02', 'A reverse-charge invoice must carry the client’s VAT identifier.');
  }

  // ---- the lines -----------------------------------------------------------------------------
  m.lines.forEach((l, i) => {
    if (!has(l.name) || l.name === 'Item') warn('BR-25', `Line ${i + 1} has no description.`);
    if (!(l.quantity > 0)) err('BR-22', `Line ${i + 1} has a quantity of ${l.quantity}; it must be more than zero.`);
    if (l.unitPrice < 0) err('BR-27', `Line ${i + 1} has a negative unit price; put the direction in the document kind instead.`);
    if (l.category.id === 'S' && !(l.category.rate > 0)) err('BR-S-05', `Line ${i + 1} is standard-rated at 0% — choose a rate, or a zero-rated class.`);
  });

  // ---- the money -----------------------------------------------------------------------------
  const T = m.totals;
  const closeTo = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
  if (!closeTo(T.sumLines, T.lineExtension)) {
    warn('BR-CO-10', `The lines add up to ${T.sumLines.toFixed(2)} but the document’s net total is ${T.lineExtension.toFixed(2)} — a rounding setting is pulling them apart by more than a cent.`);
  }
  if (!closeTo(T.taxExclusive + T.taxTotal, T.taxInclusive)) err('BR-CO-15', 'The totals do not add up: net plus tax is not the gross.');
  if (!closeTo(T.taxInclusive - T.prepaid, T.payable)) err('BR-CO-16', 'The amount payable is not the gross less what was paid.');
  for (const g of m.breakdown) {
    if (g.id === 'S' && !closeTo(g.basis * g.rate / 100, g.tax, 1)) {
      err('BR-CO-17', `The ${g.rate}% tax of ${g.tax.toFixed(2)} is not ${g.rate}% of ${g.basis.toFixed(2)}.`);
    }
    if ((g.id === 'E' || g.id === 'AE') && !has(g.reason)) err('BR-E-10', 'An exempt category needs its reason on the document.');
  }
  if (m.flatTax) warn('BT-119', 'The tax on this document is a typed figure rather than a rate. The XML states the rate it implies; a validator may query it.');
  if (m.breakdown.some((g) => g.id === 'S' && g.rate !== Math.round(g.rate * 100) / 100)) warn('BT-119', 'A tax rate has more than two decimals.');

  return { ok: errors.length === 0, errors, warnings };
}
