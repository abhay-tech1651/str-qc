/**
 * Shared helpers for the County Search QC engine. Pure functions only: these run unchanged in Apps Script (V8) and in
 * Node tests (tests-js/harness.js). They mirror the helpers at the top of strqc/model.py; keep the two in step.
 */

/** Round half up (JavaScript Math.round semantics), to nd decimals. null for missing or non-finite input. */
function rnd(x, nd) {
  nd = nd || 0;
  if (x === null || x === undefined || typeof x !== 'number' || !isFinite(x)) return null;
  var f = Math.pow(10, nd);
  return Math.floor(x * f + 0.5) / f;
}

/** Split text into lower-case words: letters, digits and '&'. Everything else separates words. */
function tok(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase().split(/[^a-z0-9&]+/).filter(function (t) { return t; });
}

function dayToMs_(day) {
  var p = String(day).split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}

function msToDay_(ms) {
  var d = new Date(ms);
  var m = d.getUTCMonth() + 1, dd = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
}

/** 'YYYY-MM-DD' plus n days. */
function addDays(day, n) {
  return msToDay_(dayToMs_(day) + n * 86400000);
}

/** Whole days from a to b (b - a). */
function daysBetween(a, b) {
  return Math.round((dayToMs_(b) - dayToMs_(a)) / 86400000);
}

/** Median of numbers; null for an empty list (matches Python statistics.median). */
function median(xs) {
  if (!xs || !xs.length) return null;
  var s = xs.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Impression-weighted average of a percentage field, skipping rows where Google hid the exact value. */
function wavg(rows, key) {
  var tot = 0, acc = 0;
  for (var i = 0; i < rows.length; i++) {
    var x = rows[i];
    if (x[key] !== null && x[key] !== undefined && (x.impr || 0) > 0) {
      tot += x.impr;
      acc += x[key] * x.impr;
    }
  }
  return tot ? rnd(acc / tot, 1) : null;
}

/** '-[a b]' exact, '-"a b"' phrase, '-a b' broad. Returns [match, words]. */
function parseNegative(s) {
  s = String(s === null || s === undefined ? '' : s).trim().replace(/^-+/, '').trim();
  if (s.charAt(0) === '[') return ['exact', tok(s)];
  if (s.charAt(0) === '"') return ['phrase', tok(s)];
  return ['broad', tok(s)];
}

/** Would a negative (match type + words) block a search already split into words q? Negatives never stretch to plurals. */
function blocks(match, words, q) {
  if (!words || !words.length) return false;
  for (var i = 0; i < words.length; i++) if (q.indexOf(words[i]) < 0) return false;
  if (match === 'broad') return true;
  if (match === 'phrase') {
    var n = words.length;
    for (var j = 0; j + n <= q.length; j++) {
      var ok = true;
      for (var k = 0; k < n; k++) if (q[j + k] !== words[k]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }
  if (q.length !== words.length) return false;
  for (var e = 0; e < q.length; e++) if (q[e] !== words[e]) return false;
  return true;
}

/**
 * Compare two sort keys (arrays) the way Python compares tuples: element by element; numbers numerically,
 * strings by code point, booleans as 0/1. Use with Array.prototype.sort, which is stable in V8.
 */
function cmpKeys(a, b) {
  for (var i = 0; i < Math.min(a.length, b.length); i++) {
    var x = a[i], y = b[i];
    if (typeof x === 'boolean') x = x ? 1 : 0;
    if (typeof y === 'boolean') y = y ? 1 : 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return a.length - b.length;
}

/** Sort a copy of rows by keyFn(row) -> array, like Python sorted(rows, key=...). */
function sortBy(rows, keyFn) {
  return rows.slice().sort(function (a, b) { return cmpKeys(keyFn(a), keyFn(b)); });
}

/** Sum of fn(row) over rows, in order (summation order matters for exact parity with Python). */
function sumOf(rows, fn) {
  var s = 0;
  for (var i = 0; i < rows.length; i++) s += fn(rows[i]);
  return s;
}

/** First row with the largest keyFn value, like Python max(rows, key=...). */
function maxBy(rows, keyFn) {
  var best = null, bk;
  for (var i = 0; i < rows.length; i++) {
    var k = keyFn(rows[i]);
    if (best === null || k > bk) { best = rows[i]; bk = k; }
  }
  return best;
}

/** Sorted unique values (code point order), like Python sorted(set(...)). */
function uniqSorted(values) {
  var seen = {}, out = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (!Object.prototype.hasOwnProperty.call(seen, v)) { seen[v] = 1; out.push(v); }
  }
  return out.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
}
