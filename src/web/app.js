// Invoice Studio Web — the free invoice generator.
//
// The same engine as the Grist widget with a different shell around it: no document to connect to,
// no tables, no lists, no settings drawer. One business, one client, one document, four things you
// can do with it. Nothing is sent anywhere and nothing is stored on a server: what a business
// decides once stays in the visitor's own browser (see store.js), the document lives for the tab,
// and a sent document is cleared.
//
// The mount point carries the page's fixed choices as data attributes, so one build serves the
// invoice page, the quote page and the German e-invoice page without a second copy of anything:
//
//   <div data-apiv data-kind="quote" data-lang="de" data-country="DE" data-currency="EUR"
//        data-trade="construction" data-example="1" data-einvoice="xrechnung" data-ui="de"
//        data-credit="0" data-assets="https://…/assets/1.0.0/"></div>

import { el } from '../core/util.js';
import { sanitise } from '../settings/store.js';
import { settingsFrom } from '../settings/runtime.js';
import { emptyDraft, recalc, normaliseDraft, normaliseParty, convertDraft } from '../model/draft.js';
import { renderDocument } from '../doc/render.js';
import { DOCUMENT_KINDS, documentKind, conversionsFor } from '../doc/kinds.js';
import { LAYOUTS } from '../doc/layouts.js';
import { LANGUAGES, languageOf, localiseKind } from '../doc/lang.js';
import { PAPER, pageRuleFor, printFrame, printTitleFor, installPrintTitle } from '../print.js';
import { downloadPdf, downloadHtml, downloadEInvoice } from '../export/download.js';
import { documentToHtml } from '../export/html-file.js';
import { EINVOICE_FORMATS, PROFILES, einvoiceModel, checkEInvoice } from '../einvoice/index.js';
import { TEMPLATES, findTemplate, applyTemplate, templateSummary } from '../templates/index.js';
import { sampleBusinessFor, SAMPLE_LINES } from '../templates/starter.js';
import { setAssetBase } from '../export/pdf/font-loader.js';
import { assignNumber } from '../money/numbering.js';
import { selectInput, button } from '../compose/ui.js';
import { renderForm } from './form.js';
import { openSendDialog } from './send.js';
import { uiLanguage, translator, rememberLang, UI_LANGUAGES, UI_LANGUAGE_NAMES } from './strings.js';
import { icons } from './icons.js';
import {
  recallSettings, rememberSettings, forgetSettings, hasRemembered,
  recallDraft, rememberDraft, forgetDraft, debounced,
  recallIssued, rememberIssued, forgetIssued,
} from './store.js';
import { APP_VERSION } from '../version.js';

/** A fictional client, so an example document is a whole document. Never a real name or address. */
const EXAMPLE_CLIENT = {
  name: 'Harbour Lane Bakery', street1: '12 Harbour Lane', city: 'Bristol',
  postcode: 'BS1 4QA', email: 'accounts@harbourlane.example',
};

const iso = (d) => d.toISOString().slice(0, 10);

/** One instance. Several mount points on one page each get their own. */
function createApp(host) {
  // The language the FORM speaks. Mutable: the switch in the strip changes it without reloading
  // the page, and `t` is a wrapper so every closure built below keeps working after a change.
  let ui = uiLanguage(host);
  let table = translator(ui);
  const t = (key, values) => table(key, values);

  const app = {
    host,
    ui,
    stored: sanitise({}),
    draft: null,
    // Empty until somebody picks one, or the page fixes it with data-trade.
    trade: '',
    // The bar's layout chooser is a try-it-out that outranks the stored choice for this session.
    layout: null,
    tab: 'edit',
    // Which form sections the person has folded. A phone starts with the money and the wording
    // folded, because a first invoice can leave both alone; a wide screen starts with all open.
    collapsed: new Set(),
    einvoiceFormat: 'facturx',
    // Every number this browser has given out, oldest first. See store.js for why.
    issued: recallIssued(),
    previewHost: null,
    statusHost: null,
  };

  const settingsNow = () => settingsFrom(app.stored, app.draft ? app.draft.kind : 'invoice', app.layout);

  /** A phone-sized screen, decided once: the layout below 900px is one column with tabs. */
  const narrow = () => (typeof matchMedia === 'function' ? matchMedia('(max-width: 899px)').matches : false);
  /** Is there a document worth looking at, or only an empty form? Decides the first tab on a phone. */
  const hasContent = () => !!app.draft && (
    (app.draft.lines || []).some((l) => String(l.description || '').trim())
    || String(app.draft.client && app.draft.client.name || '').trim()
  );

  // Short names for the bar's e-invoice chooser; the engine's labels explain, the bar identifies.
  const EINV_SHORT = { facturx: 'Factur-X PDF', ubl: 'UBL XML', cii: 'CII XML' };

  /**
   * How far down the screen the host page's fixed header reaches.
   *
   * The document column and the phone's tab bar stick to the top of the viewport; a site with a
   * fixed header would otherwise put them under it. Measured rather than configured: whatever is
   * painted at the top of the viewport and positioned fixed or sticky sets the offset, so the
   * plugin needs to know nothing about the theme. Re-measured on resize, because headers change
   * height across breakpoints.
   */
  function measureStickyTop() {
    let header = 0;
    try {
      const x = Math.max(1, Math.floor(window.innerWidth / 2));
      for (const e of document.elementsFromPoint(x, 2)) {
        if (e === app.host || app.host.contains(e) || e === document.documentElement || e === document.body) continue;
        const cs = getComputedStyle(e);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        const r = e.getBoundingClientRect();
        if (r.top <= 2 && r.bottom > 0 && r.bottom < window.innerHeight / 2) header = Math.max(header, Math.ceil(r.bottom));
      }
    } catch { /* an old browser without elementsFromPoint keeps the default */ }
    // The bottom edge of whatever is fixed at the top of the screen; zero when nothing is. The
    // stylesheet adds its own breathing room where it wants some.
    app.host.style.setProperty('--apiv-header', header + 'px');
  }

  /** A document kind's word in the FORM's language — "Rechnung" on a German page's chooser. */
  const kindWord = (id) => localiseKind(documentKind(id), ui).word;

  /* ---- the page's fixed choices ----------------------------------------------------------- */

  const opts = {
    kind: host.dataset.kind || 'invoice',
    lang: host.dataset.lang || '',
    country: (host.dataset.country || '').toUpperCase(),
    currency: (host.dataset.currency || '').toUpperCase(),
    trade: host.dataset.trade || '',
    example: host.dataset.example === '1' || host.dataset.example === 'true',
    // The e-invoice rulebook a page is about: the German page fixes 'xrechnung'.
    einvoice: PROFILES[host.dataset.einvoice] ? host.dataset.einvoice : '',
    // Where "Email it" posts to, and the bot-check site key. Both come from the plugin; without
    // an endpoint there is no Email button, which is how the development page behaves.
    send: host.dataset.send || '',
    turnstile: host.dataset.turnstile || '',
  };

  /**
   * The page's own choices, laid over whatever was remembered.
   *
   * Order matters: a German e-invoicing page is German whoever visits it, so its fixed choices
   * win over a stored preference — but only the ones the page actually fixes. Everything else
   * the visitor set stays theirs.
   */
  function applyPageOptions({ fresh }) {
    if (opts.trade && findTemplate(opts.trade)) {
      app.trade = opts.trade;
      app.stored = sanitise(applyTemplate(findTemplate(opts.trade), app.stored));
    }
    if (opts.lang) app.stored.document.language = opts.lang;
    if (opts.country) {
      app.stored.money.homeCountry = opts.country;
      app.stored.money.defaultCustomerCountry = opts.country;
    }
    if (opts.currency) app.stored.money.currency = opts.currency;
    if (opts.einvoice) app.stored.einvoice.profile = opts.einvoice;
    // The line at the foot is what this tool is paid in, so it starts on — but only on a fresh
    // start. Somebody who unticked it last time has decided, and a page reload is not a reason
    // to ask them again. `data-credit` on the mount overrides both.
    if (host.dataset.credit != null) {
      app.stored.document.creditLine = host.dataset.credit !== '0' && host.dataset.credit !== 'false';
    } else if (fresh) {
      app.stored.document.creditLine = true;
    }
  }

  /* ---- paper ------------------------------------------------------------------------------ */

  // `@page` cannot be scoped by a selector, so the rule for the chosen paper is managed as one
  // style element rather than written as a class. Same approach as the widget.
  function applyPaper(size) {
    const rule = pageRuleFor(size);
    let tag = document.getElementById('apiv-page-rule');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'apiv-page-rule';
      document.head.appendChild(tag);
    }
    tag.textContent = rule.css;
    document.documentElement.style.setProperty('--print-inset', rule.inset);
    document.documentElement.setAttribute('data-paper', size);
    document.documentElement.setAttribute('data-density', app.stored.document.density || 'normal');
  }

  /* ---- saying something -------------------------------------------------------------------- */

  function say(text, kind = 'ok') {
    if (!app.statusHost) return;
    const mark = { ok: 'check', warn: 'info', err: 'info' }[kind] || 'info';
    app.statusHost.replaceChildren(el('p', { class: 'apiv-status apiv-status--' + kind }, [
      el('span', { class: 'apiv-status__icon', html: icons[mark] }),
      el('span', { text }),
    ]));
    if (kind === 'ok') setTimeout(() => { if (app.statusHost) app.statusHost.replaceChildren(); }, 6000);
  }

  /** A lead line and a list of findings, each with the rule code a receiver would quote back. */
  function sayFindings(lead, items, kind) {
    if (!app.statusHost) return;
    app.statusHost.replaceChildren(el('div', { class: 'apiv-status apiv-status--' + kind }, [
      el('p', { text: lead, style: { margin: '0' } }),
      el('ul', {}, items.map((f) => el('li', {}, [el('code', { text: f.code }), el('span', { text: f.text })]))),
    ]));
  }

  const why = (e) => (e && e.message ? e.message : t('unknownWhy'));

  /* ---- numbers ----------------------------------------------------------------------------- */

  /** The next number for a kind, counting from everything this browser has issued. */
  function numberFor(kind) {
    const settings = settingsFrom(app.stored, kind, app.layout);
    return assignNumber('', { existingNumbers: app.issued, format: settings.numberFormat, date: new Date() }).number;
  }

  /**
   * The document has left the page — downloaded, printed, sent or converted — so its number is
   * spent. Numbers are never given out twice; see money/numbering.js.
   */
  function markIssued() {
    const n = String(app.draft.number || '').trim();
    if (!n || app.issued.includes(n)) return;
    app.issued.push(n);
    rememberIssued(app.issued);
  }

  /* ---- remembering ------------------------------------------------------------------------- */

  // What the settings looked like before the visitor touched anything, so "have they typed
  // something of their own" is answerable. Without it, pressing Forget cleared the browser and the
  // next repaint wrote an empty record straight back — the page then went on offering to forget
  // details that were not there, which is worse than not offering at all.
  let baseline = null;
  const rebaseline = () => { baseline = JSON.stringify(app.stored); };
  const untouched = () => baseline != null && JSON.stringify(app.stored) === baseline;

  // Kept in this browser and nowhere else. Debounced, because the form writes on every keystroke.
  const save = debounced(() => {
    if (untouched()) forgetSettings(); else rememberSettings(app.stored);
    rememberDraft(app.draft);
  });

  /* ---- the document ------------------------------------------------------------------------ */

  function paintPreview() {
    if (!app.previewHost) return;
    save();
    const settings = settingsNow();
    // A draft carries a COPY of the layout and of the sender, taken when it was created. That is
    // right for a document read back from a table, where both are a record of how it was issued,
    // and wrong for the one being composed here, where the bar and the form ARE the decision.
    // Without these two lines the chooser moved and the document did not, and a business name
    // typed into the form appeared nowhere on the invoice it was for.
    app.draft.layout = settings.layout;
    app.draft.sender = normaliseParty(app.stored.business);
    recalc(app.draft, settings);
    app.previewHost.replaceChildren(renderDocument(app.draft, settings));
    fitPreview();
  }

  function rebuild() { render(); }

  /** Apply a trade's decisions: what the document is called, how it is laid out, how it numbers. */
  function applyTrade(id) {
    const tpl = findTemplate(id);
    if (!tpl) return;
    app.trade = id;
    app.stored = sanitise(applyTemplate(tpl, app.stored));
    app.draft.kind = tpl.kind || app.draft.kind;
    if (!app.draft.terms) app.draft.terms = tpl.terms || '';
    rebuild();
  }

  /**
   * Fill the whole thing in, so the page explains itself in two seconds.
   *
   * Every name here is invented. The business carries the ANUPRESS name so a screenshot says who
   * made the tool; the client, the addresses and the email domains are fictional.
   */
  function fillExample() {
    const tpl = (app.trade && findTemplate(app.trade)) || findTemplate('freelancer');
    const sample = sampleBusinessFor(tpl.id);
    let { paymentDetails } = sample;
    const identity = { ...sample };
    delete identity.paymentDetails;
    // The sample's account goes into the boxes the country has for it (doc/banking.js), not into
    // the free text, so the example shows the boxes at work and the numbers print once. The
    // widget's starter keeps the text as it is: its settings panel has no such boxes yet, and a
    // number with no box to clear it from would outlive the sample.
    const m = /Sort code (\S+) · Account (\d+)/.exec(paymentDetails || '');
    if (m) {
      identity.bankCode = m[1];
      identity.accountNumber = m[2];
      paymentDetails = String(paymentDetails).replace(/\n?[^\n]*Sort code \S+ · Account \d+/, '').trim();
    }
    Object.assign(app.stored.business, identity);
    if (!String(app.stored.document.paymentDetails || '').trim()) app.stored.document.paymentDetails = paymentDetails;
    if (app.stored.money.currency === 'USD' && !app.stored.money.homeCountry) {
      app.stored.money.currency = 'GBP';
      app.stored.money.homeCountry = 'GB';
      app.stored.money.defaultCustomerCountry = 'GB';
    }

    const due = new Date();
    due.setDate(due.getDate() + 30);
    const lines = SAMPLE_LINES[tpl.id] || (tpl.lines || []).filter((l) => Number(l.unitPrice) > 0);

    app.draft = normaliseDraft({
      ...app.draft,
      kind: tpl.kind || app.draft.kind,
      issued: iso(new Date()),
      due: iso(due),
      terms: tpl.terms || app.draft.terms,
      sender: app.stored.business,
      client: { ...EXAMPLE_CLIENT, country: app.stored.money.homeCountry || 'GB' },
      lines: lines.length ? lines : app.draft.lines,
    });
    app.draft.number = numberFor(app.draft.kind);
    // On a phone the point of the example is to SEE it, so the preview comes up rather than the
    // form that produced it.
    if (narrow()) app.tab = 'preview';
    rebuild();
    say(t('filledExample'));
  }

  /**
   * A blank document, keeping the business.
   *
   * What a business decides once is exactly what should survive finishing an invoice; the invoice
   * itself is what should not.
   */
  function newDocument(message) {
    forgetDraft();
    app.draft = emptyDraft(app.draft ? app.draft.kind : opts.kind, settingsNow());
    app.draft.client = { name: '' };
    app.draft.number = numberFor(app.draft.kind);
    rebuild();
    if (message) say(message);
  }

  /**
   * Everything this tool put in this browser, gone.
   *
   * There is nothing to ask a server to delete, because there is nothing on one. The wording says
   * so plainly rather than "your data has been deleted", which implies there was a copy elsewhere.
   */
  function forgetMine() {
    forgetSettings();
    forgetDraft();
    forgetIssued();
    app.issued = [];
    app.stored = sanitise({});
    app.trade = opts.trade || '';
    applyPageOptions({ fresh: true });
    rebaseline();
    app.draft = emptyDraft(opts.kind, settingsNow());
    app.draft.client = { name: '' };
    app.draft.number = numberFor(opts.kind);
    rebuild();
    say(t('forgotten'));
  }

  /**
   * Called once the file has been emailed to the visitor. It works like a download: the number
   * counts as used, and the document stays open, because the visitor still has to forward it to
   * their client and may want the PDF too.
   */
  function afterSend(email) {
    markIssued();
    say(t('sentToYou', { email }));
  }

  /**
   * Turn this document into another kind: a quote into the invoice for it, an invoice into the
   * credit note that reverses it. The new one names the old one and takes its own number from
   * its own sequence; the old number is spent, because the old document went out.
   */
  function convertTo(id) {
    if (!id || !documentKind(id)) return;
    const settings = settingsNow();
    const from = localiseKind(documentKind(app.draft.kind), languageOf(app.draft, settings));
    const relatedTo = app.draft.number ? `${from.word} ${app.draft.number}` : '';
    markIssued();
    app.draft = convertDraft(app.draft, id, { relatedTo });
    app.draft.number = numberFor(id);
    rebuild();
    say(t('converted', { kind: kindWord(id), ref: relatedTo ? t('referringTo', { ref: relatedTo }) : '' }));
  }

  /* ---- a file of your own ------------------------------------------------------------------ */

  /**
   * Everything this browser remembers, as one small file the person keeps.
   *
   * It is the answer to "on my other computer" and to "I cleared my browser" without a server:
   * the settings, the logo inside them, and the numbers issued so the sequence carries on.
   */
  function exportKit() {
    const kit = {
      format: 'anupress-invoice-kit', version: 1, savedAt: new Date().toISOString(),
      settings: app.stored, issued: app.issued,
    };
    const name = 'anupress-invoice-details.json';
    const blob = new Blob([JSON.stringify(kit, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    say(t('kitSaved', { name }));
  }

  async function importKit(file) {
    if (!file) return;
    try {
      const kit = JSON.parse(await file.text());
      if (!kit || kit.format !== 'anupress-invoice-kit' || !kit.settings) throw new Error('not a kit');
      app.stored = sanitise(kit.settings);
      // A file this tool wrote always carries the credit setting. One that does not — edited by
      // hand, or from a future version that dropped the key — gets the web default rather than
      // the widget's, because sanitise() fills gaps with the widget's `false`.
      const saysCredit = !!(kit.settings.document && Object.prototype.hasOwnProperty.call(kit.settings.document, 'creditLine'));
      applyPageOptions({ fresh: !saysCredit });
      // A union, never a replacement: the file's numbers AND the ones this browser already gave
      // out. Replacing lost the numbers issued before the file was loaded, and the very next
      // document reused one — the mistake the whole list exists to make impossible.
      if (Array.isArray(kit.issued)) {
        const merged = new Set([...app.issued, ...kit.issued.filter((n) => typeof n === 'string' && n)]);
        app.issued = [...merged];
        rememberIssued(app.issued);
      }
      rememberSettings(app.stored);
      if (!String(app.draft.number || '').trim()) app.draft.number = numberFor(app.draft.kind);
      rebuild();
      say(t('kitLoaded'));
    } catch {
      say(t('notKit'), 'err');
    }
  }

  /* ---- files ------------------------------------------------------------------------------- */

  async function savePdf() {
    try {
      const r = await downloadPdf(app.draft, settingsNow());
      markIssued();
      say(t('downloaded', { name: r.fileName }));
    } catch (e) {
      say(t('pdfFailed', { why: why(e) }), 'err');
    }
  }

  /**
   * What a receiver's validator will say, said first.
   *
   * With a rulebook chosen, the document is checked before the file is built. Errors stop it:
   * a file that will be rejected is worse than no file, because it comes back days later with a
   * code nobody can read. Warnings let it through and are listed beside the download.
   */
  async function saveEInvoice() {
    const settings = settingsNow();
    let warnings = [];
    if (settings.einvoice && settings.einvoice.profile) {
      const result = checkEInvoice(einvoiceModel(app.draft, settings));
      if (!result.ok) {
        sayFindings(t('wouldBeRejected'), result.errors, 'err');
        return;
      }
      warnings = result.warnings || [];
    }
    try {
      const r = await downloadEInvoice(app.draft, settings, app.einvoiceFormat);
      markIssued();
      if (warnings.length) sayFindings(t('mayAsk', { name: r.fileName }), warnings, 'warn');
      else say(t('validateFirst', { name: r.fileName }));
    } catch (e) {
      say(t('einvFailed', { why: why(e) }), 'err');
    }
  }

  function saveHtml() {
    try {
      const r = downloadHtml(app.draft, settingsNow());
      markIssued();
      say(t('downloaded', { name: r.fileName }));
    } catch (e) {
      say(t('fileFailed', { why: why(e) }), 'err');
    }
  }

  /**
   * Print the document, and nothing else.
   *
   * Printing the page it sits on was the first version, with CSS hiding everything around the
   * document. On a real website that came out as one page of invoice and three blank ones: what
   * is hidden still takes its room, and the document was lifted to the top of a sheet the host's
   * accordions and footer went on filling. So the document is written into its own frame — the
   * same self-contained HTML the "HTML file" button saves, with the chosen paper named on it — and
   * that frame is what prints. The frame stays until the dialog has closed; a frame removed too
   * soon prints nothing at all.
   */
  function printDocument() {
    const size = app.stored.document.paperSize || 'a4';
    const rule = pageRuleFor(size);
    let html;
    try {
      html = documentToHtml(app.draft, settingsNow(), {
        pageSize: PAPER[size] || 'A4',
        pageMargin: rule.inset,
        title: printTitleFor(app.draft),
        density: app.stored.document.density || 'normal',
      });
    } catch (e) {
      say(t('fileFailed', { why: why(e) }), 'err');
      return;
    }
    markIssued();
    const frame = el('iframe', { class: 'apiv-print', title: t('print'), 'aria-hidden': 'true' });
    let gone = false;
    const finish = () => { if (gone) return; gone = true; setTimeout(() => frame.remove(), 300); };
    frame.addEventListener('load', () => {
      const w = frame.contentWindow;
      if (!w) { finish(); window.print(); return; }
      w.addEventListener('afterprint', finish);
      // print() blocks until the dialog closes in most browsers, so finishing right after it is
      // safe; where it does not block, afterprint finishes, and a long stop catches the rest.
      setTimeout(() => {
        try { w.focus(); w.print(); finish(); } catch { finish(); window.print(); }
      }, 100);
      setTimeout(finish, 120000);
    });
    frame.setAttribute('srcdoc', html);
    document.body.appendChild(frame);
  }

  /**
   * On a phone, the document laid out at a desk's width and scaled down to the column.
   *
   * Reflowing an invoice to 360 pixels sent its lines table off the right edge of the screen and
   * the page scrolling sideways. A page is a fixed thing; a viewer shrinks it. The width it is laid
   * out at is roughly the preview column on a desk, so the phone sees the same document, only
   * smaller, and the browser's own pinch-zoom is how to read the small print. A transform takes
   * no part in layout, so the column is given the scaled height by hand.
   */
  const FIT_WIDTH = 680;
  function fitPreview() {
    const col = app.host.querySelector('.apiv-col--doc');
    const frame = col && col.querySelector('.studio-printframe');
    if (!frame) return;
    if (!narrow()) {
      frame.style.width = ''; frame.style.transform = ''; col.style.height = '';
      col.classList.remove('is-fitted');
      return;
    }
    const w = col.clientWidth;
    if (!w) return;  // the Edit tab is showing; measured again when Preview is
    const scale = Math.min(1, w / FIT_WIDTH);
    col.classList.add('is-fitted');
    frame.style.width = FIT_WIDTH + 'px';
    frame.style.transform = scale < 1 ? `scale(${scale})` : '';
    col.style.height = Math.ceil(frame.offsetHeight * scale) + 'px';
  }

  /* ---- chrome ------------------------------------------------------------------------------ */

  const choose = (label, options, value, onChange, icon) => el('label', { class: 'apiv-choose' }, [
    el('span', { class: 'apiv-choose__label' }, [
      icon ? el('span', { class: 'apiv-choose__icon', html: icons[icon] }) : null,
      el('span', { text: label }),
    ]),
    selectInput(options, value, onChange, { ariaLabel: label }),
  ]);

  /**
   * EN | DE, the same switch the site's calculators and PDF tools carry.
   *
   * The choice is the visitor's, not the page's: it is remembered under the key every ANUPRESS
   * tool shares, so picking German once holds for the whole site. Only the FORM changes — the
   * document keeps the language chosen for the client, which is a different decision.
   */
  function renderLangSwitch() {
    return el('div', { class: 'apiv-lang', role: 'group', 'aria-label': t('interfaceLanguage') }, [
      el('span', { class: 'apiv-lang__icon', html: icons.globe }),
      ...UI_LANGUAGES.map((code) => {
        const b = el('button', {
          class: 'apiv-lang__btn',
          type: 'button',
          lang: code,
          title: UI_LANGUAGE_NAMES[code] || code,
          'aria-label': UI_LANGUAGE_NAMES[code] || code,
          'aria-pressed': String(ui === code),
          text: code.toUpperCase(),
        });
        b.addEventListener('click', () => setLang(code));
        return b;
      }),
    ]);
  }

  /**
   * The settings nobody changes twice: paper and spacing, behind one button.
   *
   * A `<details>`, so it opens and closes without a line of script and a keyboard reaches it the
   * same way as anything else; app.js only adds the manners a menu needs — a click anywhere else,
   * or Escape, puts it away.
   */
  function renderMore() {
    const d = el('details', { class: 'apiv-more' });
    d.append(
      el('summary', { class: 'apiv-more__btn', title: t('moreSettings'), 'aria-label': t('moreSettings') }, [
        el('span', { class: 'apiv-more__icon', html: icons.settings }),
      ]),
      el('div', { class: 'apiv-more__panel' }, [
        choose(t('docLanguage'), LANGUAGES.map((l) => ({ value: l.id, label: l.label })), app.stored.document.language,
          (v) => { app.stored.document.language = v; rebuild(); }, 'globe'),
        choose(t('paper'), Object.keys(PAPER).map((p) => ({ value: p, label: t(p) })), app.stored.document.paperSize,
          (v) => { app.stored.document.paperSize = v; rebuild(); }, 'paper'),
        choose(t('density'), [
          { value: 'compact', label: t('compact') }, { value: 'normal', label: t('normal') }, { value: 'roomy', label: t('roomy') },
        ], app.stored.document.density || 'normal', (v) => { app.stored.document.density = v; rebuild(); }, 'density'),
      ]),
    );
    return d;
  }

  function closeMenus(except) {
    app.host.querySelectorAll('details.apiv-more[open]').forEach((d) => { if (d !== except) d.open = false; });
  }

  /** Switch the form's language in place. The document, and everything typed, is untouched. */
  function setLang(code) {
    if (code === ui || !UI_LANGUAGES.includes(code)) return;
    ui = code;
    table = translator(ui);
    app.ui = ui;
    rememberLang(code);
    render();
    say(t('switchedLanguage'));
  }

  /**
   * The four things you can do with the document.
   *
   * Built by a function because they appear twice: in the bar at the top on a wide screen, and
   * in a strip that stays at the foot of a phone screen, where the bar has long scrolled away.
   * One list, two places, and the CSS shows whichever fits.
   */
  function renderActions() {
    return el('div', { class: 'apiv-actions' }, [
      button(t('print'), printDocument, { variant: 'ghost', iconHtml: icons.print, title: t('print') }),
      button(t('downloadHtml'), saveHtml, { variant: 'ghost', iconHtml: icons.html, title: t('downloadHtml') }),
      // One control, not two: a menu whose first entry is the label and whose other three are the
      // formats. Choosing a format downloads it and the menu springs back to its label, so it
      // never looks like a setting. A native select, so it works on every phone and keyboard.
      (() => {
        const s = selectInput(
          [{ value: '', label: t('einvoice') + ' ▾' }, ...EINVOICE_FORMATS.map((f) => ({ value: f.id, label: EINV_SHORT[f.id] || f.label }))],
          '',
          (v) => { if (!v) return; app.einvoiceFormat = v; s.value = ''; saveEInvoice(); },
          { ariaLabel: t('einvoiceFormat') },
        );
        s.className = 'cmp-btn cmp-btn--ghost apiv-einv';
        s.title = t('einvoiceFormat');
        return s;
      })(),
      // One primary action per screen. The PDF is what nearly everyone came for; sending is the
      // strong second, outlined so it is seen without competing.
      button(t('downloadPdf'), savePdf, { variant: 'primary', iconHtml: icons.download }),
      opts.send ? button(t('emailIt'), emailIt, { variant: 'outline', iconHtml: icons.mail }) : null,
    ]);
  }

  /** The send dialog. The file is built here in the browser; the site emails it to the visitor only. */
  function emailIt() {
    const settings = settingsNow();
    openSendDialog({
      draft: app.draft,
      settings,
      t,
      endpoint: opts.send.replace(/\/+$/, ''),
      turnstileKey: opts.turnstile,
      host: app.host,
      onSent: (email) => afterSend(email),
    });
  }

  function renderBar() {
    const settings = settingsNow();
    return el('div', { class: 'apiv-bar' }, [
      el('div', { class: 'apiv-bar__choices' }, [
        choose(t('document'), DOCUMENT_KINDS.map((k) => ({ value: k.id, label: kindWord(k.id) })), app.draft.kind,
          (v) => { app.draft.kind = v; rebuild(); }, 'kind'),
        choose(t('layout'), LAYOUTS.map((l) => ({ value: l.id, label: l.label })), app.layout || settings.layout,
          (v) => { app.layout = v; app.stored.document.layout = v; rebuild(); }, 'layout'),
      ]),
      // The document's language, its paper and its spacing are each decided once and then left
      // alone for good. Five choosers in a row squeezed every one of them down to "Rech…", so the
      // three that are settled live behind a button and the two that change with every document —
      // what kind of document it is, and which layout it wears — stay in the open.
      renderMore(),
      // The tool's own language rides in the bar, not down in the form: the bar is the one part
      // of the page a phone shows on both tabs, and somebody reading the wrong language needs the
      // way out in front of them, not behind a scroll.
      renderLangSwitch(),
      el('div', { class: 'apiv-bar__actions' }, [renderActions()]),
    ]);
  }

  /** The one strip above the form: which trade this is set up for, and the example. */
  function renderSetupStrip() {
    // The summary describes what a trade DID, not what it would do, so it appears only once one
    // has been applied. A line claiming "Minimal layout" beside a Classic document is a lie the
    // page tells about itself. It is written in English by the engine, so only the English form
    // shows it.
    const tpl = app.trade ? findTemplate(app.trade) : null;
    const summary = tpl && ui === 'en' ? templateSummary(tpl) : [];
    const conversions = conversionsFor(app.draft.kind);

    const pick = el('input', { type: 'file', accept: 'application/json,.json', class: 'apiv-kit', 'aria-hidden': 'true', tabindex: '-1' });
    pick.addEventListener('change', () => { importKit(pick.files && pick.files[0]); pick.value = ''; });

    return el('div', { class: 'apiv-setup' }, [
      choose(t('setUpFor'),
        [{ value: '', label: t('chooseTrade') }, ...TEMPLATES.map((x) => ({ value: x.id, label: x.label }))],
        app.trade, applyTrade, 'trade'),
      // Converting sits next to the trade because both answer "what is this document": a quote
      // becomes the invoice for the same work, an invoice becomes the credit note that reverses
      // it. Only the conversions this kind allows are listed.
      conversions.length
        ? choose(t('convertTo'), [{ value: '', label: t('choose') }, ...conversions.map((k) => ({ value: k.id, label: kindWord(k.id) }))], '', convertTo, 'convert')
        : null,
      el('div', { class: 'apiv-setup__actions' }, [
        button(t('fillExample'), fillExample, { variant: 'ghost', iconHtml: icons.example }),
        button(t('newDocument'), () => newDocument(t('blankDoc')), { variant: 'ghost', iconHtml: icons.newDoc }),
        // The file and forget actions are for the second visit, not the first; they sit apart.
        el('span', { class: 'apiv-setup__minor' }, [
          button(t('saveFile'), exportKit, { variant: 'ghost', iconHtml: icons.save }),
          el('span', {}, [button(t('loadFile'), () => pick.click(), { variant: 'ghost', iconHtml: icons.load }), pick]),
          // Offered only when there is something to forget, so the page does not advertise
          // storage to somebody who has not used any.
          hasRemembered() ? button(t('forget'), forgetMine, { variant: 'ghost', iconHtml: icons.forget }) : null,
        ]),
      ]),
      summary.length ? el('p', { class: 'apiv-setup__says', text: `${t('setsUp')} ${summary.join(' · ')}.` }) : null,
    ]);
  }

  /** Edit and Preview, on a phone. Above 900px both columns are shown and these are hidden. */
  function renderTabs() {
    const tab = (id, label, icon) => {
      const b = button(label, () => { app.tab = id; app.host.firstChild.setAttribute('data-tab', id); paintTabs(); fitPreview(); },
        { variant: app.tab === id ? 'primary' : 'ghost', iconHtml: icons[icon] });
      b.setAttribute('data-tab-for', id);
      return b;
    };
    return el('div', { class: 'apiv-tabs' }, [tab('edit', t('edit'), 'edit'), tab('preview', t('preview'), 'preview')]);
  }

  function paintTabs() {
    app.host.querySelectorAll('[data-tab-for]').forEach((b) => {
      const on = b.getAttribute('data-tab-for') === app.tab;
      b.classList.toggle('cmp-btn--primary', on);
      b.classList.toggle('cmp-btn--ghost', !on);
    });
  }

  function render() {
    applyPaper(app.stored.document.paperSize);
    const settings = settingsNow();
    recalc(app.draft, settings);

    app.previewHost = el('div', { class: 'studio-page' });
    app.statusHost = el('div', { class: 'apiv-statusbar', 'aria-live': 'polite' });
    // A logo that loads late changes the document's height after it was painted; the fitted
    // column on a phone has to follow, or it clips the foot of the page. A new host each render,
    // so a new watcher each render.
    if (app.fitWatch) app.fitWatch.disconnect();
    if (typeof ResizeObserver === 'function') {
      app.fitWatch = new ResizeObserver(() => fitPreview());
      app.fitWatch.observe(app.previewHost);
    }

    app.host.replaceChildren(el('div', { class: 'apiv', 'data-tab': app.tab, lang: ui }, [
      renderBar(),
      app.statusHost,
      renderTabs(),
      el('div', { class: 'apiv-body' }, [
        el('div', { class: 'apiv-col apiv-col--form' }, [
          renderSetupStrip(),
          renderForm({
            draft: app.draft, stored: app.stored, settings, onEdit: paintPreview, onRebuild: rebuild, t,
            isOpen: (id) => !app.collapsed.has(id),
            onToggle: (id, open) => { if (open) app.collapsed.delete(id); else app.collapsed.add(id); },
          }),
        ]),
        el('div', { class: 'apiv-col apiv-col--doc' }, [printFrame(app.previewHost)]),
      ]),
      el('p', { class: 'apiv-foot', text: hasRemembered() ? t('footRemembered') : t('footFresh') }),
      // The phone's copy of the actions, pinned to the foot of the screen. Hidden on wide screens.
      el('div', { class: 'apiv-dock' }, [renderActions()]),
    ]));
    paintPreview();
  }

  /* ---- boot -------------------------------------------------------------------------------- */

  // What this browser already knows. Settings outlive the tab; the document does not.
  const remembered = recallSettings();
  if (remembered) app.stored = sanitise(remembered);
  applyPageOptions({ fresh: !remembered });
  // A returning visitor's settings are already theirs, so the baseline is only "untouched" for
  // somebody arriving with nothing.
  if (!remembered) rebaseline();

  const held = recallDraft();
  if (held) {
    app.draft = normaliseDraft(held);
  } else {
    app.draft = emptyDraft(opts.kind, settingsNow());
    app.draft.client = { name: '' };
    // Numbered from the start, so the document on screen is a whole document and the number
    // follows on from whatever this browser issued last.
    app.draft.number = numberFor(opts.kind);
  }

  // One section open at a time, and the first one to begin with; a phone also starts on the
  // document rather than the form when there is a document to look at.
  ['client', 'doc', 'items', 'money', 'paid', 'words'].forEach((id) => app.collapsed.add(id));
  if (narrow() && hasContent()) app.tab = 'preview';

  // The example is for somebody arriving with nothing. Overwriting a returning visitor's own
  // half-finished invoice with ANUPRESS Works would be the rudest thing this page could do.
  if (opts.example && !held && !remembered) fillExample(); else render();

  // Where the top of the screen really is, for the sticky document and the phone's tab bar.
  measureStickyTop();
  window.addEventListener('resize', debounced(() => { measureStickyTop(); fitPreview(); }, 200));
  // A menu closes the way a menu should: click anywhere else, or press Escape.
  document.addEventListener('click', (e) => {
    const inside = e.target && e.target.closest && e.target.closest('details.apiv-more');
    closeMenus(inside && app.host.contains(inside) ? inside : null);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(null); });

  // The send route, when it exists, clears the document it has just sent.
  app.afterSend = afterSend;
  app.newDocument = newDocument;
  app.printDocument = printDocument;
  return app;
}

function boot() {
  console.info('[Invoice Studio Web] v' + APP_VERSION);
  const hosts = document.querySelectorAll('[data-apiv]');
  if (!hosts.length) return;
  // Where the PDF fonts live, when the script is not served beside them. The plugin passes its
  // own versioned asset directory; without it the loader falls back to the page's own base.
  hosts.forEach((h) => { if (h.dataset.assets) setAssetBase(h.dataset.assets); });
  // The printed page is named after the document rather than after the web page it sits on.
  // Several mounts on one page is unusual; the first one names the print.
  let first = null;
  hosts.forEach((h) => { const a = createApp(h); if (!first) first = a; });
  installPrintTitle(() => (first && first.draft ? printTitleFor(first.draft) : ''));
  // Ctrl+P on this page means the document, not the article around it — the same print the
  // button gives, so the shortcut cannot come out as blank pages either.
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || String(e.key).toLowerCase() !== 'p') return;
    if (!first || !first.draft) return;
    e.preventDefault();
    first.printDocument();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
