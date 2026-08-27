// Curated, ready-to-use palettes + font pairings. Users can pick one of these or
// override any color. A palette = brand primary/accent + 8 series colors for charts.
//
// Two things are checked rather than judged by eye, because both were wrong in shipped palettes:
//
//   Contrast. The primary is used as a button fill AND as text. Neither is the palette's problem
//   to solve any more — theme/apply.js derives the label colour and a readable text version from
//   whatever primary is in force, so a pale primary no longer means white-on-cream buttons or an
//   invisible link. Palettes are free to be as light or dark as the brand wants.
//
//   Separation. Series colours are handed to charts in order, so #1 and #2 land next to each other
//   in a two-series chart and #1-#3 in a doughnut of three. Neighbours that measure close in Lab
//   space read as one colour. Ocean's #2 and #3 were 5.2 apart, which is not a difference anyone
//   can see; Graphite's #1 and #2 were 9.6, in the pair that appears most often of all.
export const PALETTES = [
  { id: 'aurora',   name: 'Aurora',   primary: '#6d5efc', accent: '#16c4a6', series: ['#6d5efc','#16c4a6','#ff8a5b','#ffd166','#ef476f','#4cc9f0','#b06bff','#06d6a0'] },
  { id: 'sunset',   name: 'Sunset',   primary: '#ff6b6b', accent: '#ffa94d', series: ['#ff6b6b','#ffa94d','#ffd43b','#f783ac','#9775fa','#4dabf7','#69db7c','#ff922b'] },
  // The primary was #1c7ed6, a mid-tone that neither white nor black could sit on at 4.5:1 —
  // white reached 4.20, black 4.36, so the button label failed whichever was chosen. One step
  // darker is the same blue and carries white comfortably. #3 was #15aabf and #6 #3bc9db, both
  // shades of #2 rather than colours of their own.
  { id: 'ocean',    name: 'Ocean',    primary: '#1971c2', accent: '#22b8cf', series: ['#1971c2','#22b8cf','#0b7285','#4263eb','#9775fa','#e8590c','#0ca678','#748ffc'] },
  { id: 'forest',   name: 'Forest',   primary: '#2f9e44', accent: '#94d82d', series: ['#2f9e44','#94d82d','#66a80f','#37b24d','#0ca678','#fcc419','#a9e34b','#099268'] },
  // #3 was #f06595, half a step from #2.
  { id: 'berry',    name: 'Berry',    primary: '#ae3ec9', accent: '#e64980', series: ['#ae3ec9','#e64980','#ff922b','#cc5de8','#845ef7','#ff6b6b','#faa2c1','#7048e8'] },
  // A deliberately monochrome palette still has to ramp: #1/#2 were #343a40/#495057, two dark
  // greys a chart cannot tell apart. The greys now step properly and the two accents stay.
  { id: 'mono',     name: 'Graphite', primary: '#495057', accent: '#868e96', series: ['#212529','#5c636a','#adb5bd','#868e96','#5c7cfa','#15aabf','#ced4da','#343a40'] },
  { id: 'candy',    name: 'Candy',    primary: '#f06595', accent: '#74c0fc', series: ['#f06595','#74c0fc','#63e6be','#ffd43b','#b197fc','#ff8787','#3bc9db','#69db7c'] },
  { id: 'midnight', name: 'Midnight', primary: '#7c83ff', accent: '#22d3ee', series: ['#7c83ff','#22d3ee','#f472b6','#fbbf24','#34d399','#f87171','#a78bfa','#60a5fa'], mode: 'dark' },
  { id: 'corporate',name: 'Corporate',primary: '#0b6bcb', accent: '#0891b2', series: ['#0b6bcb','#0891b2','#475569','#64748b','#0ea5e9','#14b8a6','#94a3b8','#1e293b'] },
  // The tail was four browns of the same value; #7/#8 measured 6.3 apart. A warm stone and a deep
  // olive give the last two slots somewhere to be without leaving the earth range.
  { id: 'warmclay', name: 'Warm Clay',primary: '#c2410c', accent: '#d97706', series: ['#c2410c','#d97706','#b45309','#a16207','#ca8a04','#ea580c','#57534e','#3f6212'] },

  // ---- Added ----
  // Chosen to cover ground the ten above do not: a green-blue that is not Ocean, a dark red, a
  // muted professional blue-grey, a warm neutral, a cool light, and one built for colour vision
  // deficiency rather than for looks.
  { id: 'teal',     name: 'Teal',     primary: '#0f766e', accent: '#f59e0b', series: ['#0f766e','#f59e0b','#0ea5e9','#84cc16','#e11d48','#8b5cf6','#14b8a6','#a16207'] },
  { id: 'rosewood', name: 'Rosewood', primary: '#9f1239', accent: '#b45309', series: ['#9f1239','#b45309','#4c1d95','#0f766e','#d97706','#be123c','#7c3aed','#065f46'] },
  { id: 'slate',    name: 'Slate',    primary: '#334155', accent: '#0ea5e9', series: ['#334155','#0ea5e9','#f59e0b','#10b981','#8b5cf6','#ef4444','#64748b','#06b6d4'] },
  { id: 'sand',     name: 'Sand',     primary: '#8d6e3f', accent: '#bc6c25', series: ['#8d6e3f','#bc6c25','#606c38','#283618','#a3612f','#6b705c','#cb997e','#3f4238'] },
  { id: 'nordic',   name: 'Nordic',   primary: '#2c5d8a', accent: '#4fb0ae', series: ['#2c5d8a','#4fb0ae','#e07a5f','#f2cc8f','#81b29a','#3d405b','#9db4c0','#5f797b'] },
  // Okabe & Ito's colour-blind-safe set, the one used across scientific publishing. Chosen for
  // being distinguishable under deuteranopia, protanopia and tritanopia rather than for being
  // pretty — the option to reach for when a dashboard is going in front of an audience you cannot
  // ask. Black is dropped from the series (it reads as a missing slice on a chart) and the eighth
  // slot takes a reddish purple instead.
  { id: 'access',   name: 'Accessible', primary: '#0072b2', accent: '#d55e00', series: ['#0072b2','#d55e00','#009e73','#cc79a7','#e69f00','#56b4e9','#8b5a00','#7b3294'] },
];

export const FONT_PAIRS = [
  { id: 'system',  name: 'Crisp Sans',  head: '"Segoe UI", system-ui, -apple-system, Arial, sans-serif', body: '"Segoe UI", system-ui, -apple-system, Arial, sans-serif' },
  { id: 'serifmix',name: 'Editorial',   head: 'Georgia, "Times New Roman", serif', body: '"Segoe UI", system-ui, sans-serif' },
  { id: 'humanist',name: 'Humanist',    head: '"Trebuchet MS", "Segoe UI", sans-serif', body: '"Segoe UI", system-ui, sans-serif' },
  { id: 'geometric',name:'Geometric',   head: '"Century Gothic", "Segoe UI", sans-serif', body: '"Segoe UI", system-ui, sans-serif' },
  { id: 'mono',    name: 'Technical',   head: '"Cascadia Code", Consolas, ui-monospace, monospace', body: '"Segoe UI", system-ui, sans-serif' },
  // Stacks only — no web fonts. A published page runs under a strict CSP with no outside requests,
  // so anything not already on the reader's machine would silently fall back to Times.
  // Serif throughout, where Editorial above is a serif headline over a sans body. Palatino on
  // Windows and macOS, Georgia everywhere else.
  { id: 'classic', name: 'Classic',     head: '"Palatino Linotype", Palatino, Georgia, serif', body: 'Georgia, "Times New Roman", serif' },
  // A slab headline reads as confident rather than loud, which suits a dashboard title better than
  // a heavier weight of the body face. Rockwell is a Windows/Office font; the rest fall back.
  { id: 'slab',    name: 'Slab',        head: 'Rockwell, "Roboto Slab", Georgia, serif', body: '"Segoe UI", system-ui, sans-serif' },
];

export const getPalette = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];
export const getFontPair = (id) => FONT_PAIRS.find((f) => f.id === id) || FONT_PAIRS[0];
