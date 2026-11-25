import Link from "next/link";
import { CircleAlert, Database } from "lucide-react";
import { hasData } from "@/lib/store";
import { ledgerDays } from "@/lib/ledger";
import { getAudit, changeDays } from "@/lib/audit";
import { cn, dlong, dshort, inr, n0 } from "@/lib/format";
import { Card, EmptyState, Explain, PageHeader, Section } from "@/components/ui";
import { FollowTable } from "@/components/audit-views";
import { UpToPicker } from "@/components/upto-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Day by day" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const ORG_TONE: Record<string, string> = { ROI: "bg-info-soft text-info", County: "bg-good-soft text-good", Google: "bg-warn-soft text-warn", AGO: "bg-muted text-muted-foreground", Other: "bg-muted text-muted-foreground" };

export default async function DailyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const A = hasData() ? getAudit(one(sp.to)) : null;
  if (!A) {
    return (
      <>
        <PageHeader eyebrow="Day by day" title="Each sheet day, and what changed in Google Ads" />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">Load the search terms report, the change history and the agency sheet on <Link href="/data" className="text-primary hover:underline">Data</Link>.</EmptyState>
      </>
    );
  }
  const { led, tabs, labels } = A;
  const tab = tabs.find((t) => t.day === one(sp.tab)) ?? tabs[0];
  const rows = tab ? A.agency.filter((f) => f.call_day === tab.day) : [];
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ to: led.to, ...extra })}`;

  // Google Ads, every day from three weeks back to today: days with no change are shown too
  const cds = changeDays(one(sp.to));
  const byDay = new Map(cds.map((d) => [d.day, d]));
  const span: string[] = [];
  for (let d = A.asOf; d >= addDay(A.asOf, -20); d = addDay(d, -1)) span.push(d);
  const last = A.lastChange;

  return (
    <>
      <PageHeader
        eyebrow={`Day by day · sheet tabs to ${dshort(led.to)} · change history to ${dshort(A.asOf)}`}
        title="Each sheet day, and what changed in Google Ads"
        description={<>The left table is the agency&apos;s sheet: for each tab, what happened to its Adds and Excludes. The right list is Google Ads: who changed what, each day. {last ? <>The newest change is {dlong(last.ts.slice(0, 10))}, {last.ts.slice(11, 16)}, by {last.who}.</> : null} Click a tab to see its calls.</>}
        actions={<UpToPicker days={ledgerDays().days} value={led.to} />}
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="overflow-x-auto xl:col-span-3">
          <div className="border-b px-4 py-3"><h2 className="text-base font-semibold">The sheet, tab by tab</h2><p className="text-[12.5px] text-muted-foreground">Deadline: the tab&apos;s day plus {led.grace} days. Red: past the deadline and still not working.</p></div>
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Tab</th><th className="px-2 py-2 text-right font-medium">Excl.</th><th className="px-2 py-2 text-right font-medium">On time</th><th className="px-2 py-2 text-right font-medium">Late</th><th className="px-2 py-2 text-right font-medium">Not working</th>
                <th className="px-2 py-2 font-medium">Went in on</th><th className="px-2 py-2 text-right font-medium">Adds</th><th className="px-2 py-2 text-right font-medium">Added</th><th className="px-4 py-2 text-right font-medium">Not added</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tabs.map((t) => {
                const bad = t.ex.open_overdue + t.ex.wrong_place;
                const addBad = t.add.open_overdue + t.add.elsewhere + t.add.blocked;
                const sel = tab?.day === t.day;
                return (
                  <tr key={t.day} className={cn("hover:bg-muted/40", sel && "bg-accent")}>
                    <td className="whitespace-nowrap px-4 py-2"><Link href={`${q({ tab: t.day })}#calls`} scroll={false} className="font-medium hover:underline">{weekday(t.day)} {dshort(t.day)}</Link><span className="block text-[11.5px] text-muted-foreground">due {dshort(t.due)}</span></td>
                    <td className="tabular px-2 py-2 text-right">{n0(t.ex.n)}</td>
                    <td className="tabular px-2 py-2 text-right text-good">{t.ex.on_time ? n0(t.ex.on_time) : "–"}</td>
                    <td className="tabular px-2 py-2 text-right text-warn">{t.ex.late ? n0(t.ex.late) : "–"}</td>
                    <td className={cn("tabular px-2 py-2 text-right", bad ? "font-semibold text-bad" : "text-muted-foreground")}>{bad ? n0(bad) : "–"}{t.ex.open_in_time ? <span className="block text-[11.5px] font-normal text-muted-foreground">{n0(t.ex.open_in_time)} not due</span> : null}</td>
                    <td className="px-2 py-2 text-[12px]">{t.went_in.length ? t.went_in.map(dshort).join(", ") : <span className="text-muted-foreground">nothing yet</span>}</td>
                    <td className="tabular px-2 py-2 text-right">{n0(t.add.n)}</td>
                    <td className="tabular px-2 py-2 text-right">{n0(t.add.on_time + t.add.late)}</td>
                    <td className={cn("tabular px-4 py-2 text-right", addBad ? "font-medium text-bad" : "text-muted-foreground")}>{addBad ? n0(addBad) : "–"}{t.add.open_in_time ? <span className="block text-[11.5px] font-normal text-muted-foreground">{n0(t.add.open_in_time)} not due</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card className="xl:col-span-2">
          <div className="border-b px-4 py-3"><h2 className="text-base font-semibold">Google Ads, day by day</h2><p className="text-[12.5px] text-muted-foreground">From the change history: who changed what. The last three weeks, newest first.</p></div>
          <ul className="divide-y">
            {span.map((d) => {
              const x = byDay.get(d);
              const wk = weekday(d);
              const weekend = wk === "Sat" || wk === "Sun";
              if (!x) return <li key={d} className="flex items-center justify-between px-4 py-2 text-[13px]"><span className="font-medium">{wk} {dshort(d)}</span><span className={cn("text-[12.5px]", weekend ? "text-muted-foreground" : "text-bad")}>No change{weekend ? " (weekend)" : ""}</span></li>;
              const rest = x.other.length;
              return (
                <li key={d} className="px-4 py-2.5 text-[13px]">
                  <details>
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{wk} {dshort(d)}</span>
                        <span className="flex flex-wrap gap-1">{x.people.map((p) => <span key={p.who} className={cn("rounded px-1.5 py-0.5 text-[11.5px] font-medium", ORG_TONE[p.org])}>{p.who} · {n0(p.n)}</span>)}</span>
                      </div>
                      <div className="mt-1 text-[12.5px] text-muted-foreground">
                        {[
                          x.neg.n ? `${n0(x.neg.n)} negatives (${[x.neg.campaign ? `${n0(x.neg.campaign)} campaign` : "", x.neg.ad_group ? `${n0(x.neg.ad_group)} ad group` : "", x.neg.list ? `${n0(x.neg.list)} shared list` : ""].filter(Boolean).join(", ")})` : "",
                          x.neg.one_word ? `${n0(x.neg.one_word)} one word` : "",
                          x.kw.added ? `${n0(x.kw.added)} keywords added` : "", x.kw.paused ? `${n0(x.kw.paused)} paused` : "", x.kw.removed ? `${n0(x.kw.removed)} removed` : "",
                          rest ? `${n0(rest)} other changes` : "",
                        ].filter(Boolean).join(" · ") || "labels only"}
                      </div>
                    </summary>
                    <div className="mt-2 space-y-2 text-[12.5px]">
                      {x.one_words.length ? <div><span className="font-medium text-bad">One-word negatives: </span>{x.one_words.map((o, i) => <span key={i} className="mr-2 inline-block"><span className="font-mono">-{o.text}</span> <span className="text-muted-foreground">({o.list ? `list ${o.list}` : `${labels[o.campaign] ?? o.campaign}${o.ad_group ? ` › ${o.ad_group}` : ""}`})</span></span>)}</div> : null}
                      {x.other.length ? <ul className="space-y-0.5">{x.other.slice(0, 30).map((o, i) => <li key={i}><span className="text-muted-foreground">{o.ts.slice(11, 16)} {o.who}:</span> {o.kind}{o.item ? ` · ${o.item}` : ""}{o.campaign ? <span className="text-muted-foreground"> ({labels[o.campaign] ?? o.campaign})</span> : null}</li>)}{x.other.length > 30 ? <li className="text-muted-foreground">and {x.other.length - 30} more</li> : null}</ul> : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {tab ? (
        <Section className="scroll-mt-20" title={<span id="calls">The {dlong(tab.day)} tab: {n0(rows.length)} calls</span>}
          description={<>Due {dlong(tab.due)}. {n0(tab.ex.on_time)} Excludes on time, {n0(tab.ex.late)} late, {n0(tab.ex.open_overdue + tab.ex.wrong_place)} not working{tab.ex.open_in_time ? `, ${n0(tab.ex.open_in_time)} not due yet` : ""}. {tab.cost_late_done > 0 ? `${inr(tab.cost_late_done)} spent after the deadline before the late ones went in.` : ""} Click a row for the search&apos;s full story.</>}>
          {tab.ex.open_overdue + tab.ex.wrong_place > 0 ? (
            <Card className="mb-3 flex items-start gap-2 border-bad/40 bg-bad-soft p-3 text-[13px]"><CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" /> {n0(tab.ex.open_overdue + tab.ex.wrong_place)} Excludes from this tab are past the deadline and still not working.</Card>
          ) : null}
          <FollowTable rows={rows} labels={labels} cols={["term", "campaign", "status", "written", "went", "how", "late", "cost_late"]} csvName={`sheet-${tab.day}`} sort={{ key: "days_late", dir: "desc" }} />
          <Explain>Status follows the change history and the account as it is on {dlong(A.asOf)}. &quot;Went in&quot; is the change history&apos;s time and person. &quot;How it went in&quot;: the negative that blocks it, where it sits, and whether it is the full search or one word.</Explain>
        </Section>
      ) : null}
    </>
  );
}
