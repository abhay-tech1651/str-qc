import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { change, drange, dshort, inr, lakh, n0, n1, pcolor, pct } from "@/lib/format";
import { Button, Card, CardBody, CardHeader, EmptyState, Explain, PageHeader, ProjectTag, Section } from "@/components/ui";
import { IssueList, ProjectCard, StatCard } from "@/components/blocks";
import { StackedDaily } from "@/components/charts";
import { periodData, periodModel } from "@/lib/period";

export default async function OverviewPage() {
  if (!hasData()) {
    return (
      <>
        <PageHeader eyebrow="Welcome" title="Let's load your Google Ads data" description="The dashboard fills itself from Google Ads exports and the agency's STR sheet. It takes about a minute." />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">
          Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link> and press “Import from Downloads”.
        </EmptyState>
      </>
    );
  }
  const m = (await periodModel());
  const pn = m.period?.name ?? "the last 7 days", pp = m.period?.prev ?? "the 7 days before", pns = pn.replace(/^the /, "");
  const a = m.account;
  const w = m.windows;
  const hasCamp = m.campaigns.length > 0;
  const e = m.agency.excludes;
  const top = m.fixes.filter((f) => f.severity !== "low");
  const last7 = w.last7;
  const spendBy = m.projects.map((p) => ({ name: p.name.replace(" County", ""), id: p.id, cost: m.project_stats[p.id].last7.cost })).sort((x, y) => y.cost - x.cost);
  const daily = a.daily.map((d) => ({ day: d.day, ...d.by_project }));
  const keys = m.projects.map((p) => ({ key: p.id, label: p.name.replace(" County", ""), color: pcolor(p.id) }));

  return (
    <>
      <PageHeader
        eyebrow={`Daily briefing · ${dshort(m.as_of)}`}
        title="Search ads at a glance"
        description={hasCamp
          ? <>In {pn} ({drange(last7?.from, last7?.to)}) search ads cost <b className="font-semibold text-foreground">{lakh(a.last7.cost)}</b> and brought <b className="font-semibold text-foreground">{n1(a.last7.conv)}</b> Google conversions at <b className="font-semibold text-foreground">{inr(a.last7.cpa)}</b> each. Since {dshort(w.since?.from)}: {lakh(a.since.cost)} for {n1(a.since.conv)} conversions.</>
          : <>The agency sheet is loaded, so the search-term checks are live. Spend, conversions and keyword quality appear once a campaign report is imported.</>}
        actions={<Button asChild variant="outline"><Link href="/issues">All issues <ArrowRight /></Link></Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Spend, ${pns}`} value={hasCamp ? lakh(a.last7.cost) : "–"} delta={change(a.last7.cost, a.prev7.cost)} invert
          sub={hasCamp ? `vs ${lakh(a.prev7.cost)} ${pp}` : "campaign data not imported"} spark={a.daily.map((d) => d.cost)} />
        <StatCard label={`Google conversions, ${pns}`} value={hasCamp ? n1(a.last7.conv) : "–"} delta={change(a.last7.conv, a.prev7.conv)}
          sub={hasCamp ? `${n1(a.prev7.conv)} ${pp} · counted by Google, not CRM` : ""} spark={a.daily.map((d) => d.conv)} color="var(--good)" />
        <StatCard label="Cost per conversion" value={hasCamp ? inr(a.last7.cpa) : "–"} delta={change(a.last7.cpa, a.prev7.cpa)} invert
          sub={hasCamp ? `${inr(a.since.cpa)} since ${dshort(w.since?.from)}` : ""} />
        <StatCard label="Agency Exclude calls applied" value={m.agency.changes_from ? pct(e.applied_pct) : "–"}
          tone={!m.agency.changes_from ? undefined : (e.applied_pct ?? 0) >= 95 ? "good" : "warn"}
          sub={m.agency.changes_from ? `${n0(e.overdue)} never applied · ${inr(e.overdue_cost)} spent on them` : "import a change history to check"} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Needs attention" description="Most urgent first. Click any line for what happened and what to do." action={<Button asChild variant="ghost" size="sm"><Link href="/issues">See all {m.fixes.length}</Link></Button>} />
          <div className="px-2 pb-2 pt-1"><IssueList fixes={top} model={m} limit={7} /></div>
        </Card>
        <Card>
          <CardHeader title={`Where ${pn} went`} description={hasCamp ? `${lakh(a.last7.cost)} across ${m.projects.length} projects` : "No campaign data yet"} />
          <CardBody className="pt-2">
            {hasCamp ? (
              <div className="space-y-3">
                {spendBy.map((s) => {
                  const share = a.last7.cost ? (100 * s.cost) / a.last7.cost : 0;
                  return (
                    <Link key={s.id} href={`/projects/${s.id}`} className="block rounded-lg p-1 hover:bg-muted/50">
                      <div className="flex items-center justify-between text-sm">
                        <ProjectTag name={s.name} color={pcolor(s.id)} className="text-[13px] text-foreground" />
                        <span className="tabular font-medium">{lakh(s.cost)} <span className="font-normal text-muted-foreground">· {pct(share)}</span></span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${share}%`, background: pcolor(s.id) }} /></div>
                    </Link>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground">Import a campaign report to see spend by project.</p>}
          </CardBody>
        </Card>
      </div>

      <Section title="Projects" description={`The same view for every project: ${pns}, the trend since the start of the data, and the most important thing to fix.`}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {m.projects.map((p) => <ProjectCard key={p.id} model={m} id={p.id} />)}
        </div>
      </Section>

      {hasCamp ? (
        <Section title="Daily spend by project" description={`Search campaigns, ${drange(w.since?.from, w.since?.to)}. Today is left out until its data is complete.`}>
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap gap-4">{keys.map((k) => <ProjectTag key={k.key} name={k.label} color={k.color} />)}</div>
            <StackedDaily data={daily} keys={keys} height={280} />
            <Explain>A sudden step up or down usually follows a change someone made (a budget, a bid strategy, a batch of keywords). Check “Said vs done” and the campaign pages before blaming the market.</Explain>
          </Card>
        </Section>
      ) : null}

      <Section title="Agency report card" description={`Every Add and Exclude in the agency's STR sheet, checked against the Google Ads change history. The agency gets ${m.agency.grace_days} days before a call counts as late.`}
        action={<Button asChild variant="ghost" size="sm"><Link href="/agency">Details <ArrowRight /></Link></Button>}>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Project</th>
              <th className="px-4 py-2.5 text-right font-medium">Exclude calls</th>
              <th className="px-4 py-2.5 text-right font-medium">Applied</th>
              <th className="px-4 py-2.5 text-right font-medium">Never applied</th>
              <th className="px-4 py-2.5 text-right font-medium">Spent on those</th>
              <th className="px-4 py-2.5 text-right font-medium">Adds not added</th>
            </tr></thead>
            <tbody>
              {m.projects.map((p) => {
                const r = m.agency.by_project[p.id];
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5"><ProjectTag name={p.name} color={pcolor(p.id)} className="text-[13px] text-foreground" /></td>
                    <td className="px-4 py-2.5 text-right tabular">{n0(r?.excludes)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{pct(r?.applied_pct)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{n0(r?.overdue)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{inr(r?.overdue_cost)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{n0(r?.adds_overdue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </Section>

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        Data: campaigns {drange(m.data.campaign_days?.from, m.data.campaign_days?.complete_through) || "not imported"} · search terms {drange(m.data.search_terms?.from, m.data.search_terms?.to) || "–"} · agency sheet {drange(m.data.agency_sheet?.from, m.data.agency_sheet?.to) || "–"} · change history {drange(m.data.changes?.from, m.data.changes?.to) || "not imported"}. “Google conversions” are counted by Google Ads, not qualified leads from the CRM.
      </p>
    </>
  );
}

export const dynamic = "force-dynamic";
