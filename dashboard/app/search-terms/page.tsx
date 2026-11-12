import Link from "next/link";
import { Database } from "lucide-react";
import { getData, hasData } from "@/lib/store";
import { dlong, drange } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { SearchTermsView } from "@/components/search-terms-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search terms" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SearchTermsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!hasData()) {
    return (
      <>
        <PageHeader eyebrow="Daily review" title="Search terms" />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">
          Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link> and load a search terms report or the agency STR sheet.
        </EmptyState>
      </>
    );
  }
  const sp = await searchParams;
  const { model, review } = getData();
  const days = model.data.search_terms?.days ?? [];
  if (!days.length) {
    return (
      <>
        <PageHeader eyebrow="Daily review" title="Search terms" />
        <EmptyState icon={<Database className="size-8" />} title="No search terms loaded">
          Load a Google Ads search terms report or the agency STR sheet on <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link>.
        </EmptyState>
      </>
    );
  }
  const latest = [...days].sort()[days.length - 1];
  const wantDay = one(sp.day);
  const day = days.includes(wantDay) ? wantDay : latest;
  const wantProject = one(sp.project);
  const project = model.projects.some((p) => p.id === wantProject) ? wantProject : "all";

  const rows = review.filter((r) => r.day === day);
  const labels = Object.fromEntries(model.campaigns.map((c) => [c.id, c.label]));
  const projects = model.projects.map((p) => ({ id: p.id, name: p.name.replace(" County", "") }));
  const st = model.data.search_terms;

  return (
    <>
      <PageHeader
        eyebrow="Daily review"
        title="Search terms"
        description={<>Every search that got a click on {dlong(day)}: what it cost, which keyword caught it, what the agency decided, and what the word rules noticed. Data covers {drange(st.from, st.to)}.</>}
      />
      <SearchTermsView rows={rows} days={days} day={day} initialProject={project} projects={projects} labels={labels} />
    </>
  );
}
