/**
 * Sheets storage and server side (apps-script/30_Store.js, 40_Main.js): cell safety, row <-> cell conversion, merge
 * rules, chunking, access control, and a refresh / upload run against an in-memory fake spreadsheet.
 * No real data: every row here is made up.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine, plain, fixture, deepDiff } = require('./harness');

const FILES = ['00_Util.js', '01_Config.js', '30_Store.js', '40_Main.js'];
const SERVICES = ['SpreadsheetApp', 'PropertiesService', 'HtmlService', 'ScriptApp', 'Session', 'LockService', 'Utilities',
  'CacheService', 'UrlFetchApp', 'DriveApp', 'MailApp', 'GmailApp', 'Logger'];

/** A service stub that records every property read or call made on it. */
function spy(name, log) {
  const fn = function () {};
  return new Proxy(fn, {
    get(_t, prop) { log.push(`${name}.${String(prop)}`); return spy(`${name}.${String(prop)}`, log); },
    apply() { log.push(`${name}()`); return spy(`${name}()`, log); },
  });
}

test('loading the files touches no Apps Script service', () => {
  const log = [];
  const globals = {};
  for (const s of SERVICES) globals[s] = spy(s, log);
  const E = loadEngine(globals, FILES);
  assert.deepEqual(log, []);
  for (const f of ['doGet', 'getModel', 'getReview', 'whoAmI', 'uploadExports', 'refreshNow', 'refresh', 'setup', 'onOpen']) {
    assert.equal(typeof E[f], 'function', f);
  }
});

const E = loadEngine({}, FILES);

test('safeCell_: formula starters, number/date/time/percent/boolean look-alikes get an apostrophe', () => {
  const quoted = ['=IMPORTXML(1)', '-[a b]', '+91 98', '@x', "'already", '2026-11-05', '12:30', '1,234', '50%', 'TRUE', 'false',
    '3.8', '1e5', '05/11/2026', '5 Nov 2026', 'Nov 5, 2026', '2026-11-05T10:00:00', '9 pm', '₹1,500', '(12)', ' 42 ', 'may'];
  for (const s of quoted) assert.equal(E.safeCell_(s), "'" + s, s);
  for (const s of ['#N/A', '#REF!', '#1 project']) assert.equal(E.safeCell_(s), "'" + s, s);
  const plainText = ['ivory county 3 bhk price', 'jade gold 5 bhk', 'sector 115 noida', 'Target CPA increased from ₹511.80 to ₹800.00',
    '[a b]', '"golf links"', 'a = b', 'Exact match', 'clove county 8 cr', ' =x'];
  for (const s of plainText) assert.equal(E.safeCell_(s), s, s);
  assert.equal(E.safeCell_(null), '');
  assert.equal(E.safeCell_(undefined), '');
  assert.equal(E.safeCell_(''), '');
  assert.equal(E.safeCell_(12.5), 12.5);
  assert.equal(E.safeCell_(0), 0);
  assert.equal(E.safeCell_(-3), -3);
  assert.equal(E.safeCell_(true), true);
  assert.equal(E.safeCell_(NaN), '');
  assert.equal(E.safeCell_('x'.repeat(60000)).length, 50000);
});

test('TABLE_COLS / NUMERIC_COLS cover the contract tables', () => {
  assert.deepEqual(Object.keys(E.TABLE_COLS).sort(), ['agency_calls', 'auction', 'campaign_days', 'changes', 'keywords', 'search_terms']);
  for (const [t, nums] of Object.entries(E.NUMERIC_COLS)) for (const c of nums) assert.ok(E.TABLE_COLS[t].includes(c), `${t}.${c}`);
  assert.equal(E.TABLE_COLS.campaign_days.length, 19);
  assert.equal(E.TABLE_COLS.keywords.length, 18);
});

/** What a spreadsheet stores for a written value: a leading apostrophe marks text and is not part of the value. */
const stored = (v) => (typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v);
const isoFmt = (d, kind) => (kind === 'ts' ? d.toISOString().slice(0, 19) : d.toISOString().slice(0, 10));

test('rowsToValues_ / valuesToRows_ round trip, with Date cells and empty cells', () => {
  const cols = E.TABLE_COLS.campaign_days;
  const row = { day: '2026-11-05', campaign: 'ROI_Ivory_Search', campaign_id: '21234567890', campaign_status: 'Enabled', status: 'Eligible',
    status_reasons: '', bid_strategy: 'Maximise Conversions', budget_now: 2700, target_cpa_now: null, impr: 812, clicks: 40, cost: 5120.5,
    conv: 3, all_conv: 4, is_pct: 41.2, lost_budget_pct: null, lost_rank_pct: 12, top_is_pct: null, abs_top_is_pct: 9.5 };
  const values = E.rowsToValues_([row], cols, 'campaign_days');
  assert.deepEqual(plain(values[0]), plain(cols));
  assert.equal(values[1][0], "'2026-11-05");
  assert.equal(values[1][2], "'21234567890");
  assert.equal(values[1][8], '');
  const back = plain(E.valuesToRows_(values.map((r) => r.map(stored)), 'campaign_days', isoFmt));
  assert.deepEqual(back, [row]);

  // Cells written by someone else: real dates and numbers, empty cells, number-like text.
  const header = E.TABLE_COLS.search_terms;
  const sheet = [header, [new Date(Date.UTC(2026, 10, 4)), 'jade county', 'Exact match', 'None', 'ROI_Jade', 'Jade', '[jade county]', '', '', '1,234.5', ''],
    ['', '', '', '', '', '', '', '', '', '', '']];
  assert.deepEqual(plain(E.valuesToRows_(sheet, 'search_terms', isoFmt)), [{ day: '2026-11-04', term: 'jade county', match_type: 'Exact match',
    ads_status: 'None', campaign: 'ROI_Jade', ad_group: 'Jade', keyword: '[jade county]', clicks: 0, impr: 0, cost: 1234.5, conv: 0 }]);

  const ch = [E.TABLE_COLS.changes, [new Date(Date.UTC(2026, 10, 4, 10, 30, 5)), '2026-11-04', 'a@b.c', 'C', 'G', 'k', '-x']];
  assert.equal(E.valuesToRows_(ch, 'changes', isoFmt)[0].ts, '2026-11-04T10:30:05');

  const kw = [['keyword', 'quality_score', 'is_pct', 'clicks', 'extra'], ['a b', '', '', '', 'ignored'], ['c', 7, '< 10%', 3, '']];
  const k = plain(E.valuesToRows_(kw, 'keywords', isoFmt));
  assert.equal(k[0].quality_score, null);
  assert.equal(k[0].is_pct, null);
  assert.equal(k[0].clicks, 0);
  assert.equal(k[0].day, '');
  assert.equal(k[1].quality_score, 7);
  assert.equal(k[1].is_pct, null);
  assert.ok(!('extra' in k[0]));
  assert.equal(E.valuesToRows_([], 'keywords').length, 0);
});

const st = (day, term, extra = {}) => Object.assign({ day, term, match_type: 'Exact match', ads_status: 'None', campaign: 'C', ad_group: 'G',
  keyword: '-', clicks: 1, impr: 1, cost: 1, conv: 0 }, extra);

test('mergeRows_ search_terms: every day present in the new rows is replaced, then sorted', () => {
  const old = [st('2026-11-02', 'b'), st('2026-11-01', 'a'), st('2026-11-02', 'c')];
  const neu = [st('2026-11-02', 'z', { clicks: 9 }), st('2026-11-03', 'y')];
  const out = plain(E.mergeRows_('search_terms', old, neu));
  assert.deepEqual(out.map((r) => r.day + r.term), ['2026-11-01a', '2026-11-02z', '2026-11-03y']);
  assert.equal(out[1].clicks, 9);
  const sorted = plain(E.mergeRows_('search_terms', [], [st('d', 'b', { campaign: 'B' }), st('d', 'b', { campaign: 'A' }), st('d', 'a', { campaign: 'A', match_type: 'Phrase match' }), st('d', 'a', { campaign: 'A' })]));
  assert.deepEqual(sorted.map((r) => r.campaign + r.term + r.match_type[0]), ['AaE', 'AaP', 'AbE', 'BbE']);
});

test('mergeRows_ changes: union unique by (ts, campaign, ad_group, kind, item), stored row wins', () => {
  const c = (ts, item, user = 'old') => ({ ts, day: ts.slice(0, 10), user, campaign: 'C', ad_group: 'G', kind: 'negative exact match keyword added', item });
  const out = plain(E.mergeRows_('changes', [c('2026-11-02T10:00:00', '-[a]'), c('2026-11-01T09:00:00', '-[b]')],
    [c('2026-11-02T10:00:00', '-[a]', 'new'), c('2026-11-03T08:00:00', '-[c]', 'new'), c('2026-11-03T08:00:00', '-[c]', 'dup')]));
  assert.deepEqual(out.map((r) => r.ts.slice(8, 10) + r.item + r.user), ['01-[b]old', '02-[a]old', '03-[c]new']);
});

test('mergeRows_ campaign_days: a (day, campaign) row is replaced', () => {
  const r = (day, campaign, cost) => ({ day, campaign, cost });
  const out = plain(E.mergeRows_('campaign_days', [r('2026-11-02', 'B', 1), r('2026-11-02', 'A', 1), r('2026-11-01', 'A', 1)],
    [r('2026-11-02', 'A', 5), r('2026-11-03', 'A', 2), r('2026-11-03', 'A', 3)]));
  assert.deepEqual(out.map((x) => x.day.slice(8) + x.campaign + x.cost), ['01A1', '02A5', '02B1', '03A3']);
});

test('mergeRows_ keywords: the snapshot with the latest day wins, new order kept', () => {
  const k = (day, keyword) => ({ period_start: '2026-10-01', day, keyword });
  const old = [k('2026-11-04', 'a'), k('2026-11-04', 'b')];
  assert.deepEqual(plain(E.mergeRows_('keywords', old, [k('2026-11-05', 'z'), k('2026-11-05', 'c')])).map((x) => x.keyword), ['z', 'c']);
  assert.deepEqual(plain(E.mergeRows_('keywords', old, [k('2026-11-04', 'q')])).map((x) => x.keyword), ['q']);
  assert.deepEqual(plain(E.mergeRows_('keywords', old, [k('2026-11-01', 'q')])).map((x) => x.keyword), ['a', 'b']);
  assert.deepEqual(plain(E.mergeRows_('keywords', old, [])).map((x) => x.keyword), ['a', 'b']);
  assert.deepEqual(plain(E.mergeRows_('keywords', [], [k('2026-11-01', 'q')])).map((x) => x.keyword), ['q']);
});

test('mergeRows_ auction: rows of the same (period_start, day) are replaced', () => {
  const a = (ps, day, domain, v) => ({ period_start: ps, day, domain, impression_share: v });
  const out = plain(E.mergeRows_('auction', [a('2026-10-01', '2026-10-31', 'x.com', 1), a('2026-10-01', '2026-10-31', 'y.com', 1), a('2026-09-01', '2026-09-30', 'x.com', 1)],
    [a('2026-10-01', '2026-10-31', 'z.com', 2), a('2026-10-01', '2026-10-31', 'b.com', 2)]));
  assert.deepEqual(out.map((x) => x.period_start.slice(5, 7) + x.domain + x.impression_share), ['09x.com1', '10b.com2', '10z.com2']);
  assert.throws(() => E.mergeRows_('agency_calls', [], []));
});

test('chunk_ / unchunk_ round trip, never splitting a surrogate pair', () => {
  const s = JSON.stringify({ a: 'x'.repeat(100000), b: 'emoji 🏠 '.repeat(5000) });
  const parts = E.chunk_(s);
  assert.ok(parts.length >= 3);
  assert.ok(parts.every((p) => p.length <= 45000));
  assert.equal(E.unchunk_(parts), s);
  assert.equal(E.unchunk_(parts.map((p) => [p])), s);
  const odd = 'a🏠b';
  assert.deepEqual(plain(E.chunk_(odd, 2)), ['a', '🏠', 'b']);
  assert.deepEqual(plain(E.chunk_('')), []);
  assert.equal(E.unchunk_([]), '');
});

test('access helpers and settings / projects parsing', () => {
  assert.deepEqual(plain(E.parseViewers_(' A@x.com, b@Y.com;c@z.com  ')), ['a@x.com', 'b@y.com', 'c@z.com']);
  assert.equal(E.isAllowedEmail_('Owner@x.com', 'owner@x.com', ''), true);
  assert.equal(E.isAllowedEmail_('v@x.com', 'owner@x.com', 'a@x.com, V@x.com'), true);
  assert.equal(E.isAllowedEmail_('s@x.com', 'owner@x.com', 'a@x.com'), false);
  assert.equal(E.isAllowedEmail_('', '', ''), false);
  assert.equal(E.isAllowedEmail_('vx.com', 'owner@x.com', 'avx.com'), false);
  assert.deepEqual(plain(E.settingsFromValues_([['key', 'value'], ['Viewers', ' a@x.com '], ['agency_sheet_id', 'abc'], ['', 'x']])),
    { viewers: 'a@x.com', agency_sheet_id: 'abc' });
  assert.equal(E.escapeHtml_('<a href="x">&\''), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');

  const cfg = E.defaultConfig();
  const seed = plain(E.projectsSeedValues_(cfg));
  assert.deepEqual(seed[0], ['id', 'name', 'match', 'location', 'product', 'starting_price_cr', 'max_price_cr', 'villas_or_penthouses']);
  assert.deepEqual(seed.slice(1).map((r) => r[0]), ['ivory', 'clove', 'cocoa', 'jade']);
  assert.deepEqual(plain(E.projectsFromValues_(cfg, seed)), plain(cfg));

  const edited = seed.map((r) => r.slice());
  edited[2][5] = '8.5';
  edited[3][2] = 'cocoa, Cocoa Gold';
  edited[3][6] = '';
  edited.push(['ruby', 'Ruby County', 'ruby', 'Noida', '', '6', '', '']);
  const c2 = plain(E.projectsFromValues_(cfg, edited));
  assert.equal(c2.projects[1].starting_price_cr, 8.5);
  assert.deepEqual(c2.projects[2].match, ['cocoa', 'cocoa gold']);
  assert.ok(!('max_price_cr' in c2.projects[2]));
  assert.deepEqual(c2.projects[4], { id: 'ruby', name: 'Ruby County', match: ['ruby'], location: 'Noida', product: '', starting_price_cr: 6 });
  assert.equal(cfg.projects.length, 4, 'the input config is not changed');
});

test('validateUploads_ rejects anything but a short list of named text files', () => {
  const ok = [{ name: 'a.csv', text: 'x' }];
  E.validateUploads_(ok);
  for (const bad of [null, 'x', {}, [], [null], [{ name: 1, text: '' }], [{ name: 'a', text: 5 }], [{ name: 'n'.repeat(201), text: '' }],
    Array.from({ length: 21 }, () => ({ name: 'a', text: '' }))]) {
    assert.throws(() => E.validateUploads_(bad));
  }
});

/* ---------- in-memory fake of the Apps Script services used by 30_Store.js / 40_Main.js ---------- */

function fakeSheet(name) {
  let cells = [];
  let hidden = false;
  const fmt = {};
  const sh = {
    getName: () => name,
    getLastRow: () => cells.length,
    getLastColumn: () => cells.reduce((m, r) => Math.max(m, r.length), 0),
    clear: () => { cells = []; },
    setFrozenRows: () => {},
    setColumnWidth: () => {},
    hideSheet: () => { hidden = true; return sh; },
    isSheetHidden: () => hidden,
    appendRow: (row) => { cells.push(row.map((v) => (typeof v === 'string' && v[0] === "'" ? v.slice(1) : v))); return sh; },
    getDataRange: () => sh.getRange(1, 1, Math.max(cells.length, 1), Math.max(sh.getLastColumn(), 1)),
    getRange: (r, c, nr = 1, nc = 1) => {
      const rng = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
          const v = (cells[r - 1 + i] || [])[c - 1 + j];
          return v === undefined ? '' : v;
        })),
        setValues: (vals) => {
          assert.equal(vals.length, nr);
          sh.setValuesCalls = (sh.setValuesCalls || 0) + 1;
          vals.forEach((row, i) => {
            assert.equal(row.length, nc);
            row.forEach((v, j) => {
              while (cells.length < r + i) cells.push([]);
              const line = cells[r - 1 + i];
              while (line.length < c + j) line.push('');
              assert.ok(!(typeof v === 'string' && /^[=+\-@]/.test(v)), 'a formula-looking string reached a cell: ' + String(v).slice(0, 20));
              line[c - 1 + j] = typeof v === 'string' && v[0] === "'" ? v.slice(1) : v;
              assert.ok(typeof v !== 'string' || v.length <= 50000);
            });
          });
          return rng;
        },
        setValue: (v) => rng.setValues([[v]]),
        clearContent: () => {
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (cells[r - 1 + i]) cells[r - 1 + i][c - 1 + j] = '';
          while (cells.length && cells[cells.length - 1].every((v) => v === '')) cells.pop();
          return rng;
        },
        setNumberFormat: (f) => { fmt[`${r},${c}`] = f; return rng; },
        setFontWeight: () => rng,
        setFontSize: () => rng,
      };
      return rng;
    },
  };
  return sh;
}

function fakeServices({ email, owner = 'owner@x.com', viewers = '', effective = null } = {}) {
  const sheets = [];
  const ss = {
    getId: () => 'SS1',
    getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null,
    insertSheet: (n) => { const s = fakeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
    getSpreadsheetTimeZone: () => 'Asia/Kolkata',
    toast: () => {},
    setActiveSheet: () => {},
    moveActiveSheet: () => {},
  };
  const props = { OWNER: owner, SPREADSHEET_ID: 'SS1' };
  const calls = [];
  const agency = { getSheets: () => [fakeSheet('4 Nov')] };
  const svc = {
    console: { log() {} },
    SpreadsheetApp: {
      openById: (id) => { if (id === 'SS1') return ss; if (id === 'AGENCY') return agency; throw new Error('no access'); },
      getActive: () => ss,
      getUi: () => { throw new Error('no UI here'); },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    Session: { getActiveUser: () => ({ getEmail: () => email }), getEffectiveUser: () => ({ getEmail: () => (effective === null ? email : effective) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { formatDate: (d, tz, f) => (f.indexOf('HH') >= 0 ? '2026-11-06T09:00:00+05:30' : '2026-11-06') },
    HtmlService: {
      createHtmlOutput: (h) => { calls.push('createHtmlOutput'); const o = { html: h, setTitle: () => o, addMetaTag: () => o }; return o; },
      createHtmlOutputFromFile: (f) => { calls.push('fromFile:' + f); const o = { file: f, setTitle: () => o, addMetaTag: () => o }; return o; },
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/x/exec' }) },
  };
  return { svc, ss, props, calls, settings: [['key', 'value', 'note'], ['agency_sheet_id', 'AGENCY', ''], ['viewers', viewers, '']] };
}

function engineWith(opts) {
  const f = fakeServices(opts);
  const X = loadEngine(f.svc, FILES);
  const s = f.ss.insertSheet('Settings');
  s.getRange(1, 1, 3, 3).setValues(f.settings);
  return { X, f };
}

test('web app endpoints: strangers get the fixed no-access page and nothing else', () => {
  const { X, f } = engineWith({ email: 'stranger@x.com', viewers: 'v@x.com' });
  const page = X.doGet({});
  assert.equal(page.html, X.NO_ACCESS_HTML_);
  assert.ok(!page.html.includes('stranger'));
  for (const fn of ['getModel', 'getReview', 'whoAmI']) assert.throws(() => X[fn](), /No access/);
  assert.throws(() => X.uploadExports([{ name: 'a', text: 'b' }]), /owner/);
  assert.throws(() => X.refreshNow(), /owner/);
  assert.throws(() => X.refresh(), /owner/);
  assert.throws(() => X.setup(), /owner/);
  assert.deepEqual(f.calls, ['createHtmlOutput']);
});

test('web app endpoints: a viewer can read but not upload; the owner sees the dashboard', () => {
  const v = engineWith({ email: 'V@x.com', viewers: 'a@x.com, v@x.com' });
  assert.equal(v.X.doGet({}).file, 'Dashboard');
  assert.equal(v.X.getModel(), '{}');
  assert.equal(v.X.getReview(), '[]');
  assert.deepEqual(plain(v.X.whoAmI()), { email: 'v@x.com', canUpload: false });
  assert.throws(() => v.X.uploadExports([{ name: 'a', text: 'b' }]), /owner/);
  const o = engineWith({ email: 'owner@x.com' });
  assert.deepEqual(plain(o.X.whoAmI()), { email: 'owner@x.com', canUpload: true });
  const none = engineWith({ email: '', owner: '' });
  assert.equal(none.X.doGet({}).html, none.X.NO_ACCESS_HTML_);
});

test('refresh merges the feeds, rebuilds agency_calls and stores the model; upload merges and refreshes', () => {
  const { X, f } = engineWith({ email: 'owner@x.com' });
  let seen = null;
  X.parseAgencyTab = (title) => [{ day: '2026-11-04', tab: title, term: '=hyperlink("x")', match_type: 'Exact match', ads_status: 'None',
    campaign: 'C', ad_group: 'G', keyword: '-', clicks: 1, impr: 2, cost: 3, conv: 0, decision: 'Exclude', neg_term: '-[x]', county_comment: '' }];
  X.buildModel = (T, cfg, asOf) => { seen = { T: plain(T), n: cfg.projects.length, asOf }; return { model: { big: 'm'.repeat(100000) }, review: [{ a: 1 }] }; };
  X.writeTable_('raw_search_terms', [st('2026-11-01', 'old'), st('2026-11-02', 'gone')], 'search_terms');
  X.writeTable_('feed_search_terms', [st('2026-11-02', 'new'), st('2026-11-03', '50%')], 'search_terms');
  const r = X.refresh();
  assert.equal(r.ok, true);
  assert.equal(seen.asOf, '2026-11-06');
  assert.equal(seen.n, 4);
  assert.deepEqual(seen.T.search_terms.map((x) => x.term), ['old', 'new', '50%']);
  assert.equal(seen.T.agency_calls[0].term, '=hyperlink("x")');
  assert.deepEqual(Object.keys(seen.T).sort(), ['agency_calls', 'auction', 'campaign_days', 'changes', 'keywords', 'search_terms']);
  const model = JSON.parse(X.getModel());
  assert.equal(model.big.length, 100000);
  assert.equal(model.refreshed_at, '2026-11-06T09:00:00+05:30');
  assert.equal(X.getReview(), '[{"a":1}]');
  assert.ok(f.ss.getSheetByName('_model').isSheetHidden());
  assert.ok(f.ss.getSheetByName('agency_calls').isSheetHidden());

  X.detectKind = (text) => (text.startsWith('ST') ? 'search_terms' : 'unknown');
  X.parseExport = () => ({ kind: 'search_terms', rows: [st('2026-11-05', 'up'), st('2026-11-04', 'up2')] });
  const res = plain(X.uploadExports([{ name: 'terms.csv', text: 'ST...' }, { name: 'what.pdf', text: '%PDF' }]));
  assert.deepEqual(res, [{ name: 'terms.csv', kind: 'search_terms', rows: 2, first_day: '2026-11-04', last_day: '2026-11-05', note: '' },
    { name: 'what.pdf', kind: 'unknown', rows: 0, first_day: null, last_day: null, note: 'not recognised' }]);
  assert.deepEqual(seen.T.search_terms.map((x) => x.day), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  assert.deepEqual(plain(X.refreshNow()), { ok: true, at: '2026-11-06T09:00:00+05:30' });
});

test('an agency sheet that cannot be opened keeps the previous agency rows', () => {
  const { X, f } = engineWith({ email: 'owner@x.com' });
  f.ss.getSheetByName('Settings').getRange(2, 2).setValue('MISSING');
  const prev = { day: '2026-11-01', tab: '1 Nov', term: 't', match_type: 'Exact match', ads_status: 'None', campaign: 'C', ad_group: 'G',
    keyword: '-', clicks: 0, impr: 0, cost: 0, conv: 0, decision: '', neg_term: '', county_comment: '' };
  X.writeTable_('agency_calls', [prev], 'agency_calls');
  let got = null;
  X.buildModel = (T) => { got = plain(T.agency_calls); return { model: {}, review: [] }; };
  X.refresh();
  assert.deepEqual(got, [prev]);
  const readme = f.ss.getSheetByName('Read me').getDataRange().getValues();
  assert.ok(readme.some((r) => r[0] === 'Agency sheet' && String(r[1]).includes('Could not open')));
});

test('every fixture table survives a write and read back unchanged', { skip: !fixture.exists('tables.json') && 'no local fixtures' }, () => {
  const T = fixture.json('tables.json');
  for (const table of Object.keys(E.TABLE_COLS)) {
    const rows = T[table] || [];
    const values = E.rowsToValues_(rows, E.TABLE_COLS[table], table).map((r) => r.map(stored));
    const back = plain(E.valuesToRows_(values, table, isoFmt));
    const diffs = deepDiff(back, rows, table, [], 0, 5);
    // Paths only: the fixtures hold real account data, which must not end up in test output.
    assert.equal(diffs.length, 0, `${table}: ${diffs.length} differences, first at ${String(diffs[0]).split(':')[0]}`);
  }
});

test('table I/O: the engine uses private helpers; the public versions are owner-only', () => {
  assert.equal(typeof E.readTable_, 'function');
  assert.equal(typeof E.writeTable_, 'function');
  const v = engineWith({ email: 'v@x.com', viewers: 'v@x.com' });
  assert.throws(() => v.X.writeTable('Settings', [], 'changes'), /owner/);
  assert.throws(() => v.X.readTable('Settings', 'changes'), /owner/);
  const o = engineWith({ email: 'owner@x.com' });
  o.X.writeTable('raw_changes', [], 'changes');
  assert.deepEqual(plain(o.X.readTable('raw_changes', 'changes')), []);
});

test('the effective user counts only for a time-driven trigger, never for a web-app or menu call', () => {
  // Active user hidden, effective user = owner (what an "execute as me" deployment would give every visitor).
  const { X } = engineWith({ email: '', effective: 'owner@x.com' });
  X.buildModel = () => ({ model: {}, review: [] });
  assert.equal(X.doGet({}).html, X.NO_ACCESS_HTML_);
  assert.throws(() => X.getModel(), /No access/);
  assert.throws(() => X.refreshNow(), /owner/);
  assert.throws(() => X.refresh(), /owner/);
  assert.throws(() => X.uploadExports([{ name: 'a', text: 'b' }]), /owner/);
  assert.equal(X.refresh({ triggerUid: '123', authMode: 'FULL' }).ok, true);
});

test('saved JSON: header + pieces in one setValues, shrinking leaves no stale tail, torn reads are caught', () => {
  const { X, f } = engineWith({ email: 'owner@x.com' });
  X.saveJson_('_model', { big: 'x'.repeat(200000) });
  const sh = f.ss.getSheetByName('_model');
  assert.equal(sh.setValuesCalls, 1);
  assert.equal(sh.getLastRow(), 1 + 5);
  assert.ok(sh.getRange(1, 1, sh.getLastRow(), 1).getValues().every((r) => r[0].length <= 45002));
  X.saveJson_('_model', { small: 1 });
  assert.equal(X.loadJson_('_model'), '{"small":1}');
  assert.equal(sh.getLastRow(), 2);
  // A save that grew while a reader was between getLastRow and getValues: header promises more pieces than were read.
  assert.equal(X.jsonFromCells_([['~#3:10~'], ['~abc~']]), undefined);
  // New header and pieces over an older, longer save not yet trimmed: the extra rows are ignored.
  assert.equal(X.jsonFromCells_([['~#1:3~'], ['~[1]~'], ['~old tail~']]), '[1]');
  assert.equal(X.jsonFromCells_([['~#1:9~'], ['~[1]~']]), undefined);
  // Tabs saved before the header existed still load.
  assert.equal(X.jsonFromCells_([['~{"a":~'], ['~1}~']]), '{"a":1}');
  assert.equal(X.jsonFromCells_([]), null);
  // A tab that stays torn throws instead of returning a broken string.
  sh.getRange(1, 1).setValue('~#4:100~');
  assert.throws(() => X.loadJson_('_model'), /rebuilt/);
});

test('storeHide_ never hides the only visible tab', () => {
  const { X, f } = engineWith({ email: 'owner@x.com' });
  const only = f.ss.getSheetByName('Settings');
  X.storeHide_(only);
  assert.equal(only.isSheetHidden(), false);
  const other = f.ss.insertSheet('_review');
  X.storeHide_(other);
  assert.equal(other.isSheetHidden(), true);
  assert.equal(X.storeHide_(null), null);
});

test('an unchanged feed is merged once, so it never overwrites rows uploaded after it', () => {
  const { X } = engineWith({ email: 'owner@x.com' });
  let seen = null;
  X.parseAgencyTab = () => [];
  X.buildModel = (T) => { seen = plain(T); return { model: {}, review: [] }; };
  X.writeTable_('feed_search_terms', [st('2026-11-04', 'feed')], 'search_terms');
  X.refresh();
  assert.deepEqual(seen.search_terms.map((x) => x.term), ['feed']);
  // An upload (newer data for the same day) replaces the day; the next daily refresh must keep it.
  X.detectKind = () => 'search_terms';
  X.parseExport = () => ({ kind: 'search_terms', rows: [st('2026-11-04', 'upload')] });
  X.uploadExports([{ name: 'terms.csv', text: 'x' }]);
  assert.deepEqual(seen.search_terms.map((x) => x.term), ['upload']);
  X.refresh();
  assert.deepEqual(seen.search_terms.map((x) => x.term), ['upload']);
  // A new feed from the Ads Script is merged again.
  X.writeTable_('feed_search_terms', [st('2026-11-05', 'next')], 'search_terms');
  X.refresh();
  assert.deepEqual(seen.search_terms.map((x) => x.term), ['upload', 'next']);
  assert.notEqual(X.rowsFingerprint_([st('d', 'a')]), X.rowsFingerprint_([st('d', 'b')]));
});

test('a failed rebuild after an upload says the files were saved', () => {
  const { X } = engineWith({ email: 'owner@x.com' });
  X.parseAgencyTab = () => [];
  X.buildModel = () => { throw new Error('boom'); };
  X.detectKind = () => 'search_terms';
  X.parseExport = () => ({ kind: 'search_terms', rows: [st('2026-11-04', 'a')] });
  assert.throws(() => X.uploadExports([{ name: 'terms.csv', text: 'x' }]), /files were saved.*boom/);
});

test('fixture model and review fit the cell limit and load back unchanged', { skip: !fixture.exists('model.json') && 'no local fixtures' }, () => {
  const { X, f } = engineWith({ email: 'owner@x.com' });
  for (const [tab, name] of [['_model', 'model.json'], ['_review', 'review.json']]) {
    const obj = fixture.json(name);
    X.saveJson_(tab, obj);
    const sh = f.ss.getSheetByName(tab);
    assert.equal(sh.setValuesCalls, 1, tab);
    const cells = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
    assert.ok(cells.every((r) => r[0].length <= 45002), tab);
    assert.equal(X.loadJson_(tab), JSON.stringify(obj), tab);
  }
});
