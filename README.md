# ROSE Online — base status optimizer (web)

A pure jQuery / HTML5 version of `../rose_base_calc`. No backend, no build
step, no package manager. Open `index.html` in a browser and it works,
including straight off the filesystem with no network — jQuery and both
typefaces are vendored locally.

Same job as the PySide6 original: given a level, a goal, a class and a
weapon, work out where a character's **base** stat points should go. Gear,
passive skills and buffs are all out of scope.

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

`js/rose-formulas.js` is a direct port of `rose_formulas.py` and keeps the
same split the original had: formulas in one file that knows nothing about
the interface, wiring in another.

## Checking the port

`js/self-check.js` is a port of the `if __name__ == "__main__"` block at the
bottom of `rose_formulas.py`, plus a sweep asserting the optimizer never
overspends:

```
node js/self-check.js
```

The port was also checked directly against the Python: both implementations
were run over the full cross-product of 12 objectives × 10 weapons ×
11 levels × 4 stat caps (5,280 builds), comparing the stat spread, SP spent,
SP left over, which stats hit the cap, and every derived stat. All 5,280
agree exactly.

## What changed from the PySide6 version

**Dropped: "Weapon attack" and "Ammo quality".** Those two inputs existed in
the original only as permanently disabled widgets, kept so the form still
looked complete in the Visual Python designer. There is no designer here, so
carrying over two dead controls would have been porting the workaround
rather than the feature. The reason they were dead is on the page instead:
the confirmed Attack Power formula for this server is flat per stat point
and does not scale with a weapon's own attack rating.

**Added: how sure each number is.** The original printed everything into one
monospace text box, with the caveats as trailing prose. Here, a figure that
has never been confirmed on the live server carries a dotted gold underline
and explains itself on hover — Max HP, Max MP and DoT damage. Everything
without that mark comes from measurements players posted on the official
forum. Nothing about the arithmetic changed; it is the same caveats the
original text carried, moved next to the numbers they apply to.

**Added: a level slider, and a hexagon.** The six stats are drawn against
the stat cap and re-shape as inputs change. Optimal builds turn out to be
spikes rather than balanced hexagons, which is the point.

The allocation bars deliberately show the **share of the budget** each stat
consumed rather than the stat's size. Raising a stat by one point costs its
current value divided by five, rounded down, so a tall stat's last points
cost many times what its first ones did — a bar showing stat size would hide
exactly the thing this calculator exists to reason about.

## Where the numbers come from

Unchanged from the original project — see `rose.md` (full research history
and sourcing) and `formulas-build.md` (the formulas on their own) in
`../rose_base_calc`. In short: Attack Power, the defences, Accuracy, Dodge,
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

## Third-party

- **jQuery 3.7.1** — MIT.
- **Fredoka** and **Barlow** — SIL Open Font License 1.1. Subset to latin and
  latin-ext and self-hosted so the page keeps its typography offline.
