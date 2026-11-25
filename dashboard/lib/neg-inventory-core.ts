/**
 * Every negative in the account today, from Google Ads' "Negative keyword report" (Keywords › Negative keywords ›
 * Download). The change history only shows negatives added since it starts; this report is the full list, whenever
 * each negative was added. From it:
 *  - how many negatives each campaign carries, at campaign and ad-group level, and how many are one word;
 *  - which negatives now block our own enabled keywords, or searches that brought conversions;
 *  - for every Exclude call in the agency sheet: is that search blocked in the account today;
 *  - searches the sheet said to Add that a negative now blocks.
 * No imports: the engine's word helpers are passed in, so this runs the same in the dashboard and in a plain Node check.
 */

export type Helpers = {
  tok: (s: string) => string[];
  parseNegative: (s: string) => [string, string[]];
  blocks: (match: string, words: string[], q: string[]) => boolean;
};

type Row = Record<string, unknown>;
type Match = "exact" | "phrase" | "broad";

export interface InvNeg {
  text: string; match: Match; words: string[]; campaign: string; ad_group: string;
  /** set when the negative sits in a shared list attached to the campaign (known from the change history, which shows what went into a list) */
  list?: string;
}
export interface InvList { name: string; campaign: string }
export interface Inventory { as_of: string; name: string; exported_ms?: number; negatives: InvNeg[]; lists: InvList[] }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const blank = (s: string) => (s.trim() === "--" ? "" : s.trim());

/** Is this text a Google Ads negative keyword report? */
export const isInventory = (text: string) => /^﻿?Negative keyword report/.test(text) && /Negative keyword\tKeyword or list/.test(text.slice(0, 2000));

/** Read the report. `asOf` is the day it was downloaded (the report itself says "All time"). */
export function parseInventory(H: Helpers, text: string, asOf: string, name: string): Inventory {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const hi = lines.findIndex((l) => l.startsWith("Negative keyword\tKeyword or list"));
  const negatives: InvNeg[] = [], lists: InvList[] = [];
  if (hi < 0) return { as_of: asOf, name, negatives, lists };
  const head = lines[hi].split("\t");
  const col = (n: string) => head.indexOf(n);
  const iK = col("Negative keyword"), iT = col("Keyword or list"), iC = col("Campaign"), iA = col("Ad group"), iM = col("Match type");
  for (const l of lines.slice(hi + 1)) {
    if (!l.trim()) continue;
    const c = l.split("\t");
    const text0 = str(c[iK]).trim(), campaign = blank(str(c[iC])), ad_group = blank(str(c[iA]));
    if (!text0 || /^total/i.test(text0)) continue;
    if (str(c[iT]).trim() === "List") { lists.push({ name: text0, campaign }); continue; }
    const m = str(c[iM]).toLowerCase();
    const match: Match = m.startsWith("exact") ? "exact" : m.startsWith("phrase") ? "phrase" : m.startsWith("broad") ? "broad" : (H.parseNegative(text0)[0] as Match);
    const words = H.tok(text0);
    if (!words.length) continue;
    // the export doubles quotes ("""sobha altus"""); show each negative the way Google Ads writes it
    const bare = text0.replace(/^[\["]+|[\]"]+$/g, "").trim();
    const text = match === "exact" ? `[${bare}]` : match === "phrase" ? `"${bare}"` : bare;
    negatives.push({ text, match, words, campaign, ad_group });
  }
  return { as_of: asOf, name, negatives, lists };
}

export interface InvRisk {
  text: string; match: Match; words: number; campaign: string; ad_group: string; level: "campaign" | "ad group"; project: string;
  /** when the change history shows it going in; empty when it was added before the change history starts */
  added_on: string; added_by: string;
  keywords: string[]; conv_searches: { term: string; ad_group: string; clicks: number; cost: number; conv: number; last_day: string }[]; conv: number;
}

export interface InvCampaign {
  campaign: string; project: string; total: number; campaign_level: number; ad_group_level: number;
  exact: number; phrase: number; broad: number; one_word: number; one_word_campaign: number; lists: string[];
}

export type InAccount = "blocked_here" | "blocked_other_ad_group" | "not_found";

export interface InvCall {
  day: string; project: string; campaign: string; ad_group: string; term: string; cost: number; clicks: number; written: string;
  in_account: InAccount; by: string; by_level: string; by_ad_group: string; lists: string[];
}

export interface InvAddConflict {
  day: string; project: string; campaign: string; ad_group: string; term: string; cost: number; conv: number; by: string; by_level: string;
}

export function analyseInventory(H: Helpers, inp: {
  inv: Inventory; calls: Row[]; keywords: Row[]; searchTerms: Row[]; changes: Row[]; projectOf: (campaign: string) => string;
}) {
  const { inv, projectOf } = inp;
  const join = (w: string[]) => w.join(" ");

  // negatives per campaign, indexed by first word, so a search is only tested against negatives that could block it
  const byCamp = new Map<string, { exact: Map<string, InvNeg[]>; byWord: Map<string, InvNeg[]> }>();
  for (const n of inv.negatives) {
    let e = byCamp.get(n.campaign);
    if (!e) byCamp.set(n.campaign, (e = { exact: new Map(), byWord: new Map() }));
    const map = n.match === "exact" ? e.exact : e.byWord;
    const key = n.match === "exact" ? join(n.words) : n.words[0];
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  /** negatives in a campaign that block search q (words), campaign-level and every ad group */
  const blockersOf = (camp: string, q: string[]): InvNeg[] => {
    const e = byCamp.get(camp);
    if (!e) return [];
    const out = [...(e.exact.get(join(q)) ?? [])];
    for (const w of new Set(q)) for (const n of e.byWord.get(w) ?? []) if (H.blocks(n.match, n.words, q)) out.push(n);
    return out;
  };
  const scoped = (ns: InvNeg[], ag: string) => ns.filter((n) => !n.ad_group || n.ad_group === ag);
  const level = (n: InvNeg) => (n.ad_group ? "ad group" : "campaign") as "campaign" | "ad group";
  const listsOf = new Map<string, string[]>();
  for (const l of inv.lists) { if (!listsOf.has(l.campaign)) listsOf.set(l.campaign, []); listsOf.get(l.campaign)!.push(l.name); }

  // when each negative went in, from the change history (campaign, ad group, match, words)
  const added = new Map<string, { day: string; user: string }>();
  for (const x of inp.changes) {
    const k = str(x.kind);
    if (!(k.startsWith("negative") && k.includes("keyword added"))) continue;
    const [m, w] = H.parseNegative(str(x.item));
    const key = [str(x.campaign), str(x.ad_group), m, join(w)].join("\u0001");
    if (!added.has(key)) added.set(key, { day: str(x.day), user: str(x.user).split("@")[0] });
  }
  const nKey = (n: InvNeg) => [n.campaign, n.ad_group, n.match, join(n.words)].join("\u0001");

  // per campaign counts
  const camps = new Map<string, InvCampaign>();
  for (const n of inv.negatives) {
    let c = camps.get(n.campaign);
    if (!c) camps.set(n.campaign, (c = { campaign: n.campaign, project: projectOf(n.campaign), total: 0, campaign_level: 0, ad_group_level: 0, exact: 0, phrase: 0, broad: 0, one_word: 0, one_word_campaign: 0, lists: listsOf.get(n.campaign) ?? [] }));
    c.total++;
    if (n.ad_group) c.ad_group_level++; else c.campaign_level++;
    c[n.match]++;
    if (n.words.length === 1 && n.match !== "exact") { c.one_word++; if (!n.ad_group) c.one_word_campaign++; }
  }
  for (const [camp, ls] of listsOf) if (!camps.has(camp)) camps.set(camp, { campaign: camp, project: projectOf(camp), total: 0, campaign_level: 0, ad_group_level: 0, exact: 0, phrase: 0, broad: 0, one_word: 0, one_word_campaign: 0, lists: ls });

  // what each negative blocks: our enabled keywords, and searches that converted (and that the sheet never asked to exclude)
  const risk = new Map<InvNeg, InvRisk>();
  const riskOf = (n: InvNeg): InvRisk => {
    let r = risk.get(n);
    if (!r) {
      const a = added.get(nKey(n));
      risk.set(n, (r = { text: n.text, match: n.match, words: n.words.length, campaign: n.campaign, ad_group: n.ad_group, level: level(n), project: projectOf(n.campaign),
        added_on: a?.day ?? "", added_by: a?.user ?? "", keywords: [], conv_searches: [], conv: 0 }));
    }
    return r;
  };
  for (const k of inp.keywords) {
    if (str(k.keyword_status) !== "Enabled" || !str(k.campaign) || str(k.campaign) === "(all)") continue;
    const q = H.tok(str(k.keyword));
    if (!q.length) continue;
    for (const n of scoped(blockersOf(str(k.campaign), q), str(k.ad_group))) {
      const label = n.ad_group ? join(q) : `${join(q)} (${str(k.ad_group)})`;
      const r = riskOf(n);
      if (!r.keywords.includes(label)) r.keywords.push(label);
    }
  }
  const excluded = new Set<string>();
  for (const c of inp.calls) if (str(c.decision) === "Exclude") excluded.add(str(c.campaign) + "\u0001" + join(H.tok(str(c.term))));
  const st = new Map<string, { campaign: string; ad_group: string; term: string; q: string[]; clicks: number; cost: number; conv: number; last_day: string }>();
  for (const r of inp.searchTerms) {
    const q = H.tok(str(r.term));
    if (!q.length) continue;
    const key = [str(r.campaign), str(r.ad_group), join(q)].join("\u0001");
    const e = st.get(key) ?? { campaign: str(r.campaign), ad_group: str(r.ad_group), term: join(q), q, clicks: 0, cost: 0, conv: 0, last_day: "" };
    e.clicks += num(r.clicks); e.cost += num(r.cost); e.conv += num(r.conv);
    if (str(r.day) > e.last_day) e.last_day = str(r.day);
    st.set(key, e);
  }
  for (const s of st.values()) {
    if (s.conv <= 0 || excluded.has(s.campaign + "\u0001" + s.term)) continue;
    for (const n of scoped(blockersOf(s.campaign, s.q), s.ad_group)) {
      const r = riskOf(n);
      r.conv_searches.push({ term: s.term, ad_group: s.ad_group, clicks: s.clicks, cost: Math.round(s.cost * 100) / 100, conv: Math.round(s.conv * 100) / 100, last_day: s.last_day });
      r.conv = Math.round((r.conv + s.conv) * 100) / 100;
    }
  }
  for (const r of risk.values()) { r.keywords.sort(); r.conv_searches.sort((a, b) => b.conv - a.conv || b.cost - a.cost); }

  // the sheet's Exclude calls: is the search blocked in the account today?
  const calls: InvCall[] = [];
  const addConflicts: InvAddConflict[] = [];
  for (const c of inp.calls) {
    const d = str(c.decision), camp = str(c.campaign), ag = str(c.ad_group), q = H.tok(str(c.term));
    if (!q.length || (d !== "Exclude" && d !== "Add")) continue;
    const all = blockersOf(camp, q), here = scoped(all, ag);
    const pick = (ns: InvNeg[]) => ns.sort((a, b) => (a.ad_group ? 1 : 0) - (b.ad_group ? 1 : 0) || a.words.length - b.words.length)[0];
    if (d === "Add") {
      if (here.length) {
        const n = pick(here);
        addConflicts.push({ day: str(c.day), project: projectOf(camp), campaign: camp, ad_group: ag, term: str(c.term), cost: num(c.cost), conv: num(c.conv), by: n.text, by_level: level(n) });
      }
      continue;
    }
    const n = here.length ? pick(here) : all.length ? pick(all) : null;
    calls.push({
      day: str(c.day), project: projectOf(camp), campaign: camp, ad_group: ag, term: str(c.term), cost: num(c.cost), clicks: num(c.clicks), written: str(c.neg_term).trim(),
      in_account: here.length ? "blocked_here" : all.length ? "blocked_other_ad_group" : "not_found",
      by: n?.text ?? "", by_level: n ? level(n) : "", by_ad_group: n?.ad_group ?? "", lists: listsOf.get(camp) ?? [],
    });
  }
  calls.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.cost - a.cost));
  addConflicts.sort((a, b) => b.conv - a.conv || b.cost - a.cost);

  const risky = [...risk.values()].filter((r) => r.keywords.length || r.conv > 0)
    .sort((a, b) => b.conv - a.conv || b.keywords.length - a.keywords.length);
  const oneWord = inv.negatives.filter((n) => n.words.length === 1 && n.match !== "exact").map((n) => {
    const r = risk.get(n);
    const a = added.get(nKey(n));
    return { text: n.text, match: n.match, campaign: n.campaign, ad_group: n.ad_group, level: level(n), project: projectOf(n.campaign),
      added_on: a?.day ?? "", added_by: a?.user ?? "", keywords: r?.keywords.length ?? 0, conv: r?.conv ?? 0 };
  }).sort((a, b) => b.conv - a.conv || b.keywords - a.keywords);

  return {
    as_of: inv.as_of, name: inv.name, total: inv.negatives.length, lists: inv.lists,
    campaigns: [...camps.values()].sort((a, b) => b.total - a.total),
    risky, one_word: oneWord, calls, add_conflicts: addConflicts,
  };
}

export type InvAnalysis = ReturnType<typeof analyseInventory>;
