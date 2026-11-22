import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Database } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { FIX_TYPES, fixList, getLedger, ledgerDays } from "@/lib/ledger";
import { OPEN, parts } from "@/lib/outcomes";
import { cn, dlong, dshort, inr, lakh, n0, pcolor } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Explain, PageHeader, ProjectTag, Section } from "@/components/ui";
import { MoneyBar, MoneyList } from "@/components/money";
import { UpToPicker } from "@/components/upto-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const pctOf = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

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
  const led = getLedger(toParam);
  const days = ledgerDays();
  if (!led) {
    return (
      <>
        <PageHeader eyebrow="Overview" title="Where the search money went" />
        <EmptyState icon={<Database className="size-8" />} title="The agency sheet and search terms are needed">
          Load the search terms report and refresh the agency sheet on <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Data</Link>.
        </EmptyState>
      </>
    );
  }
  const m = getModel();
  const label = new Map(m.campaigns.map((c) => [c.id, c.label]));
  const lab = (c: string) => label.get(c) ?? c;
  const T = led.total;
  const P = parts(T.by);
  const part = (k: string) => P.find((p) => p.part === k)!;
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ to: led.to, ...extra })}`;
  const fixes = fixList(led);
  const fixBy = FIX_TYPES.map((t) => ({ ...t, items: fixes.filter((f) => f.type === t.type) })).filter((t) => t.items.length);
  const openCount = fixes.length;

  const junk = T.by.junk_blocked.cost + T.by.junk_open.cost;
  const junkN = T.by.junk_blocked.n + T.by.junk_open.n;
  const conv = part("results");
  const addsAsked = T.by.add_done.n + T.by.add_open.n + T.by.add_blocked.n;
  const openOf = (by: typeof T.by) => OPEN.reduce((s, o) => s + by[o].n, 0);
  // how each blocked junk search is blocked, and what the sheet wrote for its Excludes (County asks for the full search term)
  const jb = led.searches.filter((s) => s.outcome === "junk_blocked");
  const byKind = (k: string) => jb.filter((s) => s.block_kind === k).length;
  const exCalls = led.searches.filter((s) => s.verdict === "Exclude");
  const wrote = (k: string) => exCalls.filter((s) => s.neg_written_kind === k).length;
  const projects = m.projects.map((p) => ({ p, g: led.by_project.find((g) => g.key === p.id) })).filter((x) => x.g);

  return (
    <>
      <PageHeader
        eyebrow={`All four projects · ${dshort(led.from)} – ${dshort(led.to)}`}
        title="Where the search money went"
        description={<>
          From {dlong(led.from)} to {dlong(led.to)}, Google spent <b className="text-foreground">{inr(T.cost)}</b> on <b className="text-foreground">{n0(T.searches)}</b> different searches.{" "}
          <b className="text-foreground">{inr(conv.cost)}</b> of it went to searches that brought conversions. The agency&apos;s sheet called <b className="text-foreground">{inr(junk)}</b> junk;{" "}
          {n0(T.by.junk_blocked.n)} of those {n0(junkN)} searches are blocked now. <b className="text-foreground">{n0(openCount)} things are still open</b>, each listed with where to find it in Google Ads.
        </>}
        actions={<><UpToPicker days={days.days} value={led.to} /><Button asChild><Link href={`/fix${q({})}`}>Open the fix list <ArrowRight /></Link></Button></>}
      />

      <Card className="p-5 sm:p-6">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Every rupee, {inr(T.cost)}</h2>
          <span className="text-[13px] text-muted-foreground">{n0(T.clicks)} clicks · {n0(T.conv)} conversions (Google&apos;s count)</span>
        </div>
        <p className="mb-4 text-[13px] text-muted-foreground">Each search counts once, in the part that fits it today. Click a part to see its searches.</p>
        <MoneyBar parts={P} total={T.cost} tall />
        <div className="mt-3"><MoneyList parts={P} total={T.cost} base={`/searches${q({})}`} /></div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold"><CircleAlert className="size-5 text-bad" /> Still to do</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Up to the {dshort(led.to)} tab of the sheet, checked against Google Ads as it is now.</p>
          <ul className="mt-3 divide-y">
            {fixBy.map((t) => {
              const cost = t.items.reduce((s, f) => s + f.cost, 0);
              return (
                <li key={t.type}>
                  <Link href={`/fix${q({ type: t.type })}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/50 sm:px-2">
                    <span className="tabular w-10 shrink-0 text-right text-lg font-semibold">{n0(t.items.length)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">{t.title}</span>
                      <span className="block text-[12.5px] text-muted-foreground">{t.who}{cost > 0 ? (t.type === "neg_blocks_good" ? ` · ${inr(cost)} went to the searches we want that they block` : ` · ${inr(cost)} spent on them in the period`) : ""}</span>
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            In the sheet&apos;s negative column, {n0(wrote("one_word"))} of the {n0(exCalls.length)} Exclude calls give a single word and {n0(wrote("none"))} give none.
            County&apos;s rule: negate the search term itself (or two or more of its words), never one word, so the fix list always suggests the full term.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="size-5 text-good" /> Done</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">What the agency has put right, so the picture stays fair.</p>
          <ul className="mt-3 space-y-3 text-[14px] leading-snug">
            <li><b className="tabular">{n0(T.by.junk_blocked.n)}</b> of {n0(junkN)} searches the sheet called junk are blocked in Google Ads ({Math.round(pctOf(T.by.junk_blocked.n, junkN))}%).</li>
            <li>Of those, <b className="tabular">{n0(byKind("term"))}</b> are blocked by their own full search term (safe: it blocks nothing else), {n0(byKind("part"))} by part of it, and <b className="tabular">{n0(byKind("one_word"))}</b> only by a single word, which also blocks every other search with that word.</li>
            <li>Of the {inr(junk)} spent on junk searches, <b className="tabular">{inr(led.junk_cost_after_call)}</b> came after the sheet had called them junk, and {inr(led.junk_cost_after_deadline)} after the {led.grace}-day deadline. The rest was spent on the day each search first appeared, before anyone could see it.</li>
            <li><b className="tabular">{n0(T.by.add_done.n)}</b> of {n0(addsAsked)} searches the sheet said to Add are keywords now.</li>
            <li>The sheet reviewed {T.by.not_reviewed.n === 0 ? "every search" : <>every search but <b className="tabular">{n0(T.by.not_reviewed.n)}</b></>} that cost money in the period.</li>
          </ul>
        </Card>
      </div>

      <Section title="By project" description="The same split for each project. Bars are out of that project's own spend.">
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map(({ p, g }) => {
            const pp = parts(g!.by);
            const pj = g!.by.junk_blocked.cost + g!.by.junk_open.cost;
            return (
              <Card key={p.id} className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/searches${q({ project: p.id })}`} className="font-semibold hover:underline"><ProjectTag name={p.name} color={pcolor(p.id)} className="text-[15px] text-foreground" /></Link>
                  <span className="tabular text-[15px] font-semibold">{inr(g!.cost)}</span>
                </div>
                <MoneyBar parts={pp} total={g!.cost} className="mt-3" />
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                  <div><dt className="text-muted-foreground">Brought conversions</dt><dd className="tabular font-medium">{inr(pp[0].cost)} <span className="text-muted-foreground">· {n0(g!.conv)} conv</span></dd></div>
                  <div><dt className="text-muted-foreground">Junk, still open</dt><dd className={cn("tabular font-medium", g!.by.junk_open.cost ? "text-bad" : "")}>{inr(g!.by.junk_open.cost)} <span className="font-normal text-muted-foreground">of {inr(pj)}</span></dd></div>
                  <div><dt className="text-muted-foreground">Still to do</dt><dd className={cn("tabular font-medium", openOf(g!.by) ? "text-bad" : "")}>{n0(openOf(g!.by))} searches</dd></div>
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
              {led.by_campaign.map((g) => (
                <tr key={g.key} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5"><Link href={`/searches${q({ campaign: g.key })}`} className="flex items-center gap-2 font-medium hover:underline"><span className="size-2 shrink-0 rounded-full" style={{ background: pcolor(g.project) }} />{lab(g.key)}</Link></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{g.kind}</td>
                  <td className="tabular px-3 py-2.5 text-right font-medium">{inr(g.cost)}</td>
                  <td className="px-3 py-2.5"><MoneyBar parts={parts(g.by)} total={g.cost} /></td>
                  <td className="tabular px-3 py-2.5 text-right">{n0(g.conv)}</td>
                  <td className={cn("tabular px-3 py-2.5 text-right", g.by.junk_open.cost ? "text-bad" : "text-muted-foreground")}>{inr(g.by.junk_open.cost)}</td>
                  <td className={cn("tabular px-4 py-2.5 text-right", openOf(g.by) ? "font-medium text-bad" : "text-muted-foreground")}>{n0(openOf(g.by))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Explain>Colours are the same as the bar at the top. Hover a bar to see each part in rupees. “To do” counts searches with something still open: junk not blocked, an Add not done or blocked, a converting search now blocked, or a search missing from the sheet.</Explain>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="How Google matched the searches" description="Google shows ads for searches close to a keyword. This is where the junk came in.">
          <Card className="divide-y">
            {led.by_match.map((g) => {
              const j = g.by.junk_blocked.cost + g.by.junk_open.cost;
              return (
                <div key={g.key} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2 text-[13.5px]"><span className="font-medium">{g.key}</span><span className="tabular">{inr(g.cost)} <span className="text-muted-foreground">· {Math.round(pctOf(j, g.cost))}% junk</span></span></div>
                  <MoneyBar parts={parts(g.by)} total={g.cost} className="mt-2" />
                </div>
              );
            })}
          </Card>
          <Explain>“Close variant” means Google showed the ad for a search it judged close to the keyword, not the keyword itself. {(() => {
            const cv = led.by_match.filter((g) => /close variant/i.test(g.key));
            const cj = cv.reduce((s, g) => s + g.by.junk_blocked.cost + g.by.junk_open.cost, 0);
            return junk > 0 ? `${Math.round(pctOf(cj, junk))}% of the junk spend came through close variants.` : "";
          })()}</Explain>
        </Section>
        <Section title="Week by week" description="Spend each week, split the same way. Junk falling over time means the reviews are working.">
          <Card className="divide-y">
            {led.by_week.map((w) => {
              const j = w.by.junk_blocked.cost + w.by.junk_open.cost;
              return (
                <div key={w.from} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2 text-[13.5px]"><span className="font-medium">{dshort(w.from)} – {dshort(w.to)}</span><span className="tabular">{lakh(w.cost)} <span className="text-muted-foreground">· {Math.round(pctOf(j, w.cost))}% junk</span></span></div>
                  <MoneyBar parts={parts(w.by)} total={w.cost} className="mt-2" />
                </div>
              );
            })}
          </Card>
        </Section>
      </div>

      <Section title="How this is worked out">
        <Card className="p-5 text-[13.5px] leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b className="text-foreground">Spend</b> is Google&apos;s search terms report, {dshort(led.from)} (the first tab of the agency sheet) to {dshort(led.to)}. It adds up to the report to the paisa.</li>
            <li><b className="text-foreground">The sheet said</b> is the last Add, Exclude or Discuss written for that search in that campaign, up to the {dshort(led.to)} tab. No Add or Exclude means the agency left it running.</li>
            <li><b className="text-foreground">Blocked</b> means a negative in the full negative keyword list{led.inventory_as_of ? ` downloaded on ${dlong(led.inventory_as_of)}` : ""} blocks the search, at campaign level or in every ad group it ran in. Shared negative lists are attached to most campaigns but their contents are not loaded yet, so a few “not blocked” searches may be covered there.</li>
            <li><b className="text-foreground">Keyword</b> means the keyword report or the change history shows it as a keyword in that campaign.</li>
            <li><b className="text-foreground">Conversions</b> are Google&apos;s count, not CRM leads.</li>
          </ul>
          <p className="mt-3">For newer data, download the negative keyword report, change history and search terms on <Link href="/data" className="text-primary hover:underline">Data</Link>; every number here updates by itself.</p>
        </Card>
      </Section>
    </>
  );
}
