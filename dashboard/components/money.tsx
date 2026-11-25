"use client";
/**
 * The money map: one bar split into the six parts of the ledger (outcomes.ts), the list that names each part, and the
 * drawer that tells one search's whole story (what it cost, what the sheet said, what is in Google Ads now).
 */
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { Badge, Sheet, Tip } from "./ui";
import { cn, dlong, dshort, inr, n0 } from "@/lib/format";
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

interface Seen { day: string; campaign: string; ad_group: string; clicks: number; cost: number }
interface ChangeLine { ts: string; day: string; user: string; campaign: string; ad_group: string; item: string; same_campaign: boolean }

/** One search, start to finish. */
export function SearchDrawer({ s, onClose, label }: { s: Search | null; onClose: () => void; label: (c: string) => string }) {
  const [ev, setEv] = React.useState<{ seen: Seen[]; matches: ChangeLine[] } | null>(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!s) return;
    setEv(null);
    setErr("");
    const q = new URLSearchParams({ term: s.term, campaign: s.campaign, ad_group: s.ad_groups[0] ?? "", day: s.first_day, kind: s.verdict === "Add" ? "add" : "exclude" });
    fetch(`/api/evidence?${q}`, { cache: "no-store" }).then((r) => r.json()).then((b) => (b.error ? setErr(b.error) : setEv(b))).catch(() => setErr("The dashboard could not be reached."));
  }, [s]);
  if (!s) return <Sheet open={false} onOpenChange={() => onClose()} title="">{null}</Sheet>;
  const seen = (ev?.seen ?? []).filter((x) => x.campaign === s.campaign);
  const lines = (ev?.matches ?? []).filter((m) => m.same_campaign);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={<span>“{s.term}”</span>} description={`${label(s.campaign)} · ${s.ad_groups.join(", ")}`}>
      <div className="space-y-6 text-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Spent", inr(s.cost)], ["Clicks", n0(s.clicks)], ["Conversions", n0(s.conv)], ["Days seen", n0(s.days)]].map(([k, v]) => (
            <div key={k} className="rounded-lg border bg-card px-3 py-2"><div className="text-xs text-muted-foreground">{k}</div><div className="tabular text-base font-semibold">{v}</div></div>
          ))}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2"><span className="font-medium">Where it stands</span><OutcomeTag o={s.outcome} /></div>
          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-muted-foreground">First seen</dt><dd>{dlong(s.first_day)}{s.last_day !== s.first_day ? `, last ${dlong(s.last_day)}` : ""}</dd>
            <dt className="text-muted-foreground">The sheet said</dt><dd>{s.verdict}{s.call_day ? ` (${dshort(s.call_day)} tab)` : ""}</dd>
            {s.intent ? <><dt className="text-muted-foreground">Buying intent</dt><dd><span className={cn("font-medium", s.intent === "high" ? "text-good" : s.intent === "low" ? "text-muted-foreground" : "")}>{s.intent[0].toUpperCase() + s.intent.slice(1)}</span><span className="text-muted-foreground"> · {s.intent_why}</span></dd></> : null}
            {s.neg_written ? <><dt className="text-muted-foreground">Negative written</dt><dd><span className="font-mono text-[12.5px]">{s.neg_written}</span>{WRITTEN[s.neg_written_kind] ? <span className="text-muted-foreground"> · {WRITTEN[s.neg_written_kind]}</span> : null}</dd></> : s.verdict === "Exclude" ? <><dt className="text-muted-foreground">Negative written</dt><dd className="text-muted-foreground">None in the sheet</dd></> : null}
            {s.county_comment ? <><dt className="text-muted-foreground">County comment</dt><dd>{s.county_comment}</dd></> : null}
            <dt className="text-muted-foreground">Google Ads now</dt><dd>{accountNow(s)}{s.block_kind ? <span className={cn("block text-[12.5px]", s.block_kind === "one_word" ? "text-bad" : "text-muted-foreground")}>{BLOCK_KIND[s.block_kind]}</span> : null}</dd>
            {s.lists.length && s.blocked !== "yes" ? <><dt className="text-muted-foreground">Shared lists</dt><dd>{s.lists.join(", ")}: their contents are not loaded, so it may be blocked there.</dd></> : null}
            {s.cost_after_call > 0 ? <><dt className="text-muted-foreground">After the call</dt><dd>{inr(s.cost_after_call)} spent after the sheet said Exclude{s.cost_after_deadline > 0 ? `, ${inr(s.cost_after_deadline)} of it after the 3-day deadline` : ""}</dd></> : null}
            <dt className="text-muted-foreground">Matched by</dt><dd>{s.match_types.join(", ")}{s.keywords.length ? ` · keyword ${s.keywords.join(", ")}` : ""}</dd>
          </dl>
        </div>
        <div>
          <div className="mb-2 font-medium">Every day it cost money</div>
          {err ? <p className="text-bad">{err}</p> : !ev ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p> : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-[13px]"><thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-1.5">Day</th><th className="px-3 py-1.5">Ad group</th><th className="px-3 py-1.5 text-right">Clicks</th><th className="px-3 py-1.5 text-right">Cost</th></tr></thead>
                <tbody className="divide-y">{seen.map((x, i) => (
                  <tr key={i} className={cn(s.call_day && x.day > s.call_day && s.verdict === "Exclude" && "bg-bad-soft/60")}><td className="px-3 py-1.5">{dshort(x.day)}</td><td className="px-3 py-1.5">{x.ad_group}</td><td className="tabular px-3 py-1.5 text-right">{n0(x.clicks)}</td><td className="tabular px-3 py-1.5 text-right">{inr(x.cost)}</td></tr>
                ))}</tbody></table>
            </div>
          )}
          {s.verdict === "Exclude" ? <p className="mt-2 text-xs text-muted-foreground">Shaded rows came after the sheet said Exclude.</p> : null}
        </div>
        {lines.length ? (
          <div>
            <div className="mb-2 font-medium">{s.verdict === "Add" ? "Keyword added (change history)" : "Negatives added that block it (change history)"}</div>
            <ul className="space-y-1 text-[13px]">{lines.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2"><CheckCircle2 className="size-4 text-good" /><span className="font-mono text-[12.5px]">{m.item}</span><span className="text-muted-foreground">{m.ad_group} · {dshort(m.day)} {m.ts.slice(11, 16)} · {m.user.split("@")[0]}</span></li>
            ))}</ul>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">Spend and clicks: Google's search terms report. “Google Ads now”: the negative keyword report and keyword report you loaded last.</p>
      </div>
    </Sheet>
  );
}

