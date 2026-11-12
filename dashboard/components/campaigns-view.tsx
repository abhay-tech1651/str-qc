"use client";
/** Campaigns page body: project filter, status summary, the campaign table with a details drawer, and cost per conversion. */
import * as React from "react";
import { Badge, Card, CardBody, CardHeader, Explain, ProjectTag, Segmented, Sheet } from "./ui";
import { DataTable, type Column } from "./data-table";
import { VerdictBadge } from "./blocks";
import { HBars, ShowBar, SpendShare } from "./charts";
import { change, cn, drange, dshort, inr, lakh, n0, n1, pcolor, pct, plural } from "@/lib/format";
import type { Campaign, Model, Project, Verdict } from "@/lib/types";

type Win = Model["windows"];
type Row = { c: Campaign; key: string };

const short = (p?: Project) => (p ? p.name.replace(" County", "") : "Other");

const VERDICT_TEXT: Record<Verdict, string> = {
  idle: "Not spending",
  underspending: "Uses little of its budget",
  budget: "Held back by budget",
  rank: "Losing auctions",
  brand_gap: "Missing brand searches",
  ok: "Healthy",
};
const VERDICT_ORDER: Verdict[] = ["budget", "rank", "brand_gap", "underspending", "idle", "ok"];
const VERDICT_TONE: Record<Verdict, "warn" | "bad" | "muted" | "good"> = { budget: "warn", rank: "bad", brand_gap: "warn", underspending: "muted", idle: "muted", ok: "good" };

/** What the status means for this campaign, with its own numbers. */
function verdictSentence(c: Campaign, w: Win) {
  const s = c.last7;
  const when = `In the last 7 days (${drange(w.last7?.from, w.last7?.to)})`;
  switch (c.verdict) {
    case "idle": return `${when} this campaign spent nothing.`;
    case "underspending": return `${when} it spent ${inr(s?.cost_per_day)} a day, ${pct(s?.budget_use)} of its ${inr(c.budget_now)} daily budget. It is not finding enough searches to spend its budget.`;
    case "budget": return `${when} it missed ${pct(s?.lost_budget_pct)} of the searches it could have shown on because the daily budget ran out.`;
    case "rank": return s?.is_pct === null
      ? `${when} it showed on under 10% of the searches it could enter: it loses most auctions to other advertisers.`
      : `${when} it missed ${pct(s?.lost_rank_pct)} of the searches it could have shown on because other ads won the auction (higher bids or better ad quality).`;
    case "brand_gap": return `${when} this brand campaign showed on only ${pct(s?.is_pct)} of searches for our own name. The rest of the time, people searching for us did not see our ad.`;
    default: return `${when} it showed on ${pct(s?.is_pct)} of the searches it could enter, with no big loss to budget or auctions.`;
  }
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3", className)}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm leading-snug">{children}</div>
    </div>
  );
}

function CampaignSheet({ c, projects, windows, onClose }: { c: Campaign | null; projects: Project[]; windows: Win; onClose: () => void }) {
  if (!c) return null;
  const p = projects.find((x) => x.id === c.project);
  const s = c.last7, all = c.since, prev = c.prev7;
  const d = change(s?.cost, prev?.cost);
  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()} title={c.label}
      description={<span className="flex flex-wrap items-center gap-2"><ProjectTag name={short(p)} color={pcolor(c.project)} /><span>· {c.ctype} · {c.bid_strategy} · run by {c.runner}</span></span>}>
      <div className="space-y-6">
        <div className="rounded-xl border bg-muted/40 p-4">
          <VerdictBadge c={c} />
          <p className="mt-2 text-[15px] leading-relaxed">{verdictSentence(c, windows)}</p>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Daily spend and how often it showed</div>
          <SpendShare data={c.series as unknown as Record<string, unknown>[]} height={240} />
          <Explain>Bars are rupees spent each day. The green line is the share of possible searches where the ad appeared; the amber and red lines are the shares it missed because the budget ran out or another ad won the auction.</Explain>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Fact label="Google's status" className="sm:col-span-2">
            {c.status || "–"}{c.status_reasons ? <span className="text-muted-foreground"> · {c.status_reasons}</span> : null}
          </Fact>
          <Fact label="Budget per day"><span className="tabular font-medium">{inr(c.budget_now)}</span></Fact>
          <Fact label="Target cost per conversion">
            {c.target_cpa_now ? <span className="tabular font-medium">{inr(c.target_cpa_now)}</span> : <span className="text-muted-foreground">Not set ({c.bid_strategy})</span>}
          </Fact>
          <Fact label={`Last 7 days · ${drange(windows.last7?.from, windows.last7?.to)}`}>
            <span className="tabular font-medium">{inr(s?.cost)}</span>
            {d.label ? <Badge tone={d.dir === "flat" ? "muted" : "outline"} className="ml-2 tabular">{d.label} vs week before</Badge> : null}
            <div className="mt-1 text-xs text-muted-foreground tabular">
              {n0(s?.clicks)} clicks · {n1(s?.conv)} Google {plural(s?.conv, "conversion")}{s?.cpa ? ` at ${inr(s.cpa)} each` : ""}
            </div>
          </Fact>
          <Fact label={`Since ${dshort(windows.since?.from)}`}>
            <span className="tabular font-medium">{lakh(all?.cost)}</span>
            <div className="mt-1 text-xs text-muted-foreground tabular">
              {n1(all?.conv)} Google {plural(all?.conv, "conversion")}{all?.cpa ? ` at ${inr(all.cpa)} each` : ""} · {n1(all?.all_conv)} all conv. · {inr(all?.cpc)} a click
            </div>
          </Fact>
          <Fact label="Can it show? (last 7 days)" className="sm:col-span-2">
            <ShowBar shown={s?.is_pct ?? null} budget={s?.lost_budget_pct ?? null} rank={s?.lost_rank_pct ?? null} compact />
            <p className="mt-2">
              {s?.is_pct === null || s?.is_pct === undefined
                ? <>It showed on under 10% of the searches it could enter.</>
                : <>Out of every 100 searches it could have shown on, it showed on <b className="font-semibold tabular">{n0(s.is_pct)}</b>, missed <b className="font-semibold tabular">{n0(s.lost_budget_pct)}</b> because the budget ran out and <b className="font-semibold tabular">{n0(s.lost_rank_pct)}</b> because another ad won the auction.</>}
              {s?.top_is_pct !== null && s?.top_is_pct !== undefined ? <> It was in the top ads, above the normal results, on {pct(s.top_is_pct)} of them.</> : null}
            </p>
          </Fact>
          {c.conv_gap ? (
            <Fact label="Conversion count check" className="sm:col-span-2">
              Google counts {n1(all?.all_conv)} “all conversions” but only {n1(all?.conv)} Google conversions since {dshort(windows.since?.from)}. “All conversions” includes secondary actions, so it should not be quoted as leads.
            </Fact>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}

export function CampaignsView({ campaigns, projects, windows, initialProject = "all", initialCampaign }: {
  campaigns: Campaign[]; projects: Project[]; windows: Win; initialProject?: string; initialCampaign?: string;
}) {
  const valid = initialProject === "all" || projects.some((p) => p.id === initialProject);
  const [project, setProject] = React.useState(valid ? initialProject : "all");
  const [open, setOpen] = React.useState<Campaign | null>(() => campaigns.find((c) => c.id === initialCampaign) ?? null);
  const pmap = React.useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const list = campaigns.filter((c) => project === "all" || c.project === project);
  const rows: Row[] = list.map((c) => ({ c, key: c.id }));

  const counts = VERDICT_ORDER.map((v) => ({ v, n: list.filter((c) => c.verdict === v).length })).filter((x) => x.n > 0);

  const columns: Column<Row>[] = [
    { key: "project", label: "Project", value: (r) => short(pmap[r.c.project]), render: (r) => <ProjectTag name={short(pmap[r.c.project])} color={pcolor(r.c.project)} className="text-[13px] text-foreground" /> },
    { key: "label", label: "Campaign", value: (r) => r.c.label, render: (r) => (
      <div className="min-w-[180px]">
        <div className="font-medium leading-snug">{r.c.label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{r.c.bid_strategy}{r.c.runner && r.c.runner !== "ROI" ? ` · run by ${r.c.runner}` : ""}</div>
      </div>
    ) },
    { key: "verdict", label: "Status", value: (r) => VERDICT_TEXT[r.c.verdict], render: (r) => <VerdictBadge c={r.c} /> },
    { key: "show", label: "Can it show? (7 days)", value: (r) => r.c.last7?.is_pct ?? null, render: (r) => r.c.last7 ? <ShowBar shown={r.c.last7.is_pct} budget={r.c.last7.lost_budget_pct} rank={r.c.last7.lost_rank_pct} /> : <span className="text-xs text-muted-foreground">no data</span> },
    { key: "budget", label: "Budget/day", align: "right", value: (r) => r.c.budget_now, render: (r) => inr(r.c.budget_now) },
    { key: "perday", label: "Spent/day (7d)", align: "right", value: (r) => r.c.last7?.cost_per_day ?? null, render: (r) => (
      <div>
        <div>{inr(r.c.last7?.cost_per_day)}</div>
        <div className="text-[11px] text-muted-foreground">{r.c.last7?.budget_use !== null && r.c.last7?.budget_use !== undefined ? `${pct(r.c.last7.budget_use)} of budget` : ""}</div>
      </div>
    ) },
    { key: "cost", label: "Spend since start", align: "right", value: (r) => r.c.since?.cost ?? null, render: (r) => lakh(r.c.since?.cost) },
    { key: "conv", label: "Google conv.", align: "right", value: (r) => r.c.since?.conv ?? null, render: (r) => (
      <div>
        <div>{n1(r.c.since?.conv)}</div>
        <div className="text-[11px] text-muted-foreground">{n1(r.c.since?.all_conv)} all conv.</div>
      </div>
    ) },
    { key: "cpa", label: "Cost/conv.", align: "right", value: (r) => r.c.since?.cpa ?? null, render: (r) => r.c.since?.cpa ? inr(r.c.since.cpa) : <span className="text-muted-foreground">{(r.c.since?.cost ?? 0) > 0 ? "no conv." : "–"}</span> },
    { key: "cpc", label: "Avg click", align: "right", value: (r) => r.c.since?.cpc ?? null, render: (r) => inr(r.c.since?.cpc) },
  ];

  const withCpa = list.filter((c) => (c.since?.cost ?? 0) > 1000 && c.since?.cpa)
    .map((c) => ({ label: c.label, cpa: c.since!.cpa as number, color: pcolor(c.project) }))
    .sort((a, b) => b.cpa - a.cpa);
  const noConv = list.filter((c) => (c.since?.cost ?? 0) > 0 && !c.since?.cpa).sort((a, b) => (b.since?.cost ?? 0) - (a.since?.cost ?? 0));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={project} onChange={setProject} options={[{ value: "all", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: short(p) }))]} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular">{list.length} {plural(list.length, "campaign")}:</span>
          {counts.map((x) => <Badge key={x.v} tone={VERDICT_TONE[x.v]} className="tabular">{x.n} {VERDICT_TEXT[x.v].toLowerCase()}</Badge>)}
        </div>
      </div>

      <DataTable rows={rows} columns={columns} pageSize={20} csvName="campaigns" onRowClick={(r) => setOpen(r.c)}
        initialSort={{ key: "cost", dir: "desc" }} empty="No search campaigns for this project." />
      <Explain>One row per search campaign. Status and “Can it show?” use the last 7 days ({drange(windows.last7?.from, windows.last7?.to)}); spend, conversions and prices use everything since {dshort(windows.since?.from)}. Click a row for its daily chart and what the status means.</Explain>

      <Card className="mt-6">
        <CardHeader title="Cost per Google conversion" description={`Since ${dshort(windows.since?.from)}, campaigns that spent more than ₹1,000. Longest bar = most expensive lead.`} />
        <CardBody className="pt-3">
          {withCpa.length ? <HBars data={withCpa} valueKey="cpa" labelKey="label" color={(r) => String(r.color)} /> : <p className="text-sm text-muted-foreground">No campaign in this view has both spend and a Google conversion.</p>}
          {noConv.length ? (
            <div className="mt-4 rounded-lg border border-dashed p-3">
              <div className="text-[13px] font-medium">Spent money with no Google conversion</div>
              <ul className="mt-1.5 space-y-1 text-[13px] text-muted-foreground">
                {noConv.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-2">
                    <ProjectTag name={c.label} color={pcolor(c.project)} className="text-[13px] text-foreground" />
                    <span className="tabular">{inr(c.since?.cost)} since {dshort(windows.since?.from)}, {n0(c.since?.clicks)} {plural(c.since?.clicks, "click")}, no conversion</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Explain>Bars are coloured by project. Compare like with like: brand campaigns (people searching our name) should cost less per lead than non-brand ones. These are Google Ads conversions, not qualified leads from the CRM.</Explain>
        </CardBody>
      </Card>

      <CampaignSheet c={open} projects={projects} windows={windows} onClose={() => setOpen(null)} />
    </>
  );
}
