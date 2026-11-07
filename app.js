/* Pool tracker: page rendering. Data comes only from data/tests.json and (optional) data/ranges.json. Loaded as app.js?v=<hash> (tools/version-assets.sh). */
(function () {
  'use strict';
  var C = window.PoolCalc;
  var MEAS = C.MEAS;
  var VS = '︎'; // text presentation (no emoji glyphs)
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var state = { tests: [], savedRanges: null, ranges: C.mergeRanges(null), loaded: false };

  // ---------- helpers ----------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); });
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function dShort(iso) { var p = iso.split('-').map(Number); return MONTHS[p[1] - 1] + ' ' + p[2]; }
  function dLong(iso) { return dShort(iso) + ', ' + iso.slice(0, 4); }
  function tFmt(hm) {
    if (!hm) return null;
    var p = hm.split(':').map(Number), h = p[0] % 12 || 12;
    return h + ':' + String(p[1]).padStart(2, '0') + (p[0] < 12 ? ' AM' : ' PM');
  }
  function todayNum() {
    var d = new Date();
    return C.dayNum(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  function addDays(iso, n) {
    var p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function numStr(v) { return String(v).replace('-', '−'); }

  var ICON = { ok: '✓' + VS, warn: '!', bad: '!!', na: '–' };
  function word(s) {
    if (s.level === 'ok') return 'OK';
    if (s.level === 'na') return '';
    return s.dir === 'low' ? 'Low' : 'High';
  }
  function statusNode(s) {
    return el('span', { class: 'st st-' + s.level }, [el('span', { class: 'ico', 'aria-hidden': 'true', text: ICON[s.level] }), word(s)]);
  }
  function rangeText(m) {
    var r = state.ranges;
    if (m.k === 'tc') return '≤ FC + ' + numStr(r.cc.hi) + ' ppm';
    if (m.norange || !r[m.k]) return 'n/a';
    var sep = r[m.k].lo < 0 ? ' to ' : '–';
    return numStr(r[m.k].lo) + sep + numStr(r[m.k].hi) + (m.unit ? ' ' + m.unit : '');
  }
  function deltaText(d, m) {
    if (d === null) return '—';
    if (Math.abs(d) < 1e-9) return '0';
    return (d > 0 ? '▲' : '▼') + VS + ' ' + C.fmt(Math.abs(d), m.dp);
  }
  function nameNode(m) {
    return el('span', { class: 'tname' }, [el('span', { class: 'full', text: m.name }), el('span', { class: 'abbr', text: m.short })]);
  }
  // Status shape: circle = in range / no range, diamond = slightly out, square = well out.
  function shape(level, cx, cy, z) {
    z = z || { r: 4.5, d: 6, s: 9 };
    var c = 'pt pt-' + level, d = z.d, h = z.s / 2;
    if (level === 'warn') return sv('polygon', { class: c, points: [[cx, cy - d], [cx + d, cy], [cx, cy + d], [cx - d, cy]].map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ') });
    if (level === 'bad') return sv('rect', { class: c, x: (cx - h).toFixed(2), y: (cy - h).toFixed(2), width: z.s, height: z.s });
    return sv('circle', { class: c, cx: cx, cy: cy, r: z.r });
  }
  function hasAny(k) { return state.tests.some(function (t) { return C.value(t, k) !== null; }); }

  // ---------- render ----------
  function renderAll() {
    var tests = state.tests;
    var latest = tests[tests.length - 1] || null, prev = tests[tests.length - 2] || null;
    renderLegend();
    renderStats(latest, prev);
    renderLatest(latest, prev);
    renderRec(latest);
    renderCharts();
    renderHistory();
    var n = $('notice');
    if (!state.loaded) return;
    if (!tests.length) { n.hidden = false; n.textContent = 'No tests recorded yet.'; } else n.hidden = true;
  }

  function renderLegend() {
    var L = $('legend'); clear(L);
    ['ok', 'warn', 'bad'].forEach(function (lv, i) {
      if (i) L.appendChild(document.createTextNode(' · '));
      L.appendChild(el('span', { class: 'st st-' + lv, 'aria-hidden': 'true', text: ICON[lv] }));
      L.appendChild(document.createTextNode('\u00a0' + ['in range', 'slightly out', 'well out'][i]));
    });
  }

  function stat(k, v, x, vClass) {
    return el('div', { class: 'stat' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v' + (vClass ? ' ' + vClass : ''), text: v }), el('div', { class: 'x', text: x || ' ' })]);
  }

  function renderStats(latest, prev) {
    var S = $('stats'); clear(S);
    if (!latest) {
      ['Latest test', 'Since last test', 'Next test due', 'Score', 'Out of range', 'Tests'].forEach(function (k) { S.appendChild(stat(k, '—', '')); });
      return;
    }
    var since = todayNum() - C.dayNum(latest.date);
    var next = latest.nextTest || addDays(latest.date, 7);
    var dueIn = C.dayNum(next) - todayNum();
    var dueTxt = dueIn > 0 ? 'in ' + dueIn + ' d' : dueIn === 0 ? 'today' : 'overdue ' + (-dueIn) + ' d';
    var sc = typeof latest.score === 'number' ? latest.score : null;
    var psc = prev && typeof prev.score === 'number' ? prev.score : null;
    var scX = sc !== null && psc !== null ? deltaText(sc - psc, { dp: 0 }) + ' pts vs ' + dShort(prev.date) : (latest.source || '');
    var oc = C.outCount(latest, state.ranges);
    var ocCell = stat('Out of range', String(oc.n), 'of ' + oc.of + ' tested');
    S.appendChild(stat('Latest test', dShort(latest.date), tFmt(latest.time) || latest.date.slice(0, 4)));
    S.appendChild(stat('Since last test', since + ' d', since === 1 ? 'day' : 'days'));
    S.appendChild(stat('Next test due', dShort(next), dueTxt));
    S.appendChild(stat('Score', sc !== null ? sc + '%' : '—', scX));
    S.appendChild(ocCell);
    S.appendChild(stat('Tests', String(state.tests.length), 'since ' + dShort(state.tests[0].date)));
  }

  // Range bar (v2): a zoned gauge, not a linear axis. Fixed fractions of the track:
  // 0-.15 well out low | .15-.30 margin low | .30-.70 ideal | .70-.85 margin high | .85-1 well out high.
  // Margin zones span the margin (or half the range if the margin is 0); well-out zones span twice that.
  var Z = { wl: 0, ml: 0.15, lo: 0.30, hi: 0.70, mh: 0.85, wh: 1 };
  function gaugePos(v, lo, hi, m) {
    if (v < lo) {
      var d = lo - v;
      if (d <= m) return { f: Z.lo - (Z.lo - Z.ml) * d / m };
      if (d <= 3 * m) return { f: Z.ml - (Z.ml - Z.wl) * (d - m) / (2 * m) };
      return { f: 0, pin: 'lo' };
    }
    if (v > hi) {
      var u = v - hi;
      if (u <= m) return { f: Z.hi + (Z.mh - Z.hi) * u / m };
      if (u <= 3 * m) return { f: Z.mh + (Z.wh - Z.mh) * (u - m) / (2 * m) };
      return { f: 1, pin: 'hi' };
    }
    return { f: Z.lo + (Z.hi - Z.lo) * (hi > lo ? (v - lo) / (hi - lo) : 0.5) };
  }
  function barInfo(t, m) {
    var r = state.ranges;
    if (m.k === 'temp') return { note: 'no ideal range' };
    var v = C.value(t, m.k);
    if (v === null) return { note: m.k === 'lsi' ? 'needs water temp' : 'not tested' };
    var s = C.status(t, m.k, r), lo, hi, mg, loL, hiL, dist = null;
    if (m.k === 'tc') {
      var fc = C.value(t, 'fc'), cc = C.value(t, 'cc');
      lo = fc; hi = fc + r.cc.hi; mg = r.cc.s;
      loL = C.fmt(lo, m.dp); hiL = C.fmt(hi, m.dp);
      if (s.dir === 'high') dist = cc - r.cc.hi; else if (s.dir === 'low') dist = r.cc.lo - cc;
    } else {
      var rr = r[m.k];
      lo = rr.lo; hi = rr.hi; mg = rr.s;
      loL = numStr(lo); hiL = (m.k === 'lsi' && hi > 0 ? '+' : '') + numStr(hi);
      if (s.dir === 'high') dist = v - hi; else if (s.dir === 'low') dist = lo - v;
    }
    if (!(mg > 0)) mg = (hi - lo) / 2;
    var g = gaugePos(v, lo, hi, mg);
    return { v: v, s: s, f: g.f, pin: g.pin || null, loL: loL, hiL: hiL,
      distN: dist === null ? null : C.fmt(Math.round(dist * 1e6) / 1e6, m.dp),
      dist: dist === null ? null : C.fmt(Math.round(dist * 1e6) / 1e6, m.dp) + (s.dir === 'high' ? ' high' : ' low') };
  }
  // ---------- Latest results v4: action-first ----------
  var LNAME = { fc: ['Free chlorine', 'FC'], tc: ['Total chlorine', 'TC'], cc: ['Combined chlorine', 'CC'], ph: ['pH', null],
    ta: ['Total alkalinity', 'TA'], ch: ['Calcium hardness', 'CH'], cya: ['Cyanuric acid', 'CYA'], lsi: ['Saturation index', 'LSI'],
    fe: ['Iron', 'Fe'], cu: ['Copper', 'Cu'], po4: ['Phosphates', 'PO₄'], salt: ['Salt', null], temp: ['Water temperature', null] };
  var ORDER = ['fc', 'cc', 'ph', 'ta', 'ch', 'cya', 'lsi', 'fe', 'cu', 'po4', 'salt'];
  var MBY = {}; MEAS.forEach(function (m) { MBY[m.k] = m; });
  var MINI = { r: 4.5, d: 6, s: 8 };

  function nameEl(cls, k) {
    var nm = LNAME[k], e = el('span', { class: cls }, [nm[0]]);
    if (nm[1]) e.appendChild(el('span', { class: 'ab', text: ' (' + nm[1] + ')' }));
    return e;
  }
  function readingEl(cls, t, m) {
    var e = el('span', { class: cls }, [C.show(t, m)]);
    if (m.unit) e.appendChild(el('span', { class: 'u', text: m.unit }));
    return e;
  }
  function actionText(t, m, s) {
    var r = state.ranges;
    if (m.k === 'cc') return s.dir === 'high' ? 'Lower to ≤ ' + numStr(r.cc.hi) : 'Retest: TC below FC';
    var rr = r[m.k], range = m.k === 'lsi' ? numStr(rr.lo) + ' to ' + (rr.hi > 0 ? '+' : '') + numStr(rr.hi) : numStr(rr.lo) + '–' + numStr(rr.hi);
    return (s.dir === 'low' ? 'Raise to ' : 'Lower to ') + range;
  }
  function miniGauge(t, m) {
    var info = barInfo(t, m);
    var g = sv('svg', { class: 'mg', viewBox: '0 0 96 14', width: 96, height: 14, 'aria-hidden': 'true' });
    var x0 = 6, tw = 84, X = function (f) { return x0 + f * tw; };
    g.appendChild(sv('rect', { class: 'track', x: x0, y: 4, width: tw, height: 6, rx: 3 }));
    g.appendChild(sv('rect', { class: 'band', x: X(Z.lo).toFixed(2), y: 4, width: (X(Z.hi) - X(Z.lo)).toFixed(2), height: 6 }));
    g.appendChild(shape(info.s.level, X(info.f), 7, MINI));
    return g;
  }
  function fixArea(t, k, id) {
    var area = el('div', { class: 'fix', id: id, hidden: '' });
    var steps = (t.plan && t.plan.steps) || [], step = null;
    steps.forEach(function (s) { if (s.key === k) step = s; });
    if (step) {
      area.appendChild(el('p', { class: 'fx-h', text: 'Step ' + step.n + ' of ' + steps.length + ' · from ' + dShort(t.date) + ' test' }));
      area.appendChild(stepBody(step));
      var link = el('button', { type: 'button', class: 'fx-link', text: 'See full plan' });
      link.addEventListener('click', function () {
        var hd = $('h-rec'); $('rec-panel').scrollIntoView({ block: 'start' }); hd.focus({ preventScroll: true });
      });
      area.appendChild(link);
    } else {
      area.appendChild(el('p', { class: 'fx-msg', text: (k === 'fe' || k === 'cu') ? 'No store step for this. Metal treatments are left out on purpose.' : 'No store step for this in the latest plan.' }));
    }
    return area;
  }
  function needRow(t, prev, m, s) {
    var id = 'fix-' + m.k;
    var row = el('button', { type: 'button', class: 'nr', 'aria-expanded': 'false', 'aria-controls': id });
    row.appendChild(nameEl('nn', m.k));
    row.appendChild(readingEl('nv', t, m));
    row.appendChild(el('span', { class: 'na st-' + s.level }, [el('span', { class: 'mk', 'aria-hidden': 'true', text: ICON[s.level] }), actionText(t, m, s)]));
    row.appendChild(miniGauge(t, m));
    var hf = el('span', { class: 'hf', text: 'How to fix ▾' + VS });
    row.appendChild(hf);
    var d = C.delta(t, prev, m.k);
    row.appendChild(el('span', { class: 'nc', text: d === null ? '' : (Math.abs(d) < 1e-9 ? '= 0' : deltaText(d, m)) + ' since ' + dShort(prev.date) }));
    var area = fixArea(t, m.k, id);
    row.addEventListener('click', function () {
      var open = row.getAttribute('aria-expanded') !== 'true';
      row.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) area.removeAttribute('hidden'); else area.setAttribute('hidden', '');
      hf.textContent = open ? '▴' + VS + ' Hide steps' : 'How to fix ▾' + VS;
    });
    return [row, area];
  }
  function lineRow(left, right) { return el('div', { class: 'ir' }, [left, right]); }
  function section(title, rows) {
    return el('div', { class: 'sec' }, [el('h3', { class: 'sec-h', text: title })].concat(rows));
  }
  function drawBars() { // mark slot: width of "!!" + 4px, so action words start at one x
    var probe = document.querySelector('#latest .na .mk');
    if (!probe) return;
    var s = el('span', { class: 'na', style: 'position:absolute;visibility:hidden', text: '!!' });
    document.body.appendChild(s);
    $('latest').style.setProperty('--mk', (Math.ceil(s.getBoundingClientRect().width) + 4) + 'px');
    document.body.removeChild(s);
  }

  function renderLatest(latest, prev) {
    var host = $('latest'); clear(host);
    $('latest-when').textContent = latest ? dLong(latest.date) + (latest.time ? ' · ' + tFmt(latest.time) : '') : '';
    if (!latest) return;
    var r = state.ranges, bad = [], warn = [], ok = [];
    ORDER.forEach(function (k) {
      var m = MBY[k]; if (C.value(latest, k) === null) return;
      var s = C.status(latest, k, r);
      (s.level === 'bad' ? bad : s.level === 'warn' ? warn : ok).push([m, s]);
    });
    var need = bad.concat(warn);
    var colA = el('div', { class: 'col-a' }), colB = el('div', { class: 'col-b' });
    colA.appendChild(need.length ? section('Needs attention · ' + need.length, [].concat.apply([], need.map(function (x) { return needRow(latest, prev, x[0], x[1]); })))
      : el('div', { class: 'sec' }, [el('div', { class: 'allok', text: 'Everything in range ✓' + VS })]));
    if (ok.length) colB.appendChild(section('In range · ' + ok.length, ok.map(function (x) {
      var rd = readingEl('iv', latest, x[0]); rd.appendChild(el('span', { class: 'okm', text: ' ✓' + VS }));
      return lineRow(nameEl('in', x[0].k), rd);
    })));
    var info = [lineRow(nameEl('in', 'tc'), C.value(latest, 'tc') === null ? el('span', { class: 'iv dim', text: 'not recorded' }) : readingEl('iv', latest, MBY.tc))];
    if (C.value(latest, 'temp') !== null) info.push(lineRow(nameEl('in', 'temp'), readingEl('iv', latest, MBY.temp)));
    else info.push(lineRow(el('span', { class: 'in', text: 'Water temp and LSI' }), el('span', { class: 'iv dim', text: 'not recorded' })));
    colB.appendChild(section('Info', info));
    host.appendChild(el('div', { class: 'lv4' }, [colA, colB]));
    drawBars();
  }

  // ---------- Treatment plan ----------
  // "**amount**" in plan text renders as a bold, unbreakable amount; everything else is plain text.
  function richText(cls, txt, prefix) {
    var p = el('p', { class: cls });
    if (prefix) p.appendChild(document.createTextNode(prefix));
    String(txt).split('**').forEach(function (part, i) {
      if (!part) return;
      p.appendChild(i % 2 ? el('span', { class: 'amt', text: part }) : document.createTextNode(part));
    });
    return p;
  }
  function stepBody(step) {
    var b = el('div', { class: 'pb' });
    (step.actions || []).forEach(function (x) { b.appendChild(richText('pa', x)); });
    (step.waits || []).forEach(function (x) { b.appendChild(richText('pw', x)); });
    (step.notes || []).forEach(function (x) { b.appendChild(richText('pnote', x, 'Note: ')); });
    return b;
  }
  function markReading(t, k) {
    var m = MBY[k], v = C.value(t, k);
    if (v === null) return el('span', { class: 'pr' }, [el('span', { class: 'rd dim', text: '—' })]);
    var s = C.status(t, k, state.ranges);
    var e = el('span', { class: 'pr' }, [el('span', { class: 'mk2 st-' + s.level, 'aria-hidden': 'true', text: ICON[s.level] })]);
    var rd = el('span', { class: 'rd', text: C.show(t, m) });
    if (m.unit) rd.appendChild(el('span', { class: 'u', text: m.unit }));
    e.appendChild(rd);
    return e;
  }
  function stepRow(step, t, noReading) {
    var kids = [el('span', { class: 'pn', text: String(step.n) }), el('span', { class: 'pt2', text: step.title })];
    if (!noReading) kids.push(markReading(t, step.key));
    return el('div', { class: 'ps' + (noReading ? ' ps-nr' : '') }, kids.concat([stepBody(step)]));
  }
  function weeklyRows(list) {
    return (list || []).map(function (w) {
      var a = el('span', { class: 'wk-a' });
      String(w.amount).split('**').forEach(function (part, i) { if (part) a.appendChild(i % 2 ? el('span', { class: 'amt', text: part }) : document.createTextNode(part)); });
      var row = el('div', { class: 'wk' }, [el('div', { class: 'wk-r' }, [el('span', { class: 'wk-i', text: w.item }), a])]);
      if (w.note) row.appendChild(el('div', { class: 'wk-n', text: w.note }));
      return row;
    });
  }
  // History omits the step's reading: the history row already shows every reading and its status above the plan.
  function planNodes(t, noReading) {
    var out = (t.plan.steps || []).map(function (s) { return stepRow(s, t, noReading); });
    if (t.plan.weekly && t.plan.weekly.length) out = out.concat([el('h3', { class: 'sec-h', text: 'Every week' })], weeklyRows(t.plan.weekly));
    return out;
  }
  function renderRec(latest) {
    var p = $('rec-panel'), host = $('plan');
    clear(host);
    if (!latest || !latest.plan || !(latest.plan.steps || []).length) { p.hidden = true; return; }
    p.hidden = false;
    $('rec-when').textContent = 'from ' + dShort(latest.date) + ' test';
    planNodes(latest).forEach(function (n) { host.appendChild(n); });
  }

  // ---------- charts ----------
  function niceStep(span, n) {
    var raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  function decimalsOf(step) { var s = String(+step.toPrecision(6)); return s.indexOf('.') < 0 ? 0 : s.length - s.indexOf('.') - 1; }

  var tipHideTimer = null;
  function renderCharts() {
    var host = $('charts'); clear(host);
    var tests = state.tests;
    var list = MEAS.filter(function (m) { return !(m.k === 'temp' || m.k === 'lsi') || hasAny(m.k); });
    if (!tests.length) { host.appendChild(el('div', { class: 'chart' }, [el('div', { class: 'empty-chart', text: 'No tests yet.' })])); return; }
    var stamps = tests.map(C.stamp), DAY = 86400000;
    var x0 = Math.min.apply(null, stamps), x1 = Math.max.apply(null, stamps);
    var pad = Math.max((x1 - x0) * 0.06, DAY / 2);
    if (x1 === x0) pad = 3 * DAY;
    x0 -= pad; x1 += pad;
    list.forEach(function (m) {
      var box = el('div', { class: 'chart' });
      var latest = tests[tests.length - 1];
      var s = C.status(latest, m.k, state.ranges);
      box.appendChild(el('div', { class: 'ch' }, [
        el('span', { class: 'cn', text: m.name }),
        el('span', { class: 'cv' }, [C.show(latest, m) + (m.unit && C.value(latest, m.k) !== null ? ' ' + m.unit : '') + '\u2002', m.norange || s.level === 'na' ? null : statusNode(s)])
      ]));
      host.appendChild(box);
      drawChart(box, m, tests, x0, x1);
    });
  }

  function drawChart(box, m, tests, x0, x1) {
    var W = Math.max(240, Math.floor(box.clientWidth - 24)), H = 132;
    var ml = 40, mr = 10, mt = 8, mb = 20, iw = W - ml - mr, ih = H - mt - mb;
    var r = state.ranges;
    var pts = tests.map(function (t) { return { t: t, x: C.stamp(t), v: C.value(t, m.k) }; }).filter(function (p) { return p.v !== null; });
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': m.name + ' trend' });
    box.appendChild(svg);
    var tip = el('div', { class: 'tip', role: 'status' }); box.appendChild(tip);

    // band: constant range, or TC = FC .. FC + CC high per test
    var bandLo = [], bandHi = [];
    if (m.k === 'tc') {
      tests.forEach(function (t) { var fc = C.value(t, 'fc'); if (fc !== null && C.value(t, 'tc') !== null) { bandLo.push([C.stamp(t), fc]); bandHi.push([C.stamp(t), fc + r.cc.hi]); } });
    }
    var rr = m.norange ? null : (m.k === 'tc' ? null : r[m.k]);
    var vals = pts.map(function (p) { return p.v; });
    if (rr) vals.push(rr.lo, rr.hi);
    bandLo.concat(bandHi).forEach(function (b) { vals.push(b[1]); });
    if (!vals.length) { box.removeChild(svg); box.appendChild(el('div', { class: 'empty-chart', text: 'No readings yet.' })); return; }
    var y0 = Math.min.apply(null, vals), y1 = Math.max.apply(null, vals);
    if (y1 - y0 < 1e-9) { var e = Math.abs(y0) * 0.1 || 1; y0 -= e; y1 += e; }
    var step = niceStep(y1 - y0, 3);
    y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step;
    if (m.k !== 'lsi' && y0 < 0 && Math.min.apply(null, vals) >= 0) y0 = 0;
    var X = function (v) { return ml + (v - x0) / (x1 - x0) * iw; };
    var Y = function (v) { return mt + (1 - (v - y0) / (y1 - y0)) * ih; };

    // grid + y labels
    var dp = decimalsOf(step);
    for (var v = y0; v <= y1 + step / 2; v += step) {
      var yy = Y(v);
      svg.appendChild(sv('line', { class: 'grid', x1: ml, x2: ml + iw, y1: yy, y2: yy }));
      svg.appendChild(sv('text', { x: ml - 6, y: yy + 4, 'text-anchor': 'end', text: C.fmt(v, dp) }));
    }
    // band
    if (rr) {
      var top = Y(Math.min(rr.hi, y1)), bot = Y(Math.max(rr.lo, y0));
      if (bot > top) svg.appendChild(sv('rect', { class: 'band', x: ml, y: top, width: iw, height: bot - top }));
    } else if (bandLo.length) {
      var up = bandHi.map(function (b) { return [X(b[0]), Y(b[1])]; });
      var dn = bandLo.map(function (b) { return [X(b[0]), Y(b[1])]; });
      up.unshift([ml, up[0][1]]); up.push([ml + iw, up[up.length - 1][1]]);
      dn.unshift([ml, dn[0][1]]); dn.push([ml + iw, dn[dn.length - 1][1]]);
      var poly = up.concat(dn.reverse()).map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
      svg.appendChild(sv('polygon', { class: 'band', points: poly }));
    }
    // x axis + date ticks (same domain on every chart)
    svg.appendChild(sv('line', { class: 'axis', x1: ml, x2: ml + iw, y1: mt + ih + 0.5, y2: mt + ih + 0.5 }));
    var DAY = 86400000, spanD = (x1 - x0) / DAY, maxT = Math.max(2, Math.floor(iw / 64));
    var steps = [1, 2, 3, 7, 14, 28, 56, 91, 182, 365], sd = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) if (spanD / steps[i] <= maxT) { sd = steps[i]; break; }
    var firstDay = Math.ceil(x0 / DAY);
    for (var d = firstDay; d * DAY <= x1; d++) {
      if ((d - firstDay) % sd) continue;
      var xx = X(d * DAY), dt = new Date(d * DAY);
      svg.appendChild(sv('line', { class: 'axis', x1: xx, x2: xx, y1: mt + ih, y2: mt + ih + 4 }));
      svg.appendChild(sv('text', { x: xx, y: H - 4, 'text-anchor': 'middle', text: MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCDate() }));
    }
    // line + points
    if (pts.length > 1) {
      svg.appendChild(sv('path', { class: 'line', d: pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.v).toFixed(1); }).join(' ') }));
    }
    pts.forEach(function (p) {
      var s = m.norange ? { level: 'na', dir: null } : C.status(p.t, m.k, r);
      var cx = X(p.x), cy = Y(p.v);
      svg.appendChild(shape(s.level, cx, cy));
      var label = dShort(p.t.date) + ' · ' + C.show(p.t, m) + (m.unit ? ' ' + m.unit : '') + (m.norange ? '' : ' · ' + word(s));
      var hit = sv('circle', { class: 'hit', cx: cx, cy: cy, r: 14, tabindex: '0', 'aria-label': m.name + ' ' + label });
      var show = function () {
        clearTimeout(tipHideTimer);
        document.querySelectorAll('.tip').forEach(function (t) { if (t !== tip) t.style.display = 'none'; });
        clear(tip);
        tip.appendChild(el('span', { class: 'dim', text: dShort(p.t.date) + ' ' }));
        tip.appendChild(el('b', { text: C.show(p.t, m) + (m.unit ? ' ' + m.unit : '') }));
        if (!m.norange) { tip.appendChild(document.createTextNode(' ')); tip.appendChild(statusNode(s)); }
        tip.style.display = 'block';
        var bw = box.clientWidth, tw = tip.offsetWidth;
        var scale = svg.getBoundingClientRect().width / W;
        var left = svg.offsetLeft + cx * scale - tw / 2;
        tip.style.left = Math.max(4, Math.min(bw - tw - 4, left)) + 'px';
        var above = svg.offsetTop + cy * scale - tip.offsetHeight - 12;
        tip.style.top = (above >= 4 ? above : svg.offsetTop + cy * scale + 12) + 'px';
      };
      var hide = function () { tip.style.display = 'none'; };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') hide(); });
      hit.addEventListener('focus', show);
      hit.addEventListener('blur', hide);
      hit.addEventListener('click', function (ev) { ev.stopPropagation(); show(); });
      svg.appendChild(hit);
    });
  }
  document.addEventListener('click', function () { document.querySelectorAll('.tip').forEach(function (t) { t.style.display = 'none'; }); });

  // ---------- history ----------
  function renderHistory() {
    var H = $('history'); clear(H);
    var tests = state.tests.slice().reverse();
    $('hist-count').textContent = tests.length ? tests.length + (tests.length === 1 ? ' test' : ' tests') + ', newest first' : '';
    tests.forEach(function (t) {
      var oc = C.outCount(t, state.ranges);
      var row = el('div', { class: 'hist-row' });
      row.appendChild(el('div', { class: 'hist-head' }, [
        el('span', { class: 'd', text: dLong(t.date) + (t.time ? ' · ' + tFmt(t.time) : '') }),
        el('span', { class: 'm', text: (t.source || '') + (typeof t.score === 'number' ? ' · ' + t.score + '%' : '') + ' · ' + oc.n + ' out' })
      ]));
      var g = el('div', { class: 'hist-grid' });
      MEAS.forEach(function (m) {
        if ((m.k === 'temp' || m.k === 'lsi') && C.value(t, m.k) === null) return;
        var s = m.norange ? { level: 'na' } : C.status(t, m.k, state.ranges);
        var out = s.level === 'warn' || s.level === 'bad';
        var v = el('div', { class: 'v' }, [C.show(t, m)]);
        if (out) v.appendChild(el('span', { text: ' ' + ICON[s.level] + ' ' + (s.dir === 'low' ? 'Lo' : 'Hi') }));
        g.appendChild(el('div', { class: 'hc hc-' + (out ? s.level : 'ok') + (out ? ' out' : ''), title: m.name }, [
          el('div', { class: 'k', text: m.short + (m.unit ? ' ' + m.unit : '') }), v
        ]));
      });
      row.appendChild(g);
      if ((t.plan && (t.plan.steps || []).length) || t.notes) {
        var det = el('details', null, [el('summary', { text: 'Treatment plan' })]);
        if (t.plan) planNodes(t, true).forEach(function (n) { det.appendChild(n); });
        if (t.notes) det.appendChild(el('p', { class: 'rec dim', text: 'Notes: ' + t.notes }));
        row.appendChild(det);
      }
      H.appendChild(row);
    });
  }

  // ---------- range editor (read-only; ranges are changed in calc.js DEFAULT_RANGES or data/ranges.json) ----------
  var RKEYS = MEAS.filter(function (m) { return C.DEFAULT_RANGES[m.k]; });
  function renderEditor() {
    var tb = $('ranges').tBodies[0]; clear(tb);
    RKEYS.forEach(function (m) {
      var rr = state.ranges[m.k];
      var cells = ['lo', 'hi', 's'].map(function (f) {
        return el('td', { class: 'inp' }, [el('span', { class: 'num', text: numStr(rr[f]) })]);
      });
      tb.appendChild(el('tr', null, [el('td', null, [nameNode(m), el('span', { class: m.unit ? 'trange' : 'trange trange-none', text: m.unit || '\u00a0' })])].concat(cells)));
    });
  }

  // ---------- resize ----------
  var lastW = window.innerWidth, rt = null;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW) return; lastW = window.innerWidth;
    clearTimeout(rt); rt = setTimeout(renderCharts, 120);
  });

  // Redraw bars whenever the Latest results table changes width (resize, rotation, row 2 shown or hidden at 900px).
  if (typeof ResizeObserver === 'function') {
    var lastTW = -1, rq = 0;
    new ResizeObserver(function (entries) {
      var w = Math.round(entries[0].contentRect.width);
      if (w === lastTW) return; lastTW = w;
      clearTimeout(rq); rq = setTimeout(drawBars, 0);
    }).observe($('latest'));
  } else {
    window.addEventListener('resize', function () { setTimeout(drawBars, 120); });
  }

  // ---------- data (static JSON files) ----------
  renderAll(); renderEditor();
  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  }
  var rangesP = getJSON('data/ranges.json').then(function (x) { return x && x.ranges ? x.ranges : null; }, function () { return null; });
  Promise.all([getJSON('data/tests.json'), rangesP]).then(function (res) {
    var raw = Array.isArray(res[0]) ? res[0] : [], list = [];
    raw.forEach(function (x) {
      if (!x || typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return;
      var t = {}; Object.keys(x).forEach(function (k) { t[k] = x[k]; });
      if (t.time && !/^\d{2}:\d{2}$/.test(t.time)) t.time = null;
      list.push(t);
    });
    state.savedRanges = res[1];
    state.ranges = C.mergeRanges(state.savedRanges);
    state.tests = C.sortTests(list);
    state.loaded = true;
    renderEditor(); renderAll();
  }, function () {
    state.loaded = true;
    var n = $('notice'); n.hidden = false; n.textContent = 'Tests could not be loaded.';
  });
})();
