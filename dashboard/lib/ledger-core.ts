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

export interface Blocker { text: string; level: "campaign" | "ad group"; ad_group: string; kind: NegKind }
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
  junk: number; junk_cost: number;
  /** the junk searches it blocks, costliest first: these can be negated one by one instead of the word */
  junk_terms: string[];
  good: { term: string; conv: number; cost: number; why: string }[];
  good_conv: number; good_cost: number;
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
  blocked: "yes" | "partly" | "no";
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
  from: string; to: string; grace: number; projectOf: (campaign: string) => string;
}) {
  const { from, to, grace, projectOf } = inp;
  const join = (w: string[]) => w.join(" ");
  // a single word in broad or phrase match is "one word" even when the search is that one word: it still blocks every search with it
  const kindOf = (w: string[], q: string[], match = "exact"): NegKind => (w.length === 1 && match !== "exact" ? "one_word" : join(w) === join(q) ? "term" : w.length === 1 ? "one_word" : "part");
  const RANK: Record<NegKind, number> = { term: 0, part: 1, one_word: 2 };
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
    const blocked: Search["blocked"] = campLevel.length || (ad_groups.length && agBlocked.length === ad_groups.length) ? "yes" : agBlocked.length ? "partly" : "no";
    const relevant = (campLevel.length ? campLevel : bl.filter((n) => ad_groups.includes(n.ad_group)))
      .sort((x, y) => RANK[kindOf(x.words, a.q, x.match)] - RANK[kindOf(y.words, a.q, y.match)]);
    const blockers: Blocker[] = relevant.slice(0, 4).map((n) => ({ text: n.text, level: n.ad_group ? "ad group" : "campaign", ad_group: n.ad_group, kind: kindOf(n.words, a.q, n.match) }));
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
      id: k, project: projectOf(a.campaign), campaign: a.campaign, kind: campaignKind(a.campaign), term: a.term,
      ad_groups, keywords: [...new Set(rows.map((r) => str(r.keyword)).filter(Boolean))].slice(0, 5),
      match_types: [...new Set(rows.map((r) => str(r.match_type)).filter(Boolean))],
      clicks, cost, conv, first_day: str(rows[0].day), last_day: str(rows[rows.length - 1].day), days: new Set(rows.map((r) => str(r.day))).size,
      verdict, call_day, neg_written: withNeg ? str(withNeg.neg_term).trim() : "", county_comment: withComment ? str(withComment.county_comment).trim() : "",
      neg_written_kind, block_kind, blocked, blockers, lists: listsOf.get(a.campaign) ?? [], is_keyword, cost_after_call, cost_after_deadline, outcome,
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
  for (const [n, list] of negUse) {
    const hit = list.filter((x) => !n.ad_group || x.ad_groups.includes(n.ad_group));
    // only where the search is really stopped: an ad-group negative that steers a search to another ad group of the
    // same campaign (where it still runs) is sorting, not blocking
    const good = hit.filter((x) => x.blocked === "yes" && (x.conv > 0 || x.verdict === "Add" || x.is_keyword));
    if (!good.length || good.every((x) => join(H.tok(x.term)) === join(n.words))) continue;
    const junk = hit.filter((x) => x.verdict === "Exclude" && x.conv === 0);
    costly.push({
      campaign: n.campaign, project: projectOf(n.campaign), ad_group: n.ad_group, level: n.ad_group ? "ad group" : "campaign", text: n.text, match: n.match, words: n.words.length,
      junk: junk.length, junk_cost: junk.reduce((s, x) => s + x.cost, 0), junk_terms: junk.sort((x, y) => y.cost - x.cost).map((x) => x.term),
      good: good.sort((x, y) => y.conv - x.conv || y.cost - x.cost).map((x) => ({ term: x.term, conv: x.conv, cost: x.cost, why: x.conv > 0 ? "converted" : x.verdict === "Add" ? "sheet said Add" : "our keyword" })),
      good_conv: good.reduce((s, x) => s + x.conv, 0), good_cost: good.reduce((s, x) => s + x.cost, 0),
    });
  }
  costly.sort((x, y) => y.good_conv - x.good_conv || y.good_cost - x.good_cost);

  return {
    from, to, grace, costly_negatives: costly, inventory_as_of: inp.inv?.as_of ?? "", total, searches,
    by_project: byProject, by_kind: byKind, by_campaign: byCampaign,
    by_ad_group: [...agMap.values()].sort((x, y) => y.cost - x.cost),
    by_match: [...mtMap.values()].sort((x, y) => y.cost - x.cost),
    by_week: [...weekMap.values()].sort((x, y) => x.from.localeCompare(y.from)),
    junk_cost_after_call: searches.reduce((s, x) => s + x.cost_after_call, 0),
    junk_cost_after_deadline: searches.reduce((s, x) => s + x.cost_after_deadline, 0),
  };
}
export type Ledger = ReturnType<typeof buildLedger>;
