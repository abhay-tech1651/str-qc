"use client";
/** Project page, CTM tab: the Google CTM campaign's case, as a chart, a table of periods between changes, and a timeline. */
import * as React from "react";
import { Settings2, UserRound } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, Explain } from "./ui";
import { CtmChart } from "./charts";
import { DataTable, type Column } from "./data-table";
import { ListHead, MiniStat, Neg, useLabel } from "./project-kit";
import { cn, dlong, drange, dshort, inr, n0, n1, pct } from "@/lib/format";
import type { Ctm, Model } from "@/lib/types";

type Period = Ctm["periods"][number] & Record<string, unknown>;
type Dup = Ctm["duplicates"][number] & Record<string, unknown>;

export function ProjectCtm({ model }: { model: Model }) {
  const label = useLabel(model);
  const ctm = model.ctm;
  if (!ctm) return null;
  const camp = model.campaigns.find((c) => c.id === ctm.campaign) ?? null;
  const series = (camp?.series ?? []) as unknown as Record<string, unknown>[];
  const markers = ctm.events.filter((e) => e.setting).map((e) => ({ day: e.day, label: e.lines.join("; ") }));
  const periods = ctm.periods as Period[];
  const withPool = periods.filter((p) => typeof p.eligible_per_day === "number");
  const first = withPool[0];
  const last = withPool[withPool.length - 1];

  const periodCols: Column<Period>[] = [
    { key: "start", label: "Period", value: (p) => p.start,
      render: (p) => <div className="whitespace-nowrap"><div className="font-medium tabular">{drange(p.start, p.end)}</div><div className="text-xs text-muted-foreground">{n0(p.days)} {p.days === 1 ? "day" : "days"}</div></div> },
    { key: "change", label: "What changed at the start", value: (p) => (p.change || []).join("; "),
      render: (p) => <div className="min-w-[220px] max-w-md text-[13px] leading-snug">{(p.change || []).join("; ") || "–"}</div> },
    { key: "eligible", label: "Searches it could enter / day", align: "right", value: (p) => p.eligible_per_day, render: (p) => <span className="font-semibold">{n0(p.eligible_per_day)}</span> },
    { key: "impr", label: "Shown / day", align: "right", value: (p) => p.impr_per_day, render: (p) => n0(p.impr_per_day) },
    { key: "cost", label: "Spend / day", align: "right", value: (p) => p.cost_per_day, render: (p) => inr(p.cost_per_day) },
    { key: "conv", label: "Google conv", align: "right", value: (p) => p.conv, render: (p) => n1(p.conv) },
  ];
  const dupCols: Column<Dup>[] = [
    { key: "keyword", label: "Keyword", value: (r) => r.keyword, render: (r) => <Neg>{r.keyword}</Neg> },
    { key: "campaigns", label: "Live in", value: (r) => (r.campaigns || []).map(label).join(" + "), render: (r) => (r.campaigns || []).map(label).join(" + ") || "–" },
    { key: "impr", label: "Times shown", align: "right", value: (r) => r.impr, render: (r) => n0(r.impr) },
    { key: "cost", label: "Spend", align: "right", value: (r) => r.cost, render: (r) => inr(r.cost) },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Budget now" value={inr(ctm.budget_now)} sub="a day" />
        <MiniStat label="Actually spent, last 7 days" value={inr(camp?.last7?.cost_per_day)} sub={`a day · ${pct(camp?.last7?.budget_use)} of the budget`} tone={(camp?.last7?.budget_use ?? 100) < 50 ? "warn" : undefined} />
        <MiniStat label="Target cost per conversion" value={ctm.target_cpa_now ? inr(ctm.target_cpa_now) : "none"} sub={camp?.bid_strategy || ""} />
        <MiniStat label="Searches it could enter / day" value={n0(last?.eligible_per_day)}
          sub={first && last && first !== last ? `was ${n0(first.eligible_per_day)} in ${drange(first.start, first.end)}` : "estimate"}
          tone={first && last && (last.eligible_per_day ?? 0) < (first.eligible_per_day ?? 0) ? "bad" : undefined} />
      </div>

      <Card className="mt-6">
        <CardHeader title={`${camp?.label ?? label(ctm.campaign)}, day by day`}
          description="Green bars: times the ad showed. Line: searches it was allowed to enter. Dashed lines: days a setting was changed." />
        <CardBody className="pt-3">
          {series.length ? <CtmChart data={series} markers={markers} height={320} /> : <p className="text-sm text-muted-foreground">No daily data for this campaign.</p>}
          <Explain>
            The line estimates how many searches the campaign was allowed to enter each day (times shown ÷ share of searches shown on). The scale is logarithmic, so equal steps mean equal percentage changes.
            If the line falls, no budget can fix it: the campaign&apos;s keywords and settings decide how many searches it may enter.
          </Explain>
        </CardBody>
      </Card>

      <div className="mt-8">
        <ListHead title="Between one change and the next" count={periods.length} description="Each row is a stretch of days with the same settings, averaged per day." />
        <DataTable rows={periods} columns={periodCols} csvName="ctm-periods" searchable={false} pageSize={20} />
        <Explain>Compare the “searches it could enter” column with the change that started each period: that is where the campaign&apos;s reach was won or lost. “–” means Google did not report enough share data that day to estimate it.</Explain>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Change history" description="Every change to this campaign, newest first. Settings changes are marked." />
          <CardBody className="pt-4">
            {ctm.events.length ? (
              <ol className="relative ml-2 border-l">
                {[...ctm.events].reverse().map((e, i) => (
                  <li key={`${e.day}-${i}`} className="relative pb-5 pl-6 last:pb-0">
                    <span className={cn("absolute -left-[7px] top-1 grid size-3.5 place-items-center rounded-full ring-4 ring-card", e.setting ? "bg-[color:var(--warn)]" : "bg-muted-foreground/50")} />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold">{dlong(e.day) || dshort(e.day)}</span>
                      {e.setting ? <Badge tone="warn"><Settings2 className="size-3" /> Setting</Badge> : null}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[13px] leading-snug">
                      {e.lines.map((l, j) => <li key={j}>{l}</li>)}
                    </ul>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="size-3" /> {e.who || "–"}</div>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted-foreground">No changes in the imported change history.</p>}
          </CardBody>
        </Card>

        <div className="xl:col-span-3">
          <ListHead title="Keywords CTM shares with our other campaigns" count={ctm.duplicates.length}
            description="The same keyword live in CTM and in another of our campaigns." />
          <DataTable rows={ctm.duplicates as Dup[]} columns={dupCols} csvName="ctm-shared-keywords" initialSort={{ key: "cost", dir: "desc" }} empty="None: CTM's keywords live only in CTM." />
          <Explain>Google lets only one of our ads into each auction, so where CTM and an agency campaign share a keyword they take turns, and CTM&apos;s share of those searches depends on the other campaign.</Explain>
        </div>
      </div>
    </>
  );
}
