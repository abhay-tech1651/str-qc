import Link from "next/link";
import { Database } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { getLedger, ledgerDays } from "@/lib/ledger";
import { dlong, dshort } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { SearchesView } from "@/components/ledger-views";
import { UpToPicker } from "@/components/upto-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Every search" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SearchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const led = hasData() ? getLedger(one(sp.to)) : null;
  if (!led) {
    return (
      <>
        <PageHeader eyebrow="Every search" title="Every search, one by one" />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">Load the search terms report and the agency sheet on <Link href="/data" className="text-primary hover:underline">Data</Link>.</EmptyState>
      </>
    );
  }
  const m = getModel();
  const labels = Object.fromEntries(m.campaigns.map((c) => [c.id, c.label]));
  const projects = m.projects.map((p) => ({ id: p.id, name: p.name.replace(" County", "") }));
  return (
    <>
      <PageHeader
        eyebrow={`Every search · ${dshort(led.from)} – ${dshort(led.to)}`}
        title="Every search, one by one"
        description={<>Each search that cost money from {dlong(led.from)} to {dlong(led.to)}: what it cost, what the agency&apos;s sheet said, and what is in Google Ads now. Pick a project, campaign or ad group to narrow it down; click a search for its whole story.</>}
        actions={<UpToPicker days={ledgerDays().days} value={led.to} />}
      />
      <SearchesView searches={led.searches} labels={labels} projects={projects}
        init={{ project: one(sp.project), campaign: one(sp.campaign), ad_group: one(sp.ad_group), part: one(sp.part), open: one(sp.open) }} />
    </>
  );
}
