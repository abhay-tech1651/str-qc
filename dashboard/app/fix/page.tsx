import Link from "next/link";
import { Database } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { FIX_TYPES, fixList, getLedger, ledgerDays } from "@/lib/ledger";
import { dlong, dshort, n0 } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { FixView } from "@/components/ledger-views";
import { UpToPicker } from "@/components/upto-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fix list" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function FixPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const led = hasData() ? getLedger(one(sp.to)) : null;
  if (!led) {
    return (
      <>
        <PageHeader eyebrow="Fix list" title="What is still open" />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">Load the search terms report and the agency sheet on <Link href="/data" className="text-primary hover:underline">Data</Link>.</EmptyState>
      </>
    );
  }
  const m = getModel();
  const labels = Object.fromEntries(m.campaigns.map((c) => [c.id, c.label]));
  const projects = m.projects.map((p) => ({ id: p.id, name: p.name.replace(" County", "") }));
  const items = fixList(led);
  const types = FIX_TYPES.map((t) => {
    const its = items.filter((f) => f.type === t.type);
    return { ...t, n: its.length, cost: its.reduce((s, f) => s + f.cost, 0) };
  }).filter((t) => t.n > 0);
  // the drawer needs the searches behind the rows only
  const ids = new Set(items.map((f) => f.id));
  return (
    <>
      <PageHeader
        eyebrow={`Fix list · sheet up to ${dshort(led.to)}`}
        title="What is still open"
        description={<>{n0(items.length)} things to put right, from the sheet up to the {dlong(led.to)} tab, checked against Google Ads as it is now. Each row says what to do and where to do it. Download a list as CSV to send it to the agency.</>}
        actions={<UpToPicker days={ledgerDays().days} value={led.to} />}
      />
      <FixView items={items} types={types} searches={led.searches.filter((s) => ids.has(s.id))} labels={labels} projects={projects}
        init={{ type: one(sp.type), project: one(sp.project) }} />
    </>
  );
}
