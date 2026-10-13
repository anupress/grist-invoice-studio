// The one conversion from what is STORED to what everything downstream asks for.
//
// Two shapes exist on purpose. The stored one (settings/defaults.js) is flat, boring and
// versionable, because it is serialised into somebody's document and has to survive being read
// back by a later release. The runtime one is what the renderer, the money engine and the send
// routes actually want: `sender` at the top level, a `money` object with its rate rows already
// built, the exemption resolved, the numbering format for this kind of document.
//
// It lives here rather than in an app shell because there are now two shells — the Grist widget
// and the web version — and a second copy of this conversion would be a second set of defaults to
// disagree with the first. Whichever shell is running, a document is composed from the same
// settings in the same way.

import { buildPreset, findPreset, simpleRate } from '../money/tax/rates.js';
import { exemptionFor } from '../money/tax/exemptions.js';
import { numberFormatFor } from './defaults.js';

/**
 * Settings, with the tax table built from whichever preset is selected.
 *
 * The preset is stored by id and the rows rebuilt from it, rather than the rows being stored: a
 * saved copy of a rate table is a snapshot that silently goes stale, and the id says what the
 * business actually meant.
 */
export function moneySettings(money = {}) {
  // Simple mode is one typed rate, and it becomes an ordinary wildcard rate row so it goes through
  // exactly the same engine as a twenty-seven-country table. No second code path means no second
  // set of rounding behaviour to disagree with the first.
  if (money.taxMode === 'simple') {
    return {
      ...money,
      taxRates: simpleRate({ rate: money.simpleRate, name: money.simpleName }),
      taxPresetLabel: `${Number(money.simpleRate) || 0}% ${money.simpleName || 'Tax'}, everywhere`,
    };
  }
  if (money.taxMode === 'none') {
    return { ...money, taxEnabled: false, taxRates: [], taxPresetLabel: null };
  }

  const preset = money.taxPreset ? findPreset(money.taxPreset) : null;
  return {
    ...money,
    taxRates: preset ? buildPreset(money.taxPreset, money) : (money.taxRates || []),
    taxPresetLabel: preset ? preset.label : (money.taxRates || []).length ? 'Your own rate table' : null,
  };
}

/**
 * The stored settings, flattened into what everything downstream actually asks for.
 *
 * `layout` is the caller's per-session override — the bar's layout chooser is a try-it-out that
 * outranks the business's stored choice for as long as it is set. Passing nothing keeps the
 * stored one, which is what a fresh page should show.
 */
export function settingsFrom(st, kind = 'invoice', layout = null) {
  return {
    ...st.document,
    ...st.delivery,
    sender: st.business,
    money: moneySettings(st.money),
    // A standing exemption — the small-business scheme — reaches the totals engine as the reason
    // no tax is charged, so it is printed rather than merely absent.
    exempt: exemptionFor(st.money),
    einvoice: st.einvoice,
    // The saved message wordings ride along whole — buildMessage layers them under whatever is
    // typed for one send.
    messages: st.messages,
    numberFormat: numberFormatFor(st, kind),
    kind,
    layout: layout || st.document.layout,
  };
}
