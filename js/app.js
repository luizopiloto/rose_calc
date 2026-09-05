/* ROSE Online base status optimizer -- interface.
 *
 * All the arithmetic lives in rose-formulas.js. This file only wires the
 * controls to it and renders the result, the same division the original
 * PySide6 app kept between rose_formulas.py and main_form.py.
 *
 * Recalculation is synchronous on every input change: a full solve is a
 * few milliseconds even for the objective that binary-searches, so there
 * is no debounce and no "calculate" button to press.
 */

(function ($, rf) {
  'use strict';

  var STAT_ORDER = rf.STATS;

  var DEFAULTS = {
    level: rf.MAX_LEVEL,
    objective: 'Attack Power',
    job: 'Artisan',
    weapon: 'Gun',
    cap: rf.DEFAULT_STAT_CAP,
    budgetAuto: true,
    reqStat: '',
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

  var $level, $levelSlider, $objective, $job, $weapon, $cap, $budget,
      $budgetAuto, $reqStat, $reqValue, $announcer;

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
    fillSelect($objective, $.map(rf.OBJECTIVES, function (o) { return o.name; }));
    fillSelect($job, $.map(rf.JOBS, function (j) { return j.name; }));
    fillSelect($weapon, $.map(rf.WEAPONS, function (w) { return w.name; }));

    $reqStat.empty().append($('<option>').attr('value', '').text('Nothing'));
    $.each(STAT_ORDER, function (_, stat) {
      $reqStat.append($('<option>').attr('value', stat).text(stat));
    });

    $level.attr({ min: 1, max: rf.MAX_LEVEL });
    $levelSlider.attr({ min: 1, max: rf.MAX_LEVEL });
    $cap.attr({ min: 50, max: 500 });
  }

  function applyDefaults() {
    $level.val(DEFAULTS.level);
    $levelSlider.val(DEFAULTS.level);
    $objective.val(DEFAULTS.objective);
    $job.val(DEFAULTS.job);
    $weapon.val(DEFAULTS.weapon);
    $cap.val(DEFAULTS.cap);
    $budgetAuto.prop('checked', DEFAULTS.budgetAuto);
    $reqStat.val(DEFAULTS.reqStat);
    $reqValue.val(DEFAULTS.reqValue);
  }

  /* The weapon's stat requirement, as a {stat: minimum} map for the solver,
   * or null when no requirement is set. */
  function readRequirement() {
    var stat = $reqStat.val();
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
      var tip = vertex(index, Math.min(1, stats[stat] / cap));
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
      return Math.min(1, stats[stat] / cap);
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
      var capped = final >= cap;

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

  function renderWorth(build, coefficients, objective, weapon) {
    var info = build.apPriorityInfo;

    if (info) {
      $('#worthTitle').text('What it costs to chase criticals');
      var html;
      if (info.apMax > 0) {
        var kept = info.apAchieved / info.apMax;
        html = '<div class="priority">' +
          '<p class="priority-headline">Attack Power reaches <strong>' + fmt(info.apAchieved) + '</strong>, ' +
            'against the <strong>' + fmt(info.apMax) + '</strong> this budget could manage on Attack Power alone.</p>' +
          '<div class="priority-bar"><span class="priority-bar-fill" style="width:' +
            (kept * 100).toFixed(2) + '%"></span></div>' +
          '<p class="priority-detail">That is ' + (kept * 100).toFixed(1) + '% of the pure Attack Power ' +
            'maximum. The optimizer buys as much SEN as it can while holding Attack Power at or above ' +
            Math.round(info.minApFraction * 100) + '%, rather than trading the two off at a fixed rate.</p>' +
          '</div>';
      } else {
        html = '<div class="priority">' +
          '<p class="priority-headline">No Attack Power to protect.</p>' +
          '<p class="priority-detail">' + esc(weapon.name) + ' has no confirmed Attack Power ' +
            'coefficients, so this goal falls back to maximising Critical Rating outright.</p>' +
          '</div>';
      }
      $('#worth').html(html);
      return;
    }

    $('#worthTitle').text('How much each point is worth');

    var ranked = [];
    $.each(coefficients, function (stat, coefficient) {
      if (coefficient > 0) ranked.push({ stat: stat, coefficient: coefficient });
    });
    ranked.sort(function (a, b) { return b.coefficient - a.coefficient; });

    if (!ranked.length) {
      $('#worth').html('<p class="worth-ignored">' + esc(weapon.name) +
        ' is not in the forum’s table, so there are no Attack Power coefficients for it. ' +
        'Nothing here can be optimised.</p>');
      return;
    }

    var chips = $.map(ranked, function (entry) {
      return '<li class="worth-item">' +
        '<span class="worth-stat">' + entry.stat + '</span>' +
        '<span class="worth-value">+' + entry.coefficient.toFixed(2) + ' per point</span>' +
        '</li>';
    });

    var ignored = $.grep(STAT_ORDER, function (stat) {
      return !(coefficients[stat] > 0);
    });

    var html = '<ul class="worth-list">' + chips.join('') + '</ul>';
    if (ignored.length) {
      html += '<p class="worth-ignored">Does nothing for this goal: ' + ignored.join(', ') + '.</p>';
    }
    $('#worth').html(html);
  }

  function renderNotes(build, objective, weapon, level, cap, requirement) {
    var notes = [];

    // The weapon requirement comes first: if it was not met, nothing else on
    // the page describes a build this character could actually equip.
    if (requirement) {
      var stat = requirement.stat;
      var needed = requirement.needed;

      if (needed > cap) {
        notes.push({
          warn: true,
          text: 'The weapon needs ' + fmt(needed) + ' ' + stat + ', above the stat cap of ' + fmt(cap) +
            '. Base points alone cannot get there — on the live server a class passive or gear would ' +
            'have to cover the difference, and this calculator models neither.'
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
            objective.name + ' buys ' + stat + ' up to ' + fmt(requirement.unrestricted) +
            ' on its own merits anyway.'
        });
      } else {
        notes.push({
          text: 'Meeting the requirement raised ' + stat + ' from the ' + fmt(requirement.unrestricted) +
            ' this goal would have chosen to the ' + fmt(needed) + ' the weapon needs, which costs ' +
            fmt(rf.costBetween(requirement.unrestricted, needed)) + ' points. Those went to being able ' +
            'to hold the weapon rather than to ' + objective.name + '.'
        });
      }
    }

    if (build.leftover > 0) {
      notes.push({
        warn: true,
        text: fmt(build.leftover) + ' stat ' + (build.leftover === 1 ? 'point' : 'points') +
          ' cannot be spent: every stat that helps this goal is either at the cap of ' +
          fmt(cap) + ' or costs more than what is left.'
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

    if (weapon.kind === 'crossbow' && objective.needsWeapon) {
      notes.push({ warn: true, text: rf.CROSSBOW_DISPUTE_NOTE });
    }

    if (objective.name.indexOf('DoT') !== -1) {
      notes.push({
        warn: true,
        text: 'This goal rests on the DoT coefficients — 1.0 per CHA and 0.6 per CON — which come ' +
          'from your own testing and nothing else. Nobody has posted a number for them.'
      });
    }

    notes.push({
      text: 'Every build starts from STR 15, DEX 15, INT 15, CON 15, CHA 10, SEN 10. Those creation ' +
        'values come from an older server’s database schema, not from anything confirmed here.'
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

  function announce(build, objective, job, weapon, level) {
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = setTimeout(function () {
      var spread = $.map(STAT_ORDER, function (stat) {
        return stat + ' ' + build.stats[stat];
      }).join(', ');
      $announcer.text(
        'Level ' + level + ' ' + job.name + ' with a ' + weapon.name +
        ', building for ' + objective.name + '. ' + spread + '. ' +
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
    var objective = rf.OBJECTIVES_BY_NAME[$objective.val()];

    var earned = rf.totalStatPoints(level);
    if ($budgetAuto.is(':checked')) $budget.val(earned);
    var budget = readNumber($budget, 0, 200000, earned);
    var floors = readRequirement();

    var params = {
      objectiveName: objective.name,
      weapon: weapon,
      level: level,
      budget: budget,
      cap: cap
    };
    var solved = rf.solve($.extend({ floors: floors }, params));
    var build = solved.build;

    // Solving again without the requirement says whether it changed anything:
    // a goal that already wants that stat pays nothing for it. A second solve
    // is a couple of milliseconds, cheap enough to do on every keystroke.
    var requirement = null;
    if (floors) {
      var reqStat = Object.keys(floors)[0];
      requirement = {
        stat: reqStat,
        needed: floors[reqStat],
        reached: build.stats[reqStat],
        unrestricted: rf.solve(params).build.stats[reqStat]
      };
    }

    $('#sheetObjective').text(objective.name);
    $('#sheetCharacter').text('Level ' + level + ' ' + job.name + ' with ' +
      (weapon.kind === 'none' ? 'no weapon' : 'a ' + weapon.name));
    $('#objectiveNote').text(objective.note);

    renderLedger(build, level, earned);
    drawHexagon(build.stats, cap);
    renderAllocation(build, cap, requirement);
    renderResults(build, job, weapon, level);
    renderWorth(build, solved.coefficients, objective, weapon);
    renderNotes(build, objective, weapon, level, cap, requirement);
    announce(build, objective, job, weapon, level);
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
    $objective = $('#objective');
    $job = $('#job');
    $weapon = $('#weapon');
    $cap = $('#cap');
    $budget = $('#budget');
    $budgetAuto = $('#budgetAuto');
    $reqStat = $('#reqStat');
    $reqValue = $('#reqValue');
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

    $objective.add($job).add($weapon).on('change', recalculate);

    $reqStat.on('change', function () {
      var none = !$(this).val();
      $reqValue.prop('disabled', none);
      if (none) $reqValue.val(0);
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
      $reqValue.prop('disabled', true);
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
