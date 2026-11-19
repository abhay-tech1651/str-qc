/** Negatives as written (dashboard/lib/negatives-core.ts): what the sheet wrote, what went in, what else it blocks. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadEngine } = require('./harness');

const E = loadEngine({}, ['00_Util.js']);
const H = {
  tok: (s) => Array.from(E.tok(s)),
  parseNegative: (s) => { const r = E.parseNegative(s); return [r[0], Array.from(r[1])]; },
  blocks: (m, w, q) => !!E.blocks(m, w, q),
};
const core = () => import(pathToFileURL(path.join(__dirname, '..', 'dashboard', 'lib', 'negatives-core.ts')).href);

test('wordKind: whole search, part, one word, other words, nothing', async () => {
  const { wordKind } = await core();
  assert.strictEqual(wordKind(H, 'skyline suites noida', 'Skyline Suites Noida'), 'full');
  assert.strictEqual(wordKind(H, 'skyline suites', 'skyline suites noida'), 'part');
  assert.strictEqual(wordKind(H, 'skyline', 'skyline suites noida'), 'one_word');
  assert.strictEqual(wordKind(H, 'skylines', 'skyline suites noida'), 'different');
  assert.strictEqual(wordKind(H, '', 'skyline suites noida'), 'none');
});

test('analyseNegatives: one-word negative found, and the keyword and converting search it also blocks', async () => {
  const { analyseNegatives } = await core();
  const camp = 'ROI_Ivory_NonBrand';
  const out = analyseNegatives(H, {
    calls: [
      { day: '2026-11-14', decision: 'Exclude', term: 'house for rent noida', campaign: camp, ad_group: 'House', neg_term: 'rent', cost: 50, clicks: 1 },
      { day: '2026-11-01', decision: 'Exclude', term: 'darshana studios noida', campaign: camp, ad_group: 'House', neg_term: 'darshana', cost: 90, clicks: 2 },
    ],
    changes: [
      { ts: '2026-11-16T13:23:00', day: '2026-11-16', user: 'aman.k@x', campaign: camp, ad_group: '', kind: 'negative broad match keyword added', item: '-house' },
      { ts: '2026-11-16T13:24:00', day: '2026-11-16', user: 'aman.k@x', campaign: camp, ad_group: '', kind: 'negative income range added', item: 'Top 10%' },
    ],
    searchTerms: [
      { day: '2026-11-10', term: '3 bhk house noida', campaign: camp, ad_group: 'House', clicks: 3, cost: 300, conv: 1 },
      { day: '2026-11-14', term: 'house for rent noida', campaign: camp, ad_group: 'House', clicks: 1, cost: 50, conv: 0 },
    ],
    keywords: [
      { keyword_status: 'Enabled', campaign: camp, ad_group: 'House', keyword: '4 bhk house in noida' },
      { keyword_status: 'Paused', campaign: camp, ad_group: 'House', keyword: 'pent house noida' },
    ],
    projectOf: () => 'ivory', grace: 3, changesFrom: '2026-10-01', lastChange: '2026-11-18',
  });
  const rent = out.calls.find((c) => c.term === 'house for rent noida');
  assert.strictEqual(rent.written_kind, 'one_word');
  assert.strictEqual(rent.status, 'applied');
  assert.strictEqual(rent.applied_as, '-house');
  assert.strictEqual(rent.applied_kind, 'one_word');
  assert.strictEqual(rent.same_as_written, false);
  assert.strictEqual(rent.blocks_keywords, 1);
  const darshana = out.calls.find((c) => c.term === 'darshana studios noida');
  assert.strictEqual(darshana.status, 'not_applied');
  assert.strictEqual(out.negatives.length, 1, 'the income-range change is not a keyword negative');
  const n = out.negatives[0];
  assert.deepStrictEqual(n.keywords, ['4 bhk house in noida (House)'], 'paused keywords are left out');
  assert.deepStrictEqual(n.conv_searches.map((h) => h.term), ['3 bhk house noida']);
  assert.strictEqual(n.calls, 1);
});
