import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = await import(pathToFileURL(_resolve(ROOT, 'src/settings/store.js')).href);
const d = await import(pathToFileURL(_resolve(ROOT, 'src/settings/defaults.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// The collision this file exists to avoid.
//
// The shared core writes Advanced Charts' entire dashboard design to ANUPRESS_Config under the key
// "site", and to the widget option "anupressSiteConfig". Both widgets on one document is an
// ordinary thing to want. If Invoice Studio ever used those keys, the first time somebody changed
// a tax rate it would overwrite their dashboard.
// ---------------------------------------------------------------------------------------------
const coreSource = readFileSync(_resolve(ROOT, 'src/core/grist/bridge.js'), 'utf8');
const coreConfigKey = /const CONFIG_KEY = '([^']+)'/.exec(coreSource)[1];
const coreOptionKey = /const OPTION_KEY = '([^']+)'/.exec(coreSource)[1];

eq('the shared core still uses the keys we think it does', [coreConfigKey, coreOptionKey], ['site', 'anupressSiteConfig']);
ok('our config key is not the dashboard’s', store.CONFIG_KEY !== coreConfigKey);
ok('nor is our option key', store.OPTION_KEY !== coreOptionKey);
eq('and ours are named for what they are', [store.CONFIG_KEY, store.OPTION_KEY], ['invoiceStudio', 'invoiceStudioSettings']);
// Same table, different row — which is the point: coexisting, not colliding.
eq('we share the table itself', store.CONFIG_TABLE, 'ANUPRESS_Config');

// ---------------------------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------------------------
const merged = store.mergeSettings(d.DEFAULT_SETTINGS, { money: { currency: 'GBP' } });
eq('a stored value wins', merged.money.currency, 'GBP');
eq('and everything else is still there', merged.money.roundingMode, 'halfUp');
eq('nested defaults survive a partial object', merged.money.format.position, 'left');
eq('untouched branches are whole', merged.numbering.padding, 4);

// A later version of the widget writes keys this one has never heard of. Dropping them is how a
// setting silently disappears when a colleague on a newer release saves.
const future = store.mergeSettings(d.DEFAULT_SETTINGS, { money: { somethingNew: 42 }, brandNewSection: { a: 1 } });
eq('unknown nested keys are kept', future.money.somethingNew, 42);
eq('so are unknown sections', future.brandNewSection.a, 1);

// Arrays replace rather than merge — a rate table with three rows must not inherit a fourth.
const rates = store.mergeSettings({ money: { taxRates: [1, 2, 3, 4] } }, { money: { taxRates: [9] } });
eq('an array is replaced wholesale', rates.money.taxRates, [9]);

eq('nonsense falls back to the defaults', store.mergeSettings(d.DEFAULT_SETTINGS, null).money.currency, 'USD');
// The defaults must not be mutated by a merge, or the second call starts from the first one's result.
store.mergeSettings(d.DEFAULT_SETTINGS, { money: { currency: 'EUR' } });
eq('the defaults are left alone', d.DEFAULT_SETTINGS.money.currency, 'USD');

// ---------------------------------------------------------------------------------------------
// Which copy is newer
// ---------------------------------------------------------------------------------------------
eq('a stamp is a number', typeof store.revisionOf(store.stamp({})), 'number');
eq('unstamped counts as zero', store.revisionOf({ a: 1 }), 0);
eq('the higher revision wins', store.pickNewer({ __rev: 1, id: 'a' }, { __rev: 2, id: 'b' }).id, 'b');
eq('either way round', store.pickNewer({ __rev: 5, id: 'a' }, { __rev: 2, id: 'b' }).id, 'a');
// An unstamped copy is from before revisions existed, so anything stamped beats it — which is how
// a stale widget option repairs itself instead of needing to be cleared by hand.
eq('a stamped copy beats an unstamped one', store.pickNewer({ id: 'old' }, { __rev: 1, id: 'new' }).id, 'new');
eq('one side missing', store.pickNewer(null, { id: 'b' }).id, 'b');
eq('the other side missing', store.pickNewer({ id: 'a' }, null).id, 'a');
eq('neither', store.pickNewer(null, null), null);

// ---------------------------------------------------------------------------------------------
// Making what a person typed safe for the engines
// ---------------------------------------------------------------------------------------------
const s = store.sanitise({ money: { currency: 'gbp', format: { decimals: '9' }, roundingMode: 'sideways', taxBasedOn: 'wherever' } });
eq('a currency code is upper-cased', s.money.currency, 'GBP');
eq('decimals are clamped to something a currency could have', s.money.format.decimals, 6);
eq('an unknown rounding mode falls back', s.money.roundingMode, 'halfUp');
eq('so does an unknown tax basis', s.money.taxBasedOn, 'billing');

eq('an empty currency is not empty', store.sanitise({ money: { currency: '' } }).money.currency, 'USD');
eq('a long one is trimmed to a code', store.sanitise({ money: { currency: 'POUNDS' } }).money.currency, 'POU');
eq('country codes are upper-cased', store.sanitise({ money: { homeCountry: 'gb' } }).money.homeCountry, 'GB');

// "1,234,56" is not a number anybody can read.
const same = store.sanitise({ money: { format: { thousandSeparator: ',', decimalSeparator: ',' } } });
ok('the two separators cannot be the same character', same.money.format.thousandSeparator !== same.money.format.decimalSeparator);
eq('a separator is one character', store.sanitise({ money: { format: { thousandSeparator: 'abc' } } }).money.format.thousandSeparator, 'a');
eq('an empty decimal separator is still a dot', store.sanitise({ money: { format: { decimalSeparator: '' } } }).money.format.decimalSeparator, '.');
eq('no decimals set means the currency decides', store.sanitise({ money: { format: { decimals: '' } } }).money.format.decimals, null);

eq('a rate row with no usable rate is dropped', store.sanitise({ money: { taxRates: [{ rate: 20 }, { rate: 'abc' }, null] } }).money.taxRates.length, 1);
eq('a rate table that is not a table is empty', store.sanitise({ money: { taxRates: 'nonsense' } }).money.taxRates, []);

// Tax mode, and the one-rate answer most small businesses actually need.
eq('one typed rate is the default', store.sanitise({}).money.taxMode, 'simple');
eq('an unknown mode falls back to it', store.sanitise({ money: { taxMode: 'magic' } }).money.taxMode, 'simple');
// A rate is a percentage, and a percentage over a hundred is a typo rather than a tax regime.
eq('a rate is clamped to a percentage', store.sanitise({ money: { simpleRate: 250 } }).money.simpleRate, 100);
eq('and cannot be negative', store.sanitise({ money: { simpleRate: -5 } }).money.simpleRate, 0);
eq('nonsense is zero', store.sanitise({ money: { simpleRate: 'twenty' } }).money.simpleRate, 0);
eq('the name is what appears on the document', store.sanitise({ money: { simpleName: '  MwSt ' } }).money.simpleName, 'MwSt');
eq('an empty name still names something', store.sanitise({ money: { simpleName: '' } }).money.simpleName, 'Tax');

// Paper and density.
eq('A4 by default', store.sanitise({}).document.paperSize, 'a4');
eq('a till roll is a real choice', store.sanitise({ document: { paperSize: 'receipt80' } }).document.paperSize, 'receipt80');
eq('an unknown paper falls back', store.sanitise({ document: { paperSize: 'napkin' } }).document.paperSize, 'a4');
eq('normal density by default', store.sanitise({}).document.density, 'normal');
eq('an unknown density falls back', store.sanitise({ document: { density: 'squashed' } }).document.density, 'normal');

eq('padding is clamped', store.sanitise({ numbering: { padding: 99 } }).numbering.padding, 12);
eq('and cannot be negative', store.sanitise({ numbering: { padding: -3 } }).numbering.padding, 0);
eq('a nonsense padding falls back', store.sanitise({ numbering: { padding: 'four' } }).numbering.padding, 4);
eq('a start below one is one', store.sanitise({ numbering: { start: 0 } }).numbering.start, 1);
eq('an unknown reset period falls back', store.sanitise({ numbering: { resetPeriod: 'weekly' } }).numbering.resetPeriod, 'yearly');
eq('an endpoint is trimmed', store.sanitise({ delivery: { endpoint: '  https://x.example/  ' } }).delivery.endpoint, 'https://x.example/');

// Sanitising nothing at all must still produce something usable, because that is what a brand-new
// document hands us.
const empty = store.sanitise({});
eq('an empty document gets working settings', empty.money.currency, 'USD');
eq('with a numbering scheme', empty.numbering.prefixes.invoice, 'INV-{YYYY}-');

// ---------------------------------------------------------------------------------------------
// Numbering per kind
// ---------------------------------------------------------------------------------------------
eq('an invoice numbers as an invoice', d.numberFormatFor(empty, 'invoice').prefix, 'INV-{YYYY}-');
// A quote and an invoice raised the same day are not the same document and must not share a number.
eq('a quote has its own sequence', d.numberFormatFor(empty, 'quote').prefix, 'QUO-{YYYY}-');
eq('a credit note too', d.numberFormatFor(empty, 'credit_note').prefix, 'CRN-{YYYY}-');
// A kind added in a later version, read by settings written before it existed.
eq('an unknown kind still numbers sensibly', d.numberFormatFor(empty, 'something_new').prefix, 'INV-{YYYY}-');
eq('padding travels with it', d.numberFormatFor(empty, 'invoice').padding, 4);
eq('a custom prefix is honoured',
  d.numberFormatFor(store.sanitise({ numbering: { prefixes: { invoice: 'A/' } } }), 'invoice').prefix, 'A/');

// ---------------------------------------------------------------------------------------------
// The one thing that must never be stored
// ---------------------------------------------------------------------------------------------
// Settings go into the user's Grist document, where every editor of that document can read them.
// A credential here would be a credential shared with the whole team.
const deliveryKeys = Object.keys(d.DEFAULT_DELIVERY).join(' ').toLowerCase();
ok('no password field', !/pass/.test(deliveryKeys));
ok('no api key field', !/api|secret|token/.test(deliveryKeys));

// ---------------------------------------------------------------------------------------------
// The logo. It ends up in an <img src>, an email body and a PDF stream, so sanitise is the last
// line between "whatever was in the stored JSON" and all three.
// ---------------------------------------------------------------------------------------------
const png = 'data:image/png;base64,iVBORw0KGgo=';
const jpg = 'data:image/jpeg;base64,/9j/4AAQ';
eq('a PNG data URI is kept', store.sanitise({ business: { logoData: png } }).business.logoData, png);
eq('a JPEG data URI is kept', store.sanitise({ business: { logoData: jpg } }).business.logoData, jpg);
eq('an external URL is not', store.sanitise({ business: { logoData: 'https://example.com/x.png' } }).business.logoData, null);
eq('javascript: is certainly not', store.sanitise({ business: { logoData: 'javascript:alert(1)' } }).business.logoData, null);
eq('an SVG data URI is refused — it can carry script', store.sanitise({ business: { logoData: 'data:image/svg+xml;base64,PHN2Zz4=' } }).business.logoData, null);
eq('markup hiding in the base64 slot is refused', store.sanitise({ business: { logoData: 'data:image/png;base64,"><script>' } }).business.logoData, null);
eq('an oversized logo is dropped, not truncated', store.sanitise({ business: { logoData: 'data:image/png;base64,' + 'A'.repeat(400001) } }).business.logoData, null);
eq('the PDF copy must actually be a JPEG', store.sanitise({ business: { logoJpeg: png } }).business.logoJpeg, null);
eq('and a real one is kept', store.sanitise({ business: { logoJpeg: jpg } }).business.logoJpeg, jpg);
eq('no logo is a valid state', store.sanitise({}).business.logoData, null);

// Table overrides: ids or nothing.
eq('a chosen table id is kept', store.sanitise({ tables: { invoice: 'Ledger' } }).tables.invoice, 'Ledger');
eq('junk stored there becomes empty', store.sanitise({ tables: { invoice: 42 } }).tables.invoice, '');
eq('absent means work it out', store.sanitise({}).tables.invoice, '');

// The email body embeds it with the same suspicion.
const { documentToEmailHtml: emailDocument } = await import(pathToFileURL(_resolve(ROOT, 'src/send/email-document.js')).href);
const { normaliseDraft } = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);
const eDraft = (sender) => normaliseDraft({ kind: 'invoice', number: 'INV-9', sender, lines: [{ description: 'Work', quantity: 1, unitPrice: 10, amount: 10 }] });
ok('the email shows the logo', emailDocument(eDraft({ name: 'T', logoData: jpg }), {}).includes(`<img src="${jpg}"`));
ok('and still names the business, for clients whose mail strips images', emailDocument(eDraft({ name: 'Thornbury Works', logoData: jpg }), {}).includes('Thornbury Works'));
ok('no logo, no img tag in the header', !emailDocument(eDraft({ name: 'T' }), {}).includes('<img'));
ok('a URL that slipped past storage is still not embedded', !emailDocument(eDraft({ name: 'T', logoData: 'https://example.com/x.png' }), {}).includes('<img'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
