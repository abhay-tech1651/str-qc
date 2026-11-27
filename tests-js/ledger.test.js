/** The search-term ledger (dashboard/lib/ledger-core.ts): every search lands in one outcome and the rupees add up. */
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
const core = () => import(pathToFileURL(path.join(__dirname, '..', 'dashboard', 'lib', 'ledger-core.ts')).href);

const C = 'ROI_Ivory_Non_Brand_Search';
const st = (day, term, ad_group, cost, conv = 0) => ({ day, term, campaign: C, ad_group, keyword: 'flats in noida', match_type: 'Phrase match (close variant)', clicks: 1, cost, conv });
const call = (day, term, decision, neg_term = '') => ({ day, term, campaign: C, ad_group: 'Flats', decision, neg_term, county_comment: '' });
const neg = (text, match, ad_group = '') => ({ text, match, words: text.replace(/[\["\]]/g, '').split(' '), campaign: C, ad_group });

test('buildLedger: one outcome per search, rupees add up, money after the call', async () => {
  const { buildLedger } = await core();
  const led = buildLedger(H, {
    from: '2026-11-01', to: '2026-11-10', grace: 3, projectOf: () => 'ivory',
    searchTerms: [
      st('2026-11-01', 'ats pristine noida', 'Flats', 100), st('2026-11-03', 'ats pristine noida', 'Flats', 50), st('2026-11-08', 'ats pristine noida', 'Flats', 30),
      st('2026-11-02', 'flats in noida 4 bhk', 'Flats', 200, 1),
      st('2026-11-02', 'rent flats noida', 'Flats', 40),
      st('2026-11-02', 'luxury flats noida', 'Flats', 60),
      st('2026-11-02', 'flats noida sector 150', 'Flats', 70),
      st('2026-11-02', 'gaur city flats', 'Flats', 25),
      st('2026-11-12', 'after the period', 'Flats', 999),
    ],
    calls: [
      call('2026-11-01', 'ats pristine noida', 'Exclude', 'ats'),
      call('2026-11-02', 'rent flats noida', ''),
      call('2026-11-02', 'luxury flats noida', 'Add'),
      call('2026-11-02', 'flats noida sector 150', 'Add'),
      call('2026-11-02', 'flats in noida 4 bhk', ''),
      call('2026-11-11', 'gaur city flats', 'Exclude'),
    ],
    keywords: [{ keyword_status: 'Enabled', campaign: C, ad_group: 'Flats', keyword: 'luxury flats noida' }],
    changes: [],
    inv: { as_of: '2026-11-10', name: 'x', lists: [{ name: 'City Negative List', campaign: C }], negatives: [neg('rent', 'broad'), neg('"sector 150"', 'phrase', 'Flats')] },
  });
  const by = Object.fromEntries(led.searches.map((s) => [s.term, s]));
  assert.strictEqual(by['ats pristine noida'].outcome, 'junk_open', 'Exclude, nothing blocks it');
  assert.strictEqual(by['ats pristine noida'].cost_after_call, 80, 'spent on 3 and 8 Nov, after the 1 Nov call');
  assert.strictEqual(by['ats pristine noida'].cost_after_deadline, 30, 'only 8 Nov is after the 3-day deadline');
  assert.deepStrictEqual(by['ats pristine noida'].lists, ['City Negative List']);
  assert.strictEqual(by['flats in noida 4 bhk'].outcome, 'results');
  assert.strictEqual(by['rent flats noida'].outcome, 'blocked_anyway', 'left as is in the sheet, but -rent covers it');
  assert.strictEqual(by['luxury flats noida'].outcome, 'add_done');
  assert.strictEqual(by['flats noida sector 150'].outcome, 'add_blocked', 'the ad-group negative "sector 150" blocks it in the only ad group it ran in');
  assert.strictEqual(by['gaur city flats'].outcome, 'not_reviewed', 'its only call is after the period');
  assert.ok(!by['after the period'], 'spend after the period is left out');
  assert.strictEqual(by['ats pristine noida'].neg_written_kind, 'one_word', 'the sheet wrote one word, ats');
  assert.strictEqual(by['rent flats noida'].block_kind, 'one_word', '-rent is a single broad word');
  assert.strictEqual(by['flats noida sector 150'].block_kind, 'part', '"sector 150" is two of its words');
  const costly = led.costly_negatives.map((n) => n.text);
  assert.deepStrictEqual(costly, ['"sector 150"'], 'the negative that blocks a search the sheet said to Add');
  assert.strictEqual(led.total.cost, 575);
  const sum = Object.values(led.total.by).reduce((s, v) => s + v.cost, 0);
  assert.strictEqual(sum, led.total.cost, 'every rupee lands in exactly one outcome');
  assert.strictEqual(led.by_campaign[0].cost, 575);
  assert.strictEqual(led.by_ad_group.reduce((s, g) => s + g.cost, 0), 575);
  assert.strictEqual(led.by_week.reduce((s, g) => s + g.cost, 0), 575);
});

test('buildLedger: buying intent, County\'s other-project rule, and ad-group negatives that only steer', async () => {
  const { buildLedger } = await core();
  const intent = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'config', 'intent.json'), 'utf8'));
  const led = buildLedger(H, {
    from: '2026-11-01', to: '2026-11-10', grace: 3, projectOf: () => 'ivory', intent,
    searchTerms: [
      st('2026-11-02', '3 bhk in noida sector 115', 'Flats', 50),
      st('2026-11-02', 'noida flat purchase', 'Flats', 50),
      st('2026-11-02', 'prestige 150 noida', 'Flats', 50, 2),
      st('2026-11-02', 'cleo county 3 bhk price', 'Flats', 50, 1),
      st('2026-11-02', 'ivory county price', 'Flats', 50),
      st('2026-11-02', 'flats on rent noida', 'Flats', 50),
      st('2026-11-02', 'buy flat noida', 'Apartments', 50),
      st('2026-11-02', 'luxury flats noida', 'Flats', 10),
    ],
    calls: [call('2026-11-02', 'prestige 150 noida', 'Exclude', 'prestige'), call('2026-11-02', 'buy flat noida', 'Add')],
    keywords: [{ keyword_status: 'Enabled', campaign: C, ad_group: 'Flats', keyword: 'flats in noida' }],
    changes: [],
    inv: { as_of: '2026-11-10', name: 'x', lists: [], negatives: [neg('prestige', 'broad'), neg('cleo', 'broad'), neg('flat', 'broad', 'Apartments')] },
  });
  const by = Object.fromEntries(led.searches.map((s) => [s.term, s]));
  assert.strictEqual(by['3 bhk in noida sector 115'].intent, 'high', 'our location and a buying word');
  assert.strictEqual(by['noida flat purchase'].intent, 'medium', 'a city and a buying word, not our location');
  assert.strictEqual(by['prestige 150 noida'].intent, 'low', 'another builder\'s group');
  assert.strictEqual(by['cleo county 3 bhk price'].intent, 'low', 'another County project');
  assert.strictEqual(by['ivory county price'].intent, 'high', 'our project');
  assert.strictEqual(by['flats on rent noida'].intent, 'low', 'rent');
  assert.ok(by['cleo county 3 bhk price'].blockers[0].county_rule, '-cleo is County\'s rule');
  assert.strictEqual(by['buy flat noida'].blocked, 'partly', '-flat sits only in Apartments; the Flats ad group can still show it');
  assert.strictEqual(by['buy flat noida'].outcome, 'add_open');
  assert.deepStrictEqual(led.costly_negatives.map((n) => [n.text, n.top_intent]), [['prestige', 'low']], '-cleo is left out; -prestige only blocks a low-intent search');
});

test('buildLedger: a keyword added in the change history counts as added', async () => {
  const { buildLedger } = await core();
  const led = buildLedger(H, {
    from: '2026-11-01', to: '2026-11-05', grace: 3, projectOf: () => 'ivory',
    searchTerms: [st('2026-11-02', 'county ivory price', 'Brand', 90)],
    calls: [call('2026-11-02', 'county ivory price', 'Add')],
    keywords: [],
    changes: [{ day: '2026-11-04', campaign: C, ad_group: 'Brand', kind: 'phrase match keyword added', item: '"county ivory price"' }],
    inv: null,
  });
  assert.strictEqual(led.searches[0].outcome, 'add_done');
});

test('buildLedger: SOP rule 1 (brand words in non-brand) and ad-group negatives that are not the cause', async () => {
  const { buildLedger } = await core();
  const intent = {
    brand: { ivory: ['ivory'] }, our_places: { ivory: ['sector 115'] }, county_other_projects: [],
    buy_words: ['flats', 'society'], city_words: ['noida'], low_words: [], generic_words: ['in', 'best', 'group'],
    brand_words: ['county', 'county group', 'ivory'],
  };
  const led = buildLedger(H, {
    from: '2026-11-01', to: '2026-11-10', grace: 3, projectOf: () => 'ivory', intent,
    searchTerms: [st('2026-11-02', 'county group noida', 'Flats', 500), st('2026-11-02', 'best society in noida', 'Flats', 300)],
    calls: [call('2026-11-02', 'county group noida', 'Add'), call('2026-11-02', 'best society in noida', 'Add')],
    keywords: [{ keyword_status: 'Enabled', campaign: C, ad_group: 'Societies', keyword: 'society in noida' }],
    changes: [],
    inv: { as_of: '2026-11-10', name: 'x', lists: [], negatives: [neg('county', 'broad'), neg('"best society"', 'phrase'), neg('society', 'broad', 'Flats')] },
  });
  const by = Object.fromEntries(led.searches.map((s) => [s.term, s]));
  assert.strictEqual(by['county group noida'].sop_brand, true, 'a brand search in a non-brand campaign');
  assert.strictEqual(by['county group noida'].blockers[0].sop_brand, true, '-county in a non-brand campaign follows SOP rule 1');
  assert.strictEqual(by['best society in noida'].sop_brand, false);
  const costly = led.costly_negatives.map((n) => `${n.text}|${n.ad_group}`);
  assert.ok(!costly.some((c) => c.startsWith('county|')), 'the brand-word negative is not flagged');
  assert.ok(costly.includes('"best society"|'), 'the campaign-level phrase is what stops the Add');
  assert.ok(!costly.includes('society|Flats'), 'the ad-group -society is not the cause: the campaign-level negative already stops the search');
});

test('buildLedger: "None" written over a County comment withdraws it (owner, 27 Nov 2026)', async () => {
  const { buildLedger } = await core();
  const cc = (day, term, decision, county_comment) => ({ ...call(day, term, decision), county_comment });
  const led = buildLedger(H, {
    from: '2026-11-01', to: '2026-11-10', grace: 3, projectOf: () => 'ivory',
    searchTerms: [st('2026-11-02', 'godrej noida new launch', 'Flats', 50), st('2026-11-02', 'krisumi sales lounge', 'Flats', 40), st('2026-11-02', 'apartment in noida', 'Flats', 30)],
    calls: [cc('2026-11-02', 'godrej noida new launch', 'Add', 'None'), cc('2026-11-02', 'krisumi sales lounge', 'Add', 'exclude'), cc('2026-11-01', 'apartment in noida', '', 'add'), cc('2026-11-02', 'apartment in noida', '', 'none')],
    keywords: [], changes: [], inv: { as_of: '2026-11-10', name: 'x', lists: [], negatives: [] },
  });
  const by = Object.fromEntries(led.searches.map((s) => [s.term, s]));
  assert.strictEqual(by['godrej noida new launch'].county_comment, '');
  assert.strictEqual(by['krisumi sales lounge'].county_comment, 'exclude');
  assert.strictEqual(by['apartment in noida'].county_comment, '', 'the later "none" withdraws the earlier "add"');
});
