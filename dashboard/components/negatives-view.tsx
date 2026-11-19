"use client";
/**
 * Negatives as written: what the agency's sheet asked to block (whole search, part, one word), what went into Google Ads,
 * and what else that negative blocks. Filters: project, sheet dates, day/week/month, what was written, what happened.
 */
import * as React from "react";
import { Badge, Card, CardBody, CardHeader, Explain, Input, ProjectTag, Segmented, Select, Sheet, Tabs, TabsContent, TabsList, TabsTrigger } from "./ui";
import { StatCard } from "./blocks";
import { DataTable, type Column } from "./data-table";
import { cn, dlong, dshort, inr, n0, n1, pcolor } from "@/lib/format";
import type { NegAnalysis, NegCall, NegItem, WordKind } from "@/lib/negatives-core";

type Rec<T> = T & Record<string, unknown>;
const rec = <T,>(rows: T[]) => rows as unknown as Rec<T>[];
type Grain = "day" | "week" | "month";

const KIND: Record<WordKind, { label: string; tone: "good" | "info" | "muted" | "bad" | "warn" | "outline" }> = {
  full: { label: "whole search", tone: "good" },
  part: { label: "part of it", tone: "info" },
  one_word: { label: "one word", tone: "warn" },
  different: { label: "other words", tone: "outline" },
  none: { label: "nothing written", tone: "muted" },
};
const STATUS: Record<string, { label: string; tone: "good" | "info" | "muted" | "bad" | "outline" }> = {
  applied: { label: "applied", tone: "good" },
  applied_elsewhere: { label: "applied in another ad group", tone: "info" },
  waiting: { label: "waiting (grace)", tone: "muted" },
  not_applied: { label: "not applied", tone: "bad" },
  unchecked: { label: "not checked", tone: "outline" },
};

function Code({ children }: { children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return <span className="text-muted-foreground">–</span>;
  return <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[12px]">{children}</code>;
}
const KindBadge = ({ k }: { k: WordKind | "" }) => (k ? <Badge tone={KIND[k].tone}>{KIND[k].label}</Badge> : <span className="text-muted-foreground">–</span>);

/** Monday of the day's week, so weeks read "w/c 10 Nov". */
function weekOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
const bucket = (day: string, g: Grain) => (g === "day" ? day : g === "week" ? weekOf(day) : day.slice(0, 7));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const bucketLabel = (b: string, g: Grain) => (g === "day" ? dshort(b) : g === "week" ? `w/c ${dshort(b)}` : `${MON[Number(b.slice(5, 7)) - 1]} ${b.slice(0, 4)}`);

export function NegativesView({ data, labels, projects }: { data: NegAnalysis; labels: Record<string, string>; projects: { id: string; name: string }[] }) {
  const pname = React.useCallback((id: string) => projects.find((p) => p.id === id)?.name ?? "Other", [projects]);
  const label = React.useCallback((c: string) => labels[c] ?? c, [labels]);
  // sheet days and the days negatives went in (the change history starts before the sheet)
  const days = React.useMemo(() => [...new Set([...data.calls.map((c) => c.day), ...data.negatives.map((n) => n.day)])].sort(), [data.calls, data.negatives]);

  const [project, setProject] = React.useState("all");
  const [from, setFrom] = React.useState(days[0] ?? "");
  const [to, setTo] = React.useState(days[days.length - 1] ?? "");
  const [grain, setGrain] = React.useState<Grain>("week");
  const [kind, setKind] = React.useState<"all" | WordKind>("all");
  const [status, setStatus] = React.useState("all");
  const [level, setLevel] = React.useState<"all" | "campaign" | "ad group">("campaign");
  const [openCall, setOpenCall] = React.useState<NegCall | null>(null);
  const [openNeg, setOpenNeg] = React.useState<NegItem | null>(null);
  const negById = React.useMemo(() => new Map(data.negatives.map((n) => [n.id, n])), [data.negatives]);

  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const calls = React.useMemo(() => data.calls.filter((c) =>
    (project === "all" || c.project === project) && inRange(c.day) && (kind === "all" || c.written_kind === kind) && (status === "all" || c.status === status),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [data.calls, project, from, to, kind, status]);
  const negs = React.useMemo(() => data.negatives.filter((n) =>
    (project === "all" || n.project === project) && inRange(n.day) && (level === "all" || n.level === level),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [data.negatives, project, from, to, level]);
  const harmful = negs.filter((n) => n.keywords.length > 0 || n.conv > 0);
  const oneWord = negs.filter((n) => n.words === 1);

  const cnt = (k: WordKind) => calls.filter((c) => c.written_kind === k);
  const sum = (rows: { cost: number }[]) => rows.reduce((s, r) => s + r.cost, 0);
  const wentOne = calls.filter((c) => c.applied_kind === "one_word");
  const notApplied = calls.filter((c) => c.status === "not_applied");

  const trend = React.useMemo(() => {
    const m = new Map<string, { b: string; calls: number; one: number; part: number; full: number; none: number; wentOne: number; wentFull: number; notApplied: number }>();
    for (const c of calls) {
      const b = bucket(c.day, grain);
      const e = m.get(b) ?? { b, calls: 0, one: 0, part: 0, full: 0, none: 0, wentOne: 0, wentFull: 0, notApplied: 0 };
      e.calls++;
      if (c.written_kind === "one_word") e.one++; else if (c.written_kind === "part") e.part++; else if (c.written_kind === "full") e.full++; else if (c.written_kind === "none") e.none++;
      if (c.applied_kind === "one_word") e.wentOne++;
      if (c.applied_kind === "full") e.wentFull++;
      if (c.status === "not_applied") e.notApplied++;
      m.set(b, e);
    }
    return [...m.values()].sort((a, b) => (a.b < b.b ? 1 : -1));
  }, [calls, grain]);

  const projCol = <T extends { project: string }>(): Column<Rec<T>> => ({ key: "project", label: "Project", render: (r) => <ProjectTag name={pname(r.project)} color={pcolor(r.project)} />, value: (r) => pname(r.project) });
  const campCol = <T extends { campaign: string; ad_group: string }>(title = "Campaign"): Column<Rec<T>> => ({
    key: "campaign", label: title,
    render: (r) => (<div className="min-w-[150px]"><div className="text-[13px]">{label(r.campaign)}</div>{r.ad_group ? <div className="mt-0.5 text-xs text-muted-foreground">{r.ad_group}</div> : null}</div>),
    value: (r) => [label(r.campaign), r.ad_group].filter(Boolean).join(" · "),
  });

  const callCols: Column<Rec<NegCall>>[] = [
    { key: "day", label: "Sheet day", width: "80px", render: (r) => <span className="whitespace-nowrap tabular">{dshort(r.day)}</span>, value: (r) => r.day },
    projCol<NegCall>(),
    { key: "term", label: "Search term", render: (r) => <div className="min-w-[170px] font-medium">{r.term}</div>, value: (r) => r.term },
    { key: "cost", label: "Cost", align: "right", render: (r) => inr(r.cost), value: (r) => r.cost },
    { key: "written", label: "Sheet wrote", render: (r) => <div className="space-y-1"><Code>{r.written}</Code><div><KindBadge k={r.written_kind} /></div></div>, value: (r) => `${r.written} (${KIND[r.written_kind].label})` },
    { key: "applied_as", label: "Went into Google Ads", render: (r) => r.applied_as ? <div className="space-y-1"><Code>{r.applied_as}</Code><div className="flex flex-wrap gap-1"><KindBadge k={r.applied_kind} /><Badge tone="outline">{r.applied_level}</Badge></div></div> : <span className="text-muted-foreground">–</span>, value: (r) => r.applied_as ? `${r.applied_as} (${r.applied_kind ? KIND[r.applied_kind].label : ""}, ${r.applied_level})` : "" },
    { key: "applied_on", label: "When · by", render: (r) => r.applied_on ? <div className="whitespace-nowrap text-[13px]">{dshort(r.applied_on)}<div className="text-xs text-muted-foreground">{r.applied_by}</div></div> : <span className="text-muted-foreground">–</span>, value: (r) => r.applied_on ? `${r.applied_on} ${r.applied_by}` : "" },
    { key: "status", label: "Status", render: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>, value: (r) => STATUS[r.status].label },
    { key: "same_as_written", label: "Same as sheet?", render: (r) => r.same_as_written === null ? <span className="text-muted-foreground">–</span> : r.same_as_written ? "yes" : <span className="font-medium text-[color:var(--warn)]">no</span>, value: (r) => r.same_as_written === null ? "" : r.same_as_written ? "yes" : "no" },
    { key: "blocks_keywords", label: "Also blocks", align: "right", render: (r) => r.blocks_keywords || r.blocks_conv_searches ? <span className="font-medium text-bad">{[r.blocks_keywords ? `${r.blocks_keywords} keywords` : "", r.blocks_conv_searches ? `${r.blocks_conv_searches} converting` : ""].filter(Boolean).join(" · ")}</span> : <span className="text-muted-foreground">–</span>, value: (r) => r.blocks_keywords * 1000 + r.blocks_conv_searches },
  ];

  const negCols: Column<Rec<NegItem>>[] = [
    { key: "day", label: "Added", width: "80px", render: (r) => <div className="whitespace-nowrap text-[13px] tabular">{dshort(r.day)}<div className="text-xs text-muted-foreground">{r.user}</div></div>, value: (r) => r.day },
    projCol<NegItem>(),
    campCol<NegItem>("Campaign · ad group"),
    { key: "item", label: "Negative", render: (r) => <div className="space-y-1"><Code>{r.item}</Code><div className="flex flex-wrap gap-1"><Badge tone={r.words === 1 ? "warn" : "outline"}>{r.words === 1 ? "one word" : `${r.words} words`}</Badge><Badge tone="outline">{r.match} · {r.level}</Badge></div></div>, value: (r) => r.item },
    { key: "calls", label: "Sheet calls", align: "right", render: (r) => n0(r.calls), value: (r) => r.calls },
    { key: "keywords", label: "Our keywords it blocks", render: (r) => r.keywords.length ? <div className="min-w-[200px] text-[13px]"><span className="font-medium text-bad">{r.keywords.length}</span> <span className="text-muted-foreground">e.g. {r.keywords.slice(0, 2).join("; ")}</span></div> : <span className="text-muted-foreground">–</span>, value: (r) => r.keywords.length },
    { key: "conv", label: "Converting searches it blocks", render: (r) => r.conv_searches.length ? <div className="min-w-[180px] text-[13px]"><span className="font-medium text-bad">{n1(r.conv)} conv.</span> <span className="text-muted-foreground">e.g. {r.conv_searches[0].term}</span></div> : <span className="text-muted-foreground">–</span>, value: (r) => r.conv },
    { key: "other_cost", label: "Other searches blocked", align: "right", render: (r) => r.other_searches ? <span className="text-[13px]">{n0(r.other_searches)} · {inr(r.other_cost)}</span> : <span className="text-muted-foreground">–</span>, value: (r) => r.other_cost },
  ];

  return (
    <>
      <Card className="sticky top-0 z-20 mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">Project
            <Select className="mt-1 block" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="all">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </label>
          <label className="text-xs text-muted-foreground">From (sheet day, or day added)
            <Input type="date" className="mt-1 w-40" value={from} min={days[0]} max={days[days.length - 1]} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">to
            <Input type="date" className="mt-1 w-40" value={to} min={days[0]} max={days[days.length - 1]} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">Sheet wrote
            <Select className="mt-1 block" value={kind} onChange={(e) => setKind(e.target.value as "all" | WordKind)}>
              <option value="all">Anything</option>
              {(Object.keys(KIND) as WordKind[]).map((k) => <option key={k} value={k}>{KIND[k].label}</option>)}
            </Select>
          </label>
          <label className="text-xs text-muted-foreground">Status
            <Select className="mt-1 block" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Any</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </label>
          <div className="text-xs text-muted-foreground">Group by
            <div className="mt-1"><Segmented value={grain} onChange={setGrain} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} /></div>
          </div>
          <button type="button" className="h-9 rounded-lg border px-3 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => { setProject("all"); setFrom(days[0] ?? ""); setTo(days[days.length - 1] ?? ""); setKind("all"); setStatus("all"); }}>Reset</button>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sheet wrote one word" value={n0(cnt("one_word").length)} tone={cnt("one_word").length ? "warn" : undefined}
          sub={`of ${n0(calls.length)} Exclude calls · ${inr(sum(cnt("one_word")))} of searches`} />
        <StatCard label="Sheet wrote part of the search" value={n0(cnt("part").length)} sub={`${inr(sum(cnt("part")))} · the whole search only ${n0(cnt("full").length)} times`} />
        <StatCard label="Went in as one word" value={n0(wentOne.length)} tone={wentOne.length ? "warn" : undefined}
          sub={`${n0(calls.filter((c) => c.applied_kind === "full").length)} went in as the whole search`} />
        <StatCard label="Not applied (past grace)" value={n0(notApplied.length)} tone={notApplied.length ? "bad" : undefined}
          sub={`${inr(sum(notApplied))} spent on these searches · ${n0(cnt("none").length)} rows had no negative written`} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title={`Trend by ${grain}`} description="Exclude calls in the sheet for each period: what was written, and how it went into Google Ads." />
          <div className="max-h-[420px] overflow-auto px-2 pb-3 pt-3">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card"><tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">{grain === "day" ? "Sheet day" : grain === "week" ? "Week" : "Month"}</th>
                <th className="px-3 py-2 text-right font-medium">Calls</th>
                <th className="px-3 py-2 text-right font-medium">One word</th>
                <th className="px-3 py-2 text-right font-medium">Part</th>
                <th className="px-3 py-2 text-right font-medium">Whole</th>
                <th className="px-3 py-2 text-right font-medium">Blank</th>
                <th className="px-3 py-2 text-right font-medium">In as one word</th>
                <th className="px-3 py-2 text-right font-medium">In as whole</th>
                <th className="px-3 py-2 text-right font-medium">Not applied</th>
              </tr></thead>
              <tbody>
                {trend.map((t) => (
                  <tr key={t.b} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">{bucketLabel(t.b, grain)}</td>
                    <td className="px-3 py-2 text-right tabular">{n0(t.calls)}</td>
                    <td className={cn("px-3 py-2 text-right tabular", t.one && "font-medium text-[color:var(--warn)]")}>{n0(t.one)}</td>
                    <td className="px-3 py-2 text-right tabular">{n0(t.part)}</td>
                    <td className="px-3 py-2 text-right tabular">{n0(t.full)}</td>
                    <td className="px-3 py-2 text-right tabular">{n0(t.none)}</td>
                    <td className="px-3 py-2 text-right tabular">{n0(t.wentOne)}</td>
                    <td className="px-3 py-2 text-right tabular">{n0(t.wentFull)}</td>
                    <td className={cn("px-3 py-2 text-right tabular", t.notApplied && "font-medium text-bad")}>{n0(t.notApplied)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!trend.length ? <p className="py-8 text-center text-sm text-muted-foreground">No Exclude calls match these filters.</p> : null}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Why one word is risky" />
          <CardBody className="space-y-3 pt-3 text-sm leading-relaxed text-muted-foreground">
            <p>A negative with one word blocks <span className="text-foreground">every</span> search that contains that word, in the whole campaign (or ad group). The agreed rule is to block the whole search term, so only that search stops.</p>
            <p><span className="font-medium text-foreground">{n0(harmful.length)}</span> negatives in these filters block searches we want: <span className="font-medium text-foreground">{n0(harmful.filter((n) => n.keywords.length).length)}</span> block our own active keywords and <span className="font-medium text-foreground">{n0(harmful.filter((n) => n.conv > 0).length)}</span> block searches that brought conversions.</p>
            <p>Click any row to see the full list of what it blocks.</p>
          </CardBody>
        </Card>
      </div>

      <Tabs defaultValue="harm" className="mt-8">
        <TabsList>
          <TabsTrigger value="harm">Negatives blocking our searches ({n0(harmful.length)})</TabsTrigger>
          <TabsTrigger value="calls">Each Exclude call ({n0(calls.length)})</TabsTrigger>
          <TabsTrigger value="one">One-word negatives ({n0(oneWord.length)})</TabsTrigger>
        </TabsList>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          Negative level
          <Segmented value={level} onChange={setLevel} options={[{ value: "campaign", label: "Whole campaign" }, { value: "ad group", label: "One ad group" }, { value: "all", label: "Both" }]} />
          <span>(applies to the first and third tabs)</span>
        </div>
        <TabsContent value="harm" className="mt-3">
          <DataTable rows={rec(harmful)} columns={negCols} csvName="negatives-blocking-our-searches" onRowClick={(r) => setOpenNeg(r)}
            initialSort={{ key: "keywords", dir: "desc" }} empty="No negative in these filters blocks our keywords or a converting search." />
          <Explain>“Our keywords” are keywords that were enabled in the latest keyword report, plus keywords added in the change history. A negative over a keyword stops every search that uses that keyword&apos;s words. “Converting searches” are searches the sheet never asked to block that brought at least one conversion.</Explain>
        </TabsContent>
        <TabsContent value="calls" className="mt-3">
          <DataTable rows={rec(calls)} columns={callCols} csvName="exclude-calls-negatives" onRowClick={(r) => setOpenCall(r)} empty="No Exclude calls match these filters." />
          <Explain>“Sheet wrote” is the Negative column of the agency&apos;s tab. “Went into Google Ads” is the first negative in the change history, added from the day before the sheet day, that blocks this search.</Explain>
        </TabsContent>
        <TabsContent value="one" className="mt-3">
          <DataTable rows={rec(oneWord)} columns={negCols} csvName="one-word-negatives" onRowClick={(r) => setOpenNeg(r)} initialSort={{ key: "keywords", dir: "desc" }} />
        </TabsContent>
      </Tabs>

      <Sheet open={!!openCall} onOpenChange={(o) => !o && setOpenCall(null)} title={openCall?.term ?? ""}
        description={openCall ? <>Sheet day {dlong(openCall.day)} · {label(openCall.campaign)}{openCall.ad_group ? ` · ${openCall.ad_group}` : ""} · {inr(openCall.cost)}</> : undefined}>
        {openCall ? (
          <div className="space-y-5 text-sm">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="font-medium">The agency&apos;s sheet</div>
              <p className="mt-1 text-muted-foreground">Decision Exclude, negative written: <Code>{openCall.written}</Code> <KindBadge k={openCall.written_kind} /></p>
              {openCall.comment ? <p className="mt-1 text-muted-foreground">County comment: {openCall.comment}</p> : null}
            </div>
            <div className="rounded-lg border p-4">
              <div className="font-medium">Google Ads change history</div>
              {openCall.applied_as ? (
                <p className="mt-1 text-muted-foreground"><Code>{openCall.applied_as}</Code> added on {dlong(openCall.applied_on)} by {openCall.applied_by}, {openCall.applied_level === "campaign" ? "to the whole campaign" : `to ad group ${openCall.applied_ad_group}`}. {openCall.same_as_written === false ? "This is not what the sheet wrote." : ""}</p>
              ) : <p className="mt-1 text-muted-foreground">No negative that blocks this search was found ({STATUS[openCall.status].label}). Check: Change history, campaign {label(openCall.campaign)}, from {dlong(openCall.day)}.</p>}
            </div>
            {openCall.neg_id && negById.get(openCall.neg_id) ? <Blocks n={negById.get(openCall.neg_id)!} /> : null}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={!!openNeg} onOpenChange={(o) => !o && setOpenNeg(null)} title={openNeg?.item ?? ""}
        description={openNeg ? <>Added {dlong(openNeg.day)} by {openNeg.user} · {label(openNeg.campaign)}{openNeg.ad_group ? ` · ${openNeg.ad_group}` : " · whole campaign"}</> : undefined}>
        {openNeg ? (
          <div className="space-y-5 text-sm">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="font-medium">Sheet calls it answered: {n0(openNeg.calls)}</div>
              {openNeg.call_terms.length ? <p className="mt-1 text-muted-foreground">{openNeg.call_terms.join(" · ")}</p> : <p className="mt-1 text-muted-foreground">No Exclude row in the sheet asked for this negative.</p>}
              <p className="mt-2 text-xs text-muted-foreground">Check: Google Ads › Change history › {dlong(openNeg.day)} › {label(openNeg.campaign)} › “{openNeg.item}”.</p>
            </div>
            <Blocks n={openNeg} />
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

function Blocks({ n }: { n: NegItem }) {
  return (
    <>
      <div className="rounded-lg border p-4">
        <div className="font-medium">Our active keywords it blocks: {n0(n.keywords.length)}</div>
        {n.keywords.length ? <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">{n.keywords.map((k) => <li key={k}>{k}</li>)}</ul> : <p className="mt-1 text-muted-foreground">None.</p>}
      </div>
      <div className="rounded-lg border p-4">
        <div className="font-medium">Searches that brought conversions and are now blocked: {n0(n.conv_searches.length)}</div>
        {n.conv_searches.length ? (
          <table className="mt-2 w-full text-[13px]">
            <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-left font-medium">Search</th><th className="py-1 text-right font-medium">Conv.</th><th className="py-1 text-right font-medium">Cost</th><th className="py-1 text-right font-medium">Last seen</th></tr></thead>
            <tbody>{n.conv_searches.map((h) => <tr key={h.term} className="border-t"><td className="py-1">{h.term}</td><td className="py-1 text-right tabular">{n1(h.conv)}</td><td className="py-1 text-right tabular">{inr(h.cost)}</td><td className="py-1 text-right tabular">{dshort(h.last_day)}</td></tr>)}</tbody>
          </table>
        ) : <p className="mt-1 text-muted-foreground">None in the search terms reports loaded.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Other searches it blocks that the sheet never asked to exclude: {n0(n.other_searches)}, {inr(n.other_cost)} spent on them in the reports loaded.</p>
      </div>
    </>
  );
}
