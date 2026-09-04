// The lists behind the type-ahead suggestions.
//
// Every one of these is a field where a person knows the answer but not the spelling of it: a
// country as two letters, a unit an e-invoice will accept, a currency code, the payment terms
// everybody uses. A datalist is the right control for all of them — it suggests without
// constraining, so "GB" is one keystroke and a country we have never heard of still goes in.
//
// Kept as data, and small: this is not a reference database, it is the twenty answers that cover
// almost every document.

/** Country codes, with the name browsers show beside them. Ordered by how often they come up. */
export const COUNTRIES = [
  ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'],
  ['IT', 'Italy'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['LU', 'Luxembourg'], ['AT', 'Austria'],
  ['CH', 'Switzerland'], ['PT', 'Portugal'], ['PL', 'Poland'], ['CZ', 'Czechia'], ['SK', 'Slovakia'],
  ['HU', 'Hungary'], ['RO', 'Romania'], ['BG', 'Bulgaria'], ['GR', 'Greece'], ['HR', 'Croatia'],
  ['SI', 'Slovenia'], ['EE', 'Estonia'], ['LV', 'Latvia'], ['LT', 'Lithuania'], ['FI', 'Finland'],
  ['SE', 'Sweden'], ['DK', 'Denmark'], ['NO', 'Norway'], ['IS', 'Iceland'], ['MT', 'Malta'], ['CY', 'Cyprus'],
  ['US', 'United States'], ['CA', 'Canada'], ['MX', 'Mexico'], ['BR', 'Brazil'],
  ['IN', 'India'], ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'], ['SG', 'Singapore'],
  ['AU', 'Australia'], ['NZ', 'New Zealand'], ['ZA', 'South Africa'], ['JP', 'Japan'], ['CN', 'China'],
];

/** Currency codes, the ones a European or Commonwealth business is likely to bill in. */
export const CURRENCIES = [
  ['GBP', 'Pound sterling'], ['EUR', 'Euro'], ['USD', 'US dollar'], ['CHF', 'Swiss franc'],
  ['SEK', 'Swedish krona'], ['NOK', 'Norwegian krone'], ['DKK', 'Danish krone'], ['PLN', 'Polish złoty'],
  ['CZK', 'Czech koruna'], ['HUF', 'Hungarian forint'], ['RON', 'Romanian leu'],
  ['INR', 'Indian rupee'], ['AED', 'UAE dirham'], ['SGD', 'Singapore dollar'],
  ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'], ['NZD', 'New Zealand dollar'],
  ['ZAR', 'South African rand'], ['JPY', 'Japanese yen'],
];

/** Units, as a person writes them. doc/units.js turns each into the code an e-invoice needs. */
export const UNITS = [
  'hour', 'day', 'week', 'month', 'year', 'session', 'visit', 'night', 'head', 'seat', 'licence',
  'item', 'pack', 'box', 'set', 'pair', 'pallet', 'roll', 'bottle', 'bag',
  'kg', 'g', 'tonne', 'litre', 'ml', 'm', 'cm', 'mm', 'km', 'm²', 'm³', 'mile', 'page', 'word',
];

/** Tax classes: the words the rate table matches on. Empty is the standard rate. */
export const TAX_CLASSES = ['reduced', 'zero', 'exempt', 'standard'];

/** Payment terms, as they are usually written on a document. */
export const PAYMENT_TERMS = [
  'Due on receipt', 'Net 7', 'Net 14', 'Net 30', 'Net 60',
  'Payment within 14 days, please.', 'Payment on collection.', 'Payable before the start of term.',
  '50% deposit, balance on completion.', 'Charged monthly in advance.',
];

/** Statuses, when a document has no choice list of its own. Kept in step with STATUS_DEFAULTS. */
export const STATUSES = ['Draft', 'Sent', 'Part paid', 'Paid', 'Overdue', 'Cancelled'];

/** A suggestion list as `{ value, label }`, whichever shape the source is in. */
export const asOptions = (list) => (list || []).map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] } : { value: String(x), label: '' }));

/**
 * The tax classes this document actually uses: the ones named in the rate table, then the common
 * ones. A business whose table has a "books" class gets "books" offered before anything invented.
 */
export function taxClassesFor(money = {}) {
  const seen = new Set();
  const out = [];
  for (const r of money.taxRates || []) {
    const c = String(r.class || '').trim();
    if (c && !seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); out.push(c); }
  }
  for (const c of TAX_CLASSES) if (!seen.has(c)) { seen.add(c); out.push(c); }
  return out;
}
