import Link from "next/link";
import { ListX } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { getInventory } from "@/lib/neg-inventory";
import { dshort } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { AccountNegativesView } from "@/components/account-negatives-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "All negatives in the account" };

export default function AccountNegativesPage() {
  const inv = hasData() ? getInventory() : null;
  if (!inv) {
    return (
      <>
        <PageHeader eyebrow="Negatives" title="All negatives in the account" />
        <EmptyState icon={<ListX className="size-8" />} title="Negative keyword report not loaded">
          In Google Ads open Campaigns › Audiences, keywords and content › Search keywords › Negative search keywords (all campaigns), Download › .csv, then press Import on the <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Data</Link> page.
        </EmptyState>
      </>
    );
  }
  const m = getModel();
  const labels = Object.fromEntries(m.campaigns.map((c) => [c.id, c.label]));
  const projects = m.projects.map((p) => ({ id: p.id, name: p.name.replace(" County", "") }));
  return (
    <>
      <PageHeader
        eyebrow="Negatives"
        title="All negatives in the account"
        description={<>Every negative in Google Ads on {dshort(inv.as_of)}, whenever it was added: what it blocks that we want, and whether each Exclude call in the agency&apos;s sheet is blocked today.</>}
      />
      <AccountNegativesView data={inv} labels={labels} projects={projects} />
    </>
  );
}
