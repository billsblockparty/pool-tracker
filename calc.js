/* Pool tracker: pure calculations (no DOM). Loaded by index.html and tested in Node. */
(function (root) {
  'use strict';

  var MEAS = [
    { k: 'fc',   name: 'Free chlorine',     short: 'FC',     unit: 'ppm', dp: 2 },
    { k: 'tc',   name: 'Total chlorine',    short: 'TC',     unit: 'ppm', dp: 2 },
    { k: 'cc',   name: 'Combined chlorine', short: 'CC',     unit: 'ppm', dp: 2, derived: true },
    { k: 'ph',   name: 'pH',                short: 'pH',     unit: '',    dp: 1 },
    { k: 'ta',   name: 'Total alkalinity',  short: 'TA',     unit: 'ppm', dp: 0 },
    { k: 'ch',   name: 'Calcium hardness',  short: 'CH',     unit: 'ppm', dp: 0 },
    { k: 'cya',  name: 'Cyanuric acid',     short: 'CYA',    unit: 'ppm', dp: 0 },
    { k: 'fe',   name: 'Iron',              short: 'Iron',   unit: 'ppm', dp: 2 },
    { k: 'cu',   name: 'Copper',            short: 'Copper', unit: 'ppm', dp: 2 },
    { k: 'po4',  name: 'Phosphates',        short: 'Phos',   unit: 'ppb', dp: 0 },
    { k: 'salt', name: 'Salt',              short: 'Salt',   unit: 'ppm', dp: 0 },
    { k: 'temp', name: 'Water temperature', short: 'Temp',   unit: '°F',  dp: 0, norange: true },
    { k: 'lsi',  name: 'Saturation (LSI)',  short: 'LSI',    unit: '',    dp: 2, derived: true }
  ];

  // lo/hi = ideal range; s = "slightly out" margin beyond either end (amber), past it = red.
  // TC has no range of its own: its status is the combined-chlorine status (TC within cc.hi of FC).
  var DEFAULT_RANGES = {
    fc:   { lo: 1,    hi: 4,    s: 0.5 },
    cc:   { lo: 0,    hi: 0.2,  s: 0.3 },
    ph:   { lo: 7.2,  hi: 7.8,  s: 0.2 },
    ta:   { lo: 80,   hi: 120,  s: 20 },
    ch:   { lo: 200,  hi: 400,  s: 50 },
    cya:  { lo: 50,   hi: 100,  s: 20 },
    fe:   { lo: 0,    hi: 0.2,  s: 0.1 },
    cu:   { lo: 0,    hi: 0.2,  s: 0.1 },
    po4:  { lo: 0,    hi: 100,  s: 100 },
    salt: { lo: 2700, hi: 3400, s: 200 },
    lsi:  { lo: -0.3, hi: 0.3,  s: 0.2 }
  };

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function r6(x) { return Math.round(x * 1e6) / 1e6; }

  function mergeRanges(saved) {
    var out = {};
    Object.keys(DEFAULT_RANGES).forEach(function (k) {
      var d = DEFAULT_RANGES[k], s = (saved && saved[k]) || {};
      out[k] = {
        lo: num(s.lo) !== null ? s.lo : d.lo,
        hi: num(s.hi) !== null ? s.hi : d.hi,
        s:  num(s.s)  !== null ? s.s  : d.s
      };
    });
    return out;
  }

  /* Langelier Saturation Index.
     LSI = pH − pHs,  pHs = (9.3 + A + B) − (C + D)
     A = (log10 TDS − 1) / 10          TDS ≈ salt reading (ppm); 1000 if no salt reading
     B = −13.12 · log10(°C + 273) + 34.55
     C = log10(calcium hardness) − 0.4
     D = log10(carbonate alkalinity),  carbonate alk = TA − CYA / 3 */
  function lsi(t) {
    var ph = num(t.ph), temp = num(t.temp), ch = num(t.ch), ta = num(t.ta);
    if (ph === null || temp === null || ch === null || ta === null) return null;
    var cya = num(t.cya) || 0, salt = num(t.salt);
    var tds = salt !== null && salt > 0 ? salt : 1000;
    var carb = ta - cya / 3;
    if (ch <= 0 || carb <= 0) return null;
    var tc = (temp - 32) * 5 / 9;
    var A = (Math.log10(tds) - 1) / 10;
    var B = -13.12 * Math.log10(tc + 273) + 34.55;
    var C = Math.log10(ch) - 0.4;
    var D = Math.log10(carb);
    var pHs = (9.3 + A + B) - (C + D);
    return ph - pHs;
  }

  function value(t, k) {
    if (k === 'cc') {
      var fc = num(t.fc), tc = num(t.tc);
      return fc !== null && tc !== null ? r6(tc - fc) : null;
    }
    if (k === 'lsi') { var l = lsi(t); return l === null ? null : l; }
    return num(t[k]);
  }

  function classify(v, r) {
    if (v === null || !r) return { level: 'na', dir: null };
    var eps = 1e-9;
    if (v < r.lo - eps) return { level: (r.lo - v) <= r.s + eps ? 'warn' : 'bad', dir: 'low' };
    if (v > r.hi + eps) return { level: (v - r.hi) <= r.s + eps ? 'warn' : 'bad', dir: 'high' };
    return { level: 'ok', dir: null };
  }

  function status(t, k, ranges) {
    if (k === 'tc') return classify(value(t, 'cc'), ranges.cc);
    return classify(value(t, k), ranges[k]);
  }

  // Keys counted for "out of range" (CC is counted once, under TC).
  var COUNTED = ['fc', 'tc', 'ph', 'ta', 'ch', 'cya', 'fe', 'cu', 'po4', 'salt', 'lsi'];
  function outCount(t, ranges) {
    var n = 0, of = 0;
    COUNTED.forEach(function (k) {
      var s = status(t, k, ranges);
      if (s.level === 'na') return;
      of++; if (s.level !== 'ok') n++;
    });
    return { n: n, of: of };
  }

  function delta(cur, prev, k) {
    if (!prev) return null;
    var a = value(cur, k), b = value(prev, k);
    if (a === null || b === null) return null;
    return r6(a - b);
  }

  function fmt(v, dp) {
    if (v === null || v === undefined) return '—';
    var s = v.toFixed(dp);
    if (s === '-0' || /^-0\.0*$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }

  // Display a stored reading as entered; derived values to their decimals.
  function show(t, m) {
    var v = value(t, m.k);
    if (v === null) return '—';
    if (m.derived) return fmt(v, m.dp);
    return String(v).replace('-', '−');
  }

  function dayNum(iso) { // days since epoch for a YYYY-MM-DD date
    var p = iso.split('-').map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
  }
  function stamp(t) { // ms for ordering and the time axis; missing time = noon
    var p = t.date.split('-').map(Number), hm = (t.time || '12:00').split(':').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2], hm[0], hm[1]);
  }
  function sortTests(list) {
    return list.slice().sort(function (a, b) { return stamp(a) - stamp(b); });
  }

  var api = { MEAS: MEAS, DEFAULT_RANGES: DEFAULT_RANGES, COUNTED: COUNTED, mergeRanges: mergeRanges,
    lsi: lsi, value: value, classify: classify, status: status, outCount: outCount, delta: delta,
    fmt: fmt, show: show, dayNum: dayNum, stamp: stamp, sortTests: sortTests };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PoolCalc = api;
})(this);
