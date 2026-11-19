import Link from "next/link";
import { Database, Search } from "lucide-react";
import { hasData } from "@/lib/store";
import { getBrief } from "@/lib/brief";
import { dshort } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meeting proof" };

/** One printable page: each point for the agency meeting, its numbers, examples, and where to check it in Google Ads. */
export default function MeetingPage() {
  if (!hasData()) {
    return (
      <>
        <PageHeader eyebrow="Meeting" title="Meeting proof" />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">Load the reports on the Data page first.</EmptyState>
      </>
    );
  }
  const b = getBrief();
  return (
    <>
      <PageHeader
        eyebrow={`Meeting proof · ${dshort(b.today)}`}
        title="Points for the agency, with proof"
        description={<>Agency sheet to {dshort(b.sheet_to)}, Google Ads change history to {dshort(b.last_change)}{b.inventory ? <>, full negative list as of {dshort(b.inventory.as_of)} ({b.inventory.total.toLocaleString("en-IN")} negatives)</> : null}. Print this page (printer icon at the top) or save it as PDF to share it.</>}
      />
      <ol className="space-y-5">
        {b.claims.map((c, i) => (
          <li key={c.id} id={c.id} className="scroll-mt-20 break-inside-avoid">
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={c.tone}>{c.number}</Badge></div>
                  <h2 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-tight">{c.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.detail}</p>
                  <p className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/60 px-3 py-2 text-[13px]">
                    <Search className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span><b className="font-medium">Check it yourself:</b> {c.check}</span>
                  </p>
                  {c.examples.length ? (
                    <div className="mt-3 overflow-x-auto rounded-lg border">
                      <table className="w-full text-[13px]">
                        <thead><tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                          {c.columns.map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {c.examples.map((e, j) => (
                            <tr key={j} className="border-b last:border-0">
                              {e.cells.map((v, k) => <td key={k} className="px-3 py-1.5 align-top tabular">{v}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs no-print"><Link href={c.href} className="text-primary underline-offset-2 hover:underline">See every row →</Link></div>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        How this is worked out: an Exclude call counts as put in when a negative added in the same campaign (on the sheet day, the day before, or later) blocks that search, at campaign level or in the same ad group.
        Negatives never stretch to plurals or other spellings. Shared negative lists are linked to campaigns{b.inventory?.lists.length ? ` (${b.inventory.lists.join(", ")})` : ""}, but their contents are not loaded yet, so a search one of those lists blocks can still show as not done here.
      </p>
    </>
  );
}
