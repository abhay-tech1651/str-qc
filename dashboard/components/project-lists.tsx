"use client";
/** Project page, the list tabs: Search terms, Keywords and Agency. Every list is filtered to this project. */
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Button, Card, Explain } from "./ui";
import { DataTable, type Column } from "./data-table";
import { ListHead, MiniStat, Neg, txt, useLabel } from "./project-kit";
import { dlong, drange, dshort, inr, lakh, n0, n1, pct } from "@/lib/format";
import type { AddRow, CallRow, Keywords, KwRow, Model, Risks, StRow } from "@/lib/types";

type R<T> = T & Record<string, unknown>;
const pname = (m: Model, id: string) => m.projects.find((p) => p.id === id)?.name.replace(" County", "") ?? id;

function Block({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 first:mt-0">{children}</div>;
}

/* ================================================================ Search terms */
export function ProjectTerms({ model, id }: { model: Model; id: string }) {
  const label = useLabel(model);
  const ld = model.latest_day;
  const day = ld?.by_project?.[id];
  const name = pname(model, id);
  const noWord = model.risks.brand_no_word.filter((r) => r.project === id) as R<StRow>[];
  const leak = model.risks.brand_leak.filter((r) => r.project === id) as R<StRow>[];
  const repeats = model.risks.repeats.filter((r) => r.project === id) as R<Risks["repeats"][number]>[];

  const stCols: Column<R<StRow>>[] = [
    { key: "day", label: "Day", value: (r) => r.day, render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.day)}</span> },
    { key: "term", label: "What they searched", value: (r) => r.term, render: (r) => <span className="font-medium">{r.term}</span> },
    { key: "campaign", label: "Campaign · ad group", value: (r) => label(r.campaign),
      render: (r) => <div><div>{label(r.campaign)}</div><div className="text-xs text-muted-foreground">{txt(r.ad_group)}</div></div> },
    { key: "keyword", label: "Matched keyword", value: (r) => r.keyword,
      render: (r) => <div><Neg>{r.keyword}</Neg><div className="mt-0.5 text-xs text-muted-foreground">{txt(r.match_type)}</div></div> },
    { key: "clicks", label: "Clicks", align: "right", value: (r) => r.clicks, render: (r) => n0(r.clicks) },
    { key: "cost", label: "Cost", align: "right", value: (r) => r.cost, render: (r) => inr(r.cost) },
  ];
  const repCols: Column<R<Risks["repeats"][number]>>[] = [
    { key: "day", label: "Day it came back", value: (r) => r.day, render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.day)}</span> },
    { key: "term", label: "What they searched", value: (r) => r.term, render: (r) => <span className="font-medium">{r.term}</span> },
    { key: "campaign", label: "Paid by", value: (r) => label(r.campaign) },
    { key: "first", label: "First excluded", value: (r) => r.first_excluded, render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.first_excluded) || "–"}</span> },
    { key: "in", label: "Excluded in", value: (r) => (r.excluded_in || []).map(label).join(" + "), render: (r) => (r.excluded_in || []).map(label).join(" + ") || "–" },
    { key: "cost", label: "Cost", align: "right", value: (r) => r.cost, render: (r) => inr(r.cost) },
  ];

  return (
    <>
      <Block>
        <ListHead title={ld ? <>Latest reviewed day: {dlong(ld.day)}</> : "Latest reviewed day"}
          description="What the agency's STR sheet decided about each search that cost money that day." />
        {ld && day ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Searches that cost money" value={n0(day.rows)} sub={`${inr(day.cost)} in total on ${dshort(ld.day)}`} />
            <MiniStat label="Marked Exclude (junk)" value={inr(day.exclude_cost)} sub={`${pct(day.cost ? (100 * day.exclude_cost) / day.cost : null)} of the day's ${name} spend`} tone={day.exclude_cost ? "bad" : undefined} />
            <MiniStat label="Marked Add (good)" value={inr(day.add_cost)} sub="searches the sheet says should become keywords" tone={day.add_cost ? "good" : undefined} />
            <MiniStat label="No decision in the sheet" value={inr(day.none_cost)} sub="spend the sheet left without a call" />
          </div>
        ) : (
          <Card className="px-6 py-8 text-center text-sm text-muted-foreground">No reviewed day for {name} in the search-term data yet.</Card>
        )}
        <div className="mt-4">
          <Button asChild variant="outline" size="sm"><Link href={`/search-terms?project=${encodeURIComponent(id)}`}>All {name} search terms <ArrowRight /></Link></Button>
        </div>
      </Block>

      <Block>
        <ListHead title="Brand campaign, searches with no brand word" count={noWord.length}
          description={`The ${name} brand campaign paid for these, but the search mentions neither County nor ${name}.`} />
        <DataTable rows={noWord} columns={stCols} csvName={`${id}-brand-no-brand-word`} initialSort={{ key: "cost", dir: "desc" }}
          empty="None found: every search the brand campaign paid for mentions the brand." />
        <Explain>Brand campaigns bid high because people searching our name already want us. Money spent here went to people looking for something else; tighter match types and negatives stop it.</Explain>
      </Block>

      <Block>
        <ListHead title="Our brand bought by non-brand campaigns" count={leak.length}
          description="Searches for our own name that a non-brand or competitor campaign paid for." />
        <DataTable rows={leak} columns={stCols} csvName={`${id}-brand-leak`} initialSort={{ key: "cost", dir: "desc" }}
          empty="None found: brand searches went to the brand campaign." />
        <Explain>These people already know us. The brand campaign should take them, at brand prices, so the brand and non-brand numbers stay honest.</Explain>
      </Block>

      <Block>
        <ListHead title="Junk excluded elsewhere that came back" count={repeats.length}
          description="Searches the agency marked Exclude for one campaign that a different campaign paid for on a later day." />
        <DataTable rows={repeats} columns={repCols} csvName={`${id}-excluded-came-back`} initialSort={{ key: "cost", dir: "desc" }}
          empty="None found." />
        <Explain>A negative only protects the campaign (or ad group) it is added to. When the same junk turns up in another campaign, the negative belongs in a shared list or in that campaign too.</Explain>
      </Block>
    </>
  );
}

/* ================================================================ Keywords */
export function ProjectKeywords({ model, id }: { model: Model; id: string }) {
  const label = useLabel(model);
  const k = model.keywords;
  if (!k) return <Card className="px-6 py-12 text-center text-sm text-muted-foreground">Import a keyword report to see keyword quality.</Card>;
  const s = k.by_project?.[id];
  const name = pname(model, id);
  const mismatch = k.product_mismatch.filter((r) => r.project === id) as R<KwRow>[];
  const noConv = k.no_conv.filter((r) => r.project === id) as R<KwRow>[];
  const dups = k.duplicates.filter((r) => r.project === id) as R<Keywords["duplicates"][number]>[];
  const lpShare = s && s.cost ? (100 * s.below_lp_cost) / s.cost : null;

  const kwCols: Column<R<KwRow>>[] = [
    { key: "keyword", label: "Keyword", value: (r) => r.keyword,
      render: (r) => <div><Neg>{r.keyword}</Neg><div className="mt-0.5 text-xs text-muted-foreground">{txt(r.match_type)}</div></div> },
    { key: "campaign", label: "Campaign · ad group", value: (r) => label(r.campaign),
      render: (r) => <div><div>{label(r.campaign)}</div><div className="text-xs text-muted-foreground">{txt(r.ad_group)}</div></div> },
    { key: "status", label: "Status", value: (r) => r.status, render: (r) => <Badge tone={r.status === "Eligible" ? "muted" : "warn"}>{txt(r.status)}</Badge> },
    { key: "cost", label: "Spend", align: "right", value: (r) => r.cost, render: (r) => inr(r.cost) },
    { key: "clicks", label: "Clicks", align: "right", value: (r) => r.clicks, render: (r) => n0(r.clicks) },
    { key: "conv", label: "Google conv", align: "right", value: (r) => r.conv, render: (r) => n1(r.conv) },
    { key: "qs", label: "Quality Score", align: "right", value: (r) => r.quality_score,
      render: (r) => <span className={r.quality_score !== null && r.quality_score <= 3 ? "font-semibold text-bad" : undefined}>{r.quality_score === null ? "–" : `${r.quality_score}/10`}</span> },
    { key: "lp", label: "Landing page", value: (r) => r.landing_page,
      render: (r) => <span className={r.landing_page === "Below average" ? "text-bad" : undefined}>{txt(r.landing_page)}</span> },
  ];
  const dupCols: Column<R<(typeof dups)[number]>>[] = [
    { key: "keyword", label: "Keyword", value: (r) => r.keyword, render: (r) => <Neg>{r.keyword}</Neg> },
    { key: "campaigns", label: "Live in", value: (r) => (r.campaigns || []).map(label).join(" + "), render: (r) => (r.campaigns || []).map(label).join(" + ") || "–" },
    { key: "impr", label: "Times shown", align: "right", value: (r) => r.impr, render: (r) => n0(r.impr) },
    { key: "cost", label: "Spend", align: "right", value: (r) => r.cost, render: (r) => inr(r.cost) },
  ];

  return (
    <>
      <Block>
        <ListHead title={`Keyword report, ${drange(k.from, k.to) || "–"}`} description="How Google rates this project's keywords, and where the money behind them goes." />
        {s ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Keyword spend" value={lakh(s.cost)} sub={`${n0(s.keywords)} keywords · ${n0(s.enabled)} live`} />
            <MiniStat label="Lands on a below-average page" value={lakh(s.below_lp_cost)} sub={`${pct(lpShare)} of the keyword spend`} tone={(lpShare ?? 0) >= 50 ? "bad" : (lpShare ?? 0) >= 25 ? "warn" : undefined} />
            <MiniStat label="Quality Score 1–3" value={lakh(s.qs13_cost)} sub="spend on keywords Google rates poorly" tone={s.qs13_cost ? "warn" : undefined} />
            <MiniStat label="Live but not eligible" value={n0(s.not_eligible)} sub={`of ${n0(s.enabled)} live keywords can't show right now`} tone={s.not_eligible ? "warn" : undefined} />
          </div>
        ) : <Card className="px-6 py-8 text-center text-sm text-muted-foreground">No {name} keywords in the keyword report.</Card>}
        <Explain>A below-average landing page lowers Quality Score, and a low Quality Score raises the price of every click. These numbers come straight from Google&apos;s keyword report.</Explain>
      </Block>

      {mismatch.length ? (
        <Block>
          <ListHead title="Keywords for a product this project doesn't sell" count={mismatch.length}
            description={`Villa and penthouse keywords running for ${name}.`} />
          <DataTable rows={mismatch} columns={kwCols} csvName={`${id}-product-mismatch`} initialSort={{ key: "cost", dir: "desc" }} />
          <Explain>This project sells no villas or penthouses, so these clicks come from people looking for something we cannot offer. Pausing the keywords and adding the words as negatives stops the spend.</Explain>
        </Block>
      ) : null}

      <Block>
        <ListHead title="Keywords with spend and no Google conversion" count={noConv.length}
          description={`${name} keywords among the account's 25 biggest spenders with no Google conversion in ${drange(k.from, k.to) || "the report"}.`} />
        <DataTable rows={noConv} columns={kwCols} csvName={`${id}-keywords-no-conversion`} initialSort={{ key: "cost", dir: "desc" }}
          empty={`None of the account's 25 biggest no-conversion keywords is a ${name} keyword.`} />
        <Explain>Start at the top: the biggest spenders without a lead are where a pause or a bid cut saves the most.</Explain>
      </Block>

      <Block>
        <ListHead title="Same keyword live in two of our campaigns" count={dups.length}
          description="Our own campaigns competing for the same searches." />
        <DataTable rows={dups} columns={dupCols} csvName={`${id}-duplicate-keywords`} initialSort={{ key: "cost", dir: "desc" }}
          empty="None: each keyword lives in one campaign." />
        <Explain>Google lets only one of our ads into each auction, so the two campaigns take turns and their numbers stop being comparable. Decide which campaign owns each keyword.</Explain>
      </Block>
    </>
  );
}

/* ================================================================ Agency */
export function ProjectAgency({ model, id }: { model: Model; id: string }) {
  const label = useLabel(model);
  const a = model.agency;
  const s = a.by_project?.[id];
  const name = pname(model, id);
  const exc = a.overdue_excludes.filter((r) => r.project === id) as R<CallRow>[];
  const adds = a.overdue_adds.filter((r) => r.project === id) as R<AddRow>[];
  const risky = model.risks.risky.filter((r) => r.project === id) as R<Risks["risky"][number]>[];
  const blocked = model.risks.blocked.filter((r) => r.project === id) as R<Risks["blocked"][number]>[];
  const WHY: Record<string, string> = { bare_number: "A bare number", common_word: "A common word", common_pair: "Common words" };
  const checked = !!a.changes_from;

  const campCol = <T extends { campaign: string; ad_group: string }>(): Column<R<T>> => ({
    key: "campaign", label: "Campaign · ad group", value: (r) => label(r.campaign),
    render: (r) => <div><div>{label(r.campaign)}</div><div className="text-xs text-muted-foreground">{txt(r.ad_group)}</div></div>,
  });
  const dayCol = <T extends { day: string }>(title = "Sheet day"): Column<R<T>> => ({
    key: "day", label: title, value: (r) => r.day, render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.day)}</span>,
  });

  const excCols: Column<R<CallRow>>[] = [
    dayCol<CallRow>(),
    { key: "term", label: "Search", value: (r) => r.term, render: (r) => <span className="font-medium">{r.term}</span> },
    campCol<CallRow>(),
    { key: "neg", label: "Negative written", value: (r) => r.neg_term, render: (r) => <Neg>{r.neg_term}</Neg> },
    { key: "comment", label: "County comment", value: (r) => r.county_comment, render: (r) => <span className="text-muted-foreground">{txt(r.county_comment)}</span> },
    { key: "cost", label: "Cost that day", align: "right", value: (r) => r.cost, render: (r) => inr(r.cost) },
  ];
  const addCols: Column<R<AddRow>>[] = [
    dayCol<AddRow>(),
    { key: "term", label: "Search to add", value: (r) => r.term, render: (r) => <span className="font-medium">{r.term}</span> },
    campCol<AddRow>(),
    { key: "clicks", label: "Clicks", align: "right", value: (r) => r.clicks, render: (r) => n0(r.clicks) },
    { key: "conv", label: "Google conv", align: "right", value: (r) => r.conv, render: (r) => n1(r.conv) },
    { key: "cost", label: "Cost that day", align: "right", value: (r) => r.cost, render: (r) => inr(r.cost) },
  ];
  const riskyCols: Column<R<Risks["risky"][number]>>[] = [
    { key: "item", label: "Negative", value: (r) => r.item, render: (r) => <Neg>{r.item}</Neg> },
    { key: "why", label: "Why it is risky", value: (r) => WHY[r.why] ?? r.why, render: (r) => <Badge tone="warn">{WHY[r.why] ?? txt(r.why)}</Badge> },
    { key: "level", label: "Level", value: (r) => r.level },
    campCol<Risks["risky"][number]>(),
    { key: "added", label: "Added", value: (r) => r.added, render: (r) => <div className="whitespace-nowrap"><span className="tabular">{dshort(r.added) || "–"}</span><div className="text-xs text-muted-foreground">{txt(r.added_by)}</div></div> },
  ];
  const blockedCols: Column<R<Risks["blocked"][number]>>[] = [
    { key: "keyword", label: "Our keyword", value: (r) => r.keyword, render: (r) => <span className="font-medium">{r.keyword}</span> },
    { key: "by", label: "Blocked by", value: (r) => r.blocked_by, render: (r) => <Neg>{r.blocked_by}</Neg> },
    { key: "level", label: "Negative's level", value: (r) => r.level },
    campCol<Risks["blocked"][number]>(),
    { key: "added", label: "Negative added", value: (r) => r.added, render: (r) => <div className="whitespace-nowrap"><span className="tabular">{dshort(r.added) || "–"}</span><div className="text-xs text-muted-foreground">{txt(r.added_by)}</div></div> },
  ];

  return (
    <>
      <Block>
        <ListHead title={`Said vs done for ${name}`}
          description={checked
            ? `Every Add and Exclude call in the agency's STR sheet, checked against the Google Ads change history (${drange(a.changes_from, a.last_change_day) || "–"}). A call counts as late after ${a.grace_days} days.`
            : "Import a Google Ads change history to check whether the agency applied its calls."} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Exclude calls in the sheet" value={n0(s?.excludes)} sub={`${n0(s?.judged)} old enough to judge`} />
          <MiniStat label="Applied" value={checked ? pct(s?.applied_pct) : "–"} sub="of the calls old enough to judge"
            tone={!checked || s?.applied_pct === null || s?.applied_pct === undefined ? undefined : s.applied_pct >= 95 ? "good" : "warn"} />
          <MiniStat label="Never applied" value={checked ? n0(s?.overdue) : "–"} sub={checked ? `${inr(s?.overdue_cost)} spent on them on the days reviewed` : ""} tone={s?.overdue ? "bad" : undefined} />
          <MiniStat label="Adds not added" value={checked ? n0(s?.adds_overdue) : "–"} sub={`of ${n0(s?.adds)} Add calls`} tone={s?.adds_overdue ? "warn" : undefined} />
        </div>
      </Block>

      <Block>
        <ListHead title="Exclude calls never applied" count={exc.length} description="The agency marked these searches as junk, but no matching negative was added." />
        <DataTable rows={exc} columns={excCols} csvName={`${id}-excludes-never-applied`} initialSort={{ key: "cost", dir: "desc" }} empty="None: every Exclude call old enough to judge was applied." />
        <Explain>Until the negative is in Google Ads, the same junk search can be paid for again. Send this list to the agency; the CSV button downloads it.</Explain>
      </Block>

      <Block>
        <ListHead title="Add calls never added" count={adds.length} description="The agency's sheet says these searches should become keywords; they were not added." />
        <DataTable rows={adds} columns={addCols} csvName={`${id}-adds-never-added`} initialSort={{ key: "cost", dir: "desc" }} empty="None: every Add call old enough to judge was added." />
        <Explain>These are searches the agency itself rated as good. As keywords they get their own bids and ads instead of being matched by chance.</Explain>
      </Block>

      <Block>
        <ListHead title="Risky campaign-wide negatives" count={risky.length} description="Negatives that are a bare number or very common words, applied to a whole campaign." />
        <DataTable rows={risky} columns={riskyCols} csvName={`${id}-risky-negatives`} empty="None found." />
        <Explain>One of these can switch off hundreds of good searches: a bare <Neg>-62</Neg> also blocks “₹62 lakh” and “sector 62”. Replace each with the exact phrase that was junk.</Explain>
      </Block>

      <Block>
        <ListHead title="Our keywords blocked by our own negatives" count={blocked.length} description="Keywords that can never show, because a negative in the same campaign or ad group matches them." />
        <DataTable rows={blocked} columns={blockedCols} csvName={`${id}-blocked-keywords`} empty="None: no keyword is blocked by our own negatives." />
        <Explain>A negative always wins over a keyword. Remove the negative, or move it to the ad group where it belongs.</Explain>
      </Block>
    </>
  );
}
