/**
 * Negatives as written: for every Exclude call in the agency sheet, what the agency wrote (the whole search, part of it,
 * or one word), what actually went into Google Ads, and what else that negative now blocks (our own keywords and
 * searches that brought conversions). No imports: the engine's own helpers are passed in, so this runs the same in the
 * dashboard and in a plain Node check.
 */

export type Helpers = {
  tok: (s: string) => string[];
  parseNegative: (s: string) => [string, string[]];
  blocks: (match: string, words: string[], q: string[]) => boolean;
};

type Row = Record<string, unknown>;

export type WordKind = "full" | "part" | "one_word" | "different" | "none";
export type CallStatus = "applied" | "applied_elsewhere" | "waiting" | "not_applied" | "unchecked";

export interface NegHit { term: string; clicks: number; cost: number; conv: number; last_day: string }

export interface NegCall {
  day: string; project: string; campaign: string; ad_group: string; term: string; clicks: number; cost: number; comment: string;
  written: string; written_kind: WordKind;
  status: CallStatus; applied_as: string; applied_kind: WordKind | ""; applied_match: string; applied_level: string;
  applied_ad_group: string; applied_on: string; applied_by: string; same_as_written: boolean | null;
  /** id of the negative in `negatives`, when one was found */
  neg_id: string;
  blocks_keywords: number; blocks_conv_searches: number; blocks_conv: number;
}

export interface NegItem {
  id: string; day: string; user: string; project: string; campaign: string; ad_group: string; level: "campaign" | "ad group";
  item: string; match: string; words: number;
  /** sheet calls this negative answered */
  calls: number; call_terms: string[];
  /** our own keywords (keyword report and keywords added in the change history) this negative blocks */
  keywords: string[];
  /** searches it blocks that the sheet never asked to exclude */
  other_searches: number; other_cost: number;
  /** of those, searches that brought at least one conversion */
  conv_searches: NegHit[]; conv: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

export function wordKind(H: Helpers, neg: string, term: string): WordKind {
  const w = H.tok(neg), q = H.tok(term);
  if (!w.length) return "none";
  if (w.join(" ") === q.join(" ")) return "full";
  if (!w.every((x) => q.includes(x))) return "different";
  return w.length === 1 ? "one_word" : "part";
}

export function analyseNegatives(H: Helpers, inp: {
  calls: Row[]; changes: Row[]; searchTerms: Row[]; keywords: Row[];
  projectOf: (campaign: string) => string; grace: number; changesFrom: string; lastChange: string;
}) {
  const { projectOf, grace, changesFrom, lastChange } = inp;
  const agIn = (nAg: string, ag: string) => nAg === "" || nAg === ag;

  // negatives added, oldest first, per campaign
  const negs = inp.changes
    .filter((x) => { const k = str(x.kind); return k.startsWith("negative") && k.includes("keyword added"); })
    .map((x) => {
      const [match, words] = H.parseNegative(str(x.item));
      const campaign = str(x.campaign), ad_group = str(x.ad_group);
      return { id: [str(x.ts), campaign, ad_group, str(x.item)].join("|"), ts: str(x.ts), day: str(x.day), user: str(x.user).split("@")[0],
        campaign, ad_group, item: str(x.item), match, words };
    })
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.id < b.id ? -1 : 1));
  const byCamp = new Map<string, typeof negs>();
  for (const n of negs) { if (!byCamp.has(n.campaign)) byCamp.set(n.campaign, []); byCamp.get(n.campaign)!.push(n); }

  // Exclude terms per campaign (any day): searches the sheet itself asked to block are not collateral
  const excluded = new Map<string, Set<string>>();
  for (const c of inp.calls) {
    if (str(c.decision) !== "Exclude") continue;
    const camp = str(c.campaign);
    if (!excluded.has(camp)) excluded.set(camp, new Set());
    excluded.get(camp)!.add(H.tok(str(c.term)).join(" "));
  }

  // our keywords per campaign: the keyword report plus keywords added in the change history
  const kwByCamp = new Map<string, Map<string, { ad_group: string; text: string; q: string[] }>>();
  const addKw = (camp: string, ag: string, text: string) => {
    const q = H.tok(text);
    if (!q.length || /Headline|Asset ID|Path /.test(text)) return;
    if (!kwByCamp.has(camp)) kwByCamp.set(camp, new Map());
    kwByCamp.get(camp)!.set(ag + "\u0001" + q.join(" "), { ad_group: ag, text: q.join(" "), q });
  };
  for (const k of inp.keywords) {
    // paused keywords do not run, so a negative over them costs nothing today
    if (str(k.keyword_status) !== "Enabled" || str(k.campaign) === "(all)" || !str(k.campaign)) continue;
    addKw(str(k.campaign), str(k.ad_group), str(k.keyword));
  }
  for (const x of inp.changes) {
    const k = str(x.kind);
    if (k.includes("match keyword added") && !k.startsWith("negative")) addKw(str(x.campaign), str(x.ad_group), str(x.item));
  }

  // search terms per campaign, summed per (ad group, term)
  const stByCamp = new Map<string, Map<string, { ad_group: string; term: string; q: string[]; clicks: number; cost: number; conv: number; last_day: string }>>();
  for (const r of inp.searchTerms) {
    const camp = str(r.campaign), ag = str(r.ad_group), t = H.tok(str(r.term)).join(" ");
    if (!t) continue;
    if (!stByCamp.has(camp)) stByCamp.set(camp, new Map());
    const m = stByCamp.get(camp)!, key = ag + "\u0001" + t;
    const e = m.get(key) ?? { ad_group: ag, term: t, q: t.split(" "), clicks: 0, cost: 0, conv: 0, last_day: "" };
    e.clicks += num(r.clicks); e.cost += num(r.cost); e.conv += num(r.conv);
    if (str(r.day) > e.last_day) e.last_day = str(r.day);
    m.set(key, e);
  }

  // what each negative blocks
  const items = new Map<string, NegItem>();
  const itemFor = (n: (typeof negs)[number]): NegItem => {
    let it = items.get(n.id);
    if (it) return it;
    const keywords = [...(kwByCamp.get(n.campaign)?.values() ?? [])]
      .filter((k) => agIn(n.ad_group, k.ad_group) && H.blocks(n.match, n.words, k.q))
      .map((k) => (n.ad_group ? k.text : k.ad_group ? `${k.text} (${k.ad_group})` : k.text));
    const ex = excluded.get(n.campaign) ?? new Set<string>();
    const hitByTerm = new Map<string, NegHit>();
    for (const s of stByCamp.get(n.campaign)?.values() ?? []) {
      if (!agIn(n.ad_group, s.ad_group) || ex.has(s.term) || !H.blocks(n.match, n.words, s.q)) continue;
      const h = hitByTerm.get(s.term) ?? { term: s.term, clicks: 0, cost: 0, conv: 0, last_day: "" };
      h.clicks += s.clicks; h.cost += s.cost; h.conv += s.conv;
      if (s.last_day > h.last_day) h.last_day = s.last_day;
      hitByTerm.set(s.term, h);
    }
    const hits = [...hitByTerm.values()];
    const conv = hits.filter((h) => h.conv > 0).sort((a, b) => b.conv - a.conv || b.cost - a.cost);
    it = {
      id: n.id, day: n.day, user: n.user, project: projectOf(n.campaign), campaign: n.campaign, ad_group: n.ad_group,
      level: n.ad_group ? "ad group" : "campaign", item: n.item, match: n.match, words: n.words.length,
      calls: 0, call_terms: [], keywords: [...new Set(keywords)].sort(),
      other_searches: hits.length, other_cost: Math.round(hits.reduce((s, h) => s + h.cost, 0) * 100) / 100,
      conv_searches: conv.map((h) => ({ ...h, cost: Math.round(h.cost * 100) / 100 })),
      conv: Math.round(conv.reduce((s, h) => s + h.conv, 0) * 100) / 100,
    };
    items.set(n.id, it);
    return it;
  };
  // every negative added in a campaign the sheet covers is listed, even if no call asked for it
  const sheetCamps = new Set(inp.calls.map((c) => str(c.campaign)));
  for (const n of negs) if (sheetCamps.has(n.campaign)) itemFor(n);

  const covered = (day: string) => !!changesFrom && addDays(day, -1) >= changesFrom;
  const calls: NegCall[] = [];
  for (const c of inp.calls) {
    if (str(c.decision) !== "Exclude") continue;
    const day = str(c.day), term = str(c.term), camp = str(c.campaign), ag = str(c.ad_group);
    const q = H.tok(term), start = addDays(day, -1);
    let hit: (typeof negs)[number] | null = null, other: (typeof negs)[number] | null = null;
    for (const n of byCamp.get(camp) ?? []) {
      if (n.day < start || !H.blocks(n.match, n.words, q)) continue;
      if (agIn(n.ad_group, ag)) { hit = n; break; }
      other = other ?? n;
    }
    const n = hit ?? other;
    let status: CallStatus;
    if (hit) status = "applied";
    else if (other) status = "applied_elsewhere";
    else if (!covered(day)) status = "unchecked";
    else status = lastChange && daysBetween(day, lastChange) <= grace ? "waiting" : "not_applied";
    const written = str(c.neg_term).trim();
    const it = n ? itemFor(n) : null;
    if (it) { it.calls += 1; if (!it.call_terms.includes(term)) it.call_terms.push(term); }
    calls.push({
      day, project: projectOf(camp), campaign: camp, ad_group: ag, term, clicks: num(c.clicks), cost: num(c.cost), comment: str(c.county_comment),
      written, written_kind: wordKind(H, written, term),
      status, applied_as: n?.item ?? "", applied_kind: n ? wordKind(H, n.item, term) : "", applied_match: n?.match ?? "",
      applied_level: n ? (n.ad_group ? "ad group" : "campaign") : "", applied_ad_group: n?.ad_group ?? "",
      applied_on: n?.day ?? "", applied_by: n?.user ?? "",
      same_as_written: n && written ? H.tok(n.item).join(" ") === H.tok(written).join(" ") : null,
      neg_id: n?.id ?? "",
      blocks_keywords: it?.keywords.length ?? 0, blocks_conv_searches: it?.conv_searches.length ?? 0, blocks_conv: it?.conv ?? 0,
    });
  }
  calls.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.cost - a.cost));
  const negatives = [...items.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.conv - a.conv));
  return { calls, negatives, grace, changes_from: changesFrom, last_change: lastChange };
}

export type NegAnalysis = ReturnType<typeof analyseNegatives>;
