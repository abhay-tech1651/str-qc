/**
 * Export parsers (apps-script/10_Parse.js): synthetic samples, then parity with the Python reference on real data
 * (skipped unless data/fixtures/tables.json and the inbox exports are on this computer).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, loadEngine, fixture, plain, deepDiff } = require('./harness');

const E = loadEngine({}, ['00_Util.js', '01_Config.js', '10_Parse.js']);
const P = (x) => plain(x);

/* ---------------- synthetic samples ---------------- */

test('parseDelimited_: quotes, doubled quotes, separators and newlines inside quotes, CRLF', () => {
  const rows = P(E.parseDelimited_('a,"b,c","say ""hi"""\r\n"multi\nline",x,\r\n\r\nlast', ','));
  assert.deepStrictEqual(rows, [['a', 'b,c', 'say "hi"'], ['multi\nline', 'x', ''], [], ['last']]);
  assert.deepStrictEqual(P(E.parseDelimited_('a\tb\n1\t"2\t3"\n', '\t')), [['a', 'b'], ['1', '2\t3']]);
  assert.deepStrictEqual(P(E.parseDelimited_('"abc"def,g', ',')), [['abcdef', 'g']]);
  assert.deepStrictEqual(P(E.parseDelimited_('"open\nend', ',')), [['open\nend']]);
});

test('_num / _pct rules', () => {
  assert.strictEqual(E.parseNum_('1,234.50'), 1234.5);
  assert.strictEqual(E.parseNum_('--'), 0);
  assert.strictEqual(E.parseNum_(''), 0);
  assert.strictEqual(E.parseNum_(null), 0);
  assert.strictEqual(E.parseNum_('abc'), 0);
  assert.strictEqual(E.parseNum_(7), 7);
  assert.strictEqual(E.parsePct_('35.64%'), 35.64);
  assert.strictEqual(E.parsePct_('< 10%'), null);
  assert.strictEqual(E.parsePct_('> 90%'), null);
  assert.strictEqual(E.parsePct_('--'), null);
  assert.strictEqual(E.parsePct_(''), null);
  assert.strictEqual(E.parsePct_('0%'), 0);
  assert.strictEqual(E.parseTitleCase_("don't EXCLUDE"), "Don'T Exclude");
});

const ST = '\ufeffSearch terms report\r\n4 November 2026 - 4 November 2026\r\n' +
  'Search term\tMatch type\tAdded/Excluded\tCampaign\tAd group\tClicks\tImpr.\tCost\tKeyword\tConversions\r\n' +
  '  Golf Links Price \tPhrase match\tNone\tC1\tG1\t2\t10\t1,200.50\t"""golf links"""\t1\r\n' +
  'flat noida\tExact match\tAdded\tC1\tG1\t0\t3\t--\t[flat noida]\t0\r\n' +
  'Total: Account\t\t\t\t\t2\t13\t1200.5\t\t1\r\n';

test('detectKind', () => {
  assert.strictEqual(E.detectKind(ST), 'search_terms');
  assert.strictEqual(E.detectKind('Change history report\n1 Nov 2026\nDate & time\tUser'), 'changes');
  assert.strictEqual(E.detectKind('Campaign report\r\n1 October 2026 - 2 October 2026\r\nDay\tCampaign'), 'campaign_days');
  assert.strictEqual(E.detectKind('Campaign report\r\n1 October 2026\r\nCampaign\tBudget'), 'unknown');
  assert.strictEqual(E.detectKind('\ufeffSearch keyword report\n'), 'keywords');
  assert.strictEqual(E.detectKind('Auction insights report\n'), 'auction');
  assert.strictEqual(E.detectKind('hello'), 'unknown');
  assert.deepStrictEqual(P(E.parseExport('hello')), { kind: 'unknown', rows: [] });
});

test('parseSearchTerms: BOM, quote stripping, Total rows dropped', () => {
  const rows = P(E.parseSearchTerms(ST));
  assert.deepStrictEqual(rows, [
    { day: '2026-11-04', term: 'golf links price', match_type: 'Phrase match', ads_status: 'None', campaign: 'C1', ad_group: 'G1',
      keyword: 'golf links', clicks: 2, impr: 10, cost: 1200.5, conv: 1 },
    { day: '2026-11-04', term: 'flat noida', match_type: 'Exact match', ads_status: 'Added', campaign: 'C1', ad_group: 'G1',
      keyword: '[flat noida]', clicks: 0, impr: 3, cost: 0, conv: 0 },
  ]);
  assert.strictEqual(E.parseExport(ST).kind, 'search_terms');
});

test('parseChanges: newline inside quotes, sub-header switches the kind, settings joined', () => {
  const t = 'Change history report\r\n1 November 2026 - 6 November 2026\r\nDate & time\tUser\tCampaign\tAd group\tChanges\r\n' +
    '5 Nov 2026, 18:30:12\ta@x.com\tC1\tG1\t"2 negative phrase match keywords added\r\n-""golf links""\r\n-""jade""\r\n' +
    '1 negative exact match keyword added\r\n-[a b]"\r\n' +
    '4 Nov 2026, 09:05:00\tb@x.com\tC1\t\t"Campaign changed\nTarget CPA increased from \u20b9511.80 to \u20b9800.00\n\nBid strategy changed"\r\n' +
    'short\trow\r\n';
  const rows = P(E.parseChanges(t));
  assert.deepStrictEqual(rows, [
    { ts: '2026-11-05T18:30:12', day: '2026-11-05', user: 'a@x.com', campaign: 'C1', ad_group: 'G1',
      kind: 'negative phrase match keywords added', item: '-"golf links"' },
    { ts: '2026-11-05T18:30:12', day: '2026-11-05', user: 'a@x.com', campaign: 'C1', ad_group: 'G1',
      kind: 'negative phrase match keywords added', item: '-"jade"' },
    { ts: '2026-11-05T18:30:12', day: '2026-11-05', user: 'a@x.com', campaign: 'C1', ad_group: 'G1',
      kind: 'negative exact match keyword added', item: '-[a b]' },
    { ts: '2026-11-04T09:05:00', day: '2026-11-04', user: 'b@x.com', campaign: 'C1', ad_group: '',
      kind: 'Campaign changed', item: 'Target CPA increased from \u20b9511.80 to \u20b9800.00 | Bid strategy changed' },
  ]);
  const long = 'Date & time\tUser\tCampaign\tAd group\tChanges\n1 Nov 2026, 1:02:03\tu\tc\tg\t"Ad changed\n' + 'x'.repeat(600) + '"\n';
  const r2 = P(E.parseChanges(long));
  assert.strictEqual(r2[0].item.length, 500);
  assert.strictEqual(r2[0].ts, '2026-11-01T01:02:03');
});

test('parseCampaignDays: day rows only, Total dropped, hidden shares null', () => {
  const t = 'Campaign report\n1 October 2026 - 2 October 2026\n' +
    'Day,Campaign status,Campaign,Campaign ID,Budget,Status,Status reasons,Bid strategy type,Target CPA,Impr.,Clicks,Cost,Conversions,' +
    'All conv.,Search impr. share,Search lost IS (budget),Search lost IS (rank),Search top IS,Search abs. top IS\n' +
    '2026-10-01,Enabled,Ivory_ROI,123,"1,500.00",Eligible,,Target CPA,800,"1,000",50,"2,500.25",3,3.5,< 10%,12.5%,> 90%,--,40%\n' +
    'Total: Campaigns,Total: Campaigns,,,,,,,,1000,50,2500.25,3,3.5,,,,,\n';
  assert.deepStrictEqual(P(E.parseCampaignDays(t)), [{
    day: '2026-10-01', campaign: 'Ivory_ROI', campaign_id: '123', campaign_status: 'Enabled', status: 'Eligible', status_reasons: '',
    bid_strategy: 'Target CPA', budget_now: 1500, target_cpa_now: 800, impr: 1000, clicks: 50, cost: 2500.25, conv: 3, all_conv: 3.5,
    is_pct: null, lost_budget_pct: 12.5, lost_rank_pct: null, top_is_pct: null, abs_top_is_pct: 40,
  }]);
});

test('parseKeywords: Enabled/Paused rows, AI Max totals kept, other totals dropped', () => {
  const t = 'Search keyword report\n1 October 2026 - 6 November 2026\n' +
    'Keyword status\tKeyword\tMatch type\tCampaign\tAd group\tStatus\tStatus reasons\tCost\tClicks\tImpr.\tConversions\tQuality Score\t' +
    'Ad relevance\tLanding page exp.\tSearch impr. share\tSearch lost IS (rank)\n' +
    'Enabled\tivory county\tPhrase match\tC1\tG1\tEligible\t\t100\t5\t50\t1\t7\tAbove average\t --\t< 10%\t20%\n' +
    'Paused\t[jade]\tExact match\tC1\tG1\tPaused\t\t0\t0\t0\t0\t --\t--\t\t\t\n' +
    'Removed\tx\tBroad match\tC1\tG1\t\t\t0\t0\t0\t0\t\t\t\t\t\n' +
    'Total: AI Max search terms\t\t\t\t\t\t\t30\t2\t40\t0\t\t\t\t\t\n' +
    'Total: Account\t\t\t\t\t\t\t130\t7\t90\t1\t\t\t\t\t\n';
  const rows = P(E.parseKeywords(t));
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], {
    period_start: '2026-10-01', day: '2026-11-06', keyword_status: 'Enabled', keyword: 'ivory county', match_type: 'Phrase',
    campaign: 'C1', ad_group: 'G1', status: 'Eligible', status_reasons: '', cost: 100, clicks: 5, impr: 50, conv: 1, quality_score: 7,
    ad_relevance: 'Above average', landing_page: '', is_pct: null, lost_rank_pct: 20,
  });
  assert.strictEqual(rows[1].quality_score, null);
  assert.strictEqual(rows[1].match_type, 'Exact');
  assert.deepStrictEqual(rows[2], {
    period_start: '2026-10-01', day: '2026-11-06', keyword_status: 'Total', keyword: 'AI Max search terms', match_type: '',
    campaign: '(all)', ad_group: '', status: '', status_reasons: '', cost: 30, clicks: 2, impr: 40, conv: 0, quality_score: null,
    ad_relevance: '', landing_page: '', is_pct: null, lost_rank_pct: null,
  });
});

test('parseAuction', () => {
  const t = 'Auction insights report\n1 November 2026 - 6 November 2026\n' +
    'Display URL domain\tImpression share\tOverlap rate\tPosition above rate\tTop of page rate\tAbs. Top of page rate\tOutranking share\n' +
    'You\t35.5%\t--\t--\t80%\t20%\t--\nm3m.com\t< 10%\t12%\t40%\t70%\t10%\t< 10%\n';
  assert.deepStrictEqual(P(E.parseAuction(t)), [
    { period_start: '2026-11-01', day: '2026-11-06', domain: 'You', impression_share: 35.5, impression_share_raw: '35.5%',
      overlap_rate: null, position_above_rate: null, top_of_page_rate: 80, abs_top_rate: 20, outranking_share: null },
    { period_start: '2026-11-01', day: '2026-11-06', domain: 'm3m.com', impression_share: null, impression_share_raw: '< 10%',
      overlap_rate: 12, position_above_rate: 40, top_of_page_rate: 70, abs_top_rate: 10, outranking_share: null },
  ]);
});

test('parseAgencyTab: header detection, title date, totals skipped, decision title-cased', () => {
  const values = [
    ['STR review', '', ''],
    ['', '', ''],
    ['Search term', 'Match Type ', 'Campaign', 'Ad group', 'Keywords', 'Clicks', 'Impr.', 'Cost', 'Conversions', 'Status',
      'Negative Broad', 'County Comments'],
    ['Golf Links ', 'Broad match', 'Ivory_ROI', 'G1', 'golf', 1, '20', '1,250.5', 0, ' exclude', ' golf ', ' ok '],
    ['', 'x'],
    ['Total', '', '', '', '', 1, 20, 1250.5, 0, '', '', ''],
    [42, 'Exact match', 'C', 'G', '', '', '', '', '', 'KEEP', '', ''],
  ];
  const rows = P(E.parseAgencyTab('9 Oct', values));
  assert.deepStrictEqual(rows, [
    { day: '2026-10-09', tab: '9 Oct', term: 'golf links', match_type: 'Broad match', ads_status: '', campaign: 'Ivory_ROI',
      ad_group: 'G1', keyword: 'golf', clicks: 1, impr: 20, cost: 1250.5, conv: 0, decision: 'Exclude', neg_term: 'golf',
      county_comment: 'ok' },
    { day: '2026-10-09', tab: '9 Oct', term: '42', match_type: 'Exact match', ads_status: '', campaign: 'C', ad_group: 'G', keyword: '',
      clicks: 0, impr: 0, cost: 0, conv: 0, decision: 'Keep', neg_term: '', county_comment: '' },
  ]);
  assert.strictEqual(P(E.parseAgencyTab('3 Jan 2027', values))[0].day, '2027-01-03');
  const withHeader = [['12 October 2026 - 12 October 2026']].concat(values.slice(1));
  assert.strictEqual(P(E.parseAgencyTab('9 Oct', withHeader))[0].day, '2026-10-12');
  assert.deepStrictEqual(P(E.parseAgencyTab('Notes', values)), []);
  assert.deepStrictEqual(P(E.parseAgencyTab('9 Oct', [['a'], ['b']])), []);
});

test('parseAgencyTab: a mistyped Status header still gives the decisions (column left of Negative Broad)', () => {
  const head = ['Search term', 'Match type', 'Campaign', 'Ad group', 'Cost', 'Cost / conv.', 'k', 'Negative Broad', 'County Comments'];
  const rows = P(E.parseAgencyTab('16 Nov 2026', [head, ['puri builders', 'Phrase match', 'C', 'G', 100, 0, 'Exclude', '"puri builders"', 'exclude']]));
  assert.strictEqual(rows[0].decision, 'Exclude');
  assert.strictEqual(rows[0].neg_term, '"puri builders"');
  // a Google report column left of Negative Broad is never read as the decision
  const noStatus = ['Search term', 'Match type', 'Campaign', 'Ad group', 'Cost', 'Cost / conv.', 'Negative Broad'];
  assert.strictEqual(P(E.parseAgencyTab('16 Nov 2026', [noStatus, ['x', 'Exact match', 'C', 'G', 5, '12.5', 'x']]))[0].decision, '');
});

/* ---------------- real data parity (local only) ---------------- */

const HAVE = fixture.exists('tables.json');
const INBOX = path.join(ROOT, 'inbox');
const skip = HAVE ? false : 'data/fixtures/tables.json not present';

function readExport(name) {
  const buf = fs.readFileSync(path.join(INBOX, name));
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  return new TextDecoder('utf-8').decode(buf);
}

function inboxFiles(re) {
  return fs.existsSync(INBOX) ? fs.readdirSync(INBOX).filter((n) => re.test(n)).sort() : [];
}

function sameMultiset(got, want, label) {
  const key = (r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k] === undefined ? null : r[k]]));
  const norm = (rows) => rows.map((r) => {
    const o = {};
    for (const k of Object.keys(r)) o[k] = typeof r[k] === 'number' ? Math.round(r[k] * 100) / 100 : r[k];
    return o;
  });
  const g = norm(plain(got)).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const w = norm(want).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const d = deepDiff(g, w, label, [], 0.011, 10);
  assert.deepStrictEqual(d, [], d.join('\n'));
}

let T = null;
const tables = () => (T = T || fixture.json('tables.json'));

test('real: search terms reports equal the fixture', { skip }, () => {
  const files = inboxFiles(/^str_.*\.csv$/);
  assert.ok(files.length, 'no str_*.csv in inbox');
  const byDay = new Map();
  for (const f of files) {
    const p = E.parseExport(readExport(f));
    assert.strictEqual(p.kind, 'search_terms', f);
    const rows = plain(p.rows);
    for (const d of new Set(rows.map((r) => r.day))) byDay.set(d, rows.filter((r) => r.day === d));
  }
  sameMultiset([].concat(...byDay.values()), tables().search_terms, 'search_terms');
});

test('real: change history union equals the fixture', { skip }, () => {
  const files = inboxFiles(/^change_history_.*\.csv$/);
  assert.ok(files.length);
  const seen = new Map();
  for (const f of files) {
    const p = E.parseExport(readExport(f));
    assert.strictEqual(p.kind, 'changes', f);
    for (const r of plain(p.rows)) {
      const k = JSON.stringify([r.ts, r.campaign, r.ad_group, r.kind, r.item]);
      if (!seen.has(k)) seen.set(k, r);
    }
  }
  sameMultiset([...seen.values()], tables().changes, 'changes');
});

test('real: campaign reports equal the fixture', { skip }, () => {
  const files = inboxFiles(/^campaign_.*\.csv$/);
  assert.ok(files.length);
  let all = [];
  for (const f of files) {
    const p = E.parseExport(readExport(f));
    assert.strictEqual(p.kind, 'campaign_days', f);
    const rows = plain(p.rows);
    const keys = new Set(rows.map((r) => r.day + '\u0000' + r.campaign));
    all = all.filter((r) => !keys.has(r.day + '\u0000' + r.campaign)).concat(rows);
  }
  sameMultiset(all, tables().campaign_days, 'campaign_days');
});

test('real: keyword report equals the fixture', { skip }, () => {
  const files = inboxFiles(/^keywords_.*\.csv$/);
  assert.ok(files.length);
  let rows = [];
  for (const f of files) {
    const p = E.parseExport(readExport(f));
    assert.strictEqual(p.kind, 'keywords', f);
    rows = plain(p.rows);
  }
  sameMultiset(rows, tables().keywords, 'keywords');
});

test('real: auction insights equal the fixture', { skip }, () => {
  const files = inboxFiles(/^auction_.*\.csv$/);
  assert.ok(files.length);
  let all = [];
  for (const f of files) {
    const p = E.parseExport(readExport(f));
    assert.strictEqual(p.kind, 'auction', f);
    const rows = plain(p.rows);
    if (!rows.length) continue;
    all = all.filter((r) => !(r.period_start === rows[0].period_start && r.day === rows[0].day)).concat(rows);
  }
  sameMultiset(all, tables().auction, 'auction');
});

test('real: agency sheet tabs equal the fixture agency_calls', { skip: skip || (fixture.exists('agency_tabs.json') ? false : 'no agency_tabs.json') }, () => {
  const tabs = fixture.json('agency_tabs.json');
  let all = [];
  for (const t of tabs) all = all.concat(plain(E.parseAgencyTab(t.title, t.values)));
  // Known, accepted difference: a number typed into a text column (e.g. 62 in 'Negative Broad') reads in openpyxl as the
  // float 62.0, so Python writes '62.0'. Range.getValues() (and this JSON fixture) only has the number 62, so JS writes '62'.
  const want = tables().agency_calls.map((r) => {
    const o = Object.assign({}, r);
    for (const k of Object.keys(o)) if (typeof o[k] === 'string' && /^-?\d+\.0$/.test(o[k])) o[k] = o[k].slice(0, -2);
    return o;
  });
  sameMultiset(all, want, 'agency_calls');
});
