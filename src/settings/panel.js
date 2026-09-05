// The settings panel.
//
// Everything a business decides once. Laid out and named the way WooCommerce names the same things,
// because a person who has set up a shop already knows what "prices entered with tax" means and
// should not have to learn our word for it.
//
// Two things are live rather than described, because both are settings people get wrong silently:
// the currency sample redraws as you change separators, and the numbering sample shows the actual
// next number for the actual sequence. A person who can see "INV-2026-0012" cannot mis-set padding.
//
// Saving is an explicit button. Settings are written into the user's Grist document, and saving on
// every keystroke would mean a write per character.

import { el, toast } from '../core/util.js';
import { formatMoney, ROUNDING_MODES } from '../money/currency.js';
import { TAX_PRESETS, buildPreset, RATES_UPDATED } from '../money/tax/rates.js';
import { nextNumber } from '../money/numbering.js';
import { DOCUMENT_KINDS } from '../doc/kinds.js';
import { LAYOUTS } from '../doc/layouts.js';
import { numberFormatFor } from './defaults.js';
import { field, textInput, numberInput, textArea, selectInput, button, section } from '../compose/ui.js';
import { templatesBySector, findTemplate, templateChanges, applyTemplate, templateSummary } from '../templates/index.js';
import { MESSAGE_TEMPLATES } from '../send/message.js';
import { LANGUAGES } from '../doc/lang.js';
import { EXEMPTION_CHOICES, smallBusinessNote } from '../money/tax/exemptions.js';
import { looksLikeIban, formatIban } from '../doc/payment.js';
import { PROFILES, EINVOICE_FORMATS } from '../einvoice/index.js';
import { EMAIL_STYLES } from '../send/email-shell.js';

const opt = (value, label) => ({ value, label });

/**
 * The panel is tabbed the way WooCommerce tabs its settings: five doors instead of one long
 * corridor. Which door is open lives at module level, so the rebuilds that a tax-mode change
 * triggers reopen the same one.
 */
const TABS = [
  { id: 'business', label: 'Business' },
  { id: 'money', label: 'Money & tax' },
  { id: 'numbering', label: 'Numbering' },
  { id: 'document', label: 'Document' },
  { id: 'messages', label: 'Messages' },
  { id: 'sending', label: 'Sending' },
];
let activeTab = 'business';

/**
 * Build the panel.
 *
 * `settings` is edited in place and handed back on save; `ctx.existingNumbers` lets the numbering
 * sample show the real next number rather than a made-up one.
 */
export function renderSettingsPanel(ctx) {
  const { settings, existingNumbers = [], onSave, onClose, onPreview } = ctx;
  const s = settings;

  const statusLine = el('div', { class: 'set-status' });
  const say = (text, kind = '') => {
    statusLine.className = 'set-status' + (kind ? ' is-' + kind : '');
    statusLine.textContent = text;
  };

  // Anything that changes how a document LOOKS redraws it, so the effect of a setting is visible
  // while it is being chosen rather than after the panel is closed.
  const touched = () => { paintSamples(); if (onPreview) onPreview(); };

  // ---- your business ---------------------------------------------------------------------------
  const b = s.business;

  // The logo. Scaled down on the way in, because what is chosen here is written into a Grist cell
  // on every save and a 4MB photograph does not belong in one. Two copies are kept: a PNG while it
  // stays small, so transparency survives on screen and in print, and a flattened JPEG for the PDF,
  // which is the one image format a PDF can carry without a compression library.
  const logoPreview = el('img', { class: 'set-logo__img', alt: 'Your logo' });
  const logoRemove = button('Remove', () => {
    b.logoData = null; b.logoJpeg = null;
    paintLogo(); touched();
    say('Logo removed. Press Save settings to keep it that way.');
  }, { variant: 'ghost' });
  const logoFile = el('input', { type: 'file', accept: 'image/*', class: 'set-logo__file', 'aria-label': 'Upload a logo' });
  logoFile.addEventListener('change', async () => {
    const f = logoFile.files && logoFile.files[0];
    logoFile.value = '';
    if (!f) return;
    try {
      const out = await readLogo(f);
      b.logoData = out.logoData;
      b.logoJpeg = out.logoJpeg;
      paintLogo(); touched();
      say('Logo added. Press Save settings to keep it.', 'ok');
    } catch {
      say('That file could not be read as an image.', 'warn');
    }
  });
  function paintLogo() {
    if (b.logoData) { logoPreview.src = b.logoData; logoPreview.style.display = ''; logoRemove.style.display = ''; }
    else { logoPreview.removeAttribute('src'); logoPreview.style.display = 'none'; logoRemove.style.display = 'none'; }
  }
  paintLogo();

  const businessSection = section('Your business', [
    field('Logo', el('div', { class: 'set-logo' }, [logoPreview, logoFile, logoRemove]),
      'Shown at the top of every document, in the email, and in the PDF. Stored inside this document — no hosting needed.'),
    field('Name', textInput(b.name, (v) => { b.name = v; touched(); }, { placeholder: 'Thornbury Works' })),
    field('Email', textInput(b.email, (v) => { b.email = v; touched(); }, { type: 'email' })),
    field('Phone', textInput(b.phone, (v) => { b.phone = v; touched(); })),
    field('Website', textInput(b.website, (v) => { b.website = v; touched(); })),
    field('Address line 1', textInput(b.street1, (v) => { b.street1 = v; touched(); })),
    field('Address line 2', textInput(b.street2, (v) => { b.street2 = v; touched(); })),
    field('City', textInput(b.city, (v) => { b.city = v; touched(); })),
    field('State / county', textInput(b.state, (v) => { b.state = v; touched(); })),
    field('Postcode', textInput(b.postcode, (v) => { b.postcode = v; touched(); })),
    field('Country', textInput(b.country, (v) => { b.country = v.toUpperCase(); touched(); }, { placeholder: 'GB', class: 'cmp-input--code' })),
    field('Tax number', textInput(b.taxNumber, (v) => { b.taxNumber = v; touched(); }, { placeholder: 'VAT / GST / TRN' })),
    field('Legal line', textArea(b.legalText, (v) => { b.legalText = v; touched(); }, { rows: 2, placeholder: 'Registered in England no. 01234567 · Managing director: …' }),
      'Printed small at the foot of every document. Registration number and court, managing director, share capital \u2014 whatever your jurisdiction requires on an invoice.'),
  ], { grid: true });

  // ---- money -----------------------------------------------------------------------------------
  const m = s.money;
  const moneySample = el('span', { class: 'set-sample' });

  const moneySection = section('Money', [
    field('Currency', textInput(m.currency, (v) => { m.currency = v.toUpperCase(); touched(); }, { class: 'cmp-input--code', placeholder: 'GBP' })),
    field('Symbol position', selectInput([
      opt('left', 'Left — $1,234.56'), opt('right', 'Right — 1,234.56$'),
      opt('left_space', 'Left with a space'), opt('right_space', 'Right with a space'),
    ], m.format.position, (v) => { m.format.position = v; touched(); })),
    field('Thousand separator', textInput(m.format.thousandSeparator, (v) => { m.format.thousandSeparator = v; touched(); }, { class: 'cmp-input--code' })),
    field('Decimal separator', textInput(m.format.decimalSeparator, (v) => { m.format.decimalSeparator = v; touched(); }, { class: 'cmp-input--code' })),
    field('Decimals', textInput(m.format.decimals == null ? '' : String(m.format.decimals),
      (v) => { m.format.decimals = v === '' ? null : Number(v); touched(); }, { placeholder: 'the currency decides' })),
    field('Rounding', selectInput([
      opt('halfUp', 'Half up — the usual'), opt('halfEven', 'Half to even — banker’s'),
      opt('up', 'Always up'), opt('down', 'Always down'),
    ].filter((o) => ROUNDING_MODES.includes(o.value)), m.roundingMode, (v) => { m.roundingMode = v; touched(); })),
    field('Sample', moneySample),
  ], { grid: true });

  // ---- tax --------------------------------------------------------------------------------------
  const rateHost = el('div', { class: 'set-rates' });

  // A preset is stored as an id, and the rows are rebuilt from it at runtime — which is right,
  // because a stored copy of a rate table is a snapshot that quietly goes stale. But it means the
  // editor would open empty under a dropdown saying "United Kingdom — VAT", and a rate table you
  // cannot see is one you cannot check. So the rows are materialised for display. They stay
  // display-only until something is edited, at which point the preset is dropped and they become
  // the business's own.
  if (m.taxPreset && !(m.taxRates || []).length) m.taxRates = buildPreset(m.taxPreset, m);

  const presetChooser = selectInput(
    [opt('', '— a table of my own —'), ...TAX_PRESETS.map((p) => opt(p.id, p.label))],
    m.taxPreset || '',
    (v) => {
      m.taxPreset = v || null;
      // Loading a preset fills the table so it can be SEEN and edited. Keeping the id as well means
      // it stays current until the moment somebody changes a row, at which point it is theirs.
      m.taxRates = v ? buildPreset(v, m) : m.taxRates;
      paintRates();
      touched();
      say(v ? `Loaded ${m.taxRates.length} rate rows. Check them against what you are registered for — these are a starting point, not tax advice.` : 'Edit the rows below.');
    }, { ariaLabel: 'Tax preset' });

  // Changing the mode changes which fields are even relevant, so it rebuilds rather than trying to
  // show and hide — a form with a rate table hanging under "no tax" invites somebody to fill it in.
  const modeField = field('How tax works', selectInput([
    opt('simple', 'One rate I type in'),
    opt('preset', 'A table of countries'),
    opt('none', 'I do not charge tax'),
  ], m.taxMode, (v) => {
    m.taxMode = v;
    m.taxEnabled = v !== 'none';
    if (ctx.onRebuild) ctx.onRebuild();
  }), m.taxMode === 'simple'
    ? 'The usual answer. One rate, applied to everything, whoever the client is.'
    : m.taxMode === 'preset'
      ? 'For selling across borders: the rate follows the client’s country.'
      : 'No tax is charged and none is shown.');

  // A standing exemption replaces the rate: no tax, and the sentence the law wants instead of it.
  const exemptionNote = el('span', { class: 'cmp-field__hint' });
  const paintExemption = () => {
    exemptionNote.textContent = m.exemption === 'small_business'
      ? `Printed on every document: \u201c${smallBusinessNote(m.homeCountry, m.exemptionText)}\u201d`
      : '';
  };
  const exemptionFields = [
    field('VAT exemption', selectInput(EXEMPTION_CHOICES.map((c) => opt(c.id, c.label)), m.exemption || '', (v) => {
      m.exemption = v; paintExemption(); touched();
    }), 'Below the registration threshold? The document then charges no VAT and says why, in the words your country expects.'),
    m.exemption === 'small_business' || m.exemptionText
      ? field('Wording', textInput(m.exemptionText, (v) => { m.exemptionText = v; paintExemption(); touched(); }, { placeholder: 'Leave blank for the standard sentence' }), exemptionNote)
      : null,
  ];
  paintExemption();

  const simpleFields = m.taxMode !== 'simple' ? [] : [
    field('Rate', numberInput(m.simpleRate, (v) => { m.simpleRate = v; touched(); }), 'A percentage — 20 for 20%.'),
    field('Call it', textInput(m.simpleName, (v) => { m.simpleName = v; touched(); }, { placeholder: 'VAT' }),
      'What it is called on the document: VAT, GST, MwSt, TVA, sales tax.'),
  ];

  const taxSection = section('Tax', [
    modeField,
    ...simpleFields,
    ...exemptionFields,
    field('Prices entered', selectInput([
      opt('excl', 'Without tax — it is added on'), opt('incl', 'With tax already included'),
    ], m.pricesIncludeTax ? 'incl' : 'excl', (v) => { m.pricesIncludeTax = v === 'incl'; touched(); })),
    field('Work tax out from', selectInput([
      opt('billing', 'The client’s billing address'), opt('shipping', 'The delivery address'), opt('base', 'My own address'),
    ], m.taxBasedOn, (v) => { m.taxBasedOn = v; touched(); })),
    field('Round tax', selectInput([
      opt('line', 'On each line'), opt('subtotal', 'Once, at the subtotal'),
    ], m.roundAtSubtotal ? 'subtotal' : 'line', (v) => { m.roundAtSubtotal = v === 'subtotal'; touched(); })),
    field('Show tax', selectInput([
      opt('itemized', 'Itemised — every rate on its own line'), opt('single', 'As one total'),
    ], m.displayTaxTotals, (v) => { m.displayTaxTotals = v; touched(); }),
      'A split tax — CGST and SGST, say — has to be shown split.'),
    field('My country', textInput(m.homeCountry, (v) => { m.homeCountry = v.toUpperCase(); touched(); }, { class: 'cmp-input--code', placeholder: 'GB' })),
    field('My state', textInput(m.homeState, (v) => { m.homeState = v.toUpperCase(); touched(); }, { class: 'cmp-input--code' }),
      'Needed for Indian GST, to tell a supply within your state from one outside it.'),
    field('Assume clients are in', textInput(m.defaultCustomerCountry, (v) => { m.defaultCustomerCountry = v.toUpperCase(); touched(); }, { class: 'cmp-input--code' }),
      'Used when a client record has no country of its own.'),
  ].filter(Boolean), { grid: true });

  // ---- getting paid ----------------------------------------------------------------------------
  const ibanNote = el('span', { class: 'cmp-field__hint' });
  const paintIban = () => {
    const v = b.iban || '';
    ibanNote.textContent = !v ? 'Euro invoices then carry a SEPA transfer code (GiroCode) that a banking app scans and pre-fills.'
      : looksLikeIban(v) ? `Will print as ${formatIban(v)}.`
        : 'That does not look like an IBAN yet \u2014 two letters, two digits, then the account.';
  };
  paintIban();
  const payingSection = section('Getting paid', [
    el('p', { class: 'set-lead', text: 'A code the client can scan, drawn on anything that asks for money. Euro documents with an IBAN get a SEPA transfer code; rupee documents with a UPI id get a UPI code; a payment link serves everything else. Nothing here is required, and nothing is sent anywhere \u2014 the code is drawn in this browser.' }),
    field('Account holder', textInput(b.accountHolder, (v) => { b.accountHolder = v; touched(); }, { placeholder: b.name || 'as on the bank account' }),
      'Only when it differs from the business name.'),
    field('IBAN', textInput(b.iban, (v) => { b.iban = v.replace(/\s+/g, '').toUpperCase(); paintIban(); touched(); }, { class: 'cmp-input--code', placeholder: 'DE89 3704 0044 0532 0130 00' }), ibanNote),
    field('BIC', textInput(b.bic, (v) => { b.bic = v.toUpperCase(); touched(); }, { class: 'cmp-input--code', placeholder: 'optional' })),
    field('UPI id', textInput(b.upiId, (v) => { b.upiId = v; touched(); }, { class: 'cmp-input--code', placeholder: 'name@bank' }),
      'For rupee documents.'),
    field('Payment link', textInput(b.paymentLink, (v) => { b.paymentLink = v.trim(); touched(); }, { type: 'url', placeholder: 'https://pay.example/your-page' }),
      'A Stripe payment link, PayPal.me, or your bank\u2019s own request page. Must be https.'),
    field('Payment code', selectInput([opt('yes', 'Shown when a way to pay is set up'), opt('no', 'Never shown')],
      s.document.showPayQr === false ? 'no' : 'yes', (v) => { s.document.showPayQr = v === 'yes'; touched(); })),
    field('Late payment interest', textInput(String(m.lateFeeRate ?? 8), (v) => { m.lateFeeRate = Number(v) || 0; touched(); }, { type: 'number', min: 0, max: 100, step: 0.5, class: 'cmp-input--code', ariaLabel: 'Late payment interest, per cent a year' }),
      'Per cent a year, charged on the balance for the days since the due date when you press "Add interest" on an overdue invoice. Set the rate your country\u2019s law allows: eight points over the base rate in the UK and under the EU directive, nine over the Basiszinssatz between German businesses.'),
  ], { grid: true });

  const ratesSection = section('Tax rates', [
    field('Start from', presetChooser),
    el('p', { class: 'set-lead', text: `Country, state, postcode and city narrow a row down; the most specific matching row wins at each priority level, and at most one row applies per priority. That is how CGST and SGST both apply within one state while a single IGST applies outside it. Presets as at ${RATES_UPDATED} — check them against what you are actually registered for.` }),
    rateHost,
  ]);

  function paintRates() {
    const rows = m.taxRates || [];
    const head = el('div', { class: 'set-rates__head' }, [
      el('span', { text: 'Country' }), el('span', { text: 'State' }), el('span', { text: 'Postcode' }),
      el('span', { class: 'is-num', text: 'Rate %' }), el('span', { text: 'Name' }),
      el('span', { class: 'is-num', text: 'Priority' }), el('span', { text: 'Compound' }),
      el('span', { text: 'Shipping' }), el('span', { text: 'Class' }), el('span', {}),
    ]);

    // Editing anything turns a preset into the business's own table — the id is dropped so it is
    // never silently rebuilt from the preset and their edits lost on the next load.
    const edited = () => { m.taxPreset = null; presetChooser.value = ''; touched(); };

    const body = rows.map((r, i) => el('div', { class: 'set-rates__row' }, [
      textInput(r.country, (v) => { r.country = v.toUpperCase(); edited(); }, { class: 'cmp-input--code', ariaLabel: `Row ${i + 1} country` }),
      textInput(r.state, (v) => { r.state = v.toUpperCase(); edited(); }, { class: 'cmp-input--code', ariaLabel: 'State' }),
      textInput(r.postcode, (v) => { r.postcode = v; edited(); }, { ariaLabel: 'Postcode' }),
      numberInput(r.rate, (v) => { r.rate = v; edited(); }, { ariaLabel: 'Rate' }),
      textInput(r.name, (v) => { r.name = v; edited(); }, { ariaLabel: 'Name' }),
      numberInput(r.priority, (v) => { r.priority = v || 1; edited(); }, { ariaLabel: 'Priority' }),
      checkbox(r.compound, (v) => { r.compound = v; edited(); }, 'Compound'),
      checkbox(r.shipping !== false, (v) => { r.shipping = v; edited(); }, 'Applies to shipping'),
      textInput(r.class || '', (v) => { r.class = v; edited(); }, { ariaLabel: 'Tax class', placeholder: 'standard' }),
      button('', () => { rows.splice(i, 1); paintRates(); edited(); }, { icon: '×', title: 'Remove this rate', variant: 'ghost' }),
    ]));

    rateHost.replaceChildren(
      rows.length ? el('div', { class: 'set-rates__grid' }, [head, ...body]) : el('p', { class: 'set-empty', text: 'No rates. Load a preset above, or add a row.' }),
      button('Add a rate', () => {
        rows.push({ country: m.homeCountry || '*', state: '*', postcode: '', city: '', rate: 0, name: 'Tax', priority: 1, compound: false, shipping: true, class: '' });
        paintRates(); edited();
      }, { icon: '+', variant: 'ghost' }),
    );
  }
  paintRates();

  // ---- numbering ---------------------------------------------------------------------------------
  const n = s.numbering;
  const numberSample = el('span', { class: 'set-sample' });
  const kindPrefixes = DOCUMENT_KINDS.map((k) =>
    field(k.label, textInput(n.prefixes[k.id] || '', (v) => { n.prefixes[k.id] = v; touched(); }, { class: 'cmp-input--code' })));

  const numberingSection = section('Numbering', [
    field('Digits', numberInput(n.padding, (v) => { n.padding = v; touched(); })),
    field('Start at', numberInput(n.start, (v) => { n.start = v; touched(); })),
    field('Restart', selectInput([opt('yearly', 'Every year'), opt('monthly', 'Every month'), opt('never', 'Never')],
      n.resetPeriod, (v) => { n.resetPeriod = v; touched(); })),
    field('Suffix', textInput(n.suffix, (v) => { n.suffix = v; touched(); }, { class: 'cmp-input--code' })),
    field('Next invoice number', numberSample),
    ...kindPrefixes,
  ], { grid: true });

  // ---- the document -------------------------------------------------------------------------------
  const doc = s.document;
  const documentSection = section('The document', [
    field('Language', selectInput(LANGUAGES.map((l) => opt(l.id, l.label)), doc.language || 'en', (v) => { doc.language = v; touched(); }),
      'The words on the document — Invoice, Due, Subtotal — unless a client record names its own language. Your own text is never translated.'),
    field('Layout', selectInput(LAYOUTS.map((l) => opt(l.id, l.label)), doc.layout, (v) => { doc.layout = v; touched(); })),
    field('Paper', selectInput([
      opt('a4', 'A4 — 210 × 297mm'),
      opt('letter', 'US Letter — 8.5 × 11in'),
      opt('legal', 'US Legal — 8.5 × 14in'),
      opt('a5', 'A5 — 148 × 210mm'),
      opt('receipt80', 'Till roll — 80mm'),
      opt('receipt58', 'Till roll — 58mm'),
    ], doc.paperSize, (v) => { doc.paperSize = v; touched(); }),
      'A till roll is a different shape, not a smaller sheet: one narrow column and no side-by-side addresses.'),
    field('Density', selectInput([
      opt('compact', 'Compact — fit more on a page'),
      opt('normal', 'Normal'),
      opt('roomy', 'Roomy — easier to read'),
    ], doc.density, (v) => { doc.density = v; touched(); })),
    field('Accent colour', textInput(doc.accent, (v) => { doc.accent = v; touched(); }, { placeholder: '#14509b', class: 'cmp-input--code' })),
    field('PDF fonts', selectInput([
      opt('auto', 'Embed only when needed — the usual'),
      opt('embed', 'Always embed a font'),
    ], doc.pdfFont || 'auto', (v) => { doc.pdfFont = v; }),
      'The standard PDF fonts cannot draw ł, č, ő, Greek, Cyrillic or ₹. When a document needs one of those, a font is embedded automatically; choose Always if every PDF should look the same or must be archived as PDF/A.'),
    field('Issued documents', selectInput([
      opt('lock', 'Open read-only — correct with a credit note'),
      opt('edit', 'Stay editable'),
    ], doc.lockIssued === false ? 'edit' : 'lock', (v) => { doc.lockIssued = v === 'lock'; }),
      'Once an invoice has gone out, most of Europe requires that it not be altered. Read-only can still be unlocked for the one edit that is genuinely needed.'),
    field('Label for a tax number', textInput(doc.taxNumberLabel, (v) => { doc.taxNumberLabel = v; touched(); })),
    field('Label for their reference', textInput(doc.referenceLabel, (v) => { doc.referenceLabel = v; touched(); })),
    field('Heading for payment details', textInput(doc.paymentDetailsLabel, (v) => { doc.paymentDetailsLabel = v; touched(); })),
    field('How to pay', textArea(doc.paymentDetails, (v) => { doc.paymentDetails = v; touched(); }, { rows: 3 }),
      'Shown on anything that asks for money, and never on a receipt.'),
    field('Closing line', textInput(doc.closingText, (v) => { doc.closingText = v; touched(); }, { placeholder: 'Thank you for your custom.' })),
  ], { grid: true });

  // ---- messages --------------------------------------------------------------------------------
  // One editor per event, the way WooCommerce lists its emails. The built-in text sits in the
  // fields, so editing starts from something that works rather than from a blank box; Reset takes
  // an event back to stock by deleting its override, not by copying the stock text into one.
  const msgs = s.messages;
  const messageEditors = MESSAGE_TEMPLATES.map((t) => {
    const saved = msgs[t.id] || {};
    const edited = () => el('span', { class: 'set-msg__badge', text: 'edited' });

    const subjectIn = textInput(saved.subject != null ? saved.subject : t.subject, (v) => {
      (msgs[t.id] || (msgs[t.id] = {})).subject = v;
    }, { ariaLabel: `${t.label} subject` });
    const bodyIn = textArea(saved.body != null ? saved.body : t.body, (v) => {
      (msgs[t.id] || (msgs[t.id] = {})).body = v;
    }, { rows: 7, ariaLabel: `${t.label} body` });

    const reset = button('Reset to default', () => {
      delete msgs[t.id];
      say(`${t.label} is back to the built-in wording. Press Save settings to keep that.`);
      if (ctx.onRebuild) ctx.onRebuild();
    }, { variant: 'ghost' });

    return section(t.label, [
      field('Subject', subjectIn),
      field('Body', bodyIn),
      el('div', { class: 'set-msg__row' }, [msgs[t.id] ? edited() : null, reset]),
    ]);
  });

  const messagesSection = el('div', {}, [
    section('Wording', [
      el('p', { class: 'set-lead', text: 'The covering message for each event, chosen automatically from the document\u2019s status when you open Send. Anything in {braces} is filled in per document \u2014 available: {number} {kind} {kind_lower} {status} {issued} {due} {reference} {client_name} {client_first_name} {client_email} {sender_name} {sender_email} {total} {balance} {subtotal} {tax} {amount_paid} {days_overdue} {payment_terms_line} {payment_details} {payment_link} {payment_link_line} {website} {note}. Web addresses and emails come out as links in the formatted message. An unknown placeholder is left visible rather than blanked, so a typo shows itself.' }),
    ]),
    ...messageEditors,
  ]);

  // ---- trade -----------------------------------------------------------------------------------
  // The same starting points setup offers, available for the rest of the document's life. A cafe
  // that becomes a shop should not have to recreate its document to change its wording, numbering,
  // layout and tax defaults. This section once sat unexplained at the top of the panel and earned
  // its removal; it returns as its own door, with the change listed before it is made.
  const tradeNote = el('p', { class: 'set-lead' });
  let pendingTrade = null;
  const tradeChooser = selectInput(
    [opt('', '\u2014 choose a trade \u2014'),
      ...templatesBySector().map((g) => ({ label: g.sector, options: g.items.map((t) => opt(t.id, t.label)) }))],
    '', (v) => {
      pendingTrade = findTemplate(v) || null;
      if (!pendingTrade) { tradeNote.textContent = ''; return; }
      const changes = templateChanges(pendingTrade, s);
      const what = `${pendingTrade.label}: ${templateSummary(pendingTrade).join(' \u00b7 ')}. `;
      tradeNote.textContent = what + (changes.length
        ? `Would change ${changes.length} setting${changes.length === 1 ? '' : 's'}: ${changes.map((c) => c.path.split('.').pop()).join(', ')}. Your name, address, logo and messages are never touched.`
        : 'Nothing to change \u2014 your settings already match this trade.');
    }, { ariaLabel: 'Trade' });

  const applyTradeBtn = button('Apply this trade', () => {
    if (!pendingTrade) { say('Choose a trade first.', 'warn'); return; }
    Object.assign(s, applyTemplate(pendingTrade, s));
    toast(`Applied ${pendingTrade.label}. Nothing is stored until you press Save settings.`, 'ok');
    if (ctx.onRebuild) ctx.onRebuild();
  }, { variant: 'primary' });

  const tradeSection = section('Change of trade', [
    el('p', { class: 'set-lead', text: 'The same starting point the setup offered, reapplicable any time: the document\u2019s wording, how its numbers run, the layout it opens with, and whether prices include tax. It never touches who you are \u2014 name, address, logo and saved messages stay exactly as they are \u2014 and it never touches your tables: every trade uses the same four, because what differs between trades is what is sold, not how it is stored.' }),
    field('Trade', tradeChooser),
    tradeNote,
    applyTradeBtn,
  ]);

  // ---- delivery ------------------------------------------------------------------------------------
  const del = s.delivery;
  const ei = s.einvoice;
  const einvoiceSection = section('Electronic invoices', [
    el('p', { class: 'set-lead', text: 'Structured invoices for the systems that now require them: Germany (XRechnung, ZUGFeRD), France (Factur-X), Belgium and the Nordics (Peppol). Choose the rulebook your clients expect and the Send panel gains Factur-X — a PDF with the invoice inside as XML — and the bare XML formats, with a check before each send of what a receiver would reject. Nothing is transmitted by this widget; the file goes out by whichever route you use today.' }),
    field('Profile', selectInput([
      opt('', 'Off — ordinary PDFs only'),
      ...Object.values(PROFILES).map((p) => opt(p.id, p.label)),
    ], ei.profile || '', (v) => { ei.profile = v; if (!v && ['facturx', 'ubl', 'cii'].includes(del.attachFormat)) del.attachFormat = 'pdf'; if (ctx.onRebuild) ctx.onRebuild(); }),
      'EN 16931 is the European standard every profile is built on; XRechnung and Peppol add their own required fields, which the check will ask for. Your VAT number, with its country prefix, goes in Business → Tax number.'),
    field('Peppol ID', textInput(b.peppolId, (v) => { b.peppolId = v.replace(/\s+/g, ''); touched(); }, { class: 'cmp-input--code', placeholder: '9930:DE123456789' }),
      'Your Peppol participant id as scheme:identifier — 0204 for a German Leitweg-ID, 9930 for a German VAT number, 0208 for a Belgian enterprise number. Only the Peppol profile uses it. Left empty, your VAT number stands in where Peppol has a scheme for its country; Sweden, Denmark and Norway address by organisation number and need it typed here.'),
  ]);

  const deliverySection = section('Sending', [
    el('p', { class: 'set-lead', text: 'Nothing here ever holds a password or an API key. Settings are stored in your Grist document, where everyone who can edit it can read them — so credentials belong in whatever you run at the far end, not here.' }),
    field('Attach by default', selectInput([
      opt('pdf', 'PDF — the usual'),
      ...(ei.profile ? EINVOICE_FORMATS.map((f) => opt(f.id, f.label)) : []),
      opt('none', 'Nothing — the invoice in the message only'),
    ], del.attachFormat === 'html' ? 'pdf' : del.attachFormat, (v) => { del.attachFormat = v; }),
      'The file that travels with the message. Changeable for one send in the Send panel.'),
    field('Show the invoice under your message', selectInput([
      opt('yes', 'Yes — the invoice follows your text'), opt('no', 'No — a covering note only'),
    ], del.includeInBody === false ? 'no' : 'yes', (v) => { del.includeInBody = v === 'yes'; }),
      'The invoice laid out in the email itself, below what you wrote. A client who will not open an attachment can still read it.'),
    field('Email design', selectInput(EMAIL_STYLES.map((s2) => opt(s2.id, s2.label)), del.emailStyle || 'card', (v) => { del.emailStyle = v; }),
      'How the covering email itself looks. Your logo, your name and your accent colour are what it carries — the document inside it keeps its own layout.'),
    field('Email accent', textInput(del.emailAccent, (v) => { del.emailAccent = v; }, { placeholder: '#14509b', class: 'cmp-input--code' }),
      'The colour of the rule or the band. Text on it turns black or white by itself, whichever can be read.'),
    field('Credit line', selectInput([
      opt('yes', 'Keep the small ANUPRESS line'), opt('no', 'No credit line'),
    ], del.emailCredit === false ? 'no' : 'yes', (v) => { del.emailCredit = v === 'yes'; }),
      'One line at the very bottom of the email, under your own details.'),
    field('Reply-to address', textInput(del.replyTo, (v) => { del.replyTo = v; }, { type: 'email' })),
    field('Always Cc', textInput(del.cc, (v) => { del.cc = v; }, { type: 'email' })),
    field('Always Bcc', textInput(del.bcc, (v) => { del.bcc = v; }, { type: 'email' }),
      'A copy to your own accounts address is the usual reason.'),
    field('Your endpoint', textInput(del.endpoint, (v) => { del.endpoint = v.trim(); }, { type: 'url', placeholder: 'https://your-relay.example/send' }),
      'Only used by the Direct route in the send panel, and only when you press send.'),
  ], { grid: true });

  // ---- samples --------------------------------------------------------------------------------------
  function paintSamples() {
    moneySample.textContent = formatMoney(1234.5, { ...m.format, currency: m.currency });
    const next = nextNumber(existingNumbers, numberFormatFor(s, 'invoice'), new Date());
    numberSample.textContent = next.number;
  }
  paintSamples();

  const saveBtn = button('Save settings', async () => {
    saveBtn.disabled = true;
    const res = await onSave(s);
    saveBtn.disabled = false;
    say(res.warning || (res.storedInTable ? 'Saved into your document.' : 'Saved.'), res.warning ? 'warn' : 'ok');
  }, { variant: 'primary' });

  const groups = {
    business: [businessSection, tradeSection],
    // The rate grid only when there is a table to show. A grid sitting under "one rate I type in"
    // is an invitation to fill in something that will never be read.
    money: [moneySection, taxSection, m.taxMode === 'preset' ? ratesSection : null, payingSection],
    numbering: [numberingSection],
    document: [documentSection],
    messages: [messagesSection],
    sending: [einvoiceSection, deliverySection],
  };

  const tabStrip = el('div', { class: 'set-tabs', role: 'tablist' }, TABS.map((t) => {
    const b = el('button', {
      class: 'set-tab' + (t.id === activeTab ? ' is-active' : ''),
      type: 'button', role: 'tab', 'aria-selected': t.id === activeTab ? 'true' : 'false',
      text: t.label,
    });
    b.addEventListener('click', () => {
      if (t.id === activeTab) return;
      activeTab = t.id;
      if (ctx.onRebuild) ctx.onRebuild();
    });
    return b;
  }));

  return el('div', { class: 'set' }, [
    el('div', { class: 'set-bar' }, [
      el('strong', { text: 'Settings' }),
      el('div', { class: 'set-bar__spacer' }),
      saveBtn,
      button('Close', onClose),
    ]),
    tabStrip,
    ...(groups[activeTab] || groups.business),
    statusLine,
  ]);
}

function checkbox(checked, onChange, label) {
  const input = el('input', { type: 'checkbox', checked: checked ? true : null, 'aria-label': label });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'set-check' }, [input]);
}

/**
 * An uploaded file, turned into the two data URIs the settings store.
 *
 * Scaled to at most 560×200 — display size, not print resolution, and the cap in sanitise() is a
 * hard limit this has to land under. PNG is kept while it stays small so a transparent logo stays
 * transparent; past ~120KB it flattens to JPEG, and the JPEG copy is made either way because the
 * PDF can embed nothing else. The flattening is onto white, which is the paper it will sit on.
 */
function readLogo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, 560 / img.naturalWidth, 200 / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));

        const draw = (flatten) => {
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const cx = canvas.getContext('2d');
          if (flatten) { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h); }
          cx.drawImage(img, 0, 0, w, h);
          return canvas;
        };

        const png = draw(false).toDataURL('image/png');
        const jpeg = draw(true).toDataURL('image/jpeg', 0.87);
        resolve({ logoData: png.length <= 120000 ? png : jpeg, logoJpeg: jpeg });
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}
