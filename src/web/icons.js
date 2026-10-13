// The tool's icons, drawn inline.
//
// Same geometry as the PDF tools' set (kernel/icons.js over there): a 24×24 box, a 1.8 stroke,
// round caps and joins, `currentColor` so every icon takes the colour of whatever it sits in.
// Inline strings rather than a sprite sheet or a font, because this whole tool is one script
// dropped into somebody's WordPress page and must not reach the network for a picture.
//
// Emoji are never used as icons. They are a different shape on every platform, they cannot take
// a colour, and half of them are a different thing entirely on a phone. An icon here is a line
// drawing that says what a control does and goes quiet when it is not being looked at.

const svg = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" `
  + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

export const icons = {
  /* ---- the form's seven sections ---------------------------------------------------------- */
  business: svg('<path d="M3 21h18"/><path d="M5 21V6a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15"/><path d="M14 10h4a1 1 0 0 1 1 1v10"/><path d="M8 9h3M8 13h3M8 17h3"/>'),
  client: svg('<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  document: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>'),
  items: svg('<path d="M4 6h2M4 12h2M4 18h2"/><path d="M10 6h10M10 12h10M10 18h6"/>'),
  money: svg('<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>'),
  pay: svg('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6.5 15h3"/>'),
  words: svg('<path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12.5h5"/>'),

  /* ---- the bar's choosers ------------------------------------------------------------------ */
  kind: svg('<path d="M15 3H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z"/><path d="M15 3v4h4"/><path d="M3 8v11a2 2 0 0 0 2 2h9"/>'),
  layout: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3.2 9h17.6M3.2 15h17.6"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>'),
  paper: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7.5h7"/>'),
  density: svg('<path d="M4 5h16M4 10h16M4 15h16M4 20h16"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>'),

  /* ---- the four things you can do with the document ---------------------------------------- */
  print: svg('<path d="M7 9V4h10v5"/><path d="M7 19H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="15" width="10" height="6" rx="1"/>'),
  html: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m10.5 12.5-2 2 2 2M13.5 12.5l2 2-2 2"/>'),
  einvoice: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 15 2 2 4-4"/>'),
  download: svg('<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 20h14"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>'),

  /* ---- setting the thing up ---------------------------------------------------------------- */
  trade: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>'),
  convert: svg('<path d="M4 8h12l-3-3M20 16H8l3 3"/>'),
  example: svg('<path d="M12 3.5 13.7 8l4.5 1.7-4.5 1.7L12 16l-1.7-4.6L5.8 9.7 10.3 8z"/><path d="M18 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  newDoc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/>'),
  save: svg('<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7M8 15h8"/>'),
  load: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  forget: svg('<path d="M4 7h16M10 11v6M14 11v6"/><path d="m6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),

  /* ---- odds and ends ----------------------------------------------------------------------- */
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.1"/>'),
  edit: svg('<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m13.5 6.5 4 4"/>'),
  preview: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-9 9"/>'),
  palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-3.9-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10.5" cy="7.5" r="1.1"/><circle cx="15" cy="8.5" r="1.1"/>'),
  check: svg('<path d="m20 6-11 11-5-5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  lock: svg('<rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>'),
};

/** The icon for a form section, by the section's id. */
export const SECTION_ICON = {
  you: 'business', client: 'client', doc: 'document', items: 'items',
  money: 'money', paid: 'pay', words: 'words',
};
