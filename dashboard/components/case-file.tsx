"use client";
/**
 * The case file of one search: everything that happened to it, in order, each step with the report it comes from.
 * First seen → the sheet's call → the deadline → when it went into Google Ads (who, where, written how) → the money
 * after the deadline → what the account does today. Opened from any table that lists searches or sheet calls.
 */
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, Clock, Loader2, MinusCircle } from "lucide-react";
import type { Search } from "@/lib/ledger-core";
import type { Followup } from "@/lib/followup-core";
import { KIND_LABEL, LEVEL_LABEL, negPath, statusOf, TONE_BG, type Tone } from "@/lib/follow-labels";
import { cn, dlong, dshort, inr, n0 } from "@/lib/format";
import { Sheet } from "./ui";
import { OutcomeTag, accountNow } from "./money";

interface Day { day: string; ad_group: string; keyword: string; match_type: string; clicks: number; cost: number; conv: number }
interface Line { ts: string; day: string; who: string; org: string; campaign: string; ad_group: string; list: string; item: string; negative: boolean; here: boolean }
interface CaseData { search: Search; follow: Followup | null; days: Day[]; changes: Line[]; grace: number; to: string }

const time = (ts: string) => (ts ? `${dshort(ts.slice(0, 10))}, ${ts.slice(11, 16)}` : "");

/** One plain sentence: what happened and what it cost. */
function verdict(f: Followup, s: Search): { tone: Tone; text: string } {
  const st = statusOf(f);
  const d = f.done;
  const by = d?.dated ? ` by ${d.who} (${d.org}) on ${time(d.ts)}` : "";
  const late = f.days_late === 1 ? "1 day" : `${f.days_late} days`;
  if (f.type === "exclude") {
    if (f.status === "on_time") return { tone: "good", text: `Done on time. The sheet said Exclude in the ${dshort(f.call_day)} tab; the negative went in${by}${d?.dated ? "" : " (the change history does not show when)"}.` };
    if (f.status === "late") return { tone: "warn", text: `Done ${late} late. The sheet said Exclude in the ${dshort(f.call_day)} tab (deadline ${dshort(f.due)}); the negative went in${by}. ${f.cost_late > 0 ? `${inr(f.cost_late)} was spent on it after the deadline.` : "It cost nothing after the deadline."}` };
    if (f.status === "wrong_place") return { tone: "bad", text: `Put in the wrong place. A negative went into ${f.elsewhere}, but the search runs in ${s.ad_groups.join(", ")}, so it still shows.${f.cost_late > 0 ? ` ${inr(f.cost_late)} spent after the deadline.` : ""}` };
    if (f.status === "open_overdue") return { tone: "bad", text: `Not done, ${late} past the deadline (${dshort(f.due)}). No negative blocks it.${f.cost_late > 0 ? ` ${inr(f.cost_late)} spent after the deadline.` : " It has not cost money since the deadline."}` };
    return { tone: "muted", text: `Not due yet: the sheet said Exclude in the ${dshort(f.call_day)} tab, and the deadline is ${dlong(f.due)}.` };
  }
  const theme = f.wrong_theme ? ` But it sits in ${f.wrong_theme}, an ad group of another theme: it belongs in ${f.theme_best.join(" or ")}, so its ad matches the search.` : "";
  if (theme && (f.status === "on_time" || f.status === "late" || f.status === "already")) {
    const head = f.status === "already" ? "It was a keyword before the sheet asked for it." : `Added as a keyword${f.status === "late" ? ` ${late} late` : " on time"}${by}.`;
    return { tone: "warn", text: head + theme };
  }
  if (f.status === "on_time") return { tone: "good", text: `Added as a keyword on time${by}.` };
  if (f.status === "late") return { tone: "warn", text: `Added as a keyword ${late} late${by}.` };
  if (f.status === "already") return { tone: "muted", text: "It was a keyword before the sheet asked for it." };
  if (f.status === "elsewhere") return { tone: "warn", text: `Not a keyword in this campaign. It is a keyword only in ${f.elsewhere}.` };
  if (f.status === "blocked") return { tone: "bad", text: "The sheet said Add, but a negative in the account blocks it, so it cannot show." };
  if (f.status === "open_overdue") return { tone: "bad", text: `Not added, ${late} past the deadline (${dshort(f.due)}). It is not a keyword in any campaign.` };
  return { tone: "muted", text: `${st.label}: the deadline is ${dlong(f.due)}.` };
}

function Step({ icon, tone, title, children }: { icon: React.ReactNode; tone: Tone; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="relative pb-4 pl-8 last:pb-0">
      <span className={cn("absolute left-0 top-0 grid size-6 place-items-center rounded-full [&_svg]:size-3.5", TONE_BG[tone])}>{icon}</span>
      <div className="text-[13.5px] font-medium">{title}</div>
      {children ? <div className="mt-0.5 text-[13px] text-muted-foreground">{children}</div> : null}
    </li>
  );
}

export function CaseFile({ id, onClose, label }: { id: string | null; onClose: () => void; label: (c: string) => string }) {
  const sp = useSearchParams();
  const to = sp.get("to") ?? "";
  const [data, setData] = React.useState<CaseData | null>(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!id) return;
    setData(null);
    setErr("");
    fetch(`/api/case?${new URLSearchParams({ id, to })}`, { cache: "no-store" })
      .then((r) => r.json()).then((b) => (b.error ? setErr(b.error) : setData(b))).catch(() => setErr("The dashboard could not be reached."));
  }, [id, to]);
  if (!id) return <Sheet open={false} onOpenChange={() => onClose()} title="">{null}</Sheet>;
  const s = data?.search;
  const f = data?.follow ?? null;
  const v = f && s ? verdict(f, s) : null;
  const here = (data?.changes ?? []).filter((c) => c.here);
  const other = (data?.changes ?? []).filter((c) => !c.here);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={s ? <span>“{s.term}”</span> : "Loading…"} description={s ? `${label(s.campaign)} · ${s.ad_groups.join(", ")}` : ""}>
      {err ? <p className="text-bad">{err}</p> : !data || !s ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p> : (
        <div className="space-y-6 text-sm">
          {v ? <div className={cn("rounded-lg px-4 py-3 text-[14px] font-medium leading-relaxed", TONE_BG[v.tone])}>{v.text}</div> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Spent", inr(s.cost)], ["Clicks", n0(s.clicks)], ["Conversions", n0(s.conv)], ["Days seen", n0(s.days)]].map(([k, val]) => (
              <div key={k} className="rounded-lg border bg-card px-3 py-2"><div className="text-xs text-muted-foreground">{k}</div><div className="tabular text-base font-semibold">{val}</div></div>
            ))}
          </div>

          <div>
            <div className="mb-3 font-medium">What happened, in order</div>
            <ol>
              <Step icon={<Clock />} tone="info" title={`First seen ${dlong(s.first_day)}`}>
                {f ? `${inr(f.cost_before)} spent up to the sheet's call.` : `Last seen ${dlong(s.last_day)}.`} Matched by {s.match_types.join(", ") || "–"}{s.keywords.length ? ` on keyword ${s.keywords.join(", ")}` : ""}.
              </Step>
              <Step icon={<CheckCircle2 />} tone="info" title={s.verdict === "Not in sheet" ? "Not in any tab of the STR sheet" : s.verdict === "Left as is" ? `In the sheet with no Add or Exclude (${dshort(s.call_day)} tab)` : `The sheet said ${s.verdict} in the ${dshort(s.call_day)} tab`}>
                {s.verdict === "Exclude" ? (s.neg_written ? <>Negative written: <span className="font-mono text-foreground">{s.neg_written}</span> ({KIND_LABEL[s.neg_written_kind] ?? s.neg_written_kind}{s.neg_written_kind === "one_word" ? "; County asks for the full search" : ""}).</> : "No negative written in the sheet.") : null}
                {s.county_comment ? <span className="block">County wrote: “{s.county_comment}”</span> : null}
                {s.intent ? <span className="block">Buying intent: {s.intent} ({s.intent_why}).</span> : null}
              </Step>
              {f ? (
                <Step icon={<Clock />} tone="muted" title={`Deadline ${dlong(f.due)}`}>{data.grace} days after the sheet day{f.due_weekend ? ", moved to Monday because it fell on a weekend" : ""}. {f.cost_grace > 0 ? `${inr(f.cost_grace)} spent inside those days.` : "Nothing spent inside those days."}</Step>
              ) : null}
              {f ? (f.done ? (
                <Step icon={<CheckCircle2 />} tone={f.status === "late" ? "warn" : f.status === "blocked" ? "bad" : "good"}
                  title={f.done.dated ? `${f.type === "exclude" ? "Negative" : "Keyword"} went in ${time(f.done.ts)} by ${f.done.who} (${f.done.org})` : `${f.type === "exclude" ? "Blocked" : "A keyword"} today; the change history does not show when it went in`}>
                  <span className="font-mono text-foreground">{f.done.text}</span>{" "}
                  {f.type === "exclude" ? <>at {LEVEL_LABEL[f.done.level]}{f.done.list ? ` (${f.done.list})` : f.done.ad_group ? ` (${f.done.ad_group})` : ""}: {KIND_LABEL[f.done.kind]}{f.done.kind === "one_word" ? <span className="text-bad">, so it also blocks every other search with that word</span> : null}.</> : <>in {f.done.ad_group || "the campaign"}.</>}
                  {f.status === "late" ? <span className="block font-medium text-warn">{f.days_late} {f.days_late === 1 ? "day" : "days"} after the deadline.</span> : null}
                  {f.cost_after_done > 0 ? <span className="block text-bad">{inr(f.cost_after_done)} was still spent after it went in: this negative may not match the search the way Google reads it.</span> : null}
                </Step>
              ) : (
                <Step icon={<CircleAlert />} tone={f.status === "open_in_time" ? "muted" : "bad"} title={f.status === "open_in_time" ? "Not in Google Ads yet (not due)" : f.status === "wrong_place" ? `Went into the wrong place: ${f.elsewhere}` : f.status === "elsewhere" ? `Added only in another campaign: ${f.elsewhere}` : f.status === "blocked" ? "A negative blocks it" : `Not in Google Ads, ${f.days_late} ${f.days_late === 1 ? "day" : "days"} past the deadline`}>
                  {f.type === "exclude" ? `Where to add it: ${negPath(s.campaign)}. Write the full search in quotes: "${s.term}".` : null}
                </Step>
              )) : null}
              {f && f.type === "exclude" && f.status !== "open_in_time" ? (
                <Step icon={f.cost_late > 0 ? <CircleAlert /> : <MinusCircle />} tone={f.cost_late > 0 ? "bad" : "muted"} title={`${inr(f.cost_late)} spent after the deadline`}>
                  {f.status === "late" ? "Counted from the day after the deadline up to the day the negative went in." : f.status === "on_time" ? "It went in on time." : `Counted from the day after the deadline up to ${dshort(data.to)}.`}
                </Step>
              ) : null}
              <Step icon={<CheckCircle2 />} tone="muted" title="Google Ads today">
                <span className="mr-2"><OutcomeTag o={s.outcome} /></span>{accountNow(s)}.
                {s.lists.length && s.blocked !== "yes" ? <span className="block">Shared lists on this campaign: {s.lists.join(", ")}. Only words added to them since 1 Oct are known.</span> : null}
              </Step>
            </ol>
          </div>

          <div>
            <div className="mb-2 font-medium">Every day it cost money in this campaign</div>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-1.5">Day</th><th className="px-3 py-1.5">Ad group</th><th className="px-3 py-1.5">Keyword</th><th className="px-3 py-1.5 text-right">Clicks</th><th className="px-3 py-1.5 text-right">Cost</th></tr></thead>
                <tbody className="divide-y">{data.days.map((x, i) => (
                  <tr key={i} className={cn(f?.type === "exclude" && x.day > f.due && "bg-bad-soft/70", f?.type === "exclude" && x.day > f.call_day && x.day <= f.due && "bg-warn-soft/60")}>
                    <td className="whitespace-nowrap px-3 py-1.5">{dshort(x.day)}</td><td className="px-3 py-1.5">{x.ad_group}</td><td className="px-3 py-1.5 text-muted-foreground">{x.keyword}</td>
                    <td className="tabular px-3 py-1.5 text-right">{n0(x.clicks)}</td><td className="tabular px-3 py-1.5 text-right">{inr(x.cost)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {f?.type === "exclude" ? <p className="mt-2 text-xs text-muted-foreground">Yellow: after the sheet&apos;s call, inside the {data.grace} days. Red: after the deadline.</p> : null}
          </div>

          {here.length || other.length ? (
            <div>
              <div className="mb-2 font-medium">Change history lines that match it</div>
              <ul className="space-y-1.5 text-[13px]">
                {[...here, ...other].map((c, i) => (
                  <li key={i} className={cn("flex flex-wrap items-baseline gap-x-2", !c.here && "text-muted-foreground")}>
                    <span className="font-mono text-[12.5px] text-foreground">{c.item}</span>
                    <span>{c.negative ? "negative" : "keyword"} · {c.list ? `shared list ${c.list}` : c.ad_group ? `${label(c.campaign)} › ${c.ad_group}` : `${label(c.campaign)} (campaign level)`}</span>
                    <span>· {time(c.ts)} · {c.who}</span>
                    {!c.here ? <span className="text-xs">(another campaign)</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Check it yourself: spend from Google Ads › Insights and reports › Search terms (filter the search); the change from Change history (filter Change type = Keywords); today&apos;s state from {negPath(s.campaign)}.
          </p>
        </div>
      )}
    </Sheet>
  );
}
