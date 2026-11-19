import Link from "next/link";
import { Database } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { getNegatives } from "@/lib/negatives";
import { drange } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { NegativesView } from "@/components/negatives-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Negatives as written" };

export default function NegativesPage() {
  if (!hasData()) {
    return (
      <>
        <PageHeader eyebrow="Agency QC" title="Negatives as written" />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">
          Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link> and load the agency STR sheet and the Google Ads change history.
        </EmptyState>
      </>
    );
  }
  const m = getModel();
  const data = getNegatives();
  const labels = Object.fromEntries(m.campaigns.map((c) => [c.id, c.label]));
  const projects = m.projects.map((p) => ({ id: p.id, name: p.name.replace(" County", "") }));
  return (
    <>
      <PageHeader
        eyebrow="Agency QC"
        title="Negatives as written"
        description={<>For every Exclude call in the agency&apos;s sheet{m.data.agency_sheet ? ` (${drange(m.data.agency_sheet.from, m.data.agency_sheet.to)})` : ""}: did the sheet block the whole search or just one word, what actually went into Google Ads (change history {drange(data.changes_from, data.last_change)}), and which of our searches that negative now blocks.</>}
      />
      <NegativesView data={data} labels={labels} projects={projects} />
    </>
  );
}
