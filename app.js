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
  // Status shape: circle = in range / no range, diamond = slightly out, square = well out.
  function shape(level, cx, cy) {
    var c = 'pt pt-' + level;
    if (level === 'warn') return sv('polygon', { class: c, points: [[cx, cy - 6], [cx + 6, cy], [cx, cy + 6], [cx - 6, cy]].map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ') });
    if (level === 'bad') return sv('rect', { class: c, x: (cx - 4.5).toFixed(2), y: (cy - 4.5).toFixed(2), width: 9, height: 9 });
    return sv('circle', { class: c, cx: cx, cy: cy, r: 4.5 });
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

  // Range bar line: bar (SVG, drawn after layout) + range text with distance when out.
  function barInfo(t, m) {
    var r = state.ranges;
    if (m.k === 'temp') return { note: 'no ideal range' };
    var v = C.value(t, m.k);
    if (v === null) return { note: m.k === 'lsi' ? 'needs water temp' : 'not tested' };
    var s = C.status(t, m.k, r), bLo, bHi, sLo, sHi, dist = null;
    if (m.k === 'tc') {
      var fc = C.value(t, 'fc'), cc = C.value(t, 'cc');
      bLo = fc; bHi = fc + r.cc.hi; sLo = Math.min(fc, v); sHi = fc + r.cc.hi + r.cc.s;
      if (s.dir === 'high') dist = cc - r.cc.hi; else if (s.dir === 'low') dist = r.cc.lo - cc;
    } else {
      var rr = r[m.k];
      bLo = rr.lo; bHi = rr.hi; sLo = rr.lo - rr.s; sHi = rr.hi + rr.s;
      if (s.dir === 'high') dist = v - rr.hi; else if (s.dir === 'low') dist = rr.lo - v;
    }
    var w = bHi - bLo, pin = null;
    if (v > bHi + 4 * w) pin = 'hi'; else if (v < bLo - 4 * w) pin = 'lo';
    if (!pin) { sLo = Math.min(sLo, v); sHi = Math.max(sHi, v); }
    var pad = (sHi - sLo) * 0.08; sLo -= pad; sHi += pad;
    if (m.k !== 'lsi') sLo = Math.max(0, sLo);
    return { v: v, s: s, bLo: bLo, bHi: bHi, sLo: sLo, sHi: sHi, pin: pin,
      dist: dist === null ? null : C.fmt(Math.round(dist * 1e6) / 1e6, m.dp) + (s.dir === 'high' ? ' high' : ' low') };
  }
  function barLine(t, m) {
    var info = barInfo(t, m), line = el('div', { class: 'rbar' });
    if (info.note) { line.appendChild(el('span', { class: 'rtext', text: info.note })); return line; }
    var svg = sv('svg', { height: 16, role: 'img', 'aria-label': m.name + ' ' + C.show(t, m) + ' against ideal range ' + rangeText(m) });
    svg.__info = info;
    line.appendChild(svg);
    var tx = el('span', { class: 'rtext', text: rangeText(m) });
    if (info.dist) { tx.appendChild(document.createTextNode(' · ')); tx.appendChild(el('span', { class: 'rdist', text: info.dist })); }
    line.appendChild(tx);
    return line;
  }
  var clipN = 0;
  function drawBars() {
    // One shared width for the range text (widest visible), so every bar has the same start and end.
    var txts = Array.prototype.filter.call(document.querySelectorAll('#latest .rbar svg + .rtext'), function (e) { e.style.width = ''; return e.getBoundingClientRect().width > 0; });
    var tw0 = Math.ceil(Math.max.apply(null, txts.map(function (e) { return e.getBoundingClientRect().width; }).concat([0])));
    txts.forEach(function (e) { e.style.width = tw0 + 'px'; });
    document.querySelectorAll('#latest .rbar svg').forEach(function (svg) {
      var info = svg.__info, W = Math.round(svg.getBoundingClientRect().width);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      if (!info || W <= 0) return;
      svg.setAttribute('viewBox', '0 0 ' + W + ' 16');
      var x0 = info.pin === 'lo' ? 10 : 0, x1 = W - (info.pin === 'hi' ? 10 : 0), tw = x1 - x0;
      var X = function (v) { return x0 + (v - info.sLo) / (info.sHi - info.sLo) * tw; };
      var id = 'rbclip' + (++clipN);
      var cp = sv('clipPath', { id: id }); cp.appendChild(sv('rect', { x: x0, y: 4, width: tw, height: 8, rx: 4 }));
      var defs = sv('defs', {}); defs.appendChild(cp); svg.appendChild(defs);
      svg.appendChild(sv('rect', { class: 'track', x: x0, y: 4, width: tw, height: 8, rx: 4 }));
      var bl = Math.max(x0, X(info.bLo)), br = Math.min(x1, X(info.bHi));
      if (br > bl) svg.appendChild(sv('rect', { class: 'band', x: bl.toFixed(2), y: 4, width: (br - bl).toFixed(2), height: 8, 'clip-path': 'url(#' + id + ')' }));
      var mx = info.pin === 'hi' ? x1 - 7 : info.pin === 'lo' ? x0 + 7 : Math.max(x0 + 7, Math.min(x1 - 7, X(info.v)));
      svg.appendChild(shape(info.s.level, mx, 8));
      if (info.pin) svg.appendChild(sv('text', { class: 'pin', x: info.pin === 'hi' ? W - 5 : 5, y: 12, 'text-anchor': 'middle', text: (info.pin === 'hi' ? '▶' : '◀') + VS }));
    });
  }

  function renderLatest(latest, prev) {
    var table = $('latest');
    Array.prototype.slice.call(table.tBodies).forEach(function (b) { table.removeChild(b); });
    $('latest-when').textContent = latest ? dLong(latest.date) + (latest.time ? ' · ' + tFmt(latest.time) : '') + (prev ? ' · change vs ' + dShort(prev.date) : '') : '';
    if (!latest) { table.appendChild(el('tbody')); return; }
    MEAS.forEach(function (m) {
      var s = C.status(latest, m.k, state.ranges);
      var r1 = el('tr', { class: 'r1' + (m.derived ? ' derived' : '') }, [
        el('td', null, [nameNode(m)]),
        el('td', { class: 'col-range' }, [barLine(latest, m)]),
        el('td', { class: 'num', text: C.show(latest, m) }),
        el('td', null, [s.level === 'na' || m.norange ? el('span', { class: 'st st-na', text: '—' }) : statusNode(s)]),
        el('td', { class: 'num', text: deltaText(C.delta(latest, prev, m.k), m) })
      ]);
      var r2 = el('tr', { class: 'r2' }, [el('td', { colspan: '4' }, [barLine(latest, m)])]);
      table.appendChild(el('tbody', null, [r1, r2]));
    });
    drawBars();
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
