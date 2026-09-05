# Third-party notices

Invoice Studio bundles the files below under `vendor/` and `fonts/`, and ships them as part of
the widget. Each one's licence requires its copyright notice to travel with the code; Apache-2.0
additionally requires a copy of the licence itself. This file carries both.

Nothing here changes the licence of the ANUPRESS source, which is MIT — see `LICENSE`.

---

## Grist Plugin API

`vendor/grist-plugin-api.js` — <https://github.com/gristlabs/grist-core>
Copyright Grist Labs Inc.
Licensed under the **Apache License, Version 2.0**. The full licence text is at
<https://www.apache.org/licenses/LICENSE-2.0> and is reproduced in `vendor/LICENSE-Apache-2.0.txt`.

The bundle Grist Labs publishes incorporates `events` (a browser port of Node's EventEmitter),
Copyright Joyent, Inc. and other Node contributors, under the MIT License (text below).

## Sortable 1.15.3

`vendor/Sortable.min.js` — <https://github.com/SortableJS/Sortable>
Copyright (c) 2019 All contributors to Sortable
Licensed under the **MIT License**:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## DejaVu Sans

`fonts/DejaVuSans-Regular.ttf`, `fonts/DejaVuSans-Bold.ttf` — <https://dejavu-fonts.github.io/>
Fonts are (c) Bitstream, Inc.; DejaVu changes are in the public domain; glyphs imported from the
Arev fonts are (c) Tavmjong Bah. Licensed under the **Bitstream Vera Fonts licence** with the
DejaVu and Arev additions, reproduced in full in `fonts/LICENSE_DEJAVU`.

The widget embeds a subset of these fonts into a PDF only when a document needs glyphs the
standard PDF fonts cannot draw (Polish, Czech, Greek, Cyrillic, the rupee sign). The licence
permits embedding and subsetting; the subset carries the font's name and copyright.

---

Nothing else is fetched at view time. The widget makes no network requests of its own: the only
outbound traffic is what the person using it chooses to send, through the routes named in the
Send panel.
