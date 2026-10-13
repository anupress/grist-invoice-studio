// The web tool's chrome: icons, the EN/DE switch, the help pop-overs, the section heads.
//
// None of it can be clicked here — these tests run in Node, where there is no document — so what
// is checked is what can be: that every icon a section asks for exists and is a real line drawing,
// that both languages carry every word the new controls use, that the language switch keeps to the
// key the rest of the site uses, and that the pieces the shell relies on are still wired in the
// source. The clicking is checked in a browser; this is the net under it.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);
const read = (p) => readFileSync(_resolve(ROOT, p), 'utf8');

const { icons, SECTION_ICON } = await load('src/web/icons.js');
const { UI_LANGUAGES, UI_LANGUAGE_NAMES, uiLanguage, rememberLang, translator } = await load('src/web/strings.js');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---------------------------------------------------------------------------------------------
// The icons: line drawings, never emoji
// ---------------------------------------------------------------------------------------------
const names = Object.keys(icons);
ok('there is a set of them', names.length >= 25);
for (const [name, svg] of Object.entries(icons)) {
  ok(`${name} is an svg`, /^<svg /.test(svg) && svg.trim().endsWith('</svg>'));
  ok(`${name} takes the colour it sits in`, svg.includes('stroke="currentColor"') && svg.includes('fill="none"'));
  ok(`${name} is drawn on one grid`, svg.includes('viewBox="0 0 24 24"') && svg.includes('stroke-width="1.8"'));
  ok(`${name} is hidden from a screen reader`, svg.includes('aria-hidden="true"'));
  ok(`${name} draws something`, /<(path|circle|rect)/.test(svg));
  // An emoji would be a different picture on every phone and could not take a colour.
  ok(`${name} is not an emoji`, !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(svg));
}
// Every form section has its own badge, and no two share one.
const sections = ['you', 'client', 'doc', 'items', 'money', 'paid', 'words'];
eq('every section is spoken for', Object.keys(SECTION_ICON).sort(), [...sections].sort());
ok('each names an icon that exists', Object.values(SECTION_ICON).every((n) => icons[n]));
eq('and no two sections share a drawing', new Set(Object.values(SECTION_ICON)).size, sections.length);
for (const n of ['print', 'html', 'einvoice', 'download', 'mail', 'globe', 'settings', 'info', 'edit', 'preview']) {
  ok(`the chrome's ${n} icon exists`, !!icons[n]);
}

// ---------------------------------------------------------------------------------------------
// EN and DE: the words the new controls need, in both
// ---------------------------------------------------------------------------------------------
eq('two languages, and English first', UI_LANGUAGES, ['en', 'de']);
eq('each named in its own words', UI_LANGUAGE_NAMES, { en: 'English', de: 'Deutsch' });
const EN = translator('en');
const DE = translator('de');
for (const key of ['interfaceLanguage', 'switchedLanguage', 'whatIsThis', 'aboutField', 'moreSettings',
  'print', 'downloadHtml', 'downloadPdf', 'emailIt', 'edit', 'preview', 'paper', 'density', 'docLanguage']) {
  ok(`${key} is written in English`, EN(key) !== key && EN(key).length > 1);
  ok(`${key} is written in German too`, DE(key) !== key && DE(key) !== EN(key));
}
ok('the help button says what it is for', /\?$/.test(EN('whatIsThis')) && /\?$/.test(DE('whatIsThis')));
ok('the help button names its field', EN('aboutField', { label: 'Country' }).includes('Country')
  && DE('aboutField', { label: 'Land' }).includes('Land'));
ok('switching says the document is untouched', /document/i.test(EN('switchedLanguage')) && /Dokument/.test(DE('switchedLanguage')));
// The longest words in the bar: German labels are what made it wrap, so they are kept short.
ok('the German send button stays short', DE('emailIt').length <= 15);

// ---------------------------------------------------------------------------------------------
// Which language the form speaks
// ---------------------------------------------------------------------------------------------
ok('without a browser it falls back to English', uiLanguage(null) === 'en');
ok('a page can pin it', uiLanguage({ dataset: { ui: 'de' } }) === 'de');
ok('nonsense on the page is ignored', uiLanguage({ dataset: { ui: 'klingon' } }) === 'en');
ok('remembering a language never throws, even with no storage', (() => { try { rememberLang('de'); rememberLang('xx'); return true; } catch { return false; } })());
const strings = read('src/web/strings.js');
ok('the choice is kept under the key the rest of the site uses', /const LANG_KEY = 'apws-lang'/.test(strings));
ok('a link can pin the language', /URLSearchParams\(window\.location\.search\)\.get\('lang'\)/.test(strings));
ok('the visitor’s own choice outranks the page', strings.indexOf('localStorage.getItem(LANG_KEY)') < strings.indexOf('host.dataset.ui'));

// ---------------------------------------------------------------------------------------------
// The shell: what the source has to keep doing
// ---------------------------------------------------------------------------------------------
const app = read('src/web/app.js');
ok('the language is switchable at runtime', /let ui = uiLanguage\(host\)/.test(app) && /function setLang/.test(app));
ok('switching remembers the choice', /rememberLang\(code\)/.test(app));
ok('switching redraws the whole tool', /setLang[\s\S]{0,400}render\(\);/.test(app));
ok('the switch is in the bar, which a phone shows on both tabs', /renderLangSwitch\(\),[\s\S]{0,200}apiv-bar__actions/.test(app));
ok('the set-once settings are behind one button', /function renderMore\(/.test(app) && /apiv-more__panel/.test(app));
ok('that button holds the language, the paper and the spacing', /apiv-more__panel[\s\S]{0,600}docLanguage[\s\S]{0,400}paper[\s\S]{0,400}density/.test(app));
ok('and the bar keeps the two that change per document', /apiv-bar__choices[\s\S]{0,400}t\('document'\)[\s\S]{0,400}t\('layout'\)/.test(app));
ok('a menu closes on Escape', /Escape[\s\S]{0,60}closeMenus/.test(app));
for (const [label, icon] of [['print', 'print'], ['downloadHtml', 'html'], ['downloadPdf', 'download'], ['emailIt', 'mail']]) {
  ok(`the ${label} action carries its icon`, new RegExp(`t\\('${label}'\\)[\\s\\S]{0,120}icons\\.${icon}`).test(app));
}

const form = read('src/web/form.js');
ok('every section head carries its badge', /SECTION_ICON\[id\]/.test(form));
ok('and says what it is holding', /function headline\(/.test(form) && /apiv-sec__says/.test(form));
ok('the heads are refreshed as the document changes', /refreshHeads\(\)/.test(form) && /ctx\.onEdit\(\); refreshHeads\(\)/.test(form));
ok('long help becomes a pop-over, short help stays printed', /TIP_AT/.test(form) && /String\(hint\)\.length <= TIP_AT/.test(form));
ok('one tip is open at a time', /closeTips\(\)/.test(form));
ok('and Escape closes it', /key === 'Escape'[\s\S]{0,40}closeTips/.test(form));

const css = read('src/styles/web.css');
for (const sel of ['.apiv-sec__icon', '.apiv-sec__says', '.apiv-lang', '.apiv-lang__btn', '.apiv-tipbtn',
  '.apiv-tip', '.apiv-more__btn', '.apiv-more__panel', '.apiv-field__head', '.cmp-btn__icon--svg']) {
  ok(`${sel} is styled`, css.includes(sel));
}
ok('the pressed language is the filled one', /\.apiv-lang__btn\[aria-pressed="true"\][^}]*background: var\(--accent\)/.test(css));
ok('a tight bar drops the words of the two secondary actions', /@container \(max-width: 1199px\)[\s\S]{0,200}cmp-btn--ghost > span:not\(\.cmp-btn__icon\)/.test(css));
ok('fingers get a target on the small round buttons', /\.apiv-tipbtn::after[^}]*inset: -10px/.test(css));
// A host theme draws its own marker on every <summary> — Blocksy's accordions put a "+" there,
// and it turned up inside the settings button on the live site.
ok('the theme’s summary marker is refused', /\.apiv \.apiv-more__btn::before, \.apiv \.apiv-more__btn::after \{ content: none !important/.test(css));
ok('and on the section heads too', /\.apiv \.apiv-sec > summary::before \{ content: none !important/.test(css));
ok('a phone gives the two choosers the full width', /@container \(max-width: 639px\)[\s\S]{0,700}\.apiv-bar__choices \{ flex: 1 1 100%/.test(css));
// Blocksy pads every <summary> (15px 0), which squashed the drawing inside the settings button.
ok('the theme’s summary padding is refused', /\.apiv \.apiv-more__btn \{ display: grid !important; place-items: center !important; padding: 0 !important/.test(css));
// The dock's row hung off the LEFT of a phone: `1fr` tracks never shrink below their content, and
// the row inherits the bar's right alignment, so the overflow went backwards off the screen.
ok('the dock’s tracks may shrink', /\.apiv-dock \.apiv-actions \{[\s\S]{0,160}grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/.test(css));
ok('and the row sits under its own box', /\.apiv-dock \.apiv-actions \{[\s\S]{0,200}justify-content: stretch/.test(css));
ok('on a phone its two secondary actions go icon-only', /\.apiv \.apiv-dock \.cmp-btn--ghost > span:not\(\.cmp-btn__icon\) \{ display: none/.test(css));
ok('and still take a finger', /\.apiv \.apiv-dock \.cmp-btn--ghost \{ min-width: 46px/.test(css));
ok('and a phone gives each chooser its own row', /@container \(max-width: 639px\)[\s\S]{0,700}\.apiv-bar \.apiv-choose \{ flex: 1 1 100%; min-width: 0; max-width: none/.test(css));

const ui = read('src/compose/ui.js');
ok('the shared button can carry one of our drawings', /opts\.iconHtml/.test(ui));
ok('and it stays decorative', /cmp-btn__icon--svg[\s\S]{0,80}aria-hidden/.test(ui));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
