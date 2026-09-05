# ROSE Online — base status optimizer (web)

Base status optimizer

Stat points get more expensive the higher a stat goes,
so the best spread is rarely the obvious one.
Pick a character and a goal, and this works out where every point should land. 

## Layout

```
index.html            the page
css/rose.css          all styling
css/fonts.css         @font-face for the vendored typefaces
js/rose-formulas.js   the formulas and the optimizer -- no DOM, no jQuery
js/app.js             control wiring and rendering
js/self-check.js      assertions, runnable under node
vendor/jquery-*.js    jQuery 3.7.1
assets/fonts/         Fredoka and Barlow, latin + latin-ext subsets
assets/logo.webp      masthead logo, resized from the original project's icon
assets/favicon.png    favicon, same source
```

## Where the numbers come from

In short: Attack Power, the defences, Accuracy, Dodge,
Critical and Critical Defence were measured on the live server by a player
and pinned by a GM; the 425 stat cap and level 250 ceiling were confirmed by
a GM; SP-per-level matches a player's reported total at level 130 exactly.
HP/MP by class, the character creation values and the progressive cost
formula come from classic/iROSE server reconstructions and are not confirmed
for the current official server. The DoT coefficients rest on your own field
testing alone.

## Published at

**https://luizopiloto.github.io/rose_calc/**

The site is plain static files with only relative links, so it runs unchanged
from `file://`, from a project-site subpath, or from a domain root. There is
no build step, so Pages serves the branch directly — no Actions workflow.

`.nojekyll` is committed: nothing here needs Jekyll, and skipping it avoids
any surprise filtering and makes deploys faster.

### First deploy

```
git remote add origin git@github.com:luizopiloto/rose_calc.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Build and deployment**, set
Source to "Deploy from a branch", branch `main`, folder `/ (root)`, Save.
The first deploy takes a minute or two. The repository has to be public
unless the account has GitHub Pro.

### If the URL ever changes

The absolute URL appears in exactly three places, all in the `<head>` of
`index.html`: the `canonical` link and the `og:url` and `og:image` meta tags.
Nothing else in the project hardcodes a location. Renaming the repository, or
moving to a `luizopiloto.github.io` user site, means editing those three and
nothing more.

`assets/og.png` is the 1200×630 link-preview card, rendered from a throwaway
HTML file in the same palette and typefaces as the page itself. Regenerate it
by hand if the title or artwork changes; it is not wired into any build.

## Licence

MIT — see [`LICENSE`](LICENSE). That covers the code, the styling and the
research notes in this repository.

Two things it does not cover, both spelled out in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md):

- **The artwork.** The mole logo, favicon and link-preview card are original
  drawings by luizopiloto, done after a ROSE Online monster. They are held back
  from the MIT grant — fork the code freely, but swap the branding.
- **The bundled library and fonts.** jQuery is MIT; Fredoka and Barlow are
  under the SIL Open Font License 1.1, whose text and copyright notices ship
  beside the fonts in [`assets/fonts/OFL.txt`](assets/fonts/OFL.txt) because
  the OFL requires them to travel with any redistributed copy.

This is an unofficial fan tool, not affiliated with or endorsed by the makers
of ROSE Online.
