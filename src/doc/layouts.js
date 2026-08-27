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
//
// Keeping them to one shared body is deliberate: four full templates would be four places to fix
// every future change to how a total is presented.

import { el } from '../core/util.js';

export const LAYOUTS = [
  { id: 'classic', label: 'Classic' },
  { id: 'banded', label: 'Banded' },
  { id: 'letterhead', label: 'Letterhead' },
  { id: 'minimal', label: 'Minimal' },
];

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
    default: return split(ctx, id);   // classic and minimal share the split masthead
  }
}

/** The identity block: a mark if there is one, then the business name. */
function brand(ctx, cls) {
  return el('div', { class: cls || 'inv-brand' }, [
    ctx.sender.logoData ? el('img', { class: 'inv-brand__logo', src: ctx.sender.logoData, alt: ctx.sender.name || '' }) : null,
    el('div', {}, [
      el('div', { class: 'inv-brand__name', text: ctx.sender.name || 'Your business' }),
      ctx.sender.website ? el('div', { class: 'inv-brand__web', text: ctx.sender.website }) : null,
    ]),
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
      ctx.sender.logoData ? el('img', { class: 'inv-band__logo', src: ctx.sender.logoData, alt: '' }) : null,
      el('div', { class: 'inv-band__name', text: ctx.sender.name || 'Your business' }),
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
        el('div', { class: 'inv-brand__name', text: ctx.sender.name || 'Your business' }),
        el('div', { class: 'inv-strip__tag' }, [
          el('span', { text: `${ctx.word} ${ctx.number}` }), ctx.numberWarning,
        ]),
      ]),
      ctx.sender.logoData
        ? el('img', { class: 'inv-strip__logo', src: ctx.sender.logoData, alt: '' })
        : el('div', { class: 'inv-strip__initials', text: initials(ctx.sender.name) }),
    ]),
    ctx.statusPill ? el('div', { class: 'inv-statusrow' }, [ctx.statusPill]) : null,
  ]);
}

/** A wordmark for a business with no uploaded logo — better than an empty box on the right. */
function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
}
