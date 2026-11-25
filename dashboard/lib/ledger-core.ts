/**
 * The search-term ledger: every search that cost money in a period, followed from Google's search terms report,
 * through the agency's STR sheet, to the account as it is today (the last negative keyword report and keyword report).
 *
 * Each search (one search term in one campaign) lands in exactly one outcome, so the rupees add up to the total spend:
 *   results          it brought at least one conversion and nothing blocks it
 *   results_blocked  it brought conversions, but a negative in the account now blocks it
 *   junk_blocked     the sheet said Exclude and a negative now blocks it (done)
 *   junk_open        the sheet said Exclude, but nothing blocks it (or only in some of its ad groups)
 *   add_done         the sheet said Add and it is an enabled keyword now
 *   add_open         the sheet said Add, it is not a keyword
 *   add_blocked      the sheet said Add, but a negative blocks it
 *   discuss          the sheet says Discuss (waiting for County)
 *   kept             in the sheet with no Add or Exclude: the agency chose to leave it running
 *   blocked_anyway   no Add or Exclude in the sheet, but a negative blocks it anyway
 *   not_reviewed     it cost money but is in no tab of the sheet
 * Conversions are Google's count (not CRM leads). Spend is what Google's search terms report shows for the period.
 * No imports: the engine's word helpers are passed in, so this runs the same in the dashboard and in a plain Node check.
 */
import type { Helpers, Inventory, InvNeg } from "./neg-inventory-core";

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export const OUTCOMES = ["results", "results_blocked", "junk_blocked", "junk_open", "add_done", "add_open", "add_blocked", "discuss", "kept", "blocked_anyway", "not_reviewed"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type Verdict = "Exclude" | "Add" | "Discuss" | "Left as is" | "Not in sheet";

export interface Blocker {
  text: string; level: "campaign" | "ad group"; ad_group: string; kind: NegKind;
  /** another County project's name: County's own rule (22 Nov 2026), not a mistake */ county_rule?: boolean;
  /** our brand word in a non-brand or competitor campaign: SOP rule 1 sends brand searches to the brand campaign, not a mistake */ sop_brand?: boolean;
  /** the shared negative list it sits in (a list works like a campaign-level negative) */ list?: string;
}
/** How much the search says the person wants one of our homes (config/intent.json): decide on this, not on whether it converted once. */
export type Intent = "high" | "medium" | "low";
export interface IntentRules {
  brand: Record<string, string[]>; our_places: Record<string, string[]>; county_other_projects: string[];
  buy_words: string[]; city_words: string[]; low_words: string[];
  /** SOP rule 1: our brand words; a search with one in a non-brand or competitor campaign belongs to the brand campaign */
  brand_words?: string[];
  /** words that say nothing about which project: any other word (not a number) is a name, usually another builder's */
  generic_words?: string[];
}
/**
 * How a negative relates to the search it blocks: its own full search term (safe: it cannot block anything else),
 * part of it (two or more of its words), or a single word in broad or phrase match (risky: it blocks every search
 * with that word, including ones we want). County's rule: negate the search term itself, not one word.
 */
export type NegKind = "term" | "part" | "one_word";
/** What the sheet wrote in its negative column, against the search: the same kinds, "different" words, or nothing. */
export type WrittenKind = NegKind | "different" | "none";
/** A negative in the account that blocks searches we want (they converted, the sheet said Add, or they are keywords). */
export interface CostlyNeg {
  campaign: string; project: string; ad_group: string; level: "campaign" | "ad group"; text: string; match: string; words: number;
  /** the shared list it sits in ("" when it is on the campaign or ad group itself) */
  list: string;
  junk: number; junk_cost: number;
  /** the junk searches it blocks, costliest first: these can be negated one by one instead of the word */
  junk_terms: string[];
  good: { term: string; conv: number; cost: number; why: string; intent: Intent | "" }[];
  good_conv: number; good_cost: number;
  /** the highest intent among the searches we want that it blocks: a negative that only blocks low-intent searches is fine */
  top_intent: Intent | "";
}
export interface Search {
  id: string;
  project: string;
  campaign: string;
  kind: string;
  term: string;
  ad_groups: string[];
  keywords: string[];
  match_types: string[];
  clicks: number;
  cost: number;
  conv: number;
  first_day: string;
  last_day: string;
  days: number;
  verdict: Verdict;
  call_day: string;
  neg_written: string;
  /** what the sheet wrote, against the search */
  neg_written_kind: WrittenKind;
  /** the most specific negative that blocks it today ("" when nothing blocks it) */
  block_kind: NegKind | "";
  county_comment: string;
  /** "partly": blocked in some ad groups only, or only in the ad groups it ran in while other ad groups of the campaign can still show it */
  blocked: "yes" | "partly" | "no";
  intent: Intent | "";
  intent_why: string;
  /** a brand search in a non-brand or competitor campaign: SOP rule 1 says it belongs to the brand campaign */
  sop_brand: boolean;
  blockers: Blocker[];
  /** shared negative lists attached to the campaign: their contents are not loaded, so "not blocked" may still be covered there */
  lists: string[];
  is_keyword: boolean;
  /** spend on days after the first Exclude call, and after its deadline (call day + grace) */
  cost_after_call: number;
  cost_after_deadline: number;
  outcome: Outcome;
}
export interface Split { searches: number; cost: number; clicks: number; conv: number; by: Record<Outcome, { n: number; cost: number }> }
export interface Group extends Split { key: string; project: string; campaign?: string; ad_group?: string; kind?: string }
export interface Week extends Split { from: string; to: string }

const emptyBy = () => Object.fromEntries(OUTCOMES.map((o) => [o, { n: 0, cost: 0 }])) as Record<Outcome, { n: number; cost: number }>;
const emptySplit = (): Split => ({ searches: 0, cost: 0, clicks: 0, conv: 0, by: emptyBy() });
const addTo = (s: Split, x: Search, cost = x.cost) => {
  s.searches++; s.cost += cost; s.clicks += x.clicks; s.conv += x.conv;
  s.by[x.outcome].n++; s.by[x.outcome].cost += cost;
};

/** Brand, Non-brand, Competitor or Google's own (CTM) campaign, from the campaign name. */
export function campaignKind(c: string): string {
  if (/ctm/i.test(c)) return "Run by Google (CTM)";
  if (/competitor/i.test(c)) return "Competitor";
  if (/non[_ -]?brand/i.test(c)) return "Non-brand";
  if (/brand/i.test(c)) return "Brand";
  return "Other";
}

export function buildLedger(H: Helpers, inp: {
  searchTerms: Row[]; calls: Row[]; keywords: Row[]; changes: Row[]; inv: Inventory | null;
  from: string; to: string; grace: number; projectOf: (campaign: string) => string; intent?: IntentRules | null;
}) {
  const { from, to, grace, projectOf } = inp;
  const join = (w: string[]) => w.join(" ");
  const toks = (list: string[]) => list.map((p) => join(H.tok(p))).filter(Boolean);
  const has = (q: string[], list: string[]) => { const t = ` ${join(q)} `; return list.find((p) => t.includes(` ${p} `)) ?? ""; };
  const ir = inp.intent ?? null;
  const IR = ir && {
    low: toks(ir.low_words), buy: toks(ir.buy_words), city: toks(ir.city_words), other: toks(ir.county_other_projects),
    brand: Object.fromEntries(Object.entries(ir.brand).map(([k, v]) => [k, toks(v)])) as Record<string, string[]>,
    place: Object.fromEntries(Object.entries(ir.our_places).map(([k, v]) => [k, toks(v)])) as Record<string, string[]>,
    // every single word the lists know: a word outside them is a name
    known: new Set([ir.generic_words ?? [], ir.buy_words, ir.city_words, ir.low_words, ir.county_other_projects, ...Object.values(ir.brand), ...Object.values(ir.our_places)]
      .flat().flatMap((p) => H.tok(p))),
  };
  const brandW = ir ? toks(ir.brand_words ?? []) : [];
  const outsideBrand = (c: string) => { const k = campaignKind(c); return k === "Non-brand" || k === "Competitor"; };
  /** a negative of our brand word in a non-brand or competitor campaign (SOP rule 1) */
  const isSopBrand = (n: InvNeg) => outsideBrand(n.campaign) && brandW.includes(join(n.words));
  /** County's other projects for a campaign of this project (its own name is not "other") */
  const othersFor = (project: string) => (IR ? IR.other.filter((p) => !(IR.brand[project] ?? []).includes(p)) : []);
  const intentOf = (q: string[], project: string): { intent: Intent | ""; why: string } => {
    if (!IR) return { intent: "", why: "" };
    const other = has(q, othersFor(project));
    if (other) return { intent: "low", why: `names another County project (${other})` };
    const low = has(q, IR.low);
    if (low) return { intent: "low", why: `"${low}"` };
    const brand = has(q, IR.brand[project] ?? []);
    if (brand) return { intent: "high", why: `names our project (${brand})` };
    const place = has(q, IR.place[project] ?? []), buy = has(q, IR.buy), city = has(q, IR.city);
    if (place && buy) return { intent: "high", why: `our location (${place}) and "${buy}"` };
    if (place) return { intent: "medium", why: `our location (${place})` };
    const name = q.find((w) => !/^\d+[a-z]?$/.test(w) && !IR.known.has(w));
    if (name) return { intent: "low", why: `names another project or builder (${name})` };
    if (city && buy) return { intent: "medium", why: `${city} and "${buy}", not our location` };
    return { intent: "low", why: city ? `only ${city}, no buying word` : buy ? `"${buy}" but no city or our location` : "another builder's project or group, or no buying word" };
  };
  /** a negative that is another County project's name: County asked for these (22 Nov 2026) */
  const isCountyRule = (n: InvNeg) => othersFor(projectOf(n.campaign)).includes(join(n.words));
  // a single word in broad or phrase match is "one word" even when the search is that one word: it still blocks every search with it
  const kindOf = (w: string[], q: string[], match = "exact"): NegKind => (w.length === 1 && match !== "exact" ? "one_word" : join(w) === join(q) ? "term" : w.length === 1 ? "one_word" : "part");
  const RANK: Record<NegKind, number> = { term: 0, part: 1, one_word: 2 };
  const IRANK: Record<Intent, number> = { high: 0, medium: 1, low: 2 };
  // every negative that blocks a search, with those searches, to find the ones that also block searches we want
  const negUse = new Map<InvNeg, Search[]>();
  const keyOf = (campaign: string, q: string[]) => `${campaign}\u0001${join(q)}`;

  // negatives per campaign, indexed so each search is tested only against negatives that could block it
  const byCamp = new Map<string, { exact: Map<string, InvNeg[]>; byWord: Map<string, InvNeg[]> }>();
  for (const n of inp.inv?.negatives ?? []) {
    let e = byCamp.get(n.campaign);
    if (!e) byCamp.set(n.campaign, (e = { exact: new Map(), byWord: new Map() }));
    const map = n.match === "exact" ? e.exact : e.byWord;
    const k = n.match === "exact" ? join(n.words) : n.words[0];
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(n);
  }
  const listsOf = new Map<string, string[]>();
  for (const l of inp.inv?.lists ?? []) { if (!listsOf.has(l.campaign)) listsOf.set(l.campaign, []); if (!listsOf.get(l.campaign)!.includes(l.name)) listsOf.get(l.campaign)!.push(l.name); }
  const blockersOf = (camp: string, q: string[]): InvNeg[] => {
    const e = byCamp.get(camp);
    if (!e) return [];
    const out = [...(e.exact.get(join(q)) ?? [])];
    for (const w of new Set(q)) for (const n of e.byWord.get(w) ?? []) if (H.blocks(n.match, n.words, q)) out.push(n);
    return out;
  };

  // the ad groups of each campaign (seen in the period, or with enabled keywords): an ad-group negative stops a search
  // only when every ad group has it; otherwise it steers the search to another ad group
  const groupsOf = new Map<string, Set<string>>();
  const addGroup = (c: string, g: string) => { if (!c || !g || c === "(all)") return; if (!groupsOf.has(c)) groupsOf.set(c, new Set()); groupsOf.get(c)!.add(g); };
  for (const r of inp.searchTerms) if (str(r.day) >= from && str(r.day) <= to) addGroup(str(r.campaign), str(r.ad_group));
  for (const k of inp.keywords) if (str(k.keyword_status) === "Enabled") addGroup(str(k.campaign), str(k.ad_group));

  // enabled keywords per campaign, by their words
  const kw = new Set<string>();
  for (const k of inp.keywords) {
    if (str(k.keyword_status) !== "Enabled" || !str(k.campaign) || str(k.campaign) === "(all)") continue;
    const q = H.tok(str(k.keyword));
    if (q.length) kw.add(keyOf(str(k.campaign), q));
  }
  // keywords added after the keyword report was downloaded show in the change history
  for (const x of inp.changes) {
    if (!/^(exact|phrase|broad) match keyword added/i.test(str(x.kind))) continue;
    const q = H.tok(str(x.item));
    if (q.length) kw.add(keyOf(str(x.campaign), q));
  }

  // the sheet's calls up to the end of the period, per search
  const callsBy = new Map<string, Row[]>();
  for (const c of inp.calls) {
    const d = str(c.day);
    if (!d || d > to) continue;
    const q = H.tok(str(c.term));
    if (!q.length) continue;
    const k = keyOf(str(c.campaign), q);
    if (!callsBy.has(k)) callsBy.set(k, []);
    callsBy.get(k)!.push(c);
  }

  // searches in the period
  const acc = new Map<string, { campaign: string; q: string[]; term: string; rows: Row[] }>();
  for (const r of inp.searchTerms) {
    const d = str(r.day);
    if (d < from || d > to) continue;
    const q = H.tok(str(r.term));
    if (!q.length) continue;
    const k = keyOf(str(r.campaign), q);
    let a = acc.get(k);
    if (!a) acc.set(k, (a = { campaign: str(r.campaign), q, term: str(r.term).trim(), rows: [] }));
    a.rows.push(r);
  }

  const searches: Search[] = [];
  for (const [k, a] of acc) {
    const rows = a.rows.sort((x, y) => str(x.day).localeCompare(str(y.day)));
    const agCost = new Map<string, number>();
    for (const r of rows) agCost.set(str(r.ad_group), (agCost.get(str(r.ad_group)) ?? 0) + num(r.cost));
    const ad_groups = [...agCost.entries()].sort((x, y) => y[1] - x[1]).map(([g]) => g);
    const cost = rows.reduce((s, r) => s + num(r.cost), 0);
    const clicks = rows.reduce((s, r) => s + num(r.clicks), 0);
    const conv = rows.reduce((s, r) => s + num(r.conv), 0);

    // the sheet: the last Add / Exclude / Discuss written for this search decides; none written = left as is
    const calls = (callsBy.get(k) ?? []).sort((x, y) => str(x.day).localeCompare(str(y.day)));
    const decided = calls.filter((c) => ["Exclude", "Add", "Discuss"].includes(str(c.decision)));
    const last = decided[decided.length - 1];
    const verdict: Verdict = last ? (str(last.decision) as Verdict) : calls.length ? "Left as is" : "Not in sheet";
    const firstEx = calls.find((c) => str(c.decision) === "Exclude");
    const call_day = verdict === "Exclude" && firstEx ? str(firstEx.day) : last ? str(last.day) : calls.length ? str(calls[0].day) : "";
    const withNeg = [...calls].reverse().find((c) => str(c.neg_term).trim());
    const withComment = [...calls].reverse().find((c) => str(c.county_comment).trim());

    // the account today: blocked at campaign level, or in every ad group it ran in
    const bl = inp.inv ? blockersOf(a.campaign, a.q) : [];
    const campLevel = bl.filter((n) => !n.ad_group);
    const agBlocked = ad_groups.filter((g) => bl.some((n) => n.ad_group === g));
    const allGroups = [...(groupsOf.get(a.campaign) ?? new Set(ad_groups))];
    const everyGroup = allGroups.length > 0 && allGroups.every((g) => bl.some((n) => n.ad_group === g));
    const blocked: Search["blocked"] = campLevel.length || everyGroup ? "yes" : agBlocked.length ? "partly" : "no";
    const relevant = (campLevel.length ? campLevel : bl.filter((n) => ad_groups.includes(n.ad_group)))
      .sort((x, y) => RANK[kindOf(x.words, a.q, x.match)] - RANK[kindOf(y.words, a.q, y.match)]);
    const blockers: Blocker[] = relevant.slice(0, 4).map((n) => ({ text: n.text, level: n.ad_group ? "ad group" : "campaign", ad_group: n.ad_group, kind: kindOf(n.words, a.q, n.match), ...(isCountyRule(n) ? { county_rule: true } : {}), ...(isSopBrand(n) ? { sop_brand: true } : {}), ...(n.list ? { list: n.list } : {}) }));
    const project = projectOf(a.campaign);
    const it = intentOf(a.q, project);
    const block_kind: Search["block_kind"] = blocked === "yes" && blockers.length ? blockers[0].kind : "";
    const written = withNeg ? H.tok(str(withNeg.neg_term)) : [];
    const neg_written_kind: WrittenKind = !written.length ? "none" : !written.every((x) => a.q.includes(x)) ? "different" : kindOf(written, a.q, str(withNeg?.neg_term).trim().startsWith("[") ? "exact" : "broad");
    const is_keyword = kw.has(k);

    const exDay = verdict === "Exclude" && firstEx ? str(firstEx.day) : "";
    const cost_after_call = exDay ? rows.filter((r) => str(r.day) > exDay).reduce((s, r) => s + num(r.cost), 0) : 0;
    const cost_after_deadline = exDay ? rows.filter((r) => str(r.day) > addDay(exDay, grace)).reduce((s, r) => s + num(r.cost), 0) : 0;

    let outcome: Outcome;
    if (conv > 0) outcome = blocked === "yes" ? "results_blocked" : "results";
    else if (verdict === "Exclude") outcome = blocked === "yes" ? "junk_blocked" : "junk_open";
    else if (verdict === "Add") outcome = blocked === "yes" ? "add_blocked" : is_keyword ? "add_done" : "add_open";
    else if (verdict === "Discuss") outcome = "discuss";
    else if (blocked === "yes") outcome = "blocked_anyway";
    else outcome = verdict === "Left as is" ? "kept" : "not_reviewed";

    const search: Search = {
      id: k, project, campaign: a.campaign, kind: campaignKind(a.campaign), term: a.term,
      ad_groups, keywords: [...new Set(rows.map((r) => str(r.keyword)).filter(Boolean))].slice(0, 5),
      match_types: [...new Set(rows.map((r) => str(r.match_type)).filter(Boolean))],
      clicks, cost, conv, first_day: str(rows[0].day), last_day: str(rows[rows.length - 1].day), days: new Set(rows.map((r) => str(r.day))).size,
      verdict, call_day, neg_written: withNeg ? str(withNeg.neg_term).trim() : "", county_comment: withComment ? str(withComment.county_comment).trim() : "",
      neg_written_kind, block_kind, blocked, intent: it.intent, intent_why: it.why, sop_brand: outsideBrand(a.campaign) && !!has(a.q, brandW), blockers, lists: listsOf.get(a.campaign) ?? [], is_keyword, cost_after_call, cost_after_deadline, outcome,
    };
    searches.push(search);
    for (const n of bl) { if (!negUse.has(n)) negUse.set(n, []); negUse.get(n)!.push(search); }
  }
  searches.sort((x, y) => y.cost - x.cost);

  // roll-ups: total, project, campaign type, campaign, ad group, how Google matched it, week
  const total = emptySplit();
  const groups = (keyFn: (s: Search) => string, fill: (s: Search) => Partial<Group>) => {
    const m = new Map<string, Group>();
    for (const s of searches) {
      const key = keyFn(s);
      let g = m.get(key);
      if (!g) m.set(key, (g = { ...emptySplit(), key, project: s.project, ...fill(s) }));
      addTo(g, s);
    }
    return [...m.values()].sort((x, y) => y.cost - x.cost);
  };
  for (const s of searches) addTo(total, s);
  const byProject = groups((s) => s.project, () => ({}));
  const byKind = groups((s) => `${s.project}\u0001${s.kind}`, (s) => ({ kind: s.kind }));
  const byCampaign = groups((s) => s.campaign, (s) => ({ campaign: s.campaign, kind: s.kind }));

  // ad groups and match types split each search's spend by its own rows
  const agMap = new Map<string, Group>(), mtMap = new Map<string, Group>();
  const weekMap = new Map<string, Week>();
  const weekStart = (d: string) => { const t = new Date(`${d}T00:00:00Z`); return addDay(d, -((t.getUTCDay() + 6) % 7)); };
  for (const s of searches) {
    const rows = acc.get(s.id)!.rows;
    const share = (pick: (r: Row) => string, m: Map<string, Group>, fill: (v: string) => Partial<Group>) => {
      const per = new Map<string, number>();
      for (const r of rows) per.set(pick(r), (per.get(pick(r)) ?? 0) + num(r.cost));
      for (const [v, c] of per) {
        const key = `${s.campaign}\u0001${v}`;
        let g = m.get(key);
        if (!g) m.set(key, (g = { ...emptySplit(), key, project: s.project, campaign: s.campaign, ...fill(v) }));
        addTo(g, s, c);
      }
    };
    share((r) => str(r.ad_group), agMap, (v) => ({ ad_group: v }));
    const mt = (r: Row) => (/close variant/i.test(str(r.match_type)) ? `${str(r.match_type).split(" ")[0]} (close variant)` : str(r.match_type).split(" ")[0] || "Unknown");
    const per = new Map<string, number>();
    for (const r of rows) per.set(mt(r), (per.get(mt(r)) ?? 0) + num(r.cost));
    for (const [v, c] of per) {
      let g = mtMap.get(v);
      if (!g) mtMap.set(v, (g = { ...emptySplit(), key: v, project: "all" }));
      addTo(g, s, c);
    }
    const perW = new Map<string, number>();
    for (const r of rows) perW.set(weekStart(str(r.day)), (perW.get(weekStart(str(r.day))) ?? 0) + num(r.cost));
    for (const [w, c] of perW) {
      let g = weekMap.get(w);
      if (!g) weekMap.set(w, (g = { ...emptySplit(), from: w < from ? from : w, to: addDay(w, 6) > to ? to : addDay(w, 6) }));
      addTo(g, s, c);
    }
  }

  // negatives that block searches we want: converted, the sheet said Add, or an enabled keyword (ad-group negatives
  // count only for searches that ran in that ad group)
  const costly: CostlyNeg[] = [];
  const listOfNeg = (n: InvNeg) => n.list ?? "";
  for (const [n, list] of negUse) {
    const hit = list.filter((x) => !n.ad_group || x.ad_groups.includes(n.ad_group));
    // only where the search is really stopped: an ad-group negative that steers a search to another ad group of the
    // same campaign (where it still runs) is sorting, not blocking; and an ad-group negative is not the cause when a
    // campaign-level negative (or shared list) already stops the search
    // SOP rule 1: a brand search in a non-brand or competitor campaign belongs to the brand campaign, so blocking it there is no loss
    const good = hit.filter((x) => x.blocked === "yes" && !x.sop_brand && (x.conv > 0 || x.verdict === "Add" || x.is_keyword)
      && (!n.ad_group || !x.blockers.some((b) => b.level === "campaign")));
    // County's rule: other County project names are negated on purpose; SOP rule 1: brand words in non-brand campaigns
    if (!good.length || good.every((x) => join(H.tok(x.term)) === join(n.words)) || isCountyRule(n) || isSopBrand(n)) continue;
    const junk = hit.filter((x) => x.verdict === "Exclude" && x.conv === 0);
    costly.push({
      campaign: n.campaign, project: projectOf(n.campaign), ad_group: n.ad_group, level: n.ad_group ? "ad group" : "campaign", list: listOfNeg(n), text: n.text, match: n.match, words: n.words.length,
      junk: junk.length, junk_cost: junk.reduce((s, x) => s + x.cost, 0), junk_terms: junk.sort((x, y) => y.cost - x.cost).map((x) => x.term),
      good: good.sort((x, y) => IRANK[x.intent || "low"] - IRANK[y.intent || "low"] || y.conv - x.conv || y.cost - x.cost)
        .map((x) => ({ term: x.term, conv: x.conv, cost: x.cost, why: x.conv > 0 ? "converted" : x.verdict === "Add" ? "sheet said Add" : "our keyword", intent: x.intent })),
      good_conv: good.reduce((s, x) => s + x.conv, 0), good_cost: good.reduce((s, x) => s + x.cost, 0),
      top_intent: good.map((x) => x.intent).sort((x, y) => IRANK[x || "low"] - IRANK[y || "low"])[0] ?? "",
    });
  }
  costly.sort((x, y) => IRANK[x.top_intent || "low"] - IRANK[y.top_intent || "low"] || y.good_conv - x.good_conv || y.good_cost - x.good_cost);

  return {
    from, to, grace, costly_negatives: costly,
    /** every ad group of each campaign (seen in the period, or with enabled keywords) */
    ad_groups_of: Object.fromEntries([...groupsOf].map(([c, g]) => [c, [...g].sort()])) as Record<string, string[]>, inventory_as_of: inp.inv?.as_of ?? "", total, searches,
    by_project: byProject, by_kind: byKind, by_campaign: byCampaign,
    by_ad_group: [...agMap.values()].sort((x, y) => y.cost - x.cost),
    by_match: [...mtMap.values()].sort((x, y) => y.cost - x.cost),
    by_week: [...weekMap.values()].sort((x, y) => x.from.localeCompare(y.from)),
    junk_cost_after_call: searches.reduce((s, x) => s + x.cost_after_call, 0),
    junk_cost_after_deadline: searches.reduce((s, x) => s + x.cost_after_deadline, 0),
  };
}
export type Ledger = ReturnType<typeof buildLedger>;
