# ROSE Online — base status optimizer

**https://luizopiloto.github.io/rose_calc/**

Stat points get more expensive the higher a stat goes, so the best spread is
rarely the obvious one. Pick a character and a goal, and this works out where
every point should land.

Base status only — no gear, no passives, no buffs.

## What it does

- **Up to three goals at once.** Tick them in the grid. Their coefficients run
  from 0.5 to 5.5 per point, so they are combined by how close each gets to
  what it could reach *alone* on the same budget, not by adding raw numbers.
- **Weights**, because chasing everything evenly makes a build worse at all of
  it. Defaults run Attack Power > DoT > Accuracy > Critical > the rest, and
  every one is editable per build.
- **Weapon status requirements.** A weapon you cannot equip is worth nothing,
  so the stat it demands is bought first. The page says whether that cost you
  anything, and warns when the budget cannot reach it.
- **Confidence is visible.** Figures never confirmed on the live server carry a
  dotted underline and explain themselves on hover.

## Running it

Open `index.html`. No build step, no backend, no package manager — jQuery and
both typefaces are vendored, so it works offline straight off the filesystem.

```
node js/self-check.js     # ~11,000 assertions on the formulas and optimizer
```

## Layout

```
index.html            the page
css/rose.css          all styling
css/fonts.css         @font-face for the vendored typefaces
js/rose-formulas.js   formulas and optimizer — no DOM, no jQuery
js/app.js             control wiring and rendering
js/self-check.js      assertions, runnable under node
vendor/jquery-*.js    jQuery 3.7.1
assets/fonts/         Fredoka and Barlow, latin + latin-ext subsets
assets/logo.webp      masthead logo
assets/favicon.png    favicon
assets/og.png         1200×630 link-preview card
```

## Where the numbers come from

Not all of them are equally trustworthy, and the page says which is which.

**Measured on the live server** (official forum, player-measured, GM-pinned):
Attack Power per weapon type, Physical and Magic Defence, Accuracy, Dodge,
Critical and Critical Defence. Also the 425 cap and the level 250 ceiling,
confirmed by a GM, and SP-per-level, which matches a player's reported total at
level 130 exactly.

**Field-tested, never written down:** DoT damage — a point of CHA and a point of
Attack Power each give one. Weapon requirements sit on STR for Launcher, melee
and Crossbow; DEX for Katar, Dual Wield and Bow; INT for Staff and Wand; CON
for Gun.

**Barely sourced at all:** Heal Power, 5.5 per CHA and per INT, from one hedged
forum post nobody answered. Community lore elsewhere claims CHA is worth about
three times INT, which would change the build a lot — that comes from other
servers, so it is left as an open conflict rather than blended in.

**Not confirmed for this server:** HP and MP by class, and the character
creation values, which come from older server reconstructions.

The goal weights are priorities, not measurements. Nothing about them comes
from the game.

## Deployment

Static files served straight from `main` — no Actions workflow. `.nojekyll` is
committed because nothing here needs Jekyll.

The site's address appears in exactly three places, all in the `<head>` of
`index.html`: the `canonical` link and the `og:url` and `og:image` tags. Every
other path is relative, so moving the site — a rename, a user site, a custom
domain — means editing those three and nothing else.

`assets/og.png` is rendered by hand from a throwaway HTML file in the page's own
palette and typefaces. Regenerate it if the title or artwork changes.

## Licence

MIT — see [`LICENSE`](LICENSE). Two things it does not cover, both detailed in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md):

- **The artwork.** The mole logo, favicon and preview card are original drawings
  after a ROSE Online monster, held back from the MIT grant. Fork the code
  freely, but swap the branding.
- **The bundled library and fonts.** jQuery is MIT; Fredoka and Barlow are under
  the SIL Open Font License 1.1, whose text ships beside the fonts in
  [`assets/fonts/OFL.txt`](assets/fonts/OFL.txt) because the OFL requires it to
  travel with any redistributed copy.

An unofficial fan tool, not affiliated with or endorsed by the makers of ROSE
Online.
