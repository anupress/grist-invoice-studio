// Small form helpers for the composer.
//
// Deliberately not a component framework. Every control here does one thing: read a value, write it
// back on input, and never re-render itself — because a control that rebuilds while you are typing
// in it takes the cursor with it, and an invoice form is mostly typing.

import { el } from '../core/util.js';

export function field(label, control, hint, opts = {}) {
  return el('label', { class: 'cmp-field' + (opts.wide ? ' cmp-field--wide' : '') }, [
    el('span', { class: 'cmp-field__label', text: label }),
    control,
    hint ? el('span', { class: 'cmp-field__hint', text: hint }) : null,
  ]);
}

export function textInput(value, onInput, opts = {}) {
  const input = el('input', {
    class: 'cmp-input' + (opts.class ? ' ' + opts.class : ''),
    type: opts.type || 'text',
    value: value == null ? '' : String(value),
    placeholder: opts.placeholder || '',
    readOnly: opts.readOnly || null,
    inputmode: opts.inputmode || null,
    list: opts.list || null,
    'aria-label': opts.ariaLabel || null,
  });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

/**
 * A text box that suggests, without constraining.
 *
 * A datalist is the right control for a country code, a unit or a currency: the answer is known
 * but its spelling is not, and a select would refuse the one country we forgot. `options` takes
 * `{ value, label }` — the label is what the browser shows beside the value, so "GB" reads as
 * "GB — United Kingdom" while what lands in the box is still "GB".
 */
export function suggestInput(value, onInput, opts = {}) {
  const id = 'sug-' + Math.random().toString(36).slice(2, 8);
  const input = textInput(value, onInput, { ...opts, list: id });
  return el('div', { class: 'cmp-suggest' }, [
    input,
    el('datalist', { id }, (opts.options || []).map((o) => (typeof o === 'string'
      ? el('option', { value: o })
      : el('option', { value: o.value, label: o.label || null })))),
  ]);
}

/**
 * A number field that hands back a number.
 *
 * `step="any"` rather than a fixed step: a quantity can be 0.5 hours and a unit price can be 12.345,
 * and a browser that refuses those with a validation bubble is worse than no constraint at all.
 */
export function numberInput(value, onInput, opts = {}) {
  const input = el('input', {
    class: 'cmp-input cmp-input--num' + (opts.class ? ' ' + opts.class : ''),
    type: 'number',
    step: 'any',
    value: value == null || value === '' ? '' : String(value),
    placeholder: opts.placeholder || '',
    'aria-label': opts.ariaLabel || null,
  });
  input.addEventListener('input', () => {
    const n = parseFloat(input.value);
    onInput(input.value === '' ? 0 : (isFinite(n) ? n : 0));
  });
  return input;
}

export function textArea(value, onInput, opts = {}) {
  const ta = el('textarea', {
    class: 'cmp-input cmp-input--area',
    rows: opts.rows || 2,
    placeholder: opts.placeholder || '',
  });
  ta.value = value == null ? '' : String(value);
  ta.addEventListener('input', () => onInput(ta.value));
  return ta;
}

export function selectInput(options, value, onChange, opts = {}) {
  const sel = el('select', { class: 'cmp-input cmp-input--select', 'aria-label': opts.ariaLabel || null },
    options.map((o) => el('option', {
      value: String(o.value),
      selected: String(o.value) === String(value) ? true : null,
      text: o.label,
    })));
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

/**
 * A button.
 *
 * The accessible name is set explicitly rather than left to the contents. Several of these are
 * icon-only — move up, remove this line — where the visible content is an arrow or a cross and
 * carries no name at all; and where there IS a label, computing it from a nested span is left to
 * the browser and does not always happen. An explicit name costs one attribute and is the
 * difference between "Remove this line" and "button" for anyone using a screen reader.
 */
export function button(label, onClick, opts = {}) {
  const name = label || opts.title || '';
  const b = el('button', {
    class: 'cmp-btn' + (opts.variant ? ' cmp-btn--' + opts.variant : ''),
    type: 'button',
    title: opts.title || null,
    'aria-label': name || null,
    disabled: opts.disabled || null,
  }, [
    // The icon is decorative when there is also a label; hidden so it is not read out as "plus New".
    opts.icon ? el('span', { class: 'cmp-btn__icon', 'aria-hidden': 'true', text: opts.icon }) : null,
    label ? el('span', { text: label }) : null,
  ]);
  b.addEventListener('click', onClick);
  return b;
}

export function section(title, children, opts = {}) {
  return el('section', { class: 'cmp-section' + (opts.class ? ' ' + opts.class : '') }, [
    title ? el('h3', { class: 'cmp-section__title', text: title }) : null,
    el('div', { class: 'cmp-section__body' + (opts.grid ? ' is-grid' : '') }, children),
  ]);
}
