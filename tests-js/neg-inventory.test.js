/** Every negative in the account (dashboard/lib/neg-inventory-core.ts): reading the report and what each negative blocks. */
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
const core = () => import(pathToFileURL(path.join(__dirname, '..', 'dashboard', 'lib', 'neg-inventory-core.ts')).href);

const CAMP = 'ROI_Ivory_Non_Brand_Search';
const REPORT = [
  '﻿Negative keyword report',
  'All time',
  'Negative keyword\tKeyword or list\tCampaign\tAd group\tLevel\tMatch type',
  `house\tKeyword\t${CAMP}\t --\tCampaign\tBroad match`,
  `"""new launch"""\tKeyword\t${CAMP}\t --\tCampaign\tPhrase match`,
  `[darshana studios noida]\tKeyword\t${CAMP}\tStudios\tAd group\tExact match`,
  `flats\tKeyword\t${CAMP}\tApartments\tAd group\tBroad match`,
  `City Negative List\tList\t${CAMP}\t --\tCampaign\t --`,
].join('\n');

test('parseInventory: keywords, match types, levels and shared lists', async () => {
  const { isInventory, parseInventory } = await core();
  assert.ok(isInventory(REPORT));
  assert.ok(!isInventory('Search keyword report\n1 November 2026\nKeyword status\tKeyword'));
  const inv = parseInventory(H, REPORT, '2026-11-19', 'Negative keyword report.csv');
  assert.strictEqual(inv.negatives.length, 4);
  assert.deepStrictEqual(inv.lists, [{ name: 'City Negative List', campaign: CAMP }]);
  const nl = inv.negatives.find((n) => n.words.join(' ') === 'new launch');
  assert.strictEqual(nl.match, 'phrase');
  assert.strictEqual(nl.text, '"new launch"', 'tripled quotes from the export are cleaned');
  const ex = inv.negatives.find((n) => n.match === 'exact');
  assert.strictEqual(ex.ad_group, 'Studios');
  assert.strictEqual(inv.negatives.find((n) => n.text === 'house').ad_group, '', '" --" means the whole campaign');
});

test('analyseInventory: blocked keywords, converting searches, sheet calls and Adds', async () => {
  const { parseInventory, analyseInventory } = await core();
  const inv = parseInventory(H, REPORT, '2026-11-19', 'x');
  const out = analyseInventory(H, {
    inv,
    calls: [
      { day: '2026-11-10', decision: 'Exclude', term: 'darshana studios noida', campaign: CAMP, ad_group: 'Studios', neg_term: 'darshana', cost: 90, clicks: 2 },
      { day: '2026-11-10', decision: 'Exclude', term: 'darshana studios noida', campaign: CAMP, ad_group: 'Other', neg_term: 'darshana', cost: 10, clicks: 1 },
      { day: '2026-11-11', decision: 'Exclude', term: 'plots in noida', campaign: CAMP, ad_group: 'Plots', neg_term: 'plots', cost: 40, clicks: 1 },
      { day: '2026-11-12', decision: 'Add', term: 'new launch projects noida', campaign: CAMP, ad_group: 'Projects', cost: 30, conv: 0 },
    ],
    keywords: [
      { keyword_status: 'Enabled', campaign: CAMP, ad_group: 'House', keyword: '4 bhk house in noida' },
      { keyword_status: 'Paused', campaign: CAMP, ad_group: 'House', keyword: 'pent house noida' },
      { keyword_status: 'Enabled', campaign: CAMP, ad_group: 'Flats', keyword: 'flats in noida' },
    ],
    searchTerms: [
      { day: '2026-11-05', term: '3 bhk house noida', campaign: CAMP, ad_group: 'House', clicks: 2, cost: 200, conv: 1 },
      { day: '2026-11-06', term: 'flats noida', campaign: CAMP, ad_group: 'Apartments', clicks: 1, cost: 50, conv: 1 },
    ],
    changes: [{ ts: '2026-11-16T10:00:00', day: '2026-11-16', user: 'aman.k@x', campaign: CAMP, ad_group: '', kind: 'negative broad match keyword added', item: '-house' }],
    projectOf: () => 'ivory',
  });
  const house = out.risky.find((r) => r.text === 'house');
  assert.deepStrictEqual(house.keywords, ['4 bhk house in noida (House)'], 'paused keywords are left out');
  assert.strictEqual(house.conv, 1);
  assert.strictEqual(house.added_on, '2026-11-16');
  assert.strictEqual(house.added_by, 'aman.k');
  // the ad-group negative "flats" only covers its own ad group: the keyword in "Flats" is not blocked, the search in "Apartments" is
  const flats = out.risky.find((r) => r.text === 'flats');
  assert.deepStrictEqual(flats.keywords, []);
  assert.strictEqual(flats.conv, 1);
  const st = Object.fromEntries(out.calls.map((c) => [c.ad_group, c.in_account]));
  assert.deepStrictEqual(st, { Studios: 'blocked_here', Other: 'blocked_other_ad_group', Plots: 'not_found' });
  assert.strictEqual(out.calls.find((c) => c.ad_group === 'Plots').lists[0], 'City Negative List');
  assert.strictEqual(out.add_conflicts.length, 1);
  assert.strictEqual(out.add_conflicts[0].by, '"new launch"');
  const c = out.campaigns[0];
  assert.strictEqual(c.total, 4);
  assert.strictEqual(c.one_word, 2);
  assert.strictEqual(c.one_word_campaign, 1);
});
