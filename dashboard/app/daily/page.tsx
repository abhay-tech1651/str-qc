import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Database, Presentation } from "lucide-react";
import { hasData } from "@/lib/store";
import { getBrief } from "@/lib/brief";
import { change, cn, dshort, inr, lakh, n0, n1, pct } from "@/lib/format";
import { Badge, Button, Card, CardHeader, EmptyState, Explain, PageHeader, Section } from "@/components/ui";
import { ProjectCard, StatCard } from "@/components/blocks";
import { periodModel } from "@/lib/period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Day by day" };

const time = (ts: string) => (ts.length >= 16 ? `${dshort(ts.slice(0, 10))}, ${ts.slice(11, 16)}` : ts);

export default async function TodayPage() {
  if (!hasData()) {
    return (
      <>
        <PageHeader eyebrow="Welcome" title="Let's load your Google Ads data" description="The dashboard fills itself from Google Ads exports and the agency's STR sheet. It takes about a minute." />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">
          Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Data</Link> and press “Import new reports from Downloads”.
        </EmptyState>
      </>
    );
  }
  const m = await periodModel();
  const b = getBrief();
  const o = b.on_time;
  const a = m.account;
  const behind = b.freshness.filter((f) => !f.ok);
  const recentDays = b.days.slice(0, 7);

  return (
    <>
      <PageHeader
        eyebrow={`Day by day · ${dshort(b.today)}`}
        title="Each sheet day, and what changed"
        description={<>The agency&apos;s sheet runs to <b className="font-semibold text-foreground">{dshort(b.sheet_to)}</b> and Google Ads changes to <b className="font-semibold text-foreground">{dshort(b.last_change)}</b>. The agency has {b.grace} days to put each Exclude call into Google Ads; after that it counts as late.</>}
        actions={<Button asChild><Link href="/meeting"><Presentation /> Meeting proof</Link></Button>}
      />

      {/* how fresh each source is */}
      <Card className={cn("mb-6 p-4", behind.length ? "border-[color:var(--warn)]/40" : "")}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <span className="flex items-center gap-1.5 font-medium">
            {behind.length ? <CircleAlert className="size-4 text-[color:var(--warn)]" /> : <CheckCircle2 className="size-4 text-good" />}
            {behind.length ? `${behind.length} ${behind.length === 1 ? "source needs" : "sources need"} a new download` : "All data is up to date"}
          </span>
          {b.freshness.map((f) => (
            <span key={f.source} className="flex items-center gap-1.5 text-muted-foreground" title={`${f.how} (${f.cadence})`}>
              <span className={cn("size-2 rounded-full", f.ok ? "bg-good" : "bg-[color:var(--warn)]")} />
              {f.source}: <span className={cn("tabular", f.ok ? "text-foreground" : "font-medium text-[color:var(--warn)]")}>{f.last ? `to ${dshort(f.last)}` : "not loaded"}</span>
            </span>
          ))}
          {behind.length ? <Link href="/data" className="ml-auto text-primary underline-offset-2 hover:underline">How to download →</Link> : null}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Exclude calls put in on time" value={pct(o.on_time_pct)} tone={(o.on_time_pct ?? 0) >= 80 ? "good" : "bad"}
          sub={<>{n0(o.on)} on time · {n0(o.late)} late · {n0(o.never)} never, of {n0(o.judged)} calls past their {b.grace} days</>} />
        <StatCard label="Never put in" value={n0(o.never)} tone={o.never ? "bad" : "good"}
          sub={<>{inr(o.never_cost)} was spent on those searches · {n0(o.waiting)} more still inside their {b.grace} days</>} />
        <StatCard label="Our keywords switched off by negatives" value={b.inventory ? n0(b.inventory.blocks_keywords) : "–"} tone={b.inventory?.blocks_keywords ? "bad" : undefined}
          sub={b.inventory ? <>campaign-wide negatives in the account on {dshort(b.inventory.as_of)} that block enabled keywords</> : "load the negative keyword report"} />
        <StatCard label={`Spend, ${dshortRange(m.windows.last7?.from, m.windows.last7?.to)}`} value={lakh(a.last7.cost)} delta={change(a.last7.cost, a.prev7.cost)} invert
          sub={<>{n1(a.last7.conv)} Google conversions at {inr(a.last7.cpa)} each (Google&apos;s count, not CRM leads)</>} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <Card className="overflow-x-auto xl:col-span-3">
          <CardHeader title="Each sheet day: did the Exclude calls go in?" description={`The last 7 sheet days. "Late" means it went in after ${b.grace} days.`}
            action={<Button asChild variant="ghost" size="sm"><Link href="/agency">Every call <ArrowRight /></Link></Button>} />
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-y bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Sheet day</th>
              <th className="px-3 py-2 text-right font-medium">Calls</th>
              <th className="px-3 py-2 text-right font-medium">On time</th>
              <th className="px-3 py-2 text-right font-medium">Late</th>
              <th className="px-3 py-2 text-right font-medium">Not done</th>
              <th className="px-3 py-2 text-right font-medium">Still waiting</th>
              <th className="px-4 py-2 text-left font-medium">Went in on</th>
            </tr></thead>
            <tbody>
              {recentDays.map((d) => (
                <tr key={d.day} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{dshort(d.day)}</td>
                  <td className="px-3 py-2 text-right tabular">{n0(d.calls)}</td>
                  <td className="px-3 py-2 text-right tabular text-good">{d.on_time || "–"}</td>
                  <td className={cn("px-3 py-2 text-right tabular", d.late && "font-medium text-[color:var(--warn)]")}>{d.late || "–"}</td>
                  <td className={cn("px-3 py-2 text-right tabular", d.not_done && "font-medium text-bad")}>{d.not_done || "–"}</td>
                  <td className="px-3 py-2 text-right tabular text-muted-foreground">{d.waiting || "–"}</td>
                  <td className="px-4 py-2 text-[13px] text-muted-foreground">{d.answered_on.map(dshort).join(", ") || "nothing yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Explain>Read across: a sheet day&apos;s calls should go in on that day or the next. A date far to the right means the agency batched them later.</Explain>
          <div className="h-4" />
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Changed in Google Ads since yesterday" description={`Change history from ${dshort(b.yesterday)}, grouped. The newest change is ${dshort(b.last_change)}.`} />
          <div className="px-5 pb-5 pt-3">
            {b.since_yesterday.length ? (
              <ul className="divide-y">
                {b.since_yesterday.map((g) => (
                  <li key={g.what} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{g.what}</div>
                      <div className="text-xs text-muted-foreground">by {g.by} · {g.campaigns} {g.campaigns === 1 ? "campaign" : "campaigns"} · {time(g.first)} – {time(g.last)}</div>
                    </div>
                    <span className="tabular text-base font-semibold">{n0(g.count)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No changes in the change history since {dshort(b.yesterday)}. Download a fresh change history if you expected some.</p>}
          </div>
        </Card>
      </div>

      <Section title="What to raise with the agency" description="Strongest first. Each point has the numbers and where to check it in Google Ads; the Meeting proof page has the full lists."
        action={<Button asChild variant="outline" size="sm"><Link href="/meeting">Open meeting proof <ArrowRight /></Link></Button>}>
        <div className="grid gap-3 lg:grid-cols-2">
          {b.claims.slice(0, 6).map((c, i) => (
            <Link key={c.id} href={`/meeting#${c.id}`} className="block">
              <Card className="h-full p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-start gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={c.tone}>{c.number}</Badge>
                    </div>
                    <div className="mt-1.5 text-sm font-medium leading-snug">{c.title}</div>
                    <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{c.detail}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="By project" description="On time is the share of Exclude calls put in within the grace days, of those that are due.">
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Project</th>
              <th className="px-4 py-2.5 text-right font-medium">Exclude calls</th>
              <th className="px-4 py-2.5 text-right font-medium">On time</th>
              <th className="px-4 py-2.5 text-right font-medium">Late</th>
              <th className="px-4 py-2.5 text-right font-medium">Never put in</th>
              <th className="px-4 py-2.5 text-right font-medium">Spent on those</th>
              <th className="px-4 py-2.5 text-right font-medium">Still waiting</th>
            </tr></thead>
            <tbody>
              {b.by_project.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5"><Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link></td>
                  <td className="px-4 py-2.5 text-right tabular">{n0(p.calls)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{pct(p.on_time_pct)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{n0(p.late)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{n0(p.not_done)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{inr(p.not_done_cost)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{n0(p.waiting)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {m.projects.map((p) => <ProjectCard key={p.id} model={m} id={p.id} />)}
        </div>
      </Section>
    </>
  );
}

function dshortRange(a?: string | null, b?: string | null) {
  return a && b ? `${dshort(a)} – ${dshort(b)}` : "last 7 days";
}
