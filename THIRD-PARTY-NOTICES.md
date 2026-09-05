# Third-party notices

The rose_calc source is under the **MIT License** (see `LICENSE`). It bundles a
library and two typefaces that carry their own licences, and it ships original
artwork that the MIT grant does not cover. This file is the notice that has to
travel with any copy you distribute.

| Component | Licence | Used for |
|---|---|---|
| [jQuery 3.7.1](https://jquery.com/) | MIT | every DOM interaction in `js/app.js` |
| [Fredoka](https://github.com/hafontia/Fredoka) | SIL OFL 1.1 | display type, headings and stat numerals |
| [Barlow](https://github.com/jpt/barlow) | SIL OFL 1.1 | body text and tabular figures |
| The mole logo, favicon and preview card | **not MIT** — see below | branding |

Everything is vendored rather than loaded from a CDN, so the page keeps working
with no network. That also means these files are redistributed, which is why
the notices below are required rather than merely polite.

## jQuery 3.7.1 — MIT

Vendored at `vendor/jquery-3.7.1.min.js`.

```
Copyright OpenJS Foundation and other contributors, https://openjsf.org/

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Fredoka and Barlow — SIL Open Font License 1.1

Vendored at `assets/fonts/`, subset to the latin and latin-ext ranges. The
full licence text and both copyright notices sit beside the fonts themselves,
in [`assets/fonts/OFL.txt`](assets/fonts/OFL.txt), as the OFL requires.

- Copyright 2016 The Fredoka Project Authors
- Copyright 2017 The Barlow Project Authors

Neither font declares a Reserved Font Name, so the subsets keep their original
names.

## Artwork — original, and not covered by the MIT licence

`assets/logo.webp`, `assets/favicon.png` and `assets/og.png` are original
artwork by luizopiloto, drawn after a monster from ROSE Online. They are **not**
included in the MIT grant above — ask before reusing them, and swap them out if
you fork this.

The underlying character design belongs to the rights holder of ROSE Online.

## ROSE Online

This is an unofficial fan tool. It is not affiliated with, endorsed by, or
sponsored by the makers of ROSE Online; the name is used only to say what the
calculator is for.

The formulas and coefficients it implements are facts about how the game
behaves, gathered from posts players made on the official forum and recorded in
`rose.md` and `formulas-build.md` in the sibling `rose_base_calc` project. The
transcription, the optimizer and this implementation are original work and are
covered by the MIT licence.
