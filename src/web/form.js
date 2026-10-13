// The form beside the document.
//
// One column of plain sections, built from the same controls the Grist composer uses, so a field
// behaves the same way in both places. Every control writes into the draft or the stored settings
// IN PLACE and then repaints the document only. Rebuilding the form under a cursor is how a form
// loses what is being typed into it — the composer learned that the hard way and the rule is the
// same here: `onEdit` for a value, `onRebuild` only when the shape changes (a line added, a kind
// chosen, a whole trade applied).
//
// Every visible word comes through `t`, the page's translator (see strings.js): the form speaks
// the page's language, the document speaks the client's.

import { el } from '../core/util.js';
import { icons, SECTION_ICON } from './icons.js';
import { formatMoney } from '../money/currency.js';
import { field as baseField, textInput, numberInput, textArea, selectInput, suggestInput, button, section } from '../compose/ui.js';
import { renderLinesGrid } from '../compose/lines-grid.js';
import { fieldsFor } from '../doc/fields.js';
import { LANGUAGES } from '../doc/lang.js';
import { asOptions, COUNTRIES, CURRENCIES, PAYMENT_TERMS } from '../model/suggest.js';
import { TAX_PRESETS } from '../money/tax/rates.js';
import { readLogo } from '../settings/logo.js';
import { PROFILES } from '../einvoice/index.js';
import { SCHEMES, schemeFor, ibanExample } from '../doc/banking.js';

/**
 * Help that waits to be asked for.
 *
 * A sentence under every box turns a form into a wall of grey text, and the sentences that matter
 * — the reverse charge, the Leitweg-ID, the white plate behind a logo — are the long ones, so the
 * wall is tallest where the form should feel simplest. Long help moves into a pop-over behind an
 * (i) button beside the label; short help stays where it is, because a four-word hint is faster
 * read than clicked. Same control, same manners, as the PDF tools.
 */
const TIP_AT = 52;   // characters: longer than this and the hint becomes a button

let tipsWired = false;
function wireTips() {
  if (tipsWired || typeof document === 'undefined') return;
  tipsWired = true;
  // A click inside the field that owns the tip leaves it open; anywhere else puts it away. It has
  // to be the whole field, not just the button: these fields are <label>s, and a browser answers a
  // click on a label with a second click on the box it names — which would otherwise shut the tip
  // in the same gesture that opened it.
  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('.apiv-field--tip, .apiv-check')) closeTips();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTips(); });
}

function closeTips() {
  document.querySelectorAll('.apiv-tipbtn[aria-expanded="true"]').forEach((b) => {
    b.setAttribute('aria-expanded', 'false');
    const tip = b.parentElement && b.parentElement.parentElement
      && b.parentElement.parentElement.querySelector('.apiv-tip');
    if (tip) tip.hidden = true;
  });
}

/** The (i) button and its pop-over, for one label. `t` is the page's translator. */
function tipFor(label, text, t) {
  wireTips();
  const tip = el('div', { class: 'apiv-tip', role: 'note', hidden: true }, [
    el('span', { text }),
  ]);
  const btn = el('button', {
    class: 'apiv-tipbtn',
    type: 'button',
    'aria-expanded': 'false',
    'aria-label': t('aboutField', { label }),
    title: t('whatIsThis'),
    html: icons.info,
  });
  btn.addEventListener('click', (e) => {
    // Inside a <label>, so a plain click would also focus the field and the tip would open and
    // shut in the same gesture.
    e.preventDefault();
    e.stopPropagation();
    const open = btn.getAttribute('aria-expanded') !== 'true';
    closeTips();
    if (!open) return;
    btn.setAttribute('aria-expanded', 'true');
    tip.hidden = false;
    // Open upwards when there is no room below, so a tip on the last field of a section does not
    // hang past the card.
    const box = tip.getBoundingClientRect();
    tip.dataset.up = String(box.bottom > (window.innerHeight || 0) - 12);
  });
  return { btn, tip };
}

/** A checkbox that reads as a sentence rather than as a field with a label above it. */
function check(label, value, onChange, hint, t) {
  const box = el('input', { type: 'checkbox', class: 'apiv-check__box' });
  box.checked = !!value;
  box.addEventListener('change', () => onChange(box.checked));
  const long = t && hint && hint.length > TIP_AT;
  const tip = long ? tipFor(label, hint, t) : null;
  return el('label', { class: 'apiv-check' }, [
    box,
    el('span', { class: 'apiv-check__text' }, [
      el('span', { class: 'apiv-check__head' }, [el('span', { text: label }), tip ? tip.btn : null]),
      tip ? tip.tip : (hint ? el('span', { class: 'cmp-field__hint', text: hint }) : null),
    ]),
  ]);
}

const dateInput = (value, onInput) => textInput(value, onInput, { type: 'date' });

/**
 * The logo: choose a file, see it, remove it.
 *
 * The file never leaves the page. It is drawn onto a canvas, scaled down, and kept as text inside
 * the settings — which is also why it can be remembered in this browser and printed into a PDF
 * without anything being hosted anywhere.
 */
function logoControl(biz, doc, onEdit, onRebuild, t) {
  const note = el('p', { class: 'cmp-field__hint' });
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'apiv-logo__file', 'aria-label': t('chooseLogo') });

  file.addEventListener('change', async () => {
    const chosen = file.files && file.files[0];
    if (!chosen) return;
    try {
      const out = await readLogo(chosen);
      biz.logoData = out.logoData;
      biz.logoJpeg = out.logoJpeg;
      biz.logoLight = !!out.logoLight;
      // A mark drawn light for a dark ground gets no plate; one drawn for paper gets one. The
      // person can flip it below either way.
      doc.logoPlate = !out.logoLight;
      onRebuild();
    } catch {
      note.textContent = t('logoError');
    }
  });

  const remove = button(t('remove'), () => {
    biz.logoData = null;
    biz.logoJpeg = null;
    biz.logoLight = false;
    onRebuild();
  }, { variant: 'ghost' });

  const check = (label, value, onChange, hint) => {
    const box = el('input', { type: 'checkbox', class: 'apiv-check__box' });
    box.checked = !!value;
    box.addEventListener('change', () => onChange(box.checked));
    return el('label', { class: 'apiv-check' }, [box, el('span', { class: 'apiv-check__text' }, [
      el('span', { text: label }), hint ? el('span', { class: 'cmp-field__hint', text: hint }) : null,
    ])]);
  };

  // The preview sits on a checkerboard, the way every image editor shows transparency, so a
  // transparent PNG reads as transparent rather than as "white box".
  const preview = biz.logoData ? el('div', { class: 'apiv-logo__stage' }, [
    el('img', { class: 'apiv-logo__img', src: biz.logoData, alt: t('logoAlt') }),
  ]) : null;

  const options = biz.logoData ? el('div', { class: 'apiv-logo__options' }, [
    el('label', { class: 'apiv-choose' }, [
      el('span', { class: 'apiv-choose__label', text: t('logoSize') }),
      selectInput([
        { value: 'small', label: t('logoSmall') }, { value: 'normal', label: t('logoNormal') }, { value: 'large', label: t('logoLarge') },
      ], doc.logoSize || 'normal', (v) => { doc.logoSize = v; onEdit(); }, { ariaLabel: t('logoSize') }),
    ]),
    check(t('logoPlate'), doc.logoPlate !== false, (v) => { doc.logoPlate = v; onEdit(); }, t('logoPlateHint'), t),
    check(t('logoOnly'), doc.logoOnly, (v) => { doc.logoOnly = v; onEdit(); }, t('logoOnlyHint'), t),
  ]) : null;

  return el('div', { class: 'apiv-logo' }, [
    preview,
    el('div', { class: 'apiv-logo__controls' }, [file, biz.logoData ? remove : null]),
    options,
    note,
  ]);
}

export function renderForm(ctx) {
  const { draft, stored, settings, onRebuild, t } = ctx;
  // Every repaint also refreshes the section heads, which show what each section is holding.
  const onEdit = () => { ctx.onEdit(); refreshHeads(); };
  const isOpen = ctx.isOpen || (() => true);
  const onToggle = ctx.onToggle || (() => {});
  const fields = fieldsFor(draft, settings);
  const biz = stored.business;
  const money = stored.money;
  const doc = stored.document;

  /**
   * Write one key and repaint. `after` swaps the repaint for a full rebuild where the shape moves.
   *
   * The section heads are refreshed after the repaint, not before it: they show the document's
   * own numbers, and those are recalculated by the repaint.
   */
  const put = (obj, key, after) => (v) => { obj[key] = v; (after || onEdit)(); };

  /**
   * Long help becomes an (i) pop-over; short help stays under the box.
   *
   * Deliberately shadows the shared `field` for the rest of this file, so every one of the forty
   * call sites below gets the rule without repeating it at each one.
   */
  const field = (label, control, hint, opts) => {
    if (!hint || String(hint).length <= TIP_AT) return baseField(label, control, hint, opts);
    const node = baseField(label, control, null, opts);
    const { btn, tip } = tipFor(label, hint, t);
    const name = node.querySelector('.cmp-field__label');
    // The button joins the label on its own line rather than becoming a row of its own: a field
    // is a flex column, so a bare sibling would push the input down a step.
    if (name) {
      const head = el('span', { class: 'apiv-field__head' });
      name.replaceWith(head);
      head.append(name, btn);
    } else {
      node.prepend(btn);
    }
    node.append(tip);
    node.classList.add('apiv-field--tip');
    return node;
  };

  /**
   * A section that folds.
   *
   * Which ones start open is the app's decision (a phone folds the money and the wording; a wide
   * screen opens everything), and a section stays the way the person left it across rebuilds,
   * because a form that re-opens what you closed every time you add a line is a form fighting you.
   */
  const heads = new Map();
  const sec = (id, title, children, opts = {}) => {
    const d = el('details', { class: 'apiv-sec cmp-section', 'data-section': id });
    d.open = !!isOpen(id);
    d.addEventListener('toggle', () => {
      onToggle(id, d.open);
      // One section at a time: opening one folds the others, so the form is never longer than
      // the part being worked on. Their own toggle events keep the app's record straight.
      if (d.open && d.parentElement) {
        d.parentElement.querySelectorAll('details.apiv-sec[open]').forEach((o) => { if (o !== d) o.open = false; });
      }
    });
    const says = el('span', { class: 'apiv-sec__says' });
    heads.set(id, says);
    d.append(
      el('summary', {}, [
        el('span', { class: 'apiv-sec__icon', html: icons[SECTION_ICON[id]] || icons.document }),
        el('span', { class: 'apiv-sec__head' }, [
          el('h3', { class: 'cmp-section__title', text: title }),
          says,
        ]),
      ]),
      el('div', { class: 'cmp-section__body' + (opts.grid ? ' is-grid' : '') }, children),
    );
    return d;
  };

  /**
   * What a folded section says about itself.
   *
   * Seven headings in a column tell a visitor nothing about what they have already done. Each head
   * carries the one fact its section is holding — the business name, the client, the number, what
   * the lines come to — so a folded form still reads as a summary of the document instead of as a
   * filing cabinet. Values, never words: nothing here needs translating.
   */
  function headline(id) {
    const text = (v) => String(v == null ? '' : v).trim();
    const totals = draft.totals || {};
    const M = (v) => (v == null ? '' : formatMoney(v, draft.format || { currency: draft.currency }));
    switch (id) {
      case 'you': return text(biz.name);
      case 'client': return text(draft.client && draft.client.name);
      case 'doc': return text(draft.number);
      case 'items': {
        const lines = (draft.lines || []).filter((l) => text(l.description));
        return lines.length ? M(totals.total) : '';
      }
      case 'money': {
        const rate = (totals.taxLines || [])[0];
        const bits = [text(money.currency)];
        if (rate && rate.rate != null) bits.push(`${Number(rate.rate)}%`);
        return bits.filter(Boolean).join(' · ');
      }
      case 'paid': {
        const acc = text(biz.accountNumber) || text(biz.iban);
        if (acc) return '•••• ' + acc.slice(-4);
        const link = text(biz.paymentLink);
        return link ? link.replace(/^https:\/\//i, '').split('/')[0] : '';
      }
      case 'words': return text(draft.terms);
      default: return '';
    }
  }

  function refreshHeads() {
    for (const [id, node] of heads) {
      const says = headline(id);
      node.textContent = says;
      node.hidden = !says;
    }
  }

  /** The browser's autofill knows a business's own address; tell it which box is which. */
  const auto = (input, token) => { input.setAttribute('autocomplete', token); return input; };

  /** The address half of a party, identical for the sender and the client. */
  const address = (p, own) => [
    field(t('street'), own ? auto(textInput(p.street1, put(p, 'street1')), 'address-line1') : textInput(p.street1, put(p, 'street1')), null, { wide: true }),
    field(t('street2'), own ? auto(textInput(p.street2, put(p, 'street2')), 'address-line2') : textInput(p.street2, put(p, 'street2')), null, { wide: true }),
    field(t('city'), own ? auto(textInput(p.city, put(p, 'city')), 'address-level2') : textInput(p.city, put(p, 'city'))),
    field(t('postcode'), own ? auto(textInput(p.postcode, put(p, 'postcode')), 'postal-code') : textInput(p.postcode, put(p, 'postcode'))),
    field(t('region'), own ? auto(textInput(p.state, put(p, 'state')), 'address-level1') : textInput(p.state, put(p, 'state'))),
    // The business's own country also decides which bank boxes the "How they pay you" section
    // shows, so that section is refreshed when it changes — the section, not the form, because a
    // form rebuilt under a cursor loses the letters being typed into it.
    field(t('country'), suggestInput(p.country, own ? (v) => { p.country = v; onEdit(); refreshPaid(); } : put(p, 'country'),
      { options: asOptions(COUNTRIES), placeholder: 'DE' }), t('countryHint')),
  ];

  // ---- who is sending -----------------------------------------------------------------------
  const you = sec('you', t('yourBusiness'), [
    field(t('businessName'), auto(textInput(biz.name, put(biz, 'name'), { placeholder: 'Mustermann Fliesen' }), 'organization'), null, { wide: true }),
    field(t('email'), auto(textInput(biz.email, put(biz, 'email'), { type: 'email' }), 'email')),
    field(t('phone'), auto(textInput(biz.phone, put(biz, 'phone'), { type: 'tel' }), 'tel')),
    ...address(biz, true),
    field(t('website'), auto(textInput(biz.website, put(biz, 'website'), { inputmode: 'url' }), 'url')),
    field(doc.taxNumberLabel || 'Tax ID', textInput(biz.taxNumber, put(biz, 'taxNumber'), { placeholder: 'DE123456789' }),
      t('taxIdHint')),
    field(t('legalLine'), textArea(biz.legalText, put(biz, 'legalText'), { rows: 2 }), t('legalLineHint'), { wide: true }),
    field(t('logo'), logoControl(biz, doc, onEdit, onRebuild, t), t('logoHint'), { wide: true }),
    field(t('accent'), el('div', { class: 'apiv-accent' }, [
      (() => {
        const c = el('input', { type: 'color', class: 'apiv-accent__pick', value: doc.accent || '#14509b', 'aria-label': t('accent') });
        c.addEventListener('input', () => { doc.accent = c.value; onEdit(); });
        return c;
      })(),
      doc.accent ? button(t('useDefault'), () => { doc.accent = ''; onRebuild(); }, { variant: 'ghost' }) : null,
    ]), t('accentHint')),
  ], { grid: true });

  // ---- who is being billed ------------------------------------------------------------------
  const client = sec('client', t('yourClient'), [
    field(t('name'), textInput(draft.client.name, put(draft.client, 'name'), { placeholder: 'Bäckerei Schmidt GmbH' }), null, { wide: true }),
    field(t('email'), textInput(draft.client.email, put(draft.client, 'email'), { type: 'email' })),
    field(t('theirTax'), textInput(draft.client.taxNumber, put(draft.client, 'taxNumber'))),
    ...address(draft.client),
    field(t('language'), selectInput(
      [{ value: '', label: t('followDocument') }, ...LANGUAGES.map((l) => ({ value: l.id, label: l.label }))],
      draft.client.language, put(draft.client, 'language')),
      t('languageHint')),
  ], { grid: true });

  // ---- the document itself ------------------------------------------------------------------
  const dates = sec('doc', t('theDocument'), [
    field(t('number'), textInput(draft.number, put(draft, 'number'), { placeholder: 'INV-2026-0001' })),
    field(fields.referenceLabel || doc.referenceLabel || 'Your reference', textInput(draft.reference, put(draft, 'reference'))),
    field(t('issued'), dateInput(draft.issued, put(draft, 'issued'))),
    field(fields.dateLabels?.second || t('due'), dateInput(draft.due, put(draft, 'due'))),
    field(t('serviceDate'), dateInput(draft.serviceDate, put(draft, 'serviceDate')), t('serviceDateHint')),
    field(t('rulebook'), selectInput(
      [{ value: '', label: t('rulebookNone') }, ...Object.values(PROFILES).map((p) => ({ value: p.id, label: p.label }))],
      stored.einvoice.profile, (v) => { stored.einvoice.profile = v; onRebuild(); }),
      t('rulebookHint'), { wide: true }),
    stored.einvoice.profile === 'xrechnung'
      ? field(t('leitweg'), textInput(draft.reference, put(draft, 'reference'), { placeholder: '04011000-1234512345-06' }),
        t('leitwegHint'), { wide: true })
      : null,
  ], { grid: true });

  // ---- what is being billed -----------------------------------------------------------------
  const gridHost = el('div');
  gridHost.replaceChildren(renderLinesGrid(draft, {
    products: null,
    fields,
    onEdit,
    onStructure: onRebuild,
    onAddProduct: null,
  }));
  const items = sec('items', t('items'), [gridHost]);

  // ---- money --------------------------------------------------------------------------------
  // Four ways, one engine. "Your own table" is the preset mode with no preset chosen: the rows
  // are the business's own, typed in, and go through exactly the same matcher as a country table.
  const uiTaxMode = money.taxMode === 'preset' && !money.taxPreset ? 'custom' : money.taxMode;
  const blankRow = () => ({ country: '*', state: '*', postcode: '', city: '', rate: 0, name: 'VAT', priority: 1, compound: false, shipping: true, class: '' });

  const taxRows = [];
  if (uiTaxMode === 'simple') {
    taxRows.push(field(t('ratePercent'), numberInput(money.simpleRate, put(money, 'simpleRate'))));
    taxRows.push(field(t('taxName'), textInput(money.simpleName, put(money, 'simpleName'), { placeholder: 'VAT' }), t('taxNameHint')));
  } else if (uiTaxMode === 'preset') {
    taxRows.push(field(t('rateTable'), selectInput(
      TAX_PRESETS.map((p) => ({ value: p.id, label: p.label })),
      money.taxPreset || TAX_PRESETS[0]?.id,
      (v) => { money.taxPreset = v; onRebuild(); }),
      t('rateTableHint'), { wide: true }));
    taxRows.push(field(t('yourCountry'), suggestInput(money.homeCountry, put(money, 'homeCountry'), { options: asOptions(COUNTRIES) })));
    taxRows.push(field(t('yourRegion'), textInput(money.homeState, put(money, 'homeState'))));
  } else if (uiTaxMode === 'custom') {
    if (!Array.isArray(money.taxRates) || !money.taxRates.length) money.taxRates = [blankRow()];
    const rows = money.taxRates;
    const table = el('div', { class: 'apiv-rates' }, [
      el('div', { class: 'apiv-rates__head' }, [
        el('span', { text: t('rowCountry') }), el('span', { text: t('rowRegion') }),
        el('span', { text: t('rowRate') }), el('span', { text: t('rowName') }), el('span'),
      ]),
      ...rows.map((r, i) => el('div', { class: 'apiv-rates__row' }, [
        suggestInput(r.country === '*' ? '' : r.country, (v) => { r.country = v.trim().toUpperCase() || '*'; onEdit(); },
          { options: asOptions(COUNTRIES), placeholder: t('rowAnywhere'), ariaLabel: t('rowCountry') }),
        textInput(r.state === '*' ? '' : r.state, (v) => { r.state = v.trim() || '*'; onEdit(); }, { placeholder: t('rowAnywhere'), ariaLabel: t('rowRegion') }),
        numberInput(r.rate, (v) => { r.rate = v; onEdit(); }, { ariaLabel: t('rowRate') }),
        textInput(r.name, (v) => { r.name = v; onEdit(); }, { placeholder: 'VAT', ariaLabel: t('rowName') }),
        button('', () => { rows.splice(i, 1); if (!rows.length) rows.push(blankRow()); onRebuild(); }, { variant: 'ghost', icon: '×', title: t('removeRow') }),
      ])),
      button(t('addRow'), () => { rows.push(blankRow()); onRebuild(); }, { variant: 'ghost', icon: '+' }),
    ]);
    taxRows.push(field(t('yourRates'), table, t('customHint'), { wide: true }));
    taxRows.push(field(t('yourCountry'), suggestInput(money.homeCountry, put(money, 'homeCountry'), { options: asOptions(COUNTRIES) })));
  }

  const moneySection = sec('money', t('moneyTax'), [
    field(t('currency'), suggestInput(money.currency, (v) => {
      money.currency = v;
      draft.format = { ...(draft.format || {}), currency: v };
      onEdit();
      refreshPaid();   // euros get the SEPA-code hint under the IBAN box, the rest do not
    }, { options: asOptions(CURRENCIES) })),
    field(t('howTax'), selectInput([
      { value: 'simple', label: t('taxSimple') },
      { value: 'preset', label: t('taxPreset') },
      { value: 'custom', label: t('taxCustom') },
      { value: 'none', label: t('taxNone') },
    ], uiTaxMode, (v) => {
      if (v === 'custom') {
        money.taxMode = 'preset';
        money.taxPreset = null;
        if (!Array.isArray(money.taxRates) || !money.taxRates.length) money.taxRates = [blankRow()];
      } else if (v === 'preset') {
        money.taxMode = 'preset';
        if (!money.taxPreset) money.taxPreset = TAX_PRESETS[0] ? TAX_PRESETS[0].id : null;
      } else {
        money.taxMode = v;
      }
      onRebuild();
    })),
    ...taxRows,
    money.taxMode !== 'none'
      ? check(t('pricesInclude'), money.pricesIncludeTax, (v) => { money.pricesIncludeTax = v; onEdit(); }, t('pricesIncludeHint'), t)
      : null,
    field(t('discount'), numberInput(draft.discountAmount, put(draft, 'discountAmount'))),
    field(t('discountFor'), textInput(draft.discountLabel, put(draft, 'discountLabel'), { placeholder: t('discountPlaceholder') })),
    field(t('shipping'), numberInput(draft.shippingAmount, put(draft, 'shippingAmount'))),
    field(t('alreadyPaid'), numberInput(draft.amountPaid, put(draft, 'amountPaid')), t('alreadyPaidHint')),
  ], { grid: true });

  // ---- getting paid -------------------------------------------------------------------------
  // The boxes follow the country the business banks in (doc/banking.js): sort code and account
  // number for the UK, routing number for the US, UPI and IFSC for India, IBAN where accounts are
  // IBANs. The currency only changes the hint — euros get the scannable SEPA code, the rest get
  // the account in words — and the section says on its first line which country it is set for.
  const countryName = (cc) => {
    const code = String(cc || '').trim().toUpperCase();
    const hit = COUNTRIES.find((c) => c[0] === code);
    return hit ? hit[1] : (code || '—');
  };
  const paidKey = () => schemeFor(biz.country) + ':' + (String(money.currency || '').toUpperCase() === 'EUR' ? 'eur' : 'other');
  const paidFields = () => {
    const id = schemeFor(biz.country);
    const S = SCHEMES[id];
    const euro = String(money.currency || '').toUpperCase() === 'EUR';
    const out = [el('p', { class: 'cmp-field__hint apiv-sec__note', text: t('paidFor', { country: countryName(biz.country) }) })];
    if (S.upi) out.push(field(t('upi'), textInput(biz.upiId, put(biz, 'upiId'), { placeholder: 'name@upi' }), t('upiHint')));
    if (S.code) out.push(field(t(S.code), textInput(biz.bankCode, put(biz, 'bankCode'), { placeholder: S.codeHint })));
    if (S.account) out.push(field(t('accountNumber'), textInput(biz.accountNumber, put(biz, 'accountNumber'), { placeholder: S.account })));
    out.push(field(t('accountHolder'), textInput(biz.accountHolder, put(biz, 'accountHolder'), { placeholder: biz.name || '' }), t('accountHolderHint')));
    if (S.bankName) out.push(field(t('bankName'), textInput(biz.bankName, put(biz, 'bankName'))));
    if (S.iban) {
      const hint = id === 'iban' ? (euro ? t('ibanHint') : t('ibanNonEuroHint')) : t('abroadHint');
      out.push(field('IBAN', textInput(biz.iban, put(biz, 'iban'), { placeholder: ibanExample(biz.country) }), hint, { wide: true }));
    }
    if (S.bic) out.push(field(t('bic'), textInput(biz.bic, put(biz, 'bic'), { placeholder: 'BARCGB22' }), id === 'iban' ? null : t('abroadHint')));
    out.push(field(t('paymentLink'), textInput(biz.paymentLink, put(biz, 'paymentLink'), { placeholder: 'https://' }), t('paymentLinkHint'), { wide: true }));
    out.push(field(doc.paymentDetailsLabel || t('howToPay'), textArea(doc.paymentDetails, put(doc, 'paymentDetails'), { rows: 3 }), t('howToPayHint'), { wide: true }));
    return out;
  };
  const paid = sec('paid', t('howTheyPay'), paidFields(), { grid: true });
  let paidShown = paidKey();
  /** Redraw the bank boxes when the country or the currency has moved them; nothing otherwise. */
  function refreshPaid() {
    const now = paidKey();
    if (now === paidShown) return;
    paidShown = now;
    paid.querySelector('.cmp-section__body').replaceChildren(...paidFields());
  }

  // ---- wording ------------------------------------------------------------------------------
  const words = sec('words', t('whatItSays'), [
    field(t('terms'), suggestInput(draft.terms, put(draft, 'terms'), { options: asOptions(PAYMENT_TERMS) }), null, { wide: true }),
    field(t('note'), textArea(draft.note, put(draft, 'note'), { rows: 2 }), null, { wide: true }),
    field(t('closing'), textArea(doc.closingText, put(doc, 'closingText'), { rows: 2 }), t('closingHint'), { wide: true }),
    check(t('creditKeep'), doc.creditLine, (v) => { doc.creditLine = v; onEdit(); }, t('creditHint'), t),
  ], { grid: true });

  refreshHeads();
  return el('div', { class: 'apiv-form' }, [you, client, dates, items, moneySection, paid, words]);
}
