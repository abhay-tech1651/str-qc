/**
 * County Search QC feed: a Google Ads Script (new scripts experience) for ONE Google Ads account.
 *
 * Every run it reads the account with AdsApp.search (GAQL) and OVERWRITES five tabs of the spreadsheet at
 * CONFIG.SPREADSHEET_URL: feed_search_terms, feed_changes, feed_campaign_days, feed_keywords, feed_meta.
 * Column names and value conventions follow docs/CONTRACT.md sections 2 and 3. The script only reads the Google Ads
 * account; it never changes anything in it, and it writes nowhere except those five tabs.
 *
 * Layout of this file:
 *   1. CONFIG and constants (declarations only; nothing runs when the file loads).
 *   2. Pure functions: labels, sentinels, micros, rupee formatting, change-event mapping, cell text safety, row
 *      builders. They take plain objects (the rows AdsApp.search returns) and return plain values.
 *   3. Service functions: the only code that calls AdsApp, SpreadsheetApp, Utilities or Logger.
 *   4. main(): Google calls it; it is never called from this file.
 *
 * Documentation this script relies on (Google Ads API v26 field reference, checked 2026-11-06):
 *   https://developers.google.com/google-ads/api/fields/latest/overview          (latest version = v26)
 *   https://developers.google.com/google-ads/api/fields/v26/search_term_view       (fields, segments, metrics)
 *   https://developers.google.com/google-ads/api/fields/v26/segments
 *   https://developers.google.com/google-ads/api/fields/v26/change_event
 *   https://developers.google.com/google-ads/api/fields/v26/keyword_view
 *   https://developers.google.com/google-ads/api/fields/v26/ad_group_criterion
 *   https://developers.google.com/google-ads/api/docs/change-event                 (30-day window, LIMIT <= 10000)
 *   https://developers.google.com/google-ads/api/docs/query/date-ranges            (YYYY-MM-DD, BETWEEN, account time zone)
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/ChangeEvent
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/ChangeEvent.ChangedResource
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/SearchTermMatchTypeEnum.SearchTermMatchType
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/SearchTermMatchSourceEnum.SearchTermMatchSource
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/SearchTermTargetingStatusEnum.SearchTermTargetingStatus
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/AdGroupCriterion
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/AdGroupCriterion.QualityInfo
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/QualityScoreBucketEnum.QualityScoreBucket
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/AdGroupCriterionPrimaryStatusEnum.AdGroupCriterionPrimaryStatus
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/AdGroupCriterionPrimaryStatusReasonEnum.AdGroupCriterionPrimaryStatusReason
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/Campaign
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/CampaignPrimaryStatusEnum.CampaignPrimaryStatus
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/CampaignPrimaryStatusReasonEnum.CampaignPrimaryStatusReason
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/BiddingStrategyTypeEnum.BiddingStrategyType
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/MaximizeConversions
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/TargetCpa
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/CampaignBudget
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/AdGroup
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/AdGroup.AiMaxAdGroupSetting
 *   https://developers.google.com/google-ads/api/reference/rpc/v26/Metrics       (0.0999 / 0.9001 sentinels)
 *   https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp#search_2
 *   https://developers.google.com/google-ads/scripts/docs/features/reports        (rows are lowerCamelCase objects)
 *   https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_account
 *   https://developers.google.com/google-ads/scripts/docs/examples/spreadsheetapp
 *   https://developers.google.com/google-ads/scripts/docs/limits                  (30-minute run limit)
 *   https://developers.google.com/google-ads/scripts/docs/concepts/preview        (Preview still writes to spreadsheets)
 *   https://developers.google.com/google-ads/api/docs/query/grammar               (no date-time literal format documented)
 *
 * Not confirmed by those docs (handled defensively, see the notes next to the code): the exact text format of
 * change_event.change_date_time, whether a date-time literal (not just a date) is accepted in the change_event WHERE
 * clause (used only to page past 10,000 events), how AdsApp.search serialises changed_fields (string or list) and
 * int64 values (string or number), whether old_resource is filled on REMOVE, and which UI label Google uses for AI Max
 * search terms.
 */

/* =====================================================================================================================
 * 1. CONFIG
 * ===================================================================================================================*/

var CONFIG = {
  SPREADSHEET_URL: 'PASTE_SPREADSHEET_URL_HERE',
  SEARCH_TERM_DAYS: 7,   // search terms for the last N complete days (yesterday back)
  CHANGE_DAYS: 14,       // change history for the last N days up to now (max 29: the API keeps 30 days)
  CAMPAIGN_DAYS: 30,     // campaign daily rows for the last N complete days
  KEYWORD_DAYS: 30,      // keyword snapshot: totals over the last N complete days
  BACKFILL: false        // true = search terms for 30 days and changes for 29 days (first run only)
};

var FEED_SCRIPT_VERSION = '1.0.1';

/** CONTRACT section 2 column order (the header row of each feed tab). */
var FEED_COLUMNS = {
  search_terms: ['day', 'term', 'match_type', 'ads_status', 'campaign', 'ad_group', 'keyword', 'clicks', 'impr', 'cost', 'conv'],
  changes: ['ts', 'day', 'user', 'campaign', 'ad_group', 'kind', 'item'],
  campaign_days: ['day', 'campaign', 'campaign_id', 'campaign_status', 'status', 'status_reasons', 'bid_strategy',
    'budget_now', 'target_cpa_now', 'impr', 'clicks', 'cost', 'conv', 'all_conv', 'is_pct', 'lost_budget_pct',
    'lost_rank_pct', 'top_is_pct', 'abs_top_is_pct'],
  keywords: ['period_start', 'day', 'keyword_status', 'keyword', 'match_type', 'campaign', 'ad_group', 'status',
    'status_reasons', 'cost', 'clicks', 'impr', 'conv', 'quality_score', 'ad_relevance', 'landing_page', 'is_pct',
    'lost_rank_pct']
};

var FEED_SECTIONS = ['search_terms', 'changes', 'campaign_days', 'keywords'];

/** change_event: the API refuses a window older than 30 days and a LIMIT above 10000. */
var FEED_CHANGE_MAX_DAYS = 29;
var FEED_CHANGE_PAGE = 10000;
var FEED_CHANGE_MAX_PAGES = 10;
var FEED_BACKFILL_SEARCH_DAYS = 30;

/**
 * Most data rows written to one feed tab. A spreadsheet holds at most 10 million cells in all, and the raw_ history
 * tabs live in the same file. Over the cap whole oldest days are dropped (search terms, campaign days), the oldest
 * changes are dropped, and the keyword snapshot fails rather than being written incomplete.
 */
var FEED_MAX_ROWS = 100000;

/** The CONTRACT dates are Asia/Kolkata days; feed_meta warns when the account uses another time zone. */
var FEED_EXPECTED_TZ = 'Asia/Kolkata';

/** segments.search_term_match_type -> the label of the Google Ads search terms report. */
var FEED_ST_MATCH_LABELS = {
  BROAD: 'Broad match',
  PHRASE: 'Phrase match',
  EXACT: 'Exact match',
  NEAR_PHRASE: 'Phrase match (close variant)',
  NEAR_EXACT: 'Exact match (close variant)',
  AI_MAX: 'AI Max',
  PERFORMANCE_MAX: 'Performance Max'
};

/** segments.search_term_match_source values that come from AI Max search term matching. */
var FEED_AI_MAX_SOURCES = ['AI_MAX_KEYWORDLESS', 'AI_MAX_BROAD_MATCH'];

/** search_term_view.status (SearchTermTargetingStatus). */
var FEED_ADS_STATUS_LABELS = { ADDED: 'Added', EXCLUDED: 'Excluded', ADDED_EXCLUDED: 'Added/Excluded', NONE: 'None' };

/** campaign.bidding_strategy_type, spelled as the Google Ads UI campaign report spells it. */
var FEED_BID_LABELS = {
  MAXIMIZE_CONVERSIONS: 'Maximise Conversions',
  TARGET_SPEND: 'Maximise clicks',
  TARGET_CPA: 'Target CPA',
  TARGET_IMPRESSION_SHARE: 'Target Impression Share',
  TARGET_ROAS: 'Target ROAS',
  MAXIMIZE_CONVERSION_VALUE: 'Maximise conversion value',
  MANUAL_CPC: 'Manual CPC',
  ENHANCED_CPC: 'Enhanced CPC',
  MANUAL_CPM: 'Manual CPM',
  MANUAL_CPV: 'Manual CPV',
  TARGET_CPM: 'Target CPM',
  TARGET_CPC: 'Target CPC'
};

/** The change-history CSV writes 'Maximise conversions' (lower-case c) in bid strategy change items. */
var FEED_BID_CHANGE_LABELS = { MAXIMIZE_CONVERSIONS: 'Maximise conversions' };

/** Campaign bidding-strategy union members (Campaign.campaign_bidding_strategy) -> BiddingStrategyType. */
var FEED_BID_MEMBERS = {
  manual_cpc: 'MANUAL_CPC', manual_cpm: 'MANUAL_CPM', manual_cpv: 'MANUAL_CPV', manual_cpa: 'MANUAL_CPA',
  maximize_conversions: 'MAXIMIZE_CONVERSIONS', maximize_conversion_value: 'MAXIMIZE_CONVERSION_VALUE',
  target_cpa: 'TARGET_CPA', target_roas: 'TARGET_ROAS', target_spend: 'TARGET_SPEND',
  target_impression_share: 'TARGET_IMPRESSION_SHARE', target_cpm: 'TARGET_CPM', percent_cpc: 'PERCENT_CPC',
  commission: 'COMMISSION', fixed_cpm: 'FIXED_CPM', target_cpv: 'TARGET_CPV', target_cpc: 'TARGET_CPC'
};

/** campaign.status in change-history wording: kind 'campaign paused', item 'Status changed from active to paused'. */
var FEED_CAMPAIGN_STATUS_WORDS = { ENABLED: 'active', PAUSED: 'paused', REMOVED: 'removed' };

var FEED_CAMPAIGN_STATUS_LABELS = { ENABLED: 'Enabled', PAUSED: 'Paused', REMOVED: 'Removed' };

/** campaign.primary_status, as the campaign report's Status column shows it. */
var FEED_CAMPAIGN_PRIMARY_LABELS = {
  ELIGIBLE: 'Eligible', LIMITED: 'Eligible (Limited)', LEARNING: 'Eligible (Learning)',
  MISCONFIGURED: 'Misconfigured', NOT_ELIGIBLE: 'Not eligible', PAUSED: 'Paused', PENDING: 'Pending',
  REMOVED: 'Removed', ENDED: 'Ended'
};

/**
 * campaign.primary_status_reasons -> readable words (unknown values fall back to lower-case words). Reasons are written
 * in this key order (the export lists 'limited by budget' first), unknown ones after, so the text never depends on the
 * order the API returns them in.
 */
var FEED_CAMPAIGN_REASON_LABELS = {
  BUDGET_CONSTRAINED: 'limited by budget',
  BIDDING_STRATEGY_LIMITED: 'bidding strategy limited',
  BIDDING_STRATEGY_LEARNING: 'bidding strategy learning',
  BIDDING_STRATEGY_CONSTRAINED: 'bidding strategy constrained',
  BIDDING_STRATEGY_MISCONFIGURED: 'bidding strategy misconfigured',
  BUDGET_MISCONFIGURED: 'budget misconfigured',
  SEARCH_VOLUME_LIMITED: 'Missing enough relevant keywords',
  HAS_ADS_DISAPPROVED: 'some ads disapproved',
  HAS_ADS_LIMITED_BY_POLICY: 'some ads limited by policy',
  MOST_ADS_UNDER_REVIEW: 'most ads under review',
  CAMPAIGN_PAUSED: 'campaign paused',
  CAMPAIGN_REMOVED: 'campaign removed',
  CAMPAIGN_ENDED: 'campaign ended',
  CAMPAIGN_PENDING: 'campaign pending',
  AD_GROUPS_PAUSED: 'all ad groups paused',
  AD_GROUP_ADS_PAUSED: 'all ads paused',
  KEYWORDS_PAUSED: 'all keywords paused',
  NO_AD_GROUPS: 'no ad groups',
  NO_AD_GROUP_ADS: 'no ads',
  NO_KEYWORDS: 'no keywords',
  MISSING_LOCATION_TARGETING: 'missing location targeting'
};

/** ad_group_criterion.primary_status_reasons -> words, in the order the keyword report lists them. */
var FEED_KEYWORD_REASONS = [
  ['AD_GROUP_CRITERION_PAUSED', 'paused'],
  ['AD_GROUP_CRITERION_PAUSED_DUE_TO_LOW_ACTIVITY', 'paused due to low activity'],
  ['AD_GROUP_PAUSED', 'ad group paused'],
  ['CAMPAIGN_PAUSED', 'campaign paused'],
  ['CAMPAIGN_PENDING', 'campaign pending'],
  ['CAMPAIGN_ENDED', 'campaign ended'],
  ['AD_GROUP_CRITERION_REMOVED', 'removed'],
  ['AD_GROUP_REMOVED', 'ad group removed'],
  ['CAMPAIGN_REMOVED', 'campaign removed'],
  ['AD_GROUP_CRITERION_DISAPPROVED', 'disapproved'],
  ['AD_GROUP_CRITERION_RESTRICTED', 'restricted'],
  ['AD_GROUP_CRITERION_PENDING_REVIEW', 'pending review'],
  ['AD_GROUP_CRITERION_UNDER_REVIEW', 'under review'],
  ['AD_GROUP_CRITERION_NEGATIVE', 'negative'],
  ['CAMPAIGN_CRITERION_NEGATIVE', 'blocked by a campaign negative'],
  ['AD_GROUP_CRITERION_RARELY_SERVED', 'rarely served'],
  ['AD_GROUP_CRITERION_LOW_QUALITY', 'low quality'],
  ['AD_GROUP_CRITERION_BELOW_FIRST_PAGE_BID', 'below first page bid']
];

/** Reasons the API documents as contributing to a LIMITED keyword (the enum itself has no LIMITED value). */
var FEED_KEYWORD_LIMITED_REASONS = ['AD_GROUP_CRITERION_LOW_QUALITY', 'AD_GROUP_CRITERION_BELOW_FIRST_PAGE_BID'];

var FEED_QUALITY_LABELS = { ABOVE_AVERAGE: 'Above average', AVERAGE: 'Average', BELOW_AVERAGE: 'Below average' };

/** change_event.change_resource_type -> words for the change-history 'kind' ('<words> changed'). */
var FEED_RESOURCE_WORDS = { CAMPAIGN_BUDGET: 'Budget', AD_GROUP_AD: 'Ad', AD: 'Ad' };

/** Cell text safety (CONTRACT section 3); same rules as apps-script/30_Store.js safeCell_. */
var FEED_CELL_MAX = 50000;
var FEED_CELL_LEAD_RE = /^[=+\-@'#]/;
var FEED_CELL_MONTH_RE = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b\.?/gi;
var FEED_CELL_WEEKDAY_RE = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?\b\.?/gi;
var FEED_CELL_NUMERIC_RE = /^[\s\d.,:\/\-+%()$₹€£¥]*$/;

/* =====================================================================================================================
 * 2. Pure functions
 * ===================================================================================================================*/

/* ---------- numbers ---------- */

/** Round half up (away from zero) to nd decimals; null for non-numbers. */
function feedRound_(x, nd) {
  var n = Number(x);
  if (x === null || x === undefined || x === '' || !isFinite(n)) return null;
  var d = nd === undefined ? 0 : nd;
  var a = Math.abs(n);
  // Shifting through the decimal string keeps 1.005 -> 1.01 (a plain a * 100 would give 100.49999...).
  var r = /e/i.test(String(a)) ? Math.round(a * Math.pow(10, d)) / Math.pow(10, d)
    : Number(Math.round(Number(a + 'e' + d)) + 'e-' + d);
  return n < 0 && r !== 0 ? -r : r;
}

/** A finite number from a number or numeric string (AdsApp.search may return int64 as strings); 0 otherwise. */
function feedNum_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

/** Like feedNum_ but null when absent. */
function feedNumOrNull_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

/** Micros -> currency units, 2 decimals. Absent -> null. */
function feedMicros_(v) {
  var n = feedNumOrNull_(v);
  return n === null ? null : feedRound_(n / 1e6, 2);
}

/**
 * Impression-share fraction -> percentage (x100, 2 decimals). Google reports '< 10%' as 0.0999 and '> 90%' as
 * 0.9001: both become null (CONTRACT: null when Google hides the value). Absent -> null.
 */
function feedSharePct_(v) {
  var n = feedNumOrNull_(v);
  if (n === null) return null;
  if (Math.abs(n - 0.0999) < 1e-9 || Math.abs(n - 0.9001) < 1e-9) return null;
  return feedRound_(n * 100, 2);
}

/** '₹1,50,000.00' style: Indian digit grouping (last three digits, then pairs), 2 decimals. No Intl. */
function feedInr_(x) {
  var n = feedNumOrNull_(x);
  if (n === null) return '';
  var s = feedRound_(Math.abs(n), 2).toFixed(2);
  var parts = s.split('.');
  var whole = parts[0];
  var last3 = whole.slice(-3);
  var rest = whole.slice(0, -3);
  if (rest) rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',';
  return (n < 0 && Number(s) !== 0 ? '-' : '') + '₹' + rest + last3 + '.' + parts[1];
}

/* ---------- dates ---------- */

/** 'YYYY-MM-DD' plus n days (calendar arithmetic in UTC, so no time-zone drift). */
function feedAddDays_(ymd, n) {
  var p = String(ymd).split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  var mm = d.getUTCMonth() + 1, dd = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
}

/** Positive whole number of days, clamped to [1, max]. */
function feedDays_(v, dflt, max) {
  var n = Math.floor(Number(v));
  if (!isFinite(n) || n < 1) n = dflt;
  return max && n > max ? max : n;
}

/**
 * Date windows for one run. `today` is 'YYYY-MM-DD' in the account time zone. Metrics windows end yesterday (today
 * is still filling up); the change window runs to now.
 */
function feedPlan_(config, today) {
  var c = config || {};
  var stDays = c.BACKFILL ? FEED_BACKFILL_SEARCH_DAYS : feedDays_(c.SEARCH_TERM_DAYS, 7, 90);
  var chDays = c.BACKFILL ? FEED_CHANGE_MAX_DAYS : feedDays_(c.CHANGE_DAYS, 14, FEED_CHANGE_MAX_DAYS);
  var cdDays = feedDays_(c.CAMPAIGN_DAYS, 30, 365);
  var kwDays = feedDays_(c.KEYWORD_DAYS, 30, 365);
  var yesterday = feedAddDays_(today, -1);
  return {
    today: today,
    search_terms: { from: feedAddDays_(today, -stDays), to: yesterday, days: stDays },
    changes: { from: feedAddDays_(today, -chDays), to: today, until: feedAddDays_(today, 1), days: chDays },
    campaign_days: { from: feedAddDays_(today, -cdDays), to: yesterday, days: cdDays },
    keywords: { from: feedAddDays_(today, -kwDays), to: yesterday, days: kwDays }
  };
}

/**
 * change_event.change_date_time -> {ts: 'YYYY-MM-DDTHH:MM:SS', day: 'YYYY-MM-DD'}. The docs do not state the text
 * format; the API returns it in the account time zone, typically 'YYYY-MM-DD HH:MM:SS[.ffffff]'. Accepts a space or
 * 'T' separator and drops fractions and any offset.
 */
function feedTs_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  var m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(:\d{2})?)?/.exec(s);
  if (!m) return { ts: s, day: s.slice(0, 10) };
  var time = m[2] ? m[2] + (m[3] || ':00') : '00:00:00';
  return { ts: m[1] + 'T' + time, day: m[1] };
}

/* ---------- generic object helpers ---------- */

function feedCamel_(s) {
  return String(s).replace(/_([a-z0-9])/g, function (_, c) { return c.toUpperCase(); });
}

function feedSnake_(s) {
  return String(s).replace(/[A-Z]/g, function (c) { return '_' + c.toLowerCase(); });
}

/** Value at a snake_case dotted path in a lowerCamelCase object (also accepts snake_case keys). */
function feedGet_(obj, path) {
  var cur = obj;
  var parts = String(path).split('.');
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    var k = parts[i];
    var ck = feedCamel_(k);
    cur = Object.prototype.hasOwnProperty.call(cur, ck) ? cur[ck] : cur[k];
  }
  return cur;
}

/**
 * change_event.changed_fields -> snake_case paths. The API type is a FieldMask; its JSON form is one
 * comma-separated string of lowerCamelCase paths, but a list or {paths: [...]} is accepted too.
 */
function feedPaths_(v) {
  var list;
  if (v === null || v === undefined || v === '') list = [];
  else if (typeof v === 'string') list = v.split(',');
  else if (Array.isArray(v)) list = v;
  else if (typeof v === 'object' && Array.isArray(v.paths)) list = v.paths;
  else list = String(v).split(',');
  var out = [];
  list.forEach(function (p) {
    var s = feedSnake_(String(p).trim());
    if (s && out.indexOf(s) < 0) out.push(s);
  });
  return out;
}

/** 'AD_GROUP_CRITERION' -> 'Ad group criterion'. */
function feedWords_(enumName) {
  var s = String(enumName || '').toLowerCase().replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/* ---------- labels ---------- */

/** Search-term match type label; AI Max matches (by match type or by match source) are 'AI Max'. */
function feedSearchTermMatch_(matchType, matchSource) {
  if (matchType === 'AI_MAX' || FEED_AI_MAX_SOURCES.indexOf(String(matchSource || '')) >= 0) return 'AI Max';
  var t = String(matchType || '');
  if (Object.prototype.hasOwnProperty.call(FEED_ST_MATCH_LABELS, t)) return FEED_ST_MATCH_LABELS[t];
  return t && t !== 'UNKNOWN' && t !== 'UNSPECIFIED' ? feedWords_(t) : '';
}

/** search_term_view.status label; NONE, UNKNOWN, UNSPECIFIED and absent are 'None'. */
function feedAdsStatus_(status) {
  var s = String(status || '');
  return Object.prototype.hasOwnProperty.call(FEED_ADS_STATUS_LABELS, s) ? FEED_ADS_STATUS_LABELS[s] : 'None';
}

/** Keyword text shown the search-term way: exact '[text]', phrase and broad 'text', none '-'. */
function feedMatchedKeyword_(text, matchType) {
  var t = String(text === null || text === undefined ? '' : text).trim();
  if (!t) return '-';
  return matchType === 'EXACT' ? '[' + t + ']' : t;
}

/** Keyword written the change-history way: exact '[t]', phrase '"t"', broad 't'; negatives prefixed '-'. */
function feedKeywordItem_(text, matchType, negative) {
  var t = String(text === null || text === undefined ? '' : text).trim();
  var body = matchType === 'EXACT' ? '[' + t + ']' : matchType === 'PHRASE' ? '"' + t + '"' : t;
  return (negative ? '-' : '') + body;
}

/** 'EXACT' -> 'exact' (change-history kind word). */
function feedMatchWord_(matchType) {
  var m = String(matchType || '').toLowerCase();
  return m === 'exact' || m === 'phrase' || m === 'broad' ? m : (m || 'broad');
}

function feedBidLabel_(type) {
  var t = String(type || '');
  if (!t || t === 'UNKNOWN' || t === 'UNSPECIFIED') return '';
  return Object.prototype.hasOwnProperty.call(FEED_BID_LABELS, t) ? FEED_BID_LABELS[t] : feedWords_(t);
}

function feedBidChangeLabel_(type) {
  var t = String(type || '');
  return Object.prototype.hasOwnProperty.call(FEED_BID_CHANGE_LABELS, t) ? FEED_BID_CHANGE_LABELS[t] : feedBidLabel_(t);
}

function feedCampaignStatus_(status) {
  var s = String(status || '');
  return Object.prototype.hasOwnProperty.call(FEED_CAMPAIGN_STATUS_LABELS, s) ? FEED_CAMPAIGN_STATUS_LABELS[s] : feedWords_(s);
}

function feedCampaignPrimary_(status) {
  var s = String(status || '');
  if (!s || s === 'UNKNOWN' || s === 'UNSPECIFIED') return '';
  return Object.prototype.hasOwnProperty.call(FEED_CAMPAIGN_PRIMARY_LABELS, s) ? FEED_CAMPAIGN_PRIMARY_LABELS[s] : feedWords_(s);
}

function feedCampaignReasons_(reasons) {
  var have = (Array.isArray(reasons) ? reasons : reasons ? [reasons] : []).map(String);
  var out = [];
  Object.keys(FEED_CAMPAIGN_REASON_LABELS).forEach(function (k) {
    var w = FEED_CAMPAIGN_REASON_LABELS[k];
    if (have.indexOf(k) >= 0 && out.indexOf(w) < 0) out.push(w);
  });
  have.forEach(function (k) {
    if (!k || k === 'UNKNOWN' || k === 'UNSPECIFIED') return;
    if (Object.prototype.hasOwnProperty.call(FEED_CAMPAIGN_REASON_LABELS, k)) return;
    var w = k.toLowerCase().replace(/_/g, ' ');
    if (out.indexOf(w) < 0) out.push(w);
  });
  return out.join('; ');
}

function feedKeywordReasons_(reasons) {
  var have = Array.isArray(reasons) ? reasons.map(String) : reasons ? [String(reasons)] : [];
  var out = [];
  FEED_KEYWORD_REASONS.forEach(function (p) { if (have.indexOf(p[0]) >= 0 && out.indexOf(p[1]) < 0) out.push(p[1]); });
  have.forEach(function (k) {
    if (!k || k === 'UNKNOWN' || k === 'UNSPECIFIED') return;
    var known = FEED_KEYWORD_REASONS.some(function (p) { return p[0] === k; });
    if (known) return;
    var w = k.replace(/^AD_GROUP_CRITERION_/, '').toLowerCase().replace(/_/g, ' ');
    if (out.indexOf(w) < 0) out.push(w);
  });
  return out.join('; ');
}

/**
 * Keyword status column: 'Paused' / 'Not eligible' / 'Limited' / 'Eligible'. The API's ad-group-criterion primary
 * status has no LIMITED value; its reason enum says low quality and below-first-page-bid contribute to LIMITED, so an
 * ELIGIBLE keyword with one of those reasons is 'Limited'.
 */
function feedKeywordStatus_(primaryStatus, reasons) {
  var s = String(primaryStatus || '');
  var have = Array.isArray(reasons) ? reasons.map(String) : [];
  if (s === 'PAUSED') return 'Paused';
  if (s === 'NOT_ELIGIBLE') return 'Not eligible';
  if (s === 'ELIGIBLE') {
    return FEED_KEYWORD_LIMITED_REASONS.some(function (r) { return have.indexOf(r) >= 0; }) ? 'Limited' : 'Eligible';
  }
  if (s === 'PENDING') return 'Pending';
  if (s === 'REMOVED') return 'Removed';
  return '';
}

function feedKeywordMatch_(matchType) {
  var m = String(matchType || '');
  return m === 'EXACT' ? 'Exact' : m === 'PHRASE' ? 'Phrase' : m === 'BROAD' ? 'Broad' : feedWords_(m);
}

function feedQuality_(bucket) {
  var b = String(bucket || '');
  return Object.prototype.hasOwnProperty.call(FEED_QUALITY_LABELS, b) ? FEED_QUALITY_LABELS[b] : '';
}

/* ---------- row builders (one AdsApp.search row in, plain values out) ---------- */

/** search_term_view row -> one search_terms row (cost kept in micros until aggregation). */
function feedSearchTermRow_(r) {
  var seg = r.segments || {};
  var kw = (seg.keyword && seg.keyword.info) || {};
  var m = r.metrics || {};
  return {
    day: String(seg.date || ''),
    term: String((r.searchTermView && r.searchTermView.searchTerm) || '').trim().toLowerCase(),
    match_type: feedSearchTermMatch_(seg.searchTermMatchType, seg.searchTermMatchSource),
    ads_status: feedAdsStatus_(r.searchTermView && r.searchTermView.status),
    campaign: String((r.campaign && r.campaign.name) || ''),
    ad_group: String((r.adGroup && r.adGroup.name) || ''),
    keyword: feedMatchedKeyword_(kw.text, kw.matchType),
    clicks: feedNum_(m.clicks),
    impr: feedNum_(m.impressions),
    cost_micros: feedNum_(m.costMicros),
    conv: feedNum_(m.conversions)
  };
}

/** Sum rows with the same CONTRACT key (lower-casing and the match-source segment can split one row in two). */
function feedAggregateSearchTerms_(rows) {
  var by = {};
  var order = [];
  rows.forEach(function (x) {
    var k = [x.day, x.term, x.match_type, x.ads_status, x.campaign, x.ad_group, x.keyword].join('\u0001');
    if (!by[k]) {
      by[k] = { day: x.day, term: x.term, match_type: x.match_type, ads_status: x.ads_status, campaign: x.campaign,
        ad_group: x.ad_group, keyword: x.keyword, clicks: 0, impr: 0, cost_micros: 0, conv: 0 };
      order.push(k);
    }
    var a = by[k];
    a.clicks += x.clicks; a.impr += x.impr; a.cost_micros += x.cost_micros; a.conv += x.conv;
  });
  var out = order.map(function (k) {
    var a = by[k];
    return { day: a.day, term: a.term, match_type: a.match_type, ads_status: a.ads_status, campaign: a.campaign,
      ad_group: a.ad_group, keyword: a.keyword, clicks: a.clicks, impr: a.impr,
      cost: feedRound_(a.cost_micros / 1e6, 2), conv: feedRound_(a.conv, 2) };
  });
  out.sort(function (p, q) {
    var ka = [p.day, p.campaign, p.ad_group, p.term, p.match_type], kb = [q.day, q.campaign, q.ad_group, q.term, q.match_type];
    for (var i = 0; i < ka.length; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; }
    return 0;
  });
  return out;
}

/** campaign row (segmented by date) -> one campaign_days row. */
function feedCampaignDayRow_(r) {
  var c = r.campaign || {};
  var m = r.metrics || {};
  var tcpa = feedNumOrNull_(feedGet_(c, 'maximize_conversions.target_cpa_micros'));
  if (!tcpa) tcpa = feedNumOrNull_(feedGet_(c, 'target_cpa.target_cpa_micros'));
  return {
    day: String((r.segments && r.segments.date) || ''),
    campaign: String(c.name || ''),
    campaign_id: String(c.id === undefined || c.id === null ? '' : c.id),
    campaign_status: feedCampaignStatus_(c.status),
    status: feedCampaignPrimary_(c.primaryStatus),
    status_reasons: feedCampaignReasons_(c.primaryStatusReasons),
    bid_strategy: feedBidLabel_(c.biddingStrategyType),
    budget_now: feedMicros_(r.campaignBudget && r.campaignBudget.amountMicros),
    target_cpa_now: tcpa ? feedRound_(tcpa / 1e6, 2) : null,
    impr: feedNum_(m.impressions),
    clicks: feedNum_(m.clicks),
    cost: feedMicros_(m.costMicros) || 0,
    conv: feedRound_(feedNum_(m.conversions), 2),
    all_conv: feedRound_(feedNum_(m.allConversions), 2),
    is_pct: feedSharePct_(m.searchImpressionShare),
    lost_budget_pct: feedSharePct_(m.searchBudgetLostImpressionShare),
    lost_rank_pct: feedSharePct_(m.searchRankLostImpressionShare),
    top_is_pct: feedSharePct_(m.searchTopImpressionShare),
    abs_top_is_pct: feedSharePct_(m.searchAbsoluteTopImpressionShare)
  };
}

/**
 * Keyword snapshot: `criteria` are ad_group_criterion rows (attributes, every enabled/paused positive keyword),
 * `metricRows` are keyword_view rows for the period (no date segment). Keywords without metrics still appear.
 * `keyword` is spelled the way the Google Ads search keyword report (and so raw_keywords) spells it: phrase '"text"',
 * exact '[text]', broad 'text'.
 */
function feedKeywordRows_(criteria, metricRows, periodStart, periodEnd) {
  var met = {};
  (metricRows || []).forEach(function (r) {
    var rn = String((r.adGroupCriterion && r.adGroupCriterion.resourceName) || '');
    if (!rn) return;
    var m = r.metrics || {};
    var a = met[rn] || (met[rn] = { cost_micros: 0, clicks: 0, impr: 0, conv: 0, is: undefined, lost: undefined });
    a.cost_micros += feedNum_(m.costMicros);
    a.clicks += feedNum_(m.clicks);
    a.impr += feedNum_(m.impressions);
    a.conv += feedNum_(m.conversions);
    if (a.is === undefined && m.searchImpressionShare !== undefined) a.is = m.searchImpressionShare;
    if (a.lost === undefined && m.searchRankLostImpressionShare !== undefined) a.lost = m.searchRankLostImpressionShare;
  });
  var out = [];
  (criteria || []).forEach(function (r) {
    var k = r.adGroupCriterion || {};
    var kw = k.keyword || {};
    var qi = k.qualityInfo || {};
    var a = met[String(k.resourceName || '')] || { cost_micros: 0, clicks: 0, impr: 0, conv: 0 };
    var qs = feedNumOrNull_(qi.qualityScore);
    var reasons = Array.isArray(k.primaryStatusReasons) ? k.primaryStatusReasons : [];
    out.push({
      period_start: periodStart,
      day: periodEnd,
      keyword_status: feedCampaignStatus_(k.status),
      keyword: String(kw.text || '').trim() ? feedKeywordItem_(kw.text, String(kw.matchType || ''), false) : '',
      match_type: feedKeywordMatch_(kw.matchType),
      campaign: String((r.campaign && r.campaign.name) || ''),
      ad_group: String((r.adGroup && r.adGroup.name) || ''),
      status: feedKeywordStatus_(k.primaryStatus, reasons),
      status_reasons: feedKeywordReasons_(reasons),
      cost: feedRound_(a.cost_micros / 1e6, 2),
      clicks: a.clicks,
      impr: a.impr,
      conv: feedRound_(a.conv, 2),
      quality_score: qs ? qs : null,
      ad_relevance: feedQuality_(qi.creativeQualityScore),
      landing_page: feedQuality_(qi.postClickQualityScore),
      is_pct: feedSharePct_(a.is),
      lost_rank_pct: feedSharePct_(a.lost)
    });
  });
  out.sort(function (p, q) {
    var ka = [p.campaign, p.ad_group, p.keyword, p.match_type], kb = [q.campaign, q.ad_group, q.keyword, q.match_type];
    for (var i = 0; i < ka.length; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; }
    return 0;
  });
  return out;
}

/* ---------- change events ---------- */

/** The entity inside a ChangedResource that matches change_resource_type (AD_GROUP_CRITERION -> adGroupCriterion). */
function feedChangedEntity_(changed, resourceType) {
  if (!changed || typeof changed !== 'object') return null;
  var key = feedCamel_(String(resourceType || '').toLowerCase());
  var e = changed[key];
  if (e === undefined) e = changed[String(resourceType || '').toLowerCase()];
  return e && typeof e === 'object' ? e : null;
}

/** {text, matchType, negative} from a criterion entity, or null when it carries no keyword. */
function feedCriterionKeyword_(entity, resourceType) {
  if (!entity || !entity.keyword || !entity.keyword.text) return null;
  var neg = entity.negative === true || entity.negative === 'true';
  if (resourceType === 'CAMPAIGN_CRITERION' && entity.negative !== false && entity.negative !== 'false') neg = true;
  return { text: String(entity.keyword.text), matchType: String(entity.keyword.matchType || ''), negative: neg };
}

/** Bidding strategy type of a Campaign entity: from bidding_strategy_type, else from the union member present. */
function feedBidTypeOf_(campaign) {
  if (!campaign) return '';
  if (campaign.biddingStrategyType) return String(campaign.biddingStrategyType);
  var found = '';
  Object.keys(FEED_BID_MEMBERS).forEach(function (m) {
    if (!found && feedGet_(campaign, m) !== undefined) found = FEED_BID_MEMBERS[m];
  });
  return found;
}

function feedBool_(v) {
  return v === true || v === 'true';
}

/** 'Target CPA increased from ₹511.80 to ₹800.00' and friends; '' when nothing readable changed. */
function feedTargetCpaText_(oldMicros, newMicros) {
  var o = feedNumOrNull_(oldMicros), n = feedNumOrNull_(newMicros);
  if (o && n) {
    if (o === n) return '';
    return 'Target CPA ' + (n > o ? 'increased' : 'decreased') + ' from ' + feedInr_(o / 1e6) + ' to ' + feedInr_(n / 1e6);
  }
  if (n) return 'Target CPA is ' + feedInr_(n / 1e6);
  if (o) return 'Target CPA removed (was ' + feedInr_(o / 1e6) + ')';
  return '';
}

/**
 * One change_event row (lowerCamelCase, as AdsApp.search returns it) -> zero or more `changes` rows.
 * ctx: {campaigns: {resourceName: {name, budget}}, adGroups: {resourceName: {name, campaign}},
 *       budgetCampaigns: {budgetResourceName: [campaign names]}, criteria: {resourceName: {text, matchType, negative}}}
 */
function feedMapChange_(row, ctx) {
  var ce = (row && row.changeEvent) || row || {};
  var c = ctx || {};
  var campaigns = c.campaigns || {}, adGroups = c.adGroups || {}, budgetCampaigns = c.budgetCampaigns || {};
  var criteria = c.criteria || {};
  var type = String(ce.changeResourceType || '');
  var op = String(ce.resourceChangeOperation || '');
  var verb = op === 'CREATE' ? 'added' : op === 'REMOVE' ? 'removed' : 'changed';
  var t = feedTs_(ce.changeDateTime);
  var agRn = String(ce.adGroup || '');
  var ag = adGroups[agRn];
  var campRn = String(ce.campaign || '') || (ag && ag.campaign) || '';
  var campName = campaigns[campRn] ? campaigns[campRn].name : '';
  var base = { ts: t.ts, day: t.day, user: String(ce.userEmail || ''), campaign: campName, ad_group: ag ? ag.name : '' };
  var oldE = feedChangedEntity_(ce.oldResource, type);
  var newE = feedChangedEntity_(ce.newResource, type);
  var paths = feedPaths_(ce.changedFields);
  var make = function (kind, item, campaign) {
    return { ts: base.ts, day: base.day, user: base.user, campaign: campaign === undefined ? base.campaign : campaign,
      ad_group: base.ad_group, kind: kind, item: item };
  };
  var words = Object.prototype.hasOwnProperty.call(FEED_RESOURCE_WORDS, type) ? FEED_RESOURCE_WORDS[type] : feedWords_(type);
  var genericVerb = op === 'CREATE' ? 'created' : op === 'REMOVE' ? 'removed' : 'changed';
  var generic = function () {
    var item = paths.join(', ');
    if (!item && op !== 'UPDATE') {
      var nm = (newE && newE.name) || (oldE && oldE.name) || '';
      item = nm ? String(nm) : String(ce.changeResourceName || '');
    }
    return [make((words || 'Resource') + ' ' + genericVerb, item)];
  };

  // keywords (positive and negative), ad group or campaign level
  if (type === 'AD_GROUP_CRITERION' || type === 'CAMPAIGN_CRITERION') {
    var kw = feedCriterionKeyword_(newE, type) || feedCriterionKeyword_(oldE, type) ||
      criteria[String(ce.changeResourceName || '')] || null;
    if (!kw) return generic();
    var prefix = (kw.negative ? 'negative ' : '') + feedMatchWord_(kw.matchType) + ' match keyword ';
    var kwCampaign = type === 'CAMPAIGN_CRITERION' ? base.campaign : undefined;
    if (op === 'CREATE' || op === 'REMOVE') {
      var r = make(prefix + verb, feedKeywordItem_(kw.text, kw.matchType, kw.negative), kwCampaign);
      if (type === 'CAMPAIGN_CRITERION') r.ad_group = '';
      return [r];
    }
    if (paths.indexOf('status') >= 0) {
      var ns = String((newE && newE.status) || '').toLowerCase();
      var os = String((oldE && oldE.status) || '').toLowerCase();
      var sv = ns === 'paused' ? 'paused' : ns === 'enabled' ? 'enabled' : ns === 'removed' ? 'removed' : 'changed';
      return [make(prefix + sv, kw.text + ': Status changed from ' + (os || '?') + ' to ' + (ns || '?'), kwCampaign)];
    }
    return [make(prefix + 'changed', kw.text + ': ' + paths.join(', '), kwCampaign)];
  }

  // budget amount
  if (type === 'CAMPAIGN_BUDGET' && op === 'UPDATE' && paths.indexOf('amount_micros') >= 0) {
    var ob = feedNumOrNull_(oldE && oldE.amountMicros), nb = feedNumOrNull_(newE && newE.amountMicros);
    if (ob !== null && nb !== null && ob !== nb) {
      var others = paths.filter(function (p) { return p !== 'amount_micros'; });
      var names = campName ? [campName] : (budgetCampaigns[String(ce.changeResourceName || '')] || ['']);
      return names.map(function (nm) {
        var item = (nm ? nm + ': ' : '') + 'Budget amount changed from ' + feedInr_(ob / 1e6) + ' to ' + feedInr_(nb / 1e6);
        if (others.length) item += ' | ' + others.join(', ');
        return make('budget amount ' + (nb > ob ? 'increased' : 'decreased'), item, nm);
      });
    }
    return generic();
  }

  // campaign settings: status ('campaign paused' / 'campaign active' as in the export), target CPA, bid strategy type
  if (type === 'CAMPAIGN' && op === 'UPDATE') {
    var parts = [];
    var used = [];
    var statusRows = [];
    var newSt = String((newE && newE.status) || ''), oldSt = String((oldE && oldE.status) || '');
    if (paths.indexOf('status') >= 0 && newSt !== oldSt &&
      Object.prototype.hasOwnProperty.call(FEED_CAMPAIGN_STATUS_WORDS, newSt)) {
      var ow = Object.prototype.hasOwnProperty.call(FEED_CAMPAIGN_STATUS_WORDS, oldSt) ? FEED_CAMPAIGN_STATUS_WORDS[oldSt] : '?';
      statusRows.push(make('campaign ' + FEED_CAMPAIGN_STATUS_WORDS[newSt],
        'Status changed from ' + ow + ' to ' + FEED_CAMPAIGN_STATUS_WORDS[newSt]));
      used.push('status');
    }
    ['maximize_conversions.target_cpa_micros', 'target_cpa.target_cpa_micros'].forEach(function (p) {
      if (paths.indexOf(p) < 0) return;
      used.push(p);
      var txt = feedTargetCpaText_(feedGet_(oldE, p), feedGet_(newE, p));
      if (txt && parts.indexOf(txt) < 0) parts.push(txt);
    });
    var oldBid = feedBidTypeOf_(oldE), newBid = feedBidTypeOf_(newE);
    if (oldBid && newBid && oldBid !== newBid) {
      parts.unshift('Campaign bid strategy type changed from ‘' + feedBidChangeLabel_(oldBid) + '’ to ‘' + feedBidChangeLabel_(newBid) + '’');
      // The strategy switch explains bidding_strategy_type and the union-member paths (e.g. 'target_spend').
      paths.forEach(function (p) {
        var head = p.split('.')[0];
        if (used.indexOf(p) < 0 && (p === 'bidding_strategy_type' || p === head) &&
          (p === 'bidding_strategy_type' || Object.prototype.hasOwnProperty.call(FEED_BID_MEMBERS, head))) used.push(p);
      });
    }
    var rest = paths.filter(function (p) { return used.indexOf(p) < 0; });
    if (!parts.length) {
      if (!statusRows.length) return generic();
      if (rest.length) statusRows.push(make('Campaign changed', rest.join(', ')));
      return statusRows;
    }
    if (rest.length) parts.push(rest.join(', '));
    return statusRows.concat([make('Campaign changed', parts.join(' | '))]);
  }

  // ad group: AI Max 'disable search term matching'
  var dstm = 'ai_max_ad_group_setting.disable_search_term_matching';
  if (type === 'AD_GROUP' && (op === 'UPDATE' || op === 'CREATE') && paths.indexOf(dstm) >= 0) {
    var nv = feedBool_(feedGet_(newE, dstm));
    var ov = feedBool_(feedGet_(oldE, dstm));
    var cap = function (b) { return b ? 'True' : 'False'; };
    if (op === 'CREATE') {
      if (!nv) return generic();
      var nm = newE && newE.name ? String(newE.name) + ' | ' : '';
      return [make('Ad group created', nm + 'Disable search term matching is True')];
    }
    if (nv === ov) return generic();
    var restAg = paths.filter(function (p) { return p !== dstm; });
    var itemAg = 'Disable search term matching changed from ' + cap(ov) + ' to ' + cap(nv);
    if (restAg.length) itemAg += ' | ' + restAg.join(', ');
    return [make('Ad group changed', itemAg)];
  }

  return generic();
}

/* ---------- cell text safety (CONTRACT section 3) ---------- */

/** Would Google Sheets turn this text into a number, date, time, percentage, currency or boolean? */
function feedLooksParsed_(s) {
  var t = String(s).trim();
  if (!t) return false;
  if (/^(true|false)$/i.test(t)) return true;
  t = t.replace(FEED_CELL_MONTH_RE, '1').replace(FEED_CELL_WEEKDAY_RE, ' ')
    .replace(/\b(a\.?m\.?|p\.?m\.?)(?=\s|$)/gi, ' ')
    .replace(/(\d)[eE]([-+]?\d)/g, '$1$2')
    .replace(/(\d)[tT](\d)/g, '$1 $2')
    .replace(/(\d)\s*[zZ]$/, '$1');
  return /\d/.test(t) && FEED_CELL_NUMERIC_RE.test(t);
}

/**
 * The value to write so the cell holds exactly this: null -> '', finite numbers and booleans unchanged, strings that
 * start with = + - @ ' # or that Sheets would parse get a leading apostrophe (Sheets keeps it out of the value).
 * Same rules as apps-script/30_Store.js safeCell_.
 */
function feedCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v;
  var s = typeof v === 'string' ? v : (typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : String(v));
  if (s === '') return '';
  if (FEED_CELL_LEAD_RE.test(s) || feedLooksParsed_(s)) s = "'" + s;
  return s.length > FEED_CELL_MAX ? s.slice(0, FEED_CELL_MAX) : s;
}

/** [header, ...rows] for one setValues call; every value passed through feedCell_. */
function feedValues_(cols, rows) {
  var out = [cols.map(feedCell_)];
  (rows || []).forEach(function (r) { out.push(cols.map(function (c) { return feedCell_(r[c]); })); });
  return out;
}

/**
 * Keep one section's rows within `max` (FEED_MAX_ROWS) without writing a partial day: search terms and campaign days
 * lose whole oldest days (a partial day would replace a complete day in the history), changes lose their oldest rows
 * (they are merged as a union), and keywords throw (a partial snapshot would replace the complete one).
 * Returns {rows, note}; note is '' when nothing was dropped.
 */
function feedCapRows_(name, rows, max) {
  var list = rows || [];
  if (list.length <= max) return { rows: list, note: '' };
  if (name === 'changes') {
    var kept = list.slice(list.length - max);
    return { rows: kept, note: 'kept the newest ' + max + ' of ' + list.length + ' changes (from ' + kept[0].day + ')' };
  }
  if (name === 'search_terms' || name === 'campaign_days') {
    var perDay = {};
    list.forEach(function (r) { perDay[r.day] = (perDay[r.day] || 0) + 1; });
    var days = Object.keys(perDay).sort().reverse();
    var keep = {};
    var total = 0;
    for (var i = 0; i < days.length; i++) {
      if (total + perDay[days[i]] > max) break;
      keep[days[i]] = true;
      total += perDay[days[i]];
    }
    var out = list.filter(function (r) { return keep[r.day]; });
    var first = out.length ? out[0].day : '';
    return { rows: out, note: 'too many rows (' + list.length + '): kept whole days ' + (first ? 'from ' + first : '(none)') +
      ', ' + out.length + ' rows; lower the number of days in CONFIG' };
  }
  throw new Error(name + ': ' + list.length + ' rows is more than ' + max + '; not written so the snapshot stays complete');
}

/** feed_meta rows: [['key','value'], ...]. */
function feedMetaValues_(pairs) {
  return feedValues_(['key', 'value'], pairs.map(function (p) { return { key: p[0], value: p[1] }; }));
}

/** GAQL string literal (single quotes; resource names and dates never contain one, but be safe). */
function feedQ_(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/* ---------- GAQL (pure strings) ---------- */

function feedSearchTermQuery_(from, to, withSource) {
  return 'SELECT segments.date, search_term_view.search_term, search_term_view.status, ' +
    'segments.search_term_match_type, ' + (withSource ? 'segments.search_term_match_source, ' : '') +
    'campaign.name, ad_group.name, segments.keyword.info.text, segments.keyword.info.match_type, ' +
    'metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions ' +
    'FROM search_term_view ' +
    'WHERE segments.date BETWEEN ' + feedQ_(from) + ' AND ' + feedQ_(to) + ' ' +
    "AND campaign.advertising_channel_type = 'SEARCH' AND metrics.clicks > 0";
}

function feedChangeQuery_(from, until) {
  return 'SELECT change_event.resource_name, change_event.change_date_time, change_event.change_resource_name, ' +
    'change_event.user_email, change_event.client_type, change_event.change_resource_type, ' +
    'change_event.old_resource, change_event.new_resource, change_event.resource_change_operation, ' +
    'change_event.changed_fields, change_event.campaign, change_event.ad_group ' +
    'FROM change_event ' +
    'WHERE change_event.change_date_time >= ' + feedQ_(from) + ' AND change_event.change_date_time <= ' + feedQ_(until) + ' ' +
    'ORDER BY change_event.change_date_time ASC LIMIT ' + FEED_CHANGE_PAGE;
}

function feedCampaignNamesQuery_() {
  return 'SELECT campaign.resource_name, campaign.name, campaign.campaign_budget FROM campaign';
}

function feedAdGroupNamesQuery_() {
  return 'SELECT ad_group.resource_name, ad_group.name, campaign.resource_name FROM ad_group';
}

function feedCriteriaLookupQuery_(resourceType, names) {
  var res = resourceType === 'CAMPAIGN_CRITERION' ? 'campaign_criterion' : 'ad_group_criterion';
  return 'SELECT ' + res + '.resource_name, ' + res + '.keyword.text, ' + res + '.keyword.match_type, ' + res + '.negative ' +
    'FROM ' + res + ' WHERE ' + res + ".type = 'KEYWORD' AND " + res + '.resource_name IN (' + names.map(feedQ_).join(', ') + ')';
}

function feedCampaignDaysQuery_(from, to) {
  return 'SELECT segments.date, campaign.id, campaign.name, campaign.status, campaign.primary_status, ' +
    'campaign.primary_status_reasons, campaign.bidding_strategy_type, campaign_budget.amount_micros, ' +
    'campaign.maximize_conversions.target_cpa_micros, campaign.target_cpa.target_cpa_micros, ' +
    'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.all_conversions, ' +
    'metrics.search_impression_share, metrics.search_budget_lost_impression_share, ' +
    'metrics.search_rank_lost_impression_share, metrics.search_top_impression_share, ' +
    'metrics.search_absolute_top_impression_share ' +
    'FROM campaign ' +
    'WHERE segments.date BETWEEN ' + feedQ_(from) + ' AND ' + feedQ_(to) + ' ' +
    "AND campaign.advertising_channel_type = 'SEARCH'";
}

function feedKeywordCriteriaQuery_() {
  return 'SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ' +
    'ad_group_criterion.status, ad_group_criterion.primary_status, ad_group_criterion.primary_status_reasons, ' +
    'ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ' +
    'ad_group_criterion.quality_info.post_click_quality_score, ad_group.name, campaign.name ' +
    'FROM ad_group_criterion ' +
    "WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE " +
    "AND ad_group_criterion.status IN ('ENABLED', 'PAUSED') " +
    "AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED' " +
    "AND campaign.advertising_channel_type = 'SEARCH'";
}

function feedKeywordMetricsQuery_(from, to) {
  return 'SELECT ad_group_criterion.resource_name, metrics.cost_micros, metrics.clicks, metrics.impressions, ' +
    'metrics.conversions, metrics.search_impression_share, metrics.search_rank_lost_impression_share ' +
    'FROM keyword_view ' +
    'WHERE segments.date BETWEEN ' + feedQ_(from) + ' AND ' + feedQ_(to) + ' ' +
    "AND campaign.advertising_channel_type = 'SEARCH' AND ad_group_criterion.negative = FALSE";
}

/* =====================================================================================================================
 * 3. Service functions (AdsApp, SpreadsheetApp, Utilities, Logger) - called only from main()
 * ===================================================================================================================*/

/** All rows of one GAQL query as an array. */
function feedSearch_(query) {
  var it = AdsApp.search(query);
  var out = [];
  while (it.hasNext()) out.push(it.next());
  return out;
}

function feedFetchSearchTerms_(plan, notes) {
  var rows;
  try {
    rows = feedSearch_(feedSearchTermQuery_(plan.from, plan.to, true));
  } catch (e) {
    // If this account or API version refuses the match-source segment, fall back to match type alone.
    notes.push(['search_terms_note', 'match source segment refused, AI Max taken from match type only: ' + feedErr_(e)]);
    rows = feedSearch_(feedSearchTermQuery_(plan.from, plan.to, false));
  }
  return feedAggregateSearchTerms_(rows.map(feedSearchTermRow_));
}

function feedChangeContext_(events, notes) {
  var ctx = { campaigns: {}, adGroups: {}, budgetCampaigns: {}, criteria: {} };
  feedSearch_(feedCampaignNamesQuery_()).forEach(function (r) {
    var c = r.campaign || {};
    ctx.campaigns[String(c.resourceName)] = { name: String(c.name || ''), budget: String(c.campaignBudget || '') };
    if (c.campaignBudget) {
      var list = ctx.budgetCampaigns[String(c.campaignBudget)] || (ctx.budgetCampaigns[String(c.campaignBudget)] = []);
      list.push(String(c.name || ''));
    }
  });
  feedSearch_(feedAdGroupNamesQuery_()).forEach(function (r) {
    var g = r.adGroup || {};
    ctx.adGroups[String(g.resourceName)] = { name: String(g.name || ''), campaign: String((r.campaign && r.campaign.resourceName) || '') };
  });
  // Keyword criteria whose event does not carry the keyword (status updates, removals without old_resource).
  ['AD_GROUP_CRITERION', 'CAMPAIGN_CRITERION'].forEach(function (type) {
    var need = [];
    events.forEach(function (row) {
      var ce = row.changeEvent || {};
      if (String(ce.changeResourceType) !== type) return;
      if (feedCriterionKeyword_(feedChangedEntity_(ce.newResource, type), type) ||
        feedCriterionKeyword_(feedChangedEntity_(ce.oldResource, type), type)) return;
      var rn = String(ce.changeResourceName || '');
      if (rn && need.indexOf(rn) < 0) need.push(rn);
    });
    for (var i = 0; i < need.length; i += 200) {
      try {
        feedSearch_(feedCriteriaLookupQuery_(type, need.slice(i, i + 200))).forEach(function (r) {
          var e = type === 'CAMPAIGN_CRITERION' ? r.campaignCriterion : r.adGroupCriterion;
          var kw = feedCriterionKeyword_(e, type);
          if (kw) ctx.criteria[String(e.resourceName)] = kw;
        });
      } catch (e) {
        notes.push(['changes_note', 'keyword lookup failed for some ' + type + ' events: ' + feedErr_(e)]);
        break;
      }
    }
  });
  return ctx;
}

function feedFetchChanges_(plan, notes) {
  var events = [];
  var seen = {};
  var from = plan.from;
  for (var page = 0; page < FEED_CHANGE_MAX_PAGES; page++) {
    var rows = null;
    if (page === 0) {
      rows = feedSearch_(feedChangeQuery_(from, plan.until));
    } else {
      // The docs only show date filters; a date-time start is not documented. Try the raw timestamp, then whole
      // seconds; if both are refused, keep what was read so far instead of failing the whole section.
      var lastErr = null;
      [from, feedTs_(from).ts.replace('T', ' ')].forEach(function (start) {
        if (rows) return;
        try { rows = feedSearch_(feedChangeQuery_(start, plan.until)); } catch (e) { lastErr = e; }
      });
      if (!rows) {
        notes.push(['changes_note', 'more than ' + events.length + ' changes and the next page was refused; changes after ' +
          feedTs_(from).ts + ' are missing: ' + feedErr_(lastErr)]);
        break;
      }
    }
    var added = 0;
    rows.forEach(function (r) {
      var rn = String((r.changeEvent && r.changeEvent.resourceName) || '');
      if (rn && seen[rn]) return;
      if (rn) seen[rn] = true;
      events.push(r);
      added++;
    });
    if (rows.length < FEED_CHANGE_PAGE || !added) break;
    // The guide: note the last timestamp and start the next query there (duplicates are dropped above).
    from = String(rows[rows.length - 1].changeEvent.changeDateTime);
    if (page === FEED_CHANGE_MAX_PAGES - 1) notes.push(['changes_note', 'stopped after ' + FEED_CHANGE_MAX_PAGES + ' pages']);
  }
  var ctx = feedChangeContext_(events, notes);
  var out = [];
  events.forEach(function (r) { feedMapChange_(r, ctx).forEach(function (x) { out.push(x); }); });
  out.sort(function (p, q) { return p.ts < q.ts ? -1 : p.ts > q.ts ? 1 : 0; });
  return out;
}

function feedFetchCampaignDays_(plan) {
  var rows = feedSearch_(feedCampaignDaysQuery_(plan.from, plan.to)).map(feedCampaignDayRow_);
  rows.sort(function (p, q) {
    if (p.day !== q.day) return p.day < q.day ? -1 : 1;
    return p.campaign < q.campaign ? -1 : p.campaign > q.campaign ? 1 : 0;
  });
  return rows;
}

function feedFetchKeywords_(plan) {
  var criteria = feedSearch_(feedKeywordCriteriaQuery_());
  var metrics = feedSearch_(feedKeywordMetricsQuery_(plan.from, plan.to));
  return feedKeywordRows_(criteria, metrics, plan.from, plan.to);
}

function feedErr_(e) {
  var s = String((e && e.message) || e);
  return s.length > 400 ? s.slice(0, 400) : s;
}

/**
 * Create the tab if missing, clear it, size it and write all values in ONE setValues call. `values` always holds the
 * header row, so setValues never gets 0 rows. One call, so the dashboard refresh never reads half a tab: it sees the
 * cleared tab (and ignores it) or the whole feed.
 */
function feedWriteTab_(ss, name, values) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var nr = values.length;
  var nc = nr ? values[0].length : 0;
  sheet.clear();
  if (!nr || !nc) return;
  var mr = sheet.getMaxRows(), mc = sheet.getMaxColumns();
  if (mr < nr) sheet.insertRowsAfter(mr, nr - mr);
  if (mc < nc) sheet.insertColumnsAfter(mc, nc - mc);
  sheet.getRange(1, 1, nr, nc).setValues(values);
  // Give back the empty rows of an earlier, bigger run: they count toward the spreadsheet's 10-million-cell limit.
  // One spare row stays (a sheet cannot lose all of its non-frozen rows).
  if (mr > nr + 100) {
    try { sheet.deleteRows(nr + 2, mr - nr - 1); } catch (e) { Logger.log(name + ': could not trim rows: ' + feedErr_(e)); }
  }
}

/* =====================================================================================================================
 * 4. main(): Google Ads calls it on Preview, Run and on the schedule
 * ===================================================================================================================*/

function main() {
  var started = new Date();
  if (!CONFIG.SPREADSHEET_URL || CONFIG.SPREADSHEET_URL.indexOf('docs.google.com/spreadsheets') < 0) {
    throw new Error('Set CONFIG.SPREADSHEET_URL to the County Search QC spreadsheet link before running.');
  }
  var account = AdsApp.currentAccount();
  var tz = account.getTimeZone();
  var today = Utilities.formatDate(started, tz, 'yyyy-MM-dd');
  var plan = feedPlan_(CONFIG, today);
  var ss = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);

  var meta = [
    ['script_version', FEED_SCRIPT_VERSION],
    ['last_run', Utilities.formatDate(started, tz, "yyyy-MM-dd'T'HH:mm:ss")],
    ['account_id', account.getCustomerId()],
    ['account_name', account.getName() || ''],
    ['currency', account.getCurrencyCode()],
    ['time_zone', tz],
    ['backfill', CONFIG.BACKFILL ? 'true' : 'false']
  ];
  try { meta.push(['preview', AdsApp.getExecutionInfo().isPreview() ? 'true' : 'false']); } catch (e) { /* not available */ }
  var notes = [];
  if (tz !== FEED_EXPECTED_TZ) {
    notes.push(['time_zone_note', 'the account time zone is ' + tz + ', not ' + FEED_EXPECTED_TZ + ': days and times are in ' + tz]);
  }
  var fetchers = {
    search_terms: function () { return feedFetchSearchTerms_(plan.search_terms, notes); },
    changes: function () { return feedFetchChanges_(plan.changes, notes); },
    campaign_days: function () { return feedFetchCampaignDays_(plan.campaign_days); },
    keywords: function () { return feedFetchKeywords_(plan.keywords); }
  };
  var failed = 0;
  FEED_SECTIONS.forEach(function (name) {
    var range = plan[name];
    meta.push([name + '_from', range.from]);
    meta.push([name + '_to', range.to]);
    var tab = 'feed_' + name;
    try {
      var capped = feedCapRows_(name, fetchers[name](), FEED_MAX_ROWS);
      var rows = capped.rows;
      if (capped.note) notes.push([name + '_note', capped.note]);
      feedWriteTab_(ss, tab, feedValues_(FEED_COLUMNS[name], rows));
      meta.push([name + '_rows', rows.length]);
      meta.push([name + '_error', '']);
      Logger.log(tab + ': ' + rows.length + ' rows (' + range.from + ' to ' + range.to + ')');
    } catch (e) {
      failed++;
      meta.push([name + '_rows', 0]);
      meta.push([name + '_error', feedErr_(e)]);
      Logger.log(tab + ': FAILED: ' + feedErr_(e));
      try { feedWriteTab_(ss, tab, feedValues_(FEED_COLUMNS[name], [])); } catch (e2) { Logger.log(tab + ': could not clear: ' + feedErr_(e2)); }
    }
  });
  notes.forEach(function (n) { meta.push(n); Logger.log(n[0] + ': ' + n[1]); });
  meta.push(['status', failed ? failed + ' section(s) failed' : 'ok']);
  meta.push(['took_seconds', Math.round((new Date().getTime() - started.getTime()) / 1000)]);
  feedWriteTab_(ss, 'feed_meta', feedMetaValues_(meta));
  Logger.log('feed_meta: ' + (failed ? failed + ' section(s) failed' : 'ok'));
}
