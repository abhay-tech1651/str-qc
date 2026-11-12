/**
 * The model: the exact JSON the briefing dashboard reads, built from the normalized tables (docs/CONTRACT.md section 2).
 * Pure file (no Apps Script services). It mirrors strqc/model.py build() section by section, with the same names where
 * possible; tests-js/parity.test.js compares the two outputs field by field. Every rule, threshold and sort order comes
 * from model.py: change it there first, then here.
 *
 * Python semantics kept on purpose:
 * - modelSum_ reproduces Python 3.12+ sum() over floats (Neumaier compensated summation). A plain running total can land
 *   one bit away, which flips rnd(x) when a total sits exactly on .5 (costs in paise make that common).
 * - Explicit "+=" loops in model.py stay plain "+=" loops here.
 * - Lists are sorted with sortBy/cmpKeys on the same key tuples; ties keep the input order (both sorts are stable).
 */

var MODEL_VERSION_ = 1;

// Two common words that together name a place: excluding a wrong area is SOP rule 6, not a risky negative.
var MODEL_AREA_PHRASES_ = ['greater noida', 'noida extension', 'new gurgaon', 'new delhi', 'dwarka expressway', 'golf course'];

var MODEL_MONTH_TOKEN_ = /^(jan|feb|mar|apr|april|may|jun|june|jul|july|aug|sep|sept|oct|nov|dec)\d*$/i;
var MODEL_DROP_TOKENS_ = ['roi', 'search', 'searchctm', 'brand', 'non', 'competitor', 'maxconv', 'county', 'pmax', 'p-max'];

/** Python sum() (3.12+): Neumaier compensated summation over fn(row), in order. fn may be omitted for a list of numbers. */
function modelSum_(rows, fn) {
  var f = 0, c = 0;
  for (var i = 0; i < rows.length; i++) {
    var x = fn ? fn(rows[i]) : rows[i];
    var t = f + x;
    if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x;
    else c += (x - t) + f;
    f = t;
  }
  if (c && isFinite(c)) f += c;
  return f;
}

/** Number of rows where fn(row) is truthy (Python sum(1 for x in rows if ...)). */
function modelCount_(rows, fn) {
  var n = 0;
  for (var i = 0; i < rows.length; i++) if (fn(rows[i])) n++;
  return n;
}

/** model.py wavg(): impression-weighted average, skipping rows where Google hid the value; Python sum() semantics. */
function modelWavg_(rows, key) {
  var use = rows.filter(function (x) { return x[key] !== null && x[key] !== undefined && (x.impr || 0) > 0; });
  var tot = modelSum_(use, function (x) { return x.impr; });
  return tot ? rnd(modelSum_(use, function (x) { return x[key] * x.impr; }) / tot, 1) : null;
}

/** Strings sorted by code point (Python sorted() of str). */
function modelSortStr_(xs) {
  return xs.slice().sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
}

/** Python min()/max() over strings with a default for an empty list. */
function modelMinStr_(xs, dflt) {
  if (!xs.length) return dflt;
  var m = xs[0];
  for (var i = 1; i < xs.length; i++) if (xs[i] < m) m = xs[i];
  return m;
}

function modelMaxStr_(xs, dflt) {
  if (!xs.length) return dflt;
  var m = xs[0];
  for (var i = 1; i < xs.length; i++) if (xs[i] > m) m = xs[i];
  return m;
}

/** A tuple key for Set / Map lookups (Python tuples as dict keys). */
function modelKey_() {
  return JSON.stringify(Array.prototype.slice.call(arguments));
}

/** {k: x[k] for k in cols}, plus extra fields. */
function modelPick_(x, cols, extra) {
  var o = {};
  for (var i = 0; i < cols.length; i++) o[cols[i]] = x[cols[i]] === undefined ? null : x[cols[i]];
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
  return o;
}

/** Python str(s), for f-strings: None -> 'None'. */
function modelStr_(s) {
  if (s === null || s === undefined) return 'None';
  if (s === true) return 'True';
  if (s === false) return 'False';
  return String(s);
}

/** 'name@domain' -> 'name' (Python user.split('@')[0]). */
function modelUser_(u) {
  return String(u === null || u === undefined ? '' : u).split('@')[0];
}

/** First word of a change kind (Python kind.split()[0]). */
function modelFirstWord_(s) {
  var w = String(s === null || s === undefined ? '' : s).trim().split(/\s+/);
  return w[0] || '';
}

/** Python dict.get(key, dflt) on a plain object. */
function modelGet_(o, k, dflt) {
  return o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : dflt;
}

/** Python text[:n] (code points, not UTF-16 units). */
function modelSlice_(text, n) {
  var cps = Array.from(text);
  return cps.length <= n ? text : cps.slice(0, n).join('');
}

/** Config-driven facts about campaigns and search terms (model.py class Ctx). */
function modelCtx_(cfg) {
  var C = {};
  C.cfg = cfg;
  C.projects = cfg.projects;
  C.pids = C.projects.map(function (p) { return p.id; });
  C.pmap = {};
  C.projects.forEach(function (p) { C.pmap[p.id] = p; });
  C.brandWords = new Set(cfg.brand_words);
  C.flags = cfg.flags;
  C.riskyWords = new Set(cfg.flags.risky_negative_words);
  C.grace = cfg.grace_days === undefined ? 3 : cfg.grace_days;
  var factsMemo = new Map();
  var flagRes = {};
  ['address', 'budget', 'rent_or_stay', 'jobs_or_other'].forEach(function (k) {
    flagRes[k] = (cfg.flags[k] || []).map(function (p) { return new RegExp(p); });
  });
  var inPmap = function (project) { return Object.prototype.hasOwnProperty.call(C.pmap, project); };

  C.label = function (campaign, project, ctype) {
    var name = inPmap(project) ? String(C.pmap[project].name).split(' County').join('') : 'Other';
    var keep = [];
    var parts = String(campaign || '').split('_');
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i];
      var low = t.toLowerCase();
      if (!t || MODEL_DROP_TOKENS_.indexOf(low) >= 0 || MODEL_MONTH_TOKEN_.test(t) || /^\d+$/.test(t) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(t) ||
          (inPmap(project) && C.pmap[project].match.some(function (m) { return low.indexOf(m) >= 0; }))) {
        continue;
      }
      keep.push(t.toUpperCase() === 'NCR' ? t.toUpperCase() : t.slice(0, 1).toUpperCase() + t.slice(1).toLowerCase());
    }
    return [name, ctype].concat(keep.length ? [keep.join(' ')] : []).join(' · ');
  };

  C.facts = function (campaign) {
    if (factsMemo.has(campaign)) return factsMemo.get(campaign);
    var low = String(campaign || '').toLowerCase();
    var project = 'other';
    for (var i = 0; i < C.projects.length; i++) {
      var p = C.projects[i];
      if (p.match.some(function (m) { return low.indexOf(m) >= 0; })) { project = p.id; break; }
    }
    var runner = 'other';
    var rkeys = Object.keys(cfg.runners);
    for (var j = 0; j < rkeys.length; j++) {
      if (cfg.runners[rkeys[j]].some(function (k) { return low.indexOf(String(k).toLowerCase()) >= 0; })) { runner = rkeys[j]; break; }
    }
    var ctype;
    if (low.indexOf('non_brand') >= 0) ctype = 'Non-brand';
    else if (low.indexOf('competitor') >= 0) ctype = 'Competitor';
    else if (low.indexOf('brand') >= 0) ctype = 'Brand';
    else if (low.indexOf('ctm') >= 0) ctype = 'Google CTM';
    else if (low.indexOf('p-max') >= 0 || low.indexOf('pmax') >= 0) ctype = 'Performance Max';
    else ctype = 'Other';
    var f = { project: project, runner: runner, ctype: ctype, label: C.label(campaign, project, ctype) };
    factsMemo.set(campaign, f);
    return f;
  };

  C.hasBrand = function (term) {
    return tok(term).some(function (w) { return C.brandWords.has(w); });
  };

  C.flagCodes = function (term, ctype) {
    var out = [];
    var s = String(term === null || term === undefined ? '' : term);
    [['address', 'address'], ['budget', 'budget'], ['rent', 'rent_or_stay'], ['not_purchase', 'jobs_or_other']].forEach(function (ck) {
      if (flagRes[ck[1]].some(function (rx) { return rx.test(s); })) out.push(ck[0]);
    });
    if (ctype === 'Brand' && !C.hasBrand(term)) out.push('brand_missing');
    if ((ctype === 'Non-brand' || ctype === 'Competitor') && C.hasBrand(term)) out.push('brand_in_nonbrand');
    return out;
  };
  return C;
}

/** buildModel(T, cfg, asOf) -> {model, review}; equal to strqc/model.py build(T, cfg, as_of). */
function buildModel(T, cfg, asOf) {
  var C = modelCtx_(cfg);
  var F = C.facts;
  var raw = T.search_terms || [], calls = T.agency_calls || [], changes = T.changes || [];
  var cdays = T.campaign_days || [], kwrows = T.keywords || [], auction = T.auction || [];
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var costOf = function (x) { return x.cost; };
  var negCostDayTerm = function (x) { return [-x.cost, x.day, x.term]; };
  var agIn = function (nAg, ag) { return nAg === '' || nAg === ag; };  // Python: n["ad_group"] in ("", ag)
  var kindOf = function (x) { return String(x.kind === null || x.kind === undefined ? '' : x.kind); };
  var isNegAdded = function (x) { var k = kindOf(x); return k.indexOf('negative') === 0 && k.indexOf('added') >= 0; };
  var isNegRemoved = function (x) { var k = kindOf(x); return k.indexOf('negative') === 0 && k.indexOf('removed') >= 0; };
  var isKwAdded = function (x) { var k = kindOf(x); return k.indexOf('match keyword added') >= 0 && k.indexOf('negative') !== 0; };
  var isKwRemoved = function (x) { var k = kindOf(x); return k.indexOf('keyword removed') >= 0 && k.indexOf('negative') !== 0; };

  // -- search-term rows: Google's own report where we have the day, otherwise the agency's copy of it
  var rawDays = uniqSorted(raw.map(function (x) { return x.day; }));
  // per day AND campaign: a report filtered to one campaign must not hide the agency rows of the others
  var have = new Set(raw.map(function (x) { return x.day + '\u0001' + x.campaign; }));
  var stCols = ['day', 'term', 'match_type', 'ads_status', 'campaign', 'ad_group', 'keyword', 'clicks', 'impr', 'cost', 'conv'];
  var st = raw.map(function (x) { return modelPick_(x, stCols, { source: 'Google Ads report' }); });
  calls.forEach(function (x) { if (!have.has(x.day + '\u0001' + x.campaign)) st.push(modelPick_(x, stCols, { source: 'agency sheet' })); });
  st.forEach(function (x) { var f = F(x.campaign); x.project = f.project; x.runner = f.runner; x.ctype = f.ctype; });
  var stKey = function (x) { return [x.day, x.campaign, x.ad_group, x.term, x.match_type]; };
  st = sortBy(st, stKey);
  calls = sortBy(calls, stKey);

  // -- changes split into negatives added and keywords added, oldest first
  var chs = sortBy(changes, function (x) { return [x.ts, x.campaign, x.ad_group, x.kind, x.item]; });
  var negs = [];
  chs.forEach(function (x) {
    if (isNegAdded(x)) {
      var mw = parseNegative(x.item);
      negs.push(Object.assign({}, x, { nmatch: mw[0], nwords: mw[1], level: x.ad_group ? 'ad group' : 'campaign' }));
    }
  });
  var kws = chs.filter(isKwAdded).map(function (x) {
    return Object.assign({}, x, { kw: tok(x.item).join(' '), kmatch: modelFirstWord_(x.kind) });
  });
  var lastChange = modelMaxStr_(changes.map(function (x) { return x.day; }), '');
  var firstChange = modelMinStr_(changes.map(function (x) { return x.day; }), '');
  // Does the loaded change history reach back to the day before this sheet day? If not, a missing negative proves nothing.
  var covered = function (day) { return !!firstChange && addDays(day, -1) >= firstChange; };
  var byCamp = new Map();
  negs.forEach(function (n) {
    if (!byCamp.has(n.campaign)) byCamp.set(n.campaign, []);
    byCamp.get(n.campaign).push(n);
  });
  var negsFor = function (camp) { return byCamp.has(camp) ? byCamp.get(camp) : []; };

  // ======================================================= 1. agency said vs done
  var exRows = [];
  calls.forEach(function (c) {
    if (c.decision !== 'Exclude') return;
    var start = addDays(c.day, -1), q = tok(c.term);
    var hit = null, other = null;
    var ns = negsFor(c.campaign);
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i];
      if (n.day < start || !blocks(n.nmatch, n.nwords, q)) continue;
      if (agIn(n.ad_group, c.ad_group)) { hit = n; break; }
      other = other || n;
    }
    var age = lastChange ? daysBetween(c.day, lastChange) : null;
    var status, when, how;
    if (hit) { status = 'applied'; when = hit.day; how = hit.item; }
    else if (other) { status = 'applied_elsewhere'; when = other.day; how = other.item; }
    else if (!covered(c.day)) { status = 'unchecked'; when = ''; how = ''; }
    else { status = age !== null && age <= C.grace ? 'waiting' : 'overdue'; when = ''; how = ''; }
    exRows.push({ day: c.day, term: c.term, project: F(c.campaign).project, campaign: c.campaign, ad_group: c.ad_group, cost: c.cost,
      clicks: c.clicks, neg_term: c.neg_term, county_comment: c.county_comment, status: status, applied_on: when, applied_as: how,
      days_late: when ? daysBetween(c.day, when) : null });
  });

  var addRows = [];
  calls.forEach(function (c) {
    if (c.decision !== 'Add') return;
    var t = tok(c.term).join(' '), start = addDays(c.day, -1);
    var k = kws.filter(function (x) { return x.kw === t && x.day >= start; });
    var same = k.filter(function (x) { return x.campaign === c.campaign; });
    var age = lastChange ? daysBetween(c.day, lastChange) : null;
    var status, where, when;
    if (c.ads_status === 'Added') { status = 'already'; where = ''; when = ''; }
    else if (same.length) { status = 'added'; where = same[0].ad_group; when = same[0].day; }
    else if (k.length) { status = 'added_elsewhere'; where = k[0].campaign; when = k[0].day; }
    else if (!covered(c.day)) { status = 'unchecked'; where = ''; when = ''; }
    else { status = age !== null && age <= C.grace ? 'waiting' : 'overdue'; where = ''; when = ''; }
    addRows.push({ day: c.day, term: c.term, project: F(c.campaign).project, campaign: c.campaign, ad_group: c.ad_group, cost: c.cost,
      clicks: c.clicks, conv: c.conv, status: status, added_to: where, added_on: when });
  });

  var count = function (rows, status) { return modelCount_(rows, function (x) { return x.status === status; }); };

  var judged = exRows.filter(function (x) { return x.status !== 'waiting' && x.status !== 'unchecked'; });
  var done = judged.filter(function (x) { return x.status === 'applied' || x.status === 'applied_elsewhere'; });
  var overdue = exRows.filter(function (x) { return x.status === 'overdue'; });
  var lags = exRows.filter(function (x) { return x.days_late !== null; }).map(function (x) { return x.days_late; });
  var lagBins = new Map();
  lags.forEach(function (v) {
    var b = Math.max(0, Math.min(10, v));
    lagBins.set(b, (lagBins.has(b) ? lagBins.get(b) : 0) + 1);
  });
  var byDay = new Map();
  exRows.forEach(function (x) {
    if (!byDay.has(x.day)) byDay.set(x.day, { day: x.day, applied: 0, applied_elsewhere: 0, waiting: 0, overdue: 0, unchecked: 0 });
    byDay.get(x.day)[x.status] += 1;
  });
  var noNeg = exRows.filter(function (x) { return !x.neg_term; });
  var agByProject = {};
  C.pids.forEach(function (pid) {
    var e = exRows.filter(function (x) { return x.project === pid; });
    var j = e.filter(function (x) { return x.status !== 'waiting' && x.status !== 'unchecked'; });
    var o = e.filter(function (x) { return x.status === 'overdue'; });
    var a = addRows.filter(function (x) { return x.project === pid; });
    agByProject[pid] = { excludes: e.length, judged: j.length,
      applied_pct: j.length ? rnd(100 * modelCount_(j, function (x) { return x.status !== 'overdue'; }) / j.length, 1) : null,
      overdue: o.length, overdue_cost: rnd(modelSum_(o, costOf), 2),
      adds: a.length, adds_overdue: count(a, 'overdue') };
  });
  var rowCols = ['day', 'term', 'project', 'campaign', 'ad_group', 'cost', 'neg_term', 'county_comment', 'status'];
  var agency = {
    grace_days: C.grace, last_change_day: lastChange, changes_from: firstChange,
    excludes: { total: exRows.length, applied: count(exRows, 'applied'), applied_elsewhere: count(exRows, 'applied_elsewhere'),
      waiting: count(exRows, 'waiting'), unchecked: count(exRows, 'unchecked'), overdue: overdue.length, overdue_cost: rnd(modelSum_(overdue, costOf), 2),
      judged: judged.length, applied_pct: judged.length ? rnd(100 * done.length / judged.length, 1) : null,
      median_lag: median(lags) },
    adds: { total: addRows.length, added: count(addRows, 'added'), added_elsewhere: count(addRows, 'added_elsewhere'),
      already: count(addRows, 'already'), waiting: count(addRows, 'waiting'), unchecked: count(addRows, 'unchecked'), overdue: count(addRows, 'overdue') },
    no_negative: { rows: noNeg.length, cost: rnd(modelSum_(noNeg, costOf), 2),
      open: modelCount_(noNeg, function (x) { return x.status === 'waiting' || x.status === 'overdue'; }) },
    by_day: modelSortStr_(Array.from(byDay.keys())).map(function (d) { return byDay.get(d); }),
    lag: Array.from(lagBins.keys()).sort(function (a, b) { return a - b; }).map(function (b) {
      return { days: b === 10 ? '10+' : String(b), count: lagBins.get(b) };
    }),
    by_project: agByProject,
    overdue_excludes: sortBy(overdue.map(function (x) { return modelPick_(x, rowCols); }), negCostDayTerm),
    overdue_adds: sortBy(addRows.filter(function (x) { return x.status === 'overdue'; }).map(function (x) {
      return modelPick_(x, ['day', 'term', 'project', 'campaign', 'ad_group', 'cost', 'clicks', 'conv']);
    }), negCostDayTerm),
    no_negative_rows: sortBy(noNeg.map(function (x) { return modelPick_(x, rowCols); }), negCostDayTerm)
  };

  // ======================================================= 2. account risks
  // 2a. our keywords switched off by our own negatives
  var K = [], seen = new Set();
  var cand = kws.map(function (x) { return [x.campaign, x.ad_group, x.item]; }).concat(
    st.filter(function (x) { return x.keyword !== '' && x.keyword !== '-'; }).map(function (x) { return [x.campaign, x.ad_group, x.keyword]; }));
  cand.forEach(function (ct) {
    var camp = ct[0], ag = ct[1], text = ct[2];
    if (/Headline|Asset ID|Path /.test(text || '')) return;
    var kwn = tok(text).join(' ');
    var key = modelKey_(camp, ag, kwn);
    if (!kwn || seen.has(key)) return;
    seen.add(key);
    K.push({ campaign: camp, ad_group: ag, kwn: kwn, toks: kwn.split(' ') });
  });
  var blocked = [];
  K.forEach(function (k) {
    negsFor(k.campaign).forEach(function (n) {
      if (agIn(n.ad_group, k.ad_group) && blocks(n.nmatch, n.nwords, k.toks)) {
        blocked.push({ project: F(k.campaign).project, campaign: k.campaign, ad_group: k.ad_group, keyword: k.kwn,
          blocked_by: n.item, level: n.level, added: n.day, added_by: modelUser_(n.user) });
      }
    });
  });
  blocked = sortBy(blocked, function (x) { return [x.project, x.campaign, x.ad_group, x.keyword, x.blocked_by]; });

  // 2b. campaign-wide negatives that are risky as written (SOP section 7)
  var noVp = new Set(C.projects.filter(function (p) { return p.villas_or_penthouses === 'no'; }).map(function (p) { return p.id; }));
  var vpWords = ['villa', 'villas', 'penthouse', 'penthouses', 'pent', 'house'];
  var risky = [];
  seen = new Set();
  negs.forEach(function (n) {
    var key = modelKey_(n.campaign, n.ad_group, n.item);
    if (n.level !== 'campaign' || n.nmatch === 'exact' || n.nwords.length > 2 || seen.has(key)) return;
    seen.add(key);
    var w = n.nwords, proj = F(n.campaign).project;
    var why = '';
    if (noVp.has(proj) && !(w.length === 1 && w[0] === 'house') && w.every(function (x) { return vpWords.indexOf(x) >= 0; })) {
      why = '';  // this project sells no villas or penthouses, so blocking them campaign-wide is right
    } else if (w.length === 1 && /^[0-9]+$/.test(w[0])) {
      why = 'bare_number';
    } else if (w.length === 1 && C.riskyWords.has(w[0])) {
      why = 'common_word';
    } else if (w.length === 2 && w.every(function (x) { return C.riskyWords.has(x); }) && MODEL_AREA_PHRASES_.indexOf(w.join(' ')) < 0) {
      why = 'common_pair';
    }
    if (why) {
      risky.push({ project: proj, campaign: n.campaign, ad_group: n.ad_group, item: n.item, level: n.level,
        added: n.day, added_by: modelUser_(n.user), why: why });
    }
  });
  risky = sortBy(risky, function (x) { return [x.project, x.campaign, x.added, x.item]; });

  // 2c. the sheet contradicts itself: a negative it asks for would block a search it says to Add
  var addsByCamp = new Map();
  calls.forEach(function (c) {
    if (c.decision === 'Add') {
      if (!addsByCamp.has(c.campaign)) addsByCamp.set(c.campaign, []);
      addsByCamp.get(c.campaign).push(c.term);
    }
  });
  var conflicts = [];
  seen = new Set();
  calls.forEach(function (c) {
    var key = modelKey_(c.campaign, c.neg_term);
    if (c.decision !== 'Exclude' || !c.neg_term || seen.has(key)) return;
    seen.add(key);
    if (!addsByCamp.has(c.campaign)) return;
    var mw = parseNegative(c.neg_term);
    var hit = uniqSorted(addsByCamp.get(c.campaign).filter(function (t) { return blocks(mw[0], mw[1], tok(t)); }));
    if (hit.length) {
      conflicts.push({ day: c.day, project: F(c.campaign).project, campaign: c.campaign, negative: c.neg_term,
        written_for: c.term, would_block: hit.length, example: hit[0] });
    }
  });
  conflicts = sortBy(conflicts, function (x) { return [x.project, x.campaign, x.day, x.negative]; });

  // 2d. a search kept getting clicks after a negative that should block it went in
  var leaks = [];
  seen = new Set();
  var stByCamp = new Map();
  st.forEach(function (x) {
    if (!stByCamp.has(x.campaign)) stByCamp.set(x.campaign, []);
    stByCamp.get(x.campaign).push(x);
  });
  negs.forEach(function (n) {
    var key = modelKey_(n.campaign, n.ad_group, n.item);
    if (seen.has(key)) return;
    seen.add(key);
    var hits = (stByCamp.has(n.campaign) ? stByCamp.get(n.campaign) : []).filter(function (x) {
      return x.day > n.day && agIn(n.ad_group, x.ad_group) && blocks(n.nmatch, n.nwords, tok(x.term));
    });
    if (hits.length) {
      var top = sortBy(hits, function (x) { return [-x.cost, x.term]; })[0];
      leaks.push({ project: F(n.campaign).project, campaign: n.campaign, negative: n.item, level: n.level,
        ad_group: n.ad_group, added: n.day, later_rows: hits.length,
        later_cost: rnd(modelSum_(hits, costOf), 2), example: top.term,
        last_seen: modelMaxStr_(hits.map(function (x) { return x.day; }), null) });
    }
  });
  leaks = sortBy(leaks, function (x) { return [-x.later_cost, x.campaign, x.negative]; });

  // 2e. brand guard, both directions
  var bcols = ['day', 'term', 'project', 'campaign', 'ad_group', 'keyword', 'match_type', 'clicks', 'cost'];
  var brandNoWord = sortBy(st.filter(function (x) { return x.ctype === 'Brand' && !C.hasBrand(x.term); })
    .map(function (x) { return modelPick_(x, bcols); }), negCostDayTerm);
  var brandLeak = sortBy(st.filter(function (x) { return (x.ctype === 'Non-brand' || x.ctype === 'Competitor') && C.hasBrand(x.term); })
    .map(function (x) { return modelPick_(x, bcols); }), negCostDayTerm);

  // 2f. junk excluded in one campaign, then paid for in another (negatives work per campaign)
  var firstEx = new Map();
  calls.forEach(function (c) {
    if (c.decision === 'Exclude') {
      if (!firstEx.has(c.term)) firstEx.set(c.term, { day: c.day, camps: new Set() });
      var f = firstEx.get(c.term);
      f.day = f.day <= c.day ? f.day : c.day;
      f.camps.add(c.campaign);
    }
  });
  var repeats = [];
  st.forEach(function (x) {
    var f = firstEx.has(x.term) ? firstEx.get(x.term) : null;
    if (f && x.day > f.day && !f.camps.has(x.campaign)) {
      repeats.push({ day: x.day, term: x.term, project: x.project, campaign: x.campaign, cost: x.cost,
        first_excluded: f.day, excluded_in: uniqSorted(Array.from(f.camps)) });
    }
  });
  repeats = sortBy(repeats, negCostDayTerm);

  var projSum = function (rows, pid, key) {
    key = key || 'cost';
    return rnd(modelSum_(rows.filter(function (x) { return x.project === pid; }), function (x) { return x[key]; }), 2);
  };
  var ofProject = function (pid) { return function (x) { return x.project === pid; }; };

  var risksByProject = {};
  C.pids.forEach(function (pid) {
    var bk = new Set(blocked.filter(ofProject(pid)).map(function (x) { return modelKey_(x.campaign, x.ad_group, x.keyword); }));
    risksByProject[pid] = { brand_no_word_cost: projSum(brandNoWord, pid), brand_no_word_rows: modelCount_(brandNoWord, ofProject(pid)),
      brand_leak_cost: projSum(brandLeak, pid), brand_leak_rows: modelCount_(brandLeak, ofProject(pid)),
      blocked_keywords: bk.size,
      risky: modelCount_(risky, ofProject(pid)), conflicts: modelCount_(conflicts, ofProject(pid)),
      repeats_cost: projSum(repeats, pid) };
  });
  var risks = { brand_no_word: brandNoWord, brand_leak: brandLeak, blocked: blocked, risky: risky, conflicts: conflicts, leaks: leaks,
    repeats: repeats, by_project: risksByProject };

  // ======================================================= 3. daily review rows (every search-term day)
  var callKey = new Map();
  calls.forEach(function (c) {
    var key = modelKey_(c.day, c.term, c.campaign, c.ad_group, c.match_type);
    if (!callKey.has(key)) callKey.set(key, c);
  });
  var review = [];
  st.forEach(function (x) {
    var key = modelKey_(x.day, x.term, x.campaign, x.ad_group, x.match_type);
    var c = callKey.has(key) ? callKey.get(key) : null;
    review.push({ day: x.day, term: x.term, project: x.project, ctype: x.ctype, campaign: x.campaign,
      ad_group: x.ad_group, keyword: x.keyword, match_type: x.match_type, clicks: x.clicks,
      cost: x.cost, cpc: x.clicks ? rnd(x.cost / x.clicks, 2) : null, conv: x.conv,
      decision: c ? c.decision : '', neg_term: c ? c.neg_term : '',
      county_comment: c ? c.county_comment : '', flags: C.flagCodes(x.term, x.ctype),
      source: x.source });
  });
  review = sortBy(review, function (x) { return [x.day, -x.cost, x.term, x.campaign, x.ad_group]; });
  var stDays = uniqSorted(st.map(function (x) { return x.day; }));
  var latest = null;
  if (stDays.length) {
    var lday = stDays[stDays.length - 1];
    var lrows = review.filter(function (x) { return x.day === lday; });
    var agg = function (rs) { return { rows: rs.length, cost: rnd(modelSum_(rs, costOf), 2) }; };
    var la = agg(lrows);
    var byDecision = {};
    ['Exclude', 'Add', 'Discuss', 'Leave', 'None'].forEach(function (k) {
      byDecision[k] = agg(lrows.filter(function (x) { return (x.decision || 'None') === k; }));
    });
    var latestByProject = {};
    C.pids.forEach(function (pid) {
      latestByProject[pid] = { rows: modelCount_(lrows, ofProject(pid)),
        cost: projSum(lrows, pid),
        exclude_cost: rnd(modelSum_(lrows.filter(function (x) { return x.project === pid && x.decision === 'Exclude'; }), costOf), 2),
        add_cost: rnd(modelSum_(lrows.filter(function (x) { return x.project === pid && x.decision === 'Add'; }), costOf), 2),
        none_cost: rnd(modelSum_(lrows.filter(function (x) { return x.project === pid && !x.decision; }), costOf), 2) };
    });
    latest = { day: lday, source: lrows.length ? lrows[0].source : '', rows: la.rows, cost: la.cost,
      reviewed: modelCount_(lrows, function (x) { return x.decision; }),
      by_decision: byDecision,
      flagged_no_call: agg(lrows.filter(function (x) { return x.flags.length && !x.decision; })),
      by_project: latestByProject };
  }

  var coverage = [];
  rawDays.forEach(function (day) {
    var a = raw.filter(function (x) { return x.day === day; });
    var camps = new Set(a.map(function (x) { return x.campaign; }));
    var b = calls.filter(function (x) { return x.day === day && camps.has(x.campaign); });
    coverage.push({ day: day, campaigns: camps.size, report_rows: a.length, report_cost: rnd(modelSum_(a, costOf), 2), sheet_rows: b.length,
      sheet_cost: rnd(modelSum_(b, costOf), 2), reviewed: modelCount_(b, function (x) { return x.decision; }),
      cost_matches: Math.abs(modelSum_(a, costOf) - modelSum_(b, costOf)) < 1 });
  });

  // ======================================================= 4. campaigns
  var cd = sortBy(cdays, function (x) { return [x.day, x.campaign]; });
  var cdDays = cd.map(function (x) { return x.day; });
  var campLast = modelMaxStr_(cdDays, null);
  var complete = campLast ? modelMinStr_([campLast, addDays(asOf, -1)], null) : null;
  var first = modelMinStr_(cdDays, null);
  var win = { since: [first, complete], last7: complete ? [addDays(complete, -6), complete] : null,
    prev7: complete ? [addDays(complete, -13), addDays(complete, -7)] : null };

  var stats = function (rows) {
    if (!rows.length) return null;
    var days = new Set(rows.map(function (x) { return x.day; })).size;
    var cost = modelSum_(rows, costOf), clicks = modelSum_(rows, function (x) { return x.clicks; });
    var conv = modelSum_(rows, function (x) { return x.conv; }), impr = modelSum_(rows, function (x) { return x.impr; });
    var last = maxBy(rows, function (x) { return x.day; });
    var budget = last.budget_now || 0;
    return { days: days, cost: rnd(cost, 2), clicks: rnd(clicks), impr: rnd(impr), conv: rnd(conv, 2),
      all_conv: rnd(modelSum_(rows, function (x) { return x.all_conv; }), 2), cpa: conv ? rnd(cost / conv) : null,
      cpc: clicks ? rnd(cost / clicks, 2) : null, cost_per_day: rnd(cost / days),
      budget_use: budget ? rnd(100 * cost / days / budget, 1) : null,
      is_pct: modelWavg_(rows, 'is_pct'), lost_budget_pct: modelWavg_(rows, 'lost_budget_pct'),
      lost_rank_pct: modelWavg_(rows, 'lost_rank_pct'), top_is_pct: modelWavg_(rows, 'top_is_pct') };
  };

  var inWin = function (rows, w) {
    return rows.filter(function (x) { return w && w[0] <= x.day && x.day <= w[1]; });
  };

  var verdict = function (ctype, s) {
    if (!s || s.cost <= 0) return 'idle';
    if (s.budget_use !== null && s.budget_use < 30) return 'underspending';
    if ((s.lost_budget_pct || 0) >= 20) return 'budget';
    if ((s.lost_rank_pct || 0) >= 40 || (s.is_pct === null && s.impr > 0)) return 'rank';
    if (ctype === 'Brand' && s.is_pct !== null && s.is_pct < 80) return 'brand_gap';
    return 'ok';
  };

  var campaigns = [];
  uniqSorted(cd.map(function (x) { return x.campaign; })).forEach(function (name) {
    var rows = cd.filter(function (x) { return x.campaign === name; });
    var f = F(name);
    var last = maxBy(rows, function (x) { return x.day; });
    var since = stats(inWin(rows, win.since)), l7 = stats(inWin(rows, win.last7));
    var series = rows.filter(function (x) { return x.day <= complete; }).map(function (x) {
      return { day: x.day, cost: x.cost, impr: x.impr, clicks: x.clicks, conv: x.conv, is_pct: x.is_pct,
        lost_budget_pct: x.lost_budget_pct, lost_rank_pct: x.lost_rank_pct,
        eligible: x.is_pct ? rnd(x.impr / (x.is_pct / 100)) : null };
    });
    campaigns.push({ id: name, label: f.label, project: f.project, runner: f.runner, ctype: f.ctype,
      bid_strategy: last.bid_strategy, status: last.status, status_reasons: last.status_reasons,
      budget_now: last.budget_now, target_cpa_now: last.target_cpa_now || null,
      since: since, last7: l7, prev7: stats(inWin(rows, win.prev7)), verdict: verdict(f.ctype, l7),
      conv_gap: !!(since && since.all_conv >= 20 && since.all_conv > 5 * since.conv),
      series: series });
  });
  var pidIndex = function (pid) { var i = C.pids.indexOf(pid); return i >= 0 ? i : 99; };
  campaigns = sortBy(campaigns, function (c) { return [pidIndex(c.project), -((c.since && c.since.cost) || 0)]; });

  var roll = function (rows) {
    var cost = modelSum_(rows, costOf), conv = modelSum_(rows, function (x) { return x.conv; });
    return { cost: rnd(cost, 2), clicks: rnd(modelSum_(rows, function (x) { return x.clicks; })),
      impr: rnd(modelSum_(rows, function (x) { return x.impr; })),
      conv: rnd(conv, 2), all_conv: rnd(modelSum_(rows, function (x) { return x.all_conv; }), 2), cpa: conv ? rnd(cost / conv) : null };
  };

  var sinceRows = inWin(cd, win.since);
  var periodDays = uniqSorted(sinceRows.map(function (x) { return x.day; }));
  var accSince = roll(sinceRows);
  var account = { since: accSince, last7: roll(inWin(cd, win.last7)), prev7: roll(inWin(cd, win.prev7)), daily: [] };
  periodDays.forEach(function (day) {
    var rows = cd.filter(function (x) { return x.day === day; });
    var bp = {};
    C.pids.forEach(function (pid) {
      bp[pid] = rnd(modelSum_(rows.filter(function (x) { return F(x.campaign).project === pid; }), costOf));
    });
    account.daily.push({ day: day, cost: rnd(modelSum_(rows, costOf)), conv: rnd(modelSum_(rows, function (x) { return x.conv; }), 2),
      by_project: bp });
  });
  var projectStats = {};
  C.pids.forEach(function (pid) {
    var prow = cd.filter(function (x) { return F(x.campaign).project === pid; });
    var s = roll(inWin(prow, win.since));
    projectStats[pid] = { since: s, last7: roll(inWin(prow, win.last7)), prev7: roll(inWin(prow, win.prev7)),
      share_of_spend: accSince.cost ? rnd(100 * s.cost / accSince.cost, 1) : null,
      campaigns: campaigns.filter(function (c) { return c.project === pid; }).map(function (c) { return c.id; }),
      daily: account.daily.map(function (d) { return { day: d.day, cost: d.by_project[pid] }; }) };
  });

  // ======================================================= 5. keywords (Quality Score report)
  var kwAll = kwrows.filter(function (x) { return x.keyword_status !== 'Total'; })
    .map(function (x) { return Object.assign({}, x, { project: F(x.campaign).project }); });
  var ai = kwrows.filter(function (x) { return x.keyword_status === 'Total'; });
  var keywords = null;
  if (kwAll.length) {
    var paid = kwAll.filter(function (x) { return x.cost > 0; });

    var groupCost = function (key) {
      var out = new Map();
      paid.forEach(function (x) {
        var k = x[key] || 'Not rated';
        out.set(k, (out.has(k) ? out.get(k) : 0) + x.cost);
      });
      var res = {};
      modelSortStr_(Array.from(out.keys())).forEach(function (k) { res[k] = rnd(out.get(k)); });
      return res;
    };

    var qs = new Map();
    paid.forEach(function (x) {
      var q = x.quality_score !== null && x.quality_score !== undefined ? Math.trunc(x.quality_score) : 0;
      if (!qs.has(q)) qs.set(q, { label: q === 0 ? 'No score' : String(q), cost: 0, n: 0 });
      var g = qs.get(q);
      g.cost += x.cost;
      g.n += 1;
    });
    var enabled = kwAll.filter(function (x) { return x.keyword_status === 'Enabled'; });
    var kcols = ['keyword', 'match_type', 'project', 'campaign', 'ad_group', 'status', 'cost', 'clicks', 'impr', 'conv', 'quality_score',
      'ad_relevance', 'landing_page'];
    var pick = function (rows) { return rows.map(function (x) { return modelPick_(x, kcols); }); };
    var dup = new Map();
    enabled.forEach(function (x) {
      if (x.impr > 0) {
        var kn = tok(x.keyword).join(' ');
        var dk = modelKey_(x.project, kn);
        if (!dup.has(dk)) dup.set(dk, { p: x.project, k: kn, camps: new Set(), cost: 0, impr: 0 });
        var g = dup.get(dk);
        g.camps.add(x.campaign);
        g.cost += x.cost;
        g.impr += x.impr;
      }
    });
    var duplicates = sortBy(Array.from(dup.values()).filter(function (g) { return g.camps.size > 1; }).map(function (g) {
      return { project: g.p, keyword: g.k, campaigns: uniqSorted(Array.from(g.camps)), cost: rnd(g.cost), impr: rnd(g.impr) };
    }), function (x) { return [-x.cost, x.keyword]; });
    var vp = /\bvillas?\b|\bpent ?houses?\b/i;
    var mism = sortBy(paid.filter(function (x) {
      return noVp.has(x.project) && (vp.test(String(x.keyword)) || vp.test(String(x.ad_group)));
    }), function (x) { return [-x.cost, x.keyword]; });
    var is13 = function (x) { return x.quality_score !== null && x.quality_score !== undefined && 1 <= x.quality_score && x.quality_score <= 3; };
    var lp = groupCost('landing_page');
    var statusCounts = {};
    uniqSorted(enabled.map(function (x) { return x.status || 'Unknown'; })).forEach(function (k) {
      statusCounts[k] = modelCount_(enabled, function (x) { return (x.status || 'Unknown') === k; });
    });
    var kwByProject = {};
    C.pids.forEach(function (pid) {
      kwByProject[pid] = { cost: rnd(modelSum_(paid.filter(ofProject(pid)), costOf)),
        below_lp_cost: rnd(modelSum_(paid.filter(function (x) { return x.project === pid && x.landing_page === 'Below average'; }), costOf)),
        qs13_cost: rnd(modelSum_(paid.filter(function (x) { return x.project === pid && is13(x); }), costOf)),
        keywords: modelCount_(kwAll, ofProject(pid)),
        enabled: modelCount_(enabled, ofProject(pid)),
        not_eligible: modelCount_(enabled, function (x) { return x.project === pid && x.status === 'Not eligible'; }),
        limited: modelCount_(enabled, function (x) { return x.project === pid && x.status === 'Limited'; }) };
    });
    var byCostKw = function (x) { return [-x.cost, x.keyword]; };
    keywords = {
      from: kwAll[0].period_start, to: kwAll[0].day, total_cost: rnd(modelSum_(paid, costOf)),
      below_lp_cost: modelGet_(lp, 'Below average', 0), qs13_cost: rnd(modelSum_(paid.filter(is13), costOf)),
      lp_cost: lp, rel_cost: groupCost('ad_relevance'),
      qs: Array.from(qs.keys()).sort(function (a, b) { return a - b; }).map(function (q) {
        var g = qs.get(q);
        return { label: g.label, cost: rnd(g.cost), n: g.n };
      }),
      status_counts: statusCounts,
      by_project: kwByProject,
      no_conv: pick(sortBy(paid.filter(function (x) { return x.conv === 0; }), byCostKw).slice(0, 25)),
      low_quality: pick(sortBy(paid.filter(is13), byCostKw).slice(0, 25)),
      duplicates: duplicates, product_mismatch: pick(mism), product_mismatch_cost: rnd(modelSum_(mism, costOf)),
      product_mismatch_conv: rnd(modelSum_(mism, function (x) { return x.conv; }), 1),
      ai_max: ai.map(function (x) { return { type: x.keyword, cost: x.cost, clicks: x.clicks, impr: x.impr, conv: x.conv }; })
    };
  }

  // ======================================================= 6. the Ivory CTM case (any campaign whose name contains CTM)
  var ctm = null;
  var ctmNames = uniqSorted(cd.filter(function (x) { return String(x.campaign).indexOf('CTM') >= 0; }).map(function (x) { return x.campaign; }));
  if (ctmNames.length && complete) {
    var camp = ctmNames[0];
    var evRows = chs.filter(function (x) { return x.campaign === camp; });
    var events = [];
    uniqSorted(evRows.map(function (x) { return x.day; })).forEach(function (day) {
      var g = evRows.filter(function (x) { return x.day === day; });
      var lines = [], setting = false;
      var na = modelCount_(g, isNegAdded);
      var nr = modelCount_(g, isNegRemoved);
      if (na) lines.push(na + ' negative keyword(s) added');
      if (nr) lines.push(nr + ' negative keyword(s) removed');
      var ka = g.filter(isKwAdded);
      var kr = g.filter(isKwRemoved);
      if (ka.length || kr.length) {
        var types = uniqSorted(ka.map(function (x) { return modelFirstWord_(x.kind); })).join('/') || '-';
        lines.push(ka.length + ' keyword(s) added as ' + types + ' match, ' + kr.length + ' removed');
        setting = true;
      }
      g.forEach(function (x) {
        if (kindOf(x).indexOf('keyword') >= 0) return;
        var text = (modelStr_(x.kind) + ': ' + modelStr_(x.item)).split(modelStr_(camp) + ': ').join('');
        var tl = text.toLowerCase();
        if (['budget', 'target cpa', 'search term matching', 'negative keyword list', 'bid'].some(function (k) { return tl.indexOf(k) >= 0; })) {
          lines.push(modelSlice_(text, 220));
          setting = true;
        }
      });
      if (lines.length) {
        events.push({ day: day, who: uniqSorted(g.map(function (x) { return modelUser_(x.user); })).join(', '), lines: lines, setting: setting });
      }
    });
    var cseries = null;
    for (var ci = 0; ci < campaigns.length; ci++) if (campaigns[ci].id === camp) { cseries = campaigns[ci].series; break; }
    var cuts = events.filter(function (e) { return e.setting; }).map(function (e) { return e.day; });
    if (cseries.length && (!cuts.length || cuts[0] > cseries[0].day)) cuts = [cseries[0].day].concat(cuts);
    var periods = [];
    cuts.forEach(function (a, i) {
      var b = i + 1 < cuts.length ? addDays(cuts[i + 1], -1) : complete;
      var g = cseries.filter(function (x) { return a <= x.day && x.day <= b; });
      if (!g.length) return;
      var n = g.length;
      var el = g.filter(function (x) { return x.eligible !== null && x.eligible !== undefined; }).map(function (x) { return x.eligible; });
      var ev = null;
      for (var ei = 0; ei < events.length; ei++) if (events[ei].day === a && events[ei].setting) { ev = events[ei]; break; }
      periods.push({ start: a, end: g[g.length - 1].day, days: n,
        change: ev ? ev.lines.filter(function (l) { return l.indexOf('negative') < 0; }) : [],
        impr_per_day: rnd(modelSum_(g, function (x) { return x.impr; }) / n),
        clicks_per_day: rnd(modelSum_(g, function (x) { return x.clicks; }) / n, 1),
        cost_per_day: rnd(modelSum_(g, costOf) / n), conv: rnd(modelSum_(g, function (x) { return x.conv; }), 1),
        eligible_per_day: el.length ? rnd(median(el)) : null });
    });
    var stCtm = st.filter(function (x) { return x.ctype === 'Google CTM'; });
    var ctmProjects = new Set(stCtm.map(function (x) { return x.project; }));
    var roi = st.filter(function (x) { return x.runner === 'ROI' && ctmProjects.has(x.project); });
    var ov = new Map();
    stCtm.forEach(function (a) {
      roi.forEach(function (b) {
        if (a.day === b.day && a.term === b.term) {
          if (!ov.has(b.campaign)) ov.set(b.campaign, { campaign: b.campaign, searches: 0, ctm_cost: 0.0, roi_cost: 0.0 });
          var g = ov.get(b.campaign);
          g.searches += 1;
          g.ctm_cost += a.cost;
          g.roi_cost += b.cost;
        }
      });
    });
    var cl = campaigns.filter(function (c) { return c.id === camp; })[0];
    ctm = { campaign: camp, project: cl.project, budget_now: cl.budget_now, target_cpa_now: cl.target_cpa_now,
      events: events, periods: periods,
      duplicates: (keywords ? keywords.duplicates : []).filter(function (d) { return d.campaigns.indexOf(camp) >= 0; }),
      overlap: sortBy(Array.from(ov.values()).map(function (g) {
        return Object.assign({}, g, { ctm_cost: rnd(g.ctm_cost, 2), roi_cost: rnd(g.roi_cost, 2) });
      }), function (x) { return [-x.searches, x.campaign]; }) };
  }

  // ======================================================= 7. what to fix, and who fixes it
  var fixes = [];
  var fix = function (type_, owner, project, severity, money, moneyKind, params) {
    fixes.push({ type: type_, owner: owner, project: project, severity: severity,
      money: money !== null && money !== undefined ? rnd(money, 2) : null,
      money_kind: moneyKind === undefined ? null : moneyKind, params: params || {} });
  };

  var campByProject = {};
  C.pids.forEach(function (pid) { campByProject[pid] = campaigns.filter(function (c) { return c.project === pid; }); });
  var dayOf = function (x) { return x.day; };
  C.pids.forEach(function (pid) {
    var o = agency.overdue_excludes.filter(ofProject(pid));
    if (o.length) {
      fix('overdue_excludes', 'Agency', pid, 'high', modelSum_(o, costOf), 'wasted', { count: o.length,
        first_day: modelMinStr_(o.map(dayOf), null), last_day: modelMaxStr_(o.map(dayOf), null) });
    }
    var oa = agency.overdue_adds.filter(ofProject(pid));
    if (oa.length) {
      fix('overdue_adds', 'Agency', pid, 'medium', null, null, { count: oa.length, first_day: modelMinStr_(oa.map(dayOf), null),
        last_day: modelMaxStr_(oa.map(dayOf), null) });
    }
    var nn = agency.no_negative_rows.filter(function (x) { return x.project === pid && (x.status === 'waiting' || x.status === 'overdue'); });
    if (nn.length) fix('no_negative_written', 'Agency', pid, 'medium', null, null, { count: nn.length });
    var bn = brandNoWord.filter(ofProject(pid));
    if (bn.length) {
      var bc = modelSum_(bn, costOf);
      fix('brand_no_word', 'Agency', pid, bc >= 5000 ? 'high' : 'medium', bc, 'wasted', { count: bn.length, example: bn[0].term,
        example_cost: bn[0].cost, example_keyword: bn[0].keyword });
    }
    var bl = brandLeak.filter(ofProject(pid));
    if (bl.length) fix('brand_leak', 'Agency', pid, 'medium', modelSum_(bl, costOf), 'misrouted', { count: bl.length, example: bl[0].term });
    var bk = new Set(blocked.filter(ofProject(pid)).map(function (x) { return modelKey_(x.campaign, x.ad_group, x.keyword); }));
    if (bk.size) {
      var ex = blocked.filter(ofProject(pid))[0];
      fix('blocked_keywords', 'Agency', pid, 'medium', null, null, { count: bk.size, example: ex.keyword, example_negative: ex.blocked_by });
    }
    var rk = risky.filter(ofProject(pid));
    if (rk.length) fix('risky_negatives', 'Agency', pid, 'medium', null, null, { count: rk.length, examples: rk.slice(0, 3).map(function (x) { return x.item; }) });
    if (keywords) {
      var mm = keywords.product_mismatch.filter(ofProject(pid));
      if (mm.length) {
        fix('product_mismatch', 'County', pid, 'high', modelSum_(mm, costOf), 'wasted', { count: mm.length,
          conv: rnd(modelSum_(mm, function (x) { return x.conv; }), 1), ad_groups: uniqSorted(mm.map(function (x) { return x.ad_group; })) });
      }
      var kp = keywords.by_project[pid];
      if (kp.cost && kp.below_lp_cost / kp.cost >= 0.3) {
        var share = 100 * kp.below_lp_cost / kp.cost;
        fix('landing_pages', 'County', pid, share >= 50 ? 'high' : 'medium', kp.below_lp_cost, 'affected', { share: rnd(share), total: kp.cost });
      }
      var dd = keywords.duplicates.filter(ofProject(pid));
      if (dd.length) {
        fix('self_competition', 'County', pid, 'medium', modelSum_(dd, costOf), 'affected', { count: dd.length,
          example: dd[0].keyword, example_campaigns: dd[0].campaigns });
      }
    }
    var cs = campByProject[pid];
    var gap = cs.filter(function (c) { return c.conv_gap; });
    if (gap.length) {
      fix('conversion_gap', 'County', pid, 'medium', null, null, {
        campaigns: gap.map(function (c) { return { id: c.id, label: c.label, conv: c.since.conv, all_conv: c.since.all_conv }; }) });
    }
    cs.forEach(function (c) {
      var s = c.since;
      if (s && s.cost >= 10000 && s.conv === 0) fix('zero_conv', 'County', pid, 'medium', s.cost, 'affected', { campaign: c.id, label: c.label, days: s.days });
    });
    var nb = cs.filter(function (c) { return c.ctype === 'Non-brand' && c.since; }).map(function (c) { return c.since; });
    var nbCost = modelSum_(nb, costOf), nbConv = modelSum_(nb, function (s) { return s.conv; });
    if (nbConv) {
      var nbCpa = nbCost / nbConv;
      cs.forEach(function (c) {
        var s = c.since;
        if (c.ctype === 'Brand' && s && s.cpa && s.cpa >= 3 * nbCpa) {
          fix('brand_cpa', 'County', pid, 'medium', s.cost, 'affected', { campaign: c.id, label: c.label, cpa: s.cpa,
            nonbrand_cpa: rnd(nbCpa), cpc: s.cpc, bid_strategy: c.bid_strategy, conv: s.conv });
        }
      });
    }
    cs.forEach(function (c) {
      if (c.verdict === 'budget') {
        fix('held_by_budget', 'County', pid, 'low', null, null, { campaign: c.id, label: c.label,
          lost_budget_pct: c.last7.lost_budget_pct, cpa: c.last7.cpa, budget: c.budget_now });
      }
    });
    if (ctm && ctm.project === pid && ctm.periods.length >= 2) {
      var p0 = ctm.periods[0];
      var pn = ctm.periods[ctm.periods.length - 1];
      for (var pi = ctm.periods.length - 1; pi >= 0; pi--) if (ctm.periods[pi].days >= 3) { pn = ctm.periods[pi]; break; }
      if (p0.eligible_per_day && pn.eligible_per_day !== null && pn.eligible_per_day < 0.25 * p0.eligible_per_day) {
        fix('ctm_pool', 'Google CTM team', pid, 'high', null, null, { campaign: ctm.campaign,
          before: p0.eligible_per_day, before_from: p0.start, before_to: p0.end,
          now: pn.eligible_per_day, now_from: pn.start, now_to: pn.end, spend_per_day: pn.cost_per_day,
          budget: ctm.budget_now, drop_pct: rnd(100 * (1 - pn.eligible_per_day / p0.eligible_per_day)) });
      }
    }
  });
  var sev = { high: 0, medium: 1, low: 2 };
  fixes = sortBy(fixes, function (f) { return [sev[f.severity], -(f.money || 0), pidIndex(f.project), f.type]; });

  // ======================================================= 8. competitors (auction insights)
  var competitors = null;
  if (auction.length) {
    competitors = { from: auction[0].period_start, to: auction[0].day,
      rows: sortBy(auction, function (x) {
        var none = x.impression_share === null || x.impression_share === undefined;
        return [none, -(x.impression_share || 0), x.domain];
      }) };
  }

  var span = function (rows, key) {
    key = key || 'day';
    var ds = rows.filter(function (x) { return x[key]; }).map(function (x) { return x[key]; });
    return ds.length ? { from: modelMinStr_(ds, null), to: modelMaxStr_(ds, null) } : null;
  };

  var cdSpan = span(cd);
  var stSpan = span(st);
  var campaignDays = null;
  if (cd.length) {
    campaignDays = cdSpan ? { from: cdSpan.from, to: cdSpan.to } : {};
    campaignDays.complete_through = complete;
  }
  var searchTerms = { days: stDays, raw_days: rawDays };
  if (stSpan) { searchTerms.from = stSpan.from; searchTerms.to = stSpan.to; }

  var windows = {};
  ['since', 'last7', 'prev7'].forEach(function (k) {
    var v = win[k];
    windows[k] = v ? { from: v[0], to: v[1] } : null;
  });

  var model = {
    version: MODEL_VERSION_, as_of: asOf,
    data: { campaign_days: campaignDays,
      search_terms: searchTerms,
      agency_sheet: span(calls), changes: span(changes),
      keywords: keywords ? { from: keywords.from, to: keywords.to } : null,
      auction: competitors ? { from: competitors.from, to: competitors.to } : null },
    projects: C.projects.map(function (p) {
      return { id: p.id, name: p.name, location: hasOwn(p, 'location') ? p.location : '', product: hasOwn(p, 'product') ? p.product : '',
        starting_price_cr: hasOwn(p, 'starting_price_cr') ? p.starting_price_cr : null,
        max_price_cr: hasOwn(p, 'max_price_cr') ? p.max_price_cr : null };
    }),
    windows: windows,
    account: account, project_stats: projectStats, campaigns: campaigns, latest_day: latest, agency: agency, keywords: keywords,
    risks: risks, ctm: ctm, competitors: competitors, fixes: fixes, coverage: coverage
  };
  return { model: model, review: review };
}
