import Link from "next/link";
import { Database } from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { drange, pct } from "@/lib/format";
import { Card, CardBody, CardHeader, EmptyState, Explain, PageHeader, ProjectTag, Section } from "@/components/ui";
import { AuctionTable, ShareBars } from "@/components/competitors-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Competitors" };

const TERMS: { term: string; text: string }[] = [
  { term: "Showed on our searches", text: "Of the searches where our ads could show, how often this advertiser's ad showed. For our own row, how often ours did." },
  { term: "Same auction as us", text: "When our ad showed, how often theirs showed on the same search." },
  { term: "Ad above ours", text: "When both showed, how often their ad sat higher on the page than ours." },
  { term: "Top of page", text: "How often their ad was in the top ads, above the normal search results." },
  { term: "We beat them", text: "How often our ad was above theirs, or ours showed and theirs did not." },
];

export default function CompetitorsPage() {
  const empty = (title: string, body: string) => (
    <>
      <PageHeader eyebrow="Performance" title="Competitors" description="Who else bids on the same searches as us, and how often they beat us." />
      <EmptyState icon={<Database className="size-8" />} title={title}>
        Open <Link href="/data" className="font-medium text-primary underline-offset-2 hover:underline">Import data</Link> and {body}
      </EmptyState>
    </>
  );
  if (!hasData()) return empty("No data yet", "load your Google Ads exports.");
  const m = getModel();
  const c = m.competitors;
  if (!c || !c.rows.length) return empty("No auction insights yet", "load the Google Ads auction insights report.");

  const range = drange(c.from, c.to);
  const us = c.rows.find((r) => r.domain === "You");
  const rivals = c.rows.filter((r) => r.domain !== "You");
  const topShare = [...rivals].filter((r) => r.impression_share !== null).sort((a, b) => (b.impression_share ?? 0) - (a.impression_share ?? 0))[0];
  const topAbove = [...rivals].filter((r) => r.position_above_rate !== null).sort((a, b) => (b.position_above_rate ?? 0) - (a.position_above_rate ?? 0))[0];
  const small = rivals.filter((r) => r.impression_share === null);

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Competitors"
        description={<>
          Google&apos;s auction insights, {range}: who else showed ads on the searches we bid on.
          {us ? <> Our ads showed on <b className="font-semibold text-foreground">{us.impression_share_raw || "–"}</b> of the searches we could enter.</> : null}
          {topShare ? <> The most frequent rival, <b className="font-semibold text-foreground">{topShare.domain}</b>, showed on {topShare.impression_share_raw || pct(topShare.impression_share, 1)}.</> : null}
        </>}
      />

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="How often each advertiser showed" description={`Share of our searches where their ad appeared, ${range}`} />
          <CardBody className="pt-3">
            <div className="mb-3 flex flex-wrap gap-4">
              <ProjectTag name="County Group (us)" color="var(--primary)" />
              <ProjectTag name="Property portal" color="var(--p-other)" />
              <ProjectTag name="Other developer" color="var(--info)" />
            </div>
            <ShareBars rows={c.rows} />
            <Explain>
              99acres and housing.com are property portals: they list many builders' projects, so they show up on many property searches. They are not a single rival project.
              {small.length ? <> Google shows only “&lt; 10%” for {small.map((r) => r.domain).join(", ")}, so they are in the table below but not in this chart.</> : null}
            </Explain>
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="What the columns mean" description="In plain words, from Google's definitions" />
          <CardBody className="pt-3">
            <dl className="divide-y">
              {TERMS.map((t) => (
                <div key={t.term} className="py-2.5 first:pt-0 last:pb-0">
                  <dt className="text-[13px] font-medium">{t.term}</dt>
                  <dd className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{t.text}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <Section title="Auction insights" description={`Every advertiser Google reported for our search campaigns, ${range}.`}>
        <AuctionTable rows={c.rows} />
        {topAbove ? (
          <Explain>
            The advertiser whose ad sat above ours most often was <b className="font-medium text-foreground">{topAbove.domain}</b> ({pct(topAbove.position_above_rate, 1)} of the searches where both showed).
            A high “ad above ours” with a high “same auction as us” means they bid on the same searches and usually win the better spot.
          </Explain>
        ) : null}
      </Section>

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        Data: auction insights {drange(m.data.auction?.from, m.data.auction?.to) || range}.
      </p>
    </>
  );
}
