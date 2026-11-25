import type { ReactNode } from "react";
import type { Fix, Model } from "./types";
import { drange, inr, lakh, n0, n1, pct, plural } from "./format";

/** Plain-language wording for every kind of problem the engine reports. React escapes all text, so data stays text. */
export const TYPE_LABEL: Record<string, string> = {
  overdue_excludes: "Junk searches marked Exclude, never blocked",
  brand_no_word: "Brand campaign paid for searches not about us",
  product_mismatch: "Ads on villa and penthouse keywords (not sold)",
  landing_pages: "Keyword spend landing on below-average pages",
  ctm_pool: "Google CTM can barely spend its budget",
  brand_cpa: "Brand campaign costs far more per conversion than non-brand",
  self_competition: "Same keyword live in two of our campaigns",
  zero_conv: "Campaign with spend and no Google conversion",
  brand_leak: "Our own brand searches paid by non-brand campaigns",
  blocked_keywords: "Our keywords blocked by our own negatives",
  conversion_gap: "“All conversions” far above real leads",
  no_negative_written: "Exclude rows with no negative written",
  overdue_adds: "Add calls never added as keywords",
  risky_negatives: "Risky campaign-wide negatives",
  held_by_budget: "Missing searches because the budget runs out",
};

export const SEVERITY = {
  high: { label: "Act this week", tone: "bad" },
  medium: { label: "Next agency review", tone: "warn" },
  low: { label: "Decide", tone: "muted" },
} as const;

export const MONEY_KIND: Record<string, string> = {
  wasted: "spent on unwanted searches",
  affected: "spend affected",
  misrouted: "paid by the wrong campaign",
};

export const OWNER_LABEL: Record<string, string> = { Agency: "Agency (ROI)", County: "County", "Google CTM team": "Google CTM team" };

const C = ({ children }: { children: ReactNode }) => (
  <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
);

export interface FixText { title: string; detail: ReactNode; todo: string; href: string; link: string }

export function fixText(f: Fix, model: Model): FixText {
  const p = f.params || {};
  const pname = model.projects.find((x) => x.id === f.project)?.name.replace(" County", "") ?? "Other";
  const label = (id: string) => model.campaigns.find((c) => c.id === id)?.label ?? id;
  const days = p.first_day ? drange(p.first_day, p.last_day) : "";
  const proj = `/projects/${f.project}`;
  switch (f.type) {
    case "overdue_excludes":
      return { title: `${n0(p.count)} ${pname} ${plural(p.count, "search", "searches")} the agency marked Exclude were never blocked`,
        detail: <>Sheet days {days}. They cost {inr(f.money)} on the days they were reviewed, and nothing stops them coming back.</>,
        todo: "Send the list to the agency and ask for the negatives to be applied today, or a reason why not.", href: "/report#open", link: "See the list" };
    case "overdue_adds":
      return { title: `${n0(p.count)} good ${pname} ${plural(p.count, "search", "searches")} marked Add were never added as keywords`,
        detail: <>Sheet days {days}. The agency&apos;s own sheet says these searches should be keywords.</>,
        todo: "Ask the agency to add them, or to change the sheet.", href: "/report#adds", link: "See the list" };
    case "no_negative_written":
      return { title: `${n0(p.count)} ${pname} ${plural(p.count, "row says", "rows say")} Exclude but no negative is written`,
        detail: <>Without the exact negative and its match type, whoever applies it has to guess, and a guessed broad negative can block good searches.</>,
        todo: "Ask the agency to fill the Negative column for these rows.", href: "/report#sheet", link: "See the rows" };
    case "brand_no_word":
      return { title: `${pname} brand campaign paid ${inr(f.money)} for ${n0(p.count)} ${plural(p.count, "search", "searches")} that don't mention County or ${pname}`,
        detail: <>Example: “{p.example}” cost {inr(p.example_cost)}. Brand campaigns bid high because brand searchers already want us; this money went to people looking for something else.</>,
        todo: "Make brand + location keywords exact match, and add the other project names as negatives in the brand campaign.", href: `${proj}?tab=terms`, link: "See the searches" };
    case "brand_leak":
      return { title: `${n0(p.count)} ${plural(p.count, "search", "searches")} for our own name ${plural(p.count, "was", "were")} paid by ${pname} non-brand or competitor campaigns`,
        detail: <>Example: “{p.example}”. These people already know us; the brand campaign should take them, at brand prices and in brand numbers.</>,
        todo: `Add “county” and “${pname.toLowerCase()}” as negatives in those campaigns.`, href: `${proj}?tab=terms`, link: "See the searches" };
    case "blocked_keywords":
      return { title: `${n0(p.count)} ${pname} ${plural(p.count, "keyword", "keywords")} can never show: our own negatives block them`,
        detail: <>Example: the keyword “{p.example}” is blocked by the negative <C>{p.example_negative}</C>. A negative always wins over a keyword.</>,
        todo: "Remove those negatives or move them to the ad groups where they belong.", href: "/report#negatives", link: "See all" };
    case "risky_negatives":
      return { title: `${n0(p.count)} campaign-wide ${pname} negatives are a bare number or common words`,
        detail: <>For example {(p.examples || []).map((x: string, i: number) => <span key={i}>{i ? ", " : ""}<C>{x}</C></span>)}. One of these can switch off hundreds of good searches (a bare <C>-62</C> also blocks “₹62 lakh” and “sector 62”).</>,
        todo: "Replace each with the exact phrase that was junk (SOP section 7).", href: "/negatives", link: "See all" };
    case "product_mismatch":
      return { title: `${pname} ads run on villa and penthouse keywords, and ${pname} sells neither`,
        detail: <>{n0(p.count)} keywords in {(p.ad_groups || []).join(", ")} cost {inr(f.money)} with {n1(p.conv)} Google conversions.</>,
        todo: "Pause the Villa and Pent House ad groups and the villa keywords in Competitor, and add villa and penthouse as negatives.", href: `${proj}?tab=keywords`, link: "See the keywords" };
    case "landing_pages":
      return { title: `${p.share}% of ${pname} keyword spend lands on pages Google rates below average`,
        detail: <>{lakh(f.money)} of {lakh(p.total)} in the keyword report. A below-average landing page lowers Quality Score, which raises the price of every click.</>,
        todo: "Test the campaign pages on a phone (PageSpeed Insights) and check each ad group lands on a page about its keywords.", href: `${proj}?tab=keywords`, link: "See keyword quality" };
    case "self_competition":
      return { title: `${n0(p.count)} ${pname} ${plural(p.count, "keyword runs", "keywords run")} in two of our campaigns at once`,
        detail: <>Biggest: “{p.example}” in {(p.example_campaigns || []).map(label).join(" and ")}. Google lets only one of our ads into each auction, so the two campaigns compete and their numbers stop being comparable.</>,
        todo: "Decide which campaign owns each keyword and remove it from the other.", href: `${proj}?tab=keywords`, link: "See the keywords" };
    case "conversion_gap":
      return { title: `Google counts far more “all conversions” than leads in ${(p.campaigns || []).length} ${pname} ${plural((p.campaigns || []).length, "campaign")}`,
        detail: <>{(p.campaigns || []).map((c: { label: string; conv: number; all_conv: number }) => `${c.label}: ${n1(c.conv)} conversions vs ${n0(c.all_conv)} all conversions`).join("; ")}.</>,
        todo: "Check which conversion actions count as secondary before anyone quotes “all conversions”.", href: `${proj}?tab=campaigns`, link: "See the campaigns" };
    case "zero_conv":
      return { title: `${p.label} spent ${inr(f.money)} in ${p.days} days with no Google conversion`,
        detail: <>Google Ads recorded no lead from this campaign in the whole period.</>,
        todo: "Look at its search terms and decide whether it should keep running.", href: `${proj}?tab=campaigns`, link: "See the campaign" };
    case "brand_cpa":
      return { title: `${p.label} costs ${inr(p.cpa)} per Google conversion; ${pname} non-brand costs ${inr(p.nonbrand_cpa)}`,
        detail: <>Brand searchers usually convert best, yet this campaign pays {inr(p.cpc)} a click (bidding: {p.bid_strategy}) for {n1(p.conv)} conversions in the period.</>,
        todo: "Check whether brand searchers call or visit instead of filling the form (Google doesn't count that), and whether the bidding pays more than needed.", href: `${proj}?tab=campaigns`, link: "See the campaign" };
    case "held_by_budget":
      return { title: `${p.label} missed ${pct(p.lost_budget_pct)} of its searches in ${model.period?.name ?? "the last 7 days"} because the budget ran out`,
        detail: <>Budget {inr(p.budget)} a day. More budget buys more of the same searches; it doesn&apos;t make them better.</>,
        todo: "If its leads are good in the CRM, consider more budget. If not, leave it.", href: `${proj}?tab=campaigns`, link: "See the campaign" };
    case "ctm_pool":
      return { title: `${pname} Google CTM spends ${inr(p.spend_per_day)} a day of its ${inr(p.budget)} budget`,
        detail: <>The searches it may enter fell from about {n0(p.before)} a day ({drange(p.before_from, p.before_to)}) to {n0(p.now)} ({drange(p.now_from, p.now_to)}), down {p.drop_pct}%, after its keywords were narrowed. The budget isn&apos;t what holds it back.</>,
        todo: "Agree with Google's team and the agency who owns Ivory brand searches, and widen CTM's keywords (phrase match, or search term matching with strong negatives).", href: `${proj}?tab=ctm`, link: "See the CTM case" };
    default:
      return { title: TYPE_LABEL[f.type] ?? f.type, detail: null, todo: "", href: proj, link: "Open" };
  }
}

/** Short value shown next to a project in grouped lists. */
export function fixValue(f: Fix): string {
  const p = f.params || {};
  if (f.type === "landing_pages") return `${p.share}%`;
  if (f.type === "brand_cpa") return `${inr(p.cpa)} vs ${inr(p.nonbrand_cpa)}`;
  if (f.type === "ctm_pool") return `${inr(p.spend_per_day)} of ${inr(p.budget)}/day`;
  if (f.type === "held_by_budget") return `${pct(p.lost_budget_pct)} missed`;
  if (f.type === "conversion_gap") return `${(p.campaigns || []).length} ${plural((p.campaigns || []).length, "campaign")}`;
  if (f.money && p.count) return `${n0(p.count)} · ${lakh(f.money)}`;
  if (f.money) return lakh(f.money);
  return p.count !== undefined ? n0(p.count) : "";
}

/** A message the user can paste to the agency (WhatsApp or email): every open Agency item, by project. */
export function agencyMessage(model: Model): string {
  const items = model.fixes.filter((f) => f.owner === "Agency");
  if (!items.length) return "Nothing open for the agency today.";
  const lines = [`Search QC: open items for ROI (${model.as_of})`, ""];
  for (const p of model.projects) {
    const mine = items.filter((f) => f.project === p.id);
    if (!mine.length) continue;
    lines.push(`${p.name}:`);
    for (const f of mine) lines.push(`• ${fixText(f, model).title}${f.money ? ` (${lakh(f.money)})` : ""}`);
    lines.push("");
  }
  lines.push("Full lists are in the Search QC dashboard. Please confirm when applied.");
  return lines.join("\n");
}
