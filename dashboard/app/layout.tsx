import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Shell, type ShellInfo } from "@/components/shell";
import { config, hasData, lastCompleteDay } from "@/lib/store";
import { dshort, pcolor } from "@/lib/format";
import { periodKey, periodModel } from "@/lib/period";
import { fixList, getLedger } from "@/lib/ledger";

export const metadata: Metadata = {
  title: { default: "County Search QC", template: "%s · County Search QC" },
  description: "Daily quality check of County Group's Google Ads search campaigns",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function shellInfo(): Promise<ShellInfo> {
  const key = await periodKey();
  if (!hasData()) return { projects: [], fresh: "No data loaded yet", issues: 0, hasData: false, period: { key, from: null, to: null, last: null } };
  const m = (await periodModel());
  // menu badges = sheet calls on the Fix list that are past the agency's deadline, overall and per project
  const led = getLedger();
  const overdue = led ? fixList(led).filter((f) => f.overdue) : [];
  const urgent = (id: string) => overdue.filter((f) => f.project === id).length;
  const ct = m.data.campaign_days?.complete_through;
  const st = m.data.search_terms?.to;
  const ch = String(config().changes_through ?? "");
  const fresh = [st ? `Search terms to ${dshort(st)}` : "", ch ? `change history to ${dshort(ch)}` : "", ct ? `campaigns to ${dshort(ct)}` : "Campaigns: not loaded"].filter(Boolean).join(" · ");
  return {
    projects: m.projects.map((p) => ({ id: p.id, name: p.name.replace(" County", ""), color: pcolor(p.id), urgent: urgent(p.id) })),
    fresh,
    // the menu badge is the number of rows on the Fix list (sheet up to its default day)
    issues: overdue.length,
    hasData: true,
    period: { key, from: m.windows.last7?.from ?? null, to: m.windows.last7?.to ?? null, last: lastCompleteDay() },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <Shell info={await shellInfo()}>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
