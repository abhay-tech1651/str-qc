"use client";
/**
 * The period every page shows. The choice is kept in a cookie on this computer only; changing it reloads the numbers
 * on the server. "Default" keeps the dashboard's usual view: the last 7 days for spend, and all agency days for the checks.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Loader2 } from "lucide-react";
import { Button, Input, Select } from "./ui";
import { cn, drange } from "@/lib/format";

const OPTIONS = [
  { value: "all", label: "All days" },
  { value: "last7", label: "Last 7 days" },
  { value: "last14", label: "Last 14 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "lastmonth", label: "Last month" },
  { value: "custom", label: "Choose dates…" },
];

function save(key: string) {
  document.cookie = `qc_period=${encodeURIComponent(key)}; path=/; max-age=31536000; samesite=strict`;
}

export function PeriodPicker({ period }: { period: { key: string; from: string | null; to: string | null; last: string | null } }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const isCustom = period.key.startsWith("custom:");
  const [mode, setMode] = React.useState(isCustom ? "custom" : period.key);
  const [from, setFrom] = React.useState(period.from ?? "");
  const [to, setTo] = React.useState(period.to ?? "");
  React.useEffect(() => { setMode(period.key.startsWith("custom:") ? "custom" : period.key); setFrom(period.from ?? ""); setTo(period.to ?? ""); }, [period.key, period.from, period.to]);

  const apply = (key: string) => { save(key); start(() => router.refresh()); };
  const onSelect = (v: string) => { setMode(v); if (v !== "custom") apply(v); };
  const okCustom = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  return (
    <div className="flex items-center gap-1.5">
      <CalendarRange className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
      <Select aria-label="Period" value={mode} onChange={(e) => onSelect(e.target.value)} className={cn("h-8 max-w-[230px] text-[13px]", pending && "opacity-60")}>
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      {mode === "custom" ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (okCustom) apply(`custom:${from}:${to}`); }}>
          <Input type="date" aria-label="From" value={from} max={period.last ?? undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-[13px]" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" aria-label="To" value={to} max={period.last ?? undefined} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-[13px]" />
          <Button type="submit" size="sm" disabled={!okCustom || pending}>Show</Button>
        </form>
      ) : period.from && period.to ? (
        <span className="hidden whitespace-nowrap text-xs text-muted-foreground lg:inline">{drange(period.from, period.to)}</span>
      ) : null}
      {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}
