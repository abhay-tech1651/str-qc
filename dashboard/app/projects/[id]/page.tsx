import Link from "next/link";
import { notFound } from "next/navigation";
import { Database } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { change, drange, dshort, inr, lakh, n1, pcolor, pct, plural, priceLabel } from "@/lib/format";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { StatCard } from "@/components/blocks";
import { ProjectTabs, type ProjectTab } from "@/components/project-tabs";
import type { Model } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS: ProjectTab[] = ["overview", "campaigns", "terms", "keywords", "agency", "ctm"];

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasData()) return { title: "Project" };
  const p = getModel().projects.find((x) => x.id === id);
  return { title: p ? p.name : "Project not found" };
}

/** The model with every list cut down to this project, so the browser only receives what this page shows. */
function forProject(m: Model, id: string): Model {
  const mine = <T extends { project: string }>(rows: T[] | undefined) => (rows ?? []).filter((r) => r.project === id);
  return {
    ...m,
    campaigns: m.campaigns.map((c) => (c.project === id ? c : { ...c, series: [] })),
    fixes: mine(m.fixes),
    agency: { ...m.agency, overdue_excludes: mine(m.agency.overdue_excludes), overdue_adds: mine(m.agency.overdue_adds), no_negative_rows: mine(m.agency.no_negative_rows), by_day: [] },
    risks: { ...m.risks, brand_no_word: mine(m.risks.brand_no_word), brand_leak: mine(m.risks.brand_leak), blocked: mine(m.risks.blocked), risky: mine(m.risks.risky), conflicts: mine(m.risks.conflicts), leaks: mine(m.risks.leaks), repeats: mine(m.risks.repeats) },
    keywords: m.keywords ? { ...m.keywords, no_conv: mine(m.keywords.no_conv), low_quality: mine(m.keywords.low_quality), duplicates: mine(m.keywords.duplicates), product_mismatch: mine(m.keywords.product_mismatch) } : null,
    ctm: m.ctm && m.ctm.project === id ? m.ctm : null,
    competitors: null,
    coverage: [],
  };
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;

  if (!hasData()) {
    return (
      <>
        <PageHeader eyebrow="Project" title="No data yet" description="Project pages fill in once the Google Ads exports and the agency's STR sheet are loaded." />
        <EmptyState icon={<Database className="size-8" />} title="Nothing to show yet">
          Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link> and press “Import from Downloads”.
        </EmptyState>
      </>
    );
  }

  const m = getModel();
  const p = m.projects.find((x) => x.id === id);
  if (!p) notFound();

  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initial: ProjectTab = TABS.includes(raw as ProjectTab) ? (raw as ProjectTab) : "overview";

  const ps = m.project_stats[id];
  const w = m.windows;
  const camps = m.campaigns.filter((c) => c.project === id);
  const hasCamp = camps.length > 0 && !!ps;
  const color = pcolor(id);
  const fixes = m.fixes.filter((f) => f.project === id);
  const urgent = fixes.filter((f) => f.severity === "high").length;
  const toFix = fixes.filter((f) => f.severity === "medium").length;
  const toDecide = fixes.filter((f) => f.severity === "low").length;
  const short = p.name.replace(" County", "");

  // Google conversions per day, summed over this project's campaigns (for the small trend line).
  const convByDay = new Map<string, number>();
  for (const c of camps) for (const s of c.series) convByDay.set(s.day, (convByDay.get(s.day) ?? 0) + (s.conv || 0));
  const convSpark = (ps?.daily ?? []).map((d) => convByDay.get(d.day) ?? 0);

  const none = "campaign data not imported";
  const description = [p.location, p.product, priceLabel(p)].filter(Boolean).join(" · ");

  return (
    <>
      <div className="mb-5 h-1.5 w-16 rounded-full" style={{ background: color }} aria-hidden />
      <PageHeader
        eyebrow="Project"
        title={<span className="inline-flex items-center gap-3"><span className="size-3 rounded-full" style={{ background: color }} aria-hidden />{p.name}</span>}
        description={description || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {urgent ? <Badge tone="bad" className="px-2.5 py-1 text-[13px]">{urgent} urgent</Badge> : null}
            {toFix ? <Badge tone="warn" className="px-2.5 py-1 text-[13px]">{toFix} to fix</Badge> : null}
            {toDecide ? <Badge tone="muted" className="px-2.5 py-1 text-[13px]">{toDecide} to decide</Badge> : null}
            {!fixes.length ? <Badge tone="good" className="px-2.5 py-1 text-[13px]">On track</Badge> : null}
          </div>
        }
      />

      <p className="-mt-2 mb-6 max-w-3xl text-sm text-muted-foreground">
        {hasCamp
          ? <>In the last 7 days ({drange(w.last7?.from, w.last7?.to)}) {short}&apos;s search ads cost <b className="font-semibold text-foreground">{lakh(ps.last7.cost)}</b> and brought <b className="font-semibold text-foreground">{n1(ps.last7.conv)}</b> Google {plural(ps.last7.conv, "conversion")}. {fixes.length ? <>There {fixes.length === 1 ? "is" : "are"} {fixes.length} {plural(fixes.length, "issue")} open for this project{urgent ? <>, {urgent} of them urgent</> : null}.</> : "Nothing is open for this project."}</>
          : <>Spend and conversions appear once a campaign report is imported. The search-term and agency checks below already use the agency&apos;s STR sheet.</>}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Spend, last 7 days" value={hasCamp ? lakh(ps.last7.cost) : "–"} delta={hasCamp ? change(ps.last7.cost, ps.prev7.cost) : undefined} invert
          sub={hasCamp ? `vs ${lakh(ps.prev7.cost)} the 7 days before` : none} spark={hasCamp ? ps.daily.map((d) => d.cost) : undefined} color={color} />
        <StatCard label="Google conversions, last 7 days" value={hasCamp ? n1(ps.last7.conv) : "–"} delta={hasCamp ? change(ps.last7.conv, ps.prev7.conv) : undefined}
          sub={hasCamp ? `${n1(ps.prev7.conv)} the 7 days before · counted by Google, not CRM` : none} spark={hasCamp ? convSpark : undefined} color="var(--good)" />
        <StatCard label="Cost per conversion" value={hasCamp ? inr(ps.last7.cpa) : "–"} delta={hasCamp ? change(ps.last7.cpa, ps.prev7.cpa) : undefined} invert
          sub={hasCamp ? `last 7 days · ${inr(ps.since.cpa)} since ${dshort(w.since?.from)}` : none} />
        <StatCard label="Share of account spend" value={hasCamp ? pct(ps.share_of_spend) : "–"}
          sub={hasCamp ? `${lakh(ps.since.cost)} of ${lakh(m.account.since.cost)} since ${dshort(w.since?.from)}` : none} />
      </div>

      <ProjectTabs model={forProject(m, id)} id={id} initial={initial} />
    </>
  );
}
