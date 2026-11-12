"use client";
/** Keywords page parts that need the browser: the Quality Score chart and the tabbed keyword lists. */
import * as React from "react";
import { Badge, Explain, ProjectTag, Tabs, TabsContent, TabsList, TabsTrigger } from "./ui";
import { DataTable, type Column } from "./data-table";
import { Columns } from "./charts";
import { inr, n0, n1, pcolor } from "@/lib/format";
import type { Keywords, KwRow, Project } from "@/lib/types";

const qsColor = (label: string) => {
  const n = Number(label);
  if (!Number.isFinite(n) || label === "No score") return "var(--p-other)";
  if (n <= 3) return "var(--lost-rank)";
  if (n <= 6) return "var(--lost-budget)";
  return "var(--shown)";
};

export function QsChart({ qs }: { qs: Keywords["qs"] }) {
  const data = qs.map((q) => ({ label: q.label, cost: q.cost, n: q.n }));
  return <Columns data={data} xKey="label" yKey="cost" color="var(--primary)" money height={240} colorOf={(r) => qsColor(String(r.label))} />;
}

const RATING_TONE: Record<string, "good" | "warn" | "bad" | "muted"> = { "Above average": "good", Average: "warn", "Below average": "bad" };
const Rating = ({ v }: { v: string }) => (v ? <Badge tone={RATING_TONE[v] ?? "muted"}>{v}</Badge> : <span className="text-muted-foreground">–</span>);
const Qs = ({ v }: { v: number | null }) =>
  v === null || v === undefined ? <span className="text-muted-foreground">–</span> : <span className="inline-flex items-center gap-1.5 font-medium"><span className="size-2 rounded-full" style={{ background: qsColor(String(v)) }} />{v}</span>;

type K = { r: KwRow; key: string };
type D = { d: Keywords["duplicates"][number]; key: string };
type A = { a: Keywords["ai_max"][number]; key: string };

export function KeywordTabs({ k, projects, labels }: { k: Keywords; projects: Project[]; labels: Record<string, string> }) {
  const pname = (id: string) => projects.find((p) => p.id === id)?.name.replace(" County", "") ?? "Other";
  const label = (c: string) => labels[c] ?? c;

  const base: Record<string, Column<K>> = {
    keyword: { key: "keyword", label: "Keyword", value: (x) => x.r.keyword, render: (x) => (
      <div className="min-w-[180px]"><div className="font-medium leading-snug">{x.r.keyword}</div><div className="mt-0.5 text-xs text-muted-foreground">{x.r.match_type}{x.r.status ? ` · ${x.r.status}` : ""}</div></div>
    ) },
    project: { key: "project", label: "Project", value: (x) => pname(x.r.project), render: (x) => <ProjectTag name={pname(x.r.project)} color={pcolor(x.r.project)} className="text-[13px] text-foreground" /> },
    campaign: { key: "campaign", label: "Campaign · ad group", value: (x) => `${label(x.r.campaign)} · ${x.r.ad_group}`, render: (x) => (
      <div className="min-w-[160px]"><div className="leading-snug">{label(x.r.campaign)}</div><div className="mt-0.5 text-xs text-muted-foreground">{x.r.ad_group}</div></div>
    ) },
    qs: { key: "qs", label: "Quality Score", align: "right", value: (x) => x.r.quality_score, render: (x) => <Qs v={x.r.quality_score} /> },
    rel: { key: "rel", label: "Ad relevance", value: (x) => x.r.ad_relevance, render: (x) => <Rating v={x.r.ad_relevance} /> },
    lp: { key: "lp", label: "Landing page", value: (x) => x.r.landing_page, render: (x) => <Rating v={x.r.landing_page} /> },
    clicks: { key: "clicks", label: "Clicks", align: "right", value: (x) => x.r.clicks, render: (x) => n0(x.r.clicks) },
    conv: { key: "conv", label: "Google conv.", align: "right", value: (x) => x.r.conv, render: (x) => n1(x.r.conv) },
    cost: { key: "cost", label: "Spend", align: "right", value: (x) => x.r.cost, render: (x) => <span className="font-medium">{inr(x.r.cost)}</span> },
  };
  const cols = (...keys: string[]) => keys.map((key) => base[key]);
  const kw = (list: KwRow[]): K[] => list.map((r, i) => ({ r, key: `${r.campaign}|${r.ad_group}|${r.keyword}|${i}` }));

  const dupCols: Column<D>[] = [
    { key: "project", label: "Project", value: (x) => pname(x.d.project), render: (x) => <ProjectTag name={pname(x.d.project)} color={pcolor(x.d.project)} className="text-[13px] text-foreground" /> },
    { key: "keyword", label: "Keyword", value: (x) => x.d.keyword, render: (x) => <span className="font-medium">{x.d.keyword}</span> },
    { key: "campaigns", label: "Live in these campaigns", value: (x) => x.d.campaigns.map(label).join(" and "), render: (x) => (
      <div className="flex flex-wrap gap-1.5">{x.d.campaigns.map((c) => <Badge key={c} tone="outline">{label(c)}</Badge>)}</div>
    ) },
    { key: "impr", label: "Times shown", align: "right", value: (x) => x.d.impr, render: (x) => n0(x.d.impr) },
    { key: "cost", label: "Spend", align: "right", value: (x) => x.d.cost, render: (x) => <span className="font-medium">{inr(x.d.cost)}</span> },
  ];
  const aiCols: Column<A>[] = [
    { key: "type", label: "Type of automatic match", value: (x) => x.a.type, render: (x) => <span className="font-medium">{x.a.type}</span> },
    { key: "impr", label: "Times shown", align: "right", value: (x) => x.a.impr, render: (x) => n0(x.a.impr) },
    { key: "clicks", label: "Clicks", align: "right", value: (x) => x.a.clicks, render: (x) => n0(x.a.clicks) },
    { key: "conv", label: "Google conv.", align: "right", value: (x) => x.a.conv, render: (x) => n1(x.a.conv) },
    { key: "cost", label: "Spend", align: "right", value: (x) => x.a.cost, render: (x) => <span className="font-medium">{inr(x.a.cost)}</span> },
  ];

  const products = projects.filter((p) => p.product).map((p) => `${p.name.replace(" County", "")}: ${p.product}`).join(" · ");
  const tabs = [
    { id: "no_conv", label: "No Google conversion", n: k.no_conv.length },
    { id: "low_quality", label: "Lowest Quality Score", n: k.low_quality.length },
    { id: "duplicates", label: "Same keyword in two campaigns", n: k.duplicates.length },
    ...(k.product_mismatch.length ? [{ id: "product_mismatch", label: "Product not sold", n: k.product_mismatch.length }] : []),
    { id: "ai_max", label: "AI Max automatic matches", n: k.ai_max.length },
  ];
  const sort = { key: "cost", dir: "desc" as const };

  return (
    <Tabs defaultValue="no_conv">
      <div className="overflow-x-auto pb-1">
        <TabsList>
          {tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label} <span className="tabular text-muted-foreground">{t.n}</span></TabsTrigger>)}
        </TabsList>
      </div>

      <TabsContent value="no_conv">
        <DataTable rows={kw(k.no_conv)} columns={cols("keyword", "project", "campaign", "qs", "lp", "clicks", "cost")} csvName="keywords-no-conversion" initialSort={sort} empty="Every keyword with spend brought at least one Google conversion." />
        <Explain>The keywords with the most spend and not a single Google conversion between the report dates (up to {k.no_conv.length} shown). Look at their search terms before deciding to pause them; some may bring calls Google does not count.</Explain>
      </TabsContent>

      <TabsContent value="low_quality">
        <DataTable rows={kw(k.low_quality)} columns={cols("keyword", "project", "campaign", "qs", "rel", "lp", "conv", "cost")} csvName="keywords-low-quality" initialSort={sort} empty="No keyword with spend has a Quality Score of 1 to 3." />
        <Explain>Keywords with spend and a Quality Score of 1 to 3, biggest spend first. The two rating columns say why: an ad that does not match the keyword, or a landing page Google rates below average.</Explain>
      </TabsContent>

      <TabsContent value="duplicates">
        <DataTable rows={k.duplicates.map((d, i) => ({ d, key: `${d.project}|${d.keyword}|${i}` }))} columns={dupCols} csvName="keywords-in-two-campaigns" initialSort={sort} empty="No keyword is live in two of our campaigns." />
        <Explain>The same keyword is live in two of our campaigns at once. Google lets only one of our ads into each auction, so the two campaigns compete with each other and their numbers stop being comparable. Decide which campaign owns each keyword.</Explain>
      </TabsContent>

      {k.product_mismatch.length ? (
        <TabsContent value="product_mismatch">
          <DataTable rows={kw(k.product_mismatch)} columns={cols("keyword", "project", "campaign", "clicks", "conv", "cost")} csvName="keywords-product-not-sold" initialSort={sort} />
          <Explain>Keywords for a type of home the project does not sell: {inr(k.product_mismatch_cost)} spent for {n1(k.product_mismatch_conv)} Google conversions. What each project sells: {products || "not recorded"}.</Explain>
        </TabsContent>
      ) : null}

      <TabsContent value="ai_max">
        <DataTable rows={k.ai_max.map((a, i) => ({ a, key: `${a.type}|${i}` }))} columns={aiCols} csvName="ai-max-matches" searchable={false} initialSort={sort} empty="No AI Max rows in the keyword report." />
        <Explain>AI Max lets Google show our ads on searches, and send people to pages, beyond the keywords the agency wrote. These rows are the spend Google reports for those automatic matches.</Explain>
      </TabsContent>
    </Tabs>
  );
}
