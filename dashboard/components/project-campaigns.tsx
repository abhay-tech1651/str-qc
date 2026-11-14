"use client";
/** Project page, Campaigns tab: every campaign of the project, with a details drawer per campaign. */
import * as React from "react";
import { Info } from "lucide-react";
import { Badge, Card, Explain, Sheet, Tip } from "./ui";
import { ShowBar, SpendShare } from "./charts";
import { DataTable, type Column } from "./data-table";
import { VerdictBadge } from "./blocks";
import { MiniStat } from "./project-kit";
import { drange, inr, lakh, n0, n1, pct } from "@/lib/format";
import type { Campaign, Model } from "@/lib/types";

type Row = Campaign & Record<string, unknown>;

function Swatch({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {children}
    </span>
  );
}

const VERDICT_WORDS: Record<string, string> = {
  budget: "Held back by budget: it missed 20% or more of its searches in the period shown because the daily budget ran out.",
  rank: "Losing auctions: it missed 40% or more of its searches because its bid or Quality Score was too low (rank).",
  underspending: "Uses only part of its budget: in the period shown it spent under 30% of its daily budget.",
  brand_gap: "Missing brand searches: a brand campaign that showed on fewer than 80% of the searches for our own name.",
  idle: "Not spending: no spend in the period shown.",
  ok: "Healthy: none of the warning rules is triggered.",
};

export function ProjectCampaigns({ model, id }: { model: Model; id: string }) {
  const rows = React.useMemo(() => model.campaigns.filter((c) => c.project === id) as Row[], [model, id]);
  const [open, setOpen] = React.useState<Campaign | null>(null);
  const w = model.windows;

  if (!rows.length) {
    return <Card className="px-6 py-12 text-center text-sm text-muted-foreground">No campaigns for this project in the imported campaign report.</Card>;
  }

  const columns: Column<Row>[] = [
    { key: "label", label: "Campaign", value: (c) => c.label,
      render: (c) => (
        <div className="min-w-[180px]">
          <div className="font-medium">{c.label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{c.bid_strategy || "–"}</div>
        </div>
      ) },
    { key: "verdict", label: "Status", value: (c) => c.verdict, render: (c) => <VerdictBadge c={c} /> },
    { key: "show", label: "Can it show?", value: (c) => c.last7?.is_pct ?? null,
      render: (c) => <ShowBar shown={c.last7?.is_pct ?? null} budget={c.last7?.lost_budget_pct ?? null} rank={c.last7?.lost_rank_pct ?? null} /> },
    { key: "budget", label: "Budget / day", align: "right", value: (c) => c.budget_now, render: (c) => inr(c.budget_now) },
    { key: "spent", label: "Spent / day", align: "right", value: (c) => c.last7?.cost_per_day ?? null, render: (c) => inr(c.last7?.cost_per_day) },
    { key: "cost", label: "Spend since start", align: "right", value: (c) => c.since?.cost ?? null, render: (c) => lakh(c.since?.cost) },
    { key: "conv", label: "Google conv", align: "right", value: (c) => c.since?.conv ?? null,
      render: (c) => (
        <span className="inline-flex items-center gap-1">
          {n1(c.since?.conv)}
          {c.conv_gap ? (
            <Tip content={<>Google also counts many “all conversions” here ({n0(c.since?.all_conv)} since the start). Only this column is leads.</>}>
              <button type="button" onClick={(e) => e.stopPropagation()} className="font-semibold text-[color:var(--warn)]" aria-label="About all conversions">*</button>
            </Tip>
          ) : null}
        </span>
      ) },
    { key: "cpa", label: "Cost / conv", align: "right", value: (c) => c.since?.cpa ?? null, render: (c) => inr(c.since?.cpa) },
    { key: "cpc", label: "Avg click", align: "right", value: (c) => c.since?.cpc ?? null, render: (c) => inr(c.since?.cpc) },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-medium text-muted-foreground">“Can it show?”, {(model.period?.name ?? "the last 7 days").replace(/^the /, "")}:</span>
        <Swatch color="var(--shown)">Shown</Swatch>
        <Swatch color="var(--lost-budget)">Missed: budget ran out</Swatch>
        <Swatch color="var(--lost-rank)">Missed: lost the auction (rank)</Swatch>
      </div>
      <DataTable rows={rows} columns={columns} csvName={`${id}-campaigns`} onRowClick={(r) => setOpen(r)} pageSize={20}
        initialSort={{ key: "cost", dir: "desc" }} />
      <Explain>
        Spend, conversions and costs are since {drange(w.since?.from, w.since?.to) || "the start of the data"}; “Can it show?” and “Spent / day” are {model.period?.name ?? "the last 7 days"} ({drange(w.last7?.from, w.last7?.to) || "–"}).
        The bar shows, out of all the searches the campaign could have appeared on, how many it was shown on (green), missed because the budget ran out (amber), and missed because its ad ranked too low (red).
        Status rules: <b className="font-medium text-foreground">Held back by budget</b> = missed 20% or more for budget; <b className="font-medium text-foreground">Losing auctions</b> = missed 40% or more for rank; <b className="font-medium text-foreground">Uses N% of budget</b> = spent under 30% of its budget; <b className="font-medium text-foreground">Missing brand searches</b> = a brand campaign shown on under 80%. Click a campaign for its daily chart.
      </Explain>
      <CampaignSheet c={open} model={model} onClose={() => setOpen(null)} />
    </>
  );
}

function Fact({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular">{children}</span>
    </div>
  );
}

function CampaignSheet({ c, model, onClose }: { c: Campaign | null; model: Model; onClose: () => void }) {
  if (!c) return null;
  const s7 = c.last7;
  const w = model.windows;
  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()} title={c.label}
      description={<span className="flex flex-wrap items-center gap-2"><VerdictBadge c={c} /><span className="text-xs">{c.ctype} · run by {c.runner || "–"}</span></span>}>
      <div className="space-y-6">
        <div className="rounded-xl border bg-muted/40 p-4 text-[14px] leading-relaxed">
          {VERDICT_WORDS[c.verdict] ?? "–"}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{(model.period?.name ?? "the last 7 days").replace(/^the /, "")} ({drange(w.last7?.from, w.last7?.to) || "–"})</div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Shown on" value={pct(s7?.is_pct)} sub="of the searches it could enter" tone="good" />
            <MiniStat label="Missed: budget" value={pct(s7?.lost_budget_pct)} sub="the daily budget ran out" tone={(s7?.lost_budget_pct ?? 0) >= 20 ? "warn" : undefined} />
            <MiniStat label="Missed: rank" value={pct(s7?.lost_rank_pct)} sub="its ad ranked too low" tone={(s7?.lost_rank_pct ?? 0) >= 40 ? "bad" : undefined} />
            <MiniStat label="Top of page" value={pct(s7?.top_is_pct)} sub="shown above the search results" />
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Day by day</div>
          <Card className="p-4">
            {c.series.length ? <SpendShare data={c.series as unknown as Record<string, unknown>[]} height={240} /> : <p className="text-sm text-muted-foreground">No daily data.</p>}
          </Card>
          <Explain>Bars are the spend each day; the lines are the share of searches it was shown on, and the shares it missed because of budget or rank. A line that jumps on one day usually follows a change someone made.</Explain>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Key facts</div>
          <div className="divide-y">
            <Fact label="Google status">
              <span className="block">{c.status || "–"}</span>
              {c.status_reasons ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{c.status_reasons}</span> : null}
            </Fact>
            <Fact label="Bidding">{c.bid_strategy || "–"}</Fact>
            <Fact label="Budget now">{inr(c.budget_now)} a day</Fact>
            <Fact label="Target cost per conversion">{c.target_cpa_now ? inr(c.target_cpa_now) : "none set"}</Fact>
            <Fact label={`Spent per day, ${(model.period?.name ?? "the last 7 days").replace(/^the /, "")}`}>{inr(s7?.cost_per_day)} <span className="font-normal text-muted-foreground">· {pct(s7?.budget_use)} of budget</span></Fact>
            <Fact label={`Spend since ${drange(w.since?.from, w.since?.to) || "the start"}`}>{inr(c.since?.cost)}</Fact>
            <Fact label="Google conversions (leads)">{n1(c.since?.conv)}</Fact>
            <Fact label={<span className="inline-flex items-center gap-1">“All conversions” <Tip content="Google's wider count of every conversion action. Only “Google conversions” above are leads."><Info className="size-3.5" /></Tip></span>}>
              {n0(c.since?.all_conv)} {c.conv_gap ? <Badge tone="warn" className="ml-1">far above leads</Badge> : null}
            </Fact>
            <Fact label="Cost per conversion">{inr(c.since?.cpa)}</Fact>
            <Fact label="Average click">{inr(c.since?.cpc)}</Fact>
            <Fact label="Clicks · times shown">{n0(c.since?.clicks)} · {n0(c.since?.impr)}</Fact>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
