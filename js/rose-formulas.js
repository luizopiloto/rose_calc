/* ROSE Online base-status formulas and SP optimizer.
 *
 * A faithful port of rose_formulas.py from the ../rose_base_calc project.
 * Pure logic, no DOM, no jQuery -- runs in a browser or under node (see
 * js/self-check.js, which is the Python module's own __main__ assertions).
 *
 * Targets the CURRENT official server (roseonlinegame.com), not a
 * classic/iROSE reconstruction -- that distinction is the whole reason the
 * numbers below look the way they do. Scope: BASE status only; equipment
 * bonuses, passive skills and buffs are deliberately ignored.
 *
 * SOURCES, in order of trust for THIS server:
 *
 *   1. forum.roseonlinegame.com topic 3354 ("Stat Values - Job Classes",
 *      Vile, Jan 2023, pinned by a GM). Measured directly on the live
 *      server by resetting stats and recording results. Gives the flat
 *      per-point coefficients for Attack Power, Physical/Magic Defence,
 *      Accuracy, Dodge, Critical and Critical Defence. Explicitly says HP
 *      is class-dependent and NOT covered.
 *   2. topic 979: stat cap 425, max level 250, confirmed by a GM and a
 *      Grandmaster player.
 *   3. topic 2434: a player reports 8050 total stat points at level 130 --
 *      matches totalStatPoints(130) exactly, which is what keeps the
 *      SP-per-level and progressive-cost formulas in play.
 *   4. rose-offline / osirose (classic server reconstructions). Used ONLY
 *      where (1)-(3) are silent: SP-per-level, the floor(S/5) cost, and
 *      HP/MP-by-class -- the last of which is a placeholder, not a
 *      confirmed value.
 *
 * See ../rose_base_calc/rose.md for the full sourcing and correction
 * history, and formulas-build.md for the formulas on their own.
 */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RoseFormulas = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATS = ['STR', 'DEX', 'INT', 'CON', 'CHA', 'SEN'];

  // Character creation values. No live-server confirmation found; kept from
  // osirose's schema default as the best estimate available.
  var BASE_STATS = { STR: 15, DEX: 15, INT: 15, CON: 15, CHA: 10, SEN: 10 };

  // topic 979, HoneyBuns (GM) + Avatar (Grandmaster), Dec 2022: "425 is max
  // stat." Supersedes rose-offline's 300 and osirose's 254, which are
  // classic/iROSE config values, not this server's.
  //
  // 425 caps the points you PUT IN, not the value the stat shows. So a stat
  // tops out at its creation value plus 425 -- 440 for STR/DEX/INT/CON, 435
  // for CHA/SEN -- and the ceiling differs per stat. The forum wording ("425
  // is the max for a stat but that's only from adding stat points") reads
  // either way; the user resolved it from the live game, which is the same
  // basis on which the Attack Power coefficients beat the classic server's.
  // NOTE: rose_formulas.py still caps the value, so this is a deliberate
  // divergence from the Python, not a porting slip. See README.
  var DEFAULT_STAT_CAP = 425;

  // Same thread: "Max level is 250."
  var MAX_LEVEL = 250;

  /* The highest `stat` can reach on base points alone. Measured from the
   * character-creation value, because that is what the game counts as points
   * put in -- not from whatever starting point a caller passes to optimize. */
  function statCeiling(stat, cap) {
    return BASE_STATS[stat] + (cap === undefined ? DEFAULT_STAT_CAP : cap);
  }

  // --------------------------------------------------------------------
  // Stat point cost and budget
  // --------------------------------------------------------------------

  /* SP cost to raise a stat from `value` to `value + 1`. */
  function statCost(value) {
    return Math.floor(value / 5);
  }

  /* Total SP spent getting a stat from 0 to `value` (closed form). */
  function cumulativeCost(value) {
    var q = Math.floor(value / 5);
    var r = value % 5;
    return 5 * q * (q - 1) / 2 + r * q;
  }

  /* Total SP to raise a stat from `start` to `end`. */
  function costBetween(start, end) {
    return cumulativeCost(end) - cumulativeCost(start);
  }

  /* SP awarded on reaching `level` (the level just reached). */
  function levelupStatPoints(level) {
    return Math.trunc(level * 0.8) + 10;
  }

  /* Total SP a character has earned by `level`, spent or not. Level 1
   * grants nothing. totalStatPoints(130) === 8050 matches a live player's
   * reported total exactly (topic 2434) -- the one piece of this module
   * confirmed on the actual current server. */
  function totalStatPoints(level) {
    var total = 0;
    for (var lv = 2; lv <= level; lv++) total += levelupStatPoints(lv);
    return total;
  }

  // --------------------------------------------------------------------
  // Jobs (HP/MP depend on class; nothing else does)
  // --------------------------------------------------------------------
  //
  // UNCONFIRMED on this server. The forum post that verified Attack Power,
  // Defence, Accuracy, Dodge and Critical against the live server says HP
  // was NOT covered. These are the classic/iROSE numbers, kept only because
  // nothing better exists; given that the other classic combat formulas
  // turned out not to match this server, treat them as a rough placeholder.
  //
  // MaxHP = 2*STR + hpPerLevel*Level + hpConst
  // MaxMP = 4*INT + trunc((Level + mpLevelAdd) * mpMultiplier)

  function job(jobId, name, hpPerLevel, hpConst, mpLevelAdd, mpMultiplier) {
    return {
      jobId: jobId, name: name, hpPerLevel: hpPerLevel, hpConst: hpConst,
      mpLevelAdd: mpLevelAdd, mpMultiplier: mpMultiplier
    };
  }

  var JOBS = [
    job(0, 'Visitor', 8, 96, 4.0, 3.0),
    job(111, 'Soldier', 12, 84, 3.0, 4.0),
    job(121, 'Knight', 14, -42, 0.0, 4.5),
    job(122, 'Champion', 13, 26, -6.0, 5.0),
    job(211, 'Muse', 10, 110, 0.0, 6.0),
    job(221, 'Mage', 10, 110, -7.0, 7.0),
    job(222, 'Cleric', 11, 55, -4.0, 6.5),
    job(311, 'Hawker', 11, 110, 4.0, 4.0),
    job(321, 'Raider', 13, 26, 4.0, 4.0),
    job(322, 'Scout', 11, 121, 0.0, 4.5),
    job(411, 'Dealer', 10, 120, 3.0, 4.0),
    job(421, 'Bourgeois', 10, 130, 3.0, 4.0),
    job(422, 'Artisan', 11, 66, 0.0, 4.5)
  ];

  var JOBS_BY_NAME = {};
  JOBS.forEach(function (j) { JOBS_BY_NAME[j.name] = j; });

  function maxHp(jobRecord, level, strength) {
    return 2 * strength + jobRecord.hpPerLevel * level + jobRecord.hpConst;
  }

  function maxMp(jobRecord, level, intelligence) {
    return 4 * intelligence +
      Math.trunc((level + jobRecord.mpLevelAdd) * jobRecord.mpMultiplier);
  }

  // --------------------------------------------------------------------
  // Weapons and Attack Power
  // --------------------------------------------------------------------

  // `requires` is the stat a weapon's equip requirement sits on. Reported by
  // the user from the live game, not found in a written source -- the same
  // standing as the DoT coefficients below. Only the stat is fixed: how much
  // of it a given weapon needs rises with the weapon, so the amount is an
  // input rather than a table (a level 250 Artisan's Launcher needs 158 STR).
  var WEAPONS = [
    { name: 'Unarmed', kind: 'none', requires: null },
    { name: '1H Sword/Blunt, Great Sword, Spear, Axe', kind: 'melee', requires: 'STR' },
    { name: 'Katar', kind: 'katar', requires: 'DEX' },
    { name: 'Dual Wield', kind: 'dualwield', requires: 'DEX' },
    { name: 'Bow', kind: 'bow', requires: 'DEX' },
    { name: 'Crossbow (Bowgun)', kind: 'crossbow', requires: 'STR' },
    { name: 'Staff', kind: 'staff', requires: 'INT' },
    { name: 'Wand', kind: 'wand', requires: 'INT' },
    { name: 'Gun', kind: 'gun', requires: 'CON' },
    { name: 'Launcher', kind: 'launcher', requires: 'STR' }
  ];

  var WEAPONS_BY_NAME = {};
  WEAPONS.forEach(function (w) { WEAPONS_BY_NAME[w.name] = w; });

  // topic 3354, Vile, Jan 2023: "before Passives and Gear. Base values
  // only" -- exactly this module's scope. Flat AP per stat point; unlike
  // the classic/iROSE formula there is no weapon-attack-value term, so a
  // weapon's own attack rating does not change these coefficients.
  var AP_COEFFICIENTS = {
    melee: { STR: 0.65, DEX: 0.25, SEN: 0.10 },
    katar: { DEX: 0.60, STR: 0.30, SEN: 0.10 },
    dualwield: { DEX: 0.55, STR: 0.35, SEN: 0.10 },
    bow: { DEX: 0.60, CON: 0.30, SEN: 0.10 },
    // Disputed: Vile's original below; Ronron (Jul 2024) says STR 0.50 /
    // DEX 0.40 instead (the two swapped). Unresolved on the forum. Kept
    // Vile's since it stood unchallenged for 18+ months.
    crossbow: { DEX: 0.50, STR: 0.40, SEN: 0.10 },
    staff: { INT: 0.60, STR: 0.30, SEN: 0.10 },
    wand: { INT: 0.55, DEX: 0.35, SEN: 0.10 },
    gun: { CON: 0.50, DEX: 0.40, SEN: 0.10 },
    launcher: { CON: 0.55, STR: 0.35, SEN: 0.10 },
    // Unarmed is not in the forum table; no confirmed coefficients.
    none: {}
  };

  var CROSSBOW_DISPUTE_NOTE =
    'Crossbow (Bowgun) coefficients are disputed: Vile’s original post ' +
    'gives DEX 0.50 / STR 0.40, which is what this calculator uses. A later ' +
    'reply (Ronron, Jul 2024) says STR 0.50 / DEX 0.40 instead. Nobody ' +
    'settled it in the thread.';

  /* Marginal Attack Power per stat point for this weapon type. */
  function attackPowerCoefficients(weapon) {
    var source = AP_COEFFICIENTS[weapon.kind] || {};
    var copy = {};
    for (var stat in source) {
      if (Object.prototype.hasOwnProperty.call(source, stat)) copy[stat] = source[stat];
    }
    return copy;
  }

  // --------------------------------------------------------------------
  // Derived stats (base only: no armour, no passives)
  // --------------------------------------------------------------------
  //
  // All flat per-point coefficients, topic 3354 (Vile, Jan 2023):
  // "1 STR = 1.5 Phys.DEF", "1 INT = 1.5 Mag.DEF", "1 DEX = 1.5 Dodge",
  // "1 CON = 1 ACCU", "1 SEN = 1 Critical Rating", "1 CHA = 0.5 Critical
  // Defense Rating". No level or weapon term, unlike the classic code.

  function attackPower(stats, weapon) {
    var coefficients = attackPowerCoefficients(weapon);
    var total = 0;
    for (var i = 0; i < STATS.length; i++) {
      total += (coefficients[STATS[i]] || 0) * stats[STATS[i]];
    }
    return Math.trunc(total);
  }

  /* Physical Defence: 1.5 per point of STR. */
  function defence(stats) { return Math.trunc(stats.STR * 1.5); }

  /* Magic Defence: 1.5 per point of INT. */
  function resistance(stats) { return Math.trunc(stats.INT * 1.5); }

  /* Accuracy: 1 per point of CON. */
  function hit(stats) { return Math.trunc(stats.CON); }

  /* Dodge: 1.5 per point of DEX. */
  function avoid(stats) { return Math.trunc(stats.DEX * 1.5); }

  /* Critical Rating: 1 per point of SEN. */
  function critical(stats) { return Math.trunc(stats.SEN); }

  /* Critical Defense Rating: 0.5 per point of CHA. */
  function criticalDefense(stats) { return stats.CHA * 0.5; }

  // Critical Rating is not the chance to land a critical hit -- that
  // conversion is level-dependent and hard-capped.
  //
  // topic 7598 ("[Guide] Criticals", Lekoi, last edited Feb 2026):
  //   CritChance% = (CritRating - EnemyCritDefense) / ((Level / 10) + 1.9)
  //
  // topic 6095 (Phish_, Jun 2024): "The maximum amount of crit rate you can
  // achieve is 50%, but your total crit can exceed that", and "if your
  // character has 1345 critical it would equate to 50% crit rate".
  // 1345 / ((250/10) + 1.9) = 50.0 exactly -- an independent confirmation
  // of Lekoi's divisor at level 250.
  var CRIT_CHANCE_CAP_PERCENT = 50.0;

  function criticalChanceDivisor(level) {
    return (level / 10) + 1.9;
  }

  /* Critical Rating at which chance vs an undefended target hits 50%.
   * ((level/10)+1.9) * 50 simplifies to 5*level + 95 exactly. */
  function criticalRatingForChanceCap(level) {
    return 5 * level + 95;
  }

  /* Chance to land a critical hit, as a percentage, capped at 50%.
   * Defaults to an undefended target -- this calculator models neither gear
   * nor an opponent. */
  function criticalChance(stats, level, enemyCriticalDefense) {
    var enemy = enemyCriticalDefense || 0;
    var raw = (critical(stats) - enemy) / criticalChanceDivisor(level);
    return Math.max(0, Math.min(raw, CRIT_CHANCE_CAP_PERCENT));
  }

  /* UNVERIFIED, from live server testing: a point of CHA and a point of
   * Attack Power are each worth one point of damage-over-time.
   *
   * How that was settled is worth keeping, because the first version of it
   * was wrong. The measurement was "about 0.6 DoT per CON", taken on an
   * Artisan with a Launcher, and CON was written down as the cause. It isn't:
   * a Launcher turns 1 CON into 0.55 Attack Power, and 0.55 is what that
   * "about 0.6" actually was. So the CON term was Attack Power all along, at
   * one for one -- which is why the coefficient below is 1.0 and not 0.6.
   *
   * The consequence is that this goal now depends on the weapon. CON reaches
   * DoT only through a Gun's or Launcher's Attack Power; on a Staff it is INT
   * that feeds it, and Unarmed leaves the CHA term alone.
   *
   * topic 3354 confirms only that CHA affects Critical Defense, and a thread
   * asking about CHA/DoT scaling got no numeric answer, so none of this has
   * written confirmation. Uses the same truncated Attack Power the page
   * shows, so the figure can be checked by hand against the one above it. */
  function dotDamage(stats, weapon) {
    return stats.CHA * 1.0 + attackPower(stats, weapon);
  }

  /* Marginal DoT per stat point: the CHA term plus the weapon's own Attack
   * Power coefficients, one for one. Linear in the stats, as Attack Power is. */
  function dotCoefficients(weapon) {
    var coefficients = {};
    var ap = attackPowerCoefficients(weapon);
    STATS.forEach(function (stat) {
      var value = ap[stat] || 0;
      if (stat === 'CHA') value += 1.0;
      if (value > 0) coefficients[stat] = value;
    });
    return coefficients;
  }

  /* UNVERIFIED, and the weakest number in this module. 5.5 per CHA and 5.5
   * per INT, from a single hedged post on topic 3354 (ryle23, 13 Aug 2023):
   * "i think 1 cha = 5.5 heal points,,and prolly int gives around 5.5 heal
   * points too..". Nobody replied, and the thread's own author -- who
   * measured everything else here on the live server -- said only that "Heal
   * Power from CHA will be added later" and never came back to it.
   *
   * Community lore elsewhere claims CHA is worth about three times INT for
   * healing, which contradicts the equal weighting above. That claim traces
   * to fansites and old Steam threads about other servers, so it is recorded
   * as an open conflict rather than blended into a number nobody measured. */
  function healPower(stats) {
    return stats.CHA * 5.5 + stats.INT * 5.5;
  }

  var HEAL_POWER_NOTE =
    'Heal Power rests on one hedged forum post — “i think 1 cha = 5.5 heal ' +
    'points,,and prolly int gives around 5.5 heal points too..” (ryle23, Aug ' +
    '2023). No one replied and no one confirmed it. Community lore elsewhere ' +
    'says CHA is worth roughly three times INT for healing, which would ' +
    'change this build a lot; that claim comes from other servers, so it is ' +
    'not used here. Treat this goal as the least trustworthy of the lot.';

  // --------------------------------------------------------------------
  // Goals
  // --------------------------------------------------------------------
  //
  // These are the atomic things a build can chase. Combinations are made by
  // picking several (see solveGoals), not by listing every pairing here.

  var MAX_GOALS = 3;

  // `weight` is how hard a goal pulls when it is combined with others, on top
  // of the normalization in solveGoals. Equal weights split a build evenly,
  // which costs the thing you actually came for: Attack Power, DoT, Accuracy
  // and Critical together at 1.0 each drop Attack Power to about 74% of what
  // it could reach alone. The user's ordering for those four is
  // AP > DoT > Accuracy > Critical > everything else, and these defaults
  // encode it. Only ratios matter, so a selection made entirely of 0.2 goals
  // still splits evenly between them; the low value only bites when one of
  // them is picked alongside a goal the ordering ranks higher. Every weight
  // is adjustable per build in the UI -- these are the user's priorities, not
  // measurements, and nothing about them comes from the game.

  var OBJECTIVES = [
    {
      name: 'Attack Power', weight: 1.0,
      note: 'Flat per weapon type; measured on the live server.',
      needsWeapon: true, confidence: 'measured'
    },
    { name: 'Critical', weight: 0.35, note: '1.0 per SEN.', needsWeapon: false, confidence: 'measured' },
    { name: 'Accuracy', weight: 0.5, note: '1.0 per CON.', needsWeapon: false, confidence: 'measured' },
    {
      name: 'DoT Damage', weight: 0.7,
      note: 'A point of CHA and a point of Attack Power each give one. The weapon ' +
        'therefore matters. Field-tested only.',
      needsWeapon: true, confidence: 'unverified'
    },
    { weight: 0.2, name: 'Physical Defence', note: '1.5 per STR.', needsWeapon: false, confidence: 'measured' },
    { weight: 0.2, name: 'Magic Defence', note: '1.5 per INT.', needsWeapon: false, confidence: 'measured' },
    { weight: 0.2, name: 'Dodge', note: '1.5 per DEX.', needsWeapon: false, confidence: 'measured' },
    { weight: 0.2, name: 'Critical Defence', note: '0.5 per CHA.', needsWeapon: false, confidence: 'measured' },
    {
      weight: 0.2, name: 'Max HP', note: '2 per STR, plus a class term this calculator can’t confirm.',
      needsWeapon: false, confidence: 'inherited'
    },
    {
      weight: 0.2, name: 'Max MP', note: '4 per INT, plus a class term this calculator can’t confirm.',
      needsWeapon: false, confidence: 'inherited'
    },
    {
      weight: 0.2, name: 'Heal Power', note: '5.5 per CHA and per INT. One hedged forum post, unconfirmed.',
      needsWeapon: false, confidence: 'unverified'
    }
  ];

  var OBJECTIVES_BY_NAME = {};
  OBJECTIVES.forEach(function (o) { OBJECTIVES_BY_NAME[o.name] = o; });

  // 'Attack Power' and 'DoT Damage' are weapon-dependent and handled in
  // objectiveCoefficients() rather than listed here.
  var FLAT_OBJECTIVE_COEFFICIENTS = {
    'Heal Power': { CHA: 5.5, INT: 5.5 },
    'Max HP': { STR: 2.0 },
    'Max MP': { INT: 4.0 },
    'Physical Defence': { STR: 1.5 },
    'Magic Defence': { INT: 1.5 },
    'Accuracy': { CON: 1.0 },
    'Dodge': { DEX: 1.5 },
    'Critical': { SEN: 1.0 },
    'Critical Defence': { CHA: 0.5 }
  };

  /* Marginal value of one point in each stat, for one goal on its own. */
  function objectiveCoefficients(objectiveName, weapon) {
    if (objectiveName === 'Attack Power') {
      return attackPowerCoefficients(weapon);
    }
    if (objectiveName === 'DoT Damage') {
      return dotCoefficients(weapon);
    }
    var flat = FLAT_OBJECTIVE_COEFFICIENTS[objectiveName];
    var copy = {};
    for (var stat in flat) {
      if (Object.prototype.hasOwnProperty.call(flat, stat)) copy[stat] = flat[stat];
    }
    return copy;
  }

  /* Per-stat value tapers for optimize(), if this goal needs any. Only
   * "Critical" does: past the level-scaled Critical Rating that caps
   * chance-to-crit at 50%, further SEN keeps raising Critical Rating but
   * stops raising that chance, so it is worth nothing more to this goal.
   * solveGoals() folds that into the combined taper when Critical is one of
   * several picked, since SEN can still be paying for the others. */
  function objectiveTapers(objectiveName, weapon, level) {
    if (objectiveName !== 'Critical') return {};
    return { SEN: { threshold: criticalRatingForChanceCap(level), after: 0.0 } };
  }

  // --------------------------------------------------------------------
  // Optimizer
  // --------------------------------------------------------------------

  /* Score a stat spread against a linear objective. */
  function linearValue(coefficients, stats) {
    var total = 0;
    for (var i = 0; i < STATS.length; i++) {
      total += (coefficients[STATS[i]] || 0) * stats[STATS[i]];
    }
    return total;
  }

  /* Pop the best pending purchase. Mirrors Python's heapq on tuples of
   * (-value/cost, stat): smallest key wins, ties broken by stat name
   * ascending, and a cost of 0 sorts first via -Infinity. */
  function popBest(pending) {
    var bestIndex = 0;
    for (var i = 1; i < pending.length; i++) {
      var a = pending[i], b = pending[bestIndex];
      if (a.key < b.key || (a.key === b.key && a.stat < b.stat)) bestIndex = i;
    }
    return pending.splice(bestIndex, 1)[0];
  }

  function ratioKey(value, cost) {
    return cost ? -value / cost : -Infinity;
  }

  /* Spend `budget` SP to maximise a linear (or tapered-linear) objective.
   *
   * Greedy on value-per-SP. Because cost(S) = floor(S/5) is non-decreasing,
   * and a tapered value only ever drops as a stat grows, value/cost for a
   * given stat is non-increasing purchase over purchase -- so a stat that
   * is unaffordable, or has dropped in value, stays that way, and dropping
   * it from consideration is safe.
   *
   * Optimal for the continuous relaxation; for the integer problem it can
   * trail a true optimum by at most a fraction of one stat point, far below
   * the confidence of the coefficients themselves.
   *
   * options: { base, cap, floors, tapers }
   */
  function optimize(coefficients, budget, options) {
    options = options || {};
    var cap = options.cap === undefined ? DEFAULT_STAT_CAP : options.cap;
    var tapers = options.tapers || {};
    var floors = options.floors || null;

    var source = options.base || BASE_STATS;
    var stats = {};
    STATS.forEach(function (stat) { stats[stat] = source[stat]; });

    var ceilings = {};
    STATS.forEach(function (stat) { ceilings[stat] = statCeiling(stat, cap); });

    var result = {
      stats: stats, budget: budget, spent: 0, leftover: 0,
      floorsCost: 0, value: 0, capped: [], goalScores: null
    };
    var remaining = budget;

    function marginalValue(stat) {
      var taper = tapers[stat];
      if (taper && stats[stat] >= taper.threshold) return taper.after;
      return coefficients[stat] || 0;
    }

    // Mandatory floors first, cheapest-stat-first so a floor that cannot be
    // afforded fails late rather than starving the others.
    if (floors) {
      Object.keys(floors)
        .sort(function (a, b) { return floors[a] - floors[b]; })
        .forEach(function (stat) {
          var target = Math.min(floors[stat], ceilings[stat]);
          while (stats[stat] < target) {
            var cost = statCost(stats[stat]);
            if (cost > remaining) break;
            stats[stat] += 1;
            remaining -= cost;
            result.floorsCost += cost;
          }
        });
    }

    var pending = [];
    STATS.forEach(function (stat) {
      var coefficient = coefficients[stat] || 0;
      if (coefficient > 0 && stats[stat] < ceilings[stat]) {
        pending.push({ key: ratioKey(marginalValue(stat), statCost(stats[stat])), stat: stat });
      }
    });

    while (pending.length && remaining >= 0) {
      var stat = popBest(pending).stat;
      var cost = statCost(stats[stat]);
      if (cost > remaining) continue;   // and never affordable again
      stats[stat] += 1;
      remaining -= cost;
      if (stats[stat] >= ceilings[stat]) {
        result.capped.push(stat);
        continue;
      }
      var newValue = marginalValue(stat);
      if (newValue <= 0) continue;      // tapered off; not worth buying now
      pending.push({ key: ratioKey(newValue, statCost(stats[stat])), stat: stat });
    }

    result.spent = budget - remaining;
    result.leftover = remaining;
    result.value = linearValue(coefficients, stats);
    return result;
  }

  /* Optimize for several goals at once.
   *
   * Goal coefficients are not comparable as they stand -- Max MP is 4.0 per
   * INT, Critical Defence 0.5 per CHA, Heal Power 5.5 per CHA -- so adding
   * them raw would let whichever goal happens to carry the biggest numbers
   * swamp the rest, and the "best" build would just be whichever goal had
   * the largest coefficients. Each goal is instead divided by what it could
   * reach alone on the same budget, so every goal contributes a fraction of
   * its own maximum and they trade off on equal terms.
   *
   * On top of that each goal carries a weight (see OBJECTIVES), because
   * equal footing is not what a player wants: a build that chases four things
   * evenly is worse at all four than one that knows which it came for. The
   * weight multiplies the normalized contribution, so only ratios matter.
   *
   * The build comes back with, per goal, how much of its solo maximum it
   * actually reached. That is the only honest way to show what picking more
   * than one goal gave up, and the UI leans on it.
   *
   * This supersedes the fixed "Attack Power + Critical" objective, which
   * protected 99% of Attack Power and spent the slack on SEN. That is a
   * different question -- "max AP, crit for free" rather than "balance
   * these" -- and rose_formulas.py still answers it.
   */
  function solveGoals(params) {
    var weapon = params.weapon;
    var level = params.level;
    var budget = params.budget;
    var cap = params.cap === undefined ? DEFAULT_STAT_CAP : params.cap;
    var floors = params.floors || null;
    var names = params.goalNames || [];
    var weights = params.weights || {};

    var goals = [];
    names.forEach(function (name) {
      var coefficients = objectiveCoefficients(name, weapon);
      var tapers = objectiveTapers(name, weapon, level);
      var solo = optimize(coefficients, budget, { cap: cap, tapers: tapers, floors: floors });
      var weight = weights[name];
      if (typeof weight !== 'number' || !(weight >= 0)) {
        weight = OBJECTIVES_BY_NAME[name] ? OBJECTIVES_BY_NAME[name].weight : 1;
      }
      goals.push({
        name: name,
        coefficients: coefficients,
        tapers: tapers,
        weight: weight,
        max: linearValue(coefficients, solo.stats)
      });
    });

    var combined = {};
    var senValuePastCritCap = 0;
    var wantsCritTaper = false;

    goals.forEach(function (goal) {
      if (!(goal.max > 0) || !(goal.weight > 0)) return;   // see Unarmed
      var scale = goal.weight / goal.max;
      STATS.forEach(function (stat) {
        var coefficient = goal.coefficients[stat] || 0;
        if (coefficient > 0) combined[stat] = (combined[stat] || 0) + coefficient * scale;
      });
      // Past the Critical chance cap SEN stops paying for the Critical goal,
      // but keeps paying for any other selected goal that wanted it.
      if (goal.tapers.SEN) wantsCritTaper = true;
      else senValuePastCritCap += (goal.coefficients.SEN || 0) * scale;
    });

    var tapers = {};
    if (wantsCritTaper) {
      tapers.SEN = {
        threshold: criticalRatingForChanceCap(level),
        after: senValuePastCritCap
      };
    }

    var build = optimize(combined, budget, { cap: cap, tapers: tapers, floors: floors });

    build.goalScores = goals.map(function (goal) {
      var achieved = linearValue(goal.coefficients, build.stats);
      return {
        name: goal.name,
        achieved: achieved,
        max: goal.max,
        weight: goal.weight,
        fraction: goal.max > 0 ? achieved / goal.max : null
      };
    });

    return { build: build, coefficients: combined, goals: goals };
  }

  return {
    STATS: STATS,
    BASE_STATS: BASE_STATS,
    DEFAULT_STAT_CAP: DEFAULT_STAT_CAP,
    MAX_LEVEL: MAX_LEVEL,
    CRIT_CHANCE_CAP_PERCENT: CRIT_CHANCE_CAP_PERCENT,
    CROSSBOW_DISPUTE_NOTE: CROSSBOW_DISPUTE_NOTE,
    HEAL_POWER_NOTE: HEAL_POWER_NOTE,
    MAX_GOALS: MAX_GOALS,
    JOBS: JOBS,
    JOBS_BY_NAME: JOBS_BY_NAME,
    WEAPONS: WEAPONS,
    WEAPONS_BY_NAME: WEAPONS_BY_NAME,
    AP_COEFFICIENTS: AP_COEFFICIENTS,
    OBJECTIVES: OBJECTIVES,
    OBJECTIVES_BY_NAME: OBJECTIVES_BY_NAME,
    statCeiling: statCeiling,
    statCost: statCost,
    cumulativeCost: cumulativeCost,
    costBetween: costBetween,
    levelupStatPoints: levelupStatPoints,
    totalStatPoints: totalStatPoints,
    maxHp: maxHp,
    maxMp: maxMp,
    attackPowerCoefficients: attackPowerCoefficients,
    attackPower: attackPower,
    defence: defence,
    resistance: resistance,
    hit: hit,
    avoid: avoid,
    critical: critical,
    criticalDefense: criticalDefense,
    criticalChanceDivisor: criticalChanceDivisor,
    criticalRatingForChanceCap: criticalRatingForChanceCap,
    criticalChance: criticalChance,
    dotDamage: dotDamage,
    dotCoefficients: dotCoefficients,
    healPower: healPower,
    objectiveCoefficients: objectiveCoefficients,
    objectiveTapers: objectiveTapers,
    linearValue: linearValue,
    optimize: optimize,
    solveGoals: solveGoals
  };
}));
