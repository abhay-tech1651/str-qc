"use client";
/** Domain building blocks shared by the pages: stat cards, project cards, issue lists with a details drawer. */
import * as React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Copy, Check } from "lucide-react";
import { Badge, Button, Card, ProjectTag, Segmented, Sheet } from "./ui";
import { Sparkline } from "./charts";
import { agencyMessage, fixText, fixValue, MONEY_KIND, OWNER_LABEL, SEVERITY, TYPE_LABEL } from "@/lib/fixes";
import { change, cn, inr, lakh, n1, pcolor, pct, plural, priceLabel } from "@/lib/format";
import type { Campaign, Fix, Model } from "@/lib/types";

/* ---------------------------------------------------------------- stat card */
export function StatCard({ label, value, sub, delta, invert, spark, color = "var(--primary)", tone }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; delta?: { label: string; dir: "up" | "down" | "flat" }; invert?: boolean;
  spark?: number[]; color?: string; tone?: "good" | "bad" | "warn";
}) {
  const good = delta && delta.dir !== "flat" && ((delta.dir === "down") === !!invert);
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        {delta && delta.label ? (
          <Badge tone={delta.dir === "flat" ? "muted" : good ? "good" : "warn"} className="tabular">{delta.label}</Badge>
        ) : null}
      </div>
      <div className={cn("mt-2 text-[26px] font-semibold leading-none tracking-tight tabular", tone === "bad" && "text-bad", tone === "good" && "text-good", tone === "warn" && "text-[color:var(--warn)]")}>{value}</div>
      {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
      {spark && spark.length > 1 ? <div className="-mx-1 mt-3"><Sparkline values={spark} color={color} height={36} /></div> : null}
    </Card>
  );
}

/* ---------------------------------------------------------------- verdict and severity */
export function VerdictBadge({ c }: { c: Campaign }) {
  const s = c.last7;
  switch (c.verdict) {
    case "budget": return <Badge tone="warn">Held back by budget</Badge>;
    case "rank": return <Badge tone="bad">Losing auctions</Badge>;
    case "underspending": return <Badge tone="muted">Uses {pct(s?.budget_use)} of budget</Badge>;
    case "brand_gap": return <Badge tone="warn">Missing brand searches</Badge>;
    case "idle": return <Badge tone="muted">Not spending</Badge>;
    default: return <Badge tone="good">Healthy</Badge>;
  }
}

export function SeverityBadge({ s }: { s: Fix["severity"] }) {
  return <Badge tone={SEVERITY[s].tone}>{SEVERITY[s].label}</Badge>;
}

const projectName = (m: Model, id: string) => m.projects.find((p) => p.id === id)?.name.replace(" County", "") ?? "Other";

/* ---------------------------------------------------------------- issue drawer */
export function IssueDrawer({ fix, model, onClose }: { fix: Fix | null; model: Model; onClose: () => void }) {
  if (!fix) return null;
  const t = fixText(fix, model);
  return (
    <Sheet open={!!fix} onOpenChange={(o) => !o && onClose()} title={t.title}
      description={<span className="flex flex-wrap items-center gap-2"><SeverityBadge s={fix.severity} /><ProjectTag name={projectName(model, fix.project)} color={pcolor(fix.project)} /><span>· {OWNER_LABEL[fix.owner]}</span></span>}>
      <div className="space-y-6">
        {fix.money ? (
          <div className="rounded-xl border bg-muted/40 p-4">
            <div className="text-[26px] font-semibold tracking-tight tabular">{inr(fix.money)}</div>
            <div className="text-xs text-muted-foreground">{MONEY_KIND[fix.money_kind ?? ""] ?? ""}</div>
          </div>
        ) : null}
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">What happened</div>
          <p className="text-[15px] leading-relaxed">{t.detail}</p>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">What to do</div>
          <p className="text-[15px] leading-relaxed">{t.todo}</p>
        </div>
        <Button asChild variant="outline"><Link href={t.href} onClick={onClose}>{t.link} <ArrowRight /></Link></Button>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- issue rows */
export function IssueRow({ fix, model, onOpen, showProject = true }: { fix: Fix; model: Model; onOpen: (f: Fix) => void; showProject?: boolean }) {
  const t = fixText(fix, model);
  return (
    <button type="button" onClick={() => onOpen(fix)}
      className="group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/60">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", fix.severity === "high" ? "bg-bad" : fix.severity === "medium" ? "bg-[color:var(--warn)]" : "bg-muted-foreground")} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-snug">{t.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {showProject ? <ProjectTag name={projectName(model, fix.project)} color={pcolor(fix.project)} /> : null}
          <span>{OWNER_LABEL[fix.owner]}</span>
          <span>{SEVERITY[fix.severity].label}</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        {fix.money ? <span className="block text-sm font-semibold tabular">{lakh(fix.money)}</span> : null}
        <ArrowUpRight className="ml-auto mt-1 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </button>
  );
}

export function IssueList({ fixes, model, showProject = true, limit }: { fixes: Fix[]; model: Model; showProject?: boolean; limit?: number }) {
  const [open, setOpen] = React.useState<Fix | null>(null);
  const list = limit ? fixes.slice(0, limit) : fixes;
  return (
    <>
      <div className="divide-y">
        {list.map((f, i) => <IssueRow key={`${f.type}-${f.project}-${i}`} fix={f} model={model} onOpen={setOpen} showProject={showProject} />)}
      </div>
      <IssueDrawer fix={open} model={model} onClose={() => setOpen(null)} />
    </>
  );
}

/* ---------------------------------------------------------------- the issues page body (filters + grouped list) */
export function IssuesBoard({ model }: { model: Model }) {
  const [owner, setOwner] = React.useState<"all" | "Agency" | "County" | "Google CTM team">("all");
  const [project, setProject] = React.useState("all");
  const [view, setView] = React.useState<"list" | "grouped">("list");
  const [copied, setCopied] = React.useState(false);
  const [open, setOpen] = React.useState<Fix | null>(null);
  const fixes = model.fixes.filter((f) => (owner === "all" || f.owner === owner) && (project === "all" || f.project === project));
  const copy = async () => {
    try { await navigator.clipboard.writeText(agencyMessage(model)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard not allowed */ }
  };
  const groups = React.useMemo(() => {
    const order: string[] = []; const by: Record<string, Fix[]> = {};
    for (const f of fixes) { if (!by[f.type]) { by[f.type] = []; order.push(f.type); } by[f.type].push(f); }
    return order.map((t) => ({ type: t, items: by[t], money: by[t].reduce((a, f) => a + (f.money ?? 0), 0) }));
  }, [fixes]);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={owner} onChange={setOwner} options={[{ value: "all", label: "Everyone" }, { value: "Agency", label: "Agency" }, { value: "County", label: "County" }, { value: "Google CTM team", label: "Google" }]} />
        <Segmented value={project} onChange={setProject} options={[{ value: "all", label: "All projects" }, ...model.projects.map((p) => ({ value: p.id, label: p.name.replace(" County", "") }))]} />
        <Segmented value={view} onChange={setView} options={[{ value: "list", label: "By priority" }, { value: "grouped", label: "By problem" }]} />
        <Button variant="outline" size="sm" className="ml-auto" onClick={copy}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy message for the agency"}</Button>
      </div>
      <Card className="p-2">
        {fixes.length === 0 ? <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing open for this filter.</div> : view === "list" ? (
          <div className="divide-y">{fixes.map((f, i) => <IssueRow key={i} fix={f} model={model} onOpen={setOpen} />)}</div>
        ) : (
          <div className="divide-y">
            {groups.map((g) => (
              <div key={g.type} className="px-3 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[14px] font-medium">{TYPE_LABEL[g.type] ?? g.type}</div>
                  {g.money ? <div className="text-sm font-semibold tabular">{lakh(g.money)}</div> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {g.items.map((f, i) => (
                    <button key={i} type="button" onClick={() => setOpen(f)}
                      className="inline-flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs hover:border-primary">
                      <span className="size-2 rounded-full" style={{ background: pcolor(f.project) }} />
                      {projectName(model, f.project)} <span className="text-muted-foreground tabular">{fixValue(f)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <IssueDrawer fix={open} model={model} onClose={() => setOpen(null)} />
    </>
  );
}

/* ---------------------------------------------------------------- project card */
export function ProjectCard({ model, id }: { model: Model; id: string }) {
  const p = model.projects.find((x) => x.id === id)!;
  const ps = model.project_stats[id];
  const hasCamp = model.campaigns.some((c) => c.project === id);
  const fx = model.fixes.filter((f) => f.project === id && f.severity !== "low");
  const highs = fx.filter((f) => f.severity === "high").length;
  const d = change(ps.last7.cost, ps.prev7.cost);
  const color = pcolor(id);
  return (
    <Card className="group relative flex flex-col overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">{p.name}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{[p.location, priceLabel(p)].filter(Boolean).join(" · ")}</div>
        </div>
        {highs ? <Badge tone="bad">{highs} urgent</Badge> : fx.length ? <Badge tone="warn">{fx.length} to fix</Badge> : <Badge tone="good">On track</Badge>}
      </div>
      {hasCamp ? (
        <>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-[24px] font-semibold tracking-tight tabular">{lakh(ps.last7.cost)}</span>
            {d.label ? <Badge tone={d.dir === "flat" ? "muted" : d.dir === "up" ? "warn" : "good"} className="tabular">{d.label}</Badge> : null}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            spent in the last 7 days · {n1(ps.last7.conv)} Google {plural(ps.last7.conv, "conversion")}{ps.last7.cpa ? ` · ${inr(ps.last7.cpa)} each` : ""}
          </div>
          <div className="-mx-1 mt-3"><Sparkline values={ps.daily.map((x) => x.cost)} color={color} height={40} /></div>
        </>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">Spend and conversions appear when campaign data is imported.</p>
      )}
      <div className="mt-3 border-t pt-3 text-[13px] leading-snug">{fx[0] ? fixText(fx[0], model).title : "Nothing urgent in the data."}</div>
      <Link href={`/projects/${id}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary">
        Open {p.name.replace(" County", "")} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </Card>
  );
}
