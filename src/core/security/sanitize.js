// HTML sanitizer for the one place this app renders author-supplied markup: the Text block.
//
// Why this exists. The Text block's `config.html` used to go straight into innerHTML. That config
// lives in the ANUPRESS_Config table inside a SHARED Grist document, so it is not only written by
// people using our editor — anyone with edit access to the document can type a payload directly
// into that row. It then executes in this widget's origin, which is the origin holding
// `window.grist` with the `full` access the manifest requests. So an ordinary document editor
// could run code as any viewer who opens the page, including the owner.
//
// Note the contrast with render/embed.js: the Embed block runs arbitrary author code *on purpose*
// and is safe because it is confined to a sandboxed iframe with an opaque origin. Text has no such
// boundary, so it needs this instead.
//
// Sanitizing happens at RENDER, not at save, and that is deliberate: configs containing a payload
// may already be sitting in people's documents, and only render-time filtering disarms those.

// Dropped with their contents — these either execute, load, or restructure the page.
const DROP_ENTIRELY = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta',
  'base', 'form', 'input', 'button', 'select', 'textarea', 'template', 'noscript', 'svg', 'math',
  'applet', 'frame', 'frameset', 'portal']);

// Kept, with the attributes listed below. Anything not here and not in DROP_ENTIRELY is unwrapped
// (element removed, children kept) so unknown markup degrades to its text rather than vanishing.
const ALLOWED = {
  p: [], br: [], hr: [], div: [], span: [], section: [], article: [],
  h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  b: [], strong: [], i: [], em: [], u: [], s: [], del: [], ins: [], mark: [], small: [],
  sub: [], sup: [], code: [], pre: [], kbd: [], samp: [], var: [], abbr: ['title'],
  blockquote: ['cite'], q: ['cite'], cite: [],
  ul: [], ol: ['start', 'type'], li: ['value'], dl: [], dt: [], dd: [],
  a: ['href', 'target', 'rel', 'title'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
  figure: [], figcaption: [],
  table: [], thead: [], tbody: [], tfoot: [], tr: [], caption: [], colgroup: [], col: ['span'],
  th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'],
};

// `class` and `style` are allowed on everything that survives (both are filtered further below):
// dropping them would silently destroy the formatting of text people have already written.
const GLOBAL_ATTRS = ['class', 'style', 'dir', 'lang'];

// Link/image targets. A blocked URL is dropped rather than rewritten, so it fails visibly as a
// dead link instead of quietly pointing somewhere unexpected.
//
// The rule is about the SCHEME, not the shape: anything carrying a scheme must carry one of these,
// and anything without a scheme is an ordinary relative reference and is fine. Matching whole URL
// shapes instead would reject `logo.png` and `docs/guide.html` — normal things to write in a text
// block — while adding no safety, since a scheme-less URL can never be `javascript:`.
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
// A scheme is only a scheme if its colon comes before any /, ? or # — otherwise the colon belongs
// to a path or query ("notes/2026: review").
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
// data: URIs only for raster images. SVG is excluded on purpose — an SVG data URI can carry script.
const SAFE_DATA_IMG = /^data:image\/(png|jpeg|jpg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;

// Control characters are stripped before testing because the parser has already decoded entities:
// `java&#9;script:` arrives here as a real tab inside the scheme, which browsers still honour. The
// allowlist would reject that anyway by failing to match — this just keeps the check about the URL
// rather than about how it happened to be spelled.
function urlOk(value, isImage) {
  const v = String(value || '').replace(/[\u0000-\u0020]/g, '').trim();
  if (isImage && SAFE_DATA_IMG.test(v)) return true;
  const upToDelimiter = v.split(/[/?#]/, 1)[0];
  const scheme = SCHEME_RE.exec(upToDelimiter);
  if (!scheme) return true;                       // relative reference — nothing to escalate to
  return ALLOWED_SCHEMES.has(scheme[1].toLowerCase());
}

// Inline styles are kept but reduced to presentational properties. Layout/position properties are
// excluded because a fixed, full-viewport element could sit invisibly over the real page and turn
// a click on our UI into a click on something the author chose.
const STYLE_PROPS = new Set(['color', 'background-color', 'background', 'font-size', 'font-weight',
  'font-style', 'font-family', 'text-align', 'text-decoration', 'text-transform', 'line-height',
  'letter-spacing', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border',
  'border-radius', 'border-color', 'border-width', 'border-style', 'width', 'max-width', 'height',
  'opacity', 'list-style', 'list-style-type', 'vertical-align', 'white-space']);
const STYLE_VALUE_OK = /^[a-z0-9#%.,()\s'"/+-]*$/i;

function cleanStyle(value) {
  const out = [];
  for (const decl of String(value || '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (!STYLE_PROPS.has(prop)) continue;
    // url() can fetch, and the rest are historical script vectors. Reject rather than strip, so a
    // declaration is never silently reinterpreted as something the author didn't write.
    if (/url\s*\(|expression\s*\(|javascript:|@import|<!--/i.test(val)) continue;
    if (!STYLE_VALUE_OK.test(val)) continue;
    out.push(`${prop}: ${val}`);
  }
  return out.join('; ');
}

function scrubElement(elm) {
  const tag = elm.tagName.toLowerCase();
  for (const attr of [...elm.attributes]) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    // Every event handler, in one rule — this is the case that made the Text block executable.
    if (name.startsWith('on')) { elm.removeAttribute(attr.name); continue; }
    const allowed = (ALLOWED[tag] || []).includes(name) || GLOBAL_ATTRS.includes(name);
    if (!allowed) { elm.removeAttribute(attr.name); continue; }
    if (name === 'href' || name === 'src') {
      if (!urlOk(value, name === 'src')) elm.removeAttribute(attr.name);
    } else if (name === 'style') {
      const cleaned = cleanStyle(value);
      if (cleaned) elm.setAttribute('style', cleaned); else elm.removeAttribute('style');
    }
  }
  // A link opening a new tab gets the opener severed, so the destination can't navigate us.
  if (tag === 'a' && elm.getAttribute('target')) elm.setAttribute('rel', 'noopener noreferrer');
}

function unwrap(elm) {
  const parent = elm.parentNode;
  if (!parent) return;
  while (elm.firstChild) parent.insertBefore(elm.firstChild, elm);
  parent.removeChild(elm);
}

/**
 * Returns a DocumentFragment of the sanitized markup, ready to append.
 *
 * Parsing goes through DOMParser rather than a detached div: DOMParser builds an inert document
 * that never loads images or runs handlers, so nothing fires during sanitizing itself.
 */
export function sanitizeToFragment(html) {
  const frag = document.createDocumentFragment();
  const str = String(html ?? '');
  if (!str.trim()) return frag;

  let doc;
  try { doc = new DOMParser().parseFromString(str, 'text/html'); }
  catch { frag.appendChild(document.createTextNode(str)); return frag; }

  // Depth-first over a static list: the tree is mutated while walking, and a live NodeList would
  // skip siblings as elements get unwrapped.
  for (const elm of [...doc.body.querySelectorAll('*')]) {
    if (!elm.isConnected) continue; // already removed with an ancestor
    const tag = elm.tagName.toLowerCase();
    if (DROP_ENTIRELY.has(tag)) { elm.remove(); continue; }
    if (!ALLOWED[tag]) { unwrap(elm); continue; }
    scrubElement(elm);
  }
  while (doc.body.firstChild) frag.appendChild(doc.body.firstChild);
  return frag;
}

// String form, for tests and for anywhere a string is genuinely needed.
export function sanitizeHtml(html) {
  const host = document.createElement('div');
  host.appendChild(sanitizeToFragment(html));
  return host.innerHTML;
}
