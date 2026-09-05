/* Self-checks for rose-formulas.js.
 *
 * A port of the `if __name__ == "__main__"` block in the original
 * ../rose_base_calc/rose_formulas.py, so the two implementations can be
 * held to the same assertions. Run it with:
 *
 *     node js/self-check.js
 *
 * There is no build step and no test runner -- this is deliberately a
 * plain script, the same as the Python module it came from.
 */

'use strict';

var rf = require('./rose-formulas.js');

var checks = 0;

function assert(condition, description) {
  checks += 1;
  if (!condition) {
    console.error('FAILED: ' + description);
    process.exit(1);
  }
}

function round(value, places) {
  var factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

// -- Stat cost and budget --------------------------------------------------

assert(rf.statCost(10) === 2, 'statCost(10) === 2');
assert(rf.statCost(139) === 27, 'statCost(139) === 27');
assert(rf.cumulativeCost(15) === 15, 'cumulativeCost(15) === 15');
assert(rf.costBetween(15, 425) === 17835, 'costBetween(15, 425) === 17835');
assert(rf.totalStatPoints(250) === 27490, 'totalStatPoints(250) === 27490');
assert(rf.totalStatPoints(130) === 8050, 'totalStatPoints(130) === 8050  [piNo, topic 2434]');
assert(rf.levelupStatPoints(2) === 11, 'levelupStatPoints(2) === 11');

// -- HP / MP ---------------------------------------------------------------

var artisan = rf.JOBS_BY_NAME.Artisan;
assert(rf.maxHp(artisan, 250, 25) === 2866, 'maxHp(Artisan, 250, 25) === 2866');
assert(rf.maxMp(artisan, 250, 25) === 1225, 'maxMp(Artisan, 250, 25) === 1225');

// -- Attack Power ----------------------------------------------------------

var gun = rf.WEAPONS_BY_NAME.Gun;
var coefficients = rf.objectiveCoefficients('Attack Power', gun);
console.log('Gun -- AP per stat point:', coefficients);
assert(
  coefficients.CON === 0.50 && coefficients.DEX === 0.40 && coefficients.SEN === 0.10 &&
  Object.keys(coefficients).length === 3,
  'Gun AP coefficients are CON 0.50 / DEX 0.40 / SEN 0.10'
);

// The cap is on points put in, not on the value shown, so a stat tops out at
// what it started with plus the cap. CHA and SEN start lower and so end lower.
assert(rf.statCeiling('STR', 425) === 440, 'STR tops out at 15 + 425');
assert(rf.statCeiling('CHA', 425) === 435, 'CHA tops out at 10 + 425');
rf.STATS.forEach(function (stat) {
  assert(rf.statCeiling(stat, 425) - rf.BASE_STATS[stat] === 425,
    stat + ' can take exactly 425 added points');
});

// A single stat can just barely be filled on a maxed-out level 250 budget,
// with little to spare -- matches the forum's "just one stat can be maxed"
// (Avatar, topic 979).
var singleStatCost = rf.costBetween(15, rf.statCeiling('STR', 425));
console.log('\nSP to max one stat (15 -> 425): ' + singleStatCost);
console.log('SP earned by level 250: ' + rf.totalStatPoints(250));
assert(
  singleStatCost <= rf.totalStatPoints(250) && rf.totalStatPoints(250) < 2 * singleStatCost,
  'exactly one stat can be maxed at level 250'
);

var build = rf.optimize(coefficients, rf.totalStatPoints(250));
console.log('\nBudget ' + build.budget + ' SP -> ' + JSON.stringify(build.stats));
console.log('spent ' + build.spent + ', leftover ' + build.leftover +
  ', AP value ' + build.value.toFixed(1));

// -- Critical chance cap (Phish_, topic 6095 / Lekoi, topic 7598) ----------

assert(rf.criticalRatingForChanceCap(250) === 1345, 'crit rating for 50% at level 250 is 1345');

function statsWithSen(sen) {
  var stats = {};
  rf.STATS.forEach(function (stat) { stats[stat] = rf.BASE_STATS[stat]; });
  stats.SEN = sen;
  return stats;
}

var lekoiStats = statsWithSen(1345);
assert(rf.criticalChance(lekoiStats, 250) === 50.0, 'crit chance saturates at 50%');
assert(round(rf.criticalChance(lekoiStats, 250, 1000), 3) === 12.825, 'crit chance vs 1000 CritDef');
assert(round(rf.criticalChance(lekoiStats, 250, 250), 2) === 40.71, 'crit chance vs 250 CritDef');

// At a real level-250 budget the cap never binds (max SEN via SP alone is
// far below 1345), so the taper should be invisible there.
var critCoefficients = rf.objectiveCoefficients('Critical', gun);
var critTapers = rf.objectiveTapers('Critical', gun, 250);
var normalBuild = rf.optimize(critCoefficients, rf.totalStatPoints(250), { tapers: critTapers });
assert(normalBuild.stats.SEN === rf.statCeiling('SEN', 425), 'the ceiling binds before the crit taper');
assert(normalBuild.stats.SEN === 435, 'which for SEN is 435, not 425');
assert(normalBuild.stats.SEN < critTapers.SEN.threshold, 'crit taper (1345) never reached');

// But it does bind at a low level with an oversized manual SP budget, which
// the "SP budget" override in the UI permits.
var lowLevelTapers = rf.objectiveTapers('Critical', gun, 1);
assert(lowLevelTapers.SEN.threshold === 100, 'crit taper threshold at level 1 is 100');
var cappedBuild = rf.optimize(critCoefficients, 50000, { cap: 425, tapers: lowLevelTapers });
assert(cappedBuild.stats.SEN === 100, 'optimizer stops at the taper, not the cap');
assert(cappedBuild.leftover > 0, 'the rest of the SP goes unspent');

// -- Combining goals ------------------------------------------------------

// One goal alone must reach its own maximum, by definition.
rf.OBJECTIVES.forEach(function (goal) {
  var one = rf.solveGoals({
    goalNames: [goal.name], weapon: gun, level: 250,
    budget: rf.totalStatPoints(250), cap: 425
  });
  var score = one.build.goalScores[0];
  if (score.fraction !== null) {
    assert(Math.abs(score.fraction - 1) < 1e-9, goal.name + ' alone reaches 100% of itself');
  }
});

// Coefficients run from 0.5 per point (Critical Defence) to 5.5 (Heal Power).
// Adding them raw would hand every mixed build to whichever goal carries the
// biggest numbers, so each is scaled by its own solo maximum first. The test
// of that: pairing a small-coefficient goal with a large one must still leave
// the small one with a real share.
var pairing = rf.solveGoals({
  goalNames: ['Critical Defence', 'Heal Power'], weapon: gun, level: 250,
  budget: rf.totalStatPoints(250), cap: 425
});
pairing.build.goalScores.forEach(function (score) {
  assert(score.fraction > 0.5, score.name + ' keeps a real share against a goal 11x its scale');
});

// Adding a goal cannot improve the ones already there.
var apAlone = rf.solveGoals({
  goalNames: ['Attack Power'], weapon: gun, level: 250, budget: rf.totalStatPoints(250), cap: 425
});
var apPlusCrit = rf.solveGoals({
  goalNames: ['Attack Power', 'Critical'], weapon: gun, level: 250, budget: rf.totalStatPoints(250), cap: 425
});
assert(apPlusCrit.build.goalScores[0].achieved <= apAlone.build.goalScores[0].achieved,
  'adding Critical never raises Attack Power');
assert(apPlusCrit.build.goalScores[1].fraction > 0.5,
  'and Critical gets a real share of the build, not a token');

// A goal with no confirmed data for this weapon scores null rather than
// dividing by zero, and drops out of the combination.
var unarmed = rf.WEAPONS_BY_NAME.Unarmed;
var unarmedPair = rf.solveGoals({
  goalNames: ['Attack Power', 'Critical'], weapon: unarmed, level: 250,
  budget: rf.totalStatPoints(250), cap: 425
});
assert(unarmedPair.build.goalScores[0].fraction === null, 'Unarmed Attack Power has no max to score against');
assert(unarmedPair.build.stats.SEN === rf.statCeiling('SEN', 425), 'so the build falls back to Critical alone');

// Picking nothing spends nothing rather than throwing.
var nothing = rf.solveGoals({
  goalNames: [], weapon: gun, level: 250, budget: rf.totalStatPoints(250), cap: 425
});
assert(nothing.build.spent === 0, 'no goals means no points spent');
rf.STATS.forEach(function (stat) {
  assert(nothing.build.stats[stat] === rf.BASE_STATS[stat], stat + ' stays at its creation value');
});

assert(rf.MAX_GOALS === 3, 'three goals at a time');

// -- Goal weights ---------------------------------------------------------

// The user's priority order: AP > DoT > Accuracy > Critical > everything else.
var W = function (name) { return rf.OBJECTIVES_BY_NAME[name].weight; };
assert(W('Attack Power') > W('DoT Damage'), 'Attack Power outranks DoT');
assert(W('DoT Damage') > W('Accuracy'), 'DoT outranks Accuracy');
assert(W('Accuracy') > W('Critical'), 'Accuracy outranks Critical');
rf.OBJECTIVES.forEach(function (goal) {
  if (['Attack Power', 'DoT Damage', 'Accuracy', 'Critical'].indexOf(goal.name) === -1) {
    assert(goal.weight < W('Critical'), goal.name + ' comes after the four that are ranked');
  }
});

function scoreOf(result, name) {
  return $filter(result.build.goalScores, function (s) { return s.name === name; })[0];
}
function $filter(list, fn) {
  var out = []; list.forEach(function (x) { if (fn(x)) out.push(x); }); return out;
}

var offensive = ['Attack Power', 'DoT Damage', 'Critical'];
function solveWeighted(weights) {
  return rf.solveGoals({
    goalNames: offensive, weights: weights, weapon: gun,
    level: 250, budget: rf.totalStatPoints(250), cap: 425
  });
}

// Weighting is what stops a combined build being mediocre at everything: the
// whole point of the ordering is that Attack Power keeps most of its reach.
var evenly = solveWeighted({ 'Attack Power': 1, 'DoT Damage': 1, 'Critical': 1 });
var ranked = solveWeighted(null);
assert(scoreOf(ranked, 'Attack Power').fraction > scoreOf(evenly, 'Attack Power').fraction,
  'the default weights protect Attack Power against an even split');
assert(scoreOf(ranked, 'Attack Power').fraction > 0.85,
  'and keep it above 85% of what it could reach alone');

// Only ratios matter, so scaling every weight leaves the build identical.
var doubled = solveWeighted({ 'Attack Power': 2, 'DoT Damage': 1.4, 'Critical': 0.7 });
rf.STATS.forEach(function (stat) {
  assert(doubled.build.stats[stat] === ranked.build.stats[stat],
    stat + ' is unchanged when every weight is doubled');
});

// Raising one goal's weight cannot lower its own share.
var critHeavy = solveWeighted({ 'Attack Power': 1, 'DoT Damage': 0.7, 'Critical': 1 });
assert(scoreOf(critHeavy, 'Critical').fraction > scoreOf(ranked, 'Critical').fraction,
  'weighting Critical higher gets it more of the build');

// A weight of zero drops the goal out without breaking the rest.
var zeroed = solveWeighted({ 'Attack Power': 1, 'DoT Damage': 0.7, 'Critical': 0 });
assert(scoreOf(zeroed, 'Critical').weight === 0, 'a zero weight is kept as zero');
assert(zeroed.build.stats.SEN <= ranked.build.stats.SEN, 'and stops the build buying SEN for it');

// -- Heal Power -----------------------------------------------------------

// UNVERIFIED: one hedged forum post (ryle23, Aug 2023), never confirmed.
assert(rf.healPower({ STR: 0, DEX: 0, INT: 0, CON: 0, CHA: 100, SEN: 0 }) === 550,
  '100 CHA is 550 heal points');
assert(rf.healPower({ STR: 0, DEX: 0, INT: 100, CON: 0, CHA: 0, SEN: 0 }) === 550,
  '100 INT is 550 heal points, per the same post');
var healCoefficients = rf.objectiveCoefficients('Heal Power', gun);
assert(healCoefficients.CHA === 5.5 && healCoefficients.INT === 5.5,
  'Heal Power weights CHA and INT equally');
assert(Object.keys(healCoefficients).length === 2, 'and nothing else');

// -- Equipment requirements (mandatory floors) ----------------------------

// Which stat each weapon's equip requirement sits on. Reported by the user
// from the live game; only Unarmed has none.
var EXPECTED_REQUIRES = {
  'Unarmed': null,
  '1H Sword/Blunt, Great Sword, Spear, Axe': 'STR',
  'Katar': 'DEX',
  'Dual Wield': 'DEX',
  'Bow': 'DEX',
  'Crossbow (Bowgun)': 'STR',
  'Staff': 'INT',
  'Wand': 'INT',
  'Gun': 'CON',
  'Launcher': 'STR'
};
assert(rf.WEAPONS.length === Object.keys(EXPECTED_REQUIRES).length,
  'every weapon is accounted for in the requirement map');
rf.WEAPONS.forEach(function (weapon) {
  assert(weapon.requires === EXPECTED_REQUIRES[weapon.name],
    weapon.name + ' requires ' + (EXPECTED_REQUIRES[weapon.name] || 'nothing'));
  assert(weapon.requires === null || rf.STATS.indexOf(weapon.requires) !== -1,
    weapon.name + ' requires a real stat');
});

// A level 250 Artisan's Launcher needs 158 STR. Under a goal that has no use
// for STR at all, the floor is what puts the points there.
var launcher = rf.WEAPONS_BY_NAME.Launcher;
var budget250 = rf.totalStatPoints(250);
var strFloor = {};
strFloor[launcher.requires] = 158;
assert(launcher.requires === 'STR', 'the Launcher requirement is on STR');

var noFloor = rf.solveGoals({
  goalNames: ['Max MP'], weapon: launcher, level: 250, budget: budget250, cap: 425
});
assert(noFloor.build.stats.STR === rf.BASE_STATS.STR, 'Max MP buys no STR on its own');

var withFloor = rf.solveGoals({
  goalNames: ['Max MP'], weapon: launcher, level: 250, budget: budget250, cap: 425, floors: strFloor
});
assert(withFloor.build.stats.STR === 158, 'the floor puts STR at exactly the requirement');
assert(withFloor.build.floorsCost === rf.costBetween(rf.BASE_STATS.STR, 158),
  'floorsCost is the cost of getting STR from its base to the requirement');
assert(withFloor.build.floorsCost === 2403, 'reaching 158 STR from 15 costs 2403 points');
assert(withFloor.build.spent <= budget250, 'the floor does not push the build over budget');

// Max MP caps INT at 425 and still leaves thousands of points unspendable, so
// here the requirement is paid for out of slack and the goal loses nothing.
assert(withFloor.build.stats.INT === noFloor.build.stats.INT,
  'with budget to spare, the requirement costs the goal nothing');
assert(withFloor.build.leftover === noFloor.build.leftover - 2403,
  'it comes out of the unspent remainder instead');

// When the goal can absorb the whole budget, it does cost. Gun Attack Power
// (CON/DEX/SEN) has no use for STR at all, so a STR requirement is pure loss.
var apNoFloor = rf.solveGoals({
  goalNames: ['Attack Power'], weapon: gun, level: 250, budget: budget250, cap: 425
});
var apFloored = rf.solveGoals({
  goalNames: ['Attack Power'], weapon: gun, level: 250, budget: budget250, cap: 425, floors: strFloor
});
assert(apFloored.build.stats.STR === 158, 'the floor is met under Attack Power too');
assert(rf.attackPower(apFloored.build.stats, gun) < rf.attackPower(apNoFloor.build.stats, gun),
  'and there it really does cost the goal Attack Power');

// A floor already satisfied at character creation changes nothing.
var trivial = rf.solveGoals({
  goalNames: ['Max MP'], weapon: launcher, level: 250, budget: budget250, cap: 425, floors: { STR: 10 }
});
assert(trivial.build.floorsCost === 0, 'a floor below the creation value costs nothing');
assert(trivial.build.stats.INT === noFloor.build.stats.INT, 'and leaves the build untouched');

// A floor above what points can reach is clamped to the ceiling, not chased
// past it -- and the ceiling is the creation value plus the cap, not the cap.
var overCap = rf.solveGoals({
  goalNames: ['Max MP'], weapon: launcher, level: 250, budget: budget250, cap: 200, floors: { STR: 300 }
});
assert(overCap.build.stats.STR === 215, 'a floor above the ceiling stops at 15 + 200');
assert(overCap.build.stats.STR === rf.statCeiling('STR', 200), 'which is exactly the ceiling');

// An unaffordable floor fills as far as the budget allows and stops, rather
// than overspending -- the UI reports this as a build that cannot equip.
var broke = rf.solveGoals({
  goalNames: ['Max MP'], weapon: launcher, level: 12, budget: rf.totalStatPoints(12), cap: 425, floors: { STR: 400 }
});
assert(broke.build.stats.STR < 400, 'an unaffordable floor is left unmet');
assert(broke.build.spent <= rf.totalStatPoints(12), 'and never overspends the budget');

// A requirement binds every goal in a combination, not just the first.
var multiFloored = rf.solveGoals({
  goalNames: ['Max MP', 'Critical'], weapon: launcher, level: 250,
  budget: budget250, cap: 425, floors: strFloor
});
assert(multiFloored.build.stats.STR >= 158, 'the requirement is met with several goals selected');
assert(multiFloored.build.floorsCost === 2403, 'and costs the same 2403 points');

// -- The optimizer never overspends, whatever the inputs ------------------

rf.OBJECTIVES.forEach(function (objective) {
  rf.WEAPONS.forEach(function (weapon) {
    [1, 7, 60, 130, 250].forEach(function (level) {
      var budget = rf.totalStatPoints(level);
      var solved = rf.solveGoals({
        goalNames: [objective.name], weapon: weapon,
        level: level, budget: budget, cap: rf.DEFAULT_STAT_CAP
      });
      assert(solved.build.spent <= budget, objective.name + '/' + weapon.name + '/L' + level + ' stays in budget');
      assert(solved.build.spent + solved.build.leftover === budget, 'spent + leftover === budget');
      rf.STATS.forEach(function (stat) {
        assert(solved.build.stats[stat] >= rf.BASE_STATS[stat], stat + ' never drops below its base');
        assert(solved.build.stats[stat] <= rf.statCeiling(stat, rf.DEFAULT_STAT_CAP),
          stat + ' never exceeds its ceiling');
        assert(solved.build.stats[stat] - rf.BASE_STATS[stat] <= rf.DEFAULT_STAT_CAP,
          stat + ' never takes more than the cap in added points');
      });
    });
  });
});

console.log('\nAll ' + checks + ' self-checks passed.');
