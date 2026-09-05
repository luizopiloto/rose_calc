/* ROSE Online base status optimizer -- interface.
 *
 * All the arithmetic lives in rose-formulas.js. This file only wires the
 * controls to it and renders the result, the same division the original
 * PySide6 app kept between rose_formulas.py and main_form.py.
 *
 * Recalculation is synchronous on every input change: a full solve is a few
 * milliseconds even with three goals, each of which needs a solo pass first,
 * so there is no debounce and no "calculate" button to press.
 */

(function ($, rf) {
  'use strict';

  var STAT_ORDER = rf.STATS;

  var DEFAULTS = {
    level: rf.MAX_LEVEL,
    goals: ['Attack Power'],
    job: 'Artisan',
    weapon: 'Gun',
    cap: rf.DEFAULT_STAT_CAP,
    budgetAuto: true,
    reqValue: 0
  };

  // Why a figure carries the dotted underline. Keyed by what it describes.
  var PROVISIONAL = {
    hp: 'The 2-per-STR part is confirmed on the live server. The class and ' +
        'level term is not: the player who measured everything else said HP ' +
        'is class-dependent and that he had not covered it. These numbers ' +
        'come from a different, older server’s code.',
    mp: 'The 4-per-INT part is confirmed on the live server. The class and ' +
        'level term is not, for the same reason as Max HP.',
    dot: '1.0 per CHA and 0.6 per CON comes from your own field testing. The ' +
         'official forum confirms that Charm affects damage-over-time skills ' +
         'but has never put a number on it.'
  };

  var $level, $levelSlider, $goals, $goalsNote, $job, $weapon, $cap, $budget,
      $budgetAuto, $reqValue, $reqStatLabel, $reqNote, $announcer;

  var announceTimer = null;
  var hexTween = null;
  var hexCurrent = null;   // fraction of the cap currently drawn, per stat

  // --------------------------------------------------------------------
  // Small helpers
  // --------------------------------------------------------------------

  function fmt(value) {
    return Number(value).toLocaleString('en-US');
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Read a bounded integer, falling back when the box is mid-edit or empty. */
  function readNumber($input, min, max, fallback) {
    var raw = parseInt($input.val(), 10);
    if (isNaN(raw)) return fallback;
    return Math.min(max, Math.max(min, raw));
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // --------------------------------------------------------------------
  // Populate the controls from the formula module, so the lists have one
  // source of truth rather than being typed into the markup.
  // --------------------------------------------------------------------

  function fillSelect($select, names) {
    $select.empty();
    $.each(names, function (_, name) {
      $select.append($('<option>').attr('value', name).text(name));
    });
  }

  function buildControls() {
    $goals.empty();
    $.each(rf.OBJECTIVES, function (_, goal) {
      $goals.append(
        $('<label class="goal">').append(
          $('<input type="checkbox" class="goal-check">').val(goal.name),
          $('<span class="goal-name">').text(goal.name)
        )
      );
    });
    fillSelect($job, $.map(rf.JOBS, function (j) { return j.name; }));
    fillSelect($weapon, $.map(rf.WEAPONS, function (w) { return w.name; }));

    $level.attr({ min: 1, max: rf.MAX_LEVEL });
    $levelSlider.attr({ min: 1, max: rf.MAX_LEVEL });
    $cap.attr({ min: 50, max: 500 });
  }

  function applyDefaults() {
    $level.val(DEFAULTS.level);
    $levelSlider.val(DEFAULTS.level);
    $goals.find('.goal-check').each(function () {
      $(this).prop('checked', $.inArray(this.value, DEFAULTS.goals) !== -1);
    });
    $job.val(DEFAULTS.job);
    $weapon.val(DEFAULTS.weapon);
    $cap.val(DEFAULTS.cap);
    $budgetAuto.prop('checked', DEFAULTS.budgetAuto);
    $reqValue.val(DEFAULTS.reqValue);
  }

  function readGoals() {
    return $goals.find('.goal-check:checked').map(function () { return this.value; }).get();
  }

  /* At the limit, the goals you have not picked stop being selectable rather
   * than silently doing nothing when clicked. */
  function syncGoalLimit(chosen) {
    var atLimit = chosen.length >= rf.MAX_GOALS;
    $goals.find('.goal-check').each(function () {
      this.disabled = atLimit && !this.checked;
    });
    $goalsNote.text(
      chosen.length === 0
        ? 'Pick up to ' + rf.MAX_GOALS + '.'
        : chosen.length + ' of ' + rf.MAX_GOALS + ' picked' +
          (atLimit ? ' — clear one to swap it out.' : '.')
    );
  }

  /* Which stat a weapon demands is fixed by the weapon; only how much of it
   * is an input, since that rises with the weapon's grade. */
  function syncRequirementControl(weapon) {
    var stat = weapon.requires;
    $reqStatLabel.text(stat || 'none');
    $reqValue.prop('disabled', !stat);
    if (!stat) $reqValue.val(0);
    $reqNote.text(stat
      ? 'Weapon status requirement — bought before anything else, since a ' +
        'weapon you can’t equip is worth nothing.'
      : 'No weapon, so there’s no status requirement to meet.');
  }

  /* The requirement as a {stat: minimum} map for the solver, or null when
   * there is nothing to meet. */
  function readRequirement(weapon) {
    var stat = weapon.requires;
    if (!stat) return null;
    var value = readNumber($reqValue, 0, 500, 0);
    if (value <= rf.BASE_STATS[stat]) return null;   // already met at creation
    var floors = {};
    floors[stat] = value;
    return floors;
  }

  // --------------------------------------------------------------------
  // The hexagon
  // --------------------------------------------------------------------

  var HEX = { cx: 160, cy: 150, r: 104, labelR: 128 };

  function vertex(index, fraction) {
    var angle = (index * 60 - 90) * Math.PI / 180;
    var radius = HEX.r * fraction;
    return {
      x: HEX.cx + radius * Math.cos(angle),
      y: HEX.cy + radius * Math.sin(angle)
    };
  }

  function pointsAttr(fractions) {
    return $.map(fractions, function (fraction, index) {
      var point = vertex(index, fraction);
      return point.x.toFixed(2) + ',' + point.y.toFixed(2);
    }).join(' ');
  }

  function svgEl(name, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', name);
    $.each(attrs || {}, function (key, value) { node.setAttribute(key, value); });
    return node;
  }

  /* Rings and spokes never change, so they are drawn once. */
  function drawHexagonFrame() {
    var $rings = $('#hexRings').empty();
    $.each([0.25, 0.5, 0.75, 1], function (_, scale) {
      var ring = svgEl('polygon', { points: pointsAttr([scale, scale, scale, scale, scale, scale]) });
      if (scale === 1) ring.setAttribute('class', 'hexagon-ring-outer');
      $rings.append(ring);
    });

    var $spokes = $('#hexSpokes').empty();
    $.each(STAT_ORDER, function (index) {
      var tip = vertex(index, 1);
      $spokes.append(svgEl('line', { x1: HEX.cx, y1: HEX.cy, x2: tip.x, y2: tip.y }));
    });
  }

  function drawHexagonLabels(stats, cap) {
    var $labels = $('#hexLabels').empty();
    $.each(STAT_ORDER, function (index, stat) {
      var angle = (index * 60 - 90) * Math.PI / 180;
      var x = HEX.cx + HEX.labelR * Math.cos(angle);
      var y = HEX.cy + HEX.labelR * Math.sin(angle);
      var dx = Math.cos(angle);
      var anchor = Math.abs(dx) < 0.01 ? 'middle' : (dx > 0 ? 'start' : 'end');

      var name = svgEl('text', { x: x, y: y - 5, 'text-anchor': anchor, 'class': 'hexagon-label-name' });
      name.textContent = stat;
      $labels.append(name);

      var untouched = stats[stat] === rf.BASE_STATS[stat];
      var tip = vertex(index, Math.min(1, stats[stat] / rf.statCeiling(stat, cap)));
      $labels.append(svgEl('circle', {
        cx: tip.x, cy: tip.y, r: untouched ? 2.5 : 4,
        'class': 'hexagon-dot' + (untouched ? ' is-untouched' : '')
      }));

      var value = svgEl('text', {
        x: x, y: y + 12, 'text-anchor': anchor,
        'class': 'hexagon-label-value' + (untouched ? ' is-untouched' : '')
      });
      value.textContent = stats[stat];
      $labels.append(value);
    });
  }

  function drawHexagon(stats, cap) {
    var target = $.map(STAT_ORDER, function (stat) {
      return Math.min(1, stats[stat] / rf.statCeiling(stat, cap));
    });
    var $shape = $('#hexShape');

    drawHexagonLabels(stats, cap);

    if (!hexCurrent || prefersReducedMotion()) {
      hexCurrent = target.slice();
      $shape.attr('points', pointsAttr(hexCurrent));
      return;
    }

    var from = hexCurrent.slice();
    var start = null;
    var duration = 320;

    if (hexTween) cancelAnimationFrame(hexTween);

    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      hexCurrent = $.map(from, function (value, index) {
        return value + (target[index] - value) * eased;
      });
      $shape.attr('points', pointsAttr(hexCurrent));
      if (t < 1) hexTween = requestAnimationFrame(step);
      else hexTween = null;
    }
    hexTween = requestAnimationFrame(step);
  }

  // --------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------

  function renderLedger(build, level, earned) {
    var spentShare = build.budget > 0 ? (build.spent / build.budget) * 100 : 0;

    $('#ledgerTotal').text(fmt(build.budget));
    $('#ledgerTotalLabel').text(
      build.budget === earned
        ? 'stat points earned by level ' + level
        : 'stat points, set by hand — a level ' + level + ' character earns ' + fmt(earned)
    );
    $('#ledgerBarFill').css('width', spentShare + '%');
    $('#ledgerSpent').text(fmt(build.spent));
    $('#ledgerLeft').text(fmt(build.leftover));
    $('.ledger-split-item-rest').toggleClass('is-stranded', build.leftover > 0);
  }

  function renderAllocation(build, cap, requirement) {
    var rows = $.map(STAT_ORDER, function (stat) {
      var required = requirement && requirement.stat === stat ? requirement.needed : 0;
      var base = rf.BASE_STATS[stat];
      var final = build.stats[stat];
      var gain = final - base;
      var spent = rf.costBetween(base, final);
      var share = build.spent > 0 ? (spent / build.spent) * 100 : 0;
      var untouched = final === base;
      var capped = final >= rf.statCeiling(stat, cap);

      var classes = 'alloc-row' +
        (untouched ? ' is-untouched' : '') +
        (capped ? ' is-capped' : '');

      return '<li class="' + classes + '">' +
        '<span class="alloc-stat">' + stat + '</span>' +
        '<span class="alloc-values">' + base + ' &rarr; ' +
          '<span class="alloc-final">' + final + '</span>' +
          (gain ? ' <span class="alloc-gain">(+' + fmt(gain) + ')</span>' : '') +
          (required ? ' <span class="alloc-req-note">needs ' + fmt(required) + '</span>' : '') +
          (capped ? ' <span class="alloc-cap-note">at cap</span>' : '') +
        '</span>' +
        '<span class="alloc-track">' +
          '<span class="alloc-fill" style="width:' + share.toFixed(2) + '%"></span>' +
        '</span>' +
        '<span class="alloc-cost">' + (spent ? fmt(spent) + ' SP' : '—') + '</span>' +
      '</li>';
    });
    $('#alloc').html(rows.join(''));
  }

  function resultItem(label, value, options) {
    options = options || {};
    var valueHtml = esc(value);
    if (options.unit) valueHtml += '<span class="result-unit">' + esc(options.unit) + '</span>';
    if (options.provisional) {
      valueHtml = '<abbr class="provisional" title="' + esc(options.provisional) + '">' +
        valueHtml + '</abbr>';
    }
    if (options.aside) {
      valueHtml += '<span class="result-aside">' + esc(options.aside) + '</span>';
    }
    return '<div class="result"><dt>' + esc(label) + '</dt><dd>' + valueHtml + '</dd></div>';
  }

  function renderResults(build, job, weapon, level) {
    var stats = build.stats;
    var critChance = rf.criticalChance(stats, level);
    var noApData = $.isEmptyObject(rf.attackPowerCoefficients(weapon));

    var items = [
      resultItem('Attack Power', fmt(rf.attackPower(stats, weapon)), {
        aside: noApData ? 'no confirmed data for ' + weapon.name : null
      }),
      resultItem('Max HP', fmt(rf.maxHp(job, level, stats.STR)), { provisional: PROVISIONAL.hp }),
      resultItem('Max MP', fmt(rf.maxMp(job, level, stats.INT)), { provisional: PROVISIONAL.mp }),
      resultItem('Physical Defence', fmt(rf.defence(stats))),
      resultItem('Magic Defence', fmt(rf.resistance(stats))),
      resultItem('Accuracy', fmt(rf.hit(stats))),
      resultItem('Dodge', fmt(rf.avoid(stats))),
      resultItem('Critical Rating', fmt(rf.critical(stats))),
      resultItem('Critical Chance', critChance.toFixed(1), {
        unit: '%',
        aside: 'against a target with no Critical Defence'
      }),
      resultItem('Critical Defence', rf.criticalDefense(stats).toFixed(1)),
      resultItem('DoT damage', rf.dotDamage(stats).toFixed(1), { provisional: PROVISIONAL.dot })
    ];
    $('#results').html(items.join(''));
  }

  function renderScores(build, goals) {
    var multiple = goals.length > 1;
    $('#tradeoffSection').prop('hidden', !multiple);
    if (!multiple) return;

    var rows = $.map(build.goalScores, function (score) {
      if (score.fraction === null) {
        return '<li class="score">' +
          '<span class="score-name">' + esc(score.name) + '</span>' +
          '<span class="score-none">no confirmed data for this weapon</span>' +
          '</li>';
      }
      return '<li class="score">' +
        '<span>' +
          '<span class="score-name">' + esc(score.name) + '</span>' +
          '<span class="score-track">' +
            '<span class="score-fill" style="width:' + (score.fraction * 100).toFixed(2) + '%"></span>' +
          '</span>' +
        '</span>' +
        '<span class="score-of">' + fmt(Math.round(score.achieved)) +
          ' of ' + fmt(Math.round(score.max)) + '</span>' +
        '<span class="score-pct">' + Math.round(score.fraction * 100) + '%</span>' +
        '</li>';
    });
    $('#scores').html(rows.join(''));
  }

  function renderWorth(build, goals, weapon) {
    $('#worthTitle').text(goals.length > 1
      ? 'How much each point is worth, per goal'
      : 'How much each point is worth');

    var used = {};
    var blocks = $.map(goals, function (goal) {
      var coefficients = rf.objectiveCoefficients(goal.name, weapon);
      var ranked = [];
      $.each(coefficients, function (stat, coefficient) {
        if (coefficient > 0) {
          ranked.push({ stat: stat, coefficient: coefficient });
          used[stat] = true;
        }
      });
      ranked.sort(function (a, b) { return b.coefficient - a.coefficient; });

      var body;
      if (!ranked.length) {
        body = '<p class="worth-ignored">' + esc(weapon.name) + ' is not in the forum’s table, ' +
          'so there are no Attack Power coefficients for it — this goal cannot be optimised.</p>';
      } else {
        body = '<ul class="worth-list">' + $.map(ranked, function (entry) {
          return '<li class="worth-item">' +
            '<span class="worth-stat">' + entry.stat + '</span>' +
            '<span class="worth-value">+' + entry.coefficient.toFixed(2) + ' per point</span>' +
            '</li>';
        }).join('') + '</ul>';
      }

      return '<div class="worth-goal">' +
        (goals.length > 1 ? '<h4 class="worth-goal-name">' + esc(goal.name) + '</h4>' : '') +
        body + '</div>';
    });

    var ignored = $.grep(STAT_ORDER, function (stat) { return !used[stat]; });
    var html = blocks.join('');
    if (ignored.length) {
      html += '<p class="worth-ignored">Does nothing for ' +
        (goals.length > 1 ? 'any of these goals' : 'this goal') + ': ' + ignored.join(', ') + '.</p>';
    }
    $('#worth').html(html);
  }

  function renderNotes(build, goals, weapon, level, cap, requirement) {
    var notes = [];
    var goalLabel = $.map(goals, function (goal) { return goal.name; }).join(' + ');
    function chose(name) {
      return $.grep(goals, function (goal) { return goal.name === name; }).length > 0;
    }

    // The weapon requirement comes first: if it was not met, nothing else on
    // the page describes a build this character could actually equip.
    if (requirement) {
      var stat = requirement.stat;
      var needed = requirement.needed;

      if (needed > rf.statCeiling(stat, cap)) {
        notes.push({
          warn: true,
          text: 'The weapon needs ' + fmt(needed) + ' ' + stat + ', and base points can only reach ' +
            fmt(rf.statCeiling(stat, cap)) + ' — ' + fmt(rf.BASE_STATS[stat]) + ' at creation plus the ' +
            fmt(cap) + ' points you can put in. On the live server a class passive or gear would have to ' +
            'cover the difference, and this calculator models neither.'
        });
      } else if (requirement.reached < needed) {
        notes.push({
          warn: true,
          text: 'This build cannot equip the weapon. It needs ' + fmt(needed) + ' ' + stat +
            ' and only reaches ' + fmt(requirement.reached) + ': the budget of ' + fmt(build.budget) +
            ' runs out first. Everything below describes a weapon this character cannot hold.'
        });
      } else if (requirement.unrestricted >= needed) {
        notes.push({
          text: 'The ' + fmt(needed) + ' ' + stat + ' the weapon needs costs this build nothing — ' +
            goalLabel + ' buys ' + stat + ' up to ' + fmt(requirement.unrestricted) +
            ' on its own merits anyway.'
        });
      } else {
        notes.push({
          text: 'Meeting the requirement raised ' + stat + ' from the ' + fmt(requirement.unrestricted) +
            ' this goal would have chosen to the ' + fmt(needed) + ' the weapon needs, which costs ' +
            fmt(rf.costBetween(requirement.unrestricted, needed)) + ' points. Those went to being able ' +
            'to hold the weapon rather than to ' + goalLabel + '.'
        });
      }
    }

    if (build.leftover > 0) {
      notes.push({
        warn: true,
        text: fmt(build.leftover) + ' stat ' + (build.leftover === 1 ? 'point' : 'points') +
          ' cannot be spent: every stat that helps this goal has taken all ' + fmt(cap) +
          ' points it can hold, or costs more than what is left.'
      });
    }

    var critCapSen = rf.criticalRatingForChanceCap(level);
    if (build.stats.SEN >= critCapSen) {
      notes.push({
        warn: true,
        text: 'Critical Chance has plateaued. Past ' + fmt(critCapSen) + ' SEN at level ' + level +
          ' — this build has ' + fmt(build.stats.SEN) + ' — more SEN keeps raising Critical Rating ' +
          'but stops raising the chance to crit an undefended target, which caps at 50%. Extra SEN ' +
          'only still helps against a target that has Critical Defence, which this does not model.'
      });
    }

    if (weapon.kind === 'crossbow' && chose('Attack Power')) {
      notes.push({ warn: true, text: rf.CROSSBOW_DISPUTE_NOTE });
    }

    if (chose('DoT Damage')) {
      notes.push({
        warn: true,
        text: 'DoT Damage rests on the coefficients from your own testing — 1.0 per CHA and 0.6 per ' +
          'CON — and nothing else. Nobody has posted a number for them.'
      });
    }

    if (chose('Heal Power')) {
      notes.push({ warn: true, text: rf.HEAL_POWER_NOTE });
    }

    if (goals.length > 1) {
      notes.push({
        text: 'Goals are balanced by how close each gets to its own solo maximum, not by adding their ' +
          'raw numbers together — those run from 0.5 per point to 5.5 per point, so a raw sum would ' +
          'just hand the build to whichever goal has the biggest coefficients.'
      });
    }

    notes.push({
      text: 'Every build starts from STR 15, DEX 15, INT 15, CON 15, CHA 10, SEN 10. Those creation ' +
        'values come from an older server’s database schema, not from anything confirmed here. The cap ' +
        'of ' + fmt(cap) + ' limits the points you add on top, so STR, DEX, INT and CON top out at ' +
        fmt(rf.statCeiling('STR', cap)) + ' while CHA and SEN reach ' + fmt(rf.statCeiling('CHA', cap)) + '.'
    });

    notes.push({
      text: 'Raising a stat by one point costs its current value divided by five, rounded down, so the ' +
        '400th point in a stat costs 80 and the 15th costs 3. ' +
        'That formula comes from classic server code, but the total it produces ' +
        'at level 130 — ' + fmt(rf.totalStatPoints(130)) + ' — matches what a player reported on the ' +
        'official forum exactly.'
    });

    $('#notes').html($.map(notes, function (note) {
      return '<li class="note' + (note.warn ? ' note-warn' : '') + '">' + esc(note.text) + '</li>';
    }).join(''));
  }

  function announce(build, goalLabel, job, weapon, level) {
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = setTimeout(function () {
      var spread = $.map(STAT_ORDER, function (stat) {
        return stat + ' ' + build.stats[stat];
      }).join(', ');
      $announcer.text(
        'Level ' + level + ' ' + job.name + ' with a ' + weapon.name +
        ', building for ' + goalLabel + '. ' + spread + '. ' +
        fmt(build.spent) + ' of ' + fmt(build.budget) + ' stat points allocated.'
      );
    }, 600);
  }

  // --------------------------------------------------------------------
  // The recalculation everything hangs off
  // --------------------------------------------------------------------

  function recalculate() {
    var level = readNumber($level, 1, rf.MAX_LEVEL, DEFAULTS.level);
    var cap = readNumber($cap, 50, 500, DEFAULTS.cap);
    var job = rf.JOBS_BY_NAME[$job.val()];
    var weapon = rf.WEAPONS_BY_NAME[$weapon.val()];

    var chosen = readGoals();
    syncGoalLimit(chosen);
    var goals = $.map(chosen, function (name) { return rf.OBJECTIVES_BY_NAME[name]; });
    var goalLabel = chosen.join(' + ');

    $('#sheetObjective').text(chosen.length ? goalLabel : 'Nothing picked yet');
    $('#sheetCharacter').text('Level ' + level + ' ' + job.name + ' with ' +
      (weapon.kind === 'none' ? 'no weapon' : 'a ' + weapon.name));
    $('#sheetEmpty').prop('hidden', chosen.length > 0);
    $('#sheetBody').prop('hidden', chosen.length === 0);

    var earned = rf.totalStatPoints(level);
    if ($budgetAuto.is(':checked')) $budget.val(earned);

    syncRequirementControl(weapon);

    if (!chosen.length) {
      $announcer.text('No goal picked. Choose one to see a build.');
      return;
    }

    var budget = readNumber($budget, 0, 200000, earned);
    var floors = readRequirement(weapon);

    var params = {
      goalNames: chosen,
      weapon: weapon,
      level: level,
      budget: budget,
      cap: cap
    };
    var solved = rf.solveGoals($.extend({ floors: floors }, params));
    var build = solved.build;

    // Solving again without the requirement says whether it changed anything:
    // a build that already wants that stat pays nothing for it. The extra
    // solve is a few milliseconds, cheap enough to do on every keystroke.
    var requirement = null;
    if (floors) {
      var reqStat = Object.keys(floors)[0];
      requirement = {
        stat: reqStat,
        needed: floors[reqStat],
        reached: build.stats[reqStat],
        unrestricted: rf.solveGoals(params).build.stats[reqStat]
      };
    }

    renderLedger(build, level, earned);
    drawHexagon(build.stats, cap);
    renderAllocation(build, cap, requirement);
    renderResults(build, job, weapon, level);
    renderScores(build, goals);
    renderWorth(build, goals, weapon);
    renderNotes(build, goals, weapon, level, cap, requirement);
    announce(build, goalLabel, job, weapon, level);
  }

  function syncSliderFill() {
    var min = 1, max = rf.MAX_LEVEL;
    var value = readNumber($levelSlider, min, max, DEFAULTS.level);
    $levelSlider.css('--fill', ((value - min) / (max - min) * 100) + '%');
  }

  // --------------------------------------------------------------------

  $(function () {
    $level = $('#level');
    $levelSlider = $('#levelSlider');
    $goals = $('#goals');
    $goalsNote = $('#goalsNote');
    $job = $('#job');
    $weapon = $('#weapon');
    $cap = $('#cap');
    $budget = $('#budget');
    $budgetAuto = $('#budgetAuto');
    $reqValue = $('#reqValue');
    $reqStatLabel = $('#reqStatLabel');
    $reqNote = $('#reqNote');
    $announcer = $('#announcer');

    buildControls();
    applyDefaults();
    drawHexagonFrame();

    $levelSlider.on('input', function () {
      $level.val($(this).val());
      syncSliderFill();
      recalculate();
    });

    $level.on('input change', function () {
      var value = readNumber($level, 1, rf.MAX_LEVEL, DEFAULTS.level);
      $levelSlider.val(value);
      syncSliderFill();
      recalculate();
    });

    $job.on('change', recalculate);
    $goals.on('change', '.goal-check', recalculate);

    $weapon.on('change', function () {
      // The requirement belongs to the weapon. An amount typed for the last
      // one would otherwise carry over silently onto a different stat.
      $reqValue.val(0);
      recalculate();
    });

    $reqValue.on('input change', recalculate);
    $reqValue.on('blur', function () { $(this).val(readNumber($reqValue, 0, 500, 0)); });

    $cap.on('input change', recalculate);
    $budget.on('input change', recalculate);

    $budgetAuto.on('change', function () {
      $budget.prop('disabled', $(this).is(':checked'));
      recalculate();
    });

    $('#reset').on('click', function () {
      applyDefaults();
      $budget.prop('disabled', true);
      syncSliderFill();
      recalculate();
    });

    // Blank or out-of-range boxes are tolerated while typing; put the value
    // the calculation actually used back on the way out.
    $level.on('blur', function () { $(this).val(readNumber($level, 1, rf.MAX_LEVEL, DEFAULTS.level)); });
    $cap.on('blur', function () { $(this).val(readNumber($cap, 50, 500, DEFAULTS.cap)); });

    syncSliderFill();
    recalculate();
  });

}(jQuery, RoseFormulas));
