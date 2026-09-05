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
  var DEFAULT_STAT_CAP = 425;

  // Same thread: "Max level is 250."
  var MAX_LEVEL = 250;

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

  var WEAPONS = [
    { name: 'Unarmed', kind: 'none' },
    { name: '1H Sword/Blunt, Great Sword, Spear, Axe', kind: 'melee' },
    { name: 'Katar', kind: 'katar' },
    { name: 'Dual Wield', kind: 'dualwield' },
    { name: 'Bow', kind: 'bow' },
    { name: 'Crossbow (Bowgun)', kind: 'crossbow' },
    { name: 'Staff', kind: 'staff' },
    { name: 'Wand', kind: 'wand' },
    { name: 'Gun', kind: 'gun' },
    { name: 'Launcher', kind: 'launcher' }
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

  // How close "Attack Power + Critical" must stay to the pure-AP maximum
  // achievable with the same budget. Not sourced -- a design choice for
  // this calculator, checked so it isn't a no-op: at 99%, across every
  // weapon and level tried, Critical Chance rises 30-90% relative to a
  // pure-AP build while giving up under 1% of Attack Power.
  var AP_CRITICAL_MIN_AP_FRACTION = 0.99;

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

  /* UNVERIFIED. 1.0 * CHA + 0.6 * CON, from the user's own field testing.
   * topic 3354 confirms only that CHA affects Critical Defense; a separate
   * thread asking about CHA/DoT scaling got no numeric answer. */
  function dotDamage(stats) {
    return stats.CHA * 1.0 + stats.CON * 0.6;
  }

  // --------------------------------------------------------------------
  // Objectives
  // --------------------------------------------------------------------

  var OBJECTIVES = [
    {
      name: 'Attack Power',
      note: 'Flat per weapon type; measured on the live server.',
      needsWeapon: true, confidence: 'measured'
    },
    {
      name: 'Attack Power + DoT',
      note: 'AP and DoT weighted 1:1. The DoT half is unverified.',
      needsWeapon: true, confidence: 'unverified'
    },
    {
      name: 'Attack Power + Critical',
      note: 'Maximises Critical Chance without Attack Power dropping below ' +
        Math.round(AP_CRITICAL_MIN_AP_FRACTION * 100) + '% of its own achievable max.',
      needsWeapon: true, confidence: 'measured'
    },
    {
      name: 'Max HP', note: '2 per STR, plus a class term this calculator can’t confirm.',
      needsWeapon: false, confidence: 'inherited'
    },
    {
      name: 'Max MP', note: '4 per INT, plus a class term this calculator can’t confirm.',
      needsWeapon: false, confidence: 'inherited'
    },
    { name: 'Physical Defence', note: '1.5 per STR.', needsWeapon: false, confidence: 'measured' },
    { name: 'Magic Defence', note: '1.5 per INT.', needsWeapon: false, confidence: 'measured' },
    { name: 'Accuracy', note: '1.0 per CON.', needsWeapon: false, confidence: 'measured' },
    { name: 'Dodge', note: '1.5 per DEX.', needsWeapon: false, confidence: 'measured' },
    { name: 'Critical', note: '1.0 per SEN.', needsWeapon: false, confidence: 'measured' },
    { name: 'Critical Defence', note: '0.5 per CHA.', needsWeapon: false, confidence: 'measured' },
    {
      name: 'DoT Damage', note: '1.0 per CHA, 0.6 per CON. Field-tested only.',
      needsWeapon: false, confidence: 'unverified'
    }
  ];

  var OBJECTIVES_BY_NAME = {};
  OBJECTIVES.forEach(function (o) { OBJECTIVES_BY_NAME[o.name] = o; });

  var FLAT_OBJECTIVE_COEFFICIENTS = {
    'Max HP': { STR: 2.0 },
    'Max MP': { INT: 4.0 },
    'Physical Defence': { STR: 1.5 },
    'Magic Defence': { INT: 1.5 },
    'Accuracy': { CON: 1.0 },
    'Dodge': { DEX: 1.5 },
    'Critical': { SEN: 1.0 },
    'Critical Defence': { CHA: 0.5 },
    'DoT Damage': { CHA: 1.0, CON: 0.6 }
  };

  /* Marginal value of one point in each stat, for the given objective.
   * Does NOT cover "Attack Power + Critical" -- that objective isn't a
   * fixed linear weighting, so it has no single coefficients map and is
   * optimized separately by optimizeApPlusCritical(). */
  function objectiveCoefficients(objectiveName, weapon) {
    if (objectiveName === 'Attack Power') {
      return attackPowerCoefficients(weapon);
    }
    if (objectiveName === 'Attack Power + DoT') {
      var coefficients = attackPowerCoefficients(weapon);
      coefficients.CHA = (coefficients.CHA || 0) + 1.0;
      coefficients.CON = (coefficients.CON || 0) + 0.6;
      return coefficients;
    }
    var flat = FLAT_OBJECTIVE_COEFFICIENTS[objectiveName];
    var copy = {};
    for (var stat in flat) {
      if (Object.prototype.hasOwnProperty.call(flat, stat)) copy[stat] = flat[stat];
    }
    return copy;
  }

  /* Per-stat value tapers for optimize(), if this objective needs any.
   * Only "Critical" does via this function -- "Attack Power + Critical"
   * builds its own taper internally. Past the level-scaled Critical Rating
   * that caps chance-to-crit at 50%, further SEN keeps raising Critical
   * Rating but stops raising that chance, so it is worth nothing more. */
  function objectiveTapers(objectiveName, weapon, level) {
    if (objectiveName !== 'Critical') return {};
    return { SEN: { threshold: criticalRatingForChanceCap(level), after: 0.0 } };
  }

  // --------------------------------------------------------------------
  // Optimizer
  // --------------------------------------------------------------------

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

    var result = {
      stats: stats, budget: budget, spent: 0, leftover: 0,
      floorsCost: 0, value: 0, capped: [], apPriorityInfo: null
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
          var target = Math.min(floors[stat], cap);
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
      if (coefficient > 0 && stats[stat] < cap) {
        pending.push({ key: ratioKey(marginalValue(stat), statCost(stats[stat])), stat: stat });
      }
    });

    while (pending.length && remaining >= 0) {
      var stat = popBest(pending).stat;
      var cost = statCost(stats[stat]);
      if (cost > remaining) continue;   // and never affordable again
      stats[stat] += 1;
      remaining -= cost;
      if (stats[stat] >= cap) {
        result.capped.push(stat);
        continue;
      }
      var newValue = marginalValue(stat);
      if (newValue <= 0) continue;      // tapered off; not worth buying now
      pending.push({ key: ratioKey(newValue, statCost(stats[stat])), stat: stat });
    }

    result.spent = budget - remaining;
    result.leftover = remaining;
    var value = 0;
    for (var i = 0; i < STATS.length; i++) {
      value += (coefficients[STATS[i]] || 0) * stats[STATS[i]];
    }
    result.value = value;
    return result;
  }

  /* Maximise Critical Chance without meaningfully giving up Attack Power.
   *
   * A flat weighted sum (say "+1.0 on SEN") doesn't do that: it treats a
   * point of Critical Rating as worth a fixed amount regardless of what the
   * same SP would have earned in Attack Power, so it pulls SP away from
   * whichever stat is actually best for AP. This instead:
   *
   *   1. Finds the true Attack Power maximum for this budget.
   *   2. Binary-searches the smallest extra per-point weight on SEN for
   *      which Attack Power still never drops below `minApFraction` of that
   *      maximum, and uses the build found at that weight.
   *
   * If the weapon has no confirmed AP data, the floor is 0 and this reduces
   * to maximising Critical Rating outright -- there is no AP to protect.
   */
  function optimizeApPlusCritical(weapon, level, budget, options) {
    options = options || {};
    var cap = options.cap === undefined ? DEFAULT_STAT_CAP : options.cap;
    var minApFraction = options.minApFraction === undefined
      ? AP_CRITICAL_MIN_AP_FRACTION : options.minApFraction;

    var apCoefficients = attackPowerCoefficients(weapon);
    var senApValue = apCoefficients.SEN || 0;
    // Once SEN caps Critical Chance, extra SEN is only worth its own fixed
    // Attack Power value -- independent of the bonus weight searched below,
    // which only ever applies pre-cap.
    var tapers = { SEN: { threshold: criticalRatingForChanceCap(level), after: senApValue } };

    var pureApBuild = optimize(apCoefficients, budget, { cap: cap });
    var apMax = attackPower(pureApBuild.stats, weapon);
    var apFloor = apMax * minApFraction;

    function buildForBonus(bonus) {
      var coefficients = attackPowerCoefficients(weapon);
      coefficients.SEN = senApValue + bonus;
      return optimize(coefficients, budget, { cap: cap, tapers: tapers });
    }

    function meetsFloor(bonus) {
      return attackPower(buildForBonus(bonus).stats, weapon) >= apFloor;
    }

    // bonus = 0 is exactly the pure-AP build (the taper is a no-op there),
    // which trivially meets its own floor, so lo = 0 always satisfies the
    // search invariant.
    var lo = 0.0, hi = 1.0;
    while (meetsFloor(hi) && hi < 1e6) hi *= 2;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (meetsFloor(mid)) lo = mid; else hi = mid;
    }

    var build = buildForBonus(lo);
    build.apPriorityInfo = {
      apMax: apMax,
      apAchieved: attackPower(build.stats, weapon),
      minApFraction: minApFraction,
      senBonus: lo
    };
    return build;
  }

  /* One call for the whole calculation, so the UI never has to know which
   * objectives are linear and which aren't. */
  function solve(params) {
    var weapon = params.weapon;
    var level = params.level;
    var budget = params.budget;
    var cap = params.cap;

    if (params.objectiveName === 'Attack Power + Critical') {
      return {
        build: optimizeApPlusCritical(weapon, level, budget, { cap: cap }),
        coefficients: {}
      };
    }
    var coefficients = objectiveCoefficients(params.objectiveName, weapon);
    var tapers = objectiveTapers(params.objectiveName, weapon, level);
    return {
      build: optimize(coefficients, budget, { cap: cap, tapers: tapers }),
      coefficients: coefficients
    };
  }

  return {
    STATS: STATS,
    BASE_STATS: BASE_STATS,
    DEFAULT_STAT_CAP: DEFAULT_STAT_CAP,
    MAX_LEVEL: MAX_LEVEL,
    CRIT_CHANCE_CAP_PERCENT: CRIT_CHANCE_CAP_PERCENT,
    AP_CRITICAL_MIN_AP_FRACTION: AP_CRITICAL_MIN_AP_FRACTION,
    CROSSBOW_DISPUTE_NOTE: CROSSBOW_DISPUTE_NOTE,
    JOBS: JOBS,
    JOBS_BY_NAME: JOBS_BY_NAME,
    WEAPONS: WEAPONS,
    WEAPONS_BY_NAME: WEAPONS_BY_NAME,
    AP_COEFFICIENTS: AP_COEFFICIENTS,
    OBJECTIVES: OBJECTIVES,
    OBJECTIVES_BY_NAME: OBJECTIVES_BY_NAME,
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
    objectiveCoefficients: objectiveCoefficients,
    objectiveTapers: objectiveTapers,
    optimize: optimize,
    optimizeApPlusCritical: optimizeApPlusCritical,
    solve: solve
  };
}));
