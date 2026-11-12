import Link from "next/link";
import { CircleAlert, Database, Info } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { dlong, drange, inr, n0, pcolor, pct, plural } from "@/lib/format";
import { Card, CardBody, CardHeader, EmptyState, Explain, PageHeader, ProjectTag, Section } from "@/components/ui";
import { StatCard } from "@/components/blocks";
import { ByDayChart, LagChart, OutcomeLegend } from "@/components/agency-charts";
import { AgencyTabs, type AgencyTab } from "@/components/agency-tabs";

/* kept here too: values exported from a client module cannot be read on the server */
const AGENCY_TABS: readonly AgencyTab[] = ["excludes", "adds", "nonegative", "risky", "blocked", "conflicts", "leaks"];

export const dynamic = "force-dynamic";
export const metadata = { title: "Said vs done" };

function Notice({ tone, icon, title, children }: { tone: "warn" | "info"; icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={tone === "warn" ? "mb-6 flex gap-3 rounded-xl border border-[color:var(--warn)]/30 bg-warn-soft p-4" : "mb-6 flex gap-3 rounded-xl border bg-info-soft p-4"}>
      <div className={tone === "warn" ? "mt-0.5 text-[color:var(--warn)]" : "mt-0.5 text-info"}>{icon}</div>
      <div className="min-w-0 text-sm">
        <div className="font-medium">{title}</div>
        <div className="mt-1 leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default async function AgencyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!hasData()) {
    return (
      <>
        <PageHeader eyebrow="Agency QC" title="Said vs done" />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">
          Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link> and load the agency STR sheet and the Google Ads change history.
        </EmptyState>
      </>
    );
  }
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab: AgencyTab = (AGENCY_TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as AgencyTab) : "excludes";

  const m = getModel();
  const a = m.agency;
  const e = a.excludes;
  const ad = a.adds;
  const checked = !!a.changes_from;
  const unchecked = (e.unchecked ?? 0) + (ad.unchecked ?? 0);
  const done = (e.applied ?? 0) + (e.applied_elsewhere ?? 0);
  const labels = Object.fromEntries(m.campaigns.map((c) => [c.id, c.label]));
  const projects = m.projects.map((p) => ({ id: p.id, name: p.name.replace(" County", "") }));
  const sheet = m.data.agency_sheet;
  const ch = m.data.changes;

  return (
    <>
      <PageHeader
        eyebrow="Agency QC"
        title="Said vs done"
        description={<>Every Add and Exclude the agency wrote in its STR sheet{sheet ? ` (${drange(sheet.from, sheet.to)})` : ""}, checked against what actually changed in Google Ads{ch ? ` (change history ${drange(ch.from, ch.to)})` : ""}. The agency gets {a.grace_days} {plural(a.grace_days, "day")} before a call counts as late.</>}
      />

      {!checked ? (
        <Notice tone="warn" icon={<CircleAlert className="size-5" />} title="The Google Ads change history is not imported, so the calls cannot be checked yet">
          The sheet says what the agency decided; the change history shows what they actually did. Download the change history from Google Ads as a CSV and load it on <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link>.
        </Notice>
      ) : unchecked > 0 ? (
        <Notice tone="info" icon={<Info className="size-5" />} title={`${n0(unchecked)} ${plural(unchecked, "call is", "calls are")} not checked`}>
          The change history starts on {dlong(a.changes_from)}, so sheet rows before that day cannot be matched to a change. Import an older change history to check them too.
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Exclude calls applied" value={checked ? pct(e.applied_pct, 1) : "–"}
          tone={!checked || e.applied_pct === null ? undefined : e.applied_pct >= 95 ? "good" : "warn"}
          sub={checked ? `${n0(done)} of ${n0(e.judged)} checked calls · ${n0(e.waiting)} still inside the ${a.grace_days}-day grace` : "import a change history to check"} />
        <StatCard label="Exclude calls never applied" value={checked ? n0(e.overdue) : "–"} tone={checked && e.overdue > 0 ? "bad" : undefined}
          sub={checked ? `${inr(e.overdue_cost)} spent on these searches` : "import a change history to check"} />
        <StatCard label="Usual delay" value={checked && e.median_lag !== null ? `${n0(e.median_lag)} ${plural(e.median_lag, "day")}` : "–"}
          sub={checked ? "median, from the sheet day to the negative going in" : "import a change history to check"} />
        <StatCard label="Add calls never added" value={checked ? n0(ad.overdue) : "–"} tone={checked && ad.overdue > 0 ? "warn" : undefined}
          sub={checked ? `of ${n0(ad.total)} Add calls · ${n0(ad.added + ad.added_elsewhere)} added, ${n0(ad.already)} already keywords` : "import a change history to check"} />
      </div>

      <Section title="Day by day" description="Each bar is one day's tab in the agency sheet: how many of its Exclude calls were applied, are still waiting, or never went in.">
        <Card className="p-5">
          <OutcomeLegend />
          {a.by_day.length ? <ByDayChart data={a.by_day} /> : <p className="py-10 text-center text-sm text-muted-foreground">No Exclude calls in the sheet yet.</p>}
          <Explain>A red block on one day usually means a whole day&apos;s batch was skipped. “Applied in another place” means a matching negative went in, but in a different ad group of the same campaign than the row asked for.</Explain>
        </Card>
      </Section>

      <div className="mt-10 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="How many days late" description="For every Exclude call that was applied: days from the sheet day to the negative in Google Ads." />
          <CardBody className="pt-3">
            {a.lag.length ? <LagChart data={a.lag} grace={a.grace_days} /> : <p className="py-10 text-center text-sm text-muted-foreground">No applied calls to measure yet.</p>}
            <Explain>Green bars are inside the {a.grace_days}-day grace; amber bars came later. While a negative is late, the junk search keeps costing money.</Explain>
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="By project" description="Exclude calls applied, and what was never done." />
          <div className="overflow-x-auto px-2 pb-3 pt-3">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Project</th>
                <th className="px-3 py-2 text-right font-medium">Applied</th>
                <th className="px-3 py-2 text-right font-medium">Never applied</th>
                <th className="px-3 py-2 text-right font-medium">Spent on those</th>
                <th className="px-3 py-2 text-right font-medium">Adds not added</th>
              </tr></thead>
              <tbody>
                {m.projects.map((p) => {
                  const r = a.by_project[p.id];
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-3 py-2.5"><ProjectTag name={p.name.replace(" County", "")} color={pcolor(p.id)} className="text-[13px] text-foreground" /></td>
                      <td className="px-3 py-2.5 text-right tabular">{checked ? pct(r?.applied_pct) : "–"}</td>
                      <td className="px-3 py-2.5 text-right tabular">{checked ? n0(r?.overdue) : "–"}</td>
                      <td className="px-3 py-2.5 text-right tabular">{checked ? inr(r?.overdue_cost) : "–"}</td>
                      <td className="px-3 py-2.5 text-right tabular">{checked ? n0(r?.adds_overdue) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Explain>“Applied” is the share of checked Exclude calls that went in, anywhere.</Explain>
          </div>
        </Card>
      </div>

      <Section title="The lists" description="The rows behind every number above. Each list downloads as a CSV you can send to the agency.">
        <AgencyTabs initialTab={initialTab} agency={a} labels={labels} projects={projects}
          risks={{ risky: m.risks.risky, blocked: m.risks.blocked, conflicts: m.risks.conflicts, leaks: m.risks.leaks }} />
      </Section>

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        A call counts as applied when a negative that blocks the search appears in the change history from the day before the sheet day onwards. Latest change in the history: {dlong(a.last_change_day) || "–"}.
      </p>
    </>
  );
}
