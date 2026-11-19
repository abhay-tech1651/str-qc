import "server-only";
import { getModel, loadedFiles, readInventory, readTable, todayIST } from "./store";
import { getNegatives } from "./negatives";
import { getInventory } from "./neg-inventory";

/**
 * The facts the Today and Meeting pages show, computed once from the stored tables. Every number here can be traced to
 * rows in a Google Ads export or the agency sheet; each claim carries where to check it in Google Ads.
 */

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface Fresh { source: string; last: string | null; behind: number | null; ok: boolean; cadence: string; how: string }

export interface DayRow { day: string; calls: number; cost: number; on_time: number; late: number; not_done: number; waiting: number; unchecked: number; answered_on: string[] }

export interface Claim {
  id: string; title: string; detail: string; number: string; tone: "bad" | "warn" | "good" | "info";
  check: string; examples: { cells: string[] }[]; columns: string[]; href: string;
}

export function getBrief() {
  const m = getModel();
  const neg = getNegatives();
  const inv = getInventory();
  const today = todayIST(), yesterday = addDays(today, -1);
  const grace = m.agency.grace_days;

  // ---- how fresh each source is
  const changesTo = [m.data.changes?.to, m.agency.last_change_day, ...loadedFiles().filter((f) => f.kind === "changes" && f.covers_to).map((f) => f.covers_to)]
    .filter(Boolean).map(String).sort().pop() ?? null;
  const fresh = (source: string, last: string | null | undefined, cadence: "daily" | "weekly", how: string): Fresh => {
    const l = last ?? null;
    const behind = l ? Math.max(0, daysBetween(l, yesterday)) : null;
    return { source, last: l, behind, ok: behind !== null && behind <= (cadence === "daily" ? 0 : 7), cadence: cadence === "daily" ? "every morning" : "once a week", how };
  };
  const freshness: Fresh[] = [
    fresh("Search terms", m.data.search_terms?.to, "daily", "Campaigns › Insights and reports › Search terms"),
    fresh("Change history", changesTo && changesTo > yesterday ? yesterday : changesTo, "daily", "Campaigns › Change history"),
    fresh("Agency STR sheet", m.data.agency_sheet?.to, "daily", "Import data › Refresh the agency sheet"),
    fresh("Campaign report", m.data.campaign_days?.complete_through, "weekly", "Campaigns › Campaigns, Segment › Time › Day"),
    fresh("Keyword report", m.data.keywords?.to, "weekly", "Audiences, keywords and content › Search keywords"),
    fresh("All negatives (negative keyword report)", readInventory()?.as_of ?? null, "weekly", "Audiences, keywords and content › Search keywords › Negative search keywords"),
  ];

  // ---- on time: an Exclude call counts as on time when its negative went in within the grace days
  const calls = neg.calls;
  const lagOf = (c: (typeof calls)[number]) => Math.max(0, daysBetween(c.day, c.applied_on));
  const done = (c: (typeof calls)[number]) => c.status === "applied" || c.status === "applied_elsewhere";
  const on = calls.filter((c) => done(c) && lagOf(c) <= grace);
  const late = calls.filter((c) => done(c) && lagOf(c) > grace);
  const never = calls.filter((c) => c.status === "not_applied");
  const waiting = calls.filter((c) => c.status === "waiting");
  const judged = on.length + late.length + never.length;
  const onTimePct = judged ? (100 * on.length) / judged : null;
  const appliedPct = judged ? (100 * (on.length + late.length)) / judged : null;
  const sum = (rows: { cost: number }[]) => r2(rows.reduce((s, r) => s + r.cost, 0));

  const byProject = m.projects.map((p) => {
    const f = (rows: typeof calls) => rows.filter((c) => c.project === p.id);
    const j = f(on).length + f(late).length + f(never).length;
    return { id: p.id, name: p.name.replace(" County", ""), calls: f(calls).length, on_time: f(on).length, late: f(late).length, not_done: f(never).length,
      not_done_cost: sum(f(never)), waiting: f(waiting).length, on_time_pct: j ? (100 * f(on).length) / j : null };
  });

  // ---- each sheet day: how its calls were handled, and on which days the negatives went in
  const dayMap = new Map<string, DayRow>();
  for (const c of calls) {
    const d = dayMap.get(c.day) ?? { day: c.day, calls: 0, cost: 0, on_time: 0, late: 0, not_done: 0, waiting: 0, unchecked: 0, answered_on: [] };
    d.calls++; d.cost = r2(d.cost + c.cost);
    if (done(c)) { if (lagOf(c) <= grace) d.on_time++; else d.late++; if (!d.answered_on.includes(c.applied_on)) d.answered_on.push(c.applied_on); }
    else if (c.status === "not_applied") d.not_done++;
    else if (c.status === "waiting") d.waiting++;
    else d.unchecked++;
    dayMap.set(c.day, d);
  }
  const days = [...dayMap.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
  for (const d of days) d.answered_on.sort();

  // ---- the days negatives went in, and how many sheet calls each day answered
  const batches = new Map<string, { day: string; calls: number; sheet_days: Set<string> }>();
  for (const c of [...on, ...late]) {
    const b = batches.get(c.applied_on) ?? { day: c.applied_on, calls: 0, sheet_days: new Set<string>() };
    b.calls++; b.sheet_days.add(c.day);
    batches.set(c.applied_on, b);
  }
  const batchRows = [...batches.values()].sort((a, b) => (a.day < b.day ? 1 : -1))
    .map((b) => ({ day: b.day, calls: b.calls, sheet_days: [...b.sheet_days].sort() }));

  // ---- what changed in Google Ads since the start of yesterday
  const changes = readTable("changes") as Record<string, string>[];
  const recent = changes.filter((c) => String(c.day) >= yesterday);
  const group = (k: string) => {
    const s = k.toLowerCase();
    if (s.includes("conversion") || s.includes("goal")) return "Conversion tracking or goals changed (affects conversion counts)";
    if (s.startsWith("campaign paused") || s.startsWith("campaign active") || s.includes("campaign removed")) return "Campaigns paused or started";
    if (s.startsWith("negative") && s.includes("keyword added")) return "Negatives added";
    if (s.includes("keyword added")) return "Keywords added";
    if (s.includes("keyword") && (s.includes("paused") || s.includes("removed") || s.includes("status"))) return "Keywords paused or removed";
    if (s.includes("budget")) return "Budget changes";
    if (s.includes("bid") || s.includes("cpa") || s.includes("target")) return "Bid or target changes";
    if (s === "campaign changed") return "Campaign settings changed";
    if (s.includes("ad group")) return "Ad group changes";
    if (s.includes("ad ") || s.includes("asset") || s.includes("headline")) return "Ad and asset changes";
    return "Other changes";
  };
  const changeGroups = new Map<string, { what: string; count: number; by: Set<string>; campaigns: Set<string>; first: string; last: string }>();
  for (const c of recent) {
    const g = group(String(c.kind));
    const e = changeGroups.get(g) ?? { what: g, count: 0, by: new Set<string>(), campaigns: new Set<string>(), first: String(c.ts), last: String(c.ts) };
    e.count++; e.by.add(String(c.user).split("@")[0]); if (c.campaign) e.campaigns.add(String(c.campaign));
    if (String(c.ts) < e.first) e.first = String(c.ts);
    if (String(c.ts) > e.last) e.last = String(c.ts);
    changeGroups.set(g, e);
  }
  const sinceYesterday = [...changeGroups.values()].sort((a, b) => b.count - a.count)
    .map((g) => ({ what: g.what, count: g.count, by: [...g.by].join(", "), campaigns: g.campaigns.size, first: g.first, last: g.last }));

  // ---- the claims for the meeting, strongest first
  const claims: Claim[] = [];
  const lab = (c: string) => m.campaigns.find((x) => x.id === c)?.label ?? c;
  const dd = (d: string) => d.slice(8) + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1];
  const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");

  if (judged) {
    const worst = batchRows.slice().sort((a, b) => b.calls - a.calls)[0];
    claims.push({
      id: "late", tone: (onTimePct ?? 0) >= 80 ? "good" : "bad",
      title: `Only ${on.length.toLocaleString("en-IN")} of ${judged.toLocaleString("en-IN")} Exclude calls went in on time`,
      number: `${Math.round(onTimePct ?? 0)}% on time`,
      detail: `On time means the negative was in Google Ads within ${grace} days of the sheet day. ${late.length.toLocaleString("en-IN")} went in late and ${never.length} never went in. ${worst ? `The biggest single batch was on ${dd(worst.day)}: ${worst.calls} calls from ${worst.sheet_days.length} sheet days (${dd(worst.sheet_days[0])} – ${dd(worst.sheet_days[worst.sheet_days.length - 1])}).` : ""}`,
      check: "Google Ads › Campaigns › Change history, filter Change type = Keywords (negative), and look at the dates.",
      columns: ["Sheet day", "Calls", "On time", "Late", "Not done", "Went in on"],
      examples: days.filter((d) => d.late || d.not_done).slice(0, 12).map((d) => ({ cells: [dd(d.day), String(d.calls), String(d.on_time), String(d.late), String(d.not_done), d.answered_on.map(dd).join(", ")] })),
      href: "/agency",
    });
  }
  if (never.length) {
    const invMiss = inv ? new Set(inv.calls.filter((c) => c.in_account === "not_found").map((c) => [c.day, c.campaign, c.ad_group, c.term].join("|"))) : null;
    const confirmed = invMiss ? never.filter((c) => invMiss.has([c.day, c.campaign, c.ad_group, c.term].join("|"))).length : null;
    claims.push({
      id: "never", tone: "bad",
      title: `${never.length} Exclude calls were never put in (${inr(sum(never))} spent on those searches)`,
      number: `${never.length} not done`,
      detail: `Past the ${grace}-day grace and no negative in the change history blocks them.${confirmed !== null ? ` The full negative list downloaded on ${dd(inv!.as_of)} confirms ${confirmed} of them are still not blocked today (the rest may sit in a shared list, whose contents are not loaded yet).` : ""}`,
      check: "Google Ads › the campaign › Audiences, keywords and content › Search keywords › Negative search keywords: search for the term.",
      columns: ["Sheet day", "Search", "Campaign", "Spent"],
      examples: never.slice().sort((a, b) => b.cost - a.cost).slice(0, 12).map((c) => ({ cells: [dd(c.day), c.term, lab(c.campaign), inr(c.cost)] })),
      href: "/agency",
    });
  }
  if (inv) {
    const kw = inv.risky.filter((r) => r.level === "campaign" && r.keywords.length);
    if (kw.length) claims.push({
      id: "blocks-keywords", tone: "bad",
      title: `${kw.length} campaign-wide negatives switch off our own keywords (${kw.reduce((s, r) => s + r.keywords.length, 0)} keywords)`,
      number: `${kw.reduce((s, r) => s + r.keywords.length, 0)} keywords blocked`,
      detail: `Each negative below is in the account today at campaign level, and blocks keywords that are enabled in the same campaign: those keywords cannot show for the searches they were bought for. Most are one word, not the full search term as agreed.`,
      check: "Google Ads › the campaign › Negative search keywords: find the negative; then Search keywords: the keywords listed contain that word.",
      columns: ["Negative", "Campaign", "Added", "Keywords it blocks", "Example"],
      examples: kw.slice(0, 12).map((r) => ({ cells: [r.text, lab(r.campaign), r.added_on ? `${dd(r.added_on)} · ${r.added_by}` : "before 1 Oct", String(r.keywords.length), r.keywords[0] ?? ""] })),
      href: "/account-negatives",
    });
    const conv = inv.risky.filter((r) => r.conv > 0);
    if (conv.length) claims.push({
      id: "blocks-conversions", tone: "warn",
      title: `${conv.length} negatives block searches that brought conversions`,
      number: `${conv.reduce((s, r) => s + r.conv, 0)} conversions`,
      detail: "These searches converted earlier and were never asked to be excluded in the sheet, but a negative in the account now blocks them. Ad-group negatives may be on purpose (moving the search to another ad group); campaign-wide ones stop it in the whole campaign.",
      check: "Google Ads › Search terms report (filter the search): conversions on that day; then the campaign's Negative search keywords.",
      columns: ["Negative", "Level", "Campaign", "Search it blocks", "Conv."],
      examples: conv.slice(0, 12).map((r) => ({ cells: [r.text, r.level === "campaign" ? "whole campaign" : `ad group: ${r.ad_group}`, lab(r.campaign), r.conv_searches[0]?.term ?? "", String(r.conv)] })),
      href: "/account-negatives",
    });
    const adds = inv.add_conflicts.filter((a) => a.by_level === "campaign");
    if (adds.length) claims.push({
      id: "add-blocked", tone: "warn",
      title: `${adds.length} searches the sheet said to Add are blocked by a campaign-wide negative`,
      number: `${adds.length} Adds blocked`,
      detail: "The sheet asked for these searches to be added as keywords, yet a negative across the same campaign blocks them, so even after adding they cannot show.",
      check: "Google Ads › the campaign › Negative search keywords: find the negative shown.",
      columns: ["Sheet day", "Search", "Campaign", "Blocked by"],
      examples: adds.slice(0, 12).map((a) => ({ cells: [dd(a.day), a.term, lab(a.campaign), a.by] })),
      href: "/account-negatives",
    });
  }
  const oneWord = calls.filter((c) => c.written_kind === "one_word");
  if (oneWord.length) {
    const wentWord = calls.filter((c) => c.applied_as && c.applied_kind === "one_word");
    claims.push({
      id: "one-word", tone: "warn",
      title: `The sheet wrote a single word for ${oneWord.length.toLocaleString("en-IN")} of ${calls.length.toLocaleString("en-IN")} Exclude calls`,
      number: `${Math.round((100 * oneWord.length) / calls.length)}% one word`,
      detail: `County asked for the full search term. ${wentWord.length.toLocaleString("en-IN")} calls were answered by a one-word negative in Google Ads; a one-word broad negative blocks every search with that word, including ones we want.`,
      check: "Google Ads › Change history: the negatives added on the sheet day; compare with the sheet's Negative column.",
      columns: ["Sheet day", "Search", "Sheet wrote", "Went in as"],
      examples: oneWord.filter((c) => c.applied_as).slice(0, 12).map((c) => ({ cells: [dd(c.day), c.term, c.written, c.applied_as] })),
      href: "/negatives",
    });
  }
  const mismatch = m.coverage.filter((c) => (!m.data.agency_sheet?.from || c.day >= m.data.agency_sheet.from) && !c.cost_matches);
  if (mismatch.length) claims.push({
    id: "sheet-gaps", tone: "info",
    title: `${mismatch.length} sheet days do not match Google's search terms report`,
    number: `${mismatch.length} days`,
    detail: "On these days the cost in the sheet differs from Google's report, so some searches were never reviewed.",
    check: "Google Ads › Search terms for that day, total cost; compare with the sheet tab's total.",
    columns: ["Day", "Google cost", "Sheet cost"],
    examples: mismatch.slice(0, 12).map((c) => ({ cells: [dd(c.day), inr(c.report_cost), inr(c.sheet_cost)] })),
    href: "/data",
  });

  return {
    today, yesterday, grace, freshness,
    on_time: { judged, on: on.length, late: late.length, never: never.length, never_cost: sum(never), waiting: waiting.length, waiting_cost: sum(waiting), on_time_pct: onTimePct, applied_pct: appliedPct },
    by_project: byProject, days, batches: batchRows, since_yesterday: sinceYesterday, claims,
    inventory: inv ? { as_of: inv.as_of, total: inv.total, lists: [...new Set(inv.lists.map((l) => l.name))], blocks_keywords: inv.risky.filter((r) => r.level === "campaign" && r.keywords.length).length } : null,
    sheet_to: m.data.agency_sheet?.to ?? null, last_change: changesTo,
  };
}

export type Brief = ReturnType<typeof getBrief>;
