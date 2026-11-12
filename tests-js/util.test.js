/** The matching and rounding rules every check depends on (no real data needed). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./harness');

const E = loadEngine({}, ['00_Util.js', '01_Config.js']);
const neg = (n, q) => { const [m, w] = E.parseNegative(n); return E.blocks(m, w, E.tok(q)); };

test('broad negative needs every word, any order', () => {
  assert.equal(neg('-greater noida', 'godrej noida greater project'), true);
  assert.equal(neg('-greater noida', 'noida extension'), false);
});
test('phrase negative needs the words together, in order, and never stretches to plurals', () => {
  assert.equal(neg('-"golf links"', 'godrej golf links villas'), true);
  assert.equal(neg('-"golf links"', 'golf link greater noida'), false);
});
test('exact negative blocks only that search', () => {
  assert.equal(neg('-[godrej greater noida]', 'godrej greater noida'), true);
  assert.equal(neg('-[godrej greater noida]', 'godrej greater noida project'), false);
});
test('a bare number blocks every search containing it', () => {
  assert.equal(neg('-62', 'sector 62 gurgaon'), true);
});
test('rounding is half up, like the Python reference', () => {
  assert.equal(E.rnd(2.5), 3);
  assert.equal(E.rnd(0.125, 2), 0.13);
  assert.equal(E.rnd(null), null);
});
test('dates', () => {
  assert.equal(E.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(E.daysBetween('2026-10-29', '2026-11-06'), 8);
  assert.equal(E.median([3, 1, 2, 10]), 2.5);
});
test('sort keys compare like Python tuples', () => {
  const rows = [{ c: 5, t: 'b' }, { c: 9, t: 'a' }, { c: 5, t: 'a' }];
  assert.deepEqual(E.sortBy(rows, (x) => [-x.c, x.t]).map((x) => x.c + x.t), ['9a', '5a', '5b']);
});
