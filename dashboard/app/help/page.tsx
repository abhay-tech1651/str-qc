import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowUpRight, BookOpen, ClipboardCheck, Database, FolderKanban, KeyRound, LayoutDashboard, Megaphone, Search, Swords,
} from "lucide-react";
import { getModel, hasData } from "@/lib/store";
import { n0, pcolor } from "@/lib/format";
import { MONEY_KIND, SEVERITY } from "@/lib/fixes";
import { Badge, Button, Card, CardHeader, PageHeader, ProjectTag, Section } from "@/components/ui";
import { periodData, periodModel } from "@/lib/period";

export const dynamic = "force-dynamic";
export const metadata = { title: "How to read this" };

type Tone = "bad" | "warn" | "good" | "info" | "muted";

const PAGES: { href: string; name: string; icon: typeof LayoutDashboard; q: string }[] = [
  { href: "/", name: "Overview", icon: LayoutDashboard, q: "How did search ads do in the last 7 days, and what needs attention first?" },
  { href: "/issues", name: "Issues to fix", icon: AlertTriangle, q: "What is wrong, how much money does it touch, and who fixes it: the agency, County or Google's CTM team?" },
  { href: "/agency", name: "Said vs done", icon: ClipboardCheck, q: "Did the agency actually make the changes its own STR sheet says it would?" },
  { href: "/search-terms", name: "Search terms", icon: Search, q: "What did people type before clicking our ads, and what did the agency decide about each search?" },
  { href: "/campaigns", name: "Campaigns", icon: Megaphone, q: "Is each campaign spending its budget, and on how many of the possible searches can it show?" },
  { href: "/keywords", name: "Keywords", icon: KeyRound, q: "Which keywords spend without conversions, sit on weak landing pages or have a low Quality Score?" },
  { href: "/competitors", name: "Competitors", icon: Swords, q: "Who else bids on the same searches, and how often do they appear above us?" },
  { href: "/data", name: "Import data", icon: Database, q: "Is today's data loaded, and does the agency sheet match Google's report?" },
];

function Term({ name, badge, children }: { name: ReactNode; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{badge ?? name}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function Swatch({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      <span className="h-2.5 w-5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

const RULES: { tone: Tone; label: string; rule: string; means: string }[] = [
  { tone: "muted", label: "Not spending", rule: "No spend in the last 7 days.", means: "The campaign is paused, out of budget or not eligible. Check that this is on purpose." },
  { tone: "muted", label: "Uses X% of budget", rule: "Spent under 30% of its daily budget on an average day.", means: "Most of the daily budget goes unused, so raising it would change nothing." },
  { tone: "warn", label: "Held back by budget", rule: "Missed 20% or more of its possible searches because the budget ran out.", means: "The only status that more budget can fix, if the campaign's cost per conversion is good." },
  { tone: "bad", label: "Losing auctions", rule: "Missed 40% or more of its possible searches on rank, or shown on fewer than 10% of them.", means: "Bid or quality is too low to win. More budget does not fix this." },
  { tone: "warn", label: "Missing brand searches", rule: "A brand campaign shown on under 80% of the searches it could have appeared on.", means: "People searching for County by name may see a competitor or a portal first." },
  { tone: "good", label: "Healthy", rule: "None of the above.", means: "Nothing in the delivery numbers needs action this week." },
];

export default async function HelpPage() {
  const m = hasData() ? (await periodModel()) : null;
  const grace = m?.agency.grace_days;
  const graceText = typeof grace === "number" ? `${n0(grace)} ${grace === 1 ? "day" : "days"}` : "a few days";

  return (
    <>
      <PageHeader
        eyebrow="Help"
        title="How to read this"
        description="Every number comes from Google Ads exports, the agency's STR sheet and the account's change history. Nothing is typed in by hand. This page explains the words and colours the other pages use."
        actions={<Button asChild variant="outline"><a href="/handbook" target="_blank" rel="noopener noreferrer"><BookOpen /> Open the County Search Ads Handbook <ArrowUpRight /></a></Button>}
      />

      <Section title="What each page answers" description="Pick the page by the question you have.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="group">
              <Card className="h-full p-5 transition-colors group-hover:bg-muted/40">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground"><p.icon className="size-4" /></span>
                  <span className="text-sm font-semibold">{p.name}</span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{p.q}</p>
              </Card>
            </Link>
          ))}
          <Card className="h-full p-5 sm:col-span-2 xl:col-span-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground"><FolderKanban className="size-4" /></span>
              <span className="text-sm font-semibold">Project pages</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">The same checks for one project at a time: its spend, campaigns, agency calls and issues.</p>
            {m?.projects.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">
                    <ProjectTag name={p.name} color={pcolor(p.id)} className="text-[13px] text-foreground" />
                  </Link>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      </Section>

      <Section title="The words used" description="The same word means the same thing on every page.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Leads and conversions" description="Google's count is not the sales team's count." />
            <div className="divide-y px-5 pb-5 pt-4">
              <Term name="Google conversion">A lead form or call that Google Ads counted after an ad click. It is what the campaigns are judged and bid on, but Google cannot tell a real buyer from a wrong number.</Term>
              <Term name="CRM lead">A lead the sales team records in the CRM. This dashboard does not read the CRM, so every “conversion” here is Google&apos;s count, not qualified leads.</Term>
              <Term name="All conversions">Google also counts smaller actions here. When a campaign has at least 20 of them and more than 5 times its conversions, it is flagged: its numbers look better than its real leads.</Term>
            </div>
          </Card>

          <Card>
            <CardHeader title="Agency calls and what happened to them" description="From the agency's STR sheet, checked against the Google Ads change history." />
            <div className="divide-y px-5 pb-5 pt-4">
              <Term name="Exclude call">The sheet marks a search as junk: it should be blocked with a negative keyword. An <b className="font-medium text-foreground">Add call</b> marks a good search that should become a keyword.</Term>
              <Term name="Applied" badge={<Badge tone="good">Applied</Badge>}>A negative that blocks the search appears in the change history, from the day before the sheet day onwards. Blocked in the same campaign but a different ad group also counts.</Term>
              <Term name="Never applied" badge={<Badge tone="bad">Never applied</Badge>}>More than {graceText} have passed between the sheet day and the latest change history loaded, and nothing blocks the search. It can keep costing money.</Term>
              <Term name="Waiting" badge={<Badge tone="info">Waiting</Badge>}>No more than {graceText} have passed between the sheet day and the latest change history loaded. The agency still has time, so it is not counted against them yet.</Term>
              <Term name="Not checked" badge={<Badge tone="muted">Not checked</Badge>}>The change history loaded here does not reach back to that sheet day, so the call cannot be judged. Import an older change history to check it.</Term>
            </div>
          </Card>

          <Card>
            <CardHeader title="Can it show?" description="A slim bar on the campaign pages." />
            <div className="px-5 pb-5 pt-4">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="w-1/2" style={{ background: "var(--shown)" }} />
                <div className="w-1/5" style={{ background: "var(--lost-budget)" }} />
                <div className="w-[30%]" style={{ background: "var(--lost-rank)" }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                <Swatch color="var(--shown)">Shown</Swatch>
                <Swatch color="var(--lost-budget)">Missed: budget ran out</Swatch>
                <Swatch color="var(--lost-rank)">Missed: lost the auction</Swatch>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                Of all the searches a campaign could have appeared on, how many it was shown on, and why it missed the rest. Losing the auction means the bid times quality was too low. More budget only shrinks the budget part.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Quality Score" description="Google's rating of each keyword, from 1 to 10." />
            <div className="divide-y px-5 pb-5 pt-4">
              <Term name="Quality Score">Built from three parts: expected clicks, ad relevance and landing page experience. A low score means paying more per click and showing less often. Scores of 1–3 are the ones to act on.</Term>
              <Term name="Ad relevance and Landing page exp.">Each part is rated Above average, Average or Below average. “Below average” on the landing page usually means the page does not match what the search asked for, or is slow.</Term>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Labels on every issue" description="Each issue carries a severity and, when it involves money, one of three money labels.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="How urgent" />
            <div className="divide-y px-5 pb-5 pt-4">
              <Term name="high" badge={<Badge tone={SEVERITY.high.tone}>{SEVERITY.high.label}</Badge>}>Money is being lost now. Raise it with the agency or fix it this week.</Term>
              <Term name="medium" badge={<Badge tone={SEVERITY.medium.tone}>{SEVERITY.medium.label}</Badge>}>A set-up problem. Put it on the list for the next review with the agency.</Term>
              <Term name="low" badge={<Badge tone={SEVERITY.low.tone}>{SEVERITY.low.label}</Badge>}>A choice the data cannot make for you. Decide, then tell the agency.</Term>
            </div>
          </Card>
          <Card>
            <CardHeader title="What the money means" />
            <div className="divide-y px-5 pb-5 pt-4">
              <Term name={MONEY_KIND.wasted}>“{MONEY_KIND.wasted}”: money already paid for searches we do not want.</Term>
              <Term name={MONEY_KIND.affected}>“{MONEY_KIND.affected}”: money exposed to the problem. Not all of it is waste.</Term>
              <Term name={MONEY_KIND.misrouted}>“{MONEY_KIND.misrouted}”: wanted searches, but paid at another campaign&apos;s price and counted in its numbers.</Term>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="How a campaign gets its status" description="Worked out from the last 7 days. The rules are checked from top to bottom, and the first one that fits is the status shown.">
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">When</th>
              <th className="px-4 py-2.5 text-left font-medium">What it means</th>
            </tr></thead>
            <tbody>
              {RULES.map((r) => (
                <tr key={r.label} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3"><Badge tone={r.tone}>{r.label}</Badge></td>
                  <td className="px-4 py-3">{r.rule}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.means}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-medium">The full guide</div>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">How Google Ads search works, the STR routine and worked County examples are in the handbook.</p>
          </div>
        </div>
        <Button asChild><a href="/handbook" target="_blank" rel="noopener noreferrer">Open the County Search Ads Handbook <ArrowUpRight /></a></Button>
      </Card>
    </>
  );
}
