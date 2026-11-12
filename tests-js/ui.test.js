/**
 * Dashboard page (ui/app.js) against hostile data.
 * app.js runs in a node vm with a stub DOM and a stub google.script.run. Every view is rendered with models whose strings
 * carry injection payloads, whose numbers are replaced by strings or nulls, and whose sections are missing; every HTML
 * string the page writes is checked by a small tag scanner (allow-listed tags and attributes only, no event handlers,
 * href only '#...', style only plain values) and for NaN / undefined / null / [object Object] text.
 * The real-data part uses data/fixtures/model.json and review.json and is skipped when they are missing.
 * Nothing from the fixtures is printed: failure messages show at most a 40-character snippet.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(process.env.QC_UI_APP || path.join(ROOT, 'ui', 'app.js'), 'utf8');
const FIX = path.join(ROOT, 'data', 'fixtures');
const hasReal = fs.existsSync(path.join(FIX, 'model.json')) && fs.existsSync(path.join(FIX, 'review.json'));

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '" onmouseover="alert(1)',
  "' onfocus='alert(1)' x='",
  '</title><script>alert(1)</script>',
  '<svg/onload=alert(1)>',
  'javascript:alert(1)',
  '&lt;b&gt;&amp;',
  '${alert(1)}`',
  '%E0%A4%',
];

// ------------------------------------------------------------------ environment
function makeEnv() {
  const writes = [];
  const calls = [];
  function el(name) {
    let h = '';
    return {
      get innerHTML() { return h; },
      set innerHTML(v) { h = String(v); writes.push({ el: name, html: h }); },
      addEventListener() {}, classList: { add() {}, remove() {} }, clientWidth: 820, focus() {}, setSelectionRange() {}, value: '',
    };
  }
  const els = { '#rail': el('rail'), '#main': el('main'), '#upload-out': el('upload-out') };
  const server = {
    model: JSON.stringify(syntheticModel()),
    review: JSON.stringify(syntheticReview()),
    me: { email: 'viewer@example.com', canUpload: true },
    uploadResult: [],
    fail: {},
  };
  const impl = {
    getModel: () => server.model,
    getReview: () => server.review,
    whoAmI: () => server.me,
    uploadExports: () => server.uploadResult,
    refreshNow: () => ({ ok: true, at: '2026-11-06T07:00:00' }),
  };
  const run = () => {
    let ok = () => {}, fail = () => {};
    const r = { withSuccessHandler(f) { ok = f; return r; }, withFailureHandler(f) { fail = f; return r; } };
    Object.keys(impl).forEach((fn) => {
      r[fn] = (...args) => {
        calls.push(fn);
        Promise.resolve().then(() => (Object.prototype.hasOwnProperty.call(server.fail, fn) ? fail(server.fail[fn]) : ok(impl[fn](...args))));
      };
    });
    return r;
  };
  const location = { hash: '' };
  const document = { title: '', querySelector: (s) => els[s] || null, querySelectorAll: () => [], getElementById: () => null };
  const sandbox = {
    document, location, console, setTimeout, clearTimeout, TextDecoder,
    google: { script: { get run() { return run(); } } },
    scrollY: 0, scrollTo() {}, addEventListener() {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(APP, sandbox, { filename: 'app.js' });
  return { sandbox, hook: sandbox.__qcTest, writes, calls, server, location, els };
}
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// ------------------------------------------------------------------ HTML checker
const TAGS = new Set('div span a b i p h1 h3 ol li section article header footer table thead tbody tr th td code details summary button select option input svg line text rect g title path circle br'.split(' '));
const ATTRS = new Set(('class href title style id role aria-label aria-hidden data-more data-project data-show value selected type placeholder accept multiple hidden '
  + 'viewbox preserveaspectratio x y x1 x2 y1 y2 width height fill stroke stroke-width stroke-dasharray opacity d cx cy r text-anchor vector-effect').split(' '));
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/y;
const ATTR_RE = /\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
const snip = (s, i) => JSON.stringify(s.slice(Math.max(0, i - 15), i + 25));

/** Returns a list of problems (empty when the HTML is safe and tidy). */
function check(html, opts = {}) {
  const bad = [];
  for (let i = html.indexOf('<'); i >= 0; i = html.indexOf('<', i + 1)) {
    TAG_RE.lastIndex = i;
    const m = TAG_RE.exec(html);
    if (!m) { bad.push('raw < or broken tag at ' + snip(html, i)); continue; }
    const tag = m[1].toLowerCase();
    if (!TAGS.has(tag)) bad.push('tag <' + tag + '> at ' + snip(html, i));
    let a;
    ATTR_RE.lastIndex = 0;
    while ((a = ATTR_RE.exec(m[2]))) {
      const name = a[1].toLowerCase();
      let val = a[2] || '';
      if (/^["']/.test(val)) val = val.slice(1, -1);
      if (!ATTRS.has(name) || name.indexOf('on') === 0) bad.push('attribute ' + name + ' on <' + tag + '> at ' + snip(html, i));
      if (val.indexOf('<') >= 0 || val.indexOf('>') >= 0) bad.push('unescaped < or > in ' + name + ' at ' + snip(html, i));
      if (name === 'href' && val[0] !== '#') bad.push('href not a fragment at ' + snip(html, i));
      if (name === 'style' && (/url|expression|import|[\\"'<>]/i.test(val) || !/^[-a-z0-9:;.%()#, ]*$/i.test(val))) bad.push('style value at ' + snip(html, i));
      if (name !== 'style' && name !== 'href' && /^(fill|stroke|width|height|x|y|x1|x2|y1|y2|cx|cy|r|opacity)$/.test(name) && !/^(-?[\d.]+%?|var\(--[a-z-]+\)|transparent|none)$/.test(val)) bad.push('svg value ' + name + ' at ' + snip(html, i));
    }
    i = TAG_RE.lastIndex - 1;
  }
  for (const w of ['NaN', 'undefined', 'Infinity', '[object']) { const k = html.indexOf(w); if (k >= 0) bad.push(w + ' at ' + snip(html, k)); }
  const text = html.replace(/<[^>]*>/g, ' ');
  const k = opts.allowNullWord ? -1 : text.search(/\bnull\b/);
  if (k >= 0) bad.push('null at ' + snip(text, k));
  return bad;
}
function assertAllSafe(env, label, opts) {
  const problems = [];
  env.writes.forEach((w) => check(w.html, opts).forEach((p) => problems.push(w.el + ': ' + p)));
  assert.deepStrictEqual(problems.slice(0, 8), [], label);
  const err = env.writes.find((w) => w.html.indexOf('Could not load the data') >= 0);
  assert.ok(!err, label + ': a view threw (' + (err ? snip(err.html, 30) : '') + ')');
}

// ------------------------------------------------------------------ models
function syntheticModel() {
  const per = { cost: 12000, clicks: 300, impr: 9000, conv: 4, all_conv: 40, cpa: 3000 };
  const camp = (id, label, project, extra) => Object.assign({
    id, label, project, runner: 'ROI', ctype: 'brand', bid_strategy: 'Target CPA', status: 'Eligible', status_reasons: 'Limited by budget', budget_now: 1500, target_cpa_now: null,
    since: { days: 20, cost: 30000, clicks: 600, impr: 20000, conv: 10, all_conv: 90, cpa: 3000, cpc: 50, cost_per_day: 1500, budget_use: 90, is_pct: 40, lost_budget_pct: 30, lost_rank_pct: 30, top_is_pct: 20 },
    last7: { days: 7, cost: 9000, clicks: 200, impr: 6000, conv: 3, all_conv: 30, cpa: 3000, cpc: 45, cost_per_day: 1285, budget_use: 85, is_pct: null, lost_budget_pct: null, lost_rank_pct: 55, top_is_pct: null },
    prev7: {}, verdict: 'budget', conv_gap: true,
    series: [{ day: '2026-10-01', cost: 100, impr: 50, clicks: 3, conv: 0, is_pct: 10, lost_budget_pct: 0, lost_rank_pct: 90, eligible: 500 }, { day: '2026-10-02', cost: 0, impr: 0, clicks: 0, conv: 0, is_pct: null, lost_budget_pct: null, lost_rank_pct: null, eligible: null }],
  }, extra || {});
  const row = (project, campaign, extra) => Object.assign({ day: '2026-10-02', term: 'ivory county price', project, campaign, ad_group: 'Brand', keyword: '[ivory county]', match_type: 'Exact match', clicks: 2, cost: 120, conv: 0 }, extra || {});
  return {
    version: 1, as_of: '2026-10-03', refreshed_at: '2026-10-03T07:00:00',
    data: { campaign_days: { from: '2026-09-15', to: '2026-10-03', complete_through: '2026-10-02' }, search_terms: { days: ['2026-10-01', '2026-10-02'], raw_days: [], from: '2026-10-01', to: '2026-10-02' }, agency_sheet: { from: '2026-10-01', to: '2026-10-02' }, changes: { from: '2026-09-01', to: '2026-10-02' }, keywords: { from: '2026-09-01', to: '2026-09-30' }, auction: { from: '2026-09-01', to: '2026-09-30' } },
    projects: [
      { id: 'ivory', name: 'Ivory County', location: 'Sector 115, Noida', product: '3 and 4 BHK', starting_price_cr: 3.1, max_price_cr: 4.5 },
      { id: 'jade', name: 'Jade County', location: 'Sector 150', product: '', starting_price_cr: 2, max_price_cr: null },
    ],
    windows: { since: { from: '2026-09-15', to: '2026-10-02' }, last7: { from: '2026-09-26', to: '2026-10-02' }, prev7: { from: '2026-09-19', to: '2026-09-25' } },
    account: { since: per, last7: per, prev7: Object.assign({}, per, { cost: 0 }), daily: [{ day: '2026-10-01', cost: 100, conv: 1, by_project: { ivory: 60, jade: 40 } }, { day: '2026-10-02', cost: 0, conv: 0, by_project: {} }] },
    project_stats: {
      ivory: { since: per, last7: per, prev7: per, share_of_spend: 60, campaigns: ['c1', 'c2'], daily: [{ day: '2026-10-01', cost: 60 }, { day: '2026-10-02', cost: 0 }] },
      jade: { since: { cost: 0, conv: 0, cpa: null }, last7: { cost: 0, conv: 0, cpa: null }, prev7: { cost: 0 }, share_of_spend: 0, campaigns: [], daily: [] },
    },
    campaigns: [camp('c1', 'Ivory Brand', 'ivory'), camp('c2', 'Ivory CTM', 'ivory', { verdict: 'underspending', conv_gap: false }), camp('c3', 'Jade Generic', 'jade', { verdict: 'rank', last7: {}, since: {} })],
    latest_day: { day: '2026-10-02', source: 'feed', rows: 2, cost: 240, reviewed: 1, by_project: { ivory: { rows: 2, cost: 240, exclude_cost: 120, add_cost: 0, none_cost: 120 } } },
    agency: {
      grace_days: 3, last_change_day: '2026-10-02',
      excludes: { total: 10, applied: 8, applied_elsewhere: 1, waiting: 0, overdue: 1, overdue_cost: 500, judged: 10, applied_pct: 90, median_lag: 1.5 },
      adds: { total: 2, added: 1, added_elsewhere: 0, already: 0, waiting: 0, overdue: 1 },
      no_negative: { rows: 1, cost: 10, open: 1 },
      by_day: [{ day: '2026-10-01', applied: 3, applied_elsewhere: 1, waiting: 0, overdue: 1 }],
      lag: [], by_project: { ivory: { excludes: 10, judged: 10, applied_pct: 90, overdue: 1, overdue_cost: 500, adds: 2, adds_overdue: 1 } },
      overdue_excludes: [row('ivory', 'c1', { neg_term: '-"price"', county_comment: 'why?' }), row('jade', 'c3', { neg_term: '' })],
      overdue_adds: [row('ivory', 'c1')],
      no_negative_rows: [row('ivory', 'c1', { status: 'overdue' }), row('ivory', 'c1', { status: 'mystery' })],
    },
    keywords: {
      from: '2026-09-01', to: '2026-09-30', total_cost: 0, below_lp_cost: 0, qs13_cost: 0,
      lp_cost: { 'Above average': 10, Average: 0, 'Below average': 5, 'Not rated': 0 }, rel_cost: {}, qs: [], status_counts: { Eligible: 3 },
      by_project: { ivory: { cost: 0, below_lp_cost: 0, qs13_cost: 0, keywords: 3, enabled: 3, not_eligible: 0, limited: 0 } },
      no_conv: [{ keyword: 'villa', project: 'ivory', campaign: 'c1', ad_group: 'Villa', cost: 10, quality_score: null, landing_page: '' }],
      low_quality: [{ keyword: 'pent house', project: 'ivory', campaign: 'c1', cost: 10, quality_score: 2, ad_relevance: 'Below average', landing_page: 'Average' }],
      duplicates: [{ project: 'ivory', keyword: 'ivory county', campaigns: ['c1', 'c2'], cost: 5, impr: 9 }],
      product_mismatch: [{ project: 'ivory', keyword: 'villa', campaign: 'c1', ad_group: 'Villa', cost: 10, conv: 0 }],
    },
    risks: {
      brand_no_word: [row('ivory', 'c1')], brand_leak: [row('ivory', 'c2')],
      blocked: [{ project: 'ivory', campaign: 'c1', ad_group: 'Brand', keyword: 'ivory', blocked_by: '-ivory', level: 'campaign', added: '2026-09-20', added_by: 'agency@example.com' }],
      risky: [{ project: 'ivory', campaign: 'c1', ad_group: '', item: '-62', level: 'campaign', added: '2026-09-20', added_by: 'agency@example.com', why: 'bare_number' }, { project: 'jade', campaign: 'c3', item: '-x', why: 'other' }],
      conflicts: [{ day: '2026-10-01', project: 'ivory', campaign: 'c1', negative: '-rent', written_for: 'flat on rent', would_block: 1, example: 'rent free' }],
      leaks: [], repeats: [],
      by_project: { ivory: { brand_no_word_cost: 120, brand_no_word_rows: 1, brand_leak_cost: 0, brand_leak_rows: 0 } },
    },
    ctm: {
      campaign: 'c2', project: 'ivory', budget_now: 5000, target_cpa_now: 800,
      events: [{ day: '2026-10-01', who: 'google@example.com', lines: ['Keyword removed', 'Budget changed from ₹1,500.00 to ₹2,700.00'], setting: true }, { day: '2026-10-02', who: 'x', lines: ['-word'], setting: false }],
      periods: [{ start: '2026-09-15', end: '2026-09-30', days: 16, change: ['Target CPA increased'], impr_per_day: 100, clicks_per_day: 3, cost_per_day: 300, conv: 1, eligible_per_day: 900 }, { start: '2026-10-01', end: '2026-10-02', days: 2, change: [], impr_per_day: 0, clicks_per_day: 0, cost_per_day: 0, conv: 0, eligible_per_day: null }],
    },
    competitors: { from: '2026-09-01', to: '2026-09-30', rows: [{ domain: 'You', impression_share: 30, impression_share_raw: '30%', overlap_rate: null, position_above_rate: null, top_of_page_rate: 50, outranking_share: null }, { domain: '99acres.com', impression_share_raw: '< 10%', overlap_rate: 12.5, position_above_rate: 40, top_of_page_rate: 60, outranking_share: 20 }] },
    fixes: [
      ['overdue_excludes', { count: 3, first_day: '2026-10-01', last_day: '2026-10-02' }],
      ['overdue_adds', { count: 1, first_day: '2026-10-01', last_day: '2026-10-01' }],
      ['no_negative_written', { count: 2 }],
      ['brand_no_word', { count: 1, example: 'flats noida', example_cost: 120, example_keyword: 'ivory' }],
      ['brand_leak', { count: 1, example: 'ivory county' }],
      ['blocked_keywords', { count: 1, example: 'ivory', example_negative: '-ivory' }],
      ['risky_negatives', { count: 2, examples: ['-62', '-flat'] }],
      ['product_mismatch', { count: 2, conv: 0, ad_groups: ['Villa', 'Pent House'] }],
      ['landing_pages', { share: 61.7, total: 200000 }],
      ['self_competition', { count: 1, example: 'ivory county', example_campaigns: ['c1', 'c2'] }],
      ['conversion_gap', { campaigns: [{ label: 'Ivory Brand', conv: 3, all_conv: 30 }] }],
      ['zero_conv', { campaign: 'c3', label: 'Jade Generic', days: 20 }],
      ['brand_cpa', { campaign: 'c1', label: 'Ivory Brand', cpa: 5000, nonbrand_cpa: 2000, cpc: 60, bid_strategy: 'Target CPA', conv: 3 }],
      ['held_by_budget', { campaign: 'c1', label: 'Ivory Brand', lost_budget_pct: 30, cpa: {}, budget: 1500 }],
      ['ctm_pool', { campaign: 'c2', before: 900, before_from: '2026-09-15', before_to: '2026-09-30', now: 20, now_from: '2026-10-01', now_to: '2026-10-02', spend_per_day: 300, budget: 5000, drop_pct: 97.8 }],
      ['something_new', { count: 1 }],
    ].map(([type, params], i) => ({ type, params, project: i % 5 === 4 ? 'jade' : 'ivory', owner: ['Agency', 'County', 'Google CTM team'][i % 3], severity: ['high', 'medium', 'low'][i % 3], money: i % 2 ? 1000 * i : null, money_kind: ['wasted', 'affected', 'misrouted', null][i % 4] })),
    coverage: [{ day: '2026-10-01', report_rows: 10, report_cost: 100, sheet_rows: 9, sheet_cost: 90, reviewed: 9, cost_matches: false }],
  };
}
function syntheticReview() {
  const base = { day: '2026-10-02', project: 'ivory', ctype: 'brand', campaign: 'c1', ad_group: 'Brand', keyword: '[ivory county]', match_type: 'Exact match', clicks: 1, cost: 50, cpc: 50, conv: 0, source: 'feed' };
  return [
    Object.assign({}, base, { term: 'ivory county rent', decision: 'Exclude', neg_term: '-rent', county_comment: 'ok', flags: ['rent'] }),
    Object.assign({}, base, { term: 'ivory county', decision: 'Add', neg_term: '', county_comment: '', flags: [] }),
    Object.assign({}, base, { term: 'flats', decision: '', neg_term: '', county_comment: '', flags: ['brand_missing', 'weird_flag'] }),
  ];
}

// ------------------------------------------------------------------ mutations
const STRUCT = new Set(['id', 'project', 'campaign', 'type', 'severity', 'owner', 'verdict', 'money_kind', 'status', 'decision', 'why', 'level', 'ctype', 'runner', 'source']);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}/.test(s);
function walk(x, fn, key) {
  if (Array.isArray(x)) return x.map((v) => walk(v, fn, key));
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = walk(x[k], fn, k); return o; }
  return fn(x, key);
}
let pi = 0;
const nextPayload = () => PAYLOADS[pi++ % PAYLOADS.length];
/** Hostile text in every free-text field (terms, comments, names, labels, keywords, negatives, change lines...). */
const hostileContent = (m) => walk(m, (v, k) => (typeof v === 'string' && !STRUCT.has(k) && !isDate(v) && k !== 'days' && k !== 'flags' ? v + ' ' + nextPayload() : v));
/** Hostile text everywhere, ids, enums and dates included. */
const hostileAll = (m) => walk(m, (v) => (typeof v === 'string' ? nextPayload() + v : v));
/** Every number replaced by a hostile string. */
const numbersToStrings = (m) => walk(m, (v) => (typeof v === 'number' ? nextPayload() : v));
/** Every number null, every optional section missing. */
const nullsEverywhere = (m) => Object.assign(walk(m, (v) => (typeof v === 'number' ? null : v)), { keywords: null, competitors: null, ctm: null, latest_day: null });
/** Every array empty (projects kept so the views have something to loop over). */
const emptyArrays = (m) => { const out = walk(m, (v) => v); const strip = (o) => { for (const k of Object.keys(o)) { if (Array.isArray(o[k])) o[k] = []; else if (o[k] && typeof o[k] === 'object') strip(o[k]); } }; const projects = out.projects; strip(out); out.projects = projects; return out; };
/** Sections of the wrong type and prototype-named keys. */
const wrongTypes = (m) => (Array.isArray(m) ? [null, 'x', 7, { term: 5, flags: 'x', cost: '1', day: 3 }, { __proto__: { flags: 1 }, term: PAYLOADS[0] }] : Object.assign({}, m, {
  account: 'x', windows: [], data: null, agency: 7, risks: 'r', campaigns: {}, project_stats: [],
  projects: m.projects.concat([{ id: '__proto__', name: PAYLOADS[0] }, { id: 'constructor', name: null }, { id: 5 }, null, 'x']),
  fixes: [{ type: '__proto__', severity: 'constructor', project: 'toString', params: 'x', money: '5' }, { type: 'zero_conv', params: null }, null],
  keywords: { by_project: null, lp_cost: 'x', status_counts: [] }, competitors: { rows: 'x' }, ctm: { project: m.projects[0].id, events: [{ lines: null }], periods: 'x' }, latest_day: { by_project: null },
}));

const VIEW_HASHES = ['', '#briefing', '#agency', '#terms', '#campaigns', '#keywords', '#competitors', '#upload', '#help',
  '#nope', '#%E0%A4', '#__proto__', '#constructor', '#toString', '#hasOwnProperty', '#p:__proto__', '#p:nope', '#p:'];

async function renderAll(env, model, review) {
  env.server.review = JSON.stringify(review);
  env.hook.setModel(JSON.stringify(model));
  const ids = (Array.isArray(model.projects) ? model.projects : []).filter((p) => p && typeof p === 'object').map((p) => String(p.id));
  const hashes = VIEW_HASHES.concat(ids.map((id) => '#p:' + encodeURIComponent(id)));
  const S = env.hook.state;
  for (const expanded of [false, true]) {
    S.more = expanded ? new Proxy({}, { get: () => true }) : Object.create(null);
    for (const h of hashes) { env.location.hash = h; env.hook.render(); await flush(); }
    // the search-terms view, every filter, a hostile search box and a project filter
    env.location.hash = '#terms';
    for (const show of ['all', 'flag', 'Exclude', 'Add', 'none', '__proto__']) {
      S.terms.show = show;
      for (const q of ['', PAYLOADS[0], 'i']) { S.terms.q = q; for (const pr of ['all', ids[0] || 'x']) { S.terms.project = pr; env.hook.render(); } }
      S.terms.day = PAYLOADS[1];
      env.hook.render();
    }
    S.terms = { day: '', project: 'all', show: 'all', q: '' };
    await flush();
  }
}

// ------------------------------------------------------------------ tests
test('the HTML checker catches injections', () => {
  for (const h of ['<img src=x onerror=alert(1)>', '<a href="#x" onmouseover="alert(1)">', '<a href="javascript:alert(1)">', '<title></title><script>alert(1)</script>',
    '<i style="width:1%;background:url(x)">', '<div title="a"b">', '<b>a < b</b>', '<span>NaN</span>', '<span>undefined</span>', '<td>null</td>', '<rect width="1%"><img src=x>']) {
    assert.ok(check(h).length > 0, h);
  }
  assert.deepStrictEqual(check('<a class="pill" href="#p:x" title="&lt;img&gt;"><i style="background:var(--ivory)"></i>x</a>'), []);
});

test('esc, htmlToText and fixText escape exactly once', () => {
  const env = makeEnv();
  const { esc, htmlToText, fixText } = env.hook;
  assert.strictEqual(esc('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
  const label = '<img src=x onerror=alert(1)> &lt; "q"';
  const t = fixText({ type: 'zero_conv', project: 'ivory', params: { label, days: 4 }, money: 100 });
  assert.ok(t.title.indexOf(esc(label)) === 0, 'title starts with the label escaped once');
  assert.ok(t.title.indexOf('&amp;lt;img') < 0, 'no double escaping');
  assert.strictEqual(htmlToText(t.title).indexOf(label), 0, 'plain-text title shows the label exactly as typed');
  const d = fixText({ type: 'blocked_keywords', project: 'x', params: { count: 2, example: '</title><script>', example_negative: '-"a"' } });
  assert.ok(d.detail.indexOf('<code>-&quot;a&quot;</code>') > 0 && d.detail.indexOf('<script>') < 0);
  assert.deepStrictEqual(check(d.detail), []);
});

test('synthetic model: every view renders, no injection, no NaN/undefined/null text', async () => {
  const env = makeEnv();
  await flush();
  for (const [name, mut] of [['plain', (m) => m], ['hostile content', hostileContent], ['hostile everything', hostileAll], ['numbers as strings', numbersToStrings], ['nulls', nullsEverywhere], ['empty arrays', emptyArrays], ['wrong types', wrongTypes]]) {
    env.writes.length = 0;
    const m = mut(syntheticModel());
    await renderAll(env, m, mut(syntheticReview()));
    assertAllSafe(env, name);
    assert.ok(env.writes.length > 40, name + ': views were rendered');
  }
});

test('hostile strings are shown as text, escaped once', async () => {
  const env = makeEnv();
  await flush();
  env.writes.length = 0;
  await renderAll(env, hostileContent(syntheticModel()), hostileContent(syntheticReview()));
  const all = env.writes.map((w) => w.html).join('\n');
  assert.ok(all.indexOf('&lt;img src=x onerror=alert(1)&gt;') >= 0, 'payload visible as text');
  assert.ok(all.indexOf('&amp;lt;img') < 0, 'payload not double-escaped');
  assert.ok(all.indexOf('&quot; onmouseover=&quot;alert(1)') >= 0, 'quote payload escaped');
  assert.ok(all.indexOf('&lt;/title&gt;&lt;script&gt;') >= 0, 'title breakout escaped');
  assert.ok(all.indexOf('<script') < 0 && all.indexOf('<img') < 0 && !/<svg\/onload/.test(all));
  // the fix table's pill tooltips: tags stripped, text escaped once
  const pill = /class="pill" href="#p:[^"]*" title="([^"]*)"/.exec(all);
  assert.ok(pill, 'pill rendered');
  assert.ok(pill[1].indexOf('&amp;lt;') < 0 || pill[1].indexOf('&amp;lt;b&amp;gt;') >= 0, 'tooltip escaped once');
});

test('unknown and malformed hashes fall back to the briefing', async () => {
  const env = makeEnv();
  await flush();
  for (const h of ['#nope', '#%E0%A4', '#__proto__', '#constructor', '#p:nope', '#p:__proto__']) {
    env.location.hash = h;
    env.hook.render();
    assert.strictEqual(env.hook.state.view, 'briefing', h);
    assert.ok(env.els['#main'].innerHTML.indexOf('daily briefing') >= 0, h);
  }
  env.location.hash = '#p:ivory';
  env.hook.render();
  assert.strictEqual(env.hook.state.view, 'p:ivory');
});

test('server errors and bad JSON give readable messages', async () => {
  const env = makeEnv();
  await flush();
  env.server.fail.getModel = { message: PAYLOADS[0] };
  env.hook.state.model = null;
  vm.runInContext('google.script.run.withSuccessHandler(__qcTest.setModel).withFailureHandler(function(){}).getModel()', env.sandbox);
  await flush();
  delete env.server.fail.getModel;
  for (const txt of ['null', '{}', '[]', '{"projects": 5}']) {
    env.hook.setModel(txt);
    assert.ok(env.els['#main'].innerHTML.indexOf('No data yet') >= 0, txt);
  }
  assert.throws(() => env.hook.setModel('not json'));
  // getReview returning null must not loop
  env.server.review = 'null';
  env.hook.setModel(JSON.stringify(syntheticModel()));
  env.calls.length = 0;
  env.location.hash = '#terms';
  env.hook.render();
  await flush(6);
  assert.ok(env.calls.filter((c) => c === 'getReview').length <= 1, 'one getReview call');
  assert.ok(env.els['#main'].innerHTML.indexOf('Search terms') >= 0);
  assertAllSafe(env, 'errors');
});

test('upload: decoding of UTF-16LE (with and without BOM), UTF-8 (with and without BOM), Windows-1252', () => {
  const { decode } = makeEnv().hook;
  const s = 'Search terms report\n"Search term","Cost"\n"ivory ₹",1,234.00\n';
  const u16 = Buffer.from(s, 'utf16le');
  assert.strictEqual(decode(Buffer.concat([Buffer.from([0xff, 0xfe]), u16])), s);
  assert.strictEqual(decode(u16), s);
  const be = Buffer.from(u16); for (let i = 0; i < be.length; i += 2) { const t = be[i]; be[i] = be[i + 1]; be[i + 1] = t; }
  assert.strictEqual(decode(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), s);
  assert.strictEqual(decode(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, 'utf8')])), s);
  assert.strictEqual(decode(Buffer.from(s, 'utf8')), s);
  assert.strictEqual(decode(Buffer.from([0x63, 0x61, 0x66, 0xe9])), 'café');
  assert.strictEqual(decode(new ArrayBuffer(0)), '');
  assert.strictEqual(decode(Buffer.from([0x61])), 'a');
});

test('upload: limits, results and errors are readable and escaped', async () => {
  const env = makeEnv();
  await flush();
  const out = env.els['#upload-out'];
  const file = (name, size, text) => ({ name, size, arrayBuffer: () => Promise.resolve(Buffer.from(text || 'x', 'utf8')) });
  env.calls.length = 0;
  env.hook.upload(Array.from({ length: 21 }, (_, i) => file('f' + i + '.csv', 10)));
  assert.ok(/at most 20/.test(out.innerHTML) && /21 files/.test(out.innerHTML));
  env.hook.upload([file(PAYLOADS[0] + '.csv', 11 * 1024 * 1024), file('ok.csv', 10)]);
  assert.ok(/over 10 MB/.test(out.innerHTML) && /11 MB/.test(out.innerHTML) && out.innerHTML.indexOf('<img') < 0);
  assert.ok(!env.calls.includes('uploadExports'), 'nothing sent when a limit is hit');
  env.hook.upload([]);
  env.server.uploadResult = [
    { name: PAYLOADS[0], kind: 'search_terms' + PAYLOADS[3], rows: 12, first_day: '2026-10-01', last_day: PAYLOADS[1], note: PAYLOADS[4] },
    { name: PAYLOADS[2], kind: null, rows: 0, note: PAYLOADS[0] },
    { name: 'x.csv', rows: 3 }, null, 'junk',
  ];
  env.hook.upload([file('a.csv', 10), file('b.csv', 10)]);
  await flush(8);
  assert.ok(/Loaded/.test(out.innerHTML) && /Skipped/.test(out.innerHTML), 'results shown');
  assert.ok(env.calls.includes('uploadExports'));
  env.server.uploadResult = 'not a list';
  env.hook.upload([file('a.csv', 10)]);
  await flush(8);
  assert.ok(/did not say what it loaded/.test(out.innerHTML));
  env.server.fail.uploadExports = null;
  env.hook.upload([file('a.csv', 10)]);
  await flush(8);
  assert.ok(/Problem/.test(out.innerHTML) && /unknown error/.test(out.innerHTML));
  env.server.fail.uploadExports = { message: PAYLOADS[3] };
  env.hook.upload([file('a.csv', 10)]);
  await flush(8);
  assert.ok(out.innerHTML.indexOf('&lt;/title&gt;&lt;script&gt;') >= 0);
  delete env.server.fail.uploadExports;
  env.hook.upload([{ name: PAYLOADS[0], size: 5, arrayBuffer: () => Promise.reject(new Error('locked')) }]);
  await flush(8);
  assert.ok(/Could not read/.test(out.innerHTML) && /locked/.test(out.innerHTML));
  const problems = [];
  env.writes.filter((w) => w.el === 'upload-out').forEach((w) => check(w.html).forEach((p) => problems.push(p)));
  assert.deepStrictEqual(problems, []);
});

test('real fixtures with hostile strings injected', { skip: !hasReal && 'data/fixtures/model.json or review.json missing' }, async () => {
  const model = JSON.parse(fs.readFileSync(path.join(FIX, 'model.json'), 'utf8'));
  const review = JSON.parse(fs.readFileSync(path.join(FIX, 'review.json'), 'utf8'));
  const env = makeEnv();
  await flush();
  for (const [name, mut] of [['real', (m) => m], ['real, hostile content', hostileContent], ['real, hostile everything', hostileAll], ['real, numbers as strings', numbersToStrings], ['real, nulls', nullsEverywhere], ['real, empty arrays', emptyArrays]]) {
    env.writes.length = 0;
    await renderAll(env, mut(model), mut(review));
    // real agency comments may legitimately contain the word "null"; the hostile passes check every other rule
    assertAllSafe(env, name, { allowNullWord: true });
    assert.ok(env.writes.length > 40, name);
  }
});
