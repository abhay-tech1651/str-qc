import Link from "next/link";
import { Database } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { drange, inr, lakh, n0, pcolor, pct } from "@/lib/format";
import { Card, CardBody, CardHeader, EmptyState, Explain, PageHeader, ProjectTag, Section } from "@/components/ui";
import { StatCard } from "@/components/blocks";
import { KeywordTabs, QsChart } from "@/components/keywords-view";
import { periodData, periodModel } from "@/lib/period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Keywords" };

const RATINGS = [
  { key: "Above average", color: "var(--shown)" },
  { key: "Average", color: "var(--lost-budget)" },
  { key: "Below average", color: "var(--lost-rank)" },
  { key: "Not rated", color: "var(--p-other)" },
];

/** A 100% bar of spend split by Google's rating, with rupees in the legend. */
function RatingBar({ title, description, values }: { title: string; description: string; values: Record<string, number> }) {
  const total = RATINGS.reduce((s, r) => s + (values[r.key] ?? 0), 0);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-muted">
        {total > 0 ? RATINGS.map((r) => {
          const v = values[r.key] ?? 0;
          return v > 0 ? <div key={r.key} style={{ width: `${(100 * v) / total}%`, background: r.color }} title={`${r.key}: ${inr(v)}`} /> : null;
        }) : null}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {RATINGS.map((r) => {
          const v = values[r.key] ?? 0;
          return (
            <div key={r.key} className="text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-sm" style={{ background: r.color }} />{r.key}</div>
              <div className="mt-0.5 tabular"><span className="font-medium">{lakh(v)}</span> <span className="text-muted-foreground">· {total ? pct((100 * v) / total) : "–"}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function KeywordsPage() {
  const empty = (title: string, body: string) => (
    <>
      <PageHeader eyebrow="Performance" title="Keyword quality" description="How Google rates our keywords, ads and landing pages, and where that costs money." />
      <EmptyState icon={<Database className="size-8" />} title={title}>
        Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link> and {body}
      </EmptyState>
    </>
  );
  if (!hasData()) return empty("No data yet", "load your Google Ads exports.");
  const m = (await periodModel());
  const k = m.keywords;
  if (!k) return empty("No keyword report yet", "load the Google Ads keyword report (with Quality Score columns).");

  const share = (part: number, whole: number) => (whole ? (100 * part) / whole : null);
  const lpShare = share(k.below_lp_cost, k.total_cost);
  const qs13 = k.qs.filter((q) => ["1", "2", "3"].includes(q.label));
  const qs13n = qs13.reduce((s, q) => s + q.n, 0);
  const sc = k.status_counts ?? {};
  const live = Object.values(sc).reduce((s, v) => s + (v ?? 0), 0);
  const labels = Object.fromEntries(m.campaigns.map((c) => [c.id, c.label]));
  const range = drange(k.from, k.to);

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Keyword quality"
        description={<>From the keyword report, {range}: <b className="font-semibold text-foreground">{lakh(k.total_cost)}</b> spent on keywords, and <b className="font-semibold text-foreground">{pct(lpShare)}</b> of it sent people to landing pages Google rates below average. Poor ratings make every click cost more.</>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Keyword spend" value={lakh(k.total_cost)} sub={`${range} · ${m.projects.length} projects`} />
        <StatCard label="Spend on below-average landing pages" value={lakh(k.below_lp_cost)}
          tone={(lpShare ?? 0) >= 50 ? "bad" : (lpShare ?? 0) >= 20 ? "warn" : undefined}
          sub={`${pct(lpShare)} of keyword spend`} />
        <StatCard label="Spend on Quality Score 1–3" value={lakh(k.qs13_cost)} tone={k.qs13_cost > 0 ? "warn" : undefined}
          sub={`${pct(share(k.qs13_cost, k.total_cost))} of keyword spend · ${n0(qs13n)} keywords`} />
        <StatCard label="Live keywords not eligible" value={n0(sc["Not eligible"])}
          tone={(sc["Not eligible"] ?? 0) > 0 ? "warn" : undefined}
          sub={`${n0(sc["Limited"])} more limited · out of ${n0(live)} live keywords`} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Spend by Quality Score" description={`Rupees spent on keywords at each score, ${range}`} />
          <CardBody className="pt-3">
            <div className="mb-3 flex flex-wrap gap-4">
              <ProjectTag name="1–3 poor" color="var(--lost-rank)" />
              <ProjectTag name="4–6 middling" color="var(--lost-budget)" />
              <ProjectTag name="7–10 good" color="var(--shown)" />
              <ProjectTag name="No score yet" color="var(--p-other)" />
            </div>
            <QsChart qs={k.qs} />
            <Explain>Quality Score is Google&apos;s 1 to 10 rating of a keyword, based on how likely people are to click the ad, how well the ad matches the search, and how good the landing page is. Higher scores pay less per click for the same position; “No score” means Google has too few searches to rate it.</Explain>
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="What Google thinks of our pages and ads" description="Keyword spend split by Google's rating" />
          <CardBody className="space-y-6 pt-4">
            <RatingBar title="Landing page" description="the page people land on" values={k.lp_cost} />
            <RatingBar title="Ad relevance" description="how well the ad matches the keyword" values={k.rel_cost} />
            <Explain>A below-average landing page lowers Quality Score, which raises the price of every click on that keyword. Slow pages on a phone and pages that are not about the keyword are the usual causes.</Explain>
          </CardBody>
        </Card>
      </div>

      <Section title="By project" description={`The same keyword report split by project, ${range}.`}>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Project</th>
              <th className="px-4 py-2.5 text-right font-medium">Keywords</th>
              <th className="px-4 py-2.5 text-right font-medium">Live</th>
              <th className="px-4 py-2.5 text-right font-medium">Not eligible</th>
              <th className="px-4 py-2.5 text-right font-medium">Limited</th>
              <th className="px-4 py-2.5 text-right font-medium">Spend</th>
              <th className="px-4 py-2.5 text-right font-medium">On below-average pages</th>
              <th className="px-4 py-2.5 text-left font-medium">Share of spend</th>
              <th className="px-4 py-2.5 text-right font-medium">On Quality Score 1–3</th>
            </tr></thead>
            <tbody>
              {m.projects.map((p) => {
                const r = k.by_project[p.id];
                const s = r ? share(r.below_lp_cost, r.cost) : null;
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5"><ProjectTag name={p.name} color={pcolor(p.id)} className="text-[13px] text-foreground" /></td>
                    <td className="px-4 py-2.5 text-right tabular">{n0(r?.keywords)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{n0(r?.enabled)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{n0(r?.not_eligible)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{n0(r?.limited)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{inr(r?.cost)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{inr(r?.below_lp_cost)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex min-w-[140px] items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${s ?? 0}%`, background: "var(--lost-rank)" }} /></div>
                        <span className="w-10 text-right text-xs tabular">{pct(s)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{inr(r?.qs13_cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Explain>“Live” keywords are switched on. “Not eligible” ones are switched on but cannot show at all (Google gives the reason in the keyword's status, for example low search volume); “limited” ones show only some of the time.</Explain>
      </Section>

      <Section title="Keywords to look at" description="Short lists from the keyword report, biggest spend first. Each list downloads as CSV for the agency.">
        <KeywordTabs k={k} projects={m.projects} labels={labels} />
      </Section>

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        Data: keyword report {drange(m.data.keywords?.from, m.data.keywords?.to) || range}. Quality Score and the ratings are Google&apos;s latest values, not an average over the dates.
      </p>
    </>
  );
}
