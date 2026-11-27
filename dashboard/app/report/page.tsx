import Link from "next/link";
import { CheckCircle2, Database } from "lucide-react";
import { hasData } from "@/lib/store";
import { ledgerDays } from "@/lib/ledger";
import { getAudit } from "@/lib/audit";
import { addSegs, exSegs, KIND_LABEL, negPath } from "@/lib/follow-labels";
import { cn, dlong, dshort, inr, n0, pcolor } from "@/lib/format";
import { Card, EmptyState, Explain, PageHeader, Section } from "@/components/ui";
import { FollowTable, ScoreBar, ThemeKeywordTable } from "@/components/audit-views";
import { NegHurtTable } from "@/components/neg-hurt-table";
import { UpToPicker } from "@/components/upto-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agency report" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** "Check it yourself": where in Google Ads each section can be checked, so nobody has to take the page's word for it. */
function Check({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground"><b className="text-foreground">Check it yourself:</b> {children}</p>;
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const A = hasData() ? getAudit(one(sp.to)) : null;
  if (!A) {
    return (
      <>
        <PageHeader eyebrow="Agency report" title="What was asked, what was done" />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">Load the search terms report and the agency sheet on <Link href="/data" className="text-primary hover:underline">Data</Link>.</EmptyState>
      </>
    );
  }
  const { led, card: C, agency, fixes, labels } = A;
  const lab = (c: string) => labels[c] ?? c;
  const late = agency.filter((f) => f.status === "late").sort((a, b) => b.cost_late - a.cost_late || b.days_late - a.days_late);
  const open = agency.filter((f) => f.type === "exclude" && (f.status === "open_overdue" || f.status === "wrong_place"));
  const adds = agency.filter((f) => f.type === "add" && (f.status === "open_overdue" || f.status === "elsewhere" || f.status === "blocked"));
  const themeMiss = agency.filter((f) => f.type === "add" && f.wrong_theme);
  const negs = fixes.filter((f) => f.type === "neg_blocks_good" || f.type === "keyword_blocked");
  const exAll = agency.filter((f) => f.type === "exclude");
  const oneWordWritten = exAll.filter((f) => f.written_kind === "one_word" || f.written_kind === "none").sort((a, b) => b.call_day.localeCompare(a.call_day));
  const lateDays = late.filter((f) => f.type === "exclude").map((f) => f.days_late);
  const over = (n: number) => lateDays.filter((d) => d >= n).length;

  return (
    <>
      <PageHeader
        eyebrow={`Agency report · sheet tabs ${dshort(led.from)} – ${dshort(led.to)} · Google Ads as of ${dshort(A.asOf)}`}
        title="What the sheet asked, and what went into Google Ads"
        description={<>Every Add and Exclude in the agency&apos;s STR sheet, checked against the Google Ads change history (who changed what, and when) and the account as it is today. Each row opens the search&apos;s full story. The agency has {led.grace} days from the sheet day. Print this page or save it as PDF to share it (printer icon at the top).</>}
        actions={<UpToPicker days={ledgerDays().days} value={led.to} />}
      />

      <Card className="grid gap-8 p-5 sm:p-6 lg:grid-cols-2">
        <ScoreBar title={<><span>Excludes: {n0(C.ex.n)}</span><span className="text-[12.5px] font-normal text-muted-foreground">{pct(C.ex.on_time, C.ex.due)}% on time</span></>} segs={exSegs(C)}
          note={`On time means the negative was in Google Ads by the deadline. ${n0(C.ex.late)} went in late: ${n0(over(3))} of them 3 or more days late, ${n0(over(7))} a week or more.`} />
        <ScoreBar title={<><span>Adds: {n0(C.add.n)}</span><span className="text-[12.5px] font-normal text-muted-foreground">{pct(C.add.on_time + C.add.late, C.add.due)}% added</span></>} segs={addSegs(C)}
          note={`An Add is done when the search is a keyword in the campaign the sheet named.`} />
      </Card>

      <nav className="no-print mt-6 flex flex-wrap gap-2 text-[13px]">
        {[["#late", `1 · Late Excludes (${n0(late.filter((f) => f.type === "exclude").length)})`], ["#open", `2 · Excludes not working (${n0(open.length)})`], ["#adds", `3 · Adds not done (${n0(adds.length)})`], ["#theme", `3b · Adds in the wrong theme (${n0(themeMiss.length)})`], ["#theme-kw", `3c · Keywords outside their theme (${n0(A.themeKeywords.length)})`], ["#negatives", `4 · Negatives that hurt (${n0(negs.length)})`], ["#sheet", "5 · How the sheet writes negatives"], ["#fair", "6 · Done well"]].map(([h, t]) => (
          <a key={h} href={h} className="rounded-full border bg-card px-3 py-1 hover:bg-muted">{t}</a>
        ))}
      </nav>

      <Section className="scroll-mt-20" title={<span id="late">1 · Excludes that went in after the deadline</span>}
        description={<>{n0(late.filter((f) => f.type === "exclude").length)} Excludes went in late; <b className="text-foreground">{inr(C.ex.cost_late_done)}</b> was spent on those searches between the deadline and the day the negative went in. Half were {C.ex.median_days_late} or more days late. Costliest first.</>}>
        <Check>Google Ads › Change history › filter Change type = Keywords; find the negative on the date shown. The spend per day is in Insights and reports › Search terms.</Check>
        <FollowTable rows={late.filter((f) => f.type === "exclude")} labels={labels} cols={["term", "campaign", "day", "due", "went", "how", "late", "cost_late"]} csvName="late-excludes" filters />
      </Section>

      <Section className="scroll-mt-20" title={<span id="open">2 · Excludes that are still not working</span>}
        description={<>{n0(C.ex.open_overdue)} are past the deadline with no negative that blocks them, and {n0(C.ex.wrong_place)} have a negative in another ad group of the campaign, so the search still runs where it ran. {C.ex.cost_leaking > 0 ? <>{inr(C.ex.cost_leaking)} spent on them after the deadline.</> : "They have not cost money since the deadline: most junk searches run once."} {n0(C.ex.open_in_time)} more are not due yet.</>}>
        <Check>Google Ads › the campaign › Audiences, keywords and content › Search keywords › Negative search keywords: search for the words. Remember the shared lists (Tools › Shared library › Negative keyword lists): only the words added to them since 1 Oct are known here.</Check>
        <FollowTable rows={open} labels={labels} cols={["term", "campaign", "day", "due", "status", "how", "written", "late", "cost_late"]} csvName="excludes-not-working" sort={{ key: "days_late", dir: "desc" }} />
      </Section>

      <Section className="scroll-mt-20" title={<span id="adds">3 · Adds that are not done</span>}
        description={<>{n0(C.add.open_overdue)} searches the sheet said to Add are not a keyword in any campaign, {n0(C.add.elsewhere)} are a keyword only in another campaign, and {n0(C.add.blocked)} are blocked by a negative, past their deadline. An Add not done means the search runs only through broader keywords, with no bid or ad of its own.</>}>
        <Check>Google Ads › the campaign › Search keywords: search for the words. A keyword added after the keyword report was downloaded shows in the Change history.</Check>
        <FollowTable rows={adds} labels={labels} cols={["term", "campaign", "day", "due", "status", "how", "late", "cost"]} csvName="adds-not-done" sort={{ key: "days_late", dir: "desc" }} />
      </Section>

      <Section className="scroll-mt-20" title={<span id="theme">3b · Adds in an ad group of another theme</span>}
        description={<>Each ad group holds one theme, named in its title, and its ads and landing page speak to it. A search the sheet said to Add belongs in the ad group whose theme it names: <i>apartment in gurgaon</i> in Apartments In Gurgaon, not in Flat In Gurgaon. Otherwise its ad does not match the search and Google rates the ad relevance lower. {n0(themeMiss.length)} Adds became keywords only in an ad group of another theme. Do instead: add the keyword in the ad group shown, and pause the copy in the wrong one (a keyword that has converted can stay until the new one has its own history).</>}>
        <Check>Google Ads › the campaign › Search keywords, Ad group column: the keyword is in the ad group shown under How it went in.</Check>
        <FollowTable rows={themeMiss} labels={labels} cols={["term", "campaign", "day", "status", "how", "cost"]} csvName="adds-wrong-theme" empty="Every Add that went in sits in an ad group of its theme." />
      </Section>

      <Section className="scroll-mt-20" title={<span id="theme-kw">3c · Keywords in the account outside their ad group&apos;s theme</span>}
        description={<>Every enabled keyword, sheet or not, checked against the ad groups of its own campaign: each campaign has its own set (Cocoa Gurgaon has Flat, Apartments and 3 or 4 BHK ad groups; Jade has no Property ad group). A keyword is listed only when its campaign has an ad group whose theme fits it better than the one it is in. A keyword whose campaign has no ad group of its theme is left alone. {n0(A.themeKeywords.length)} keywords.</>}>
        <ThemeKeywordTable rows={A.themeKeywords} labels={labels} />
        <details className="mt-4 rounded-lg border bg-card p-4 text-[13px]">
          <summary className="cursor-pointer font-medium">The ad groups of each campaign, and their theme words</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {A.adGroups.map((c) => (
              <div key={c.campaign}>
                <div className="font-medium">{lab(c.campaign)}</div>
                <ul className="mt-1 space-y-0.5 text-[12.5px] text-muted-foreground">
                  {c.groups.map((g) => (
                    <li key={g.name}><span className={cn("text-foreground", !g.enabled && "line-through opacity-60")}>{g.name}</span>{" "}· {g.theme.length ? g.theme.join(", ") : "no theme word"} · {n0(g.enabled)} enabled keywords · {inr(g.cost)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">From the keyword report (all time). Theme words are the ad group&apos;s name without places and filler words; struck out: no enabled keyword. An ad group report from Google Ads (Campaigns › Ad groups) would add ad groups with no keyword and their status.</p>
        </details>
      </Section>

      <Section className="scroll-mt-20" title={<span id="negatives">4 · Negatives that block searches we want</span>}
        description={<>A negative of one word (or a short phrase) in broad or phrase match blocks every search that contains it, so it also stops searches with buying intent and our own keywords. County&apos;s rule is to negate the full search. {n0(fixes.filter((f) => f.type === "neg_blocks_good").length)} negatives block high- or medium-intent searches, and {n0(fixes.filter((f) => f.type === "keyword_blocked").length)} campaign-level negatives switch off enabled keywords in the same campaign. Other County project names are left out (County asked for them).</>}>
        <Check>Google Ads › the campaign (or ad group) › Negative search keywords: find the negative shown; then Search keywords: the keywords listed contain that word.</Check>
        <NegHurtTable rows={negs} labels={labels} />
      </Section>

      <Section className="scroll-mt-20" title={<span id="sheet">5 · How the sheet writes its negatives</span>}
        description={<>The sheet&apos;s negative column tells the person in Google Ads what to add. Of {n0(C.ex.n)} Excludes, it gives <b className="text-foreground">one word for {n0(C.ex.written_one_word)}</b>, <b className="text-foreground">nothing for {n0(C.ex.written_none)}</b>, and the full search for {n0(C.ex.written_term)}. In Google Ads, {n0(C.ex.went_in_one_word)} Excludes are blocked by a single word and {n0(C.ex.went_in_term)} by their full search.</>}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 font-medium">Sheet week</th><th className="px-3 py-2 text-right font-medium">Excludes</th><th className="px-3 py-2 text-right font-medium">Full search</th><th className="px-3 py-2 text-right font-medium">One word</th><th className="px-3 py-2 text-right font-medium">Nothing written</th><th className="px-4 py-2 text-right font-medium">Went in as one word</th></tr>
            </thead>
            <tbody className="divide-y">
              {A.byWeek.slice().reverse().map((w) => (
                <tr key={w.from}>
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{dshort(w.from)} – {dshort(w.to)}</td>
                  <td className="tabular px-3 py-2 text-right">{n0(w.card.ex.n)}</td>
                  <td className="tabular px-3 py-2 text-right">{n0(w.card.ex.written_term)}</td>
                  <td className={cn("tabular px-3 py-2 text-right", w.card.ex.written_one_word && "text-bad")}>{n0(w.card.ex.written_one_word)} <span className="text-muted-foreground">({pct(w.card.ex.written_one_word, w.card.ex.n)}%)</span></td>
                  <td className={cn("tabular px-3 py-2 text-right", w.card.ex.written_none && "text-warn")}>{n0(w.card.ex.written_none)}</td>
                  <td className="tabular px-4 py-2 text-right">{n0(w.card.ex.went_in_one_word)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="mt-4">
          <FollowTable rows={oneWordWritten} labels={labels} cols={["term", "campaign", "day", "written", "status", "how"]} csvName="sheet-one-word-or-blank" pageSize={10} />
        </div>
        <Explain>Why it matters: a one-word broad negative such as <span className="font-mono">-location</span> blocks the junk search, and also &quot;ivory county location&quot;, our own keyword. Negatives also do not stretch to plurals (Google&apos;s rule), so <span className="font-mono">-flat</span> does not stop &quot;flats&quot;. The full search in exact or phrase match stops only what was meant.</Explain>
      </Section>

      <Section className="scroll-mt-20" title={<span id="fair">6 · Done well</span>} description="So the picture stays fair.">
        <Card className="p-5 text-[14px] leading-relaxed">
          <ul className="space-y-2">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> {n0(C.ex.on_time)} of {n0(C.ex.due)} Excludes past their deadline went in on time ({pct(C.ex.on_time, C.ex.due)}%).</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> {n0(C.ex.went_in_term)} junk searches are blocked by their own full search, which blocks nothing else.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> {n0(C.add.on_time + C.add.late)} Adds became keywords in the campaign the sheet named.</li>
            {A.byWeek.length >= 2 ? (() => {
              const w = A.byWeek.filter((x) => x.card.ex.due > 0);
              const best = w.slice().sort((a, b) => pct(b.card.ex.on_time, b.card.ex.due) - pct(a.card.ex.on_time, a.card.ex.due))[0];
              return best ? <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> Best sheet week: {dshort(best.from)} – {dshort(best.to)}, {pct(best.card.ex.on_time, best.card.ex.due)}% of its Excludes on time.</li> : null;
            })() : null}
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> {led.total.by.not_reviewed.n === 0 ? "Every search that cost money is in the sheet." : `Every search that cost money is in the sheet except ${n0(led.total.by.not_reviewed.n)}.`}</li>
          </ul>
        </Card>
      </Section>

      <Section title="How this is worked out">
        <Card className="p-5 text-[13px] leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Sheet: the agency&apos;s STR sheet, tabs {dlong(led.from)} to {dlong(led.to)}. For each search in a campaign, the last Add or Exclude counts; an Exclude&apos;s deadline runs from the first tab that said Exclude.</li>
            <li>Change history: every negative and keyword added, with its date, time and person. A negative counts when it blocks the search on the campaign, in a shared list the campaign uses, or in every ad group of the campaign ({KIND_LABEL.term}, {KIND_LABEL.part} or {KIND_LABEL.one_word}).</li>
            <li>Today: the negative keyword report of {dlong(led.inventory_as_of)} and the keyword report. Where to look: {negPath("<campaign>")}.</li>
            <li>Money: Google&apos;s search terms report. &quot;After the deadline&quot; counts the days after the deadline up to the day the negative went in.</li>
            <li>Google&apos;s CTM campaign is run by Google&apos;s team: its {n0(A.google.length)} calls are not in this report.</li>
          </ul>
        </Card>
      </Section>
    </>
  );
}
