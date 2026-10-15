// The sender's foot on the Ledger and DIN 5008 sheets: three columns of who and where, the
// registrations, and how to reach them.
//
// What goes in them is the business's own decision as soon as it has one. Left blank in
// Settings → Document → Footer, a column says what it always said; typed in, it says what was
// typed, with {placeholders} filled from Settings → Business so an address or an IBAN is entered
// once. That is the answer to "our footer has to carry the register court, the managing director
// and the bank": no field per possible need, and no code, just the text, laid out where the
// standard expects it.
//
// One definition, read by the screen, the PDF and the HTML file, so the three cannot disagree
// about what the foot says.

import { addressLines } from './address.js';
import { formatIban } from './payment.js';

const text = (v) => String(v == null ? '' : v).trim();

/** The placeholders a footer column can carry, in the order the settings list them. */
export const FOOTER_PLACEHOLDERS = [
  'name', 'address', 'street', 'street2', 'postcode', 'city', 'country',
  'taxNumber', 'legal', 'email', 'phone', 'website',
  'bank', 'accountHolder', 'iban', 'bic', 'peppolId',
];

/** What each placeholder stands for, for this sender. Multi-line values keep their line breaks. */
function valuesFor(sender = {}, lang = 'en') {
  return {
    name: text(sender.name),
    address: addressLines(sender, lang).join('\n'),
    street: text(sender.street1),
    street2: text(sender.street2),
    postcode: text(sender.postcode),
    city: text(sender.city),
    country: text(sender.country),
    taxNumber: text(sender.taxNumber),
    legal: text(sender.legalText),
    email: text(sender.email),
    phone: text(sender.phone),
    website: text(sender.website),
    bank: text(sender.bankName),
    accountHolder: text(sender.accountHolder) || text(sender.name),
    iban: sender.iban ? formatIban(sender.iban) : '',
    bic: text(sender.bic),
    peppolId: text(sender.peppolId),
  };
}

/**
 * One column's text, filled in and split into lines.
 *
 * A placeholder the footer does not know is left as typed, so a typo shows itself rather than
 * vanishing. A line that a placeholder emptied ("BIC: {bic}" with no BIC) is dropped whole; a line
 * wrapped in **double stars** prints in the name's weight.
 */
export function fillFooter(template, sender = {}, lang = 'en') {
  const values = valuesFor(sender, lang);
  const out = [];
  for (const raw of String(template == null ? '' : template).split(/\r?\n/)) {
    let known = 0;
    let empty = 0;
    const filled = raw.replace(/\{(\w+)\}/g, (m, key) => {
      if (!Object.prototype.hasOwnProperty.call(values, key)) return m;
      known++;
      if (!values[key]) empty++;
      return values[key];
    });
    // "BIC: {bic}" for a business with no BIC: every placeholder on the line came back empty, so
    // the line has nothing to say and is left out rather than printed as a bare label.
    if (known && empty === known) continue;
    for (const piece of filled.split('\n')) {
      const line = piece.trim();
      if (!line) continue;
      const strong = /^\*\*(.+)\*\*$/.exec(line);
      out.push(strong ? { text: strong[1].trim(), strong: true } : { text: line });
    }
  }
  return out;
}

/**
 * The three columns, each a list of { text, strong }.
 *
 * `settings.footer` is three strings; an empty one keeps that column's automatic content:
 *   1  the name, then the address in its country's order
 *   2  the tax number, then the legal line from Settings → Business, one entry per line
 *   3  email, phone, website
 */
export function footerColumns(sender = {}, settings = {}, { taxIdLabel = 'Tax ID', lang = 'en' } = {}) {
  const custom = Array.isArray(settings.footer) ? settings.footer : [];
  const auto = [
    [{ text: text(sender.name) || 'Your business', strong: true }, ...addressLines(sender, lang).map((t) => ({ text: t }))],
    [
      text(sender.taxNumber) ? { text: `${taxIdLabel}: ${text(sender.taxNumber)}` } : null,
      ...text(sender.legalText).split(/\n+/).map(text).filter(Boolean).map((t) => ({ text: t })),
    ].filter(Boolean),
    [sender.email, sender.phone, sender.website].map(text).filter(Boolean).map((t) => ({ text: t })),
  ];
  return auto.map((col, i) => (text(custom[i]) ? fillFooter(custom[i], sender, lang) : col));
}

/**
 * How tall the foot will be, in CSS pixels, for a page that has to keep room for it. An estimate
 * from the line count: 11px type on a 1.45 line, about 34 characters to a column's line, plus the
 * rule and the gap above it. Generous on purpose: room left over is white paper, room short is a
 * line printed under the foot.
 */
export function footerHeightEstimate(columns) {
  const lines = Math.max(0, ...columns.map((col) => col.reduce((n, l) => n + Math.max(1, Math.ceil(l.text.length / 34)), 0)));
  return lines ? Math.ceil(lines * 16 + 18) : 0;
}
