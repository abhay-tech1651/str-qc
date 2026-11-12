/**
 * Sheets storage for the County Search QC engine (docs/CONTRACT.md sections 2 and 3).
 *
 * The first half of this file is pure (column lists, cell safety, row <-> cell conversion, merge rules, chunking) and is
 * tested in Node by tests-js/store.test.js. The second half touches Apps Script services (SpreadsheetApp,
 * PropertiesService, Utilities) and only inside functions: nothing here runs at load time.
 */

/** Column order of every normalized table (CONTRACT section 2). The tab column order is the same. */
var TABLE_COLS = {
  search_terms: ['day', 'term', 'match_type', 'ads_status', 'campaign', 'ad_group', 'keyword', 'clicks', 'impr', 'cost', 'conv'],
  changes: ['ts', 'day', 'user', 'campaign', 'ad_group', 'kind', 'item'],
  campaign_days: ['day', 'campaign', 'campaign_id', 'campaign_status', 'status', 'status_reasons', 'bid_strategy', 'budget_now',
    'target_cpa_now', 'impr', 'clicks', 'cost', 'conv', 'all_conv', 'is_pct', 'lost_budget_pct', 'lost_rank_pct', 'top_is_pct',
    'abs_top_is_pct'],
  keywords: ['period_start', 'day', 'keyword_status', 'keyword', 'match_type', 'campaign', 'ad_group', 'status', 'status_reasons',
    'cost', 'clicks', 'impr', 'conv', 'quality_score', 'ad_relevance', 'landing_page', 'is_pct', 'lost_rank_pct'],
  auction: ['period_start', 'day', 'domain', 'impression_share', 'impression_share_raw', 'overlap_rate', 'position_above_rate',
    'top_of_page_rate', 'abs_top_rate', 'outranking_share'],
  agency_calls: ['day', 'tab', 'term', 'match_type', 'ads_status', 'campaign', 'ad_group', 'keyword', 'clicks', 'impr', 'cost', 'conv',
    'decision', 'neg_term', 'county_comment']
};

/** Number columns of each table. Every other column is text. */
var NUMERIC_COLS = {
  search_terms: ['clicks', 'impr', 'cost', 'conv'],
  changes: [],
  campaign_days: ['budget_now', 'target_cpa_now', 'impr', 'clicks', 'cost', 'conv', 'all_conv', 'is_pct', 'lost_budget_pct',
    'lost_rank_pct', 'top_is_pct', 'abs_top_is_pct'],
  keywords: ['cost', 'clicks', 'impr', 'conv', 'quality_score', 'is_pct', 'lost_rank_pct'],
  auction: ['impression_share', 'overlap_rate', 'position_above_rate', 'top_of_page_rate', 'abs_top_rate', 'outranking_share'],
  agency_calls: ['clicks', 'impr', 'cost', 'conv']
};

/**
 * Number columns where an empty cell means 0 (the Python reference reads an empty count or amount as 0.0).
 * Every other number column (percentages, quality_score, target_cpa_now) keeps an empty cell as null.
 */
var ZERO_COLS = ['clicks', 'impr', 'cost', 'conv', 'all_conv', 'budget_now'];

/** Day columns ('YYYY-MM-DD') and timestamp columns ('YYYY-MM-DDTHH:MM:SS'): stored as plain text. */
var DAY_COLS = ['day', 'period_start'];
var TS_COLS = ['ts'];

/** Google Sheets refuses a cell over 50,000 characters. */
var CELL_MAX_ = 50000;

/**
 * Formula starters, the apostrophe itself (Sheets would swallow a leading one) and '#' (typed '#N/A', '#REF!' and the like
 * become error values, not text).
 */
var CELL_LEAD_RE_ = /^[=+\-@'#]/;
var CELL_MONTH_RE_ = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b\.?/gi;
var CELL_WEEKDAY_RE_ = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?\b\.?/gi;
var CELL_NUMERIC_RE_ = /^[\s\d.,:\/\-+%()$₹€£¥]*$/;

/**
 * Would Google Sheets turn this text into something other than text (a number, date, time, percentage, currency,
 * fraction or boolean)? Errs on the side of yes: a needless apostrophe is invisible and is not part of the value.
 */
function cellLooksParsed_(s) {
  var t = String(s).trim();
  if (!t) return false;
  if (/^(true|false)$/i.test(t)) return true;
  t = t.replace(CELL_MONTH_RE_, '1').replace(CELL_WEEKDAY_RE_, ' ')
    .replace(/\b(a\.?m\.?|p\.?m\.?)(?=\s|$)/gi, ' ')
    .replace(/(\d)[eE]([-+]?\d)/g, '$1$2')
    .replace(/(\d)[tT](\d)/g, '$1 $2')
    .replace(/(\d)\s*[zZ]$/, '$1');
  return /\d/.test(t) && CELL_NUMERIC_RE_.test(t);
}

/**
 * The value to write to a cell so it is stored exactly as given (CONTRACT section 3). null/undefined -> ''. Finite
 * numbers and booleans unchanged (non-finite numbers -> ''). A string that starts with = + - @ ' or that Sheets would
 * parse as a number, date, time, percentage or boolean gets a leading apostrophe, which Sheets keeps out of the value.
 */
function safeCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v;
  var s = typeof v === 'string' ? v : (typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : String(v));
  if (s === '') return '';
  if (CELL_LEAD_RE_.test(s) || cellLooksParsed_(s)) s = "'" + s;
  return s.length > CELL_MAX_ ? s.slice(0, CELL_MAX_) : s;
}

function storeIn_(list, x) {
  return list.indexOf(x) >= 0;
}

/** A finite number from a number or a number-like string ('1,234', '12.5%', 'Rs 50'); null otherwise. */
function storeNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  var s = v.replace(/[,%₹\s]/g, '').replace(/^(Rs\.?|INR)/i, '');
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/**
 * Rows (objects) -> cell values: [header, ...rows], every value passed through safeCell_. `table` (optional) names
 * the table so number-like strings in its number columns are written as numbers.
 */
function rowsToValues_(rows, cols, table) {
  var nums = (table && NUMERIC_COLS[table]) || [];
  var out = [cols.map(safeCell_)];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var line = new Array(cols.length);
    for (var j = 0; j < cols.length; j++) {
      var v = r[cols[j]];
      if (typeof v === 'string' && storeIn_(nums, cols[j])) {
        var n = storeNum_(v);
        if (n !== null) v = n;
      }
      line[j] = safeCell_(v);
    }
    out.push(line);
  }
  return out;
}

function storePad_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Fallback date formatter (the Date's own clock). Apps Script callers pass one built on Utilities.formatDate. */
function storeFmtDate_(d, kind) {
  var day = d.getFullYear() + '-' + storePad_(d.getMonth() + 1) + '-' + storePad_(d.getDate());
  if (kind !== 'ts') return day;
  return day + 'T' + storePad_(d.getHours()) + ':' + storePad_(d.getMinutes()) + ':' + storePad_(d.getSeconds());
}

function storeIsDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/**
 * Cell values (as Range.getValues returns them) -> row objects with the table's columns. The header comes from the
 * first row; columns missing from the header get their empty value; fully empty rows are skipped.
 * Number columns: numbers kept, number-like strings parsed, '' -> 0 for counts and amounts (ZERO_COLS), else null.
 * Text columns: Date cells -> 'YYYY-MM-DD' (or 'YYYY-MM-DDTHH:MM:SS' in ts) via fmt(date, 'day'|'ts');
 * numbers -> their string; booleans -> 'TRUE' / 'FALSE'.
 */
function valuesToRows_(values, table, fmt) {
  fmt = fmt || storeFmtDate_;
  if (!values || !values.length) return [];
  var header = values[0].map(function (h) { return String(h === null || h === undefined ? '' : h).trim(); });
  var cols = TABLE_COLS[table] || header.filter(function (h) { return h; });
  var nums = NUMERIC_COLS[table] || [];
  var idx = cols.map(function (c) { return header.indexOf(c); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var line = values[i] || [];
    var empty = true;
    for (var k = 0; k < line.length; k++) {
      if (line[k] !== '' && line[k] !== null && line[k] !== undefined) { empty = false; break; }
    }
    if (empty) continue;
    var r = {};
    for (var j = 0; j < cols.length; j++) {
      var c = cols[j];
      var v = idx[j] >= 0 ? line[idx[j]] : '';
      if (v === undefined || v === null) v = '';
      if (storeIn_(nums, c)) {
        var n = storeIsDate_(v) || typeof v === 'boolean' ? null : storeNum_(v);
        r[c] = n !== null ? n : (storeIn_(ZERO_COLS, c) ? 0 : null);
      } else if (storeIsDate_(v)) {
        r[c] = fmt(v, storeIn_(TS_COLS, c) ? 'ts' : 'day');
      } else if (typeof v === 'boolean') {
        r[c] = v ? 'TRUE' : 'FALSE';
      } else {
        r[c] = typeof v === 'string' ? v : String(v);
      }
    }
    out.push(r);
  }
  return out;
}

function storeKey_(v) {
  return v === null || v === undefined ? '' : String(v);
}

function storeSort_(rows, cols) {
  return sortBy(rows, function (r) { return cols.map(function (c) { return storeKey_(r[c]); }); });
}

function storeMaxDay_(rows) {
  var m = '';
  for (var i = 0; i < rows.length; i++) {
    var d = storeKey_(rows[i].day);
    if (d > m) m = d;
  }
  return m;
}

/**
 * Merge newly arrived rows into the stored history (CONTRACT section 2). Pure; returns a new, deterministically sorted
 * array.
 *   search_terms   every day present in newRows is replaced by newRows' rows for that day
 *   changes        union, unique by (ts, campaign, ad_group, kind, item); the stored row wins
 *   campaign_days  a (day, campaign) row is replaced (the last new row for a key wins)
 *   keywords       newRows replace everything when their latest day >= the stored latest day; else the store is kept
 *   auction        rows of every (period_start, day) present in newRows are replaced
 */
function mergeRows_(table, oldRows, newRows) {
  oldRows = oldRows || [];
  newRows = newRows || [];
  var seen = {}, out = [], i, k;
  if (table === 'search_terms') {
    // a newer report replaces the rows of each (day, campaign) it contains; a one-campaign export leaves the others alone
    var dc = function (r) { return JSON.stringify([storeKey_(r.day), storeKey_(r.campaign)]); };
    for (i = 0; i < newRows.length; i++) seen[dc(newRows[i])] = 1;
    out = oldRows.filter(function (r) { return !seen[dc(r)]; }).concat(newRows);
    return storeSort_(out, ['day', 'campaign', 'ad_group', 'term', 'match_type']);
  }
  if (table === 'changes') {
    var keyCols = ['ts', 'campaign', 'ad_group', 'kind', 'item'];
    var all = oldRows.concat(newRows);
    for (i = 0; i < all.length; i++) {
      k = JSON.stringify(keyCols.map(function (c) { return storeKey_(all[i][c]); }));
      if (!seen[k]) { seen[k] = 1; out.push(all[i]); }
    }
    return storeSort_(out, keyCols);
  }
  if (table === 'campaign_days') {
    var cdKey = function (r) { return JSON.stringify([storeKey_(r.day), storeKey_(r.campaign)]); };
    var last = {};
    for (i = 0; i < newRows.length; i++) last[cdKey(newRows[i])] = i;
    out = oldRows.filter(function (r) { return !Object.prototype.hasOwnProperty.call(last, cdKey(r)); })
      .concat(newRows.filter(function (r, j) { return last[cdKey(r)] === j; }));
    return storeSort_(out, ['day', 'campaign']);
  }
  if (table === 'keywords') {
    if (!oldRows.length || (newRows.length && storeMaxDay_(newRows) >= storeMaxDay_(oldRows))) return newRows.slice();
    return oldRows.slice();
  }
  if (table === 'auction') {
    var aKey = function (r) { return JSON.stringify([storeKey_(r.period_start), storeKey_(r.day)]); };
    for (i = 0; i < newRows.length; i++) seen[aKey(newRows[i])] = 1;
    out = oldRows.filter(function (r) { return !seen[aKey(r)]; }).concat(newRows);
    return storeSort_(out, ['period_start', 'day', 'domain']);
  }
  throw new Error('mergeRows_: no merge rule for table ' + table);
}

/** Split a string into pieces of at most n characters (default 45,000), never inside a UTF-16 surrogate pair. */
function chunk_(s, n) {
  n = n && n >= 2 ? n : 45000;
  s = String(s === null || s === undefined ? '' : s);
  var out = [];
  var i = 0;
  while (i < s.length) {
    var end = Math.min(i + n, s.length);
    if (end < s.length) {
      var c = s.charCodeAt(end - 1);
      if (c >= 0xd800 && c <= 0xdbff) end--;
    }
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
}

/** Join pieces made by chunk_. Accepts a flat list or Range.getValues() rows ([[piece], ...]); empty cells are skipped. */
function unchunk_(cells) {
  var out = [];
  for (var i = 0; i < (cells || []).length; i++) {
    var c = Array.isArray(cells[i]) ? cells[i][0] : cells[i];
    if (c === null || c === undefined || c === '') continue;
    out.push(String(c));
  }
  return out.join('');
}

/* ---------- Apps Script side (services are used only inside these functions) ---------- */

var STORE_SS_ = null;

/** The QC spreadsheet: the one whose id setup() stored, else the spreadsheet this script is bound to. */
function ss_() {
  if (STORE_SS_) return STORE_SS_;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  STORE_SS_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  return STORE_SS_;
}

/** The tab called name; created (at the end) when missing and create is true, else null. */
function sheet_(name, create) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh && create) sh = ss.insertSheet(name, ss.getSheets().length);
  return sh;
}

/** The time zone that turned text cells into Date cells (the spreadsheet's), for reading them back. */
function storeTz_() {
  var tz = '';
  try { tz = ss_().getSpreadsheetTimeZone(); } catch (err) { tz = ''; }
  return tz || 'Asia/Kolkata';
}

function storeCellFmt_() {
  var tz = storeTz_();
  return function (d, kind) {
    return Utilities.formatDate(d, tz, kind === 'ts' ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
  };
}

/** Rows of a table tab ([] when the tab is missing or empty). Private (trailing _): google.script.run cannot call it. */
function readTable_(name, table) {
  var sh = sheet_(name, false);
  if (!sh || sh.getLastRow() < 1) return [];
  return valuesToRows_(sh.getDataRange().getValues(), table, storeCellFmt_());
}

/**
 * Replace a table tab with rows: one setValues, header frozen and bold, day/ts columns kept as plain text.
 * Private (trailing _): google.script.run cannot call it.
 */
function writeTable_(name, rows, table) {
  var cols = TABLE_COLS[table];
  if (!cols) throw new Error('writeTable_: unknown table ' + table);
  var values = rowsToValues_(rows || [], cols, table);
  var sh = sheet_(name, true);
  sh.clear();
  sh.getRange(1, 1, values.length, cols.length).setValues(values);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  for (var j = 0; j < cols.length; j++) {
    if (storeIn_(DAY_COLS, cols[j]) || storeIn_(TS_COLS, cols[j])) sh.getRange(1, j + 1, values.length, 1).setNumberFormat('@');
  }
  return sh;
}

/**
 * Hide a tab unless it is already hidden or it is the only visible tab (Sheet.hideSheet throws on the last visible one).
 * Returns the sheet.
 */
function storeHide_(sh) {
  if (!sh || sh.isSheetHidden()) return sh;
  var name = sh.getName();
  var others = sh.getParent ? sh.getParent().getSheets() : ss_().getSheets();
  for (var i = 0; i < others.length; i++) {
    if (others[i].getName() !== name && !others[i].isSheetHidden()) {
      sh.hideSheet();
      return sh;
    }
  }
  return sh;
}

/** The header cell of a saved JSON tab: '#<pieces>:<total length>' (JSON text never starts with '#'). */
function jsonHeader_(pieces, total) {
  return '#' + pieces + ':' + total;
}

/** Cell values -> {pieces, total} for a header cell made by jsonHeader_, else null. */
function jsonHeaderOf_(cell) {
  var m = /^#(\d+):(\d+)$/.exec(String(cell === null || cell === undefined ? '' : cell));
  return m ? { pieces: Number(m[1]), total: Number(m[2]) } : null;
}

/** Strip the '~' markers saveJson_ puts around every cell. */
function jsonCell_(c) {
  c = String(c === null || c === undefined ? '' : c);
  return c.length >= 2 && c.charAt(0) === '~' && c.charAt(c.length - 1) === '~' ? c.slice(1, -1) : c;
}

/**
 * Column A values of a saved JSON tab -> the JSON string, or undefined when the cells are not one complete save (a
 * reader that caught a write half way). Pure. Tabs written before the header existed (no header cell) are joined as is.
 */
function jsonFromCells_(cells) {
  var list = (cells || []).map(function (r) { return jsonCell_(Array.isArray(r) ? r[0] : r); });
  if (!list.length) return null;
  var h = jsonHeaderOf_(list[0]);
  if (!h) {
    var old = unchunk_(list);
    return old ? old : null;
  }
  if (list.length < h.pieces + 1) return undefined;
  var s = list.slice(1, h.pieces + 1).join('');
  return s.length === h.total ? s : undefined;
}

/**
 * Store a JSON value in a hidden tab: a header cell '#<pieces>:<length>', then 45,000-character pieces down column A,
 * all in one setValues. Each cell is written as '~' + text + '~' so Sheets never parses or trims it (45,002 characters,
 * under the 50,000-character cell limit). The new cells are written over the old ones and only then are leftover rows
 * cleared, so a reader never sees an empty tab; the header tells a reader where the current save ends.
 */
function saveJson_(tab, obj) {
  var text = JSON.stringify(obj === undefined ? null : obj);
  var pieces = chunk_(text);
  var sh = sheet_(tab, true);
  var old = sh.getLastRow();
  var cells = [jsonHeader_(pieces.length, text.length)].concat(pieces).map(function (p) { return ['~' + p + '~']; });
  sh.getRange(1, 1, cells.length, 1).setValues(cells);
  if (old > cells.length) sh.getRange(cells.length + 1, 1, old - cells.length, 1).clearContent();
  storeHide_(sh);
  return pieces.length;
}

/**
 * The JSON string saved by saveJson_, or null when the tab is missing or empty. A read that overlaps a save is retried
 * (up to 3 times, 1 s apart); after that it throws instead of handing back a broken string.
 */
function loadJson_(tab) {
  for (var attempt = 0; attempt < 4; attempt++) {
    var sh = sheet_(tab, false);
    if (!sh) return null;
    var last = sh.getLastRow();
    if (last < 1) return null;
    var s = jsonFromCells_(sh.getRange(1, 1, last, 1).getValues());
    if (s !== undefined) return s;
    if (attempt < 3 && typeof Utilities !== 'undefined' && Utilities.sleep) Utilities.sleep(1000);
  }
  throw new Error('The dashboard data is being rebuilt. Try again in a minute.');
}
