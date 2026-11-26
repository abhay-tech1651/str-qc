/**
 * Follow-through: for every call in the agency's STR sheet (the last Add or Exclude for a search in a campaign), when it
 * went into Google Ads, who put it in, where (campaign, ad group or shared list), written how (the full search, part of
 * it, or one word), and what the delay cost. Everything is read from the loaded reports:
 *   - the ledger (ledger-core.ts): what the sheet said and whether the account blocks the search or has it as a keyword today
 *   - the change history: the date, time and user of every negative and keyword added, including words added to shared lists
 *   - Google's search terms report: the spend on each day, so the money after the deadline is exact
 *
 * Rules (the same everywhere in the dashboard):
 *   due        = sheet day + grace days (3). The sheet day is the day of the data in that tab.
 *   on time    = it went in on or before the due day.
 *   late       = it went in after the due day; the money "lost to the delay" is the spend on the days after the due day,
 *                up to and including the day it went in (on that day the spend came before the change).
 *   open       = not in the account yet. Past the due day it is "overdue" and the spend after the due day is still leaking.
 *   wrong place= for an Exclude: a negative went in, but only in another ad group of the campaign, so the search still runs.
 *                For an Add: it became a keyword in another campaign only.
 * No imports at run time: the engine's word helpers are passed in, so this runs the same in the dashboard and in a Node test.
 */
import type { Helpers, Inventory, InvNeg } from "./neg-inventory-core";
import type { Ledger, NegKind, Search } from "./ledger-core";

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export type Org = "ROI" | "County" | "Google" | "AGO" | "Other";
/** Who made a change, from the change history's user: the name before @, and the organisation. Full addresses are never shown. */
export function whoOf(user: string): { who: string; org: Org } {
  const u = str(user).trim();
  const local = u.split("@")[0];
  if (/roimantra/i.test(u)) return { who: local.replace(/\.?roimantra/i, ""), org: "ROI" };
  if (/^ago\b|ago\.web/i.test(local)) return { who: local, org: "AGO" };
  if (/county/i.test(local)) return { who: local, org: "County" };
  if (/^google|auto-apply|recommendations/i.test(u)) return { who: u, org: "Google" };
  return { who: local || "unknown", org: "Other" };
}

const NEG_ADDED = /^negative (exact|phrase|broad) match keyword added$/i;
const LIST_ADDED = /^(.+): \d+ negative (exact|phrase|broad) match keyword added to list$/i;
const LIST_REMOVED = /^(.+): \d+ negative (exact|phrase|broad) match keyword removed from list$/i;
const KW_ADDED = /^(exact|phrase|broad) match keyword added$/i;

/**
 * The negative keyword report lists which shared lists each campaign uses, but not what is in them. The change history
 * shows every word added to (or removed from) a list since it starts, so those words are added here as campaign-level
 * negatives of each campaign that uses the list. Words that were in a list before the change history starts stay unknown.
 */
export function withListNegatives(H: Helpers, inv: Inventory | null, changes: Row[]): Inventory | null {
  if (!inv) return inv;
  const camps = new Map<string, string[]>();
  for (const l of inv.lists) { if (!camps.has(l.name)) camps.set(l.name, []); camps.get(l.name)!.push(l.campaign); }
  const inList = new Map<string, { list: string; match: InvNeg["match"]; words: string[]; text: string }>();
  for (const c of [...changes].sort((a, b) => str(a.ts).localeCompare(str(b.ts)))) {
    const k = str(c.kind);
    const add = LIST_ADDED.exec(k), rem = LIST_REMOVED.exec(k);
    const m = add ?? rem;
    if (!m) continue;
    const [match, words] = H.parseNegative(str(c.item));
    if (!words.length) continue;
    const key = `${m[1]}\u0001${match}\u0001${words.join(" ")}`;
    if (rem) { inList.delete(key); continue; }
    const bare = words.join(" ");
    inList.set(key, { list: m[1], match: match as InvNeg["match"], words, text: match === "exact" ? `[${bare}]` : match === "phrase" ? `"${bare}"` : bare });
  }
  const extra: InvNeg[] = [];
  for (const x of inList.values()) for (const campaign of camps.get(x.list) ?? []) extra.push({ text: x.text, match: x.match, words: x.words, campaign, ad_group: "", list: x.list });
  return { ...inv, negatives: [...inv.negatives, ...extra] };
}

export type ExStatus = "on_time" | "late" | "open_overdue" | "open_in_time" | "wrong_place" | "county_query";
export type AddStatus = "on_time" | "late" | "already" | "open_overdue" | "open_in_time" | "elsewhere" | "blocked" | "sop_brand" | "county_rule";
/** A County comment that asks to keep or add a search the sheet still says to Exclude: the agency must answer it, not apply it. */
export const COUNTY_KEEP = /\badd\b|do ?n[o']t exclude|not exclude|why exclude/i;
/** Statuses that count neither as done nor as missed: not due yet, or held by a County rule or question. */
export const NEUTRAL = new Set(["open_in_time", "already", "sop_brand", "county_rule", "county_query"]);
export interface Done {
  ts: string; day: string; who: string; org: Org;
  level: "campaign" | "ad group" | "shared list";
  ad_group: string; list: string; text: string; match: string;
  /** for a negative: the full search, part of it, or one word; for a keyword: its match type */
  kind: NegKind | "keyword";
  /** in the change history; false when the account has it but the change history (from 1 Oct) does not show it going in */
  dated: boolean;
}
export interface Followup {
  id: string; type: "exclude" | "add"; owner: "agency" | "google";
  project: string; campaign: string; ad_groups: string[]; term: string;
  call_day: string; due: string;
  /** the deadline fell on a weekend and moved to Monday */
  due_weekend: boolean;
  status: ExStatus | AddStatus;
  done: Done | null;
  /** days past the due day: when it went in (late), or up to today (still open) */
  days_late: number;
  /** spend before the call, between the call and the due day, after the due day (until it went in, or up to "checked up to") */
  cost_before: number; cost_grace: number; cost_late: number;
  /** spend on days after the change went in: should be 0 for an Exclude */
  cost_after_done: number;
  conv: number; intent: Search["intent"]; intent_why: string;
  written: string; written_kind: Search["neg_written_kind"];
  county_comment: string;
  /** wrong place: where it went instead (another ad group, or another campaign) */
  elsewhere: string;
}

export interface TabDay {
  day: string; due: string;
  ex: Record<ExStatus, number> & { n: number };
  add: Record<AddStatus, number> & { n: number };
  /** money lost to late Excludes, and money still leaking on open overdue ones */
  cost_late_done: number; cost_leaking: number;
  /** when its Excludes went in: the days of the changes */
  went_in: string[];
  written: { term: number; part: number; one_word: number; none: number; different: number };
}

export interface ChangeDay {
  day: string;
  people: { who: string; org: Org; n: number; first: string; last: string }[];
  neg: { n: number; campaign: number; ad_group: number; list: number; one_word: number; full: number };
  kw: { added: number; paused: number; removed: number };
  /** changes that are not negatives or keywords (budgets, targets, bids, campaigns, audiences, ads): each listed */
  other: { ts: string; who: string; org: Org; campaign: string; kind: string; item: string }[];
  /** one-word negatives that went in that day */
  one_words: { text: string; campaign: string; ad_group: string; list: string; who: string }[];
}

const emptyEx = () => ({ n: 0, on_time: 0, late: 0, open_overdue: 0, open_in_time: 0, wrong_place: 0, county_query: 0 });
const emptyAdd = () => ({ n: 0, on_time: 0, late: 0, already: 0, open_overdue: 0, open_in_time: 0, elsewhere: 0, blocked: 0, sop_brand: 0, county_rule: 0 });

export function buildFollowup(H: Helpers, led: Ledger, inp: {
  inv: Inventory | null; changes: Row[]; searchTerms: Row[]; keywords: Row[]; asOf: string;
}) {
  const { asOf } = inp;
  const join = (w: string[]) => w.join(" ");
  const keyOf = (campaign: string, q: string[]) => `${campaign}\u0001${join(q)}`;

  // daily spend per search (same key as the ledger), inside the ledger's period
  const daily = new Map<string, Map<string, number>>();
  for (const r of inp.searchTerms) {
    const d = str(r.day);
    if (d < led.from || d > led.to) continue;
    const q = H.tok(str(r.term));
    if (!q.length) continue;
    const k = keyOf(str(r.campaign), q);
    if (!daily.has(k)) daily.set(k, new Map());
    const m = daily.get(k)!;
    m.set(d, (m.get(d) ?? 0) + num(r.cost));
  }
  const spend = (k: string, pick: (d: string) => boolean) => { let s = 0; for (const [d, c] of daily.get(k) ?? []) if (pick(d)) s += c; return s; };

  // negatives added, per campaign: on the campaign, in an ad group, or in a shared list the campaign uses
  type Ev = { ts: string; day: string; user: string; campaign: string; ad_group: string; list: string; match: string; words: string[]; text: string };
  const listCamps = new Map<string, string[]>();
  for (const l of inp.inv?.lists ?? []) { if (!listCamps.has(l.name)) listCamps.set(l.name, []); listCamps.get(l.name)!.push(l.campaign); }
  const negEv = new Map<string, Ev[]>();
  const pushEv = (e: Ev) => { if (!negEv.has(e.campaign)) negEv.set(e.campaign, []); negEv.get(e.campaign)!.push(e); };
  const kwEv = new Map<string, { ts: string; day: string; user: string; campaign: string; ad_group: string; match: string; text: string }[]>();
  for (const c of inp.changes) {
    const k = str(c.kind);
    const base = { ts: str(c.ts), day: str(c.day), user: str(c.user) };
    if (NEG_ADDED.test(k)) {
      const [match, words] = H.parseNegative(str(c.item));
      if (words.length) pushEv({ ...base, campaign: str(c.campaign), ad_group: str(c.ad_group), list: "", match, words, text: str(c.item).replace(/^-/, "") });
      continue;
    }
    const lm = LIST_ADDED.exec(k);
    if (lm) {
      const [match, words] = H.parseNegative(str(c.item));
      if (words.length) for (const campaign of listCamps.get(lm[1]) ?? []) pushEv({ ...base, campaign, ad_group: "", list: lm[1], match, words, text: str(c.item).replace(/^-/, "") });
      continue;
    }
    const km = KW_ADDED.exec(k);
    if (km) {
      const q = H.tok(str(c.item));
      if (!q.length) continue;
      const kk = join(q);
      if (!kwEv.has(kk)) kwEv.set(kk, []);
      kwEv.get(kk)!.push({ ...base, campaign: str(c.campaign), ad_group: str(c.ad_group), match: km[1].toLowerCase(), text: str(c.item) });
    }
  }
  for (const l of negEv.values()) l.sort((a, b) => a.ts.localeCompare(b.ts));
  for (const l of kwEv.values()) l.sort((a, b) => a.ts.localeCompare(b.ts));
  // keywords enabled today, by words: which campaigns have it
  const kwCamps = new Map<string, Set<string>>();
  for (const k of inp.keywords) {
    if (str(k.keyword_status) !== "Enabled" || !str(k.campaign) || str(k.campaign) === "(all)") continue;
    const kk = join(H.tok(str(k.keyword)));
    if (!kk) continue;
    if (!kwCamps.has(kk)) kwCamps.set(kk, new Set());
    kwCamps.get(kk)!.add(str(k.campaign));
  }
  for (const [kk, l] of kwEv) for (const e of l) { if (!kwCamps.has(kk)) kwCamps.set(kk, new Set()); kwCamps.get(kk)!.add(e.campaign); }

  // the account's negatives per campaign and ad group, indexed by their first word (exact ones by all their words)
  const invIdx = new Map<string, Map<string, InvNeg[]>>();
  for (const n of inp.inv?.negatives ?? []) {
    const ck = `${n.campaign}\u0001${n.ad_group}`;
    if (!invIdx.has(ck)) invIdx.set(ck, new Map());
    const m = invIdx.get(ck)!;
    const wk = n.match === "exact" ? `=${join(n.words)}` : n.words[0];
    if (!m.has(wk)) m.set(wk, []);
    m.get(wk)!.push(n);
  }
  const invGroups = new Map<string, Set<string>>();
  for (const n of inp.inv?.negatives ?? []) if (n.ad_group) { if (!invGroups.has(n.campaign)) invGroups.set(n.campaign, new Set()); invGroups.get(n.campaign)!.add(n.ad_group); }
  const invAt = (campaign: string, adGroup: string, q: string[]) => {
    const m = invIdx.get(`${campaign}\u0001${adGroup}`);
    if (!m) return false;
    if ((m.get(`=${join(q)}`) ?? []).length) return true;
    for (const w of new Set(q)) for (const n of m.get(w) ?? []) if (H.blocks(n.match, n.words, q)) return true;
    return false;
  };
  const kindOf = (w: string[], q: string[], match: string): NegKind => (w.length === 1 && match !== "exact" ? "one_word" : join(w) === join(q) ? "term" : w.length === 1 ? "one_word" : "part");
  const asDone = (e: Ev, q: string[]): Done => {
    const p = whoOf(e.user);
    return { ts: e.ts, day: e.day, who: p.who, org: p.org, level: e.list ? "shared list" : e.ad_group ? "ad group" : "campaign", ad_group: e.ad_group, list: e.list, text: e.text, match: e.match, kind: kindOf(e.words, q, e.match), dated: true };
  };

  /** When did the account start blocking this search: the earliest campaign-level (or shared-list) negative, or the day
   *  the last ad group got one (an ad-group negative only stops a search when every ad group of the campaign has one). */
  const blockedAt = (s: Search, q: string[]): Done | null => {
    const evs = (negEv.get(s.campaign) ?? []).filter((e) => H.blocks(e.match, e.words, q));
    // the first day a campaign-level (or shared-list) negative went in; when several went in that day (often the full
    // search and a single word together), the most specific one is how it went in
    const RANK: Record<NegKind, number> = { term: 0, part: 1, one_word: 2 };
    const campAll = evs.filter((e) => !e.ad_group);
    const firstDay = campAll[0]?.day;
    const camp = campAll.filter((e) => e.day === firstDay).sort((a, b) => RANK[kindOf(a.words, q, a.match)] - RANK[kindOf(b.words, q, b.match)] || a.ts.localeCompare(b.ts))[0];
    let best: Done | null = camp ? asDone(camp, q) : null;
    const groups = led.ad_groups_of[s.campaign] ?? s.ad_groups;
    if (groups.length) {
      let last: Ev | null = null, ok = true;
      for (const g of groups) {
        const e = evs.find((x) => x.ad_group === g);
        if (e) { if (!last || e.ts > last.ts) last = e; continue; }
        // no dated negative in this ad group: blocked there only if the account has one from before the change history
        const pre = invAt(s.campaign, g, q);
        if (!pre) { ok = false; break; }
      }
      if (ok && last && (!best || last.ts < best.ts)) best = asDone(last, q);
    }
    if (best) return best;
    // blocked today, but the change history does not show when: report the blocker without a date
    const b = s.blockers[0];
    if (s.blocked === "yes" && b) return { ts: "", day: "", who: "", org: "Other", level: b.list ? "shared list" : b.level, ad_group: b.ad_group, list: b.list ?? "", text: b.text, match: "", kind: b.kind, dated: false };
    return null;
  };

  const out: Followup[] = [];
  for (const s of led.searches) {
    if (s.verdict !== "Exclude" && s.verdict !== "Add") continue;
    const q = H.tok(s.term);
    const type = s.verdict === "Exclude" ? "exclude" : "add";
    const due = s.due;
    let status: Followup["status"];
    let done: Done | null = null;
    let elsewhere = "";
    if (type === "exclude") {
      if (s.blocked === "yes") {
        done = blockedAt(s, q);
        status = done && done.dated && done.day > due ? "late" : "on_time";
      } else {
        // a negative that blocks it sits only in some ad groups of the campaign (another ad group than the one it ran in,
        // or not all of them): the search still runs
        const groups = [...(invGroups.get(s.campaign) ?? [])].filter((g) => invAt(s.campaign, g, q)).sort();
        elsewhere = groups.join(", ");
        // inside the deadline nothing counts against the agency yet, even a negative in the wrong ad group; and where
        // County asked to keep or add the search, the agency has to answer County, not apply the Exclude
        status = COUNTY_KEEP.test(s.county_comment) ? "county_query" : asOf <= due ? "open_in_time" : groups.length ? "wrong_place" : "open_overdue";
      }
    } else {
      const kk = join(q);
      // SOP rule 1: a brand search in a non-brand or competitor campaign belongs to the brand campaign, so an Add
      // there that is not done (or is blocked by a brand-word negative) is not counted against the agency
      if (s.sop_brand && !(s.is_keyword && s.blocked !== "yes")) status = "sop_brand";
      // County's rule (22 Nov 2026): other County project names are negated on purpose, so an Add they block is not missed
      else if (s.blocked === "yes") status = s.blockers.some((b) => b.county_rule) ? "county_rule" : asOf <= due ? "open_in_time" : "blocked";
      else if (s.is_keyword) {
        const e = (kwEv.get(kk) ?? []).find((x) => x.campaign === s.campaign);
        if (e) {
          const p = whoOf(e.user);
          done = { ts: e.ts, day: e.day, who: p.who, org: p.org, level: "ad group", ad_group: e.ad_group, list: "", text: e.text, match: e.match, kind: "keyword", dated: true };
          status = e.day < s.call_day ? "already" : e.day > due ? "late" : "on_time";
        } else {
          done = { ts: "", day: "", who: "", org: "Other", level: "ad group", ad_group: "", list: "", text: s.term, match: "", kind: "keyword", dated: false };
          status = "already";
        }
      } else {
        const other = [...(kwCamps.get(kk) ?? [])].filter((c) => c !== s.campaign);
        elsewhere = other.join(", ");
        status = asOf <= due ? "open_in_time" : other.length ? "elsewhere" : "open_overdue";
      }
    }
    const k = s.id;
    const doneDay = done?.dated ? done.day : "";
    const isOpen = status === "open_overdue" || status === "open_in_time" || status === "wrong_place" || status === "elsewhere" || status === "blocked";
    // the money after the due day counts for Excludes only (an Add that is not done still runs on other keywords)
    const lateTo = type === "exclude" ? (doneDay || (isOpen ? led.to : "")) : "";
    const cost_late = lateTo ? spend(k, (d) => d > due && d <= lateTo) : 0;
    const daysLate = status === "late" && doneDay ? daysBetween(due, doneDay) : status === "open_overdue" || (status === "wrong_place" && asOf > due) || (status === "elsewhere" && asOf > due) ? daysBetween(due, asOf) : 0;
    out.push({
      id: k, type, owner: s.kind === "Run by Google (CTM)" ? "google" : "agency",
      project: s.project, campaign: s.campaign, ad_groups: s.ad_groups, term: s.term,
      call_day: s.call_day, due, due_weekend: due !== addDay(s.call_day, led.grace), status, done, days_late: Math.max(0, daysLate),
      cost_before: spend(k, (d) => d <= s.call_day), cost_grace: spend(k, (d) => d > s.call_day && d <= due), cost_late,
      cost_after_done: type === "exclude" && doneDay ? spend(k, (d) => d > doneDay) : 0,
      conv: s.conv, intent: s.intent, intent_why: s.intent_why, written: s.neg_written, written_kind: s.neg_written_kind,
      county_comment: s.county_comment, elsewhere,
    });
  }
  out.sort((a, b) => b.call_day.localeCompare(a.call_day) || b.cost_late - a.cost_late);

  // each sheet tab: how its calls went
  const tabs = new Map<string, TabDay>();
  for (const f of out) {
    if (f.owner !== "agency") continue;
    let t = tabs.get(f.call_day);
    if (!t) tabs.set(f.call_day, (t = { day: f.call_day, due: f.due, ex: emptyEx(), add: emptyAdd(), cost_late_done: 0, cost_leaking: 0, went_in: [], written: { term: 0, part: 0, one_word: 0, none: 0, different: 0 } }));
    if (f.type === "exclude") {
      t.ex.n++; (t.ex as Record<string, number>)[f.status]++;
      t.written[f.written_kind]++;
      if (f.status === "late") t.cost_late_done += f.cost_late;
      else if (f.status !== "on_time") t.cost_leaking += f.cost_late;
      if (f.done?.dated && !t.went_in.includes(f.done.day)) t.went_in.push(f.done.day);
    } else { t.add.n++; (t.add as Record<string, number>)[f.status]++; }
  }
  for (const t of tabs.values()) t.went_in.sort();

  // each day of the change history: who changed what
  const days = new Map<string, ChangeDay>();
  const dayOf = (d: string) => {
    let x = days.get(d);
    if (!x) days.set(d, (x = { day: d, people: [], neg: { n: 0, campaign: 0, ad_group: 0, list: 0, one_word: 0, full: 0 }, kw: { added: 0, paused: 0, removed: 0 }, other: [], one_words: [] }));
    return x;
  };
  for (const c of inp.changes) {
    const d = str(c.day);
    if (!d) continue;
    const x = dayOf(d);
    const p = whoOf(str(c.user));
    let person = x.people.find((y) => y.who === p.who);
    if (!person) x.people.push((person = { who: p.who, org: p.org, n: 0, first: str(c.ts), last: str(c.ts) }));
    person.n++;
    if (str(c.ts) < person.first) person.first = str(c.ts);
    if (str(c.ts) > person.last) person.last = str(c.ts);
    const k = str(c.kind);
    const lm = LIST_ADDED.exec(k);
    if (NEG_ADDED.test(k) || lm) {
      const [match, words] = H.parseNegative(str(c.item));
      x.neg.n++;
      if (lm) x.neg.list++; else if (str(c.ad_group)) x.neg.ad_group++; else x.neg.campaign++;
      if (words.length === 1 && match !== "exact") { x.neg.one_word++; x.one_words.push({ text: str(c.item).replace(/^-/, ""), campaign: str(c.campaign), ad_group: str(c.ad_group), list: lm ? lm[1] : "", who: p.who }); }
      else if (match === "exact") x.neg.full++;
      continue;
    }
    if (KW_ADDED.test(k)) { x.kw.added++; continue; }
    if (/^(exact|phrase|broad) match keyword paused$/i.test(k)) { x.kw.paused++; continue; }
    if (/^(exact|phrase|broad) match keyword removed$/i.test(k)) { x.kw.removed++; continue; }
    if (/negative .*removed/i.test(k)) { x.other.push({ ts: str(c.ts), who: p.who, org: p.org, campaign: str(c.campaign), kind: k, item: str(c.item) }); continue; }
    if (/^label added$/i.test(k)) continue;
    x.other.push({ ts: str(c.ts), who: p.who, org: p.org, campaign: str(c.campaign), kind: k, item: str(c.item) });
  }
  for (const x of days.values()) { x.people.sort((a, b) => b.n - a.n); x.other.sort((a, b) => a.ts.localeCompare(b.ts)); }

  return {
    as_of: asOf,
    items: out,
    tabs: [...tabs.values()].sort((a, b) => b.day.localeCompare(a.day)),
    change_days: [...days.values()].sort((a, b) => b.day.localeCompare(a.day)),
  };
}
export type FollowupResult = ReturnType<typeof buildFollowup>;

/** The agency scorecard for a set of follow-up items (one owner, optionally one project or a range of sheet days). */
export function scorecard(items: Followup[]) {
  const ex = items.filter((f) => f.type === "exclude"), add = items.filter((f) => f.type === "add");
  const count = (l: Followup[], ...st: string[]) => l.filter((f) => st.includes(f.status)).length;
  const sum = (l: Followup[], pick: (f: Followup) => number) => l.reduce((s, f) => s + pick(f), 0);
  const exDue = ex.filter((f) => !NEUTRAL.has(f.status));
  const addDue = add.filter((f) => !NEUTRAL.has(f.status));
  const lateDays = ex.filter((f) => f.status === "late").map((f) => f.days_late).sort((a, b) => a - b);
  return {
    ex: {
      n: ex.length, due: exDue.length, on_time: count(ex, "on_time"), late: count(ex, "late"),
      open_overdue: count(ex, "open_overdue"), wrong_place: count(ex, "wrong_place"), open_in_time: count(ex, "open_in_time"), county_query: count(ex, "county_query"),
      cost_late_done: sum(ex.filter((f) => f.status === "late"), (f) => f.cost_late),
      cost_leaking: sum(ex.filter((f) => f.status === "open_overdue" || f.status === "wrong_place"), (f) => f.cost_late),
      cost_grace: sum(ex, (f) => f.cost_grace),
      median_days_late: lateDays.length ? lateDays[Math.floor((lateDays.length - 1) / 2)] : 0,
      written_one_word: ex.filter((f) => f.written_kind === "one_word").length,
      written_none: ex.filter((f) => f.written_kind === "none").length,
      written_term: ex.filter((f) => f.written_kind === "term").length,
      went_in_one_word: ex.filter((f) => f.done?.kind === "one_word").length,
      went_in_term: ex.filter((f) => f.done?.kind === "term").length,
      went_in_part: ex.filter((f) => f.done?.kind === "part").length,
    },
    add: {
      n: add.length, due: addDue.length, on_time: count(add, "on_time"), late: count(add, "late"), already: count(add, "already"),
      open_overdue: count(add, "open_overdue"), elsewhere: count(add, "elsewhere"), blocked: count(add, "blocked"), open_in_time: count(add, "open_in_time"),
      sop_brand: count(add, "sop_brand"), county_rule: count(add, "county_rule"),
    },
  };
}
export type Scorecard = ReturnType<typeof scorecard>;
