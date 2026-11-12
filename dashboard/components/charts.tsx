"use client";
/** Charts, all drawn with Recharts in one style: thin grid, rounded bars, rupee axes, tooltips in plain words. */
import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { dshort, inr, lakh, n0, pct } from "@/lib/format";

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
const rupeeTick = (v: number) => (v >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `₹${Math.round(v / 1e3)}k` : `₹${v}`);

type TipRow = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number };
function TooltipBox({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: TipRow[]; label?: string | number; fmt?: (v: number, key?: string) => string; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined && p.value !== 0);
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{labelFmt ? labelFmt(String(label)) : String(label)}</div>
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 tabular">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-4 font-medium">{fmt ? fmt(Number(p.value), String(p.dataKey)) : String(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export type SeriesKey = { key: string; label: string; color: string };

/** Stacked daily bars, e.g. spend by project. */
export function StackedDaily({ data, keys, height = 260, money = true }: { data: Record<string, unknown>[]; keys: SeriesKey[]; height?: number; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="day" tickFormatter={dshort} minTickGap={24} {...axis} />
        <YAxis tickFormatter={money ? rupeeTick : (v: number) => n0(v)} width={52} {...axis} />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<TooltipBox fmt={money ? (v) => inr(v) : (v) => n0(v)} labelFmt={dshort} />} />
        {keys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} name={k.label} stackId="a" fill={k.color} radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One series as a soft area (a project's daily spend). */
export function AreaDaily({ data, dataKey, color, height = 180 }: { data: Record<string, unknown>[]; dataKey: string; color: string; height?: number }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="day" tickFormatter={dshort} minTickGap={24} {...axis} />
        <YAxis tickFormatter={rupeeTick} width={52} {...axis} />
        <Tooltip content={<TooltipBox fmt={(v) => inr(v)} labelFmt={dshort} />} />
        <Area type="monotone" dataKey={dataKey} name="Spend" stroke={color} strokeWidth={2} fill={`url(#g${id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Tiny trend line for stat cards and project cards. */
export function Sparkline({ values, color, height = 40 }: { values: number[]; color: string; height?: number }) {
  const data = values.map((v, i) => ({ i, v }));
  const id = React.useId().replace(/:/g, "");
  if (!values.length) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#s${id})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars, one per row (e.g. cost per conversion by campaign). */
export function HBars({ data, valueKey, labelKey, color, fmt = (v: number) => inr(v), height }: { data: Record<string, unknown>[]; valueKey: string; labelKey: string; color: string | ((row: Record<string, unknown>) => string); fmt?: (v: number) => string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, data.length * 34 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" tickFormatter={(v: number) => fmt(v)} {...axis} />
        <YAxis type="category" dataKey={labelKey} width={210} {...axis} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<TooltipBox fmt={(v) => fmt(v)} />} />
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} name="Value">
          {data.map((row, i) => <Cell key={i} fill={typeof color === "function" ? color(row) : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Counts per day stacked by status (agency follow-through). */
export function StackedCounts({ data, keys, height = 260 }: { data: Record<string, unknown>[]; keys: SeriesKey[]; height?: number }) {
  return <StackedDaily data={data} keys={keys} height={height} money={false} />;
}

/** Simple vertical bars with category labels (Quality Score, delay in days). */
export function Columns({ data, xKey, yKey, color, height = 220, money = false, colorOf }: { data: Record<string, unknown>[]; xKey: string; yKey: string; color: string; height?: number; money?: boolean; colorOf?: (row: Record<string, unknown>) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis tickFormatter={money ? rupeeTick : (v: number) => n0(v)} width={52} {...axis} />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<TooltipBox fmt={money ? (v) => inr(v) : (v) => n0(v)} />} />
        <Bar dataKey={yKey} name={money ? "Spend" : "Count"} radius={[4, 4, 0, 0]}>
          {data.map((row, i) => <Cell key={i} fill={colorOf ? colorOf(row) : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Campaign daily spend (bars) with impression share lines (right axis). */
export function SpendShare({ data, height = 260 }: { data: Record<string, unknown>[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="day" tickFormatter={dshort} minTickGap={24} {...axis} />
        <YAxis yAxisId="r" tickFormatter={rupeeTick} width={52} {...axis} />
        <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} width={40} {...axis} />
        <Tooltip content={<TooltipBox fmt={(v, k) => (k === "cost" ? inr(v) : pct(v, 1))} labelFmt={dshort} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar yAxisId="r" dataKey="cost" name="Spend" fill="var(--primary)" opacity={0.75} radius={[3, 3, 0, 0]} />
        <Line yAxisId="p" dataKey="is_pct" name="Shown" stroke="var(--shown)" dot={false} strokeWidth={2} connectNulls />
        <Line yAxisId="p" dataKey="lost_budget_pct" name="Missed: budget" stroke="var(--lost-budget)" dot={false} strokeWidth={1.6} connectNulls />
        <Line yAxisId="p" dataKey="lost_rank_pct" name="Missed: lost auction" stroke="var(--lost-rank)" dot={false} strokeWidth={1.6} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** The CTM case: searches it could enter (line, log scale) against times it showed (bars), with change days marked. */
export function CtmChart({ data, markers, height = 300 }: { data: Record<string, unknown>[]; markers: { day: string; label: string }[]; height?: number }) {
  const safe = data.map((d) => ({ ...d, impr: (d.impr as number) > 0 ? d.impr : null, eligible: (d.eligible as number) > 0 ? d.eligible : null }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={safe} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="day" tickFormatter={dshort} minTickGap={24} {...axis} />
        <YAxis scale="log" domain={[1, "auto"]} allowDataOverflow tickFormatter={(v: number) => n0(v)} width={52} {...axis} />
        <Tooltip content={<TooltipBox fmt={(v) => n0(v)} labelFmt={dshort} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {markers.map((m) => <ReferenceLine key={m.day} x={m.day} stroke="var(--warn)" strokeDasharray="4 3" />)}
        <Bar dataKey="impr" name="Times it showed" fill="var(--shown)" opacity={0.75} radius={[3, 3, 0, 0]} />
        <Line dataKey="eligible" name="Searches it could enter (estimate)" stroke="var(--p-ivory)" strokeWidth={2.2} dot={{ r: 2 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** “Can it show?”: share of searches shown, missed for budget, missed for rank, as one slim bar. */
export function ShowBar({ shown, budget, rank, compact = false }: { shown: number | null; budget: number | null; rank: number | null; compact?: boolean }) {
  if (shown === null && rank === null) return <span className="text-xs text-muted-foreground">no data</span>;
  const s = shown ?? 0, b = budget ?? 0, r = rank ?? (shown === null ? 90 : 0);
  return (
    <div className="min-w-[120px]">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${s}%`, background: "var(--shown)" }} />
        <div style={{ width: `${b}%`, background: "var(--lost-budget)" }} />
        <div style={{ width: `${r}%`, background: "var(--lost-rank)" }} />
      </div>
      {!compact ? (
        <div className="mt-1 text-[11px] text-muted-foreground tabular">
          {shown === null ? "under 10% shown" : `${pct(s)} shown`} · {pct(b)} budget · {pct(rank ?? r)} rank
        </div>
      ) : null}
    </div>
  );
}

export const money = { inr, lakh };
