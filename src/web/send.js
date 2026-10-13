// "Email it to me": the one thing this tool does that needs a server.
//
// The browser builds the file, the PDF or the e-invoice, and posts it once to the site that hosts
// the tool. The site emails it to the visitor's own address and to nobody else, in the same request,
// and keeps nothing. The visitor proves the address with a six-digit code the first time; a signed
// cookie then remembers it for a month, so the code is asked for once, not every time.
//
// Why only to the visitor: until plugin 0.5.0 the site sent invoices on to the visitor's clients.
// That let anybody with a throwaway mailbox send an invoice under any business name, with their own
// bank details, from our domain, which is how invoice fraud works. Forwarding from their own mailbox
// costs the visitor one step, and their client then sees the real sender.
//
// Nothing here is trusted by the server: it re-checks the code, the address and the file on its
// side, and writes the subject and the words of the email itself. This dialog exists to make the
// honest path the easy one, not to be the only guard.

import { el } from '../core/util.js';
import { field, textInput, selectInput, button } from '../compose/ui.js';
import { attachmentFor } from '../export/download.js';
import { EINVOICE_FORMATS } from '../einvoice/index.js';

const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/**
 * Does the document still hold the tool's fictional example?
 *
 * The example's addresses all live on .example, a top-level domain reserved so it can never be
 * registered, including a payment page at pay.anupress.example. An invoice whose "Pay online" points
 * at a domain that does not exist is what a mail filter calls phishing, so the example is never
 * emailed. The server makes the same check on the file.
 */
const EXAMPLE = /[a-z0-9-]\.example(?![a-z0-9.-])/i;
export function holdsExample(draft, settings) {
  return EXAMPLE.test(JSON.stringify([settings?.sender, draft?.sender, draft?.client]));
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* a non-JSON reply is reported by status below */ }
  if (!res.ok || !json || json.ok === false) {
    const why = (json && (json.error || json.message)) || `the server answered ${res.status}`;
    const err = new Error(why);
    err.code = (json && json.code) || '';   // the route's own word for what went wrong, e.g. "bot"
    throw err;
  }
  return json;
}

/**
 * Cloudflare's bot check, loaded only when the page has a site key and only once.
 *
 * Resolves to a function that renders a widget into an element and returns a promise of the
 * token. Without a key the page has no check and the server knows it — see the plugin settings.
 */
let turnstileReady = null;
function loadTurnstile() {
  if (turnstileReady) return turnstileReady;
  turnstileReady = new Promise((resolve) => {
    if (window.turnstile) { resolve(window.turnstile); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.turnstile || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return turnstileReady;
}

/**
 * Open the dialog. `ctx`:
 *   draft, settings, t          the document, its runtime settings, the page's translator
 *   endpoint                    the REST base, e.g. https://anupress.com/wp-json/anupress-invoice/v1
 *   turnstileKey                Cloudflare site key, or '' when the page has no bot check
 *   host                        the element to mount the dialog in (kept inside the tool's own CSS)
 *   onSent(email)               called once the server has accepted the file, with the address
 */
export function openSendDialog(ctx) {
  const { draft, settings, t, endpoint, turnstileKey, host, onSent } = ctx;

  const example = holdsExample(draft, settings);
  const state = {
    email: settings.sender?.email && !EXAMPLE.test(settings.sender.email) ? settings.sender.email : '',
    verified: '',       // the address the server already trusts, from its cookie
    code: '',
    attach: settings.attachFormat && settings.attachFormat !== 'none' && settings.attachFormat !== 'html' ? settings.attachFormat : 'pdf',
    turnstile: '',
    codeSent: false,
  };

  const note = el('div', { class: 'apiv-modal__note', 'aria-live': 'polite' });
  const say = (text, kind = 'ok') => { note.className = 'apiv-modal__note apiv-modal__note--' + kind; note.textContent = text; };

  const overlay = el('div', { class: 'apiv-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('emailIt') });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  /* ---- the address, and proving it is theirs --------------------------------------------- */

  const emailInput = textInput(state.email, (v) => { state.email = v.trim(); }, { type: 'email', placeholder: 'you@example.com' });
  const codeInput = textInput('', (v) => { state.code = v.replace(/\D/g, '').slice(0, 6); }, { placeholder: '123456', inputmode: 'numeric' });
  const codeRow = field(t('codeLabel'), codeInput, t('codeHint'));
  codeRow.hidden = true;
  const verifiedLine = el('p', { class: 'cmp-field__hint', hidden: true });

  const sendCode = button(t('sendCode'), async () => {
    if (!looksLikeEmail(state.email)) { say(t('emailInvalid'), 'err'); return; }
    sendCode.disabled = true;
    try {
      const token = await freshToken();
      if (turnstileKey && !token) { say(t('botCheckWait'), 'err'); return; }
      spent = true;
      await post(`${endpoint}/code`, { email: state.email, turnstile: token, lang: t('_lang') });
      state.codeSent = true;
      codeRow.hidden = false;
      say(t('codeSent', { email: state.email }));
      codeInput.focus();
    } catch (e) {
      say(t('couldNot', { why: e.message }), 'err');
    } finally {
      sendCode.disabled = false;
      renewSoon();
    }
  }, { variant: 'ghost' });

  /* ---- which file ------------------------------------------------------------------------ */

  const attachOptions = [
    { value: 'pdf', label: 'PDF' },
    ...EINVOICE_FORMATS.map((f) => ({ value: f.id, label: f.label })),
  ];
  const attachSelect = selectInput(attachOptions, state.attach, (v) => { state.attach = v; });

  /* ---- the bot check --------------------------------------------------------------------- */

  // A Turnstile token is good for ONE siteverify call and for five minutes. "Send me a code" spends
  // one, and so does every Send, including a Send the server refuses for another reason — so the
  // token is renewed after each use, and again when Cloudflare says it has expired, by resetting
  // the widget and waiting for its callback. In managed mode that renewal is usually invisible.
  // Without this, the first real send on the site failed with "the bot check did not pass": the
  // code request had used the token and the send re-sent the same one.
  const turnstileHost = el('div', { class: 'apiv-modal__turnstile' });
  let widget = null;          // { ts, id } once rendered
  let spent = false;          // the token in state has been sent to the server
  let waiting = [];           // resolvers for whoever asked for a token before one arrived
  const gotToken = (token) => { state.turnstile = token; spent = false; waiting.splice(0).forEach((r) => r(token)); };
  if (turnstileKey && !example) {
    loadTurnstile().then((ts) => {
      if (!ts) { say(t('botCheckFailed'), 'err'); return; }
      try {
        const id = ts.render(turnstileHost, {
          sitekey: turnstileKey,
          callback: gotToken,
          'expired-callback': () => { state.turnstile = ''; },
          'timeout-callback': () => { state.turnstile = ''; },
          'error-callback': () => { state.turnstile = ''; },
        });
        widget = { ts, id };
      } catch { say(t('botCheckFailed'), 'err'); }
    });
  }
  /** A token the server has not seen yet, or '' when none could be had in time. */
  function freshToken() {
    if (!turnstileKey) return Promise.resolve('');
    const expired = widget && typeof widget.ts.isExpired === 'function' && widget.ts.isExpired(widget.id);
    if (state.turnstile && !spent && !expired) return Promise.resolve(state.turnstile);
    if (!widget) return Promise.resolve('');
    return new Promise((resolve) => {
      const timer = setTimeout(() => { waiting = waiting.filter((r) => r !== done); resolve(''); }, 12000);
      const done = (token) => { clearTimeout(timer); resolve(token); };
      waiting.push(done);
      state.turnstile = '';
      try { widget.ts.reset(widget.id); } catch { done(''); }
    });
  }
  /** Start renewing a spent token now, so the next click finds one ready instead of waiting. */
  function renewSoon() {
    if (turnstileKey && spent && widget) freshToken().catch(() => {});
  }

  /* ---- sending --------------------------------------------------------------------------- */

  const sendBtn = button(t('send'), async () => {
    if (holdsExample(draft, settings)) { say(t('exampleData'), 'err'); return; }
    if (!looksLikeEmail(state.email)) { say(t('emailInvalid'), 'err'); return; }
    if (state.email.toLowerCase() !== state.verified.toLowerCase() && !state.code) { say(t('needCode'), 'err'); return; }

    sendBtn.disabled = true;
    say(t('sending'));
    try {
      const attachment = await attachmentFor(draft, settings, state.attach);
      const payload = (turnstile) => ({
        email: state.email,
        code: state.code,
        turnstile,
        document: { kind: draft.kind, number: draft.number || '' },
        attachment: {
          name: attachment.fileName,
          mime: attachment.contentType,
          encoding: attachment.encoding,
          content: attachment.content,
        },
        lang: t('_lang'),
      });

      let token = await freshToken();
      if (turnstileKey && !token) { say(t('botCheckWait'), 'err'); sendBtn.disabled = false; return; }
      let reply;
      try {
        spent = true;
        reply = await post(`${endpoint}/send`, payload(token));
      } catch (e) {
        // A token can go stale between the widget's tick and the click. One renewal, one retry.
        if (e.code !== 'bot' || !turnstileKey) throw e;
        token = await freshToken();
        if (!token) throw e;
        spent = true;
        reply = await post(`${endpoint}/send`, payload(token));
      }

      say(t('sentToYou', { email: state.email }));
      const email = state.email;
      setTimeout(() => { close(); onSent(email, reply); }, 900);
    } catch (e) {
      say(t('couldNot', { why: e.message }), 'err');
      sendBtn.disabled = false;
      renewSoon();
    }
  }, { variant: 'primary' });

  /* ---- assemble -------------------------------------------------------------------------- */

  overlay.appendChild(el('div', { class: 'apiv-modal__card' }, [
    el('div', { class: 'apiv-modal__head' }, [
      el('h3', { class: 'apiv-modal__title', text: t('emailIt') }),
      button('', close, { variant: 'ghost', icon: '×', title: t('closeDialog') }),
    ]),
    el('p', { class: 'apiv-modal__intro', text: t('selfIntro') }),
    el('div', { class: 'apiv-modal__grid' }, [
      field(t('yourEmail'), el('div', { class: 'apiv-modal__row' }, [emailInput, sendCode]), t('yourEmailHint'), { wide: true }),
      verifiedLine,
      codeRow,
      field(t('attach'), attachSelect),
      turnstileHost,
    ]),
    note,
    el('div', { class: 'apiv-modal__actions' }, [button(t('cancel'), close, { variant: 'ghost' }), sendBtn]),
  ]));

  host.appendChild(overlay);

  // The example never leaves the page, so say so before anyone asks for a code.
  if (example) {
    say(t('exampleData'), 'err');
    sendCode.disabled = true;
    sendBtn.disabled = true;
    return { close };
  }
  emailInput.focus();

  // Does the server already trust an address from a previous send? Then the code is not asked.
  fetch(`${endpoint}/status`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => {
      if (!s) return;
      if (s.enabled === false) { say(t('sendingOff'), 'err'); sendBtn.disabled = true; return; }
      if (s.verified) {
        state.verified = s.verified;
        if (!state.email) { state.email = s.verified; emailInput.value = s.verified; }
        verifiedLine.hidden = false;
        verifiedLine.textContent = t('verifiedAs', { email: s.verified });
      }
    })
    .catch(() => { /* the status is a convenience; sending still asks for a code */ });

  return { close };
}
