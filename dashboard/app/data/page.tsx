import type { ReactNode } from "react";
import { CalendarClock, ShieldCheck } from "lucide-react";
import { agencySheetId, getModel, hasData, loadedFiles } from "@/lib/store";
import { drange, dshort, n0, plural } from "@/lib/format";
import type { Model } from "@/lib/types";
import { Badge, Card, CardBody, CardHeader, Explain, PageHeader, Section } from "@/components/ui";
import { DataImport } from "@/components/data-import";
import { CoverageTable, FilesTable, type CoverageRow, type FileRow } from "@/components/data-tables";
import { periodData, periodModel } from "@/lib/period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import data" };

/** The day before `d` (YYYY-MM-DD), counted on the calendar. */
function dayBefore(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd - 1)).toISOString().slice(0, 10);
}

type Freshness = "fresh" | "behind" | "loaded" | "missing";
interface Source { name: string; from: string | null; to: string | null; extra?: string; how: string; cadence: string; state: Freshness }

function sources(m: Model | null): Source[] {
  const d = m?.data;
  const yesterday = m?.as_of ? dayBefore(m.as_of) : null;
  const daily = (to: string | null | undefined): Freshness => (!to ? "missing" : yesterday && to >= yesterday ? "fresh" : "behind");
  const any = (to: string | null | undefined): Freshness => (to ? "loaded" : "missing");
  const cd = d?.campaign_days ?? null;
  const st = d?.search_terms ?? null;
  return [
    { name: "Search terms report", from: st?.from ?? null, to: st?.to ?? null, how: "Export from Google Ads", cadence: "Every morning", state: daily(st?.to) },
    (() => {
      // the export can reach past its last row: days with no changes in Google Ads have no rows
      const covers = [d?.changes?.to, m?.agency?.last_change_day].filter(Boolean).sort().pop() ?? null;
      const last = d?.changes?.to ?? null;
      return { name: "Change history", from: d?.changes?.from ?? null, to: covers,
        extra: last && covers && last !== covers ? `no changes made after ${dshort(last)}` : undefined,
        how: "Export from Google Ads", cadence: "Every morning", state: daily(covers) } as Source;
    })(),
    { name: "Agency STR sheet", from: d?.agency_sheet?.from ?? null, to: d?.agency_sheet?.to ?? null, how: "Read straight from Google Sheets", cadence: "Every morning", state: any(d?.agency_sheet?.to) },
    { name: "Campaign report (by day)", from: cd?.from ?? null, to: cd?.to ?? null,
      extra: cd?.complete_through && cd.complete_through !== cd.to ? `complete to ${dshort(cd.complete_through)}` : undefined,
      how: "Export from Google Ads", cadence: "Once a week", state: any(cd?.to) },
    { name: "Keyword report", from: d?.keywords?.from ?? null, to: d?.keywords?.to ?? null, how: "Export from Google Ads", cadence: "Once a week", state: any(d?.keywords?.to) },
    { name: "Auction insights", from: d?.auction?.from ?? null, to: d?.auction?.to ?? null, how: "Export from Google Ads", cadence: "Once a month", state: any(d?.auction?.to) },
  ];
}

const STATE_BADGE: Record<Freshness, { tone: "good" | "warn" | "muted" | "info"; label: string }> = {
  fresh: { tone: "good", label: "Up to date" },
  behind: { tone: "warn", label: "Behind" },
  loaded: { tone: "info", label: "Loaded" },
  missing: { tone: "muted", label: "Not loaded" },
};

const C = ({ children }: { children: ReactNode }) => <b className="font-medium text-foreground">{children}</b>;

function Step({ n, title, children }: { n: number; title: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular">{n}</span>
      <div className="min-w-0 pb-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

export default async function DataPage() {
  const data = hasData();
  const m = data ? (await periodModel()) : null;
  const src = sources(m);
  const files: FileRow[] = loadedFiles().map((f) => ({
    name: String(f.name ?? ""), kind: String(f.kind ?? "unknown"), rows: Number(f.rows) || 0,
    first_day: f.first_day ?? null, last_day: f.last_day ?? null, loaded_at: String(f.loaded_at ?? ""), note: f.note ?? "",
  }));
  // days before the agency sheet's first tab have nothing to compare, so they are not counted as mismatches
  const sheetFrom = m?.data?.agency_sheet?.from ?? "";
  const coverage: CoverageRow[] = (m?.coverage ?? []).filter((c) => !sheetFrom || c.day >= sheetFrom).map((c) => ({
    day: c.day, report_rows: c.report_rows, report_cost: c.report_cost, sheet_rows: c.sheet_rows, sheet_cost: c.sheet_cost, cost_matches: !!c.cost_matches,
  }));
  const mismatch = coverage.filter((c) => !c.cost_matches).length;
  const behind = src.filter((s) => s.state === "behind" || (s.state === "missing" && s.cadence === "Every morning"));

  return (
    <>
      <PageHeader
        eyebrow="Data"
        title="Import data"
        description={<>Each morning, export two reports from Google Ads (search terms and change history), then press <C>Import new reports from Downloads</C>. The agency&apos;s STR sheet is read straight from Google.</>}
        actions={m ? (
          behind.length
            ? <Badge tone="warn" className="px-3 py-1 text-[13px]"><CalendarClock className="size-3.5" />{behind.length} daily {plural(behind.length, "source")} behind</Badge>
            : <Badge tone="good" className="px-3 py-1 text-[13px]"><CalendarClock className="size-3.5" />Daily data up to date</Badge>
        ) : null}
      />

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3"><DataImport agencyLinkSet={!!agencySheetId()} /></div>
        <Card className="xl:col-span-2">
          <CardHeader title="Your morning routine" description="About five minutes. Do steps 1–3 every day." />
          <CardBody className="pt-4">
            <ol className="space-y-4">
              <Step n={1} title="Download yesterday's search terms">
                In Google Ads, open <C>Campaigns › Insights and reports › Search terms</C>, set the date to <C>yesterday</C>, then <C>Download › CSV</C>.
              </Step>
              <Step n={2} title="Download the change history">
                Open <C>Tools › Change history</C>, choose the <C>last 7 days</C>, then <C>Download › CSV</C>.
              </Step>
              <Step n={3} title="Import">
                Press <C>Import new reports from Downloads</C> on this page. Every page updates by itself.
              </Step>
            </ol>
            <div className="mt-5 space-y-3 border-t pt-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">Once a week <Badge tone="info">weekly</Badge></div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  <C>Campaign report by day</C> with impression-share columns: in <C>Report editor</C>, make a table of Campaign, Day, Impr., Clicks, Cost, Conversions, Search impr. share, Search lost IS (budget) and Search lost IS (rank).
                  Also the <C>Search keywords</C> report with Quality Score, Ad relevance and Landing page exp. columns.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">Once a month <Badge tone="muted">monthly</Badge></div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground"><C>Auction insights</C> for the search campaigns, downloaded as CSV.</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Section title="What's loaded" description="Each source the dashboard reads, and the days it covers. Daily sources should reach yesterday.">
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Source</th>
              <th className="px-4 py-2.5 text-left font-medium">Days covered</th>
              <th className="px-4 py-2.5 text-left font-medium">How it arrives</th>
              <th className="px-4 py-2.5 text-left font-medium">How often</th>
              <th className="px-4 py-2.5 text-right font-medium">Status</th>
            </tr></thead>
            <tbody>
              {src.map((s) => (
                <tr key={s.name} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-4 py-2.5 tabular">
                    {drange(s.from, s.to) || <span className="text-muted-foreground">not loaded</span>}
                    {s.extra ? <span className="text-muted-foreground"> · {s.extra}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.how}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.cadence}</td>
                  <td className="px-4 py-2.5 text-right"><Badge tone={STATE_BADGE[s.state].tone}>{STATE_BADGE[s.state].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Explain>
          {m?.as_of ? <>Today is {dshort(m.as_of)}, so “Up to date” means the report reaches {dshort(dayBefore(m.as_of))}. </> : null}
          Weekly and monthly reports only need to be recent enough for the Campaigns, Keywords and Competitors pages; a missing one leaves those pages empty but does not break the daily checks.
        </Explain>
      </Section>

      <Section title="Files loaded" description={`${n0(files.length)} ${plural(files.length, "file")} read so far, newest first. Loading the same file twice never counts its rows twice.`}>
        <Card className="p-5">
          <FilesTable rows={files} />
          <Explain>Each row is one export. “Rows” is what was kept: a campaign report leaves out the day it was downloaded, because that day was not finished yet.</Explain>
        </Card>
      </Section>

      <Section title="Does the agency sheet match Google's report?"
        description={coverage.length
          ? (mismatch ? `${n0(mismatch)} of ${n0(coverage.length)} ${plural(coverage.length, "day")} do not match. On those days the cost in the sheet differs from the cost in Google's search terms report.` : `${n0(coverage.length)} of ${n0(coverage.length)} ${plural(coverage.length, "day")} match: the sheet covers all the money Google reports.`)
          : "Appears once both the search terms report and the agency sheet are loaded for the same days."}>
        <Card className="p-5">
          <CoverageTable rows={coverage} />
          <Explain>For each day, the searches in Google&apos;s search terms report next to the ones in the agency&apos;s STR sheet. When the cost does not match, the sheet is missing searches (or has extra ones), so its Add and Exclude calls do not cover all the money spent that day. When the cost matches, a small gap in rows is searches that cost nothing.</Explain>
        </Card>
      </Section>

      <Card className="mt-10 flex items-start gap-3 p-5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-good" />
        <div>
          <div className="text-sm font-medium">Your data stays on this computer</div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">Imported reports are saved as files in this folder. They leave it only when you run “Save data to GitHub”, and then only inside one file locked with your passphrase, so GitHub never sees the data itself. The only other outside request is downloading the agency&apos;s STR sheet from Google when you press “Refresh the agency sheet”.</p>
        </div>
      </Card>
    </>
  );
}
