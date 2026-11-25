"use client";
/** The pieces of the agency pages: the score bar, the table of sheet calls (each opens its case file), the project filter. */
import * as React from "react";
import type { Followup } from "@/lib/followup-core";
import { KIND_LABEL, LEVEL_LABEL, STATUS, statusOf, TONE_BG, TONE_FILL, type Tone } from "@/lib/follow-labels";
import { cn, dshort, inr, n0 } from "@/lib/format";
import { DataTable, type Column } from "./data-table";
import { CaseFile } from "./case-file";
import { Select } from "./ui";

export interface Seg { key: string; label: string; n: number; tone: Tone; hint?: string }

/** One bar split into parts (counts), with a legend under it. */
export function ScoreBar({ segs, title, total, note }: { segs: Seg[]; title?: React.ReactNode; total?: number; note?: React.ReactNode }) {
  const sum = total ?? segs.reduce((s, x) => s + x.n, 0);
  return (
    <div>
      {title ? <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[14px] font-medium">{title}</div> : null}
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={segs.map((s) => `${s.label} ${s.n}`).join(", ")}>
        {segs.filter((s) => s.n > 0).map((s) => (
          <div key={s.key} title={`${s.label}: ${n0(s.n)}`} style={{ width: `${(s.n / Math.max(1, sum)) * 100}%`, background: TONE_FILL[s.tone] }} className="h-full border-r border-card last:border-r-0" />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
        {/* neutral parts with nothing in them are left out of the legend; a zero "not done" stays, it is good news */}
        {segs.filter((s) => s.n > 0 || (s.tone !== "info" && s.tone !== "muted")).map((s) => (
          <li key={s.key} className="flex items-center gap-1.5" title={s.hint}>
            <span className="size-2.5 rounded-[3px]" style={{ background: TONE_FILL[s.tone] }} />
            <span className="tabular font-semibold">{n0(s.n)}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-2 text-[12.5px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function StatusTag({ f }: { f: Pick<Followup, "type" | "status"> }) {
  const st = statusOf(f);
  return <span className={cn("inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium", TONE_BG[st.tone])} title={st.means}>{st.label}</span>;
}

const when = (ts: string) => (ts ? `${dshort(ts.slice(0, 10))} ${ts.slice(11, 16)}` : "");

/** How it went in, in a few words: "-[x] · campaign level · full search". */
export function HowCell({ f }: { f: Followup }) {
  const d = f.done;
  if (!d) {
    if (f.status === "wrong_place") return <span className="text-bad">Only in {f.elsewhere}</span>;
    if (f.status === "elsewhere") return <span className="text-warn">Only in {f.elsewhere}</span>;
    return <span className="text-muted-foreground">–</span>;
  }
  return (
    <span className="block min-w-0">
      <span className="block break-words font-mono text-[12px]">{d.text}</span>
      <span className="block text-[12px] text-muted-foreground">
        {f.type === "exclude" ? <>{LEVEL_LABEL[d.level]}{d.list ? ` · ${d.list}` : d.ad_group ? ` · ${d.ad_group}` : ""} · <span className={cn(d.kind === "one_word" && "font-medium text-bad")}>{KIND_LABEL[d.kind]}</span></> : <>{d.ad_group || "keyword"}</>}
      </span>
    </span>
  );
}

export type FollowCol = "project" | "campaign" | "term" | "day" | "due" | "status" | "went" | "how" | "late" | "cost_late" | "written" | "cost";

/** A table of sheet calls. Click a row for its case file. */
export function FollowTable({ rows, labels, cols, csvName, empty, sort, filters = true, pageSize = 25 }: {
  rows: Followup[]; labels: Record<string, string>; cols?: FollowCol[]; csvName?: string; empty?: React.ReactNode;
  sort?: { key: string; dir: "asc" | "desc" }; filters?: boolean; pageSize?: number;
}) {
  const [sel, setSel] = React.useState<string | null>(null);
  const [proj, setProj] = React.useState("");
  const [st, setSt] = React.useState("");
  const lab = (c: string) => labels[c] ?? c;
  const use = cols ?? ["term", "campaign", "day", "due", "status", "went", "how", "late", "cost_late"];
  const all: Record<FollowCol, Column<Followup & Record<string, unknown>>> = {
    project: { key: "project", label: "Project", value: (r) => r.project, render: (r) => <span className="capitalize">{r.project}</span> },
    term: { key: "term", label: "Search", value: (r) => r.term, render: (r) => <span className="font-medium">{r.term}</span> },
    campaign: { key: "campaign", label: "Campaign › ad group", value: (r) => `${lab(r.campaign)} ${r.ad_groups.join(" ")}`, render: (r) => <span className="text-[12.5px]">{lab(r.campaign)}<span className="text-muted-foreground"> › {r.ad_groups.slice(0, 2).join(", ")}{r.ad_groups.length > 2 ? ` +${r.ad_groups.length - 2}` : ""}</span></span> },
    day: { key: "call_day", label: "Sheet day", value: (r) => r.call_day, render: (r) => <span className="whitespace-nowrap">{dshort(r.call_day)}</span>, sortable: true },
    due: { key: "due", label: "Deadline", value: (r) => r.due, render: (r) => <span className="whitespace-nowrap">{dshort(r.due)}</span>, sortable: true },
    status: { key: "status", label: "Status", value: (r) => statusOf(r).label, render: (r) => <StatusTag f={r} /> },
    went: { key: "went", label: "Went in", value: (r) => r.done?.ts ?? "", render: (r) => r.done?.dated ? <span className="whitespace-nowrap text-[12.5px]">{when(r.done.ts)}<span className="block text-muted-foreground">{r.done.who}</span></span> : r.done ? <span className="text-[12.5px] text-muted-foreground">date not in history</span> : <span className="text-muted-foreground">–</span>, sortable: true },
    how: { key: "how", label: "How it went in", value: (r) => (r.done ? `${r.done.text} ${r.done.level} ${KIND_LABEL[r.done.kind]}` : r.elsewhere), render: (r) => <HowCell f={r} /> },
    late: { key: "days_late", label: "Days late", align: "right", value: (r) => r.days_late, render: (r) => (r.days_late > 0 ? <span className="tabular font-medium text-warn">{r.days_late}</span> : <span className="text-muted-foreground">–</span>), sortable: true },
    cost_late: { key: "cost_late", label: "₹ after deadline", align: "right", value: (r) => Math.round(r.cost_late), render: (r) => (r.cost_late > 0 ? <span className="tabular font-medium text-bad">{inr(r.cost_late)}</span> : <span className="text-muted-foreground">–</span>), sortable: true },
    written: { key: "written", label: "Sheet wrote", value: (r) => r.written, render: (r) => r.written ? <span><span className="font-mono text-[12px]">{r.written}</span><span className={cn("block text-[12px]", r.written_kind === "one_word" ? "text-bad" : "text-muted-foreground")}>{KIND_LABEL[r.written_kind]}</span></span> : <span className="text-[12px] text-muted-foreground">{r.type === "exclude" ? "nothing" : "–"}</span> },
    cost: { key: "cost", label: "₹ before the call", align: "right", value: (r) => Math.round(r.cost_before), render: (r) => <span className="tabular">{inr(r.cost_before)}</span>, sortable: true },
  };
  const statuses = [...new Set(rows.map((r) => `${r.type}:${r.status}`))];
  const projects = [...new Set(rows.map((r) => r.project))].sort();
  const shown = rows.filter((r) => (!proj || r.project === proj) && (!st || `${r.type}:${r.status}` === st));
  return (
    <>
      <DataTable rows={shown as (Followup & Record<string, unknown>)[]} columns={use.map((c) => all[c])} csvName={csvName} pageSize={pageSize}
        onRowClick={(r) => setSel(r.id)} empty={empty ?? "Nothing here."} initialSort={sort}
        toolbar={filters && (projects.length > 1 || statuses.length > 1) ? (
          <div className="flex flex-wrap gap-2">
            {projects.length > 1 ? <Select value={proj} onChange={(e) => setProj(e.target.value)} aria-label="Project" className="w-36"><option value="">All projects</option>{projects.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}</Select> : null}
            {statuses.length > 1 ? <Select value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status" className="w-48"><option value="">Every status</option>{statuses.map((k) => { const [t, s] = k.split(":"); return <option key={k} value={k}>{t === "add" ? "Add: " : "Exclude: "}{STATUS[t as "add" | "exclude"][s]?.label ?? s}</option>; })}</Select> : null}
          </div>
        ) : null} />
      <CaseFile id={sel} onClose={() => setSel(null)} label={lab} />
    </>
  );
}

export interface OneWordRow { day: string; text: string; campaign: string; ad_group: string; list: string; who: string; hurt: boolean }
/** One-word negatives that went in, from the change history: paged, searchable, the ones that block what we want first. */
export function OneWordTable({ rows, labels }: { rows: OneWordRow[]; labels: Record<string, string> }) {
  const cols: Column<OneWordRow & Record<string, unknown>>[] = [
    { key: "day", label: "Day", value: (r) => r.day, render: (r) => <span className="whitespace-nowrap">{dshort(r.day)}</span>, sortable: true },
    { key: "text", label: "Negative", value: (r) => r.text, render: (r) => <span className={cn("font-mono", r.hurt && "font-semibold text-bad")}>-{r.text}</span> },
    { key: "where", label: "Where", value: (r) => (r.list ? `shared list ${r.list}` : `${labels[r.campaign] ?? r.campaign} ${r.ad_group}`), render: (r) => <span className="text-[12.5px]">{r.list ? `shared list ${r.list}` : <>{labels[r.campaign] ?? r.campaign}<span className="text-muted-foreground"> · {r.ad_group ? `ad group ${r.ad_group}` : "campaign level"}</span></>}</span> },
    { key: "who", label: "By", value: (r) => r.who, render: (r) => <span className="text-[12.5px] text-muted-foreground">{r.who}</span> },
    { key: "hurt", label: "Blocks what we want", value: (r) => (r.hurt ? "yes" : ""), render: (r) => (r.hurt ? <span className="font-medium text-bad">yes</span> : <span className="text-muted-foreground">–</span>), sortable: true },
  ];
  return <DataTable rows={rows as (OneWordRow & Record<string, unknown>)[]} columns={cols} csvName="one-word-negatives" pageSize={10} initialSort={{ key: "hurt", dir: "desc" }} />;
}
