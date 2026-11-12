/** The search-terms merge rule: a newer file replaces only the (day, campaign) groups it contains. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine, plain } = require('./harness');

const E = loadEngine({}, ['00_Util.js', '01_Config.js', '30_Store.js']);
const row = (day, campaign, term, cost) => ({ day, term, match_type: 'Exact match', ads_status: 'None', campaign, ad_group: 'g', keyword: '-', clicks: 1, impr: 1, cost, conv: 0 });

test('a one-campaign export replaces only that campaign for that day', () => {
  const old = [row('2026-10-19', 'A', 'a1', 10), row('2026-10-19', 'B', 'b1', 20), row('2026-10-20', 'A', 'a2', 30)];
  const merged = plain(E.mergeRows_('search_terms', old, [row('2026-10-19', 'B', 'b2', 25)]));
  assert.deepEqual(merged.map((r) => r.term).sort(), ['a1', 'a2', 'b2']);
});

test('a full export of a day replaces every campaign it contains', () => {
  const old = [row('2026-10-19', 'A', 'a1', 10), row('2026-10-19', 'B', 'b1', 20)];
  const merged = plain(E.mergeRows_('search_terms', old, [row('2026-10-19', 'A', 'a9', 11), row('2026-10-19', 'B', 'b9', 21)]));
  assert.deepEqual(merged.map((r) => r.term).sort(), ['a9', 'b9']);
});
