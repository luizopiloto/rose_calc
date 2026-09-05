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

The optimizer core is still checked directly against the Python: both
`optimize()` implementations are swept over the ten goals the two projects
share, every weapon, five levels and four weapon-requirement settings (2,000
builds), comparing the stat spread, SP spent, SP left over, floor cost and
objective value. All 2,000 agree exactly.

The sweep runs with a cap high enough to never bind, because the two projects
now disagree about what the cap means (see below) — that keeps the intended
difference out of the comparison while still verifying everything else.

Three things have no Python counterpart and are covered by `js/self-check.js`
alone: the goal grid and its normalized combination, the Heal Power goal, and
weapon status requirements on combined goals.

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

**Changed: pick up to three goals, not one combination from a list.** The
original had a dropdown holding both base goals and hand-built combinations
("Attack Power + DoT", "Attack Power + Critical"). This has a checkbox grid of
the eleven base goals; tick up to three and they are optimized together.

Combining them is not a matter of adding coefficients. They run from 0.5 per
point (Critical Defence) to 5.5 (Heal Power), so a raw sum would just hand
every mixed build to whichever goal carries the biggest numbers. Each goal is
divided by what it could reach alone on the same budget, so all of them
contribute a fraction of their own maximum and trade off on equal terms. The
page then shows each goal against its solo maximum, which is the only honest
way to display what a combination gave up.

This drops the old "Attack Power + Critical", which protected 99% of Attack
Power and spent the slack on SEN. That answers a different question — "max AP,
crit for free" rather than "balance these two" — and ticking both boxes now
gives the balanced answer instead. `rose_formulas.py` still has the floor
version if it is wanted back.

**Added: a Heal Power goal.** 5.5 per CHA and 5.5 per INT, and the least
trustworthy number in the tool. It rests on one hedged post on the official
forum (ryle23, Aug 2023: *"i think 1 cha = 5.5 heal points,,and prolly int
gives around 5.5 heal points too.."*) which nobody answered, in the same thread
whose author said only that "Heal Power from CHA will be added later" and never
returned to it. Community lore elsewhere puts CHA at roughly three times INT
for healing, which would change the build substantially — that claim traces to
fansites and other servers, so it is recorded as an open conflict rather than
blended into a number nobody measured. The page says all this when the goal is
picked.

**Fixed: what the 425 cap limits.** It caps the points you *put into* a stat,
not the value the stat shows — so a stat tops out at its creation value plus
425. STR, DEX, INT and CON reach 440; CHA and SEN start at 10 and reach 435.
The ceiling is therefore per-stat, not a single shared number, and the hexagon
draws each axis against its own.

The forum wording this was originally built from — "425 is the max for a stat
but that's only from adding stat points" — reads either way, and the earlier
reading was wrong. It was settled from the live game, the same basis on which
the measured Attack Power coefficients displaced the classic server's.
`rose_formulas.py` still caps the value, so **the two projects now disagree
here**; the Python needs the same correction if you want them aligned.

**Added: weapon status requirements.** A weapon you cannot equip is worth
nothing, so the status it demands is bought before anything is optimized. The
optimizer always had the machinery for this — mandatory floors, ported from the
Python — it just had no control wired to it.

Which stat a weapon asks for is fixed by the weapon and built into the weapon
table: STR for Launcher, melee and Crossbow; DEX for Katar, Dual Wield and Bow;
INT for Staff and Wand; CON for Gun. That mapping is the user's, reported from
the live game, and carries the same standing as the DoT coefficients — no
written source. *How much* it asks for rises with the weapon's grade, so the
amount stays an input: a level 250 Artisan's Launcher needs 158 STR. No
confirmed table of amounts exists, and inventing one would be the kind of
unsourced guess the rest of this project is careful to avoid.

The page then says which of three things happened: the requirement cost nothing
because the goal wanted that stat anyway, or it diverted a stated number of
points away from the goal, or the budget could not reach it at all and the build
cannot hold the weapon. Working out which takes a second solve without the
requirement, for comparison.

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
