/* Pool tracker: page rendering. Data comes only from data/tests.json and (optional) data/ranges.json. */
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

  function renderLatest(latest, prev) {
    var tb = $('latest').tBodies[0]; clear(tb);
    $('latest-when').textContent = latest ? dLong(latest.date) + (latest.time ? ' · ' + tFmt(latest.time) : '') + (prev ? ' · change vs ' + dShort(prev.date) : '') : '';
    if (!latest) return;
    MEAS.forEach(function (m) {
      var s = C.status(latest, m.k, state.ranges);
      var tr = el('tr', { class: m.derived ? 'derived' : '' }, [
        el('td', null, [nameNode(m), el('span', { class: 'trange', text: rangeText(m) })]),
        el('td', { class: 'col-range dim', text: rangeText(m) }),
        el('td', { class: 'num', text: C.show(latest, m) }),
        el('td', null, [s.level === 'na' || m.norange ? el('span', { class: 'st st-na', text: '—' }) : statusNode(s)]),
        el('td', { class: 'num', text: deltaText(C.delta(latest, prev, m.k), m) })
      ]);
      tb.appendChild(tr);
    });
  }

  function renderRec(latest) {
    var p = $('rec-panel');
    if (!latest || !latest.recommendations) { p.hidden = true; return; }
    p.hidden = false;
    $('rec').textContent = latest.recommendations;
    $('rec-when').textContent = dLong(latest.date);
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
      svg.appendChild(sv('circle', { class: 'pt pt-' + s.level, cx: cx, cy: cy, r: 4.5 }));
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
      if (t.recommendations || t.notes) {
        var det = el('details', null, [el('summary', { text: 'Recommendations and notes' })]);
        if (t.recommendations) det.appendChild(el('p', { class: 'rec', text: t.recommendations }));
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
      tb.appendChild(el('tr', null, [el('td', null, [nameNode(m), el('span', { class: 'trange', text: m.unit || '\u00a0' })])].concat(cells)));
    });
  }

  // ---------- resize ----------
  var lastW = window.innerWidth, rt = null;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW) return; lastW = window.innerWidth;
    clearTimeout(rt); rt = setTimeout(renderCharts, 120);
  });

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
