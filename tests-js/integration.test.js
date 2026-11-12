/**
 * Rehearsal of the whole Google side on this computer, against a strict fake of Google Sheets (fake-google.js):
 * set up the sheet, let the "Ads Script" fill the feed tabs, upload a report, refresh, then open the dashboard as the
 * owner, as an allowed viewer and as a stranger. Uses the real fixtures, so it skips when they are missing.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, ENGINE, fixture, plain, deepDiff } = require('./harness');
const { makeGoogle, unsafeCells } = require('./fake-google');

const ready = fixture.exists('tables.json') && fixture.exists('agency_tabs.json') && fixture.exists('config.json');
const OWNER = 'owner@example.com';
const AGENCY_ID = 'TEST-agency-sheet-id-for-the-fake-000000000';

/** The agency sheet's ID is private (never in code or git), so the test types the fake one into Settings like the owner does. */
function useAgency(ss) {
  const sh = ss.getSheetByName('Settings');
  const row = sh.getDataRange().getValues().findIndex((r) => r[0] === 'agency_sheet_id');
  assert.ok(row >= 0, 'Settings has an agency_sheet_id row');
  sh.getRange(row + 1, 2).setValue(AGENCY_ID);
}

function boot() {
  const tabs = fixture.json('agency_tabs.json');
  const { G, env, ss, agency } = makeGoogle({ owner: OWNER, agencyId: AGENCY_ID, agencyTabs: tabs, root: ROOT });
  const ctx = vm.createContext(G);
  for (const f of fs.readdirSync(ENGINE).filter((n) => n.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(ENGINE, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, env, ss, agency };
}

function decode(file) {
  const b = fs.readFileSync(file);
  return b[0] === 0xff && b[1] === 0xfe ? new TextDecoder('utf-16le').decode(b.subarray(2)) : b.toString('utf8');
}

test('setup, feed, upload, refresh and access control work end to end', { skip: !ready && 'needs data/fixtures' }, () => {
  const { ctx, env, ss } = boot();
  const T = fixture.json('tables.json');

  // 1. first run, twice: idempotent, one trigger
  ctx.setup();
  ctx.setup();
  useAgency(ss);
  const names = ss.getSheets().map((s) => s.getName());
  for (const n of ['Read me', 'Settings', 'Projects']) assert.ok(names.includes(n), `tab ${n} missing (have ${names.join(', ')})`);
  assert.equal(env.triggers.filter((t) => t.fn === 'refresh').length, 1, 'exactly one daily refresh trigger');
  assert.equal(env.props.OWNER, OWNER);

  // 2. the Google Ads Script writes its feed tabs (same normalized columns)
  for (const t of ['search_terms', 'changes', 'campaign_days', 'keywords']) ctx.writeTable('feed_' + t, T[t], t);

  // 3. an upload of a report the feed does not cover, which also refreshes
  const auctionFile = fs.readdirSync(path.join(ROOT, 'inbox')).find((n) => n.startsWith('auction_'));
  const res = plain(ctx.uploadExports([{ name: auctionFile, text: decode(path.join(ROOT, 'inbox', auctionFile)) }]));
  assert.equal(res[0].kind, 'auction');
  assert.ok(res[0].rows > 0);

  // 4. the stored model equals the reference model built straight from the fixtures
  const model = JSON.parse(ctx.getModel());
  assert.ok(model.refreshed_at, 'refreshed_at is stamped');
  const want = plain(ctx.buildModel(T, fixture.json('config.json'), model.as_of));
  delete model.refreshed_at;
  const diffs = deepDiff(model, want.model, 'model');
  assert.deepEqual(diffs, [], diffs.join('\n'));
  const review = JSON.parse(ctx.getReview());
  const rd = deepDiff(review, want.review, 'review');
  assert.deepEqual(rd, [], rd.join('\n'));

  // 5. nothing Sheets would turn into a formula or an error
  assert.deepEqual(unsafeCells(ss), []);

  // 6. access control
  const page = ctx.doGet({});
  assert.equal(page.file, 'Dashboard', 'the owner gets the dashboard');
  assert.equal(plain(ctx.whoAmI()).canUpload, true);

  env.user = 'stranger@example.com';
  const denied = ctx.doGet({});
  assert.notEqual(denied.file, 'Dashboard', 'a stranger must not get the dashboard');
  assert.ok(!/ivory|cocoa|₹/i.test(denied.getContent()), 'the no-access page carries no data');
  for (const fn of ['getModel', 'getReview', 'refreshNow']) assert.throws(() => ctx[fn](), undefined, `${fn} must refuse a stranger`);
  assert.throws(() => ctx.uploadExports([{ name: 'x.csv', text: 'a' }]), undefined, 'uploadExports must refuse a stranger');

  env.user = OWNER;
  const settings = ss.getSheetByName('Settings');
  const vals = settings.getDataRange().getValues();
  const row = vals.findIndex((r) => r[0] === 'viewers');
  assert.ok(row >= 0, 'Settings has a viewers row');
  settings.getRange(row + 1, 2).setValue('Boss@Example.com, bhavik@example.com');
  env.user = 'boss@example.com';
  assert.equal(ctx.doGet({}).file, 'Dashboard', 'an allowed viewer gets the dashboard (emails compared case-insensitively)');
  assert.ok(ctx.getModel().length > 1000);
  assert.equal(plain(ctx.whoAmI()).canUpload, false);
  assert.throws(() => ctx.uploadExports([{ name: 'x.csv', text: 'a' }]), undefined, 'a viewer must not upload');
  assert.throws(() => ctx.refreshNow(), undefined, 'a viewer must not refresh');
});

test('hostile text stays text: formulas, leading signs and HTML survive the round trip unchanged', { skip: !ready && 'needs data/fixtures' }, () => {
  const { ctx, env, ss } = boot();
  const T = fixture.json('tables.json');
  ctx.setup();
  useAgency(ss);
  const day = T.search_terms[0].day;
  const hostile = ['=IMPORTXML("http://evil.example","//a")', '+91 98100 00000', '-[godrej greater noida]', '@everyone', '<img src=x onerror=alert(1)>', '2026-11-05', '1,234', '50%', 'TRUE'];
  const st = T.search_terms.concat(hostile.map((term, i) => ({ day, term, match_type: 'Exact match', ads_status: 'None', campaign: 'ROI_Ivory_Non_Brand_Search', ad_group: 'Flats in Noida', keyword: '-', clicks: 1, impr: 1, cost: 10 + i, conv: 0 })));
  for (const t of ['search_terms', 'changes', 'campaign_days', 'keywords']) ctx.writeTable('feed_' + t, t === 'search_terms' ? st : T[t], t);
  ctx.refreshNow();
  assert.deepEqual(unsafeCells(ss), [], 'no cell became a formula or an error');
  const review = JSON.parse(ctx.getReview());
  for (const h of hostile) assert.ok(review.some((r) => r.term === h), `search term survived unchanged: ${h}`);
});
