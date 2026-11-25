"use client";
/**
 * The exact rows behind one issue, shown inside its panel: the searches, calls, keywords, negatives or campaign that
 * make up the number in the title. Searchable, sortable and downloadable; nothing is summarised away.
 */
import * as React from "react";
import { DataTable, type Column } from "./data-table";
import { Badge } from "./ui";
import { dshort, inr, n0, n1, pct } from "@/lib/format";
import type { Fix, Model } from "@/lib/types";

type Row = Record<string, unknown>;
const txt = (k: string, label: string, opts: Partial<Column<Row>> = {}): Column<Row> => ({ key: k, label, value: (r) => (r[k] as string) ?? "", ...opts });
const money = (k: string, label = "Cost"): Column<Row> => ({ key: k, label, align: "right", render: (r) => inr(Number(r[k]) || 0), value: (r) => Number(r[k]) || 0 });
const num = (k: string, label: string): Column<Row> => ({ key: k, label, align: "right", render: (r) => n0(Number(r[k]) || 0), value: (r) => Number(r[k]) || 0 });
const day = (k = "day", label = "Day"): Column<Row> => ({ key: k, label, render: (r) => <span className="whitespace-nowrap tabular">{dshort(String(r[k] ?? "")) || "–"}</span>, value: (r) => String(r[k] ?? "") });
const code = (k: string, label: string): Column<Row> => ({ key: k, label, render: (r) => r[k] ? <code className="rounded border bg-muted px-1 font-mono text-[12px]">{String(r[k])}</code> : "–", value: (r) => String(r[k] ?? "") });

export function IssueEvidence({ fix, model }: { fix: Fix; model: Model }) {
  const label = React.useCallback((id: string) => model.campaigns.find((c) => c.id === id)?.label ?? id, [model]);
  const camp: Column<Row> = { key: "campaign", label: "Campaign · ad group", render: (r) => <span className="text-[13px]">{label(String(r.campaign))}{r.ad_group ? ` · ${r.ad_group}` : ""}</span>, value: (r) => `${label(String(r.campaign))} ${r.ad_group ?? ""}` };
  const mine = <T extends { project: string }>(rows: T[] | undefined) => (rows ?? []).filter((r) => r.project === fix.project) as unknown as Row[];
  const p = fix.params || {};

  let rows: Row[] = [];
  let cols: Column<Row>[] = [];
  let sortKey = "cost";
  let note: React.ReactNode = null;
  switch (fix.type) {
    case "overdue_excludes":
      rows = mine(model.agency.overdue_excludes);
      cols = [day(), txt("term", "Search term", { render: (r) => <span className="font-medium">{String(r.term)}</span> }), camp, money("cost"), code("neg_term", "Negative written")];
      note = "Open Agency report › Excludes that are still not working, and click a row for the full story of the search.";
      break;
    case "overdue_adds":
      rows = mine(model.agency.overdue_adds);
      cols = [day(), txt("term", "Search term", { render: (r) => <span className="font-medium">{String(r.term)}</span> }), camp, num("clicks", "Clicks"), money("cost")];
      break;
    case "no_negative_written":
      rows = mine(model.agency.no_negative_rows);
      cols = [day(), txt("term", "Search term", { render: (r) => <span className="font-medium">{String(r.term)}</span> }), camp, money("cost"), txt("status", "What happened")];
      break;
    case "brand_no_word":
      rows = mine(model.risks.brand_no_word);
      cols = [day(), txt("term", "Search term", { render: (r) => <span className="font-medium">{String(r.term)}</span> }), camp, txt("keyword", "Keyword it matched"), num("clicks", "Clicks"), money("cost")];
      break;
    case "brand_leak":
      rows = mine(model.risks.brand_leak);
      cols = [day(), txt("term", "Search term", { render: (r) => <span className="font-medium">{String(r.term)}</span> }), camp, txt("keyword", "Keyword it matched"), money("cost")];
      break;
    case "blocked_keywords":
      rows = mine(model.risks.blocked);
      cols = [txt("keyword", "Our keyword", { render: (r) => <span className="font-medium">{String(r.keyword)}</span> }), camp, code("blocked_by", "Blocked by"), txt("level", "Level"), day("added", "Added"), txt("added_by", "Added by")];
      sortKey = "added";
      break;
    case "risky_negatives":
      rows = mine(model.risks.risky);
      cols = [code("item", "Negative"), camp, txt("why", "Why it is risky", { value: (r) => String(r.why).replace(/_/g, " ") }), day("added", "Added"), txt("added_by", "Added by")];
      sortKey = "added";
      break;
    case "product_mismatch":
      rows = mine(model.keywords?.product_mismatch);
      cols = [txt("keyword", "Keyword", { render: (r) => <span className="font-medium">{String(r.keyword)}</span> }), txt("match_type", "Match"), camp, num("clicks", "Clicks"), money("cost"), { key: "conv", label: "Conv.", align: "right", render: (r) => n1(Number(r.conv) || 0), value: (r) => Number(r.conv) || 0 }];
      break;
    case "landing_pages":
      rows = mine(model.keywords?.low_quality).filter((r) => String(r.landing_page) === "Below average");
      cols = [txt("keyword", "Keyword", { render: (r) => <span className="font-medium">{String(r.keyword)}</span> }), camp, txt("landing_page", "Landing page"), { key: "quality_score", label: "QS", align: "right", value: (r) => Number(r.quality_score) || 0 }, money("cost")];
      note = `These are the most expensive keywords with Quality Score 1–3 and a below-average landing page (${model.keywords?.from ? `${dshort(model.keywords.from)}–${dshort(model.keywords.to)}` : "keyword report period"}). The full list is on the Keywords page.`;
      break;
    case "self_competition":
      rows = (model.keywords?.duplicates ?? []).filter((r) => r.project === fix.project).map((r) => ({ ...r, campaigns: r.campaigns.map(label).join(" + ") }));
      cols = [txt("keyword", "Keyword", { render: (r) => <span className="font-medium">{String(r.keyword)}</span> }), txt("campaigns", "Runs in"), num("impr", "Impr."), money("cost")];
      break;
    default: {
      const ids: string[] = p.campaign ? [p.campaign] : Array.isArray(p.campaigns) ? p.campaigns.map((c: { id?: string; campaign?: string }) => c.id ?? c.campaign ?? "") : [];
      const cs = model.campaigns.filter((c) => (ids.length ? ids.includes(c.id) : c.project === fix.project));
      rows = cs.flatMap((c) => (["since", "last7", "prev7"] as const).map((w) => {
        const s = c[w];
        const win = model.windows[w];
        return s ? { campaign: c.id, window: w === "since" ? "Whole period" : w === "last7" ? (model.period?.name ?? "the last 7 days").replace(/^the /, "").replace(/^./, (c) => c.toUpperCase()) : (model.period?.prev ?? "the 7 days before").replace(/^the /, "").replace(/^./, (c) => c.toUpperCase()), span: win ? `${dshort(win.from)}–${dshort(win.to)}` : "", cost: s.cost, conv: s.conv, cpa: s.cpa, cpc: s.cpc, is: s.is_pct, lost_budget: s.lost_budget_pct, lost_rank: s.lost_rank_pct } : null;
      }).filter(Boolean) as Row[]);
      cols = [camp, txt("window", "Period", { render: (r) => <span className="whitespace-nowrap">{String(r.window)} <span className="text-muted-foreground">{String(r.span)}</span></span> }), money("cost"),
        { key: "conv", label: "Conv.", align: "right", render: (r) => n1(Number(r.conv) || 0), value: (r) => Number(r.conv) || 0 },
        { key: "cpa", label: "Cost/conv.", align: "right", render: (r) => (r.cpa == null ? "–" : inr(Number(r.cpa))), value: (r) => Number(r.cpa) || 0 },
        { key: "is", label: "Impr. share", align: "right", render: (r) => (r.is == null ? "–" : pct(Number(r.is))), value: (r) => Number(r.is) || 0 },
        { key: "lost_budget", label: "Lost: budget", align: "right", render: (r) => (r.lost_budget == null ? "–" : pct(Number(r.lost_budget))), value: (r) => Number(r.lost_budget) || 0 }];
      sortKey = "";
    }
  }

  if (!rows.length) return null;
  const total = rows.reduce((n, r) => n + (Number(r.cost) || 0), 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">The rows behind this</div>
        <Badge tone="muted">{n0(rows.length)} rows{total && sortKey === "cost" ? ` · ${inr(total)}` : ""}</Badge>
      </div>
      <DataTable rows={rows} columns={cols} pageSize={25} csvName={`${fix.project}-${fix.type}`} initialSort={sortKey ? { key: sortKey, dir: "desc" } : undefined} />
      {note ? <p className="mt-2 text-[12px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}
