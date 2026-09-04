// A form for one client or one catalogue item.
//
// Used in two places: as the body when a client or product is chosen from the sidebar, and inline
// inside the composer when somebody chooses "+ New client" mid-invoice. The same fields, the same
// save, the same preview — so a client added in a hurry from an invoice is exactly the client that
// would have been added from the list.
//
// The preview is not decoration. A client's address block is what will print on every document
// to them, and seeing it assembled while typing is how "Bristol" ends up in the city field and
// not on the end of the street.

import { el } from '../core/util.js';
import { formatMoney } from '../money/currency.js';
import { field, textInput, numberInput, selectInput, button, section } from './ui.js';
import { formFields, recordName, LANGUAGE_OPTIONS } from '../model/records.js';
import { imageSrc } from '../doc/render.js';

/**
 * Build the form.
 *
 *   kind        'client' | 'product'
 *   roles       the table's role map; columns its column list — the form resolves itself against them
 *   values      by role; edited in place
 *   rowId       null for a new record
 *   onSave      async (values) => { ok, error?, rowId? }
 *   onRemove    async () => { ok, error? }   (omitted for a new record)
 *   onCancel    () => void
 *   resolveImage  attachment id → URL, for the picture preview
 *   money       the money format, for the price preview
 *   compact     inline inside the composer: no bar of its own, a smaller title
 */
export function renderRecordForm(ctx) {
  const { kind, roles = {}, columns = [], values, rowId = null, onSave, onRemove, onCancel, resolveImage, money, compact = false, canWrite = true } = ctx;
  const fields = formFields(kind, roles, columns);
  const isNew = rowId == null;

  const status = el('div', { class: 'snd-status' });
  const say = (text, tone = '') => { status.className = 'snd-status' + (tone ? ' is-' + tone : ''); status.textContent = text; };

  // ---- the preview ----------------------------------------------------------------------------
  const preview = el('div', { class: 'rec-preview' });
  const paintPreview = () => {
    preview.replaceChildren();
    if (kind === 'client') {
      const lines = [values.street1, values.street2,
        [values.city, values.state, values.postcode].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
        values.country].map((x) => String(x || '').trim()).filter(Boolean);
      // append() turns a null child into the text "null", so nothing optional goes in unfiltered.
      preview.append(...[
        el('div', { class: 'inv-party__label', text: 'Bill to' }),
        el('div', { class: 'inv-party__name', text: recordName(values, kind) }),
        ...lines.map((l) => el('div', { class: 'inv-party__line', text: l })),
        ...[values.email, values.phone, values.taxNumber ? `Tax ID: ${values.taxNumber}` : ''].filter(Boolean).map((l) => el('div', { class: 'inv-party__line inv-party__line--meta', text: String(l) })),
        values.language ? el('div', { class: 'rec-preview__note', text: `Documents to this client are written in ${(LANGUAGE_OPTIONS.find((o) => o.value === values.language) || {}).label || values.language}.` }) : null,
      ].filter(Boolean));
      return;
    }
    const src = imageSrc(values.image, resolveImage);
    preview.append(
      el('div', { class: 'rec-preview__product' }, [
        src ? el('img', { class: 'rec-preview__img', src, alt: '' }) : el('div', { class: 'rec-preview__img is-empty', text: 'No picture' }),
        el('div', {}, [
          el('div', { class: 'inv-party__name', text: recordName(values, kind) }),
          el('div', { class: 'inv-party__line inv-party__line--meta', text: [values.sku, values.unit].filter(Boolean).join(' · ') }),
          el('div', { class: 'rec-preview__price', text: values.unitPrice === '' || values.unitPrice == null ? '—' : formatMoney(Number(values.unitPrice) || 0, money || {}) }),
        ]),
      ]),
    );
  };

  // ---- the fields -----------------------------------------------------------------------------
  const controls = fields.map((f) => {
    const set = (v) => { values[f.role] = v; paintPreview(); };
    let control;
    if (f.type === 'image') control = imageControl(f, values, set, resolveImage, say);
    else if (f.type === 'language') control = selectInput(LANGUAGE_OPTIONS, values[f.role] || '', set, { ariaLabel: f.label });
    else if (f.type === 'number') control = numberInput(values[f.role], (v) => set(v), { ariaLabel: f.label });
    else control = textInput(values[f.role], (v) => set(f.code ? v.toUpperCase() : v), { type: f.type || 'text', placeholder: f.placeholder || '', class: f.code ? 'cmp-input--code' : '', ariaLabel: f.label });

    // A field without a column is shown, disabled, with the reason: the person can see what the
    // widget could keep if the column existed, and Data is where it can be added.
    if (!f.writable) {
      control.disabled = true;
      return field(f.label, control, f.present ? 'This column is a formula, so it cannot be written.' : 'No column in this table holds it. Data → columns can add one.');
    }
    return field(f.label + (f.required ? ' *' : ''), control, f.hint || null);
  });

  // ---- the buttons ----------------------------------------------------------------------------
  const saveBtn = button(isNew ? (kind === 'client' ? 'Add client' : 'Add to catalogue') : 'Save', async () => {
    saveBtn.disabled = true;
    say('Saving…');
    try {
      const res = await onSave(values);
      if (res.ok) say(res.note || (isNew ? 'Added.' : 'Saved.'), 'ok');
      else say(res.error || 'Could not save.', 'warn');
    } catch (e) {
      say('Could not save: ' + (e?.message || e), 'warn');
    }
    saveBtn.disabled = false;
  }, { variant: 'primary', disabled: !canWrite });

  // Removal is two presses on the same button, a few seconds apart, rather than a browser dialog
  // — which blocks the whole Grist page, not just ours.
  let armed = null;
  const removeBtn = !isNew && onRemove ? button('Remove…', async () => {
    if (!armed) {
      armed = setTimeout(() => { armed = null; removeBtn.querySelector('span:last-child').textContent = 'Remove…'; }, 4000);
      removeBtn.querySelector('span:last-child').textContent = 'Press again to remove';
      say(kind === 'client'
        ? 'Removing a client does not remove their invoices; those keep the reference and lose the name.'
        : 'Removing an item does not change any invoice that already bills it.', 'warn');
      return;
    }
    clearTimeout(armed); armed = null;
    removeBtn.disabled = true;
    const res = await onRemove();
    if (!res.ok) { say(res.error || 'Could not remove.', 'warn'); removeBtn.disabled = false; }
  }, { variant: 'ghost', disabled: !canWrite }) : null;

  paintPreview();

  const title = isNew
    ? (kind === 'client' ? 'New client' : 'New catalogue item')
    : `Editing ${recordName(values, kind)}`;

  const bar = compact ? null : el('div', { class: 'cmp-bar' }, [
    el('div', { class: 'cmp-bar__title' }, [el('strong', { text: title })]),
    el('div', { class: 'cmp-bar__spacer' }),
    removeBtn,
    button('Close', onCancel),
    saveBtn,
  ]);

  return el('div', { class: 'cmp rec' + (compact ? ' rec--compact' : '') }, [
    bar,
    !canWrite ? el('div', { class: 'cmp-notice' }, [el('strong', { text: 'Editing is not enabled, so this cannot be saved yet.' })]) : null,
    el('div', { class: 'rec-body' }, [
      section(compact ? title : 'Details', controls, { grid: true }),
      el('div', { class: 'rec-side' }, [
        el('h3', { class: 'cmp-section__title', text: kind === 'client' ? 'On the document' : 'In the catalogue' }),
        preview,
        compact ? el('div', { class: 'rec-actions' }, [button('Cancel', onCancel), saveBtn]) : null,
      ]),
    ]),
    status,
  ]);
}

/**
 * The picture: a file chooser, a drop target, and the current picture with a way to clear it.
 *
 * The file is read into a data URI here — scaled down on the way, since a catalogue thumbnail is
 * a small square and a 4MB photograph is not — and handed to the caller as that. What becomes of
 * it is the caller's business: on a live document with an Attachments column it is uploaded; in
 * the demo, or into a Text column, the data URI itself is stored.
 */
function imageControl(f, values, set, resolveImage, say) {
  const input = el('input', { type: 'file', accept: 'image/*', class: 'set-logo__file', 'aria-label': f.label });
  const clear = button('Remove picture', () => { set(null); paint(); }, { variant: 'ghost' });
  const thumb = el('img', { class: 'rec-thumb', alt: '' });
  const box = el('div', { class: 'rec-drop' });
  const paint = () => {
    const src = imageSrc(values[f.role], resolveImage);
    thumb.style.display = src ? '' : 'none';
    if (src) thumb.src = src;
    clear.style.display = src ? '' : 'none';
  };
  const take = async (file) => {
    if (!file) return;
    try {
      set(await readImage(file));
      paint();
      say('Picture added. It is stored when you save.', 'ok');
    } catch {
      say('That file could not be read as an image.', 'warn');
    }
  };
  input.addEventListener('change', () => { take(input.files && input.files[0]); input.value = ''; });
  box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('is-over'); });
  box.addEventListener('dragleave', () => box.classList.remove('is-over'));
  box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('is-over'); take(e.dataTransfer?.files?.[0]); });
  box.append(thumb, el('span', { class: 'rec-drop__hint', text: 'Drop a picture here, or' }), input, clear);
  paint();
  return box;
}

/** A file as a scaled JPEG data URI: at most 480px on a side, flattened onto white. */
export function readImage(file, max = 480) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, max / img.naturalWidth, max / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const cx = canvas.getContext('2d');
        cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}
