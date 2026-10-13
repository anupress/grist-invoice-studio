// Four ways to introduce the sender at the top of the page.
//
// They differ only in the masthead. The parties, the lines, the totals and the terms below are
// identical in all four, because those are the parts a reader is trying to extract information
// from and there is nothing to gain by moving them around. The top of the page is where a business
// carries its identity, so that is the part that varies.
//
//   classic     a split masthead with an accent rule — the default, and the most neutral
//   banded      a full-width colour band with the mark centred; the most formal, and the one that
//               survives being folded into a window envelope
//   letterhead  a tinted strip, business on the left and mark on the right, like printed stationery
//   minimal     hairline rules and no colour at all, for the most conservative recipient
//   slate       a full-width dark block, brand left and title right — the corporate letterhead
//   headline    the document's own word writ large across the top, editorial rather than clerical
//   rail        a thick accent edge down the left of the masthead, everything ranged left
//   centred     mark, name, word and number stacked on the centre line, like an engraved card
//   ledger      the shop invoice: the client in the window-envelope position, the mark opposite,
//               a grid of dates and numbers, then the document's word as a heading over a ruled,
//               numbered table. The sender moves to a three-column foot (see render.js) the way
//               commercial stationery carries it. Modelled on the invoice every online shop sends.
//   din5008b    the German business letter, DIN 5008 Form B: the address field exactly where a
//   din5008a    DIN lang window envelope shows it, an information block beside it, the subject
//               line below, fold and punch marks on the left edge. Form A is the same sheet with
//               a shorter letterhead, so the address sits 18mm higher. The sender's registrations
//               go to the foot (the Geschäftsangaben), as on the ledger. See DIN below.
//
// Keeping them to one shared body is deliberate: four full templates would be four places to fix
// every future change to how a total is presented. The ledger bends that rule the least it can:
// its masthead absorbs the client and the meta column, and the renderer moves the sender to the
// foot; the lines, the totals and the wording are the shared ones. The DIN sheets bend it the
// same way, and no further.

import { el } from '../core/util.js';

export const LAYOUTS = [
  { id: 'classic', label: 'Classic' },
  { id: 'banded', label: 'Banded' },
  { id: 'letterhead', label: 'Letterhead' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'slate', label: 'Slate' },
  { id: 'headline', label: 'Headline' },
  { id: 'rail', label: 'Rail' },
  { id: 'centred', label: 'Centred' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'din5008b', label: 'DIN 5008 (Form B)' },
  { id: 'din5008a', label: 'DIN 5008 (Form A)' },
];

/**
 * DIN 5008, in millimetres.
 *
 * The German standard for business letters fixes where things go on an A4 sheet, and the point
 * of fixing them is the envelope: a letter folded at the fold marks and put in a DIN lang window
 * envelope shows exactly the address field, and nothing else, through the window. A sheet that
 * is nearly right is a sheet that has to be put in an envelope by hand with the address written
 * on it, which is why a German business cannot use a layout that is nearly right.
 *
 * What every form shares: the address field 20mm from the left edge, 85mm wide and 45mm high —
 * a 5mm return-address line (the Rücksendeangabe), 12.7mm for remarks (three lines), then 27.3mm
 * for the address itself (six lines of 4.23mm, which is 12pt); the information block 125mm from
 * the left edge, starting 5mm below the field's top, at most 75mm wide; the subject two lines
 * (8.46mm) below the field; text at 25mm from the left edge with a 20mm right margin; the punch
 * mark at 148.5mm, half-way down the sheet.
 *
 * What differs is the letterhead's height: Form B gives it 45mm and is the usual commercial
 * sheet; Form A gives it 27mm, and everything below it moves up by 18mm, the fold marks included.
 */
export const DIN = {
  addrLeft: 20, addrWidth: 85, addrHeight: 45,
  returnZone: 5, remarkZone: 12.7,
  infoLeft: 125, infoWidth: 75,
  textLeft: 25, textRight: 20,
  subjectGap: 8.46, line: 4.23,
  foldLength: 5, punchLength: 8,
};

export const DIN_FORMS = {
  din5008b: { form: 'B', addrTop: 45, infoTop: 50, fold: [105, 210], punch: 148.5 },
  din5008a: { form: 'A', addrTop: 27, infoTop: 32, fold: [87, 192], punch: 148.5 },
};

/** Does this layout carry the client and the meta column in its masthead, and the sender in the foot? */
export const isLedger = (id) => id === 'ledger';

/** One of the two DIN 5008 sheets. */
export const isDin = (id) => Object.prototype.hasOwnProperty.call(DIN_FORMS, String(id || ''));

/**
 * A layout that puts the client where a window envelope shows it and the sender in the foot.
 *
 * The renderer, the PDF and the fields all branch on this rather than on the ledger by name, so
 * the DIN sheets inherit everything the ledger learned: no From block, the number in the meta
 * grid, the delivery address beside the totals, numbered lines, the registrations in the foot.
 */
export const isWindowed = (id) => isLedger(id) || isDin(id);

export const isLayout = (id) => LAYOUTS.some((l) => l.id === id);

/**
 * Build the masthead.
 *
 * `ctx` carries what every treatment needs: the sender, the word for this kind of document, its
 * number, and the already-built status pill and derived-number warning so none of them is
 * constructed twice.
 */
export function renderMasthead(layout, ctx) {
  const id = isLayout(layout) ? layout : 'classic';
  switch (id) {
    case 'banded': return banded(ctx);
    case 'letterhead': return letterhead(ctx);
    case 'slate': return slate(ctx);
    case 'headline': return headline(ctx);
    case 'rail': return rail(ctx);
    case 'centred': return centred(ctx);
    case 'ledger': return ledger(ctx);
    case 'din5008a':
    case 'din5008b': return din(ctx, DIN_FORMS[id]);
    default: return split(ctx, id);   // classic and minimal share the split masthead
  }
}

/** The mark, with a white plate behind it where the layout asks for one and the setting allows. */
function logo(ctx, cls) {
  if (!ctx.sender.logoData) return null;
  return el('img', { class: cls + (ctx.logoPlate === false ? '' : ' is-plated'), src: ctx.sender.logoData, alt: ctx.sender.name || '' });
}

/** Does the masthead say the name in words? Not when the mark is the name and the setting says so. */
const namesItself = (ctx) => !(ctx.logoOnly && ctx.sender.logoData);

/** The identity block: a mark if there is one, then the business name. */
function brand(ctx, cls) {
  return el('div', { class: cls || 'inv-brand' }, [
    logo(ctx, 'inv-brand__logo'),
    namesItself(ctx) ? el('div', {}, [
      el('div', { class: 'inv-brand__name', text: ctx.sender.name || 'Your business' }),
      ctx.sender.website ? el('div', { class: 'inv-brand__web', text: ctx.sender.website }) : null,
    ]) : null,
  ]);
}

/** The document's own title block: the word, the number, and whatever hangs off it. */
function title(ctx, align) {
  return el('div', { class: 'inv-title' + (align === 'left' ? ' is-left' : '') }, [
    el('div', { class: 'inv-title__word', text: ctx.word }),
    el('div', { class: 'inv-title__number' }, [el('span', { text: ctx.number }), ctx.numberWarning]),
    ctx.statusPill,
  ]);
}

// classic + minimal
function split(ctx, id) {
  return el('header', { class: `inv-head is-${id}` }, [brand(ctx), title(ctx)]);
}

// A full-width band with the mark centred in it.
function banded(ctx) {
  return el('header', { class: 'inv-head is-banded' }, [
    el('div', { class: 'inv-band' }, [
      logo(ctx, 'inv-band__logo'),
      namesItself(ctx) ? el('div', { class: 'inv-band__name', text: ctx.sender.name || 'Your business' }) : null,
      el('div', { class: 'inv-band__meta' }, [
        el('span', { text: String(ctx.word || '').toUpperCase() }),
        el('span', { class: 'inv-band__dot', text: '·' }),
        el('span', { text: ctx.number }),
      ]),
    ]),
    // The band has no room for a status pill without crowding the mark, so it rides underneath
    // rather than being dropped — a document whose status vanishes with the layout is a trap.
    ctx.statusPill ? el('div', { class: 'inv-statusrow' }, [ctx.statusPill, ctx.numberWarning]) : null,
  ]);
}

// A tinted strip: business left, mark right, the way printed stationery runs.
function letterhead(ctx) {
  return el('header', { class: 'inv-head is-letterhead' }, [
    el('div', { class: 'inv-strip' }, [
      el('div', { class: 'inv-strip__left' }, [
        namesItself(ctx) ? el('div', { class: 'inv-brand__name', text: ctx.sender.name || 'Your business' }) : null,
        el('div', { class: 'inv-strip__tag' }, [
          el('span', { text: `${ctx.word} ${ctx.number}` }), ctx.numberWarning,
        ]),
      ]),
      ctx.sender.logoData
        ? logo(ctx, 'inv-strip__logo')
        : el('div', { class: 'inv-strip__initials', text: initials(ctx.sender.name) }),
    ]),
    ctx.statusPill ? el('div', { class: 'inv-statusrow' }, [ctx.statusPill]) : null,
  ]);
}

// A full-width dark block, the way corporate letterhead prints. The title block rides inside it,
// so the status pill and the derived-number warning come along with it — on the dark ground their
// soft chip colours read as chips, which is the point of chips.
function slate(ctx) {
  return el('header', { class: 'inv-head is-slate' }, [
    el('div', { class: 'inv-slate' }, [brand(ctx), title(ctx)]),
  ]);
}

// The word itself is the design: INVOICE set large and light across the whole measure, the way an
// editorial spread opens. Everything administrative drops to a quiet row beneath it.
function headline(ctx) {
  return el('header', { class: 'inv-head is-headline' }, [
    el('div', { class: 'inv-hl__word', text: String(ctx.word || '').toUpperCase() }),
    el('div', { class: 'inv-hl__row' }, [
      brand(ctx),
      el('div', { class: 'inv-hl__meta' }, [
        el('div', { class: 'inv-title__number' }, [el('span', { text: ctx.number }), ctx.numberWarning]),
        ctx.statusPill,
      ]),
    ]),
  ]);
}

// A thick accent edge down the left, everything ranged left under it. The one layout where the
// title deliberately does not sit opposite the brand, for readers who scan a page top-to-bottom.
function rail(ctx) {
  return el('header', { class: 'inv-head is-rail' }, [
    el('div', { class: 'inv-rail' }, [brand(ctx), title(ctx, 'left')]),
  ]);
}

// Stacked on the centre line, like an engraved card: mark, name, a short rule, then the document's
// word and number. The most formal of the eight, and the one that flatters a good logo most.
function centred(ctx) {
  return el('header', { class: 'inv-head is-centred' }, [
    logo(ctx, 'inv-brand__logo'),
    namesItself(ctx) ? el('div', { class: 'inv-brand__name', text: ctx.sender.name || 'Your business' }) : null,
    namesItself(ctx) && ctx.sender.website ? el('div', { class: 'inv-brand__web', text: ctx.sender.website }) : null,
    el('div', { class: 'inv-cent__rule' }),
    el('div', { class: 'inv-title__word', text: ctx.word }),
    el('div', { class: 'inv-title__number' }, [el('span', { text: ctx.number }), ctx.numberWarning]),
    ctx.statusPill,
  ]);
}

// The shop invoice. The client sits top-left where a window envelope shows it, the mark top-right,
// then a grid of what the reader looks up — dates, the number, the reference, the total — ruled
// above and below, and the document's word as a plain heading over the table. The number is a
// cell of the grid rather than part of the title, which is where the reference this is modelled
// on keeps it. `ctx.client*` and `ctx.metas` come from render.js; the other mastheads ignore them.
function ledger(ctx) {
  const client = ctx.client || {};
  const metas = ctx.metas || [];
  return el('header', { class: 'inv-head is-ledger' }, [
    el('div', { class: 'inv-ledger__top' }, [
      el('div', { class: 'inv-ledger__window inv-party' }, [
        el('div', { class: 'inv-party__label', text: ctx.clientLabel || '' }),
        el('div', { class: 'inv-party__name', text: client.name || '—' }),
        ...(ctx.clientLines || []).map((l) => el('div', { class: 'inv-party__line', text: l })),
        ...(ctx.clientMeta || []).map((l) => el('div', { class: 'inv-party__line inv-party__line--meta', text: l })),
      ]),
      // The mark alone opposite the window when there is one — the foot says the name — and the
      // name as a wordmark when there is not, so the corner is never empty.
      ctx.sender.logoData
        ? el('div', { class: 'inv-brand inv-ledger__brand' }, [logo(ctx, 'inv-brand__logo')])
        : el('div', { class: 'inv-brand inv-ledger__brand' }, [el('div', { class: 'inv-brand__name', text: ctx.sender.name || 'Your business' })]),
    ]),
    metas.length ? el('div', { class: 'inv-ledger__meta' }, metas.map((m) =>
      el('div', { class: 'inv-meta' + (m.cls ? ' ' + m.cls : '') }, [
        el('div', { class: 'inv-meta__label', text: m.label }),
        el('div', { class: 'inv-meta__value' }, [el('span', { text: m.value }), m.extra || null]),
      ]))) : null,
    el('div', { class: 'inv-ledger__title' }, [
      el('div', { class: 'inv-ledger__word', text: ctx.word }),
      ctx.statusPill,
    ]),
  ]);
}

/**
 * The DIN 5008 sheet.
 *
 * Three fixed things, each a box of the standard's size in the standard's place, and then the
 * body in the standard's margins. The geometry itself is in document.css, in millimetres of the
 * sheet's width (see the --mm variable there); what is built here is the content of each zone.
 *
 *   the letterhead   the mark and the name, ranged right, in the space above the address field
 *   the address      the return line (who to send it back to, one line, small), three blank
 *                    lines for remarks, then the recipient's postal address and nothing else —
 *                    no email, no phone: the window shows a postal address
 *   the block        the Informationsblock: number, dates, references, the client's tax number,
 *                    one to a line, label left and value right
 *   the subject      the document's word and number, bold, with the status beside it
 *
 * The fold marks and the punch mark are drawn by this masthead too, because they belong to the
 * sheet rather than to any block on it. Each is placed from the page's top edge, less whatever
 * the printing frame already took (--din-y0), so they land where the standard puts them on paper.
 */
function din(ctx, form) {
  const client = ctx.client || {};
  const sender = ctx.sender || {};
  const metas = (ctx.metas || []).filter((m) => !m.cls);   // the amount belongs in the totals
  if (ctx.clientTax) metas.push(ctx.clientTax);
  const mark = (mm, cls) => el('span', { class: 'inv-din__mark' + (cls ? ' ' + cls : ''), style: { top: `calc(${mm} * var(--mm) - var(--din-y0, 0px))` } });
  return el('header', { class: 'inv-head is-din' }, [
    el('div', { class: 'inv-din__marks', 'aria-hidden': 'true' }, [
      mark(form.fold[0]), mark(form.punch, 'inv-din__mark--punch'), mark(form.fold[1]),
    ]),
    el('div', { class: 'inv-din__top' }, [brand(ctx)]),
    el('div', { class: 'inv-din__row' }, [
      el('div', { class: 'inv-din__window' }, [
        el('div', { class: 'inv-din__return', text: returnLine(sender, ctx.lang) }),
        el('div', { class: 'inv-din__remarks' }),
        el('div', { class: 'inv-din__recipient inv-party' }, [
          el('div', { class: 'inv-party__name', text: client.name || '—' }),
          ...(ctx.clientLines || []).map((l) => el('div', { class: 'inv-party__line', text: l })),
        ]),
      ]),
      metas.length ? el('div', { class: 'inv-din__info' }, metas.map((m) =>
        el('div', { class: 'inv-meta' }, [
          el('div', { class: 'inv-meta__label', text: m.label }),
          el('div', { class: 'inv-meta__value' }, [el('span', { text: m.value }), m.extra || null]),
        ]))) : null,
    ]),
    el('div', { class: 'inv-din__subject' }, [
      el('span', { class: 'inv-din__word', text: `${ctx.word} ${ctx.number || ''}`.trim() }),
      ctx.numberWarning,
      ctx.statusPill,
    ]),
  ]);
}

/**
 * The return line: the sender in one small line above the address, so an undeliverable letter
 * comes back. Name, street, then the postcode and town in the order the language writes them.
 */
export function returnLine(sender = {}, lang = 'en') {
  const text = (v) => String(v == null ? '' : v).trim();
  const place = lang === 'en'
    ? [sender.city, sender.postcode]
    : [sender.postcode, sender.city];
  return [sender.name, sender.street1, place.map(text).filter(Boolean).join(' ')].map(text).filter(Boolean).join(' · ');
}

/** A wordmark for a business with no uploaded logo — better than an empty box on the right. */
function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
}
