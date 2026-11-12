"use client";
/** Search terms: every search with a click on one day, with the agency's call, County's comment and the rule flags. */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, Explain, ProjectTag, Segmented, Select, Sheet } from "./ui";
import { StatCard } from "./blocks";
import { DataTable, type Column } from "./data-table";
import { cn, dlong, inr, n0, n1, pcolor, pct, plural } from "@/lib/format";
import type { ReviewRow } from "@/lib/types";

type ProjectInfo = { id: string; name: string };
type Row = ReviewRow & Record<string, unknown>;
type Decision = "all" | "flagged" | "Exclude" | "Add" | "none";

export const FLAG_LABEL: Record<string, string> = {
  address: "address search",
  budget: "budget below ours",
  rent: "rent or stay",
  not_purchase: "not a home purchase",
  brand_missing: "no brand word in a brand campaign",
  brand_in_nonbrand: "our brand in a non-brand campaign",
};

const FLAG_EXPLAIN: Record<string, string> = {
  address: "The words look like someone looking for an address: a sector or block number, a pin code, a flat or plot number, or “near me”. Often a resident or visitor, not a buyer.",
  budget: "The search mentions a price or size below what we sell, such as lakhs, 1 or 2 BHK, “cheap”, “affordable” or “budget”.",
  rent: "The search is about renting or a short stay (rent, PG, studio, serviced or furnished apartment, lease), not buying.",
  not_purchase: "The search is about jobs, plots, land, shops, offices or a government scheme, not buying a home.",
  brand_missing: "A brand campaign paid for this search, but it does not mention County or the project name. Brand campaigns bid high because brand searchers already want us.",
  brand_in_nonbrand: "The search names us, but a non-brand or competitor campaign paid for it. The brand campaign should take these, at brand prices.",
};

const decisionTone = (d: string) => (d === "Exclude" ? "bad" : d === "Add" ? "good" : "muted") as "bad" | "good" | "muted";
const dash = (s: string | null | undefined) => (s && s.trim() && s.trim() !== "-" ? s : "–");

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[12px]">{children}</code>;
}

export function SearchTermsView({ rows, days, day, initialProject, projects, labels }: {
  rows: ReviewRow[]; days: string[]; day: string; initialProject: string; projects: ProjectInfo[]; labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [project, setProject] = React.useState(initialProject);
  const [decision, setDecision] = React.useState<Decision>("all");
  const [open, setOpen] = React.useState<ReviewRow | null>(null);

  const pname = React.useCallback((id: string) => projects.find((p) => p.id === id)?.name ?? "Other", [projects]);
  const label = React.useCallback((c: string) => labels[c] ?? c, [labels]);

  const urlFor = (d: string, p: string) => {
    const q = new URLSearchParams();
    if (d) q.set("day", d);
    if (p && p !== "all") q.set("project", p);
    return `/search-terms${q.toString() ? `?${q}` : ""}`;
  };
  const onDay = (d: string) => startTransition(() => router.replace(urlFor(d, project), { scroll: false }));
  const onProject = (p: string) => {
    setProject(p);
    try { window.history.replaceState(null, "", urlFor(day, p)); } catch { /* the filter still applies */ }
  };

  const inProject = React.useMemo(() => rows.filter((r) => project === "all" || r.project === project), [rows, project]);
  const shown = React.useMemo(() => inProject.filter((r) => {
    if (decision === "all") return true;
    if (decision === "flagged") return !r.decision && r.flags.length > 0;
    if (decision === "none") return !r.decision;
    return r.decision === decision;
  }), [inProject, decision]);

  const sum = (xs: ReviewRow[]) => xs.reduce((a, r) => a + (Number.isFinite(r.cost) ? r.cost : 0), 0);
  const spend = sum(inProject);
  const clicks = inProject.reduce((a, r) => a + (Number.isFinite(r.clicks) ? r.clicks : 0), 0);
  const called = inProject.filter((r) => r.decision);
  const excl = inProject.filter((r) => r.decision === "Exclude");
  const flaggedNoCall = inProject.filter((r) => !r.decision && r.flags.length > 0);
  const scope = project === "all" ? "all projects" : pname(project);

  const columns: Column<Row>[] = [
    { key: "term", label: "Search term",
      render: (r) => (
        <div className="min-w-[200px]">
          <div className="font-medium">{r.term}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {project === "all" ? <><ProjectTag name={pname(r.project)} color={pcolor(r.project)} /><span>·</span></> : null}
            <span>{label(r.campaign)}</span>{r.ad_group ? <><span>·</span><span>{r.ad_group}</span></> : null}
          </div>
        </div>
      ),
      value: (r) => r.term },
    { key: "keyword", label: "Matched keyword",
      render: (r) => (
        <div className="min-w-[140px]">
          <div className="text-[13px]">{dash(r.keyword)}</div>
          {r.match_type ? <div className="mt-0.5 text-xs text-muted-foreground">{r.match_type}</div> : null}
        </div>
      ),
      value: (r) => (dash(r.keyword) === "–" ? "" : r.keyword) },
    { key: "clicks", label: "Clicks", align: "right", render: (r) => n0(r.clicks), value: (r) => r.clicks },
    { key: "cost", label: "Cost", align: "right", render: (r) => inr(r.cost), value: (r) => r.cost },
    { key: "cpc", label: "CPC", align: "right", render: (r) => inr(r.cpc), value: (r) => r.cpc },
    { key: "conv", label: "Conv.", align: "right", render: (r) => n1(r.conv), value: (r) => r.conv },
    { key: "decision", label: "Agency call",
      render: (r) => (
        <div className="min-w-[96px]">
          {r.decision ? <Badge tone={decisionTone(r.decision)}>{r.decision}</Badge> : <span className="text-xs text-muted-foreground">No call</span>}
          {r.neg_term ? <div className="mt-1"><Code>{r.neg_term}</Code></div> : null}
        </div>
      ),
      value: (r) => [r.decision || "No call", r.neg_term].filter(Boolean).join(" · ") },
    { key: "county_comment", label: "County comment",
      render: (r) => (r.county_comment ? <span className="text-[13px]">{r.county_comment}</span> : <span className="text-muted-foreground">–</span>),
      value: (r) => r.county_comment },
    { key: "flags", label: "Flags", sortable: false,
      render: (r) => (r.flags.length ? (
        <div className="flex min-w-[120px] flex-wrap gap-1">{r.flags.map((f) => <Badge key={f} tone="warn">{FLAG_LABEL[f] ?? f}</Badge>)}</div>
      ) : null),
      value: (r) => r.flags.map((f) => FLAG_LABEL[f] ?? f).join("; ") },
  ];

  const sorted = React.useMemo(() => [...days].sort().reverse(), [days]);

  return (
    <>
      <Card className="mb-6 flex flex-wrap items-center gap-2 p-3">
        <Select value={day} onChange={(e) => onDay(e.target.value)} aria-label="Day" className={cn("min-w-[230px]", pending && "opacity-60")}>
          {sorted.map((d) => <option key={d} value={d}>{dlong(d)}</option>)}
        </Select>
        <Segmented value={project} onChange={onProject} options={[{ value: "all", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        <Segmented value={decision} onChange={setDecision} options={[
          { value: "all", label: "All" }, { value: "flagged", label: "Flagged, no call" }, { value: "Exclude", label: "Exclude" },
          { value: "Add", label: "Add" }, { value: "none", label: "No call" },
        ]} />
        {pending ? <span className="ml-auto text-xs text-muted-foreground">Loading…</span> : null}
      </Card>

      <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-5", pending && "opacity-60")}>
        <StatCard label="Spend that day" value={inr(spend)} sub={`${scope} · ${dlong(day)}`} />
        <StatCard label="Searches with a click" value={n0(inProject.length)} sub={`${n0(clicks)} ${plural(clicks, "click")} in total`} />
        <StatCard label="Agency calls made" value={n0(called.length)}
          sub={inProject.length ? `${pct((100 * called.length) / inProject.length)} of the searches got Exclude, Add or another call` : "no searches"} />
        <StatCard label="Marked Exclude" value={inr(sum(excl))} tone={excl.length ? "bad" : undefined}
          sub={`${n0(excl.length)} ${plural(excl.length, "search", "searches")} the agency wants blocked`} />
        <StatCard label="Flagged, no call" value={inr(sum(flaggedNoCall))} tone={flaggedNoCall.length ? "warn" : undefined}
          sub={`${n0(flaggedNoCall.length)} ${plural(flaggedNoCall.length, "search", "searches")} a rule flagged that nobody decided on`} />
      </div>
      <Explain>These five numbers follow the day and the project you pick. The call filter only changes the table.</Explain>

      {rows.length > 0 && called.length === 0 && project === "all" ? (
        <div className="mt-6 rounded-xl border bg-info-soft p-4 text-sm">
          <span className="font-medium">No agency calls for this day yet.</span>{" "}
          <span className="text-muted-foreground">{rows.every((r) => r.source === "Google Ads report") ? "These searches come from the Google Ads report, and the agency sheet has no call for any of them on " : "The agency sheet has no Exclude, Add or other call for any search on "}{dlong(day)}.</span>
        </div>
      ) : null}

      <div className={cn("mt-8", pending && "opacity-60")}>
        <DataTable rows={shown as Row[]} columns={columns} pageSize={25} onRowClick={(r) => setOpen(r)}
          csvName={`search-terms-${day}${project !== "all" ? `-${project}` : ""}`} initialSort={{ key: "cost", dir: "desc" }}
          empty="No searches match these filters." />
        <Explain>A flag is a hint from fixed word rules (for example “rent”, “1 BHK” or a sector number); a person decides whether the search is junk. Click any row for its full details and what each flag means.</Explain>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? `“${open.term}”` : ""}
        description={open ? <span className="flex flex-wrap items-center gap-2"><ProjectTag name={pname(open.project)} color={pcolor(open.project)} /><span>· {dlong(open.day)}</span></span> : undefined}>
        {open ? <RowDetails r={open} label={label} /> : null}
      </Sheet>
    </>
  );
}

function RowDetails({ r, label }: { r: ReviewRow; label: (c: string) => string }) {
  const items: [string, React.ReactNode][] = [
    ["Campaign", label(r.campaign)],
    ["Campaign type", dash(r.ctype)],
    ["Ad group", dash(r.ad_group)],
    ["Matched keyword", dash(r.keyword)],
    ["Match type", dash(r.match_type)],
    ["Clicks", n0(r.clicks)],
    ["Cost", inr(r.cost)],
    ["Cost per click", inr(r.cpc)],
    ["Google conversions", n1(r.conv)],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[["Cost", inr(r.cost)], ["Clicks", n0(r.clicks)], ["Conv.", n1(r.conv)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="mt-1 text-lg font-semibold tabular">{v}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Agency call</div>
        <div className="flex flex-wrap items-center gap-2">
          {r.decision ? <Badge tone={decisionTone(r.decision)}>{r.decision}</Badge> : <span className="text-sm text-muted-foreground">No call in the agency sheet.</span>}
          {r.neg_term ? <span className="text-sm">negative written: <Code>{r.neg_term}</Code></span> : r.decision === "Exclude" ? <span className="text-sm text-muted-foreground">no negative written</span> : null}
        </div>
        <div className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">County comment</div>
        <p className="mt-1 text-[15px] leading-relaxed">{r.county_comment || <span className="text-muted-foreground">None.</span>}</p>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Flags</div>
        {r.flags.length ? (
          <ul className="space-y-3">
            {r.flags.map((f) => (
              <li key={f} className="rounded-xl border p-3">
                <Badge tone="warn">{FLAG_LABEL[f] ?? f}</Badge>
                <p className="mt-2 text-sm leading-relaxed">{FLAG_EXPLAIN[f] ?? "Flagged by a fixed rule."}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No rule flagged this search.</p>}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Flags come from fixed word rules. They point at searches worth a look; a person decides.</p>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Details</div>
        <dl className="divide-y rounded-xl border">
          {items.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium tabular">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 px-3 py-2 text-sm">
            <dt className="text-muted-foreground">Row comes from</dt>
            <dd className="text-right">{r.source || "–"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
