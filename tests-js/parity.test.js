/** The Apps Script model must equal the Python reference model (strqc/model.py) built from the same tables. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine, fixture, plain, deepDiff } = require('./harness');

const AS_OF = '2026-11-06';
const ready = fixture.exists('tables.json') && fixture.exists('model.json');

test('buildModel matches the Python reference, field by field', { skip: !ready && 'run python -m strqc.fixtures and python -m strqc.model first' }, () => {
  const E = loadEngine({}, ['00_Util.js', '01_Config.js', '20_Model.js']);
  assert.equal(typeof E.buildModel, 'function', 'apps-script/20_Model.js must define buildModel(T, cfg, asOf)');
  const out = E.buildModel(fixture.json('tables.json'), fixture.json('config.json'), AS_OF);
  const diffs = deepDiff(plain(out.model), fixture.json('model.json'), 'model');
  assert.deepEqual(diffs, [], diffs.join('\n'));
  const rdiffs = deepDiff(plain(out.review), fixture.json('review.json'), 'review');
  assert.deepEqual(rdiffs, [], rdiffs.join('\n'));
});

const partial = fixture.exists('model_agencyonly.json') && fixture.exists('tables.json');
test('with only the agency sheet loaded, the model still matches the reference (first-run state)', { skip: !partial && 'run python -m strqc.model --as-of 2026-11-07 --only agency_calls --name model_agencyonly' }, () => {
  const E = loadEngine({}, ['00_Util.js', '01_Config.js', '20_Model.js']);
  const T = fixture.json('tables.json');
  const only = { search_terms: [], agency_calls: T.agency_calls, changes: [], campaign_days: [], keywords: [], auction: [] };
  const out = E.buildModel(only, fixture.json('config.json'), '2026-11-07');
  const diffs = deepDiff(plain(out.model), fixture.json('model_agencyonly.json'), 'model');
  assert.deepEqual(diffs, [], diffs.join('\n'));
  assert.equal(out.model.agency.excludes.overdue, 0, 'with no change history nothing can be called overdue');
});
