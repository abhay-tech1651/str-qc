/**
 * Export parsers for the County Search QC engine. Pure functions only (no Apps Script services): they run unchanged in
 * Apps Script (V8) and in Node tests. They mirror strqc/ingest.py; keep the two in step.
 *
 * Input is already-decoded text (the browser or the caller decodes UTF-16 / UTF-8); a leading BOM is ignored.
 * Output rows have exactly the columns of docs/CONTRACT.md section 2.
 */

var PARSE_MONTHS_ = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

var PARSE_COLS_ = {
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

/* ---------- small Python-compatible helpers ---------- */

function parseStripBom_(text) {
  text = String(text === null || text === undefined ? '' : text);
  return text.charAt(0) === '\ufeff' ? text.slice(1) : text;
}

/** Python str.splitlines() (no line ends kept, no trailing empty line). */
function parseSplitLines_(text) {
  var parts = String(text).split(/\r\n|[\n\r\u000b\u000c\u001c\u001d\u001e\u0085\u2028\u2029]/);
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/** Start offsets of the lines Python str.splitlines(True) would give. */
function parseLineStarts_(text) {
  var starts = [0], re = /\r\n|[\n\r\u000b\u000c\u001c\u001d\u001e\u0085\u2028\u2029]/g, m;
  while ((m = re.exec(text)) !== null) starts.push(m.index + m[0].length);
  if (starts[starts.length - 1] === text.length) starts.pop();
  return starts;
}

/** Python truthiness for a cell value. */
function parseTruthy_(v) {
  if (v === null || v === undefined || v === '' || v === 0 || v === false) return false;
  if (typeof v === 'number' && isNaN(v)) return false;
  return true;
}

function parsePad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Python str(v) for a cell value (Date objects as 'YYYY-MM-DD HH:MM:SS', like str(datetime)). */
function parseStr_(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var y = String(v.getFullYear());
    while (y.length < 4) y = '0' + y;
    return y + '-' + parsePad2_(v.getMonth() + 1) + '-' + parsePad2_(v.getDate()) + ' ' + parsePad2_(v.getHours()) + ':' +
      parsePad2_(v.getMinutes()) + ':' + parsePad2_(v.getSeconds());
  }
  if (typeof v === 'number') {
    if (isNaN(v)) return 'nan';
    if (v === Infinity) return 'inf';
    if (v === -Infinity) return '-inf';
  }
  return String(v);
}

/** Python float(s) on an already-cleaned string; null when Python would raise. */
function parsePyFloat_(s) {
  s = String(s).trim();
  if (/^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/.test(s)) return Number(s.replace(/_/g, ''));
  if (/^[+-]?(?:inf|infinity)$/i.test(s)) return s.charAt(0) === '-' ? -Infinity : Infinity;
  if (/^[+-]?nan$/i.test(s)) return NaN;
  return null;
}

/** ingest._num: '1,234.5' -> 1234.5; '', '--', 'nan', 'None', junk -> 0. */
function parseNum_(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var s = parseStr_(v).replace(/,/g, '').replace(/%/g, '').trim();
  if (s === '' || s === '--' || s === 'nan' || s === 'None') return 0;
  var f = parsePyFloat_(s);
  return f === null || isNaN(f) ? 0 : f;
}

/** ingest._pct: '35.64%' -> 35.64; '< 10%', '> 90%', '--', '' -> null. */
function parsePct_(v) {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = parseStr_(v).replace(/,/g, '').replace(/%/g, '').trim();
  if (!s || s.charAt(0) === '<' || s.charAt(0) === '>' || s === '--' || s === 'nan') return null;
  var f = parsePyFloat_(s);
  return f === null || isNaN(f) ? null : f;
}

/** Python str.title(). */
function parseTitleCase_(s) {
  var out = '', prevCased = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i), lo = ch.toLowerCase(), up = ch.toUpperCase();
    var cased = lo !== up;
    out += cased ? (prevCased ? lo : up) : ch;
    prevCased = cased;
  }
  return out;
}

/** First n code points of s (Python slicing). */
function parseCut_(s, n) {
  var cps = Array.from(s);
  return cps.length <= n ? s : cps.slice(0, n).join('');
}

function parseIsoDate_(y, mo, d) {
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1) return null;
  var ys = String(y);
  while (ys.length < 4) ys = '0' + ys;
  return ys + '-' + parsePad2_(mo) + '-' + parsePad2_(d);
}

/** ingest._date_from_text: '4 November 2026 - 4 November 2026' -> '2026-11-04' (the first date found), else null. */
function parseDateText_(s) {
  var m = /(\d{1,2})[\p{L}\p{N}_]*\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/u.exec(String(s));
  if (m && Object.prototype.hasOwnProperty.call(PARSE_MONTHS_, m[2].toLowerCase())) {
    return parseIsoDate_(+m[3], PARSE_MONTHS_[m[2].toLowerCase()], +m[1]);
  }
  return null;
}

/** ingest._period: 'a - b' -> [start, end] ('' when a side has no date). */
function parsePeriod_(line) {
  var parts = String(line).split(' - ');
  var a = parseDateText_(parts[0]), b = parseDateText_(parts[parts.length - 1]);
  return [a || '', b || ''];
}

/* ---------- delimited text ---------- */

/**
 * Parse delimited text like Python's csv.reader (default dialect, non-strict): quoted fields, doubled quotes,
 * separators and newlines inside quotes, CRLF / LF / CR line ends. A blank line gives an empty row [].
 */
function parseDelimited_(text, sep) {
  text = String(text === null || text === undefined ? '' : text);
  sep = sep || ',';
  var rows = [], fields = [], field = '';
  // 0 start of record, 1 start of field, 2 in field, 3 in quoted field, 4 quote in quoted field
  var state = 0, n = text.length;
  function endRecord(i) {
    rows.push(fields);
    fields = [];
    field = '';
    state = 0;
    return text.charAt(i) === '\r' && text.charAt(i + 1) === '\n' ? i + 1 : i;
  }
  for (var i = 0; i < n; i++) {
    var c = text.charAt(i);
    var nl = c === '\n' || c === '\r';
    switch (state) {
      case 0:
        if (nl) { i = endRecord(i); break; }
        state = 1;
        // falls through
      case 1:
        if (c === '"') state = 3;
        else if (c === sep) { fields.push(''); }
        else if (nl) { fields.push(''); i = endRecord(i); }
        else { field = c; state = 2; }
        break;
      case 2:
        if (c === sep) { fields.push(field); field = ''; state = 1; }
        else if (nl) { fields.push(field); i = endRecord(i); }
        else field += c;
        break;
      case 3:
        if (c === '"') state = 4;
        else field += c;
        break;
      case 4:
        if (c === '"') { field += '"'; state = 3; }
        else if (c === sep) { fields.push(field); field = ''; state = 1; }
        else if (nl) { fields.push(field); i = endRecord(i); }
        else { field += c; state = 2; }
        break;
    }
  }
  if (state !== 0) {
    fields.push(field);
    rows.push(fields);
  }
  return rows;
}

/** Rows (arrays) -> objects keyed by the header row; short rows padded with ''. */
function parseRowsToObjects_(rows) {
  if (!rows.length) return [];
  var head = rows[0], out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i], o = {};
    for (var j = head.length - 1; j >= 0; j--) o[head[j]] = j < r.length ? r[j] : '';
    out.push(o);
  }
  return out;
}

/** ingest._table: {period: line 2, head: column names, rows: objects}, or null when no header line is found. */
function parseTable_(text, headerStarts) {
  var lines = parseSplitLines_(parseStripBom_(text));
  var hi = -1;
  for (var i = 0; i < Math.min(6, lines.length); i++) {
    if (lines[i].indexOf(headerStarts) === 0) { hi = i; break; }
  }
  if (hi < 0) return null;
  var sep = lines[hi].indexOf('\t') >= 0 ? '\t' : ',';
  var body = lines.slice(hi).filter(function (l) { return l.trim() !== ''; });
  var rows = parseDelimited_(body.join('\n'), sep);
  return { period: lines.length > 1 ? lines[1] : '', head: rows[0] || [], rows: parseRowsToObjects_(rows) };
}

/** df.get(name, dflt) for one row. */
function parseCol_(row, head, name, dflt) {
  return head.indexOf(name) >= 0 ? row[name] : dflt;
}

/* ---------- detection ---------- */

/** ingest.detect for CSV text. */
function detectKind(text) {
  var head = parseStripBom_(text).slice(0, 400).replace(/^\ufeff+/, '');
  if (head.indexOf('Change history report') === 0 || head.indexOf('Date & time') >= 0) return 'changes';
  if (head.indexOf('Campaign report') === 0 && head.indexOf('\nDay') >= 0) return 'campaign_days';
  if (head.indexOf('Search keyword report') === 0) return 'keywords';
  if (head.indexOf('Auction insights report') === 0) return 'auction';
  if (head.indexOf('Search term') >= 0) return 'search_terms';
  return 'unknown';
}

/* ---------- one parser per export ---------- */

/** ingest.read_search_terms. */
function parseSearchTerms(text) {
  var lines = parseSplitLines_(parseStripBom_(text));
  var day = (lines.length > 1 ? parseDateText_(lines[1]) : null) || '';
  var hi = -1;
  for (var i = 0; i < Math.min(6, lines.length); i++) {
    if (/^(Day[\t,])?Search term[\t,]/.test(lines[i])) { hi = i; break; }
  }
  if (hi < 0) return [];
  var sep = lines[hi].indexOf('\t') >= 0 ? '\t' : ',';
  // total lines start with 'Total', or with an empty Day cell then 'Total' when the report is segmented by day
  var body = lines.slice(hi).filter(function (l) { return l.trim() !== '' && l.replace(/^[	,]+/, '').indexOf('Total') !== 0; });
  var rows = parseDelimited_(body.join('\n'), sep);
  var head = rows[0] || [];
  return parseRowsToObjects_(rows).map(function (r) {
    // with Segment > Time > Day the report has a Day column, so one file can hold several days
    var dcol = String(parseCol_(r, head, 'Day', ''));
    var rowDay = /^\d{4}-\d{2}-\d{2}/.test(dcol) ? dcol.slice(0, 10) : (parseDateText_(dcol) || day);
    return {
      day: rowDay,
      term: String(parseCol_(r, head, 'Search term', '')).trim().toLowerCase(),
      match_type: parseCol_(r, head, 'Match type', ''),
      ads_status: parseCol_(r, head, 'Added/Excluded', ''),
      campaign: parseCol_(r, head, 'Campaign', ''),
      ad_group: parseCol_(r, head, 'Ad group', ''),
      keyword: String(parseCol_(r, head, 'Keyword', '')).replace(/^"+|"+$/g, '').split('""').join('"'),
      clicks: parseNum_(parseCol_(r, head, 'Clicks', '0')),
      impr: parseNum_(parseCol_(r, head, 'Impr.', '0')),
      cost: parseNum_(parseCol_(r, head, 'Cost', '0')),
      conv: parseNum_(parseCol_(r, head, 'Conversions', '0'))
    };
  }).filter(function (x) { return !(/^total:/.test(x.term) && !x.campaign); }); // a day-segmented report repeats Google's totals for each day
}

/** '5 Nov 2026, 18:30:12' -> '2026-11-05T18:30:12', null if it does not parse. */
function parseChangeTs_(s) {
  var m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(String(s));
  if (!m || !Object.prototype.hasOwnProperty.call(PARSE_MONTHS_, m[2].toLowerCase())) return null;
  var day = parseIsoDate_(+m[3], PARSE_MONTHS_[m[2].toLowerCase()], +m[1]);
  var hh = +m[4], mi = +m[5], ss = +m[6];
  if (!day || hh > 23 || mi > 59 || ss > 61) return null;
  return day + 'T' + parsePad2_(hh) + ':' + parsePad2_(mi) + ':' + parsePad2_(ss);
}

/** ingest.read_changes: one row per changed item, under the change type it sits under. */
function parseChanges(text) {
  text = parseStripBom_(text);
  var starts = parseLineStarts_(text), pos = -1;
  for (var i = 0; i < Math.min(6, starts.length); i++) {
    if (text.indexOf('Date & time', starts[i]) === starts[i]) { pos = starts[i]; break; }
  }
  if (pos < 0) return [];
  var rows = parseDelimited_(text.slice(pos), '\t');
  var head = rows[0], items = [];
  function at(r, name) {
    var j = head.indexOf(name);
    return j >= 0 && j < r.length ? r[j] : '';
  }
  for (var k = 1; k < rows.length; k++) {
    var r = rows[k];
    if (r.length < 5) continue;
    var ts = parseChangeTs_(at(r, 'Date & time'));
    if (!ts) continue;
    var parts = at(r, 'Changes').split('\n');
    var kind = parts[0].trim().replace(/^\d+\s+/, '');
    var body = parts.slice(1).map(function (p) { return p.trim(); }).filter(function (p) { return p; });
    var base = { ts: ts, day: ts.slice(0, 10), user: at(r, 'User'), campaign: at(r, 'Campaign'), ad_group: at(r, 'Ad group') };
    if (kind.indexOf('keyword') < 0) {
      items.push({ ts: base.ts, day: base.day, user: base.user, campaign: base.campaign, ad_group: base.ad_group, kind: kind,
        item: parseCut_(body.join(' | '), 500) });
      continue;
    }
    for (var b = 0; b < body.length; b++) {
      var sub = /^\d+\s+([^\n]*keyword[^\n]*)$/.exec(body[b]);
      if (sub) { kind = sub[1]; continue; }
      items.push({ ts: base.ts, day: base.day, user: base.user, campaign: base.campaign, ad_group: base.ad_group, kind: kind, item: body[b] });
    }
  }
  return items;
}

/** ingest.read_campaign_days: one row per campaign per day. */
function parseCampaignDays(text) {
  var t = parseTable_(text, 'Day');
  if (!t) return [];
  var h = t.head;
  return t.rows.filter(function (r) {
    return /^\d{4}-\d{2}-\d{2}/.test(String(parseCol_(r, h, 'Day', ''))) &&
      String(parseCol_(r, h, 'Campaign status', '')).indexOf('Total') !== 0;
  }).map(function (r) {
    return {
      day: r['Day'], campaign: parseCol_(r, h, 'Campaign', ''), campaign_id: parseCol_(r, h, 'Campaign ID', ''),
      campaign_status: parseCol_(r, h, 'Campaign status', ''), status: parseCol_(r, h, 'Status', ''),
      status_reasons: parseCol_(r, h, 'Status reasons', ''), bid_strategy: parseCol_(r, h, 'Bid strategy type', ''),
      budget_now: parseNum_(parseCol_(r, h, 'Budget', '0')), target_cpa_now: parseNum_(parseCol_(r, h, 'Target CPA', '')),
      impr: parseNum_(parseCol_(r, h, 'Impr.', '')), clicks: parseNum_(parseCol_(r, h, 'Clicks', '')),
      cost: parseNum_(parseCol_(r, h, 'Cost', '')), conv: parseNum_(parseCol_(r, h, 'Conversions', '')),
      all_conv: parseNum_(parseCol_(r, h, 'All conv.', '0')),
      is_pct: parsePct_(parseCol_(r, h, 'Search impr. share', '')),
      lost_budget_pct: parsePct_(parseCol_(r, h, 'Search lost IS (budget)', '')),
      lost_rank_pct: parsePct_(parseCol_(r, h, 'Search lost IS (rank)', '')),
      top_is_pct: parsePct_(parseCol_(r, h, 'Search top IS', '')),
      abs_top_is_pct: parsePct_(parseCol_(r, h, 'Search abs. top IS', ''))
    };
  });
}

/** pd.to_numeric(errors='coerce') on a stripped string: number or null. */
function parseToNumeric_(s) {
  s = String(s).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null;
  return Number(s);
}

/** ingest.read_keywords: the keyword snapshot for the report period, plus the 'Total: AI Max ...' rows. */
function parseKeywords(text) {
  var t = parseTable_(text, 'Keyword status');
  if (!t) return [];
  var h = t.head, p = parsePeriod_(t.period), a = p[0], b = p[1];
  var out = [], extra = [];
  function g(r, name, dflt) { return parseCol_(r, h, name, dflt === undefined ? '' : dflt); }
  function dashBlank(s) { s = String(s).trim(); return s === '--' ? '' : s; }
  t.rows.forEach(function (r) {
    var ks = String(g(r, 'Keyword status'));
    if (ks === 'Enabled' || ks === 'Paused') {
      out.push({
        period_start: a, day: b, keyword_status: ks, keyword: g(r, 'Keyword'),
        match_type: String(g(r, 'Match type')).split(' match').join(''), campaign: g(r, 'Campaign'), ad_group: g(r, 'Ad group'),
        status: g(r, 'Status'), status_reasons: g(r, 'Status reasons'),
        cost: parseNum_(g(r, 'Cost')), clicks: parseNum_(g(r, 'Clicks')), impr: parseNum_(g(r, 'Impr.')), conv: parseNum_(g(r, 'Conversions')),
        quality_score: parseToNumeric_(g(r, 'Quality Score')),
        ad_relevance: dashBlank(g(r, 'Ad relevance')), landing_page: dashBlank(g(r, 'Landing page exp.')),
        is_pct: parsePct_(g(r, 'Search impr. share')), lost_rank_pct: parsePct_(g(r, 'Search lost IS (rank)'))
      });
    } else if (ks.indexOf('Total') === 0 && ks.indexOf('AI Max') >= 0) {
      extra.push({
        period_start: a, day: b, keyword_status: 'Total', keyword: ks.split('Total: ').join(''), match_type: '', campaign: '(all)',
        ad_group: '', status: '', status_reasons: '',
        cost: parseNum_(g(r, 'Cost')), clicks: parseNum_(g(r, 'Clicks')), impr: parseNum_(g(r, 'Impr.')), conv: parseNum_(g(r, 'Conversions')),
        quality_score: null, ad_relevance: '', landing_page: '', is_pct: null, lost_rank_pct: null
      });
    }
  });
  return out.concat(extra);
}

/** ingest.read_auction: one row per competitor domain for the report period. */
function parseAuction(text) {
  var t = parseTable_(text, 'Display URL domain');
  if (!t) return [];
  var h = t.head, p = parsePeriod_(t.period);
  return t.rows.map(function (r) {
    var raw = parseCol_(r, h, 'Impression share', '');
    return {
      period_start: p[0], day: p[1], domain: parseCol_(r, h, 'Display URL domain', ''),
      impression_share: parsePct_(raw), impression_share_raw: raw,
      overlap_rate: parsePct_(parseCol_(r, h, 'Overlap rate', '')),
      position_above_rate: parsePct_(parseCol_(r, h, 'Position above rate', '')),
      top_of_page_rate: parsePct_(parseCol_(r, h, 'Top of page rate', '')),
      abs_top_rate: parsePct_(parseCol_(r, h, 'Abs. Top of page rate', '')),
      outranking_share: parsePct_(parseCol_(r, h, 'Outranking share', ''))
    };
  });
}

/** Detect the export kind and parse it: {kind, rows}. */
function parseExport(text) {
  var kind = detectKind(text);
  var fn = {
    search_terms: parseSearchTerms, changes: parseChanges, campaign_days: parseCampaignDays, keywords: parseKeywords,
    auction: parseAuction
  }[kind];
  return { kind: kind, rows: fn ? fn(text) : [] };
}

/* ---------- agency STR sheet ---------- */

/** ingest._tab_date: the 'D Month YYYY - ...' header in the first 3 rows beats the tab title. */
function parseTabDate_(title, values) {
  for (var i = 0; i < Math.min(3, values.length); i++) {
    var row = values[i];
    if (row && row.length && parseTruthy_(row[0]) && /\d{4} - /.test(parseStr_(row[0]))) {
      var d = parseDateText_(parseStr_(row[0]));
      if (d) return d;
    }
  }
  var m = /^\s*(\d{1,2})[\p{L}\p{N}_]*\s+([A-Za-z]{3})/u.exec(String(title));
  if (m && Object.prototype.hasOwnProperty.call(PARSE_MONTHS_, m[2].toLowerCase())) {
    var y = /(?:^|\D)((?:19|20)\d{2})(?!\d)/.exec(String(title));
    return parseIsoDate_(y ? +y[1] : 2026, PARSE_MONTHS_[m[2].toLowerCase()], +m[1]);
  }
  return null;
}

/**
 * ingest.read_sheet(kind='roi_sheet') for one tab: values is a 2-D array as Range.getValues() returns it.
 * Returns agency_calls rows ([] when the tab has no date or no 'Match type' header row).
 */
function parseAgencyTab(title, values) {
  values = values || [];
  var day = parseTabDate_(title, values);
  if (!day) return [];
  var hi = -1;
  for (var i = 0; i < Math.min(10, values.length); i++) {
    var row = values[i] || [];
    for (var j = 0; j < row.length; j++) {
      var v = row[j];
      if ((parseTruthy_(v) ? parseStr_(v) : '').trim().toLowerCase() === 'match type') { hi = i; break; }
    }
    if (hi >= 0) break;
  }
  if (hi < 0) return [];
  var H = Object.create(null), hr = values[hi];
  for (var c = 0; c < hr.length; c++) if (parseTruthy_(hr[c])) H[parseStr_(hr[c]).trim().toLowerCase()] = c;

  function g(r) {
    for (var k = 1; k < arguments.length; k++) {
      var key = arguments[k];
      if (key in H && H[key] < r.length) return r[H[key]];
    }
    return null;
  }
  function s(v) { return parseTruthy_(v) ? parseStr_(v) : ''; }

  var out = [];
  for (var ri = hi + 1; ri < values.length; ri++) {
    var r = values[ri] || [];
    var term = r.length ? r[0] : null;
    if (!parseTruthy_(term) || parseStr_(term).toLowerCase().indexOf('total') === 0) continue;
    out.push({
      day: day, tab: String(title), term: parseStr_(term).trim().toLowerCase(),
      match_type: s(g(r, 'match type')), ads_status: s(g(r, 'added/excluded')), campaign: s(g(r, 'campaign')),
      ad_group: s(g(r, 'ad group')), keyword: s(g(r, 'keywords', 'keyword')),
      clicks: parseNum_(g(r, 'clicks')), impr: parseNum_(g(r, 'impr.')), cost: parseNum_(g(r, 'cost')), conv: parseNum_(g(r, 'conversions')),
      decision: parseTitleCase_(s(g(r, 'status')).trim()), neg_term: s(g(r, 'negative broad')).trim(),
      county_comment: s(g(r, 'county comments', 'county comment')).trim()
    });
  }
  return out;
}
