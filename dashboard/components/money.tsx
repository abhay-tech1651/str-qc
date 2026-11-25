"use client";
/**
 * The money map: one bar split into the six parts of the ledger (outcomes.ts) and the list that names each part.
 * The story of one search is in case-file.tsx.
 */
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Badge, Tip } from "./ui";
import { cn, inr, n0 } from "@/lib/format";
import { PARTS, PART_OF, OUTCOME_LABEL, type Part } from "@/lib/outcomes";
import type { Outcome, Search } from "@/lib/ledger-core";

export type PartAmount = { part: Part; label: string; short: string; means: string; color: string; n: number; cost: number; open?: boolean };
const share = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);

/** One whole split into its parts. Thin by default (the figures sit beside it); `tall` prints the share on each part that fits. */
export function MoneyBar({ parts, total, tall = false, className }: { parts: PartAmount[]; total: number; tall?: boolean; className?: string }) {
  const shown = parts.filter((p) => p.cost > 0);
  return (
    <div className={cn("flex w-full gap-[2px] overflow-hidden rounded-[4px]", tall ? "h-9" : "h-2.5", className)} role="img"
      aria-label={shown.map((p) => `${p.label} ${inr(p.cost)}`).join(", ")}>
      {shown.map((p) => {
        const s = share(p.cost, total);
        return (
          <Tip key={p.part} content={<div><div className="font-medium">{p.label}</div><div className="tabular text-muted-foreground">{inr(p.cost)} · {s.toFixed(1)}% · {n0(p.n)} searches</div></div>}>
            <div className="flex h-full min-w-[3px] items-center justify-center first:rounded-l-[4px] last:rounded-r-[4px]" style={{ width: `${s}%`, background: p.color }}>
              {tall && s >= 7 ? <span className="tabular text-[11px] font-semibold text-white/95 [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]">{Math.round(s)}%</span> : null}
            </div>
          </Tip>
        );
      })}
    </div>
  );
}

/** The parts with their names, meaning and amounts; each links to its searches. */
export function MoneyList({ parts, total, base }: { parts: PartAmount[]; total: number; base: string }) {
  return (
    <ul className="divide-y">
      {parts.map((p) => (
        <li key={p.part}>
          <Link href={`${base}${base.includes("?") ? "&" : "?"}part=${p.part}`}className="group grid grid-cols-[14px_1fr_auto] items-start gap-x-3 gap-y-0.5 py-3 hover:bg-muted/50 sm:grid-cols-[14px_1fr_110px_70px_90px] sm:items-center sm:px-2">
            <span className="mt-1 size-3 rounded-[3px] sm:mt-0" style={{ background: p.color }} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                {p.label}
                {p.open && p.n > 0 ? <Badge tone="bad" className="gap-1"><CircleAlert className="size-3" /> to fix</Badge> : null}
              </span>
              <span className="block text-[12.5px] leading-snug text-muted-foreground">{p.means}</span>
            </span>
            <span className="tabular text-right text-[15px] font-semibold">{inr(p.cost)}</span>
            <span className="tabular col-start-2 text-[12.5px] text-muted-foreground sm:col-start-auto sm:text-right">{share(p.cost, total).toFixed(1)}%</span>
            <span className="tabular hidden text-right text-[12.5px] text-muted-foreground group-hover:text-foreground sm:block">{n0(p.n)} searches →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Outcome as a small coloured label. */
export function OutcomeTag({ o }: { o: Outcome }) {
  const p = PARTS.find((x) => x.part === PART_OF[o])!;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px]">
      <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />
      {OUTCOME_LABEL[o]}
    </span>
  );
}

const BLOCK_KIND: Record<string, string> = {
  term: "By its own full search term: safe, it blocks nothing else.",
  part: "By part of the search (two or more of its words).",
  one_word: "Only by a single word: it also blocks every other search with that word. Better: negate the full search term.",
};
const WRITTEN: Record<string, string> = { term: "the full search term", part: "part of the search", one_word: "one word (County asks for the full term)", different: "words not in the search" };

/** What is in Google Ads now, in words. */
export function accountNow(s: Pick<Search, "blocked" | "blockers" | "is_keyword" | "lists">): string {
  if (s.blocked === "yes") return `Blocked by ${s.blockers.map((b) => `${b.text}${b.level === "ad group" ? ` (ad group ${b.ad_group})` : ""}${b.county_rule ? " (County's rule: another County project)" : ""}`).join(", ")}`;
  if (s.blocked === "partly") return `Blocked only in some ad groups: ${s.blockers.map((b) => `${b.text} (${b.ad_group})`).join(", ")}`;
  if (s.is_keyword) return "It is a keyword";
  return s.lists.length ? "Not blocked by any campaign or ad-group negative" : "Not blocked";
}
