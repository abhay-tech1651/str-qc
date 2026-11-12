/**
 * County Search QC: spreadsheet menu, first-run setup, the daily refresh and the web app endpoints
 * (docs/CONTRACT.md sections 3 and 5).
 *
 * Security: the web app runs as the person opening it (executeAs USER_ACCESSING), and google.script.run can call any
 * public top-level function from any page this script serves. So every public function below checks who is calling:
 * the owner (Script Property OWNER, set by setup) and the emails in Settings > viewers may read; only the owner may
 * upload, refresh or re-run setup. Helpers end in '_' so the browser cannot call them.
 */

var APP_TITLE_ = 'County Search QC';
var TZ_ = 'Asia/Kolkata';
var REFRESH_HOUR_ = 9;
var FEED_TABLES_ = ['search_terms', 'changes', 'campaign_days', 'keywords'];
var UPLOAD_TABLES_ = ['search_terms', 'changes', 'campaign_days', 'keywords', 'auction'];
/** Deliberately empty: the agency sheet is shared by link, so its ID is private and is typed into Settings, never kept in code. */
var DEFAULT_AGENCY_SHEET_ID_ = '';
var PROJECT_COLS_ = ['id', 'name', 'match', 'location', 'product', 'starting_price_cr', 'max_price_cr', 'villas_or_penthouses'];
var NO_ACCESS_HTML_ = '<p style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 16px">' +
  'You do not have access to this dashboard. Ask the owner to add your Google account email to the viewers list.</p>';
var UPLOAD_MAX_FILES_ = 20;
var UPLOAD_MAX_NAME_ = 200;
var UPLOAD_MAX_TEXT_ = 10000000;
var UPLOAD_MAX_TOTAL_ = 20000000;
/** Log a warning when a refresh has used this much of the 6-minute Apps Script execution limit. */
var REFRESH_WARN_MS_ = 240000;

/* ---------- pure helpers (tested in Node) ---------- */

function escapeHtml_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 'a@x.com, B@y.com ;c@z' -> ['a@x.com', 'b@y.com', 'c@z']. */
function parseViewers_(s) {
  return String(s === null || s === undefined ? '' : s).split(/[,;\s]+/)
    .map(function (e) { return e.trim().toLowerCase(); }).filter(function (e) { return e; });
}

/** Is email the owner or one of the viewers? An empty email or an empty owner never matches. */
function isAllowedEmail_(email, owner, viewers) {
  email = String(email || '').trim().toLowerCase();
  owner = String(owner || '').trim().toLowerCase();
  if (!email) return false;
  if (owner && email === owner) return true;
  return parseViewers_(viewers).indexOf(email) >= 0;
}

/** Settings tab values (key in column A, value in column B) -> {key: value}. Keys lower-cased, values trimmed text. */
function settingsFromValues_(values) {
  var out = {};
  for (var i = 0; i < (values || []).length; i++) {
    var k = String(values[i][0] === null || values[i][0] === undefined ? '' : values[i][0]).trim().toLowerCase();
    if (!k || k === 'key') continue;
    var v = values[i].length > 1 ? values[i][1] : '';
    out[k] = String(v === null || v === undefined ? '' : v).trim();
  }
  return out;
}

/** The Projects tab seed: header plus one row per project of cfg, match words joined with ', '. */
function projectsSeedValues_(cfg) {
  var out = [PROJECT_COLS_.slice()];
  (cfg.projects || []).forEach(function (p) {
    out.push(PROJECT_COLS_.map(function (c) {
      var v = p[c];
      if (c === 'match') return (v || []).join(', ');
      return v === null || v === undefined ? '' : v;
    }));
  });
  return out;
}

function mainNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v === null || v === undefined ? '' : v).replace(/[,\s₹]/g, '').replace(/^(Rs\.?|INR)/i, '').replace(/(cr|crore)$/i, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}

/**
 * cfg with the Projects tab applied (pure; returns a new object). Rows match cfg.projects by id; a row with a new id
 * adds a project at the end. Filled cells override; an empty cell clears an optional field (max_price_cr,
 * villas_or_penthouses, location, product) and leaves name, match and starting_price_cr as they were.
 */
function projectsFromValues_(cfg, values) {
  cfg = JSON.parse(JSON.stringify(cfg));
  cfg.projects = cfg.projects || [];
  if (!values || values.length < 2) return cfg;
  var header = values[0].map(function (h) { return String(h === null || h === undefined ? '' : h).trim().toLowerCase(); });
  var col = function (name) { return header.indexOf(name); };
  if (col('id') < 0) return cfg;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = String(row[col('id')] === null || row[col('id')] === undefined ? '' : row[col('id')]).trim().toLowerCase();
    if (!id) continue;
    var p = null;
    for (var j = 0; j < cfg.projects.length; j++) if (cfg.projects[j].id === id) p = cfg.projects[j];
    if (!p) {
      p = { id: id, name: id.charAt(0).toUpperCase() + id.slice(1), match: [id] };
      cfg.projects.push(p);
    }
    PROJECT_COLS_.forEach(function (c) {
      if (c === 'id' || col(c) < 0) return;
      var raw = row[col(c)];
      var text = String(raw === null || raw === undefined ? '' : raw).trim();
      if (c === 'match') {
        var words = text.split(',').map(function (w) { return w.trim().toLowerCase(); }).filter(function (w) { return w; });
        if (words.length) p.match = words;
      } else if (c === 'starting_price_cr' || c === 'max_price_cr') {
        var n = text === '' ? null : mainNum_(raw);
        if (n !== null) p[c] = n;
        else if (text === '' && c === 'max_price_cr') delete p[c];
      } else if (c === 'name') {
        if (text) p.name = text;
      } else if (c === 'villas_or_penthouses') {
        if (text) p[c] = text.toLowerCase();
        else delete p[c];
      } else {
        p[c] = text;
      }
    });
  }
  return cfg;
}

/** Smallest and largest non-empty day of rows. */
function dayRange_(rows) {
  var lo = null, hi = null;
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i].day;
    if (d === null || d === undefined || d === '') continue;
    d = String(d);
    if (lo === null || d < lo) lo = d;
    if (hi === null || d > hi) hi = d;
  }
  return { first_day: lo, last_day: hi };
}

/** Throws unless files is [{name: string <= 200 chars, text: string <= 10,000,000 chars}] with at most 20 entries. */
function validateUploads_(files) {
  if (!Array.isArray(files)) throw new Error('Upload rejected: expected a list of files.');
  if (!files.length) throw new Error('Upload rejected: no files.');
  if (files.length > UPLOAD_MAX_FILES_) throw new Error('Upload rejected: at most ' + UPLOAD_MAX_FILES_ + ' files at a time.');
  var total = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error('Upload rejected: file ' + (i + 1) + ' is not a file.');
    if (typeof f.name !== 'string' || f.name.length > UPLOAD_MAX_NAME_) {
      throw new Error('Upload rejected: file ' + (i + 1) + ' needs a name of at most ' + UPLOAD_MAX_NAME_ + ' characters.');
    }
    if (typeof f.text !== 'string' || f.text.length > UPLOAD_MAX_TEXT_) {
      throw new Error('Upload rejected: file ' + (i + 1) + ' must be text of at most ' + UPLOAD_MAX_TEXT_ + ' characters.');
    }
    total += f.text.length;
  }
  if (total > UPLOAD_MAX_TOTAL_) throw new Error('Upload rejected: more than ' + UPLOAD_MAX_TOTAL_ + ' characters in one go.');
}

/* ---------- identity and access ---------- */

/**
 * The caller's email, lower-cased ('' when Google does not reveal it). Only the active user counts: if the web app were
 * ever deployed "execute as me" by mistake, the effective user would be the owner for every visitor. So the effective
 * user is used only when fromTrigger is true (a time-driven trigger runs as the person who created it and can leave the
 * active user empty).
 */
function email_(fromTrigger) {
  var e = '';
  try { e = Session.getActiveUser().getEmail() || ''; } catch (err) { e = ''; }
  if (!e && fromTrigger) {
    try { e = Session.getEffectiveUser().getEmail() || ''; } catch (err2) { e = ''; }
  }
  return String(e).trim().toLowerCase();
}

/** Is e the event object of a time-driven trigger (it carries triggerUid)? */
function isTriggerEvent_(e) {
  return !!(e && typeof e === 'object' && e.triggerUid);
}

function owner_() {
  return String(PropertiesService.getScriptProperties().getProperty('OWNER') || '').trim().toLowerCase();
}

function isOwner_() {
  var e = email_();
  return !!e && e === owner_();
}

function allowed_() {
  try {
    var e = email_();
    if (!e) return false;
    if (e === owner_()) return true;
    return isAllowedEmail_(e, '', settings_().viewers);
  } catch (err) {
    return false;
  }
}

function requireAllowed_() {
  if (!allowed_()) throw new Error('No access to this dashboard.');
}

function requireOwner_() {
  if (!isOwner_()) throw new Error('Only the owner can do this.');
}

/**
 * Public, owner-only versions of the table helpers in 30_Store.js (for the script editor and local rehearsals).
 * The engine itself uses readTable_ / writeTable_, which google.script.run cannot call.
 */
function readTable(name, table) {
  requireOwner_();
  return readTable_(name, table);
}

function writeTable(name, rows, table) {
  requireOwner_();
  return writeTable_(name, rows, table);
}

/* ---------- spreadsheet menu ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Search QC')
    .addItem('Open dashboard', 'openDashboard')
    .addItem('Refresh now', 'menuRefresh')
    .addSeparator()
    .addItem('Set up (first run)', 'setup')
    .addToUi();
}

/**
 * The published dashboard address. ScriptApp.getService().getUrl() is not reliable in the current Apps Script editor
 * (it can return an address that is not the deployment), so the deployment address is fixed here and can be
 * overridden with Settings > dashboard_url. Redeploy with clasp create-deployment -i <same id> to keep it.
 */
/** Deliberately empty: the web app's address is kept in Settings > dashboard_url, not in code. */
var DASHBOARD_URL_ = '';

function dashboardUrl_() {
  var custom = '';
  try { custom = String(settings_().dashboard_url || '').trim(); } catch (err) { custom = ''; }
  if (/^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(custom)) return custom;
  return DASHBOARD_URL_;
}

function openDashboard() {
  var url = dashboardUrl_();
  var body = url
    ? '<p><a href="' + escapeHtml_(url) + '" target="_blank" rel="noopener">Open the ' + APP_TITLE_ + ' dashboard</a></p>'
    : '<p>The dashboard is not deployed yet. In Extensions &gt; Apps Script choose Deploy &gt; New deployment &gt; Web app.</p>';
  var html = HtmlService.createHtmlOutput('<div style="font:14px/1.5 system-ui,sans-serif">' + body + '</div>')
    .setWidth(360).setHeight(110);
  SpreadsheetApp.getUi().showModelessDialog(html, APP_TITLE_);
}

function menuRefresh() {
  var r = refresh();
  var msg = r && r.ok ? 'Dashboard rebuilt at ' + r.at + '.' : (r && r.note) || 'Refresh did not run.';
  ss_().toast(msg, APP_TITLE_, 8);
}

/* ---------- setup ---------- */

/**
 * First run (idempotent): remembers this spreadsheet and its owner, creates Read me / Settings / Projects without
 * overwriting what was edited, adds the daily 9:00 refresh trigger once, hides the data tabs.
 * The first run must be done by an editor of the spreadsheet; after that only the owner may run it. To hand the
 * dashboard to someone else, delete the OWNER script property and let them run this again.
 */
function setup() {
  var me = email_();
  if (!me) throw new Error('Setup needs a signed-in Google account.');
  var props = PropertiesService.getScriptProperties();
  var owner = owner_();
  var ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('Run setup from the spreadsheet (Search QC > Set up).');
  if (owner) {
    if (me !== owner) throw new Error('Only the owner can run setup again.');
  } else if (!canEditSpreadsheet_(ss, me)) {
    throw new Error('Run setup from the spreadsheet menu (Search QC > Set up) as an editor of the spreadsheet.');
  }
  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!owner) props.setProperty('OWNER', me);
  STORE_SS_ = ss;

  removeEmptyDefaultTab_(ss);
  setupReadMe_();
  setupSettings_(me);
  setupProjects_();
  setupTrigger_();
  hideDataTabs_();
  setStatus_('Set up', Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd HH:mm') + ' by ' + (owner || me));
  try { ss.toast('Set up done. Next: Search QC > Refresh now.', APP_TITLE_, 8); } catch (err) { /* no UI when run from the editor */ }
}

var READ_ME_LINES_ = [
  ['County Search QC'],
  ['What this is: the daily quality check of the Google Ads search campaigns the agency runs for County Group ' +
    '(Ivory, Clove, Cocoa, Jade, and any project you add on the Projects tab).'],
  ['Where the data comes from: (1) a Google Ads Script writes the latest data into the feed_ tabs every morning around 7:00; ' +
    '(2) exports dropped on the dashboard Upload page go into the raw_ tabs; (3) the agency search-term sheet is read directly, ' +
    'using agency_sheet_id on the Settings tab.'],
  ['Every day at 9:00 (India time) the sheet merges the new data, re-reads the agency sheet and rebuilds the dashboard. ' +
    'Search QC > Refresh now does the same at any time.'],
  ['Who can open the dashboard: the owner and the emails in Settings > viewers. Each viewer also needs view access to this spreadsheet.'],
  ['Project facts (names, match words, prices) live on the Projects tab: edit them there, no code change needed.'],
  ['Do not edit the hidden tabs (raw_, feed_, agency_calls, _model, _review): the script writes them.'],
  [''],
  ['Status']
];
var STATUS_LABELS_ = ['Dashboard link', 'Set up', 'Last refresh', 'Rows', 'Agency sheet', 'Took', 'Last error'];

/**
 * First-run check: is me able to edit the spreadsheet? True inside the spreadsheet UI (the Search QC menu, which only
 * editors get), or when me is listed as its owner or an editor. A web-app caller (no UI) who is not an editor fails.
 */
function canEditSpreadsheet_(ss, me) {
  try { SpreadsheetApp.getUi(); return true; } catch (err) { /* not called from the spreadsheet UI */ }
  try {
    var o = ss.getOwner();
    if (o && String(o.getEmail() || '').toLowerCase() === me) return true;
  } catch (err2) { /* not available */ }
  try {
    return ss.getEditors().some(function (u) { return String(u.getEmail() || '').toLowerCase() === me; });
  } catch (err3) {
    return false;
  }
}

function setupReadMe_() {
  var sh = sheet_('Read me', true);
  sh.getRange(1, 1, READ_ME_LINES_.length, 1).setValues(READ_ME_LINES_.map(function (r) { return [safeCell_(r[0])]; }));
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sh.getRange(READ_ME_LINES_.length, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 160);
  STATUS_LABELS_.forEach(function (label) { statusRow_(sh, label); });
  setStatus_('Dashboard link', dashboardUrl_());
  if (ss_().getSheets()[0].getName() !== 'Read me') {
    ss_().setActiveSheet(sh);
    ss_().moveActiveSheet(1);
  }
}

/** Row number of a status label on the Read me tab (added below the text when missing). */
function statusRow_(sh, label) {
  var last = sh.getLastRow();
  var start = READ_ME_LINES_.length + 1;
  if (last >= start) {
    var labels = sh.getRange(start, 1, last - start + 1, 1).getValues();
    for (var i = 0; i < labels.length; i++) if (String(labels[i][0]) === label) return start + i;
  }
  var row = Math.max(last, start - 1) + 1;
  sh.getRange(row, 1).setValue(safeCell_(label));
  return row;
}

/** Write a status value on the Read me tab (as text). */
function setStatus_(label, value) {
  try {
    var sh = sheet_('Read me', true);
    sh.getRange(statusRow_(sh, label), 2).setValue(safeCell_(value));
  } catch (err) {
    console.log('status not written: ' + label);
  }
}

function setupSettings_(me) {
  var sh = sheet_('Settings', true);
  var values = sh.getLastRow() ? sh.getDataRange().getValues() : [];
  var have = settingsFromValues_(values);
  if (!values.length) {
    sh.getRange(1, 1, 1, 3).setValues([['key', 'value', 'note']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var wanted = [
    ['agency_sheet_id', DEFAULT_AGENCY_SHEET_ID_, 'ID of the agency search-term Google Sheet (the long part of its link).'],
    ['viewers', '', 'comma-separated Google emails allowed to open the dashboard'],
    ['owner', owner_() || me, 'Set by Set up. Changing it here has no effect: the owner is kept in the script properties.']
  ];
  wanted.forEach(function (w) {
    if (Object.prototype.hasOwnProperty.call(have, w[0])) return;
    sh.appendRow([safeCell_(w[0]), safeCell_(w[1]), safeCell_(w[2])]);
  });
  sh.getRange(1, 2, Math.max(sh.getLastRow(), 1), 1).setNumberFormat('@');
}

function setupProjects_() {
  var sh = sheet_('Projects', true);
  if (sh.getLastRow() >= 2) return;
  var values = projectsSeedValues_(defaultConfig()).map(function (r) { return r.map(safeCell_); });
  sh.clear();
  sh.getRange(1, 1, values.length, PROJECT_COLS_.length).setValues(values);
  sh.getRange(1, 1, 1, PROJECT_COLS_.length).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function setupTrigger_() {
  var have = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'refresh' && t.getEventType() === ScriptApp.EventType.CLOCK;
  });
  if (!have) ScriptApp.newTrigger('refresh').timeBased().everyDays(1).atHour(REFRESH_HOUR_).inTimezone(TZ_).create();
}

function isDataTab_(name) {
  return /^(raw_|feed_)/.test(name) || name === 'agency_calls' || name === '_model' || name === '_review';
}

/** A new spreadsheet starts with an empty 'Sheet1': remove it once our own tabs exist (never if it holds anything). */
function removeEmptyDefaultTab_(ss) {
  var sh = ss.getSheetByName('Sheet1');
  if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh);
}

function hideDataTabs_() {
  ss_().getSheets().forEach(function (sh) {
    if (isDataTab_(sh.getName())) storeHide_(sh);
  });
}

/* ---------- settings, config, agency sheet ---------- */

function settings_() {
  var sh = sheet_('Settings', false);
  if (!sh || sh.getLastRow() < 1) return {};
  return settingsFromValues_(sh.getDataRange().getValues());
}

/** defaultConfig() with the Projects tab applied. */
function loadConfig_() {
  var sh = sheet_('Projects', false);
  var cfg = defaultConfig();
  if (!sh || sh.getLastRow() < 2) return cfg;
  return projectsFromValues_(cfg, sh.getDataRange().getValues());
}

/**
 * Rebuild agency_calls from every tab of the agency sheet. When the sheet cannot be opened, or no tab gives rows,
 * the previous agency_calls rows are kept and the problem is noted on the Read me tab.
 */
function readAgency_() {
  var id = settings_().agency_sheet_id || DEFAULT_AGENCY_SHEET_ID_;
  if (!id) {
    setStatus_('Agency sheet', 'No agency sheet set: paste its ID (the long part of its link) into Settings > agency_sheet_id. Kept the previous rows.');
    return readTable_('agency_calls', 'agency_calls');
  }
  var ext;
  try {
    ext = SpreadsheetApp.openById(id);
  } catch (err) {
    setStatus_('Agency sheet', 'Could not open the agency sheet (' + Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd HH:mm') +
      '): ' + String(err && err.message || err).slice(0, 200) + '. Kept the previous rows.');
    return readTable_('agency_calls', 'agency_calls');
  }
  var rows = [], failed = [];
  var tabs = ext.getSheets();
  tabs.forEach(function (sh, n) {
    var t = new Date().getTime();
    try {
      var got = parseAgencyTab(sh.getName(), sh.getDataRange().getValues()) || [];
      for (var i = 0; i < got.length; i++) rows.push(got[i]);
    } catch (err) {
      failed.push(sh.getName());
    }
    var ms = new Date().getTime() - t;
    if (ms > 5000) console.log('refresh: agency tab ' + (n + 1) + ' of ' + tabs.length + ' took ' + ms + ' ms');
  });
  console.log('refresh: agency sheet ' + tabs.length + ' tabs, ' + rows.length + ' rows, ' + failed.length + ' unreadable');
  if (!rows.length) {
    var prev = readTable_('agency_calls', 'agency_calls');
    if (prev.length) {
      setStatus_('Agency sheet', 'The agency sheet gave no rows; kept the previous ' + prev.length + ' rows.');
      return prev;
    }
  }
  writeTable_('agency_calls', rows, 'agency_calls');
  setStatus_('Agency sheet', rows.length + ' rows from ' + tabs.length + ' tabs' +
    (failed.length ? '; could not read tabs: ' + failed.join(', ') : ''));
  return rows;
}

/* ---------- refresh ---------- */

/**
 * Merge the feeds, re-read the agency sheet, rebuild the model. The daily trigger (e = its event object) and the menu
 * call this.
 */
function refresh(e) {
  if (!canRefresh_(isTriggerEvent_(e))) throw new Error('Only the owner can refresh.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.log('refresh: another refresh is running');
    return { ok: false, at: null, note: 'A refresh is already running. Try again in a minute.' };
  }
  try {
    return refreshLocked_();
  } finally {
    lock.releaseLock();
  }
}

function canRefresh_(fromTrigger) {
  var e = email_(fromTrigger);
  return !!e && e === owner_();
}

/**
 * A short fingerprint of rows (two 32-bit hashes of their JSON, plus its length). Pure. Used to merge a feed tab only
 * when the Ads Script has written something new, so a stale feed never overwrites newer uploaded data.
 */
function rowsFingerprint_(rows) {
  var s = JSON.stringify(rows || []);
  var h1 = 0x811c9dc5, h2 = (0x01000193 ^ s.length) >>> 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    h2 = (h2 ^ (h2 >>> 15)) >>> 0;
  }
  return s.length + ':' + h1.toString(16) + ':' + h2.toString(16);
}

function nowIso_() {
  return Utilities.formatDate(new Date(), TZ_, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function refreshLocked_() {
  var t0 = new Date().getTime();
  var lap = function (what, since) { console.log('refresh: ' + what + ' ' + (new Date().getTime() - since) + ' ms'); };
  var T = {};
  try {
    var props = PropertiesService.getScriptProperties();
    FEED_TABLES_.forEach(function (table) {
      var t = new Date().getTime();
      var rawSheet = sheet_('raw_' + table, false);
      var raw = readTable_('raw_' + table, table);
      var feedSheet = sheet_('feed_' + table, false);
      if (feedSheet) {
        storeHide_(feedSheet);
        var feed = readTable_('feed_' + table, table);
        var sig = feed.length ? rowsFingerprint_(feed) : '';
        // Merge each feed once: merging an unchanged feed on every refresh would put its (older) rows back over rows
        // uploaded since.
        if (feed.length && (sig !== props.getProperty('FEED_SIG_' + table) || !rawSheet)) {
          raw = mergeRows_(table, raw, feed);
          storeHide_(writeTable_('raw_' + table, raw, table));
          props.setProperty('FEED_SIG_' + table, sig);
        } else if (feed.length) {
          console.log('refresh: feed_' + table + ' unchanged since the last merge');
        }
      }
      T[table] = raw;
      lap(table, t);
    });
    T.auction = readTable_('raw_auction', 'auction');
    var ta = new Date().getTime();
    T.agency_calls = readAgency_();
    lap('agency sheet', ta);
    storeHide_(sheet_('agency_calls', false));
    if (new Date().getTime() - t0 > REFRESH_WARN_MS_) console.log('refresh: warning, reading took over 4 minutes');

    var asOf = Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd');
    var tm = new Date().getTime();
    var out = buildModel({
      search_terms: T.search_terms, agency_calls: T.agency_calls, changes: T.changes,
      campaign_days: T.campaign_days, keywords: T.keywords, auction: T.auction
    }, loadConfig_(), asOf);
    lap('model', tm);
    var at = nowIso_();
    out.model.refreshed_at = at;
    var ts = new Date().getTime();
    saveJson_('_model', out.model);
    saveJson_('_review', out.review || []);
    lap('save', ts);

    var counts = ['search_terms', 'agency_calls', 'changes', 'campaign_days', 'keywords', 'auction']
      .map(function (k) { return k + ' ' + T[k].length; }).join(', ');
    setStatus_('Last refresh', at);
    setStatus_('Rows', counts);
    setStatus_('Took', Math.round((new Date().getTime() - t0) / 1000) + ' s');
    setStatus_('Last error', '');
    lap('total', t0);
    return { ok: true, at: at };
  } catch (err) {
    setStatus_('Last error', nowIso_() + ': ' + String(err && err.message || err).slice(0, 300));
    throw err;
  }
}

/* ---------- web app ---------- */

function doGet(e) {
  if (!allowed_()) {
    return HtmlService.createHtmlOutput(NO_ACCESS_HTML_).setTitle(APP_TITLE_)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Dashboard').setTitle(APP_TITLE_)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** The model JSON string ('{}' before the first refresh). */
function getModel() {
  requireAllowed_();
  return loadJson_('_model') || '{}';
}

/** The review rows JSON string ('[]' before the first refresh). */
function getReview() {
  requireAllowed_();
  return loadJson_('_review') || '[]';
}

function whoAmI() {
  requireAllowed_();
  return { email: email_(), canUpload: isOwner_() };
}

/**
 * Owner only. files = [{name, text}] (text decoded by the browser). Each file is recognised, parsed and merged into its
 * raw_ tab, then the model is rebuilt. Names are only echoed back. Returns [{name, kind, rows, first_day, last_day, note}].
 */
function uploadExports(files) {
  requireOwner_();
  validateUploads_(files);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('A refresh is running. Try again in a minute.');
  try {
    var results = [], merged = {};
    var skip = function (name, kind, note) {
      return { name: name, kind: kind, rows: 0, first_day: null, last_day: null, note: note };
    };
    files.forEach(function (f) {
      var kind = 'unknown';
      try {
        kind = detectKind(f.text);
        if (UPLOAD_TABLES_.indexOf(kind) < 0) {
          results.push(skip(f.name, kind, 'not recognised'));
          return;
        }
        var parsed = parseExport(f.text) || {};
        if (parsed.kind && UPLOAD_TABLES_.indexOf(parsed.kind) >= 0) kind = parsed.kind;
        var rows = parsed.rows || [];
        if (!rows.length) {
          results.push(skip(f.name, kind, 'no rows found'));
          return;
        }
        if (!merged[kind]) merged[kind] = readTable_('raw_' + kind, kind);
        merged[kind] = mergeRows_(kind, merged[kind], rows);
        var span = dayRange_(rows);
        results.push({ name: f.name, kind: kind, rows: rows.length, first_day: span.first_day, last_day: span.last_day, note: '' });
      } catch (err) {
        console.log('upload: file ' + (results.length + 1) + ' could not be read: ' + String(err && err.message || err).slice(0, 200));
        results.push(skip(f.name, kind, 'could not be read'));
      }
    });
    Object.keys(merged).forEach(function (kind) {
      storeHide_(writeTable_('raw_' + kind, merged[kind], kind));
    });
    try {
      refreshLocked_();
    } catch (err) {
      var what = Object.keys(merged).length ? 'The files were saved, but the dashboard could not be rebuilt: '
        : 'The dashboard could not be rebuilt: ';
      throw new Error(what + String(err && err.message || err).slice(0, 300));
    }
    return results;
  } finally {
    lock.releaseLock();
  }
}

/** Owner only: re-read the agency sheet and feeds, rebuild the model. */
function refreshNow() {
  requireOwner_();
  var r = refresh();
  return r && r.ok ? { ok: true, at: r.at } : { ok: false, at: null, note: (r && r.note) || 'Refresh did not run.' };
}
