/** Follow-through of every sheet call (dashboard/lib/followup-core.ts): when it went in, who, where, how late, and the money. */
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
const lib = (f) => import(pathToFileURL(path.join(__dirname, '..', 'dashboard', 'lib', f)).href);

const C = 'ROI_Ivory_Non_Brand_Search';
const C2 = 'ROI_Ivory_Brand_Search';
const CTM = 'Ivory_County_SearchCTM_20-8-2026_County';
const st = (day, term, cost, ad_group = 'Flats', campaign = C) => ({ day, term, campaign, ad_group, keyword: 'flats in noida', match_type: 'Phrase match', clicks: 1, cost, conv: 0 });
const call = (day, term, decision, neg_term = '', campaign = C) => ({ day, term, campaign, ad_group: 'Flats', decision, neg_term, county_comment: '' });
const neg = (text, match, ad_group = '', campaign = C) => ({ text, match, words: text.replace(/[\["\]]/g, '').split(' '), campaign, ad_group });
const ch = (ts, kind, item, ad_group = '', campaign = C, user = 'aman.k@roimantra.example') => ({ ts, day: ts.slice(0, 10), user, campaign, ad_group, kind, item });

test('follow-through: on time, late with the money after the deadline, open, wrong place, shared list, adds', async () => {
  const { buildLedger } = await lib('ledger-core.ts');
  const F = await lib('followup-core.ts');
  const changes = [
    ch('2026-11-03T11:00:00', 'negative exact match keyword added', '-[ats pristine noida]'),                // on time (due 4 Nov)
    ch('2026-11-09T12:30:00', 'negative broad match keyword added', '-gaur'),                                // late: due 5 Nov
    ch('2026-11-04T10:00:00', 'negative phrase match keyword added', '-"mahagun"', 'Villa'),                 // only in another ad group
    ch('2026-11-04T10:05:00', 'Competitors List: 1 negative broad match keyword added to list', '-prateek', '', ''), // a shared list
    ch('2026-11-02T09:00:00', 'phrase match keyword added', '"luxury flats noida"', 'Flats'),                // add on time
    ch('2026-11-08T09:00:00', 'phrase match keyword added', '"3 bhk noida"', 'Flats'),                       // add late (due 5 Nov)
    ch('2026-11-03T09:00:00', 'phrase match keyword added', '"flats sector 115"', 'Brand', C2),              // add in another campaign
    ch('2026-11-09T16:24:00', 'Campaign changed', 'Target CPA decreased from ₹10,000.00 to ₹5,000.00', '', C, 'vaid.vivek.roimantra@example.com'),
  ];
  const inv0 = {
    as_of: '2026-11-10', name: 'x', lists: [{ name: 'Competitors List', campaign: C }],
    negatives: [neg('[ats pristine noida]', 'exact'), neg('gaur', 'broad'), neg('"mahagun"', 'phrase', 'Villa')],
  };
  const inv = F.withListNegatives(H, inv0, changes);
  assert.strictEqual(inv.negatives.length, 4, 'the word added to the Competitors List counts as a campaign negative of the campaign using the list');
  assert.deepStrictEqual(inv.negatives[3], { text: 'prateek', match: 'broad', words: ['prateek'], campaign: C, ad_group: '', list: 'Competitors List' });
  const searchTerms = [
    st('2026-11-01', 'ats pristine noida', 100),
    st('2026-11-02', 'gaur city flats', 40), st('2026-11-06', 'gaur city flats', 30), st('2026-11-09', 'gaur city flats', 20),
    st('2026-11-02', 'mahagun mezzaria', 50), st('2026-11-07', 'mahagun mezzaria', 25),
    st('2026-11-02', 'prateek grand', 60),
    st('2026-11-08', 'supertech capetown', 90), st('2026-11-09', 'supertech capetown', 10),
    st('2026-11-01', 'luxury flats noida', 70), st('2026-11-02', '3 bhk noida', 80), st('2026-11-02', 'flats sector 115', 30),
    st('2026-11-02', 'flats near me', 15),
    st('2026-11-01', 'cheap flats', 5, 'Generic', CTM),
    st('2026-11-01', 'villa ats', 5, 'Villa'),
  ];
  const calls = [
    call('2026-11-01', 'ats pristine noida', 'Exclude', '[ats pristine noida]'),
    call('2026-11-02', 'gaur city flats', 'Exclude', 'gaur'),
    call('2026-11-02', 'mahagun mezzaria', 'Exclude'),
    call('2026-11-02', 'prateek grand', 'Exclude', 'prateek'),
    call('2026-11-08', 'supertech capetown', 'Exclude', 'supertech capetown'),
    call('2026-11-01', 'luxury flats noida', 'Add'), call('2026-11-02', '3 bhk noida', 'Add'), call('2026-11-02', 'flats sector 115', 'Add'),
    call('2026-11-02', 'flats near me', 'Add'),
    call('2026-11-01', 'cheap flats', 'Exclude', '', CTM),
  ];
  const keywords = [{ keyword_status: 'Enabled', campaign: C, ad_group: 'Flats', keyword: 'luxury flats noida' }, { keyword_status: 'Enabled', campaign: C, ad_group: 'Villa', keyword: 'villa in noida' }];
  const led = buildLedger(H, { from: '2026-11-01', to: '2026-11-09', grace: 3, projectOf: () => 'ivory', searchTerms, calls, keywords, changes, inv });
  const fu = F.buildFollowup(H, led, { inv, changes, searchTerms, keywords, asOf: '2026-11-10' });
  const by = Object.fromEntries(fu.items.map((f) => [f.term, f]));

  const a = by['ats pristine noida'];
  assert.strictEqual(a.status, 'on_time');
  assert.strictEqual(a.due, '2026-11-04');
  assert.deepStrictEqual([a.done.day, a.done.who, a.done.org, a.done.level, a.done.kind], ['2026-11-03', 'aman.k', 'ROI', 'campaign', 'term']);

  const g = by['gaur city flats'];
  assert.strictEqual(g.status, 'late', 'went in on 9 Nov, due 5 Nov');
  assert.strictEqual(g.days_late, 4);
  assert.strictEqual(g.cost_late, 50, 'spent on 6 Nov and 9 Nov (the day it went in), after the 5 Nov deadline');
  assert.strictEqual(g.cost_grace, 0);
  assert.strictEqual(g.done.kind, 'one_word', '-gaur is one word in broad match');

  const mh = by['mahagun mezzaria'];
  assert.strictEqual(mh.status, 'wrong_place', 'the negative went into the Villa ad group, the search runs in Flats');
  assert.strictEqual(mh.elsewhere, 'Villa');
  assert.strictEqual(mh.cost_late, 25, 'it kept costing after the deadline');

  const p = by['prateek grand'];
  assert.strictEqual(p.status, 'on_time', 'the shared list blocks it from 4 Nov');
  assert.deepStrictEqual([p.done.level, p.done.list], ['shared list', 'Competitors List']);

  const sp = by['supertech capetown'];
  assert.strictEqual(sp.status, 'open_in_time', 'called on 8 Nov, due 11 Nov, today is 10 Nov');
  assert.strictEqual(sp.cost_grace, 10);

  assert.strictEqual(by['luxury flats noida'].status, 'on_time');
  assert.strictEqual(by['3 bhk noida'].status, 'late');
  assert.strictEqual(by['3 bhk noida'].days_late, 3);
  assert.strictEqual(by['flats sector 115'].status, 'elsewhere');
  assert.strictEqual(by['flats sector 115'].elsewhere, C2);
  assert.strictEqual(by['flats near me'].status, 'open_overdue');
  assert.strictEqual(by['flats near me'].days_late, 5, 'due 5 Nov, still not a keyword on 10 Nov');
  assert.strictEqual(by['cheap flats'].owner, 'google', 'the CTM campaign is run by Google');

  const sc = F.scorecard(fu.items.filter((f) => f.owner === 'agency'));
  assert.deepStrictEqual([sc.ex.n, sc.ex.due, sc.ex.on_time, sc.ex.late, sc.ex.wrong_place, sc.ex.open_in_time], [5, 4, 2, 1, 1, 1]);
  assert.strictEqual(sc.ex.cost_late_done, 50);
  assert.strictEqual(sc.ex.cost_leaking, 25);
  assert.deepStrictEqual([sc.add.n, sc.add.on_time, sc.add.late, sc.add.elsewhere, sc.add.open_overdue], [4, 1, 1, 1, 1]);

  const t2 = fu.tabs.find((t) => t.day === '2026-11-02');
  assert.deepStrictEqual([t2.ex.n, t2.ex.late, t2.ex.wrong_place, t2.ex.on_time, t2.add.n], [3, 1, 1, 1, 3]);
  assert.deepStrictEqual(t2.went_in, ['2026-11-04', '2026-11-09']);

  const d9 = fu.change_days.find((d) => d.day === '2026-11-09');
  assert.deepStrictEqual(d9.neg, { n: 1, campaign: 1, ad_group: 0, list: 0, one_word: 1, full: 0 });
  assert.strictEqual(d9.other.length, 1, 'the target CPA change is listed');
  assert.deepStrictEqual(d9.people.map((x) => [x.who, x.org]).sort(), [['aman.k', 'ROI'], ['vaid.vivek', 'ROI']]);
});

test('whoOf: name before @ and the organisation, never the full address', async () => {
  const { whoOf } = await lib('followup-core.ts');
  assert.deepStrictEqual(whoOf('vaid.vivek.roimantra@example.com'), { who: 'vaid.vivek', org: 'ROI' });
  assert.deepStrictEqual(whoOf('aman.k@roimantra.example'), { who: 'aman.k', org: 'ROI' });
  assert.strictEqual(whoOf('bhavikcounty@example.com').org, 'County');
  assert.strictEqual(whoOf('Recommendations Auto-Apply').org, 'Google');
});
