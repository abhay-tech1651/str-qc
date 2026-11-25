import "server-only";
import fs from "node:fs";
import path from "node:path";
import { engineHelpers } from "./engine";
import { config, getModel, readInventory, readTable, todayIST } from "./store";
import { buildLedger, type IntentRules, type Ledger, type Outcome, type Search } from "./ledger-core";
import { getInventory } from "./neg-inventory";
import { buildFollowup, COUNTY_KEEP, whoOf, withListNegatives, type FollowupResult } from "./followup-core";
import { repoRoot } from "./root";

/** config/intent.json: the words that tell how much a search wants one of our homes (edit the file, not the code). */
function intentRules(): IntentRules | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot(), "config", "intent.json"), "utf8")) as IntentRules;
  } catch {
    return null;
  }
}

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
  const tables = { searchTerms: readTable("search_terms"), calls: readTable("agency_calls"), keywords: readTable("keywords"), changes: readTable("changes") };
  // shared-list words seen going in through the change history count as campaign-level negatives of every campaign using the list
  const inv = withListNegatives(engineHelpers(), readInventory(), tables.changes);
  const intent = intentRules();
  const key = [d.first, to, inv?.exported_ms ?? inv?.as_of ?? "", inv?.negatives.length ?? 0, JSON.stringify(intent).length, ...Object.values(tables).map((t) => t.length)].join("|");
  if (cache?.key === key) return cache.out;
  const out = buildLedger(engineHelpers(), { ...tables, inv, intent, from: d.first, to, grace: getModel().agency?.grace_days ?? 3, projectOf: projectOfFn() });
  cache = { key, out };
  return out;
}

/**
 * The day the data describes: the newest of the negative keyword report, the change history's end and its last line.
 * Deadlines are judged on this day, not on today's clock: the account is only known as it was when it was exported.
 */
export function dataAsOf(): string {
  const changes = readTable("changes");
  const lastChange = changes.reduce((m, c) => (String(c.day ?? "") > m ? String(c.day) : m), "");
  return [readInventory()?.as_of ?? "", String(config().changes_through ?? ""), lastChange].sort().pop() || todayIST();
}

let fcache: { led: Ledger; out: FollowupResult } | null = null;
/** Follow-through of every sheet call (followup-core.ts): when it went in, who did it, where, and what the delay cost. */
export function getFollowup(led: Ledger): FollowupResult {
  if (fcache?.led === led) return fcache.out;
  const changes = readTable("changes");
  const inv = withListNegatives(engineHelpers(), readInventory(), changes);
  const asOf = dataAsOf();
  const out = buildFollowup(engineHelpers(), led, { inv, changes, searchTerms: readTable("search_terms"), keywords: readTable("keywords"), asOf });
  fcache = { led, out };
  return out;
}

/* ------------------------------------------------------------------ the fix list: one row per thing to do, with where to do it */

export type FixType = "junk_open" | "add_open" | "add_blocked" | "county_comment" | "neg_blocks_good" | "results_blocked" | "keyword_blocked" | "not_reviewed" | "ctm";
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
  /** the agency's deadline (sheet day + grace days); "" for problems already in the account (fix now) and County's decisions */
  due: string;
  /** a sheet call past its deadline today */
  overdue: boolean;
  /** for a negative that blocks what we want: the negative itself, and what to do instead */
  neg?: string;
  instead?: string;
}

const negPath = (campaign: string, adGroup: string) =>
  adGroup ? `Campaigns › ${campaign} › ${adGroup} › Keywords › Negative keywords` : `Campaigns › ${campaign} › Keywords › Negative keywords (campaign level)`;
const kwPath = (campaign: string, adGroup: string) => `Campaigns › ${campaign} › ${adGroup || "(ad group)"} › Keywords › Search keywords`;

export const FIX_TYPES: { type: FixType; title: string; who: string; why: string }[] = [
  { type: "junk_open", title: "Junk searches still not blocked", who: "Agency", why: "The sheet said Exclude, but no negative in the campaign or its ad group blocks the search, so it can keep costing money." },
  { type: "add_open", title: "Adds not done", who: "Agency", why: "The sheet said Add, but the search is not a keyword in that campaign." },
  { type: "add_blocked", title: "Adds blocked by a negative", who: "Agency", why: "The sheet said Add, but a negative in the account blocks this search, so it cannot show even as a keyword." },
  { type: "county_comment", title: "County comments not answered", who: "Agency", why: "County wrote a comment on these searches, but the sheet and the account do not follow it yet: the search was left as it is, or the sheet still says Exclude where County asked to add it or not to exclude it. Answer in the sheet and change the Status." },
  { type: "neg_blocks_good", title: "Negatives blocking searches we want", who: "Agency", why: "A single word (or a short phrase) in broad or phrase match blocks every search that contains it. Each negative here also blocks a high- or medium-intent search (our location with a buying word, or a city with a buying word) that converted, that the sheet said to Add, or that is our keyword. Take it out and negate the junk searches it was added for one by one, by their full search term, so nothing we want is caught. Negatives that only block low-intent searches (another builder's project or group) and County's other project names are left out on purpose." },
  { type: "keyword_blocked", title: "Negatives switching off our keywords", who: "Agency", why: "A campaign-wide negative blocks keywords that are enabled in the same campaign: those keywords cannot show for the searches they were bought for." },
  { type: "results_blocked", title: "Searches with conversions now blocked", who: "County to decide", why: "These searches brought a conversion (Google's count, not a CRM lead), but a negative now blocks them, and either the sheet never asked to exclude them or they show buying intent. Left out on purpose: the sheet's own Excludes of low-intent searches (another builder's project, done as asked) and County's other project names." },
  { type: "not_reviewed", title: "Searches missing from the sheet", who: "Agency", why: "They cost money in the period but are in no tab of the STR sheet, so nobody has judged them." },
  { type: "ctm", title: "Google's CTM campaign", who: "Google's CTM team (through County)", why: "Sheet calls in the CTM campaign, which Google's team runs: Excludes not blocked and Adds not done there. They go to Google's team through County, so they carry no agency deadline. County put the CTM Adds on hold on 25 Nov until November is compared with Ivory Non-brand." },
];

export function fixList(led: Ledger): FixItem[] {
  // deadlines are judged on the day the data describes, the same day the follow-through uses
  const today = dataAsOf();
  const addDays = (d: string, n: number) => (d ? new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10) : "");
  const rows: Omit<FixItem, "due" | "overdue">[] = [];
  const out = { push: (f: Omit<FixItem, "due" | "overdue">) => rows.push(f) };
  // negatives that block searches we want are listed once per negative (below), so an Add they block is not listed again
  const costlyKey = new Set(led.costly_negatives.map((n) => `${n.campaign}${n.ad_group}${n.text.toLowerCase()}`));
  // County asked to keep or add it (so it must not be excluded)
  const KEEP = COUNTY_KEEP;
  const listNote = (s: Search) => (s.lists.length ? `If it is in one of the ${s.lists.length} shared lists on this campaign, say which.` : "");
  const intentNote = (s: Search) => (s.intent ? `Intent: ${s.intent} (${s.intent_why}).` : "");
  for (const s of led.searches) {
    const ag = s.ad_groups[0] ?? "";
    const blk = s.blockers[0];
    const cc = s.county_comment;
    const ccNote = cc ? `County wrote: "${cc}".` : "";
    // decide by the sheet's call and the account, not by the money part: an Exclude that converted once is still an Exclude
    const exOpen = s.verdict === "Exclude" && s.blocked !== "yes";
    const ctm = s.kind === "Run by Google (CTM)";
    if (cc && ((exOpen && KEEP.test(cc)) || s.outcome === "kept" || s.outcome === "blocked_anyway" || s.outcome === "discuss")) {
      const what = exOpen ? `The sheet still says Exclude${s.neg_written ? ` with ${s.neg_written}` : ""}, but County asked otherwise`
        : s.outcome === "blocked_anyway" ? `The sheet left it as it is, and ${blk ? `-${blk.text}` : "a negative"} blocks it`
        : s.outcome === "discuss" ? "The sheet says Discuss" : "The sheet left it as it is";
      out.push({ type: "county_comment", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: `${what}: answer County in the sheet and act on it`, where: "STR sheet, then Google Ads", cost: s.cost, conv: s.conv, since: s.call_day || s.first_day, note: [ccNote, intentNote(s)].filter(Boolean).join(" ") });
      continue;
    }
    if (exOpen) {
      // County's rule: negate the search term itself (or a part of two or more words), never a single word
      const okWritten = s.neg_written_kind === "term" || s.neg_written_kind === "part";
      const neg = okWritten ? s.neg_written : `"${s.term}"`;
      const why = okWritten ? "" : s.neg_written_kind === "one_word" ? ` (the sheet wrote one word, ${s.neg_written}: use the full search term)` : s.neg_written ? ` (the sheet wrote ${s.neg_written}, which is not in the search)` : " (the sheet wrote no negative)";
      const partly = s.blocked === "partly" ? `Blocked only in ${s.blockers.map((b) => b.ad_group).filter(Boolean).join(", ")}; it also ran in ${s.ad_groups.filter((g) => !s.blockers.some((b) => b.ad_group === g)).join(", ")}.` : "";
      out.push({ type: ctm ? "ctm" : "junk_open", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: `Add negative ${neg}${why}`, where: negPath(s.campaign, ""),
        cost: s.cost, conv: s.conv, since: s.call_day, note: [partly, listNote(s), ccNote].filter(Boolean).join(" ") });
    } else if (s.verdict === "Add" && s.blocked !== "yes" && !s.is_keyword && !s.sop_brand) {
      out.push({ type: ctm ? "ctm" : "add_open", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: `Add keyword "${s.term}"`, where: kwPath(s.campaign, ag), cost: s.cost, conv: s.conv, since: s.call_day, note: [intentNote(s), ccNote].filter(Boolean).join(" ") });
    } else if (s.verdict === "Add" && s.blocked === "yes" && blk && !blk.county_rule && !blk.sop_brand && !s.sop_brand && !costlyKey.has(`${s.campaign}${blk.ad_group}${blk.text.toLowerCase()}`)) {
      out.push({ type: ctm ? "ctm" : "add_blocked", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: `Remove or narrow negative ${blk.text} (${blk.level}${blk.ad_group ? ` ${blk.ad_group}` : ""})`, where: negPath(s.campaign, blk.ad_group),
        cost: s.cost, conv: s.conv, since: s.call_day, note: s.is_keyword ? "It is a keyword already, but the negative stops it." : "" });
    } else if (s.outcome === "results_blocked" && blk && !blk.county_rule && !blk.sop_brand && !s.sop_brand && !(s.verdict === "Exclude" && s.intent === "low")) {
      out.push({ type: "results_blocked", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: `Check negative ${blk.text} (${blk.level}${blk.ad_group ? ` ${blk.ad_group}` : ""})`, where: negPath(s.campaign, blk.ad_group),
        cost: s.cost, conv: s.conv, since: s.call_day || s.last_day, note: [s.verdict === "Exclude" ? `The sheet said Exclude on ${s.call_day}.` : "The sheet never asked to exclude it.", intentNote(s)].join(" ") });
    } else if (s.outcome === "not_reviewed") {
      out.push({ type: "not_reviewed", id: s.id, project: s.project, campaign: s.campaign, ad_group: ag, term: s.term,
        todo: "Review it in the sheet: Add, Exclude or leave", where: "STR sheet", cost: s.cost, conv: s.conv, since: s.first_day, note: "" });
    }
  }
  // negatives that also block searches we want: swap each for the junk searches it was meant for
  const addedOn = negAddedOn();
  const done = new Set<string>();
  for (const n of led.costly_negatives) {
    const key = `${n.campaign}${n.ad_group}${n.text.toLowerCase()}`;
    if (done.has(key)) continue;
    done.add(key);
    if (n.top_intent === "low") continue; // it only blocks low-intent searches (another builder's project or group): fine
    const a = addedOn.get(key) ?? addedOn.get(`${n.campaign}${n.text.toLowerCase()}`);
    const goodList = n.good.slice(0, 5).map((g) => `${g.term} (${g.conv > 0 ? `${Math.round(g.conv * 10) / 10} conv` : g.why}${g.intent ? `, ${g.intent} intent` : ""})`).join(", ") + (n.good.length > 5 ? ` and ${n.good.length - 5} more` : "");
    const swap = n.junk_terms.slice(0, 4).map((t) => `"${t}"`).join(", ") + (n.junk_terms.length > 4 ? ` and ${n.junk_terms.length - 4} more` : "");
    out.push({ type: "neg_blocks_good", id: `neg${key}`, project: n.project, campaign: n.campaign, ad_group: n.ad_group, term: goodList,
      todo: `Remove ${n.text}${n.words === 1 ? " (one word)" : ""}${n.junk ? `; negate instead the ${n.junk} junk search${n.junk === 1 ? "" : "es"} it blocks: ${swap}` : "; it blocks no search the sheet called junk"}`,
      where: negPath(n.campaign, n.ad_group), cost: n.good_cost, conv: n.good_conv, since: a?.day ?? "", note: a ? `Added by ${a.by}.` : "",
      neg: n.text + (n.list ? ` (shared list ${n.list})` : ""), instead: n.junk ? `Negate the ${n.junk} junk search${n.junk === 1 ? "" : "es"} it blocks by their full search: ${swap}` : "It blocks no search the sheet called junk: remove it" });
  }
  // negatives that switch off our own enabled keywords (campaign level), from the full negative list
  const inv = readInventory() ? getInventory() : null;
  // SOP rule 1: our brand words negated in a non-brand or competitor campaign send brand searches to the brand campaign
  const brandW = (intentRules()?.brand_words ?? []).map((w) => w.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean).join(" "));
  const sopBrand = (campaign: string, text: string) => /non[_ -]?brand|competitor/i.test(campaign) && !/ctm/i.test(campaign) && brandW.includes(text.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean).join(" "));
  for (const r of inv?.risky ?? []) {
    if (r.level !== "campaign" || !r.keywords.length || sopBrand(r.campaign, r.text)) continue;
    if (done.has(`${r.campaign}${r.text.toLowerCase()}`)) continue;
    out.push({ type: "keyword_blocked", id: `kw\u0001${r.campaign}\u0001${r.text}`, project: r.project, campaign: r.campaign, ad_group: "", term: r.keywords.slice(0, 6).join(", ") + (r.keywords.length > 6 ? ` and ${r.keywords.length - 6} more` : ""),
      todo: `Remove or narrow negative ${r.text} (blocks ${r.keywords.length} keyword${r.keywords.length === 1 ? "" : "s"})`, where: negPath(r.campaign, ""),
      cost: 0, conv: r.conv, since: r.added_on, note: r.added_by ? `Added by ${whoOf(r.added_by).who} (${whoOf(r.added_by).org}).` : "",
      neg: r.text, instead: `Remove it, or negate only the junk searches by their full search, so the ${r.keywords.length} keyword${r.keywords.length === 1 ? "" : "s"} can show again` });
  }
  // deadlines: a sheet call is due grace days after its tab; problems already in the account have no sheet deadline
  const SHEET: FixType[] = ["junk_open", "add_open", "add_blocked", "county_comment", "not_reviewed"];
  return rows.map((f) => {
    const due = SHEET.includes(f.type) ? addDays(f.since, led.grace) : "";
    return { ...f, due, overdue: !!due && today > due };
  });
}

/** When each negative was added, from the change history (campaign, ad group, text in lower case). */
function negAddedOn() {
  const m = new Map<string, { day: string; by: string }>();
  for (const c of readTable("changes")) {
    const kind = String(c.kind ?? "");
    if (!kind.startsWith("negative") || !kind.includes("keyword added")) continue;
    const text = String(c.item ?? "").replace(/^-/, "").trim().toLowerCase();
    const key = `${String(c.campaign ?? "")}${String(c.ad_group ?? "")}${text}`;
    const w = whoOf(String(c.user ?? ""));
    const by = `${w.who} (${w.org})`;
    if (!m.has(key)) m.set(key, { day: String(c.day ?? ""), by });
  }
  return m;
}

export type { Ledger, Outcome, Search };
