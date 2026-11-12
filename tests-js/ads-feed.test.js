/**
 * Google Ads Script feed (ads-script/County_Search_QC_Feed.js): loads the script into a vm context with stub Google
 * services (nothing may run at load), unit-tests the pure functions with hand-written fake API rows, and runs main()
 * end to end against fake AdsApp / SpreadsheetApp objects. No real account data is used.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'ads-script', 'County_Search_QC_Feed.js');
const SRC = fs.readFileSync(FILE, 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

/** Stubs that record every call: loading the file must not touch any of them. */
function loadScript(services) {
  const calls = [];
  const trap = (name) => new Proxy({}, { get: (_, k) => () => { calls.push(name + '.' + String(k)); throw new Error('called at load'); } });
  const ctx = vm.createContext(Object.assign({
    AdsApp: trap('AdsApp'), SpreadsheetApp: trap('SpreadsheetApp'), Logger: trap('Logger'), Utilities: trap('Utilities')
  }, services || {}));
  vm.runInContext(SRC, ctx, { filename: 'County_Search_QC_Feed.js' });
  return { E: ctx, calls };
}

const { E, calls: loadCalls } = loadScript();

/* ---------- load and syntax rules ---------- */

test('loading the script calls no Google service and defines main and CONFIG', () => {
  assert.deepEqual(loadCalls, []);
  assert.equal(typeof E.main, 'function');
  assert.equal(E.CONFIG.SPREADSHEET_URL, 'PASTE_SPREADSHEET_URL_HERE');
  assert.equal(E.CONFIG.SEARCH_TERM_DAYS, 7);
  assert.equal(E.CONFIG.CHANGE_DAYS, 14);
  assert.equal(E.CONFIG.CAMPAIGN_DAYS, 30);
  assert.equal(E.CONFIG.KEYWORD_DAYS, 30);
  assert.equal(E.CONFIG.BACKFILL, false);
});

test('no syntax newer than ES2019 and no module or Intl use', () => {
  const code = SRC.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
  for (const [re, what] of [[/\?\.(?!\d)/, 'optional chaining'], [/\?\?/, 'nullish coalescing'], [/\.at\(/, 'Array.at'],
    [/replaceAll/, 'replaceAll'], [/Object\.hasOwn\(/, 'Object.hasOwn'], [/\b\d+_\d+\b/, 'numeric separator'],
    [/^\s*(import|export)\s/m, 'import/export'], [/\brequire\(/, 'require'], [/\bIntl\./, 'Intl'], [/Utilities\.parseCsv/, 'parseCsv']]) {
    assert.ok(!re.test(code), what + ' found');
  }
});

/* ---------- labels ---------- */

test('search-term match type labels, including AI Max by match type and by match source', () => {
  assert.equal(E.feedSearchTermMatch_('BROAD'), 'Broad match');
  assert.equal(E.feedSearchTermMatch_('PHRASE'), 'Phrase match');
  assert.equal(E.feedSearchTermMatch_('EXACT'), 'Exact match');
  assert.equal(E.feedSearchTermMatch_('NEAR_PHRASE'), 'Phrase match (close variant)');
  assert.equal(E.feedSearchTermMatch_('NEAR_EXACT'), 'Exact match (close variant)');
  assert.equal(E.feedSearchTermMatch_('AI_MAX'), 'AI Max');
  assert.equal(E.feedSearchTermMatch_('BROAD', 'AI_MAX_KEYWORDLESS'), 'AI Max');
  assert.equal(E.feedSearchTermMatch_('BROAD', 'AI_MAX_BROAD_MATCH'), 'AI Max');
  assert.equal(E.feedSearchTermMatch_('EXACT', 'ADVERTISER_PROVIDED_KEYWORD'), 'Exact match');
  assert.equal(E.feedSearchTermMatch_('UNKNOWN'), '');
});

test('ads status labels', () => {
  assert.equal(E.feedAdsStatus_('ADDED'), 'Added');
  assert.equal(E.feedAdsStatus_('EXCLUDED'), 'Excluded');
  assert.equal(E.feedAdsStatus_('ADDED_EXCLUDED'), 'Added/Excluded');
  assert.equal(E.feedAdsStatus_('NONE'), 'None');
  assert.equal(E.feedAdsStatus_('UNKNOWN'), 'None');
  assert.equal(E.feedAdsStatus_(undefined), 'None');
});

test('matched keyword and change-history keyword formats', () => {
  assert.equal(E.feedMatchedKeyword_('villas in gurgaon', 'EXACT'), '[villas in gurgaon]');
  assert.equal(E.feedMatchedKeyword_('villas in gurgaon', 'PHRASE'), 'villas in gurgaon');
  assert.equal(E.feedMatchedKeyword_('villas', 'BROAD'), 'villas');
  assert.equal(E.feedMatchedKeyword_(undefined, undefined), '-');
  assert.equal(E.feedKeywordItem_('golf links', 'PHRASE', true), '-"golf links"');
  assert.equal(E.feedKeywordItem_('a b', 'EXACT', true), '-[a b]');
  assert.equal(E.feedKeywordItem_('word', 'BROAD', true), '-word');
  assert.equal(E.feedKeywordItem_('a b', 'PHRASE', false), '"a b"');
});

test('bid strategy, campaign and keyword status labels', () => {
  assert.equal(E.feedBidLabel_('MAXIMIZE_CONVERSIONS'), 'Maximise Conversions');
  assert.equal(E.feedBidLabel_('TARGET_SPEND'), 'Maximise clicks');
  assert.equal(E.feedBidLabel_('TARGET_CPA'), 'Target CPA');
  assert.equal(E.feedBidLabel_('TARGET_IMPRESSION_SHARE'), 'Target Impression Share');
  assert.equal(E.feedBidLabel_('TARGET_ROAS'), 'Target ROAS');
  assert.equal(E.feedBidLabel_('MAXIMIZE_CONVERSION_VALUE'), 'Maximise conversion value');
  assert.equal(E.feedBidLabel_('MANUAL_CPC'), 'Manual CPC');
  assert.equal(E.feedCampaignStatus_('ENABLED'), 'Enabled');
  assert.equal(E.feedCampaignStatus_('PAUSED'), 'Paused');
  assert.equal(E.feedCampaignPrimary_('LIMITED'), 'Eligible (Limited)');
  assert.equal(E.feedCampaignReasons_(['BUDGET_CONSTRAINED', 'HAS_ADS_DISAPPROVED']), 'limited by budget; some ads disapproved');
  assert.equal(E.feedCampaignReasons_(['SOME_NEW_REASON']), 'some new reason');
  assert.equal(E.feedKeywordStatus_('ELIGIBLE', []), 'Eligible');
  assert.equal(E.feedKeywordStatus_('ELIGIBLE', ['AD_GROUP_CRITERION_LOW_QUALITY']), 'Limited');
  assert.equal(E.feedKeywordStatus_('NOT_ELIGIBLE', ['AD_GROUP_CRITERION_RARELY_SERVED']), 'Not eligible');
  assert.equal(E.feedKeywordStatus_('PAUSED', ['AD_GROUP_CRITERION_PAUSED']), 'Paused');
  assert.equal(E.feedKeywordReasons_(['AD_GROUP_CRITERION_LOW_QUALITY', 'AD_GROUP_CRITERION_RARELY_SERVED']), 'rarely served; low quality');
  assert.equal(E.feedKeywordReasons_(['AD_GROUP_CRITERION_RARELY_SERVED', 'AD_GROUP_CRITERION_PAUSED']), 'paused; rarely served');
  assert.equal(E.feedKeywordMatch_('PHRASE'), 'Phrase');
  assert.equal(E.feedQuality_('ABOVE_AVERAGE'), 'Above average');
  assert.equal(E.feedQuality_('BELOW_AVERAGE'), 'Below average');
  assert.equal(E.feedQuality_('UNSPECIFIED'), '');
});

/* ---------- numbers ---------- */

test('impression-share sentinels 0.0999 and 0.9001 become null; fractions become 2-decimal percentages', () => {
  assert.equal(E.feedSharePct_(0.0999), null);
  assert.equal(E.feedSharePct_(0.9001), null);
  assert.equal(E.feedSharePct_('0.9001'), null);
  assert.equal(E.feedSharePct_(undefined), null);
  assert.equal(E.feedSharePct_(null), null);
  assert.equal(E.feedSharePct_(0), 0);
  assert.equal(E.feedSharePct_(0.123456), 12.35);
  assert.equal(E.feedSharePct_(1), 100);
});

test('micros to rupees and half-up rounding', () => {
  assert.equal(E.feedMicros_('1500000000'), 1500);
  assert.equal(E.feedMicros_(511800000), 511.8);
  assert.equal(E.feedMicros_(1234567), 1.23);
  assert.equal(E.feedMicros_(1235000), 1.24);
  assert.equal(E.feedMicros_(undefined), null);
  assert.equal(E.feedRound_(1.005, 2), 1.01);
  assert.equal(E.feedRound_(-2.5), -3);
  assert.equal(E.feedRound_(1e-7, 2), 0);
});

test('rupee formatting with Indian digit grouping', () => {
  assert.equal(E.feedInr_(0), '₹0.00');
  assert.equal(E.feedInr_(511.8), '₹511.80');
  assert.equal(E.feedInr_(1500), '₹1,500.00');
  assert.equal(E.feedInr_(2700), '₹2,700.00');
  assert.equal(E.feedInr_(150000), '₹1,50,000.00');
  assert.equal(E.feedInr_(12345678.9), '₹1,23,45,678.90');
  assert.equal(E.feedInr_(100000000), '₹10,00,00,000.00');
  assert.equal(E.feedInr_(999.999), '₹1,000.00');
  assert.equal(E.feedInr_(-1936.52), '-₹1,936.52');
  assert.equal(E.feedInr_(null), '');
});

test('dates, time stamps and the run plan', () => {
  assert.equal(E.feedAddDays_('2026-11-01', -1), '2026-10-31');
  assert.equal(E.feedAddDays_('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(plain(E.feedTs_('2026-11-03 16:43:34.123456')), { ts: '2026-11-03T16:43:34', day: '2026-11-03' });
  assert.deepEqual(plain(E.feedTs_('2026-11-03T16:43:34')), { ts: '2026-11-03T16:43:34', day: '2026-11-03' });
  const p = E.feedPlan_({ SEARCH_TERM_DAYS: 7, CHANGE_DAYS: 14, CAMPAIGN_DAYS: 30, KEYWORD_DAYS: 30, BACKFILL: false }, '2026-11-06');
  assert.deepEqual(plain(p.search_terms), { from: '2026-10-30', to: '2026-11-05', days: 7 });
  assert.equal(p.changes.from, '2026-10-23');
  assert.equal(p.changes.until, '2026-11-07');
  assert.equal(p.campaign_days.from, '2026-10-07');
  assert.equal(p.keywords.to, '2026-11-05');
  const b = E.feedPlan_({ CHANGE_DAYS: 90, BACKFILL: true }, '2026-11-06');
  assert.equal(b.search_terms.days, 30);
  assert.equal(b.changes.days, 29);
  assert.equal(E.feedPlan_({ CHANGE_DAYS: 90 }, '2026-11-06').changes.days, 29);
});

/* ---------- row builders ---------- */

test('search_term_view row -> search_terms row; rows that only differ in case are summed', () => {
  const r = (term, clicks, micros, source) => ({
    segments: { date: '2026-11-05', searchTermMatchType: 'NEAR_EXACT', searchTermMatchSource: source,
      keyword: { info: { text: 'villas in gurgaon', matchType: 'EXACT' } } },
    searchTermView: { searchTerm: term, status: 'NONE' },
    campaign: { name: 'Ivory Search' }, adGroup: { name: 'Villas' },
    metrics: { clicks: String(clicks), impressions: '10', costMicros: String(micros), conversions: 1 }
  });
  const rows = plain(E.feedAggregateSearchTerms_([r('  Villa In Gurgaon ', 2, 1500000, 'ADVERTISER_PROVIDED_KEYWORD'),
    r('villa in gurgaon', 1, 1005000, 'ADVERTISER_PROVIDED_KEYWORD')].map(E.feedSearchTermRow_)));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { day: '2026-11-05', term: 'villa in gurgaon', match_type: 'Exact match (close variant)',
    ads_status: 'None', campaign: 'Ivory Search', ad_group: 'Villas', keyword: '[villas in gurgaon]',
    clicks: 3, impr: 20, cost: 2.51, conv: 2 });
  const kwless = plain(E.feedSearchTermRow_({ segments: { date: '2026-11-05', searchTermMatchType: 'BROAD',
    searchTermMatchSource: 'AI_MAX_KEYWORDLESS' }, searchTermView: { searchTerm: 'x' }, metrics: {} }));
  assert.equal(kwless.match_type, 'AI Max');
  assert.equal(kwless.keyword, '-');
  assert.equal(kwless.ads_status, 'None');
});

test('campaign row -> campaign_days row', () => {
  const row = plain(E.feedCampaignDayRow_({
    segments: { date: '2026-11-05' },
    campaign: { id: '123', name: 'Clove Search', status: 'ENABLED', primaryStatus: 'LIMITED',
      primaryStatusReasons: ['BUDGET_CONSTRAINED'], biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
      maximizeConversions: { targetCpaMicros: '800000000' } },
    campaignBudget: { amountMicros: '2700000000' },
    metrics: { impressions: '100', clicks: '9', costMicros: '1234560000', conversions: 2, allConversions: 3.5,
      searchImpressionShare: 0.0999, searchBudgetLostImpressionShare: 0.25, searchRankLostImpressionShare: 0.9001,
      searchTopImpressionShare: 0.5, searchAbsoluteTopImpressionShare: 0.12345 }
  }));
  assert.deepEqual(row, { day: '2026-11-05', campaign: 'Clove Search', campaign_id: '123', campaign_status: 'Enabled',
    status: 'Eligible (Limited)', status_reasons: 'limited by budget', bid_strategy: 'Maximise Conversions',
    budget_now: 2700, target_cpa_now: 800, impr: 100, clicks: 9, cost: 1234.56, conv: 2, all_conv: 3.5,
    is_pct: null, lost_budget_pct: 25, lost_rank_pct: null, top_is_pct: 50, abs_top_is_pct: 12.35 });
  const manual = plain(E.feedCampaignDayRow_({ campaign: { biddingStrategyType: 'TARGET_SPEND' }, metrics: {} }));
  assert.equal(manual.target_cpa_now, null);
  assert.equal(manual.is_pct, null);
  assert.equal(manual.cost, 0);
});

test('keyword rows: criteria joined to metrics, keywords without metrics still listed', () => {
  const crit = (rn, text, mt, status, ps, reasons, qi) => ({
    adGroupCriterion: { resourceName: rn, keyword: { text, matchType: mt }, status, primaryStatus: ps,
      primaryStatusReasons: reasons, qualityInfo: qi },
    adGroup: { name: 'AG' }, campaign: { name: 'Jade Search' }
  });
  const rows = plain(E.feedKeywordRows_([
    crit('c/1', 'jade county', 'PHRASE', 'ENABLED', 'ELIGIBLE', ['AD_GROUP_CRITERION_LOW_QUALITY'],
      { qualityScore: 4, creativeQualityScore: 'AVERAGE', postClickQualityScore: 'BELOW_AVERAGE' }),
    crit('c/2', 'jade villas', 'EXACT', 'PAUSED', 'PAUSED', ['AD_GROUP_CRITERION_PAUSED'], undefined)
  ], [
    { adGroupCriterion: { resourceName: 'c/1' }, metrics: { costMicros: '5000000', clicks: '2', impressions: '40',
      conversions: 1, searchImpressionShare: 0.4, searchRankLostImpressionShare: 0.9001 } }
  ], '2026-10-07', '2026-11-05'));
  assert.equal(rows.length, 2);
  // keyword spelled as the search keyword report spells it: phrase '"x"', exact '[x]', broad 'x'
  assert.deepEqual(rows[0], { period_start: '2026-10-07', day: '2026-11-05', keyword_status: 'Enabled', keyword: '"jade county"',
    match_type: 'Phrase', campaign: 'Jade Search', ad_group: 'AG', status: 'Limited', status_reasons: 'low quality',
    cost: 5, clicks: 2, impr: 40, conv: 1, quality_score: 4, ad_relevance: 'Average', landing_page: 'Below average',
    is_pct: 40, lost_rank_pct: null });
  assert.deepEqual(rows[1], { period_start: '2026-10-07', day: '2026-11-05', keyword_status: 'Paused', keyword: '[jade villas]',
    match_type: 'Exact', campaign: 'Jade Search', ad_group: 'AG', status: 'Paused', status_reasons: 'paused',
    cost: 0, clicks: 0, impr: 0, conv: 0, quality_score: null, ad_relevance: '', landing_page: '',
    is_pct: null, lost_rank_pct: null });
  const broad = plain(E.feedKeywordRows_([crit('c/3', 'villas', 'BROAD', 'ENABLED', 'ELIGIBLE', [], {})], [], 'a', 'b'));
  assert.equal(broad[0].keyword, 'villas');
});

test('campaign status reasons are written in a fixed order, whatever order the API uses', () => {
  assert.equal(E.feedCampaignReasons_(['SEARCH_VOLUME_LIMITED', 'BUDGET_CONSTRAINED']), 'limited by budget; Missing enough relevant keywords');
  assert.equal(E.feedCampaignReasons_(['HAS_ADS_DISAPPROVED', 'NEW_THING', 'BUDGET_CONSTRAINED']),
    'limited by budget; some ads disapproved; new thing');
  assert.equal(E.feedCampaignReasons_('BUDGET_CONSTRAINED'), 'limited by budget');
  assert.equal(E.feedCampaignReasons_(undefined), '');
});

test('row cap: whole oldest days dropped, newest changes kept, keyword snapshot refused', () => {
  const days = (n, per) => { const out = []; for (let d = 1; d <= n; d++) for (let i = 0; i < per; i++) out.push({ day: '2026-11-0' + d, i }); return out; };
  const st = E.feedCapRows_('search_terms', days(3, 4), 9);
  assert.equal(st.rows.length, 8);
  assert.deepEqual([...new Set(plain(st.rows).map((r) => r.day))], ['2026-11-02', '2026-11-03']);
  assert.match(st.note, /kept whole days from 2026-11-02/);
  const ok = E.feedCapRows_('campaign_days', days(2, 2), 10);
  assert.equal(ok.rows.length, 4);
  assert.equal(ok.note, '');
  const ch = E.feedCapRows_('changes', days(3, 4), 5);
  assert.equal(ch.rows.length, 5);
  assert.equal(ch.rows[4].day, '2026-11-03');
  assert.throws(() => E.feedCapRows_('keywords', days(1, 3), 2), /snapshot stays complete/);
});

test('value conventions agree with the exports in data/fixtures (skipped when the fixtures are absent)', (t) => {
  const p = path.join(__dirname, '..', 'data', 'fixtures', 'tables.json');
  if (!fs.existsSync(p)) return t.skip('no fixtures');
  const T = JSON.parse(fs.readFileSync(p, 'utf8'));
  const mt = { Phrase: 'PHRASE', Exact: 'EXACT', Broad: 'BROAD' };
  for (const r of T.keywords || []) {
    if (r.keyword_status === 'Total') continue;
    const text = r.keyword.replace(/^["[]|["\]]$/g, '');
    assert.equal(E.feedKeywordItem_(text, mt[r.match_type], false), r.keyword, 'keyword spelling');
    assert.ok(['Eligible', 'Limited', 'Not eligible', 'Paused'].includes(r.status), 'keyword status');
  }
  const kwWords = new Set(E.FEED_KEYWORD_REASONS.map((x) => x[1]));
  for (const r of T.keywords || []) for (const w of r.status_reasons ? r.status_reasons.split('; ') : []) assert.ok(kwWords.has(w), 'keyword reason');
  const campWords = new Set(Object.values(E.FEED_CAMPAIGN_REASON_LABELS));
  const order = Object.values(E.FEED_CAMPAIGN_REASON_LABELS);
  for (const r of T.campaign_days || []) {
    const parts = r.status_reasons ? r.status_reasons.split('; ') : [];
    for (const w of parts) assert.ok(campWords.has(w), 'campaign reason');
    assert.deepEqual(parts, [...parts].sort((a, b) => order.indexOf(a) - order.indexOf(b)), 'campaign reason order');
    assert.ok(Object.values(E.FEED_BID_LABELS).includes(r.bid_strategy), 'bid strategy label');
    assert.ok(Object.values(E.FEED_CAMPAIGN_PRIMARY_LABELS).includes(r.status), 'campaign status label');
  }
  const stLabels = new Set(Object.values(E.FEED_ST_MATCH_LABELS));
  for (const r of T.search_terms || []) {
    assert.ok(stLabels.has(r.match_type), 'search-term match type');
    assert.ok(['Added', 'Excluded', 'Added/Excluded', 'None'].includes(r.ads_status), 'ads status');
  }
});

/* ---------- change events ---------- */

const CTX = {
  campaigns: { 'customers/1/campaigns/11': { name: 'Ivory_CTM', budget: 'customers/1/campaignBudgets/91' },
    'customers/1/campaigns/12': { name: 'Jade_Brand', budget: 'customers/1/campaignBudgets/92' } },
  adGroups: { 'customers/1/adGroups/21': { name: 'Villas', campaign: 'customers/1/campaigns/11' } },
  budgetCampaigns: { 'customers/1/campaignBudgets/91': ['Ivory_CTM'], 'customers/1/campaignBudgets/92': ['Jade_Brand'] },
  criteria: { 'customers/1/adGroupCriteria/21~77': { text: 'luxury villas', matchType: 'BROAD', negative: false } }
};

const ev = (o) => ({ changeEvent: Object.assign({ changeDateTime: '2026-11-03 16:43:34.000123', userEmail: 'agent@example.com',
  campaign: 'customers/1/campaigns/11', adGroup: 'customers/1/adGroups/21' }, o) });

test('negative keyword added at ad group level', () => {
  const rows = plain(E.feedMapChange_(ev({ changeResourceType: 'AD_GROUP_CRITERION', resourceChangeOperation: 'CREATE',
    changedFields: 'keyword.text,keyword.matchType,negative',
    newResource: { adGroupCriterion: { negative: true, keyword: { text: 'golf links', matchType: 'PHRASE' } } } }), CTX));
  assert.deepEqual(rows, [{ ts: '2026-11-03T16:43:34', day: '2026-11-03', user: 'agent@example.com', campaign: 'Ivory_CTM',
    ad_group: 'Villas', kind: 'negative phrase match keyword added', item: '-"golf links"' }]);
});

test('campaign-level negative and positive keyword adds', () => {
  const neg = plain(E.feedMapChange_(ev({ adGroup: '', changeResourceType: 'CAMPAIGN_CRITERION', resourceChangeOperation: 'CREATE',
    newResource: { campaignCriterion: { keyword: { text: 'a b', matchType: 'EXACT' }, negative: true } } }), CTX));
  assert.equal(neg[0].kind, 'negative exact match keyword added');
  assert.equal(neg[0].item, '-[a b]');
  assert.equal(neg[0].ad_group, '');
  assert.equal(neg[0].campaign, 'Ivory_CTM');
  const pos = plain(E.feedMapChange_(ev({ changeResourceType: 'AD_GROUP_CRITERION', resourceChangeOperation: 'CREATE',
    newResource: { adGroupCriterion: { keyword: { text: 'a b', matchType: 'BROAD' } } } }), CTX));
  assert.equal(pos[0].kind, 'broad match keyword added');
  assert.equal(pos[0].item, 'a b');
});

test('keyword removed: keyword taken from old_resource when new_resource is empty', () => {
  const rows = plain(E.feedMapChange_(ev({ changeResourceType: 'AD_GROUP_CRITERION', resourceChangeOperation: 'REMOVE',
    newResource: {}, oldResource: { adGroupCriterion: { keyword: { text: 'sector 88a flats', matchType: 'PHRASE' } } } }), CTX));
  assert.equal(rows[0].kind, 'phrase match keyword removed');
  assert.equal(rows[0].item, '"sector 88a flats"');
});

test('keyword status update uses the looked-up keyword', () => {
  const rows = plain(E.feedMapChange_(ev({ changeResourceType: 'AD_GROUP_CRITERION', resourceChangeOperation: 'UPDATE',
    changeResourceName: 'customers/1/adGroupCriteria/21~77', changedFields: 'status',
    oldResource: { adGroupCriterion: { status: 'ENABLED' } }, newResource: { adGroupCriterion: { status: 'PAUSED' } } }), CTX));
  assert.equal(rows[0].kind, 'broad match keyword paused');
  assert.equal(rows[0].item, 'luxury villas: Status changed from enabled to paused');
});

test('budget amount change, campaign found through the budget', () => {
  const up = plain(E.feedMapChange_(ev({ campaign: '', adGroup: '', changeResourceType: 'CAMPAIGN_BUDGET',
    resourceChangeOperation: 'UPDATE', changeResourceName: 'customers/1/campaignBudgets/91', changedFields: 'amountMicros',
    oldResource: { campaignBudget: { amountMicros: '1500000000' } }, newResource: { campaignBudget: { amountMicros: '2700000000' } } }), CTX));
  assert.deepEqual(up, [{ ts: '2026-11-03T16:43:34', day: '2026-11-03', user: 'agent@example.com', campaign: 'Ivory_CTM',
    ad_group: '', kind: 'budget amount increased', item: 'Ivory_CTM: Budget amount changed from ₹1,500.00 to ₹2,700.00' }]);
  const down = plain(E.feedMapChange_(ev({ campaign: 'customers/1/campaigns/12', adGroup: '', changeResourceType: 'CAMPAIGN_BUDGET',
    resourceChangeOperation: 'UPDATE', changedFields: ['amount_micros'],
    oldResource: { campaignBudget: { amountMicros: '300000000000' } }, newResource: { campaignBudget: { amountMicros: '150000000000' } } }), CTX));
  assert.equal(down[0].kind, 'budget amount decreased');
  assert.equal(down[0].item, 'Jade_Brand: Budget amount changed from ₹3,00,000.00 to ₹1,50,000.00');
});

test('target CPA changes: increased, decreased, newly set', () => {
  const tcpa = (o, n, member) => plain(E.feedMapChange_(ev({ adGroup: '', changeResourceType: 'CAMPAIGN', resourceChangeOperation: 'UPDATE',
    changedFields: { paths: [member + '.target_cpa_micros'] },
    oldResource: { campaign: o === null ? {} : { [E.feedCamel_(member)]: { targetCpaMicros: o } } },
    newResource: { campaign: { [E.feedCamel_(member)]: { targetCpaMicros: n } } } }), CTX))[0];
  const a = tcpa('511800000', '800000000', 'maximize_conversions');
  assert.equal(a.kind, 'Campaign changed');
  assert.equal(a.item, 'Target CPA increased from ₹511.80 to ₹800.00');
  assert.equal(a.ad_group, '');
  assert.equal(tcpa('800000000', '600000000', 'target_cpa').item, 'Target CPA decreased from ₹800.00 to ₹600.00');
  assert.equal(tcpa(null, '511800000', 'maximize_conversions').item, 'Target CPA is ₹511.80');
});

test('bid strategy type change', () => {
  const rows = plain(E.feedMapChange_(ev({ adGroup: '', changeResourceType: 'CAMPAIGN', resourceChangeOperation: 'UPDATE',
    changedFields: 'maximizeConversions,targetSpend',
    oldResource: { campaign: { maximizeConversions: {} } }, newResource: { campaign: { targetSpend: {} } } }), CTX));
  assert.equal(rows[0].kind, 'Campaign changed');
  assert.equal(rows[0].item, 'Campaign bid strategy type changed from ‘Maximise conversions’ to ‘Maximise clicks’');
  const typed = plain(E.feedMapChange_(ev({ changeResourceType: 'CAMPAIGN', resourceChangeOperation: 'UPDATE',
    changedFields: 'biddingStrategyType,name', oldResource: { campaign: { biddingStrategyType: 'TARGET_SPEND', name: 'a' } },
    newResource: { campaign: { biddingStrategyType: 'TARGET_CPA', name: 'b' } } }), CTX));
  assert.equal(typed[0].item, 'Campaign bid strategy type changed from ‘Maximise clicks’ to ‘Target CPA’ | name');
  const portfolio = plain(E.feedMapChange_(ev({ adGroup: '', changeResourceType: 'CAMPAIGN', resourceChangeOperation: 'UPDATE',
    changedFields: 'targetSpend,targetCpc', oldResource: { campaign: { targetSpend: {} } }, newResource: { campaign: { targetCpc: {} } } }), CTX));
  assert.match(portfolio[0].item, /to ‘Target CPC’$/);
});

test('campaign paused / enabled: change-history wording', () => {
  const paused = plain(E.feedMapChange_(ev({ adGroup: '', changeResourceType: 'CAMPAIGN', resourceChangeOperation: 'UPDATE',
    changedFields: 'status', oldResource: { campaign: { status: 'ENABLED' } }, newResource: { campaign: { status: 'PAUSED' } } }), CTX));
  assert.deepEqual(paused.map((r) => [r.kind, r.item, r.campaign, r.ad_group]),
    [['campaign paused', 'Status changed from active to paused', 'Ivory_CTM', '']]);
  const both = plain(E.feedMapChange_(ev({ adGroup: '', changeResourceType: 'CAMPAIGN', resourceChangeOperation: 'UPDATE',
    changedFields: 'status,maximizeConversions.targetCpaMicros,name',
    oldResource: { campaign: { status: 'PAUSED', maximizeConversions: { targetCpaMicros: '500000000' } } },
    newResource: { campaign: { status: 'ENABLED', maximizeConversions: { targetCpaMicros: '600000000' } } } }), CTX));
  assert.deepEqual(both.map((r) => [r.kind, r.item]), [['campaign active', 'Status changed from paused to active'],
    ['Campaign changed', 'Target CPA increased from ₹500.00 to ₹600.00 | name']]);
  const statusAndName = plain(E.feedMapChange_(ev({ adGroup: '', changeResourceType: 'CAMPAIGN', resourceChangeOperation: 'UPDATE',
    changedFields: 'status,name', oldResource: { campaign: { status: 'ENABLED' } }, newResource: { campaign: { status: 'REMOVED' } } }), CTX));
  assert.deepEqual(statusAndName.map((r) => r.kind), ['campaign removed', 'Campaign changed']);
  assert.equal(statusAndName[1].item, 'name');
});

test('AI Max: ad group disable search term matching', () => {
  const rows = plain(E.feedMapChange_(ev({ changeResourceType: 'AD_GROUP', resourceChangeOperation: 'UPDATE',
    changedFields: 'aiMaxAdGroupSetting.disableSearchTermMatching',
    oldResource: { adGroup: {} }, newResource: { adGroup: { aiMaxAdGroupSetting: { disableSearchTermMatching: true } } } }), CTX));
  assert.deepEqual(rows, [{ ts: '2026-11-03T16:43:34', day: '2026-11-03', user: 'agent@example.com', campaign: 'Ivory_CTM',
    ad_group: 'Villas', kind: 'Ad group changed', item: 'Disable search term matching changed from False to True' }]);
  const back = plain(E.feedMapChange_(ev({ changeResourceType: 'AD_GROUP', resourceChangeOperation: 'UPDATE',
    changedFields: 'aiMaxAdGroupSetting.disableSearchTermMatching',
    oldResource: { adGroup: { aiMaxAdGroupSetting: { disableSearchTermMatching: true } } },
    newResource: { adGroup: { aiMaxAdGroupSetting: { disableSearchTermMatching: false } } } }), CTX));
  assert.equal(back[0].item, 'Disable search term matching changed from True to False');
});

test('unknown resources: kind from the resource type, item from the changed field paths', () => {
  const rows = plain(E.feedMapChange_(ev({ changeResourceType: 'CAMPAIGN_ASSET', resourceChangeOperation: 'UPDATE',
    changedFields: 'status,fieldType' }), CTX));
  assert.equal(rows[0].kind, 'Campaign asset changed');
  assert.equal(rows[0].item, 'status, field_type');
  const budget = plain(E.feedMapChange_(ev({ changeResourceType: 'CAMPAIGN_BUDGET', resourceChangeOperation: 'UPDATE',
    changedFields: 'name', oldResource: { campaignBudget: { name: 'x' } }, newResource: { campaignBudget: { name: 'y' } } }), CTX));
  assert.equal(budget[0].kind, 'Budget changed');
  assert.equal(budget[0].item, 'name');
  const created = plain(E.feedMapChange_(ev({ changeResourceType: 'AD_GROUP', resourceChangeOperation: 'CREATE',
    changedFields: '', newResource: { adGroup: { name: 'New AG' } } }), CTX));
  assert.equal(created[0].kind, 'Ad group created');
  assert.equal(created[0].item, 'New AG');
  const nameless = plain(E.feedMapChange_(ev({ campaign: 'customers/1/campaigns/999', adGroup: '', changeResourceType: 'FEED_ITEM',
    resourceChangeOperation: 'UPDATE', changedFields: 'attributeValues' }), CTX));
  assert.equal(nameless[0].campaign, '');
  assert.equal(nameless[0].kind, 'Feed item changed');
});

/* ---------- text safety ---------- */

test('cell text safety: formulas, negatives, days, numbers, percentages and booleans stay text', () => {
  assert.equal(E.feedCell_('=IMPORTXML("http://x","//a")'), '\'=IMPORTXML("http://x","//a")');
  assert.equal(E.feedCell_('+91 98'), "'+91 98");
  assert.equal(E.feedCell_('-"golf links"'), '\'-"golf links"');
  assert.equal(E.feedCell_('-[a b]'), "'-[a b]");
  assert.equal(E.feedCell_('@home'), "'@home");
  assert.equal(E.feedCell_('2026-11-05'), "'2026-11-05");
  assert.equal(E.feedCell_('2026-11-03T16:43:34'), "'2026-11-03T16:43:34");
  assert.equal(E.feedCell_('12.5%'), "'12.5%");
  assert.equal(E.feedCell_('1,500'), "'1,500");
  assert.equal(E.feedCell_('5 nov'), "'5 nov");
  assert.equal(E.feedCell_('TRUE'), "'TRUE");
  assert.equal(E.feedCell_('#N/A'), "'#N/A");
  assert.equal(E.feedCell_({ a: 1 }), '{"a":1}');
  assert.equal(E.feedCell_('3 bhk flats'), '3 bhk flats');
  assert.equal(E.feedCell_('villas in gurgaon'), 'villas in gurgaon');
  assert.equal(E.feedCell_(12.5), 12.5);
  assert.equal(E.feedCell_(null), '');
  assert.equal(E.feedCell_(NaN), '');
  const v = plain(E.feedValues_(['day', 'term', 'clicks'], [{ day: '2026-11-05', term: '=1+1', clicks: 3 }]));
  assert.deepEqual(v, [['day', 'term', 'clicks'], ["'2026-11-05", "'=1+1", 3]]);
});

/* ---------- queries ---------- */

test('GAQL: required filters are present', () => {
  const st = E.feedSearchTermQuery_('2026-10-30', '2026-11-05', true);
  assert.match(st, /FROM search_term_view/);
  assert.match(st, /segments\.date BETWEEN '2026-10-30' AND '2026-11-05'/);
  assert.match(st, /advertising_channel_type = 'SEARCH'/);
  assert.match(st, /metrics\.clicks > 0/);
  assert.match(st, /segments\.search_term_match_source/);
  assert.doesNotMatch(E.feedSearchTermQuery_('a', 'b', false), /search_term_match_source/);
  const ch = E.feedChangeQuery_('2026-10-23', '2026-11-07');
  assert.match(ch, /change_event\.change_date_time >= '2026-10-23'/);
  assert.match(ch, /LIMIT 10000$/);
  assert.match(E.feedKeywordCriteriaQuery_(), /negative = FALSE/);
  assert.match(E.feedCriteriaLookupQuery_('AD_GROUP_CRITERION', ["x'y"]), /IN \('x\\'y'\)/);
});

/* ---------- main() end to end with fake services ---------- */

function fakeServices(opts = {}) {
  const sheets = {};
  const logs = [];
  const queries = [];
  const iter = (rows) => { let i = 0; return { hasNext: () => i < rows.length, next: () => rows[i++] }; };
  const data = {
    search_term_view: [{ segments: { date: '2026-11-05', searchTermMatchType: 'PHRASE', keyword: { info: { text: 'villas', matchType: 'PHRASE' } } },
      searchTermView: { searchTerm: '=HYPERLINK("x")', status: 'EXCLUDED' }, campaign: { name: 'Ivory' }, adGroup: { name: 'AG' },
      metrics: { clicks: '1', impressions: '3', costMicros: '45670000', conversions: 0 } }],
    change_event: [ev({ changeResourceType: 'AD_GROUP_CRITERION', resourceChangeOperation: 'CREATE',
      newResource: { adGroupCriterion: { negative: true, keyword: { text: 'rent', matchType: 'BROAD' } } } }).changeEvent]
      .map((c) => ({ changeEvent: Object.assign({ resourceName: 'customers/1/changeEvents/1' }, c) })),
    campaign_names: [{ campaign: { resourceName: 'customers/1/campaigns/11', name: 'Ivory_CTM', campaignBudget: 'customers/1/campaignBudgets/91' } }],
    ad_group: [{ adGroup: { resourceName: 'customers/1/adGroups/21', name: 'Villas' }, campaign: { resourceName: 'customers/1/campaigns/11' } }],
    campaign_days: [{ segments: { date: '2026-11-05' }, campaign: { id: '11', name: 'Ivory_CTM', status: 'ENABLED', primaryStatus: 'ELIGIBLE',
      biddingStrategyType: 'TARGET_SPEND' }, campaignBudget: { amountMicros: '1500000000' }, metrics: { impressions: '5' } }],
    ad_group_criterion: [{ adGroupCriterion: { resourceName: 'c/1', keyword: { text: 'villas', matchType: 'PHRASE' }, status: 'ENABLED',
      primaryStatus: 'ELIGIBLE' }, adGroup: { name: 'AG' }, campaign: { name: 'Ivory' } }],
    keyword_view: []
  };
  if (opts.changePages) data.change_event = opts.changePages[0];
  let changeCalls = 0;
  const AdsApp = {
    currentAccount: () => ({ getTimeZone: () => opts.tz || 'Asia/Kolkata', getCustomerId: () => '123-456-7890', getName: () => 'Test account',
      getCurrencyCode: () => 'INR' }),
    getExecutionInfo: () => ({ isPreview: () => true }),
    search: (q) => {
      queries.push(q);
      if (opts.failKeywords && /FROM ad_group_criterion/.test(q)) throw new Error('boom');
      if (/FROM search_term_view/.test(q)) return iter(data.search_term_view);
      if (/FROM change_event/.test(q) && opts.changePages) {
        changeCalls++;
        if (changeCalls === 1) return iter(opts.changePages[0]);
        if (opts.refuseDateTime) throw new Error('INVALID_DATE_TIME');
        return iter(opts.changePages[1]);
      }
      if (/FROM change_event/.test(q)) return iter(data.change_event);
      if (/FROM campaign WHERE/.test(q)) return iter(data.campaign_days);
      if (/FROM campaign$/.test(q)) return iter(data.campaign_names);
      if (/FROM ad_group$/.test(q)) return iter(data.ad_group);
      if (/FROM ad_group_criterion/.test(q)) return iter(data.ad_group_criterion);
      if (/FROM keyword_view/.test(q)) return iter(data.keyword_view);
      throw new Error('unexpected query ' + q);
    },
    mutate: () => { throw new Error('the feed must never change the account'); }
  };
  // Like a real sheet: a new tab has 1000 x 26 cells and a range outside the sheet is refused.
  const makeSheet = (name, rows = 1000, cols = 26) => ({ name, values: null, cleared: 0, rows, cols, writes: 0,
    clear() { this.cleared++; this.values = null; },
    getMaxRows() { return this.rows; },
    getMaxColumns() { return this.cols; },
    insertRowsAfter(after, n) { assert.equal(after, this.rows); this.rows += n; },
    insertColumnsAfter(after, n) { assert.equal(after, this.cols); this.cols += n; },
    deleteRows(start, n) { assert.ok(start >= 2 && start + n - 1 <= this.rows); this.rows -= n; },
    getRange(r, c, nr, nc) {
      const s = this;
      assert.ok(nr >= 1 && nc >= 1, 'empty range');
      assert.ok(r + nr - 1 <= s.rows && c + nc - 1 <= s.cols, 'range outside the sheet');
      return { setValues(v) { assert.equal(v.length, nr); assert.equal(v[0].length, nc); s.values = v; s.writes++; } };
    } });
  if (opts.bigSheet) sheets.feed_search_terms = makeSheet('feed_search_terms', 5000, 26);
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n))
  };
  const SpreadsheetApp = { openByUrl: (u) => { assert.match(u, /docs\.google\.com\/spreadsheets/); return ss; } };
  const Utilities = { formatDate: (d, tz, fmt) => (fmt === 'yyyy-MM-dd' ? '2026-11-06' : '2026-11-06T07:00:05') };
  const Logger = { log: (s) => logs.push(String(s)) };
  return { services: { AdsApp, SpreadsheetApp, Utilities, Logger }, sheets, logs, queries };
}

test('main() writes the five feed tabs with headers, safe text and feed_meta', () => {
  const f = fakeServices();
  const { E: S } = loadScript(f.services);
  S.CONFIG.SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc/edit';
  S.main();
  assert.deepEqual(Object.keys(f.sheets).sort(), ['feed_campaign_days', 'feed_changes', 'feed_keywords', 'feed_meta', 'feed_search_terms']);
  const st = plain(f.sheets.feed_search_terms.values);
  assert.deepEqual(st[0], plain(S.FEED_COLUMNS.search_terms));
  assert.deepEqual(st[1], ["'2026-11-05", '\'=hyperlink("x")', 'Phrase match', 'Excluded', 'Ivory', 'AG', 'villas', 1, 3, 45.67, 0]);
  const ch = plain(f.sheets.feed_changes.values);
  assert.deepEqual(ch[1], ["'2026-11-03T16:43:34", "'2026-11-03", 'agent@example.com', 'Ivory_CTM', 'Villas',
    'negative broad match keyword added', "'-rent"]);
  const cd = plain(f.sheets.feed_campaign_days.values);
  assert.equal(cd[1][6], 'Maximise clicks');
  assert.equal(cd[1][7], 1500);
  const kw = plain(f.sheets.feed_keywords.values);
  assert.equal(kw.length, 2);
  assert.equal(kw[1][3], '"villas"');
  assert.equal(kw[1][7], 'Eligible');
  const meta = Object.fromEntries(plain(f.sheets.feed_meta.values).slice(1));
  assert.equal(meta.account_id, "'123-456-7890");
  assert.equal(meta.search_terms_rows, 1);
  assert.equal(meta.search_terms_from, "'2026-10-30");
  assert.equal(meta.changes_from, "'2026-10-23");
  assert.equal(meta.script_version, "'1.0.1");
  assert.equal(meta.preview, "'true");
  assert.equal(meta.time_zone_note, undefined);
  assert.equal(meta.status, 'ok');
  for (const s of Object.values(f.sheets)) assert.equal(s.writes, 1, s.name + ' written in one setValues call');
  assert.ok(f.queries.every((q) => /^SELECT /.test(q)));
  assert.ok(f.logs.length < 20);
});

test('main() keeps going when one section fails and records the error in feed_meta', () => {
  const f = fakeServices({ failKeywords: true });
  const { E: S } = loadScript(f.services);
  S.CONFIG.SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc/edit';
  S.main();
  const meta = Object.fromEntries(plain(f.sheets.feed_meta.values).slice(1));
  assert.equal(meta.keywords_error, 'boom');
  assert.equal(meta.keywords_rows, 0);
  assert.equal(meta.search_terms_error, '');
  assert.equal(meta.status, '1 section(s) failed');
  assert.deepEqual(plain(f.sheets.feed_keywords.values), [plain(S.FEED_COLUMNS.keywords)]);
  assert.equal(plain(f.sheets.feed_campaign_days.values).length, 2);
});

test('main(): a feed bigger than a new tab grows it; a much smaller one gives back the empty rows', () => {
  const f = fakeServices({ bigSheet: true });
  const many = [];
  for (let i = 0; i < 1500; i++) {
    many.push({ segments: { date: '2026-11-05', searchTermMatchType: 'EXACT' }, searchTermView: { searchTerm: 'term ' + i, status: 'NONE' },
      campaign: { name: 'Ivory' }, adGroup: { name: 'AG' }, metrics: { clicks: '1' } });
  }
  const { E: S } = loadScript(f.services);
  S.CONFIG.SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc/edit';
  // the pre-existing 5000-row tab only needs 2 rows (header + 1) -> trimmed to 3
  S.main();
  assert.equal(f.sheets.feed_search_terms.rows, 3);
  // a 1501-row write into a 1000-row tab grows it first
  const g = fakeServices();
  const { E: S2 } = loadScript(g.services);
  S2.CONFIG.SPREADSHEET_URL = S.CONFIG.SPREADSHEET_URL;
  g.services.AdsApp.search = ((orig) => (q) => (/FROM search_term_view/.test(q) ? (() => { let i = 0; return { hasNext: () => i < many.length, next: () => many[i++] }; })() : orig(q)))(g.services.AdsApp.search);
  S2.main();
  assert.equal(plain(g.sheets.feed_search_terms.values).length, 1501);
  assert.equal(g.sheets.feed_search_terms.rows, 1501);
});

test('main(): change history paging; a refused date-time page keeps what was read and notes it', () => {
  const page = (n, start) => Array.from({ length: n }, (_, i) => ({ changeEvent: { resourceName: 'customers/1/changeEvents/' + (start + i),
    changeDateTime: '2026-11-03 16:43:' + String(i % 60).padStart(2, '0') + '.000001', changeResourceType: 'CAMPAIGN_BUDGET',
    resourceChangeOperation: 'UPDATE', changedFields: 'name', campaign: 'customers/1/campaigns/11' } }));
  const first = page(10000, 0);
  const second = [first[9999]].concat(page(3, 20000));
  const ok = fakeServices({ changePages: [first, second] });
  const { E: S } = loadScript(ok.services);
  S.CONFIG.SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc/edit';
  S.main();
  assert.equal(plain(ok.sheets.feed_changes.values).length, 1 + 10003);
  const lastStart = ok.queries.filter((q) => /FROM change_event/.test(q))[1];
  assert.match(lastStart, /change_date_time >= '2026-11-03 16:43:39\.000001'/);
  const refused = fakeServices({ changePages: [first, second], refuseDateTime: true });
  const { E: S2 } = loadScript(refused.services);
  S2.CONFIG.SPREADSHEET_URL = S.CONFIG.SPREADSHEET_URL;
  S2.main();
  const meta = Object.fromEntries(plain(refused.sheets.feed_meta.values).slice(1));
  assert.equal(plain(refused.sheets.feed_changes.values).length, 1 + 10000);
  assert.match(meta.changes_note, /next page was refused/);
  assert.equal(meta.changes_error, '');
  assert.equal(refused.queries.filter((q) => /FROM change_event/.test(q)).length, 3, 'raw timestamp, then whole seconds');
});

test('main(): an account outside Asia/Kolkata is flagged in feed_meta', () => {
  const f = fakeServices({ tz: 'Europe/London' });
  const { E: S } = loadScript(f.services);
  S.CONFIG.SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc/edit';
  S.main();
  const meta = Object.fromEntries(plain(f.sheets.feed_meta.values).slice(1));
  assert.match(meta.time_zone_note, /Europe\/London/);
});

test('main() refuses to run before the spreadsheet URL is pasted', () => {
  const f = fakeServices();
  const { E: S } = loadScript(f.services);
  assert.throws(() => S.main(), /SPREADSHEET_URL/);
  assert.equal(f.queries.length, 0);
});
