"use client";
/** Said vs done: the seven lists behind the numbers, one tab each. The open tab is kept in the address (?tab=). */
import * as React from "react";
import { Badge, Explain, ProjectTag, Tabs, TabsContent, TabsList, TabsTrigger } from "./ui";
import { DataTable, type Column } from "./data-table";
import { CallEvidence, type EvidenceCall } from "./call-evidence";
import { cn, dshort, inr, n0, n1, pcolor } from "@/lib/format";
import type { AddRow, Agency, CallRow, Risks } from "@/lib/types";

export const AGENCY_TABS = ["excludes", "adds", "nonegative", "risky", "blocked", "conflicts", "leaks"] as const;
export type AgencyTab = (typeof AGENCY_TABS)[number];

type ProjectInfo = { id: string; name: string };
type Rec<T> = T & Record<string, unknown>;
const rec = <T,>(rows: T[]) => rows as unknown as Rec<T>[];

function Code({ children }: { children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return <span className="text-muted-foreground">–</span>;
  return <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[12px]">{children}</code>;
}

const WHY: Record<string, string> = { bare_number: "a bare number", common_word: "one common word", common_pair: "two common words" };

const STATUS: Record<string, { label: string; tone: "good" | "info" | "muted" | "bad" | "outline" }> = {
  applied: { label: "applied anyway", tone: "good" },
  applied_elsewhere: { label: "applied elsewhere", tone: "info" },
  waiting: { label: "waiting", tone: "muted" },
  overdue: { label: "not applied", tone: "bad" },
  unchecked: { label: "not checked", tone: "outline" },
};

export function AgencyTabs({ initialTab, agency, risks, labels, projects }: {
  initialTab: AgencyTab; agency: Agency; labels: Record<string, string>; projects: ProjectInfo[];
  risks: Pick<Risks, "risky" | "blocked" | "conflicts" | "leaks">;
}) {
  const [tab, setTab] = React.useState<AgencyTab>(initialTab);
  const pname = React.useCallback((id: string) => projects.find((p) => p.id === id)?.name ?? "Other", [projects]);
  const label = React.useCallback((c: string) => labels[c] ?? c, [labels]);
  const [call, setCall] = React.useState<EvidenceCall | null>(null);
  const openEx = (r: CallRow) => setCall({ term: r.term, day: r.day, campaign: r.campaign, ad_group: r.ad_group, cost: r.cost, neg_term: r.neg_term, kind: "exclude" });
  const openAdd = (r: AddRow) => setCall({ term: r.term, day: r.day, campaign: r.campaign, ad_group: r.ad_group, cost: r.cost, kind: "add" });

  const onTab = (v: string) => {
    const t = (AGENCY_TABS as readonly string[]).includes(v) ? (v as AgencyTab) : "excludes";
    setTab(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState(null, "", url.pathname + url.search);
    } catch { /* address bar not writable: the tab still switches */ }
  };

  /* shared columns */
  const dayCol = <T extends { day: string }>(): Column<Rec<T>> => ({ key: "day", label: "Sheet day", width: "84px", render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.day)}</span>, value: (r) => r.day });
  const projCol = <T extends { project: string }>(): Column<Rec<T>> => ({ key: "project", label: "Project", render: (r) => <ProjectTag name={pname(r.project)} color={pcolor(r.project)} />, value: (r) => pname(r.project) });
  const campCol = <T extends { campaign: string; ad_group: string }>(title = "Campaign"): Column<Rec<T>> => ({
    key: "campaign", label: title,
    render: (r) => (
      <div className="min-w-[160px]">
        <div className="text-[13px]">{label(r.campaign)}</div>
        {r.ad_group ? <div className="mt-0.5 text-xs text-muted-foreground">{r.ad_group}</div> : null}
      </div>
    ),
    value: (r) => [label(r.campaign), r.ad_group].filter(Boolean).join(" · "),
  });
  const termCol = <T extends { term: string }>(): Column<Rec<T>> => ({ key: "term", label: "Search term", render: (r) => <div className="min-w-[180px] font-medium">{r.term}</div>, value: (r) => r.term });
  const costCol = <T extends { cost: number }>(): Column<Rec<T>> => ({ key: "cost", label: "Cost", align: "right", render: (r) => inr(r.cost), value: (r) => r.cost });
  const commentCol = <T extends { county_comment: string }>(): Column<Rec<T>> => ({ key: "county_comment", label: "County comment", render: (r) => r.county_comment ? <span className="text-[13px]">{r.county_comment}</span> : <span className="text-muted-foreground">–</span>, value: (r) => r.county_comment });

  const excludeCols: Column<Rec<CallRow>>[] = [dayCol(), projCol(), termCol(), campCol(), costCol(),
    { key: "neg_term", label: "Negative written", render: (r) => <Code>{r.neg_term}</Code>, value: (r) => r.neg_term }, commentCol()];

  const addCols: Column<Rec<AddRow>>[] = [dayCol(), projCol(), termCol(), campCol(),
    { key: "clicks", label: "Clicks", align: "right", render: (r) => n0(r.clicks), value: (r) => r.clicks }, costCol(),
    { key: "conv", label: "Conv.", align: "right", render: (r) => n1(r.conv), value: (r) => r.conv }];

  const noNegCols: Column<Rec<CallRow>>[] = [dayCol(), projCol(), termCol(), campCol(), costCol(),
    { key: "status", label: "What happened", render: (r) => { const s = STATUS[r.status] ?? { label: r.status || "–", tone: "muted" as const }; return <Badge tone={s.tone}>{s.label}</Badge>; }, value: (r) => STATUS[r.status]?.label ?? r.status },
    commentCol()];

  type Risky = Risks["risky"][number];
  const riskyCols: Column<Rec<Risky>>[] = [projCol(), campCol(),
    { key: "item", label: "Negative", render: (r) => <Code>{r.item}</Code>, value: (r) => r.item },
    { key: "why", label: "Why it is risky", render: (r) => <Badge tone="warn">{WHY[r.why] ?? r.why}</Badge>, value: (r) => WHY[r.why] ?? r.why },
    { key: "added", label: "Added", render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.added) || "–"}</span>, value: (r) => r.added },
    { key: "added_by", label: "Added by", render: (r) => <span className="text-[13px] text-muted-foreground">{r.added_by || "–"}</span>, value: (r) => r.added_by }];

  type Blocked = Risks["blocked"][number];
  const blockedCols: Column<Rec<Blocked>>[] = [projCol(), campCol(),
    { key: "keyword", label: "Our keyword", render: (r) => <span className="font-medium">{r.keyword}</span>, value: (r) => r.keyword },
    { key: "blocked_by", label: "Blocked by", render: (r) => <Code>{r.blocked_by}</Code>, value: (r) => r.blocked_by },
    { key: "level", label: "Level", render: (r) => <span className="text-[13px]">{r.level === "campaign" ? "whole campaign" : r.level === "ad group" || r.level === "ad_group" ? "ad group" : r.level || "–"}</span>, value: (r) => r.level },
    { key: "added", label: "Added", render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.added) || "–"}</span>, value: (r) => r.added },
    { key: "added_by", label: "Added by", render: (r) => <span className="text-[13px] text-muted-foreground">{r.added_by || "–"}</span>, value: (r) => r.added_by }];

  type Conflict = Risks["conflicts"][number];
  const conflictCols: Column<Rec<Conflict>>[] = [dayCol(), projCol(),
    { key: "campaign", label: "Campaign", render: (r) => <span className="text-[13px]">{label(r.campaign)}</span>, value: (r) => label(r.campaign) },
    { key: "negative", label: "Negative asked for", render: (r) => <Code>{r.negative}</Code>, value: (r) => r.negative },
    { key: "written_for", label: "Written for the search", render: (r) => <span className="text-[13px]">{r.written_for}</span>, value: (r) => r.written_for },
    { key: "would_block", label: "Add searches it would block", align: "right", render: (r) => n0(r.would_block), value: (r) => r.would_block },
    { key: "example", label: "For example", render: (r) => <span className="font-medium">{r.example}</span>, value: (r) => r.example }];

  type Leak = Risks["leaks"][number];
  const leakCols: Column<Rec<Leak>>[] = [projCol(), campCol(),
    { key: "negative", label: "Negative", render: (r) => <Code>{r.negative}</Code>, value: (r) => r.negative },
    { key: "added", label: "Added", render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.added) || "–"}</span>, value: (r) => r.added },
    { key: "later_rows", label: "Searches after", align: "right", render: (r) => n0(r.later_rows), value: (r) => r.later_rows },
    { key: "later_cost", label: "Cost after", align: "right", render: (r) => inr(r.later_cost), value: (r) => r.later_cost },
    { key: "example", label: "For example", render: (r) => <span className="font-medium">{r.example}</span>, value: (r) => r.example },
    { key: "last_seen", label: "Last seen", render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.last_seen) || "–"}</span>, value: (r) => r.last_seen }];

  const tabs: { id: AgencyTab; label: string; count: number; bad?: boolean }[] = [
    { id: "excludes", label: "Never applied", count: agency.overdue_excludes.length, bad: true },
    { id: "adds", label: "Adds never added", count: agency.overdue_adds.length, bad: true },
    { id: "nonegative", label: "No negative written", count: agency.no_negative_rows.length },
    { id: "risky", label: "Risky negatives", count: risks.risky.length },
    { id: "blocked", label: "Keywords blocked", count: risks.blocked.length },
    { id: "conflicts", label: "Sheet contradicts itself", count: risks.conflicts.length },
    { id: "leaks", label: "Came back", count: risks.leaks.length },
  ];

  const Lead = ({ children }: { children: React.ReactNode }) => <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{children}</p>;

  return (
    <Tabs value={tab} onValueChange={onTab}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className="h-auto flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
              <span className={cn("rounded-full px-1.5 text-[11px] tabular", t.count && t.bad ? "bg-bad-soft text-bad" : "bg-background text-muted-foreground")}>{n0(t.count)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="excludes">
        <Lead>Searches the agency marked Exclude in its sheet, where no matching negative appeared in Google Ads within {agency.grace_days} days. Nothing stops these searches coming back.</Lead>
        <DataTable rows={rec(agency.overdue_excludes)} columns={excludeCols} csvName="exclude-calls-never-applied" onRowClick={openEx} initialSort={{ key: "cost", dir: "desc" }}
          empty="Every Exclude call that could be checked was applied." />
        <Explain>Cost is what the search cost on the day it was reviewed. Click any row to see where a matching negative was added (and in which campaign), and whether the search came back. Send this list to the agency: each row needs the negative applied, or a reason why not.</Explain>
      </TabsContent>

      <TabsContent value="adds">
        <Lead>Good searches the agency marked Add, which never became a keyword in Google Ads within {agency.grace_days} days.</Lead>
        <DataTable rows={rec(agency.overdue_adds)} columns={addCols} csvName="add-calls-never-added" onRowClick={openAdd} initialSort={{ key: "cost", dir: "desc" }}
          empty="Every Add call that could be checked was added." />
        <Explain>The agency&apos;s own sheet says these searches should be keywords. Ask for them to be added, or for the sheet to be changed.</Explain>
      </TabsContent>

      <TabsContent value="nonegative">
        <Lead>Rows marked Exclude where the Negative column is empty, so whoever applies it has to guess the words and match type. {agency.no_negative.open ? `${n0(agency.no_negative.open)} of them are still open.` : ""}</Lead>
        <DataTable rows={rec(agency.no_negative_rows)} columns={noNegCols} csvName="exclude-rows-without-negative" onRowClick={openEx} initialSort={{ key: "cost", dir: "desc" }}
          empty="Every Exclude row has its negative written." />
        <Explain>“Applied anyway” means a matching negative went in even though the sheet did not say which. A guessed broad negative can block good searches, so the column should always be filled.</Explain>
      </TabsContent>

      <TabsContent value="risky">
        <Lead>Negatives that apply to a whole campaign and are a bare number or very common words. One of these can switch off hundreds of good searches.</Lead>
        <DataTable rows={rec(risks.risky)} columns={riskyCols} csvName="risky-campaign-negatives" empty="No risky campaign-wide negatives found." />
        <Explain>A bare <Code>-62</Code> also blocks “₹62 lakh” and “sector 62”. Replace each with the exact phrase that was junk.</Explain>
      </TabsContent>

      <TabsContent value="blocked">
        <Lead>Keywords we pay to target that can never show, because one of our own negatives blocks them. A negative always wins over a keyword.</Lead>
        <DataTable rows={rec(risks.blocked)} columns={blockedCols} csvName="keywords-blocked-by-our-negatives" empty="None of our keywords is blocked by our own negatives." />
        <Explain>Remove the negative, or move it to the ad group where it belongs, so the keyword can show again.</Explain>
      </TabsContent>

      <TabsContent value="conflicts">
        <Lead>Negatives the sheet asks for that would also block searches the same sheet says to Add, in the same campaign.</Lead>
        <DataTable rows={rec(risks.conflicts)} columns={conflictCols} csvName="sheet-contradictions" empty="The sheet does not contradict itself." />
        <Explain>Applied as written, each negative would undo the agency&apos;s own Add calls. The negative needs narrower words or an exact match.</Explain>
      </TabsContent>

      <TabsContent value="leaks">
        <Lead>Searches that still got clicks after a negative that should have blocked them went in.</Lead>
        <DataTable rows={rec(risks.leaks)} columns={leakCols} csvName="searches-after-negative" initialSort={{ key: "later_cost", dir: "desc" }} empty="No search came back after its negative." />
        <Explain>By the match rules these searches should have been blocked from the day after the negative went in. Check in Google Ads that the negative is still in place and where it sits.</Explain>
      </TabsContent>
      <CallEvidence call={call} onClose={() => setCall(null)} label={label} />
    </Tabs>
  );
}
