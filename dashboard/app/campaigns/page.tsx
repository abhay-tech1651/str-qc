import Link from "next/link";
import { Database } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { drange, dshort, lakh, n1, inr } from "@/lib/format";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Section } from "@/components/ui";
import { CampaignsView } from "@/components/campaigns-view";
import { periodData, periodModel } from "@/lib/period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

const RULES: { tone: "warn" | "bad" | "muted" | "good"; label: string; rule: string }[] = [
  { tone: "muted", label: "Not spending", rule: "No spend at all in the period shown." },
  { tone: "muted", label: "Uses N% of budget", rule: "Spent less than 30% of its daily budget. It is not finding enough searches." },
  { tone: "warn", label: "Held back by budget", rule: "Missed 20% or more of the searches it could show on because the budget ran out." },
  { tone: "bad", label: "Losing auctions", rule: "Missed 40% or more because other ads won (bid or ad quality), or showed on under 10%." },
  { tone: "warn", label: "Missing brand searches", rule: "A brand campaign that showed on less than 80% of searches for our own name." },
  { tone: "good", label: "Healthy", rule: "None of the above." },
];

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (!hasData()) {
    return (
      <>
        <PageHeader eyebrow="Performance" title="Campaigns" description="Every search campaign: what it costs, what it brings and whether it can show." />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">
          Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link> and load a campaign report.
        </EmptyState>
      </>
    );
  }
  const m = (await periodModel());
  const pn = m.period?.name ?? "the last 7 days", pp = m.period?.prev ?? "the 7 days before", pns = pn.replace(/^the /, "");
  const w = m.windows;
  const a = m.account;
  const hasCamp = m.campaigns.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Campaigns"
        description={hasCamp
          ? <>All {m.campaigns.length} search campaigns. Status and “can it show?” look at {pn} ({drange(w.last7?.from, w.last7?.to)}); money and conversions add up everything since {dshort(w.since?.from)} ({drange(w.since?.from, w.since?.to)}): <b className="font-semibold text-foreground">{lakh(a.since.cost)}</b> for <b className="font-semibold text-foreground">{n1(a.since.conv)}</b> Google conversions at <b className="font-semibold text-foreground">{inr(a.since.cpa)}</b> each.</>
          : <>Spend, conversions and status appear once a campaign report is imported.</>}
      />

      {hasCamp ? (
        <CampaignsView campaigns={m.campaigns} projects={m.projects} windows={w} initialProject={one(sp.project) ?? "all"} initialCampaign={one(sp.campaign)} />
      ) : (
        <EmptyState icon={<Database className="size-8" />} title="No campaign report yet">
          Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link> and load the Google Ads campaign report.
        </EmptyState>
      )}

      <Section title="How to read this page" description="The status is worked out from the period chosen at the top (normally the last 7 days), checking the rules in this order. The first one that fits is shown.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Status rules" description="Based on Google's impression share: of all the searches a campaign could have shown on, how many it did." />
            <CardBody className="pt-3">
              <ul className="divide-y">
                {RULES.map((r) => (
                  <li key={r.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                    <Badge tone={r.tone} className="w-44 justify-center">{r.label}</Badge>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">{r.rule}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Which conversions count" />
            <CardBody className="space-y-3 pt-3 text-[13px] leading-relaxed text-muted-foreground">
              <p><b className="font-semibold text-foreground">Google conversions</b> are the actions set as main conversions in Google Ads, the ones its bidding aims for. They are not the qualified leads in the CRM.</p>
              <p><b className="font-semibold text-foreground">All conv.</b> adds every other action Google tracks (secondary actions). When it is far above Google conversions, do not quote it as leads.</p>
              <p><b className="font-semibold text-foreground">Cost/conv.</b> is spend divided by Google conversions. <b className="font-semibold text-foreground">Avg click</b> is spend divided by clicks.</p>
            </CardBody>
          </Card>
        </div>
      </Section>

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        Data: campaign report {drange(m.data.campaign_days?.from, m.data.campaign_days?.complete_through) || "not imported"}. Today is left out until its data is complete.
      </p>
    </>
  );
}
