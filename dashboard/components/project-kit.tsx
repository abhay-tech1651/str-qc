"use client";
/** Small pieces the project page shares between its tabs: stat tiles, negative-keyword chips, campaign names. */
import * as React from "react";
import { cn } from "@/lib/format";
import type { Model } from "@/lib/types";

/** A compact number tile for the top of a tab. */
export function MiniStat({ label, value, sub, tone }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: "bad" | "good" | "warn" }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 text-[22px] font-semibold leading-none tracking-tight tabular",
        tone === "bad" && "text-bad", tone === "good" && "text-good", tone === "warn" && "text-[color:var(--warn)]")}>{value}</div>
      {sub ? <div className="mt-2 text-xs leading-snug text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** A negative keyword or a keyword shown as code, so its exact spelling and match marks are visible. */
export function Neg({ children }: { children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "" || children === "-";
  if (empty) return <span className="text-muted-foreground">–</span>;
  return <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[12px]">{children}</code>;
}

/** A heading for one list inside a tab. */
export function ListHead({ title, description, count }: { title: React.ReactNode; description?: React.ReactNode; count?: number }) {
  return (
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        {title}
        {typeof count === "number" ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular">{count.toLocaleString("en-IN")}</span> : null}
      </h3>
      {description ? <p className="mt-0.5 max-w-3xl text-[13px] text-muted-foreground">{description}</p> : null}
    </div>
  );
}

/** Campaign id to its short name (falls back to the id for campaigns outside the campaign report). */
export function useLabel(model: Model) {
  return React.useMemo(() => {
    const map = new Map(model.campaigns.map((c) => [c.id, c.label]));
    return (id: string | null | undefined) => (id ? map.get(id) ?? id : "–");
  }, [model]);
}

/** Text or a dash, never “undefined”. */
export const txt = (v: unknown) => (v === null || v === undefined || v === "" || v === "-" ? "–" : String(v));
