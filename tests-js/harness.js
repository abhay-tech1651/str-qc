/**
 * Loads the Apps Script engine files into one Node vm context (one shared global scope, like Apps Script V8).
 * Real-data fixtures live in data/fixtures (git-ignored, produced by `python -m strqc.fixtures` and `python -m strqc.model`).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'apps-script');
const FIX = path.join(ROOT, 'data', 'fixtures');

/**
 * Load engine files into one shared global scope. `only` limits it to some files (e.g. ['00_Util.js', '20_Model.js'])
 * so a test never depends on a file someone else is still writing.
 */
function loadEngine(globals = {}, only = null) {
  const ctx = vm.createContext(Object.assign({ console }, globals));
  for (const f of fs.readdirSync(ENGINE).filter((n) => n.endsWith('.js') && (!only || only.includes(n))).sort()) {
    vm.runInContext(fs.readFileSync(path.join(ENGINE, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

const fixture = {
  dir: FIX,
  exists: (name = 'tables.json') => fs.existsSync(path.join(FIX, name)),
  json: (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8')),
  inbox: (name) => path.join(ROOT, 'inbox', name),
};

/** Plain JSON copy (objects made inside the vm have a different prototype). */
const plain = (x) => JSON.parse(JSON.stringify(x));

/**
 * Differences between two JSON values. Numbers match within tol (default 0.011); null and undefined are equal;
 * object key order is ignored. Returns at most `limit` "path: got X, want Y" strings.
 */
function deepDiff(got, want, at = '$', out = [], tol = 0.011, limit = 50) {
  if (out.length >= limit) return out;
  if (got === undefined) got = null;
  if (want === undefined) want = null;
  if (typeof got === 'number' && typeof want === 'number') {
    if (Math.abs(got - want) > tol) out.push(`${at}: got ${got}, want ${want}`);
    return out;
  }
  if (got === null || want === null || typeof got !== 'object' || typeof want !== 'object') {
    if (got !== want) out.push(`${at}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    return out;
  }
  if (Array.isArray(got) !== Array.isArray(want)) {
    out.push(`${at}: array vs object`);
    return out;
  }
  if (Array.isArray(got)) {
    if (got.length !== want.length) out.push(`${at}: length ${got.length}, want ${want.length}`);
    for (let i = 0; i < Math.min(got.length, want.length); i++) deepDiff(got[i], want[i], `${at}[${i}]`, out, tol, limit);
    return out;
  }
  const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
  for (const k of keys) deepDiff(got[k], want[k], `${at}.${k}`, out, tol, limit);
  return out;
}

module.exports = { ROOT, ENGINE, FIX, loadEngine, fixture, plain, deepDiff };
