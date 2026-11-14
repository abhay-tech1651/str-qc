import { getModel, hasData } from "@/lib/store";
import { IssuesBoard } from "@/components/blocks";
import { EmptyState, PageHeader } from "@/components/ui";
import { lakh } from "@/lib/format";
import { periodData, periodModel } from "@/lib/period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Issues to fix" };

export default async function IssuesPage() {
  if (!hasData()) return <EmptyState title="No data yet">Import your data first.</EmptyState>;
  const m = (await periodModel());
  const high = m.fixes.filter((f) => f.severity === "high");
  const wasted = m.fixes.filter((f) => f.money_kind === "wasted").reduce((s, f) => s + (f.money ?? 0), 0);
  return (
    <>
      <PageHeader eyebrow="Decide" title="Issues to fix"
        description={<>{m.fixes.length} open issues across all four projects, {high.length} of them urgent. {lakh(wasted)} has already gone on searches nobody wanted. Each issue says who fixes it: the agency, County, or Google&apos;s CTM team.</>} />
      <IssuesBoard model={m} />
    </>
  );
}
