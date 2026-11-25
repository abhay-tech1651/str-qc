"use client";
/**
 * The two working lists behind the Overview:
 *  - SearchesView: every search in the period, filtered by project, campaign, ad group and part of the money;
 *  - FixView: what is still open, one row per thing to do, with the exact place in Google Ads to do it.
 * Both open the same drawer with a search's whole story.
 */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { DataTable, type Column } from "./data-table";
import { Card, ProjectTag, Select } from "./ui";
import { MoneyBar, OutcomeTag, accountNow, type PartAmount } from "./money";
import { CaseFile } from "./case-file";
import { cn, dshort, inr, n0, pcolor } from "@/lib/format";
import { OUTCOMES, type Outcome, type Search } from "@/lib/ledger-core";
import { OPEN, PARTS, PART_OF, parts as partsOf } from "@/lib/outcomes";
import type { FixItem, FixType } from "@/lib/ledger";

export interface ProjectOpt { id: string; name: string }
type Labels = Record<string, string>;

/** Keep filters in the address, so the back button and shared links keep the view. */
function useParamState(name: string, init: string) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [v, setV] = React.useState(init);
  const set = (x: string) => {
    setV(x);
    const q = new URLSearchParams(sp.toString());
    if (x) q.set(name, x); else q.delete(name);
    router.replace(`${path}?${q}`, { scroll: false });
  };
  return [v, set] as const;
}

const splitOf = (rows: Search[]) => {
  const by = Object.fromEntries(OUTCOMES.map((o) => [o, { n: 0, cost: 0 }])) as Record<Outcome, { n: number; cost: number }>;
  for (const s of rows) { by[s.outcome].n++; by[s.outcome].cost += s.cost; }
  return by;
};

export function SearchesView({ searches, labels, projects, init }: {
  searches: Search[]; labels: Labels; projects: ProjectOpt[];
  init: { project: string; campaign: string; ad_group: string; part: string; open: string };
}) {
  const [project, setProject] = useParamState("project", init.project);
  const [campaign, setCampaign] = useParamState("campaign", init.campaign);
  const [adGroup, setAdGroup] = useParamState("ad_group", init.ad_group);
  const [part, setPart] = useParamState("part", init.part);
  const [open, setOpen] = useParamState("open", init.open);
  const [sel, setSel] = React.useState<Search | null>(null);
  const lab = (c: string) => labels[c] ?? c;

  const inProject = searches.filter((s) => !project || s.project === project);
  const campaigns = [...new Set(inProject.map((s) => s.campaign))].sort((a, b) => lab(a).localeCompare(lab(b)));
  const inCampaign = inProject.filter((s) => !campaign || s.campaign === campaign);
  const adGroups = campaign ? [...new Set(inCampaign.flatMap((s) => s.ad_groups))].sort() : [];
  const base = inCampaign.filter((s) => !adGroup || s.ad_groups.includes(adGroup));
  const rows = base.filter((s) => (!part || PART_OF[s.outcome] === part) && (!open || OPEN.includes(s.outcome)));
  const by = splitOf(base);
  const total = base.reduce((n, s) => n + s.cost, 0);
  const P: PartAmount[] = partsOf(by);

  const columns: Column<Search>[] = [
    { key: "term", label: "Search", render: (s) => <span className="font-medium">{s.term}</span> },
    { key: "campaign", label: "Campaign › ad group", value: (s) => `${lab(s.campaign)} › ${s.ad_groups.join(", ")}`, render: (s) => (
      <span className="block max-w-[260px] text-[12.5px] leading-snug"><span className="mr-1 inline-block size-2 rounded-full" style={{ background: pcolor(s.project) }} />{lab(s.campaign)} <span className="text-muted-foreground">› {s.ad_groups.join(", ")}</span></span>) },
    { key: "cost", label: "Spent", align: "right", render: (s) => <span className="tabular font-medium">{inr(s.cost)}</span> },
    { key: "conv", label: "Conv", align: "right", render: (s) => <span className="tabular">{n0(s.conv)}</span> },
    { key: "verdict", label: "Sheet said", value: (s) => `${s.verdict} ${s.call_day}`, render: (s) => <span className="whitespace-nowrap text-[12.5px]">{s.verdict}{s.call_day ? <span className="text-muted-foreground"> · {dshort(s.call_day)}</span> : null}</span> },
    { key: "now", label: "Google Ads now", value: (s) => accountNow(s), render: (s) => <span className="block max-w-[240px] text-[12.5px] leading-snug text-muted-foreground">{accountNow(s)}</span> },
    { key: "outcome", label: "Where it stands", value: (s) => s.outcome, render: (s) => <OutcomeTag o={s.outcome} /> },
  ];

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Project" value={project} onChange={(e) => { setProject(e.target.value); setCampaign(""); setAdGroup(""); }} className="h-9 w-[150px]">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Campaign" value={campaign} onChange={(e) => { setCampaign(e.target.value); setAdGroup(""); }} className="h-9 w-[260px]">
          <option value="">All campaigns</option>
          {campaigns.map((c) => <option key={c} value={c}>{lab(c)}</option>)}
        </Select>
        {campaign ? (
          <Select aria-label="Ad group" value={adGroup} onChange={(e) => setAdGroup(e.target.value)} className="h-9 w-[220px]">
            <option value="">All ad groups</option>
            {adGroups.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        ) : null}
        <Select aria-label="Part of the money" value={part} onChange={(e) => setPart(e.target.value)} className="h-9 w-[230px]">
          <option value="">Every part</option>
          {PARTS.map((p) => <option key={p.part} value={p.part}>{p.label}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!open} onChange={(e) => setOpen(e.target.checked ? "1" : "")} className="size-4 accent-[color:var(--primary)]" /> Only what is still to do</label>
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[13.5px]">
          <span><b className="tabular">{n0(base.length)}</b> searches · <b className="tabular">{inr(total)}</b>{project || campaign || adGroup ? " in this selection" : ""}</span>
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
            {P.filter((p) => p.cost > 0).map((p) => (
              <button key={p.part} type="button" onClick={() => setPart(part === p.part ? "" : p.part)} className={cn("flex items-center gap-1.5 hover:text-foreground", part === p.part && "font-medium text-foreground")}>
                <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />{p.short} {inr(p.cost)}
              </button>
            ))}
          </span>
        </div>
        <MoneyBar parts={P} total={total} />
      </Card>

      <DataTable rows={rows as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]} csvName={`searches-${project || "all"}`} initialSort={{ key: "cost", dir: "desc" }}
        onRowClick={(r) => setSel(r as unknown as Search)} empty="No search matches these filters." />
      <CaseFile id={sel?.id ?? null} onClose={() => setSel(null)} label={lab} />
    </>
  );
}

export interface FixTypeMeta { type: FixType; title: string; who: string; why: string; n: number; overdue: number; cost: number }

export function FixView({ items, types, searches, labels, projects, init }: {
  items: FixItem[]; types: FixTypeMeta[]; searches: Search[]; labels: Labels; projects: ProjectOpt[];
  init: { type: string; project: string; late?: string };
}) {
  const first = types.find((t) => t.type === init.type)?.type ?? types[0]?.type ?? "junk_open";
  const [type, setType] = useParamState("type", first);
  const [project, setProject] = useParamState("project", init.project);
  const [late, setLate] = useParamState("late", init.late ?? "");
  const [sel, setSel] = React.useState<Search | null>(null);
  const lab = (c: string) => labels[c] ?? c;
  const byId = React.useMemo(() => new Map(searches.map((s) => [s.id, s])), [searches]);
  const meta = types.find((t) => t.type === type) ?? types[0];
  const rows = items.filter((f) => f.type === type && (!project || f.project === project) && (!late || f.overdue));
  const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  const perNeg = type === "keyword_blocked" || type === "neg_blocks_good";
  const columns: Column<FixItem>[] = [
    { key: "project", label: "Project", value: (f) => projName(f.project), render: (f) => <ProjectTag name={projName(f.project)} color={pcolor(f.project)} /> },
    { key: "where_c", label: "Campaign › ad group", value: (f) => `${lab(f.campaign)} › ${f.ad_group}`, render: (f) => <span className="block max-w-[230px] text-[12.5px] leading-snug">{lab(f.campaign)}{f.ad_group ? <span className="text-muted-foreground"> › {f.ad_group}</span> : null}</span> },
    { key: "term", label: type === "keyword_blocked" ? "Our keywords it blocks" : type === "neg_blocks_good" ? "Searches we want that it blocks" : "Search", render: (f) => <span className={cn("block max-w-[260px] leading-snug", perNeg ? "text-[12.5px]" : "font-medium")}>{f.term}</span> },
    { key: "todo", label: "What to do", render: (f) => <span className="block min-w-[220px] max-w-[320px] text-[13px] leading-snug">{f.todo}{f.note ? <span className="mt-0.5 block text-[12px] text-muted-foreground">{f.note}</span> : null}</span> },
    { key: "where", label: "Where in Google Ads", render: (f) => <span className="block max-w-[230px] break-words text-[12px] leading-snug text-muted-foreground">{f.where}</span> },
    { key: "cost", label: "Spent", align: "right", render: (f) => <span className="tabular">{f.cost ? inr(f.cost) : "–"}</span> },
    ...(type === "results_blocked" || perNeg ? [{ key: "conv", label: "Conv", align: "right" as const, render: (f: FixItem) => <span className="tabular">{n0(f.conv)}</span> }] : []),
    { key: "due", label: "Due", value: (f) => f.due || "0", render: (f) => f.overdue ? <span className="whitespace-nowrap text-[12.5px] font-medium text-bad">{f.due ? `${dshort(f.due)}, late` : "now"}</span> : <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">{f.due ? dshort(f.due) : f.type === "results_blocked" ? "County decides" : "now"}</span> },
    { key: "since", label: perNeg ? "Added" : "Sheet day", render: (f) => <span className="whitespace-nowrap text-[12.5px]">{f.since ? dshort(f.since) : "–"}</span> },
  ];

  return (
    <>
      <div className="no-print mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {types.map((t) => (
          <button key={t.type} type="button" onClick={() => setType(t.type)}
            className={cn("rounded-xl border bg-card p-3 text-left transition-shadow hover:shadow-sm", t.type === type ? "ring-2 ring-primary" : "")}>
            <div className="flex items-baseline justify-between gap-2"><span className="text-[14px] font-medium">{t.title}</span><span className="tabular text-lg font-semibold">{n0(t.n)}</span></div>
            <div className="text-[12.5px] text-muted-foreground">{t.who}{t.cost ? ` · ${inr(t.cost)}` : ""}{t.overdue ? <span className="text-bad"> · {n0(t.overdue)} late</span> : t.n ? " · none late" : ""}</div>
          </button>
        ))}
      </div>
      {meta ? (
        <Card className="mb-4 flex items-start gap-3 p-4 text-[13.5px]">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-bad" />
          <div><b>{meta.title}.</b> {meta.why} <span className="text-muted-foreground">Who fixes it: {meta.who}. Click a row for the whole story of that search.</span></div>
        </Card>
      ) : null}
      <DataTable rows={rows as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]} csvName={`fix-${type}${project ? `-${project}` : ""}`}
        initialSort={{ key: "cost", dir: "desc" }} empty="Nothing open here."
        toolbar={<><label className="flex h-9 items-center gap-1.5 rounded-md border bg-card px-2.5 text-[13px]"><input type="checkbox" checked={!!late} onChange={(e) => setLate(e.target.checked ? "1" : "")} /> Only past the deadline</label><Select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)} className="h-9 w-[150px]"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></>}
        onRowClick={(r) => { const s = byId.get((r as unknown as FixItem).id); if (s) setSel(s); }} />
      <CaseFile id={sel?.id ?? null} onClose={() => setSel(null)} label={lab} />
    </>
  );
}

