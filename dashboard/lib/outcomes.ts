/**
 * How the ledger's outcomes are shown: six parts of the money (each search's spend lands in exactly one), with plain
 * names, what each means, and its colour. The colours are a validated set (colour-blind safe next to each other, light
 * and dark); the order below is the order on every bar, so neighbours never change. Client-safe: no server imports.
 */
import type { Outcome } from "./ledger-core";

export type Part = "results" | "added" | "add_pending" | "kept" | "junk_blocked" | "junk_open";

export const PARTS: { part: Part; label: string; short: string; means: string; color: string; outcomes: Outcome[]; open?: boolean }[] = [
  { part: "results", label: "Brought conversions", short: "Conversions", color: "var(--m-results)", outcomes: ["results", "results_blocked"],
    means: "Searches that brought at least one conversion (Google's count)." },
  { part: "added", label: "Added as keywords", short: "Added", color: "var(--m-added)", outcomes: ["add_done"],
    means: "The sheet said Add, and they are keywords now." },
  { part: "add_pending", label: "Add not done yet", short: "Add pending", color: "var(--m-add-pending)", outcomes: ["add_open", "add_blocked"], open: true,
    means: "The sheet said Add, but they are not keywords yet, or a negative blocks them." },
  { part: "kept", label: "Left running, no conversion yet", short: "Left running", color: "var(--m-kept)", outcomes: ["kept", "discuss", "not_reviewed"],
    means: "The sheet left them as they are (no Add, no Exclude). They have not converted in this period." },
  { part: "junk_blocked", label: "Junk, now blocked", short: "Junk blocked", color: "var(--m-junk-blocked)", outcomes: ["junk_blocked", "blocked_anyway"],
    means: "Searches the sheet called junk, or that a negative covers anyway: they cannot cost money again." },
  { part: "junk_open", label: "Junk, still not blocked", short: "Junk open", color: "var(--m-junk-open)", outcomes: ["junk_open"], open: true,
    means: "The sheet said Exclude, but no negative blocks them yet, so they can keep costing money." },
];

export const PART_OF: Record<Outcome, Part> = Object.fromEntries(PARTS.flatMap((p) => p.outcomes.map((o) => [o, p.part]))) as Record<Outcome, Part>;

export const OUTCOME_LABEL: Record<Outcome, string> = {
  results: "Brought conversions",
  results_blocked: "Converted, now blocked",
  junk_blocked: "Junk, blocked",
  junk_open: "Junk, not blocked",
  add_done: "Added",
  add_open: "Add not done",
  add_blocked: "Add blocked by a negative",
  discuss: "Waiting: Discuss",
  kept: "Left running",
  blocked_anyway: "Blocked anyway",
  not_reviewed: "Not in the sheet",
};

/** Is this outcome something still to do? */
export const OPEN: Outcome[] = ["junk_open", "add_open", "add_blocked", "results_blocked", "not_reviewed"];

/** Spend per part for a split (outcome → {n, cost}). */
export function parts(by: Record<Outcome, { n: number; cost: number }>) {
  return PARTS.map((p) => ({ ...p, n: p.outcomes.reduce((s, o) => s + (by[o]?.n ?? 0), 0), cost: p.outcomes.reduce((s, o) => s + (by[o]?.cost ?? 0), 0) }));
}
