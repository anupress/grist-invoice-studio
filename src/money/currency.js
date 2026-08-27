// Money: how it is rounded, and how it is written down.
//
// Rounding is not a detail here. An invoice is a legal document, the figures on it have to add up
// exactly, and "close enough" shows up as a penny discrepancy that somebody's accounts payable
// system rejects. Two things have to be right:
//
//   HOW to round   Half away from zero is what almost everyone means by rounding money. Half to
//                  even ("banker's rounding") is required by some jurisdictions and standards and
//                  produces different totals, so it is a setting rather than an opinion.
//
//   WHERE to round WooCommerce's "round tax at subtotal level, instead of rounding per line" —
//                  handled in totals.js, not here, because it is about the pipeline rather than
//                  about a number.
//
// The naive `Math.round(n * 100) / 100` is wrong and famously so: 1.005 * 100 is 100.49999999999999
// in binary floating point, so it rounds DOWN to 1.00. Shifting the decimal point through the
// string form instead re-parses "1.005e2" as exactly 100.5, which rounds to 101 and back to 1.01.

export const ROUNDING_MODES = ['halfUp', 'halfEven', 'up', 'down'];

/**
 * Move the decimal point without multiplying.
 *
 * Multiplication reintroduces exactly the representation error this exists to avoid, so the shift
 * goes through the decimal string. A value ALREADY in exponent form ("1e-7") cannot have another
 * exponent appended to it, and those are far outside money's range anyway, so they take the
 * multiply path.
 */
function shift(n, dp) {
  const s = String(n);
  if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) return n * Math.pow(10, dp);
  return Number(s + 'e' + dp);
}

/** Round to `dp` decimal places. Returns 0 for anything that is not a finite number. */
export function roundTo(value, dp = 2, mode = 'halfUp') {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!isFinite(n)) return 0;
  if (n === 0) return 0;

  const sign = n < 0 ? -1 : 1;
  const shifted = shift(Math.abs(n), dp);

  let whole;
  if (mode === 'up') whole = Math.ceil(shifted);
  else if (mode === 'down') whole = Math.floor(shifted);
  else if (mode === 'halfEven') {
    const floor = Math.floor(shifted);
    const diff = shifted - floor;
    // The comparison is against a shifted value that is already an exact half when it matters, so
    // a tolerance is not needed and would itself introduce error.
    if (diff > 0.5) whole = floor + 1;
    else if (diff < 0.5) whole = floor;
    else whole = floor % 2 === 0 ? floor : floor + 1;
  } else {
    // halfUp, meaning half AWAY FROM ZERO. Math.round breaks ties towards +Infinity, so -0.5 would
    // become -0 rather than -1; taking the absolute value first makes it symmetric.
    whole = Math.round(shifted);
  }

  return sign * shift(whole, -dp);
}

/** Add a list of amounts, rounding once at the end rather than accumulating error. */
export const sum = (values, dp = 2, mode = 'halfUp') =>
  roundTo((values || []).reduce((a, v) => a + (isFinite(v) ? v : 0), 0), dp, mode);

// ---------------------------------------------------------------------------------------------
// Writing it down
// ---------------------------------------------------------------------------------------------

/**
 * How many decimals a currency actually has.
 *
 * Yen and won have none; dinar and rial have three. Printing "¥1,400.00" is not a formatting
 * preference, it is wrong. Intl knows this, so ask it rather than keeping a table that goes stale.
 */
export function currencyDecimals(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return 2;
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).resolvedOptions();
    return typeof parts.maximumFractionDigits === 'number' ? parts.maximumFractionDigits : 2;
  } catch { return 2; }
}

/** The default display settings — WooCommerce's, because a million shop owners already know them. */
export const DEFAULT_FORMAT = {
  currency: 'USD',
  position: 'left',            // left | right | left_space | right_space
  thousandSeparator: ',',
  decimalSeparator: '.',
  decimals: null,              // null = whatever the currency itself uses
};

/**
 * The gap between an amount and its symbol is a NON-BREAKING space, deliberately.
 *
 * An ordinary space lets a browser wrap "1.234,56" onto one line and "€" onto the next, which on an
 * invoice reads as a typesetting failure and, worse, as a number missing its currency. Intl uses
 * U+00A0 here for exactly this reason. Written as an escape rather than the literal character so
 * that it is visible in a diff and nobody later "tidies" it back into a normal space.
 */
const NBSP = '\u00A0';

const SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', CNY: '¥', AUD: '$', CAD: '$',
  CHF: 'CHF', AED: 'د.إ', SAR: '﷼', ZAR: 'R', NZD: '$', SGD: '$', HKD: '$',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', BRL: 'R$', MXN: '$', NGN: '₦',
  KES: 'KSh', PKR: '₨', BDT: '৳', LKR: 'Rs', PHP: '₱', THB: '฿', IDR: 'Rp',
  MYR: 'RM', VND: '₫', KRW: '₩', TRY: '₺', RUB: '₽', ILS: '₪', EGP: 'E£',
};

/**
 * The symbol for a currency code.
 *
 * Intl is asked first because it is right more often than any table, but it is asked with
 * `narrowSymbol` — without it, a browser in a non-US locale renders USD as "US$", which belongs in
 * a conversion table and not on the face of a document. The table above is the fallback for engines
 * that reject the option, and for anything Intl does not know.
 */
export function currencySymbol(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return String(code || '');
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency');
    if (sym && sym.value) return sym.value;
  } catch { /* fall through */ }
  return SYMBOLS[c] || c;
}

/**
 * Money as a string, under the store's own display rules.
 *
 * Built by hand rather than handed to Intl, because the separators and the symbol position are
 * settings the user controls — a European store writing "1.234,56 €" and an Indian one writing
 * "₹1,234.56" are both correct, and neither is necessarily what the viewer's browser locale would
 * choose. Grouping is western (every three digits); the Indian lakh/crore grouping is a genuinely
 * different rule and is left for when somebody asks for it rather than guessed at.
 */
export function formatMoney(value, format = {}) {
  const f = { ...DEFAULT_FORMAT, ...format };
  const dp = f.decimals == null ? currencyDecimals(f.currency) : Math.max(0, Math.min(6, f.decimals));
  const n = roundTo(value, dp, f.roundingMode || 'halfUp');

  const negative = n < 0;
  const fixed = Math.abs(n).toFixed(dp);
  const [whole, fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, f.thousandSeparator ?? ',');
  const body = fraction ? grouped + (f.decimalSeparator ?? '.') + fraction : grouped;

  const symbol = f.symbol != null ? f.symbol : currencySymbol(f.currency);
  let out;
  switch (f.position) {
    case 'right': out = body + symbol; break;
    case 'left_space': out = symbol + NBSP + body; break;
    case 'right_space': out = body + NBSP + symbol; break;
    default: out = symbol + body;
  }
  // The minus goes outside the symbol — "-$40.00", never "$-40.00" — which is how a credit note
  // reads on every other document a bookkeeper will see that week.
  return negative ? '-' + out : out;
}
