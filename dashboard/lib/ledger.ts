import "server-only";
import { engineHelpers } from "./engine";
import { getModel, readInventory, readTable } from "./store";
import { buildLedger, type Ledger, type Outcome, type Search } from "./ledger-core";
import { getInventory } from "./neg-inventory";

/**
 * The search-term ledger for the pages: every search from the first day of the agency sheet up to a chosen day
 * ("checked up to"), with what the sheet said and what is in Google Ads now. See ledger-core.ts for the rules.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

let cache: { key: string; out: Ledger } | null = null;

/** Sheet days that also have Google's search terms, and the default "checked up to" day: the newest of them. */
export function ledgerDays() {
  const calls = readTable("agency_calls");
  const days = [...new Set(calls.map((c) => String(c.day ?? "")).filter((d) => ISO.test(d)))].sort();
  const stDays = readTable("search_terms").map((r) => String(r.day ?? "")).filter((d) => ISO.test(d)).sort();
  const stLast = stDays[stDays.length - 1] ?? "";
  const usable = days.filter((d) => !stLast || d <= stLast);
  const def = usable[usable.length - 1] ?? "";
  return { days: usable, first: days[0] ?? "", default: def };
}

export function projectOfFn() {
  const m = getModel();
  const proj = new Map(m.campaigns.map((c) => [c.id, c.project as string]));
  return (c: string) => proj.get(c) ?? (/ivory/i.test(c) ? "ivory" : /clove/i.test(c) ? "clove" : /cocoa/i.test(c) ? "cocoa" : /jade/i.test(c) ? "jade" : "other");
}

export function getLedger(toParam?: string | null): Ledger | null {
  const d = ledgerDays();
  if (!d.days.length) return null;
  const to = toParam && ISO.test(toParam) && d.days.includes(toParam) ? toParam : d.default;
  const inv = readInventory();
  const tables = { searchTerms: readTable("search_terms"), calls: readTable("agency_calls"), keywords: readTable("keywords"), changes: readTable("changes") };
  const key = [d.first, to, inv?.exported_ms ?? inv?.as_of ?? "", inv?.negatives.length ?? 0, ...Object.values(tables).map((t) => t.length)].join("|");
  if (cache?.key === key) return cache.out;
  const out = buildLedger(engineHelpers(), { ...tables, inv, from: d.first, to, grace: getModel().agency?.grace_days ?? 3, projectOf: projectOfFn() });
  cache = { key, out };
  return out;
}

/* ------------------------------------------------------------------ the fix list: one row per thing to do, with where to do it */

export type FixType = "junk_open" | "add_open" | "add_blocked" | "results_blocked" | "keyword_blocked" | "not_reviewed";
export interface FixItem {
  type: FixType;
  id: string;
  project: string;
  campaign: string;
  ad_group: string;
  term: string;
  todo: string;
  where: string;
  cost: number;
  conv: number;
  since: string;
  note: string;
}

const negPath = (campaign: string, adGroup: string) =>
  adGroup ? `Campaigns › ${campaign} › ${adGroup} › Keywords › Negative keywords` : `Campaigns › ${campaign} › Keywords › Negative keywords (campaign level)`;
const kwPath = (campaign: string, adGroup: string) => `Campaigns › ${campaign} › ${adGroup || "(ad group)"} › Keywords › Search keywords`;

export const FIX_TYPES: { type: FixType; title: string; who: string; why: string }[] = [
  { type: "junk_open", title: "Junk searches still not blocked", who: "Agency", why: "The sheet said Exclude, but no negative in the campaign or its ad group blocks the search, so it can keep costing money." },
  { type: "add_open", title: "Adds not done", who: "Agency", why: "The sheet said Add, but the search is not a keyword in that campaign." },
  { type: "add_blocked", title: "Adds blocked by a negative", who: "Agency", why: "The sheet said Add, but a negative in the account blocks this search, so it cannot show even as a keyword." },
  { type: "keyword_blocked", title: "Negatives switching off our keywords", who: "Agency", why: "A campaign-wide negative blocks keywords that are enabled in the same campaign: those keywords cannot show for the searches they were bought for." },
  { type: "results_blocked", title: "Searches with conversions now blocked", who: "County to decide", why: "These searches brought conversions (Google's count), but a negative now blocks them. Check that this was meant." },
  { type: "not_reviewed", title: "Searches missing from the sheet", who: "Agency", why: "They cost money in the period but are in no tab of the STR sheet, so nobody has judged them." },
];

export function fixList(led: Ledger): FixItem[] {
  const out: FixItem[] = [];
  const listNote = (s: Search) => (s.lists.length ? `If it is in one of the ${s.lists.length} shared lists on this campaign, say which.` : "");
  for (const s of led.searches) {
    const ag = s.ad_groups[0] ?? "";
    const blk = s.blockers[0];
    if (s.outcome === "junk_open") {
      const neg = s.neg_written || `[${s.term}]`;
      const partly = s.blocked === "partly" ? `Blocked only in ${s.blockers.map((b) => b.ad_group).filter(Boolean).join(", ")}; it also ran in ${s.ad_groups.filter((g) => !s.blockers.some((b) => b.ad_group === g)).join(", ")}.` : "";
      out.push({ type: "junk_open", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: `Add negative ${neg}${s.neg_written ? "" : " (the sheet wrote no negative)"}`, where: negPath(s.campaign, ""),
        cost: s.cost, conv: s.conv, since: s.call_day, note: [partly, listNote(s)].filter(Boolean).join(" ") });
    } else if (s.outcome === "add_open") {
      out.push({ type: "add_open", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: `Add keyword "${s.term}"`, where: kwPath(s.campaign, ag), cost: s.cost, conv: s.conv, since: s.call_day, note: "" });
    } else if (s.outcome === "add_blocked" && blk) {
      out.push({ type: "add_blocked", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: `Remove or narrow negative ${blk.text} (${blk.level}${blk.ad_group ? ` ${blk.ad_group}` : ""})`, where: negPath(s.campaign, blk.ad_group),
        cost: s.cost, conv: s.conv, since: s.call_day, note: s.is_keyword ? "It is a keyword already, but the negative stops it." : "" });
    } else if (s.outcome === "results_blocked" && blk) {
      out.push({ type: "results_blocked", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: `Check negative ${blk.text} (${blk.level}${blk.ad_group ? ` ${blk.ad_group}` : ""})`, where: negPath(s.campaign, blk.ad_group),
        cost: s.cost, conv: s.conv, since: s.call_day || s.last_day, note: s.verdict === "Exclude" ? `The sheet said Exclude on ${s.call_day}.` : "The sheet never asked to exclude it." });
    } else if (s.outcome === "not_reviewed") {
      out.push({ type: "not_reviewed", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: "Review it in the sheet: Add, Exclude or leave", where: "STR sheet", cost: s.cost, conv: s.conv, since: s.first_day, note: "" });
    }
  }
  // negatives that switch off our own enabled keywords (campaign level), from the full negative list
  const inv = readInventory() ? getInventory() : null;
  for (const r of inv?.risky ?? []) {
    if (r.level !== "campaign" || !r.keywords.length) continue;
    out.push({ type: "keyword_blocked", id: `kw\u0001${r.campaign}\u0001${r.text}`, project: r.project, campaign: r.campaign, ad_group: "", term: r.keywords.slice(0, 6).join(", ") + (r.keywords.length > 6 ? ` and ${r.keywords.length - 6} more` : ""),
      todo: `Remove or narrow negative ${r.text} (blocks ${r.keywords.length} keyword${r.keywords.length === 1 ? "" : "s"})`, where: negPath(r.campaign, ""),
      cost: 0, conv: r.conv, since: r.added_on, note: r.added_by ? `Added by ${r.added_by}${r.added_on ? ` on ${r.added_on}` : ""}.` : "" });
  }
  return out;
}

export type { Ledger, Outcome, Search };
