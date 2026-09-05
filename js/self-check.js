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

// A single stat can just barely reach the 425 cap on a maxed-out level 250
// budget, with little to spare -- matches the forum's "just one stat can be
// maxed" (Avatar, topic 979).
var singleStatCost = rf.costBetween(15, 425);
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
assert(normalBuild.stats.SEN === 425, 'global cap binds before the crit taper');
assert(normalBuild.stats.SEN < critTapers.SEN.threshold, 'crit taper (1345) never reached');

// But it does bind at a low level with an oversized manual SP budget, which
// the "SP budget" override in the UI permits.
var lowLevelTapers = rf.objectiveTapers('Critical', gun, 1);
assert(lowLevelTapers.SEN.threshold === 100, 'crit taper threshold at level 1 is 100');
var cappedBuild = rf.optimize(critCoefficients, 50000, { cap: 425, tapers: lowLevelTapers });
assert(cappedBuild.stats.SEN === 100, 'optimizer stops at the taper, not the cap');
assert(cappedBuild.leftover > 0, 'the rest of the SP goes unspent');

// -- "Attack Power + Critical" --------------------------------------------

var apOnly = rf.optimize(rf.objectiveCoefficients('Attack Power', gun), rf.totalStatPoints(250), { cap: 425 });
var apOnlyValue = rf.attackPower(apOnly.stats, gun);
var apOnlyCrit = rf.criticalChance(apOnly.stats, 250);

var comboBuild = rf.optimizeApPlusCritical(gun, 250, rf.totalStatPoints(250), { cap: 425 });
var comboAp = rf.attackPower(comboBuild.stats, gun);
var comboCrit = rf.criticalChance(comboBuild.stats, 250);

assert(comboAp >= apOnlyValue * rf.AP_CRITICAL_MIN_AP_FRACTION, 'AP floor is respected');
assert(comboCrit > apOnlyCrit * 1.2, 'and the crit gain is real, not a token');
console.log(
  '\nAP+Crit (Gun, lvl 250): AP ' + comboAp +
  ' (' + (comboAp / apOnlyValue * 100).toFixed(1) + '% of pure-AP max ' + apOnlyValue + '), ' +
  'crit ' + comboCrit.toFixed(2) + '% (vs ' + apOnlyCrit.toFixed(2) + '% incidental from pure AP)'
);

// A weapon with no confirmed AP data must degenerate cleanly into
// maximising Critical Rating, not divide by zero.
var unarmed = rf.WEAPONS_BY_NAME.Unarmed;
var unarmedBuild = rf.optimizeApPlusCritical(unarmed, 250, rf.totalStatPoints(250), { cap: 425 });
assert(unarmedBuild.stats.SEN === 425, 'Unarmed AP+Crit maximises Critical Rating');

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

var noFloor = rf.solve({
  objectiveName: 'Max MP', weapon: launcher, level: 250, budget: budget250, cap: 425
});
assert(noFloor.build.stats.STR === rf.BASE_STATS.STR, 'Max MP buys no STR on its own');

var withFloor = rf.solve({
  objectiveName: 'Max MP', weapon: launcher, level: 250, budget: budget250, cap: 425, floors: strFloor
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
var apNoFloor = rf.solve({
  objectiveName: 'Attack Power', weapon: gun, level: 250, budget: budget250, cap: 425
});
var apFloored = rf.solve({
  objectiveName: 'Attack Power', weapon: gun, level: 250, budget: budget250, cap: 425, floors: strFloor
});
assert(apFloored.build.stats.STR === 158, 'the floor is met under Attack Power too');
assert(rf.attackPower(apFloored.build.stats, gun) < rf.attackPower(apNoFloor.build.stats, gun),
  'and there it really does cost the goal Attack Power');

// A floor already satisfied at character creation changes nothing.
var trivial = rf.solve({
  objectiveName: 'Max MP', weapon: launcher, level: 250, budget: budget250, cap: 425, floors: { STR: 10 }
});
assert(trivial.build.floorsCost === 0, 'a floor below the creation value costs nothing');
assert(trivial.build.stats.INT === noFloor.build.stats.INT, 'and leaves the build untouched');

// A floor above the stat cap is clamped to the cap, not chased past it.
var overCap = rf.solve({
  objectiveName: 'Max MP', weapon: launcher, level: 250, budget: budget250, cap: 200, floors: { STR: 300 }
});
assert(overCap.build.stats.STR === 200, 'a floor above the cap stops at the cap');

// An unaffordable floor fills as far as the budget allows and stops, rather
// than overspending -- the UI reports this as a build that cannot equip.
var broke = rf.solve({
  objectiveName: 'Max MP', weapon: launcher, level: 12, budget: rf.totalStatPoints(12), cap: 425, floors: { STR: 400 }
});
assert(broke.build.stats.STR < 400, 'an unaffordable floor is left unmet');
assert(broke.build.spent <= rf.totalStatPoints(12), 'and never overspends the budget');

// "Attack Power + Critical" must apply the floor to its pure-AP baseline too,
// or the AP target it measures itself against would be unreachable.
var comboFloored = rf.optimizeApPlusCritical(launcher, 250, budget250, { cap: 425, floors: strFloor });
assert(comboFloored.stats.STR >= 158, 'the combined objective still meets the requirement');
assert(
  rf.attackPower(comboFloored.stats, launcher) >=
    comboFloored.apPriorityInfo.apMax * rf.AP_CRITICAL_MIN_AP_FRACTION,
  'and its Attack Power guarantee still holds against a floored baseline'
);

// -- The optimizer never overspends, whatever the inputs ------------------

rf.OBJECTIVES.forEach(function (objective) {
  rf.WEAPONS.forEach(function (weapon) {
    [1, 7, 60, 130, 250].forEach(function (level) {
      var budget = rf.totalStatPoints(level);
      var solved = rf.solve({
        objectiveName: objective.name, weapon: weapon,
        level: level, budget: budget, cap: rf.DEFAULT_STAT_CAP
      });
      assert(solved.build.spent <= budget, objective.name + '/' + weapon.name + '/L' + level + ' stays in budget');
      assert(solved.build.spent + solved.build.leftover === budget, 'spent + leftover === budget');
      rf.STATS.forEach(function (stat) {
        assert(solved.build.stats[stat] >= rf.BASE_STATS[stat], stat + ' never drops below its base');
        assert(solved.build.stats[stat] <= rf.DEFAULT_STAT_CAP, stat + ' never exceeds the cap');
      });
    });
  });
});

console.log('\nAll ' + checks + ' self-checks passed.');
