"use client";
/** Said vs done: the two charts (calls per sheet day by outcome, and how many days late the applied ones were). */
import { Columns, StackedCounts } from "./charts";
import type { Agency } from "@/lib/types";

export const OUTCOME_KEYS = [
  { key: "applied", label: "Applied", color: "var(--shown)" },
  { key: "applied_elsewhere", label: "Applied in another place", color: "var(--lost-budget)" },
  { key: "waiting", label: "Waiting (still inside the grace days)", color: "var(--p-other)" },
  { key: "overdue", label: "Never applied", color: "var(--lost-rank)" },
  { key: "unchecked", label: "Not checked", color: "var(--border)" },
];

export function OutcomeLegend() {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {OUTCOME_KEYS.map((k) => (
        <span key={k.key} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: k.color }} />
          {k.label}
        </span>
      ))}
    </div>
  );
}

export function ByDayChart({ data }: { data: Agency["by_day"] }) {
  return <StackedCounts data={data as unknown as Record<string, unknown>[]} keys={OUTCOME_KEYS} height={280} />;
}

const lagNum = (d: string) => (d.endsWith("+") ? Number(d.slice(0, -1)) : Number(d));

export function LagChart({ data, grace }: { data: Agency["lag"]; grace: number }) {
  const rows = data.map((x) => ({
    label: x.days === "0" ? "same day" : x.days === "1" ? "1 day" : `${x.days} days`,
    count: x.count,
    late: lagNum(x.days) > grace,
  }));
  return (
    <Columns data={rows} xKey="label" yKey="count" color="var(--shown)" height={240}
      colorOf={(r) => (r.late ? "var(--lost-budget)" : "var(--shown)")} />
  );
}
