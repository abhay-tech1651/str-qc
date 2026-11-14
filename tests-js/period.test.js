/** A chosen period (cfg.period, plus sheet and search-term rows cut to it) must give the same model in the engine and the Python reference. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine, fixture, plain, deepDiff } = require('./harness');

const FROM = '2026-10-27', TO = '2026-11-02', AS_OF = '2026-11-06';
const ready = fixture.exists('tables.json') && fixture.exists('model_period.json');

test('a chosen period matches the Python reference, field by field', { skip: !ready && `run python -m strqc.model --as-of ${AS_OF} --period ${FROM}:${TO} --name model_period` }, () => {
  const E = loadEngine({}, ['00_Util.js', '01_Config.js', '20_Model.js']);
  const T = fixture.json('tables.json');
  const cut = (rows) => rows.filter((x) => x.day >= FROM && x.day <= TO);
  const cfg = { ...fixture.json('config.json'), period: { from: FROM, to: TO } };
  const out = E.buildModel({ ...T, search_terms: cut(T.search_terms), agency_calls: cut(T.agency_calls) }, cfg, AS_OF);
  const m = plain(out.model);
  assert.deepEqual([m.windows.last7.from, m.windows.last7.to], [FROM, TO], 'the period replaces the last 7 days');
  assert.deepEqual([m.windows.prev7.from, m.windows.prev7.to], ['2026-10-20', '2026-10-26'], 'compared with the same number of days just before');
  const diffs = deepDiff(m, fixture.json('model_period.json'), 'model');
  assert.deepEqual(diffs, [], diffs.join(String.fromCharCode(10)));
});
