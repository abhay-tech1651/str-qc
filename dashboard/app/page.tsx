import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Database, FileText } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { ledgerDays } from "@/lib/ledger";
import { getAudit } from "@/lib/audit";
import { OPEN, parts } from "@/lib/outcomes";
import { cn, dlong, dshort, inr, n0, pcolor } from "@/lib/format";
import { Button, Card, EmptyState, Explain, PageHeader, ProjectTag, Section } from "@/components/ui";
import { MoneyBar, MoneyList } from "@/components/money";
import { ScoreBar } from "@/components/audit-views";
import { UpToPicker } from "@/components/upto-picker";
import { addSegs, exSegs } from "@/lib/follow-labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const sp = await searchParams;
  const toParam = Array.isArray(sp.to) ? sp.to[0] : sp.to;
  const A = getAudit(toParam);
  const days = ledgerDays();
  if (!A) {
    return (
      <>
        <PageHeader eyebrow="Overview" title="Did the agency do what the sheet said?" />
        <EmptyState icon={<Database className="size-8" />} title="The agency sheet and search terms are needed">
          Load the search terms report and refresh the agency sheet on <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Data</Link>.
        </EmptyState>
      </>
    );
  }
  const { led, card: C, fixes } = A;
  const m = getModel();
  const lab = (c: string) => A.labels[c] ?? c;
  const T = led.total;
  const P = parts(T.by);
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ to: led.to, ...extra })}`;
  const fx = (t: string) => fixes.filter((f) => f.type === t);
  const exBad = C.ex.open_overdue + C.ex.wrong_place;
  const addDone = C.add.on_time + C.add.late;
  const addBad = C.add.open_overdue + C.add.elsewhere + C.add.blocked;
  const hurt = fx("neg_blocks_good").length + fx("keyword_blocked").length;
  const kwOff = fx("keyword_blocked").reduce((s, f) => s + (f.term.match(/,/g)?.length ?? 0) + 1, 0);
  const lastDay = A.lastChange?.ts.slice(0, 10) ?? "";
  const idle = lastDay ? Math.round((Date.parse(`${A.asOf}T00:00:00Z`) - Date.parse(`${lastDay}T00:00:00Z`)) / 86400000) : 0;
  const exTotal = C.ex.went_in_term + C.ex.went_in_part + C.ex.went_in_one_word;
  const written = { term: C.ex.written_term, one: C.ex.written_one_word, none: C.ex.written_none };
  const writtenPart = C.ex.n - written.term - written.one - written.none;
  const raise = [
    { n: C.ex.late, title: "Excludes that went in late", sub: `${inr(C.ex.cost_late_done)} spent on them after the deadline; half were ${C.ex.median_days_late}+ days late`, href: `/report${q({})}#late` },
    { n: C.ex.open_overdue, title: "Excludes not done, past the deadline", sub: C.ex.cost_leaking > 0 ? `${inr(C.ex.cost_leaking)} spent after the deadline` : "no negative blocks them", href: `/report${q({})}#open` },
    { n: C.ex.wrong_place, title: "Excludes put in the wrong ad group", sub: "a negative went in, but not where the search runs", href: `/report${q({})}#open` },
    { n: addBad, title: "Adds not done, past the deadline", sub: `${n0(C.add.open_overdue)} not a keyword anywhere, ${n0(C.add.elsewhere)} only in another campaign, ${n0(C.add.blocked)} blocked`, href: `/report${q({})}#adds` },
    { n: fx("neg_blocks_good").length, title: "Negatives blocking searches we want", sub: "mostly one word at campaign level; swap each for the full junk searches", href: `/report${q({})}#negatives` },
    { n: fx("keyword_blocked").length, title: "Negatives switching off our own keywords", sub: `${n0(kwOff)} enabled keywords cannot show`, href: `/report${q({})}#negatives` },
    { n: fx("county_comment").length, title: "County comments not answered", sub: "the sheet and the account do not follow the comment yet", href: `/fix${q({ type: "county_comment" })}` },
  ].filter((r) => r.n > 0);

  return (
    <>
      <PageHeader
        eyebrow={`Search ads check · sheet ${dshort(led.from)} – ${dshort(led.to)} · Google Ads as of ${dshort(A.asOf)}`}
        title="Did the agency do what the sheet said?"
        description={<>
          From {dlong(led.from)} to {dlong(led.to)} the agency&apos;s STR sheet asked for <b className="text-foreground">{n0(C.ex.n)} Excludes</b> and <b className="text-foreground">{n0(C.add.n)} Adds</b>.{" "}
          Of the {n0(C.ex.due)} Excludes past their {led.grace}-day deadline, <b className="text-foreground">{n0(C.ex.on_time)} went in on time</b>, <b className="text-foreground">{n0(C.ex.late)} late</b> and <b className="text-foreground">{n0(exBad)} still do not work</b>.{" "}
          <b className="text-foreground">{inr(C.ex.cost_late_done + C.ex.cost_leaking)}</b> was spent on searches after their deadline.{" "}
          Of the {n0(C.add.due)} Adds past their deadline, {n0(addDone)} became keywords and <b className="text-foreground">{n0(addBad)} did not</b>.
        </>}
        actions={<>
          <UpToPicker days={days.days} value={led.to} />
          <Button asChild variant="outline"><Link href={`/report${q({})}`}><FileText /> Agency report</Link></Button>
          <Button asChild><Link href={`/fix${q({})}`}>Fix list <ArrowRight /></Link></Button>
        </>}
      />

      {lastDay && idle >= 2 ? (
        <Card className="mb-4 flex items-start gap-3 border-bad/40 bg-bad-soft p-4 text-[14px]">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-bad" />
          <div><b>Nothing has changed in Google Ads for {idle} days.</b> The newest change in the change history is {dlong(lastDay)}, {A.lastChange!.ts.slice(11, 16)} ({A.lastChange!.who}). <span className="text-muted-foreground">If the change history was downloaded a while ago, download it again on Data.</span></div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Excludes on time", value: `${pct(C.ex.on_time, C.ex.due)}%`, sub: `${n0(C.ex.on_time)} of ${n0(C.ex.due)} past their deadline`, tone: pct(C.ex.on_time, C.ex.due) >= 90 ? "text-good" : "text-warn" },
          { label: "Spent after the deadline", value: inr(C.ex.cost_late_done + C.ex.cost_leaking), sub: `on searches the sheet had called junk, before the late negative went in`, tone: "text-bad" },
          { label: "Adds not done", value: n0(addBad), sub: `of ${n0(C.add.due)} past their deadline`, tone: addBad ? "text-bad" : "text-good" },
          { label: "Negatives hurting us", value: n0(hurt), sub: `block searches we want or switch off our keywords`, tone: hurt ? "text-bad" : "text-good" },
        ].map((k) => (
          <Card key={k.label} className="p-5">
            <div className="text-[13px] text-muted-foreground">{k.label}</div>
            <div className={cn("tabular mt-1 text-[30px] font-semibold leading-none tracking-tight", k.tone)}>{k.value}</div>
            <div className="mt-2 text-[12.5px] text-muted-foreground">{k.sub}</div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="space-y-6 p-5 sm:p-6 lg:col-span-3">
          <div>
            <h2 className="text-base font-semibold">The agency&apos;s scorecard</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Every Add and Exclude in the sheet, {dshort(led.from)} to {dshort(led.to)}, checked against the change history and the account as it is on {dshort(A.asOf)}. Deadline: the sheet day plus {led.grace} days. Google&apos;s own CTM campaign is left out ({n0(A.google.length)} calls).</p>
          </div>
          <ScoreBar title={<><span>Excludes: {n0(C.ex.n)}</span><span className="text-[12.5px] font-normal text-muted-foreground">{pct(C.ex.on_time, C.ex.due)}% on time</span></>} segs={exSegs(C)} />
          <ScoreBar title={<><span>Adds: {n0(C.add.n)}</span><span className="text-[12.5px] font-normal text-muted-foreground">{pct(addDone, C.add.due)}% added</span></>} segs={addSegs(C)} />
          <ScoreBar title={<><span>How the negatives went in</span><span className="text-[12.5px] font-normal text-muted-foreground">County&apos;s rule: the full search, never one word</span></>}
            segs={[
              { key: "term", label: "full search", n: C.ex.went_in_term, tone: "good" },
              { key: "part", label: "part of it (2+ words)", n: C.ex.went_in_part, tone: "info" },
              { key: "one", label: "one word", n: C.ex.went_in_one_word, tone: "bad" },
            ]}
            note={<>Of the {n0(exTotal)} Excludes blocked today: the most specific negative that went in on the first day it was blocked. Single words often go in next to the full search: {n0(A.oneWord30.n)} one-word negatives went in since {dshort(A.oneWord30.since)}, and each blocks every search with that word. <Link href="/negatives" className="text-primary hover:underline">See them</Link>.</>} />
          <ScoreBar title="What the sheet wrote in its negative column"
            segs={[
              { key: "term", label: "full search", n: written.term, tone: "good" },
              { key: "part", label: "part of it", n: writtenPart, tone: "info" },
              { key: "one", label: "one word", n: written.one, tone: "bad" },
              { key: "none", label: "nothing", n: written.none, tone: "warn" },
            ]} />
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-semibold"><CircleAlert className="size-5 text-bad" /> What to raise</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Each line opens the rows behind it, with the change history time, the person and the place in Google Ads.</p>
          <ul className="mt-3 divide-y">
            {raise.map((r) => (
              <li key={r.title}>
                <Link href={r.href} className="flex items-center gap-3 py-2.5 hover:bg-muted/50 sm:px-2">
                  <span className="tabular w-12 shrink-0 text-right text-lg font-semibold">{n0(r.n)}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium">{r.title}</span><span className="block text-[12.5px] text-muted-foreground">{r.sub}</span></span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-good-soft p-3 text-[13px] leading-relaxed">
            <div className="flex items-center gap-1.5 font-medium text-good"><CheckCircle2 className="size-4" /> Done well</div>
            <p className="mt-1 text-foreground">{n0(C.ex.on_time)} Excludes went in on time, and {n0(C.ex.went_in_term)} are blocked by their own full search. {T.by.not_reviewed.n === 0 ? "The sheet reviewed every search that cost money." : `The sheet reviewed every search but ${n0(T.by.not_reviewed.n)}.`} {n0(addDone)} Adds became keywords.</p>
          </div>
        </Card>
      </div>

      <Section title="Week by week" description="Each week of sheet tabs, and how its calls went. This is the trend to watch: on-time Excludes should rise and late ones fall."
        action={<Button asChild variant="outline" size="sm"><Link href={`/daily${q({})}`}>Day by day <ArrowRight /></Link></Button>}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 font-medium">Sheet week</th><th className="px-3 py-2 text-right font-medium">Excludes</th><th className="px-3 py-2 text-right font-medium">On time</th><th className="px-3 py-2 text-right font-medium">Late</th><th className="px-3 py-2 text-right font-medium">Not done</th><th className="px-3 py-2 text-right font-medium">Median days late</th><th className="px-3 py-2 text-right font-medium">₹ after deadline</th><th className="px-3 py-2 text-right font-medium">Adds</th><th className="px-4 py-2 text-right font-medium">Added</th></tr>
            </thead>
            <tbody className="divide-y">
              {A.byWeek.slice().reverse().map((w) => {
                const c = w.card;
                const due = c.ex.due;
                return (
                  <tr key={w.from}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium">{dshort(w.from)} – {dshort(w.to)}</td>
                    <td className="tabular px-3 py-2.5 text-right">{n0(c.ex.n)}</td>
                    <td className={cn("tabular px-3 py-2.5 text-right font-medium", pct(c.ex.on_time, due) >= 90 ? "text-good" : pct(c.ex.on_time, due) >= 50 ? "text-warn" : "text-bad")}>{due ? `${pct(c.ex.on_time, due)}%` : "–"}</td>
                    <td className="tabular px-3 py-2.5 text-right">{n0(c.ex.late)}</td>
                    <td className={cn("tabular px-3 py-2.5 text-right", c.ex.open_overdue + c.ex.wrong_place ? "font-medium text-bad" : "text-muted-foreground")}>{n0(c.ex.open_overdue + c.ex.wrong_place)}{c.ex.open_in_time ? <span className="font-normal text-muted-foreground"> (+{n0(c.ex.open_in_time)} not due)</span> : null}</td>
                    <td className="tabular px-3 py-2.5 text-right">{c.ex.late ? n0(c.ex.median_days_late) : "–"}</td>
                    <td className={cn("tabular px-3 py-2.5 text-right", c.ex.cost_late_done + c.ex.cost_leaking ? "text-bad" : "text-muted-foreground")}>{inr(c.ex.cost_late_done + c.ex.cost_leaking)}</td>
                    <td className="tabular px-3 py-2.5 text-right">{n0(c.add.n)}</td>
                    <td className="tabular px-4 py-2.5 text-right">{c.add.due ? `${pct(c.add.on_time + c.add.late, c.add.due)}%` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section title={`Every rupee, ${inr(T.cost)}`} description={`Google's search terms report, ${dshort(led.from)} to ${dshort(led.to)}: each search counts once, in the part that fits it today. ${n0(T.clicks)} clicks, ${n0(T.conv)} conversions (Google's count, not CRM leads). Click a part to see its searches.`}>
        <Card className="p-5 sm:p-6">
          <MoneyBar parts={P} total={T.cost} tall />
          <div className="mt-3"><MoneyList parts={P} total={T.cost} base={`/searches${q({})}`} /></div>
          <Explain>Of the {inr(T.by.junk_blocked.cost + T.by.junk_open.cost)} spent on searches the sheet called junk, {inr(led.junk_cost_after_call)} came after the sheet&apos;s call and {inr(led.junk_cost_after_deadline)} after the deadline. The rest was spent before anyone could see the search: a junk search usually runs once, so speed saves little; blocking whole themes ahead (other builders, rent, jobs) in shared lists saves more.</Explain>
        </Card>
      </Section>

      <Section title="By project" description="The same scorecard for each project, and where its money went.">
        <div className="grid gap-4 md:grid-cols-2">
          {A.byProject.map((p) => {
            const g = led.by_project.find((x) => x.key === p.id);
            if (!g) return null;
            const c = p.card;
            return (
              <Card key={p.id} className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/projects/${p.id}`} className="font-semibold hover:underline"><ProjectTag name={p.name} color={pcolor(p.id)} className="text-[15px] text-foreground" /></Link>
                  <span className="tabular text-[15px] font-semibold">{inr(g.cost)}</span>
                </div>
                <MoneyBar parts={parts(g.by)} total={g.cost} className="mt-3" />
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
                  <div><dt className="text-muted-foreground">Excludes on time</dt><dd className="tabular font-medium">{c.ex.due ? `${pct(c.ex.on_time, c.ex.due)}%` : "–"} <span className="font-normal text-muted-foreground">of {n0(c.ex.due)}</span></dd></div>
                  <div><dt className="text-muted-foreground">Not done</dt><dd className={cn("tabular font-medium", c.ex.open_overdue + c.ex.wrong_place ? "text-bad" : "")}>{n0(c.ex.open_overdue + c.ex.wrong_place)}</dd></div>
                  <div><dt className="text-muted-foreground">Adds not done</dt><dd className={cn("tabular font-medium", c.add.open_overdue + c.add.elsewhere + c.add.blocked ? "text-bad" : "")}>{n0(c.add.open_overdue + c.add.elsewhere + c.add.blocked)} <span className="font-normal text-muted-foreground">of {n0(c.add.due)}</span></dd></div>
                  <div><dt className="text-muted-foreground">Conversions</dt><dd className="tabular font-medium">{n0(g.conv)}</dd></div>
                </dl>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="By campaign" description="Where each campaign's money went. Click a campaign to see every search in it, with its ad group.">
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 font-medium">Campaign</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 text-right font-medium">Spent</th><th className="w-[28%] px-3 py-2 font-medium">Split</th><th className="px-3 py-2 text-right font-medium">Conv</th><th className="px-3 py-2 text-right font-medium">Junk open</th><th className="px-4 py-2 text-right font-medium">To do</th></tr>
            </thead>
            <tbody className="divide-y">
              {led.by_campaign.map((g) => {
                const open = OPEN.reduce((s, o) => s + g.by[o].n, 0);
                return (
                  <tr key={g.key} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5"><Link href={`/searches${q({ campaign: g.key })}`} className="flex items-center gap-2 font-medium hover:underline"><span className="size-2 shrink-0 rounded-full" style={{ background: pcolor(g.project) }} />{lab(g.key)}</Link></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{g.kind}</td>
                    <td className="tabular px-3 py-2.5 text-right font-medium">{inr(g.cost)}</td>
                    <td className="px-3 py-2.5"><MoneyBar parts={parts(g.by)} total={g.cost} /></td>
                    <td className="tabular px-3 py-2.5 text-right">{n0(g.conv)}</td>
                    <td className={cn("tabular px-3 py-2.5 text-right", g.by.junk_open.cost ? "text-bad" : "text-muted-foreground")}>{inr(g.by.junk_open.cost)}</td>
                    <td className={cn("tabular px-4 py-2.5 text-right", open ? "font-medium text-bad" : "text-muted-foreground")}>{n0(open)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section title="How this is worked out">
        <Card className="p-5 text-[13.5px] leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b className="text-foreground">The sheet&apos;s call</b> is the last Add or Exclude written for a search in a campaign, up to the {dshort(led.to)} tab. An Exclude counts from the first tab that said Exclude. <b className="text-foreground">Deadline</b>: that sheet day plus {led.grace} days ({m.projects.length} projects, every campaign the agency runs; Google&apos;s CTM campaign is shown apart).</li>
            <li><b className="text-foreground">Went in</b>: the first line in the change history that adds a negative (or keyword) in that campaign which blocks (or matches) the search: on the campaign, in a shared list the campaign uses, or in every ad group of the campaign. The date, time and person are the change history&apos;s.</li>
            <li><b className="text-foreground">Spent after the deadline</b>: Google&apos;s search terms report, the days after the deadline up to the day the negative went in (or up to {dshort(led.to)} if it is still not in).</li>
            <li><b className="text-foreground">Blocked today</b>: the negative keyword report of {dlong(led.inventory_as_of)}, plus the words the change history shows going into shared lists (Google Ads does not export what is in a shared list). Negatives do not stretch to plurals or other close variants, as Google&apos;s help says.</li>
            <li><b className="text-foreground">Spend and conversions</b>: Google&apos;s search terms report, {dshort(led.from)} to {dshort(led.to)}; it adds up to the report to the paisa. Conversions are Google&apos;s count, not CRM leads.</li>
          </ul>
        </Card>
      </Section>
    </>
  );
}
