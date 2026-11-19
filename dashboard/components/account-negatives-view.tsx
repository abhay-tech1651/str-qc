"use client";
/**
 * Every negative in the account today (Google Ads' negative keyword report): what blocks our own keywords or searches
 * that converted, the one-word negatives, whether each Exclude call in the sheet is blocked today, and Adds that a
 * negative still blocks. Filters: project and level.
 */
import * as React from "react";
import { Badge, Card, CardHeader, Explain, ProjectTag, Segmented, Select, Sheet, Tabs, TabsContent, TabsList, TabsTrigger } from "./ui";
import { StatCard } from "./blocks";
import { DataTable, type Column } from "./data-table";
import { dshort, inr, n0, pcolor } from "@/lib/format";
import type { InvAnalysis, InvCall, InvRisk, InvAddConflict, InvCampaign } from "@/lib/neg-inventory-core";

type Rec<T> = T & Record<string, unknown>;
const rec = <T,>(rows: T[]) => rows as unknown as Rec<T>[];
type OneWord = InvAnalysis["one_word"][number];

const IN_ACCOUNT: Record<string, { label: string; tone: "good" | "info" | "bad" }> = {
  blocked_here: { label: "blocked today", tone: "good" },
  blocked_other_ad_group: { label: "blocked in another ad group only", tone: "info" },
  not_found: { label: "not blocked today", tone: "bad" },
};

function Code({ children }: { children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return <span className="text-muted-foreground">–</span>;
  return <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[12px]">{children}</code>;
}

export function AccountNegativesView({ data, labels, projects }: { data: InvAnalysis; labels: Record<string, string>; projects: { id: string; name: string }[] }) {
  const pname = React.useCallback((id: string) => projects.find((p) => p.id === id)?.name ?? "Other", [projects]);
  const label = React.useCallback((c: string) => labels[c] ?? c, [labels]);
  const [project, setProject] = React.useState("all");
  const [level, setLevel] = React.useState<"all" | "campaign" | "ad group">("campaign");
  const [open, setOpen] = React.useState<InvRisk | null>(null);
  const inP = (p: string) => project === "all" || p === project;
  const inL = (l: string) => level === "all" || l === level;

  const risky = data.risky.filter((r) => inP(r.project) && inL(r.level));
  const oneWord = data.one_word.filter((r) => inP(r.project) && inL(r.level));
  const calls = data.calls.filter((r) => inP(r.project));
  const adds = data.add_conflicts.filter((r) => inP(r.project) && inL(r.by_level));
  const camps = data.campaigns.filter((r) => inP(r.project));
  const notFound = calls.filter((c) => c.in_account === "not_found");
  const kwBlocked = risky.reduce((s, r) => s + r.keywords.length, 0);

  const projCol = <T extends { project: string }>(): Column<Rec<T>> => ({ key: "project", label: "Project", render: (r) => <ProjectTag name={pname(r.project)} color={pcolor(r.project)} />, value: (r) => pname(r.project) });
  const campCol = <T extends { campaign: string; ad_group: string }>(): Column<Rec<T>> => ({
    key: "campaign", label: "Campaign · ad group",
    render: (r) => <div className="min-w-[150px]"><div className="text-[13px]">{label(r.campaign)}</div><div className="mt-0.5 text-xs text-muted-foreground">{r.ad_group || "whole campaign"}</div></div>,
    value: (r) => [label(r.campaign), r.ad_group || "whole campaign"].join(" · "),
  });
  const added = <T extends { added_on: string; added_by: string }>(): Column<Rec<T>> => ({
    key: "added_on", label: "Added", render: (r) => r.added_on ? <div className="whitespace-nowrap text-[13px]">{dshort(r.added_on)}<div className="text-xs text-muted-foreground">{r.added_by}</div></div> : <span className="text-xs text-muted-foreground">before 1 Oct</span>,
    value: (r) => r.added_on ? `${r.added_on} ${r.added_by}` : "before 1 Oct",
  });

  const riskCols: Column<Rec<InvRisk>>[] = [
    { key: "text", label: "Negative", render: (r) => <Code>{r.text}</Code>, value: (r) => r.text },
    projCol<InvRisk>(), campCol<InvRisk>(), added<InvRisk>(),
    { key: "keywords", label: "Our keywords it blocks", align: "right", render: (r) => r.keywords.length ? <span className="font-medium text-bad">{r.keywords.length}</span> : "–", value: (r) => r.keywords.length },
    { key: "conv", label: "Converting searches it blocks", align: "right", render: (r) => r.conv ? <span className="font-medium text-[color:var(--warn)]">{r.conv_searches.length} ({r.conv} conv.)</span> : "–", value: (r) => r.conv },
    { key: "example", label: "Example", render: (r) => <span className="text-[13px] text-muted-foreground">{r.keywords[0] ?? r.conv_searches[0]?.term ?? ""}</span>, value: (r) => r.keywords[0] ?? r.conv_searches[0]?.term ?? "" },
  ];
  const oneCols: Column<Rec<OneWord>>[] = [
    { key: "text", label: "Negative", render: (r) => <Code>{r.text}</Code>, value: (r) => r.text },
    { key: "match", label: "Match", value: (r) => r.match },
    projCol<OneWord>(), campCol<OneWord>(), added<OneWord>(),
    { key: "keywords", label: "Keywords it blocks", align: "right", render: (r) => r.keywords ? <span className="font-medium text-bad">{r.keywords}</span> : "–", value: (r) => r.keywords },
    { key: "conv", label: "Conv. searches it blocks", align: "right", render: (r) => r.conv ? <span className="font-medium text-[color:var(--warn)]">{r.conv}</span> : "–", value: (r) => r.conv },
  ];
  const callCols: Column<Rec<InvCall>>[] = [
    { key: "day", label: "Sheet day", render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.day)}</span>, value: (r) => r.day },
    projCol<InvCall>(),
    { key: "term", label: "Search term", render: (r) => <span className="font-medium">{r.term}</span>, value: (r) => r.term },
    campCol<InvCall>(),
    { key: "cost", label: "Cost", align: "right", render: (r) => inr(r.cost), value: (r) => r.cost },
    { key: "written", label: "Sheet wrote", render: (r) => <Code>{r.written}</Code>, value: (r) => r.written },
    { key: "in_account", label: "In the account today", render: (r) => <Badge tone={IN_ACCOUNT[r.in_account].tone}>{IN_ACCOUNT[r.in_account].label}</Badge>, value: (r) => IN_ACCOUNT[r.in_account].label },
    { key: "by", label: "Blocked by", render: (r) => r.by ? <div><Code>{r.by}</Code><div className="mt-0.5 text-xs text-muted-foreground">{r.by_level === "campaign" ? "whole campaign" : `ad group: ${r.by_ad_group}`}</div></div> : r.lists.length ? <span className="text-xs text-muted-foreground">maybe in a shared list ({r.lists.join(", ")})</span> : "–", value: (r) => r.by },
  ];
  const addCols: Column<Rec<InvAddConflict>>[] = [
    { key: "day", label: "Sheet day", render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.day)}</span>, value: (r) => r.day },
    projCol<InvAddConflict>(),
    { key: "term", label: "Search the sheet said to Add", render: (r) => <span className="font-medium">{r.term}</span>, value: (r) => r.term },
    campCol<InvAddConflict>(),
    { key: "conv", label: "Conv.", align: "right", value: (r) => r.conv },
    { key: "cost", label: "Cost", align: "right", render: (r) => inr(r.cost), value: (r) => r.cost },
    { key: "by", label: "Blocked by", render: (r) => <div><Code>{r.by}</Code><div className="mt-0.5 text-xs text-muted-foreground">{r.by_level === "campaign" ? "whole campaign" : "this ad group"}</div></div>, value: (r) => `${r.by} (${r.by_level})` },
  ];
  const campCols: Column<Rec<InvCampaign>>[] = [
    projCol<InvCampaign>(),
    { key: "campaign", label: "Campaign", render: (r) => <span className="text-[13px]">{label(r.campaign)}</span>, value: (r) => label(r.campaign) },
    { key: "total", label: "Negatives", align: "right", render: (r) => n0(r.total), value: (r) => r.total },
    { key: "campaign_level", label: "Whole campaign", align: "right", render: (r) => n0(r.campaign_level), value: (r) => r.campaign_level },
    { key: "ad_group_level", label: "One ad group", align: "right", render: (r) => n0(r.ad_group_level), value: (r) => r.ad_group_level },
    { key: "exact", label: "Exact", align: "right", render: (r) => n0(r.exact), value: (r) => r.exact },
    { key: "phrase", label: "Phrase", align: "right", render: (r) => n0(r.phrase), value: (r) => r.phrase },
    { key: "broad", label: "Broad", align: "right", render: (r) => n0(r.broad), value: (r) => r.broad },
    { key: "one_word", label: "One-word phrase/broad", align: "right", render: (r) => <span className={r.one_word ? "font-medium text-[color:var(--warn)]" : ""}>{n0(r.one_word)}</span>, value: (r) => r.one_word },
    { key: "lists", label: "Shared lists linked", render: (r) => <span className="text-xs text-muted-foreground">{r.lists.join(", ") || "–"}</span>, value: (r) => r.lists.join(", ") },
  ];

  return (
    <>
      <Card className="sticky top-16 z-20 mb-5 flex flex-wrap items-center gap-3 p-3">
        <Select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)} className="h-8 w-[150px] text-[13px]">
          <option value="all">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <span className="text-[13px] text-muted-foreground">Negative applies to</span>
        <Segmented value={level} onChange={setLevel} options={[{ value: "campaign", label: "Whole campaign" }, { value: "ad group", label: "One ad group" }, { value: "all", label: "Both" }]} />
        <span className="ml-auto text-xs text-muted-foreground">Report downloaded {dshort(data.as_of)} · {n0(data.total)} negatives</span>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Negatives blocking our enabled keywords" value={n0(risky.filter((r) => r.keywords.length).length)} tone={kwBlocked ? "bad" : "good"} sub={`${n0(kwBlocked)} keywords cannot show for their own search`} />
        <StatCard label="Negatives blocking searches that converted" value={n0(risky.filter((r) => r.conv > 0).length)} tone={risky.some((r) => r.conv > 0) ? "warn" : "good"} sub="searches the sheet never asked to exclude" />
        <StatCard label="One-word phrase or broad negatives" value={n0(oneWord.length)} tone="warn" sub="each blocks every search with that word" />
        <StatCard label="Sheet Exclude calls not blocked today" value={n0(notFound.length)} tone={notFound.length ? "bad" : "good"} sub={`of ${n0(calls.length)} calls · ${inr(notFound.reduce((s, c) => s + c.cost, 0))} spent on them`} />
      </div>

      <Tabs defaultValue="risky" className="mt-6">
        <TabsList>
          <TabsTrigger value="risky">Blocking what we want ({risky.length})</TabsTrigger>
          <TabsTrigger value="calls">Sheet calls vs account ({calls.length})</TabsTrigger>
          <TabsTrigger value="adds">Adds still blocked ({adds.length})</TabsTrigger>
          <TabsTrigger value="one">One-word negatives ({oneWord.length})</TabsTrigger>
          <TabsTrigger value="camps">Per campaign ({camps.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="risky">
          <Card>
            <CardHeader title="Negatives in the account that block our own keywords or converting searches" description="Click a row for the full list. Ad-group negatives can be on purpose (to push a search into another ad group); whole-campaign ones stop it everywhere in the campaign." />
            <div className="p-2"><DataTable rows={rec(risky)} columns={riskCols} csvName="negatives-blocking-our-keywords" onRowClick={(r) => setOpen(r as InvRisk)} initialSort={{ key: "keywords", dir: "desc" }} empty="No negative here blocks an enabled keyword or a converting search." /></div>
          </Card>
        </TabsContent>
        <TabsContent value="calls">
          <Card>
            <CardHeader title="Is each Exclude call blocked in the account today?" description="Checked against the full negative list, so negatives added before the change history starts count too." />
            <div className="p-2"><DataTable rows={rec(calls)} columns={callCols} csvName="sheet-calls-vs-account" initialSort={{ key: "in_account", dir: "desc" }} /></div>
            <Explain>“Not blocked today” can still be blocked by a shared negative list linked to the campaign; those lists&apos; contents are not in this report. Download them from Tools › Shared library › Exclusion lists to close that gap.</Explain>
            <div className="h-4" />
          </Card>
        </TabsContent>
        <TabsContent value="adds">
          <Card>
            <CardHeader title="Searches the sheet said to Add that a negative still blocks" description="Even if added as a keyword, the search cannot show while this negative is there." />
            <div className="p-2"><DataTable rows={rec(adds)} columns={addCols} csvName="adds-blocked-by-negatives" /></div>
          </Card>
        </TabsContent>
        <TabsContent value="one">
          <Card>
            <CardHeader title="One-word phrase and broad negatives" description="Each one blocks every search containing that word in its campaign (or ad group). Sorted by what they block." />
            <div className="p-2"><DataTable rows={rec(oneWord)} columns={oneCols} csvName="one-word-negatives" /></div>
          </Card>
        </TabsContent>
        <TabsContent value="camps">
          <Card>
            <CardHeader title="Negatives per campaign" description="Counts from the negative keyword report, and the shared lists linked to each campaign." />
            <div className="p-2"><DataTable rows={rec(camps)} columns={campCols} csvName="negatives-per-campaign" searchable={false} /></div>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? <Code>{open.text}</Code> : ""}
        description={open ? `${label(open.campaign)} · ${open.ad_group || "whole campaign"} · ${open.match} match · ${open.added_on ? `added ${dshort(open.added_on)} by ${open.added_by}` : "added before 1 Oct"}` : ""}>
        {open ? (
          <div className="space-y-5 text-sm">
            <p className="rounded-md bg-muted/60 px-3 py-2 text-[13px]"><b className="font-medium">Check it yourself:</b> Google Ads › {label(open.campaign)} › Audiences, keywords and content › Search keywords › Negative search keywords, search for “{open.text.replace(/[[\]"]/g, "")}”.</p>
            {open.keywords.length ? (
              <div><div className="mb-1.5 font-medium">Our enabled keywords it blocks ({open.keywords.length})</div>
                <ul className="space-y-1">{open.keywords.map((k) => <li key={k}><Code>{k}</Code></li>)}</ul></div>
            ) : null}
            {open.conv_searches.length ? (
              <div><div className="mb-1.5 font-medium">Searches that converted, which it now blocks</div>
                <table className="w-full text-[13px]"><thead><tr className="border-b text-xs text-muted-foreground"><th className="py-1 text-left font-medium">Search</th><th className="py-1 text-left font-medium">Ad group</th><th className="py-1 text-right font-medium">Conv.</th><th className="py-1 text-right font-medium">Cost</th><th className="py-1 text-right font-medium">Last seen</th></tr></thead>
                  <tbody>{open.conv_searches.map((h) => <tr key={h.term + h.ad_group} className="border-b last:border-0"><td className="py-1">{h.term}</td><td className="py-1 text-muted-foreground">{h.ad_group}</td><td className="py-1 text-right tabular">{h.conv}</td><td className="py-1 text-right tabular">{inr(h.cost)}</td><td className="py-1 text-right tabular">{dshort(h.last_day)}</td></tr>)}</tbody></table></div>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
