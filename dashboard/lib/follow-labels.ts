/** Words and colours for follow-through statuses (followup-core.ts), shared by server pages and client components. */
import type { Followup, Scorecard } from "./followup-core";

export type Tone = "good" | "warn" | "bad" | "muted" | "info";
export const STATUS: Record<"exclude" | "add", Record<string, { label: string; tone: Tone; means: string }>> = {
  exclude: {
    on_time: { label: "Done on time", tone: "good", means: "The negative went in on or before the deadline." },
    late: { label: "Done late", tone: "warn", means: "The negative went in after the deadline." },
    open_overdue: { label: "Not done", tone: "bad", means: "Past the deadline and no negative blocks it." },
    wrong_place: { label: "Wrong place", tone: "bad", means: "A negative went in, but only in another ad group of the campaign, so the search still runs." },
    open_in_time: { label: "Not due yet", tone: "muted", means: "Still inside the agency's days to put it in." },
    county_query: { label: "County asked to keep it", tone: "info", means: "County commented to add or not exclude it; the agency has to answer County in the sheet." },
  },
  add: {
    on_time: { label: "Added on time", tone: "good", means: "It became a keyword on or before the deadline." },
    late: { label: "Added late", tone: "warn", means: "It became a keyword after the deadline." },
    already: { label: "Already a keyword", tone: "muted", means: "It was a keyword before the sheet asked (or before the change history starts)." },
    open_overdue: { label: "Not added", tone: "bad", means: "Past the deadline and not a keyword in any campaign." },
    elsewhere: { label: "Added elsewhere", tone: "warn", means: "It is a keyword only in another campaign, not in the one the sheet named." },
    blocked: { label: "Blocked by a negative", tone: "bad", means: "A negative in the account stops it, so it cannot show even as a keyword." },
    open_in_time: { label: "Not due yet", tone: "muted", means: "Still inside the agency's days to add it." },
    sop_brand: { label: "Brand search", tone: "info", means: "A brand search in a non-brand or competitor campaign: SOP rule 1 sends it to the brand campaign, so it is not counted." },
    county_rule: { label: "Other County project", tone: "info", means: "Blocked by another County project's name, negated on purpose (County's rule of 22 Nov 2026), so it is not counted." },
  },
};
export const statusOf = (f: Pick<Followup, "type" | "status">) => STATUS[f.type][f.status] ?? { label: f.status, tone: "muted" as Tone, means: "" };

export const TONE_TEXT: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", muted: "text-muted-foreground", info: "text-info" };
export const TONE_BG: Record<Tone, string> = { good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", muted: "bg-muted text-muted-foreground", info: "bg-info-soft text-info" };
export const TONE_FILL: Record<Tone, string> = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", muted: "var(--border)", info: "var(--info)" };

/** How a negative relates to the search: County's rule is the full search, never one word (SOP section 7). */
export const KIND_LABEL: Record<string, string> = { term: "the full search", part: "part of the search", one_word: "one word", keyword: "keyword", none: "nothing written", different: "words not in the search" };
export const LEVEL_LABEL: Record<string, string> = { campaign: "campaign level", "ad group": "ad-group level", "shared list": "shared list" };

/** "Campaigns › X › Keywords › Negative keywords": where to look in Google Ads. */
export const negPath = (campaign: string, adGroup = "", list = "") =>
  list ? `Tools › Shared library › Negative keyword lists › ${list}` : adGroup ? `Campaigns › ${campaign} › ${adGroup} › Keywords › Negative keywords` : `Campaigns › ${campaign} › Keywords › Negative keywords (campaign level)`;

/** The two bars every scorecard shows: Excludes and Adds, split by what happened to them. */
export function exSegs(c: Scorecard) {
  return [
    { key: "on_time", label: "on time", n: c.ex.on_time, tone: "good" as const },
    { key: "late", label: "late", n: c.ex.late, tone: "warn" as const },
    { key: "open", label: "not done", n: c.ex.open_overdue, tone: "bad" as const },
    { key: "wrong", label: "wrong ad group", n: c.ex.wrong_place, tone: "bad" as const },
    { key: "county", label: "County asked to keep", n: c.ex.county_query, tone: "info" as const },
    { key: "wait", label: "not due yet", n: c.ex.open_in_time, tone: "muted" as const },
  ];
}
export function addSegs(c: Scorecard) {
  return [
    { key: "on_time", label: "added on time", n: c.add.on_time, tone: "good" as const },
    { key: "late", label: "added late", n: c.add.late, tone: "warn" as const },
    { key: "already", label: "already a keyword", n: c.add.already, tone: "info" as const },
    { key: "open", label: "not added", n: c.add.open_overdue, tone: "bad" as const },
    { key: "elsewhere", label: "only in another campaign", n: c.add.elsewhere, tone: "warn" as const },
    { key: "blocked", label: "blocked by a negative", n: c.add.blocked, tone: "bad" as const },
    { key: "brand", label: "brand search (belongs to the brand campaign)", n: c.add.sop_brand, tone: "info" as const },
    { key: "county", label: "other County project (County's rule)", n: c.add.county_rule, tone: "info" as const },
    { key: "wait", label: "not due yet", n: c.add.open_in_time, tone: "muted" as const },
  ];
}
