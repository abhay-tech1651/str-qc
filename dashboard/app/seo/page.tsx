import type { ReactNode } from "react";
import { seoSnapshot } from "@/lib/store";
import { n0 } from "@/lib/format";
import { StatCard } from "@/components/blocks";
import { Badge, Card, CardBody, CardHeader, EmptyState, Explain, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "SEO: Sep vs Oct" };

type Pair = [number, number];
interface LeadRow { source: string; q: number; dq: number; p: number; dup: number; blank: number; total: number }
interface Seo {
  months: [string, string];
  gsc: { clicks: Pair; impressions: Pair; position_roi: Pair; brand_clicks: Pair; nonbrand_clicks: Pair; county_group_clicks: Pair; cocoa_clicks: Pair };
  ga4: { sessions: Pair; users: Pair; engagement: Pair; roi_sessions: Pair; oct_key_events: Record<string, number>; oct_not_set_sessions: number; paid_search_sessions: Pair };
  leads: { total: Pair; oct_by_source: LeadRow[] };
}

const pc = (a: number, b: number) => (a ? ((b - a) / a) * 100 : 0);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const delta = ([a, b]: Pair) => ({ label: signed(pc(a, b)), dir: (b > a ? "up" : b < a ? "down" : "flat") as "up" | "down" | "flat" });
const qRate = (r: { q: number; dq: number; p: number }) => (r.q + r.dq + r.p ? (r.q / (r.q + r.dq + r.p)) * 100 : 0);

/** Two bars, September above October, scaled to the larger one. */
function Compare({ label, pair, months, note }: { label: ReactNode; pair: Pair; months: [string, string]; note?: ReactNode }) {
  const max = Math.max(pair[0], pair[1], 1);
  const d = pc(pair[0], pair[1]);
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Badge tone={d < 0 ? "warn" : d > 0 ? "good" : "muted"} className="tabular">{signed(d)}</Badge>
      </div>
      {pair.map((v, i) => (
        <div key={i} className="mt-1.5 flex items-center gap-3 text-xs">
          <span className="w-16 shrink-0 text-muted-foreground">{months[i].slice(0, 3)}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: i ? "var(--primary)" : "var(--muted-foreground)" }} />
          </div>
          <span className="w-14 shrink-0 text-right tabular">{n0(v)}</span>
        </div>
      ))}
      {note ? <p className="mt-1.5 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Step({ n, title, owner, children }: { n: number; title: string; owner: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{title}<Badge tone="muted">{owner}</Badge></div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

export default function SeoPage() {
  const s = seoSnapshot<Seo>();
  if (!s) {
    return (
      <>
        <PageHeader eyebrow="SEO" title="SEO: September vs October" />
        <EmptyState title="No SEO numbers on this computer yet">Open the locked data (start file) or ask Claude to pull Search Console and GA4.</EmptyState>
      </>
    );
  }
  const { months: m, gsc, ga4, leads } = s;
  const oct = leads.oct_by_source;
  const octQ = oct.reduce((a, r) => a + r.q, 0);
  const octQrate = qRate({ q: octQ, dq: oct.reduce((a, r) => a + r.dq, 0), p: oct.reduce((a, r) => a + r.p, 0) });
  const brandLost = gsc.brand_clicks[0] - gsc.brand_clicks[1];
  const nonbrandLost = gsc.nonbrand_clicks[0] - gsc.nonbrand_clicks[1];
  const formSent = ga4.oct_key_events["Thank-you pages (form sent)"] ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="SEO"
        title="SEO: September vs October 2026"
        description={<>
          Visits from Google search <b className="font-medium text-foreground">fell</b> in October: {n0(gsc.clicks[0])} clicks in September, {n0(gsc.clicks[1])} in October ({signed(pc(gsc.clicks[0], gsc.clicks[1]))}).
          Organic leads <b className="font-medium text-foreground">rose</b>: {leads.total[0]} to {leads.total[1]} ({signed(pc(leads.total[0], leads.total[1]))}).
        </>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clicks from Google search" value={n0(gsc.clicks[1])} sub={`${n0(gsc.clicks[0])} in September · Search Console`} delta={delta(gsc.clicks)} />
        <StatCard label="Visits from Google search" value={n0(ga4.sessions[1])} sub={`${n0(ga4.sessions[0])} in September · GA4 organic sessions`} delta={delta(ga4.sessions)} />
        <StatCard label="Organic leads" value={n0(leads.total[1])} sub={`${leads.total[0]} in September · CRM`} delta={delta(leads.total)} />
        <StatCard label="Qualified organic leads, October" value={n0(octQ)} sub={`${octQrate.toFixed(0)}% of October's leads with a status · September not split yet`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Where the traffic went" description="Search Console clicks. “Brand” = searches with County, Ivory, Clove, Cocoa, Jade, Ivy or Cleo in them." />
          <CardBody className="divide-y pt-4">
            <Compare label="All clicks" pair={gsc.clicks} months={m} />
            <Compare label="Brand searches" pair={gsc.brand_clicks} months={m} note={`Among Google's top 1,000 searches each month, brand searches lost ${n0(brandLost)} clicks and non-brand ${n0(nonbrandLost)}.`} />
            <Compare label="“county group” alone" pair={gsc.county_group_clicks} months={m} />
            <Compare label="Searches with “cocoa”" pair={gsc.cocoa_clicks} months={m} />
            <Compare label="Non-brand searches (new buyers)" pair={gsc.nonbrand_clicks} months={m} note="Only about 300 clicks a month: this is the part SEO has to grow." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Why leads went up while traffic went down" description="Facts only. What we cannot prove yet is marked." />
          <CardBody className="space-y-3 pt-4 text-[13px] leading-relaxed">
            <p><b className="font-medium">1. The traffic lost was mostly brand searches.</b> People typing “county group” already know us. Fewer of them reached the site through Google search, but this says little about new buyers.</p>
            <p><b className="font-medium">2. Most organic leads do not come through Google search forms.</b> The 93 leads are Direct ({oct[0]?.total}), WhatsApp ({oct[1]?.total}) and Chatbox ({oct[2]?.total}). GA4 saw only {formSent} enquiry forms sent from Google search visitors in October. So the lead count and the search traffic measure different things.</p>
            <p><b className="font-medium">3. Only {octQ} of October’s {leads.total[1]} leads were qualified ({octQrate.toFixed(0)}%).</b> WhatsApp leads were almost all disqualified (1 of {oct[1]?.total}).</p>
            <p className="text-muted-foreground"><b className="font-medium text-foreground">Not proven yet:</b> paid search visits rose from {n0(ga4.paid_search_sessions[0])} to {n0(ga4.paid_search_sessions[1])} in the same months. Our brand ads may be taking clicks that used to be organic. Worth checking before anyone draws a conclusion.</p>
          </CardBody>
        </Card>
      </div>

      <Section title="October organic leads by source" description="From the CRM lead status sheet. Qualified % = Q ÷ (Q + DQ + P); duplicates and blanks are left out of the rate.">
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              {["Source", "Leads", "Qualified", "Not qualified", "Duplicate", "Blank", "Qualified %"].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {oct.map((r) => (
                <tr key={r.source} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.source}</td>
                  {[r.total, r.q, r.dq, r.dup, r.blank].map((v, i) => <td key={i} className="px-4 py-2.5 text-right tabular">{v}</td>)}
                  <td className="px-4 py-2.5 text-right tabular">{qRate(r).toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-medium">
                <td className="px-4 py-2.5">Total</td>
                {(["total", "q", "dq", "dup", "blank"] as const).map((k) => <td key={k} className="px-4 py-2.5 text-right tabular">{oct.reduce((a, r) => a + r[k], 0)}</td>)}
                <td className="px-4 py-2.5 text-right tabular">{octQrate.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Explain>September’s split by source is not available yet; only the total (68) is.</Explain>
      </Section>

      <Section title="Next steps" description="In order. Each one answers a question your manager will ask.">
        <Card className="p-5">
          <ol className="space-y-4">
            <Step n={1} title="Tag every lead with where it came from" owner="County + AGO">
              Add the traffic source to the website forms, the chatbox and the WhatsApp button, so each CRM lead shows whether it came from Google search. Until then nobody can say how many leads SEO brought.
            </Step>
            <Step n={2} title="Check whether brand ads take organic clicks" owner="County">
              Compare paid and organic clicks on “county group” and the project names, day by day. If paid ads sit on top of our own free result, we pay for clicks we used to get free.
            </Step>
            <Step n={3} title="Put the Cocoa page live and link it from the site" owner="County">
              Searches mentioning Cocoa fell from {gsc.cocoa_clicks[0]} to {gsc.cocoa_clicks[1]} clicks. ROI says the Cocoa page is not linked from the website.
            </Step>
            <Step n={4} title="Ask ROI for a non-brand growth plan" owner="ROI">
              Non-brand clicks are about 300 a month. Big searches such as “flats in gurgaon” (9,900 a month) and “flats in greater noida” (4,400) are not in Google’s top 50 for us. Ask which ones they will target and by when.
            </Step>
            <Step n={5} title="Ask ROI why their GA4 numbers differ" owner="ROI">
              Their report shows {n0(ga4.roi_sessions[0])} → {n0(ga4.roi_sessions[1])} organic visits; GA4 shows {n0(ga4.sessions[0])} → {n0(ga4.sessions[1])}. Search Console numbers match theirs exactly.
            </Step>
            <Step n={6} title="Fix the untracked visits" owner="AGO">
              {n0(ga4.oct_not_set_sessions)} organic visits in October have no landing page in GA4, so we cannot see what they read.
            </Step>
          </ol>
        </Card>
      </Section>

      <Explain>
        Sources: Google Search Console and GA4 (organic search), pulled 12 Nov 2026 for 1–30 Sep and 1–31 Oct; organic leads from the CRM (September total only).
        Search Console clicks and impressions ({n0(gsc.impressions[0])} → {n0(gsc.impressions[1])}) match ROI’s October report exactly. Brand and non-brand split uses Google’s top 1,000 searches each month.
      </Explain>
    </>
  );
}
