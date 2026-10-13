// How a business is paid, by the country it banks in.
//
// A bank account is described differently in every country: a sort code and an account number
// in the UK, a routing number in the US, a BSB in Australia, an IFSC (and a UPI id) in India,
// transit and institution numbers in Canada, and an IBAN across Europe and much of the Middle
// East. Showing a business in Texas an IBAN box and a business in Bristol a UPI box is what "one
// form for everyone" looks like, and it was the first thing a user asked to have made logical.
//
// The scheme follows the SENDER's country — the account is where the money goes, whatever the
// document's currency — and the document prints the lines that scheme's readers expect, in the
// document's language. The currency still decides the scannable code (doc/payment.js): SEPA for
// euros, UPI for rupees, a payment link for anything.

const clean = (s) => String(s == null ? '' : s).trim();

/** An IBAN as the standard wants it: upper case, no spaces. */
export const normaliseIban = (s) => clean(s).replace(/\s+/g, '').toUpperCase();

/** Roughly an IBAN — country, two check digits, then up to thirty more. Not a checksum. */
export const looksLikeIban = (s) => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normaliseIban(s));

/** An IBAN in the groups of four a person reads it in. */
export function formatIban(s) {
  return normaliseIban(s).replace(/(.{4})/g, '$1 ').trim();
}

/** Countries whose bank accounts are IBANs — the SWIFT IBAN registry, plus the partial users. */
const IBAN_COUNTRIES = new Set([
  'AD', 'AE', 'AL', 'AT', 'AZ', 'BA', 'BE', 'BG', 'BH', 'BI', 'BR', 'BY', 'CH', 'CR', 'CY', 'CZ', 'DE',
  'DJ', 'DK', 'DO', 'EE', 'EG', 'ES', 'FI', 'FK', 'FO', 'FR', 'GB', 'GE', 'GI', 'GL', 'GR', 'GT', 'HR',
  'HU', 'IE', 'IL', 'IQ', 'IS', 'IT', 'JO', 'KW', 'KZ', 'LB', 'LC', 'LI', 'LT', 'LU', 'LV', 'LY', 'MC',
  'MD', 'ME', 'MK', 'MN', 'MR', 'MT', 'MU', 'NI', 'NL', 'NO', 'OM', 'PK', 'PL', 'PS', 'PT', 'QA', 'RO',
  'RS', 'RU', 'SA', 'SC', 'SD', 'SE', 'SI', 'SK', 'SM', 'SO', 'ST', 'SV', 'TL', 'TN', 'TR', 'UA', 'VA',
  'VG', 'XK', 'YE',
]);

/**
 * The schemes. `code` names the bank-identifying number (its label key in lang.js and in the web
 * form's strings), `codeHint` and `account` are example values for the boxes, and the booleans
 * say which other boxes the scheme shows. A scheme with `iban` shows an IBAN box even where the
 * IBAN is only for payments from abroad; the form's hint says which.
 */
export const SCHEMES = {
  gb:      { code: 'sortCode',      codeHint: '04-00-04',    account: '12345678',           iban: true,  bic: true, upi: false, bankName: false },
  us:      { code: 'routingNumber', codeHint: '021000021',   account: '000123456789',       iban: false, bic: true, upi: false, bankName: true },
  in:      { code: 'ifsc',          codeHint: 'HDFC0000123', account: '50100123456789',     iban: false, bic: true, upi: true,  bankName: true },
  au:      { code: 'bsb',           codeHint: '062-000',     account: '12345678',           iban: false, bic: true, upi: false, bankName: true },
  ca:      { code: 'transitNumber', codeHint: '00012-004',   account: '1234567',            iban: false, bic: true, upi: false, bankName: true },
  nz:      { code: '',              codeHint: '',            account: '12-3456-7890123-00', iban: false, bic: true, upi: false, bankName: true },
  iban:    { code: '',              codeHint: '',            account: '',                   iban: true,  bic: true, upi: false, bankName: false },
  generic: { code: 'bankCode',      codeHint: '',            account: '1234567890',         iban: true,  bic: true, upi: false, bankName: true },
};

/** The scheme id for a country code; `generic` for a country nobody has described here. */
export function schemeFor(country) {
  const cc = clean(country).toUpperCase();
  if (cc === 'GB' || cc === 'IM' || cc === 'JE' || cc === 'GG') return 'gb';
  if (cc === 'US') return 'us';
  if (cc === 'IN') return 'in';
  if (cc === 'AU') return 'au';
  if (cc === 'CA') return 'ca';
  if (cc === 'NZ') return 'nz';
  if (IBAN_COUNTRIES.has(cc)) return 'iban';
  return 'generic';
}

/** Example IBANs for the placeholder, in the country's own shape where it is known. */
const IBAN_EXAMPLES = {
  DE: 'DE02120300000000202051', GB: 'GB33BUKB20201555555555', FR: 'FR1420041010050500013M02606',
  NL: 'NL91ABNA0417164300', ES: 'ES9121000418450200051332', IT: 'IT60X0542811101000000123456',
  AT: 'AT611904300234573201', CH: 'CH9300762011623852957', BE: 'BE68539007547034',
  PL: 'PL61109010140000071219812874', PT: 'PT50000201231234567890154', IE: 'IE29AIBK93115212345678',
  DK: 'DK5000400440116243', SE: 'SE4550000000058398257466', NO: 'NO9386011117947', FI: 'FI2112345600000785',
  CZ: 'CZ6508000000192000145399', LU: 'LU280019400644750000', GR: 'GR1601101250000000012300695',
};
export function ibanExample(country) {
  return IBAN_EXAMPLES[clean(country).toUpperCase()] || IBAN_EXAMPLES.DE;
}

/** What the document prints when a label is missing from its language. */
const FALLBACK = {
  accountNumber: 'Account', sortCode: 'Sort code', routingNumber: 'Routing number', bsb: 'BSB',
  ifsc: 'IFSC', transitNumber: 'Transit', bankCode: 'Bank code', bank: 'Bank',
};

/**
 * The account as lines for the document: the country's own numbers on one line, then the IBAN
 * and BIC when there are any, then the bank's name. `L` is the document's label set. Empty when
 * the business has typed nothing — the caller prints no block at all then.
 */
export function bankLines(sender = {}, L = {}) {
  const S = SCHEMES[schemeFor(sender.country)];
  const word = (key) => L[key] || FALLBACK[key] || key;
  const code = clean(sender.bankCode);
  const account = clean(sender.accountNumber);
  const lines = [];
  const codeLabel = word(S.code || 'bankCode');
  if (code && account) lines.push(`${codeLabel} ${code} · ${word('accountNumber')} ${account}`);
  else if (account) lines.push(`${word('accountNumber')} ${account}`);
  else if (code) lines.push(`${codeLabel} ${code}`);
  const iban = normaliseIban(sender.iban);
  if (looksLikeIban(iban)) lines.push(`IBAN ${formatIban(iban)}`);
  if (clean(sender.bic)) lines.push(`BIC ${clean(sender.bic).toUpperCase()}`);
  if (clean(sender.bankName)) lines.push(`${word('bank')} ${clean(sender.bankName)}`);
  return lines;
}
