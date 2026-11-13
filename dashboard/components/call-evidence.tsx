"use client";
/** The drawer behind one agency call: where its negative (or keyword) actually went in, and where the search kept costing money. */
import * as React from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Badge, Sheet } from "./ui";
import { dlong, dshort, inr, n0 } from "@/lib/format";

export interface EvidenceCall { term: string; day: string; campaign: string; ad_group: string; cost: number; neg_term?: string; kind: "exclude" | "add" }
interface Match { ts: string; day: string; user: string; campaign: string; ad_group: string; item: string; same_campaign: boolean; same_ad_group: boolean }
interface Seen { day: string; campaign: string; ad_group: string; clicks: number; cost: number; ads_status: string }
interface Evidence { matches: Match[]; seen: Seen[]; last_change: string }

export function CallEvidence({ call, onClose, label }: { call: EvidenceCall | null; onClose: () => void; label: (c: string) => string }) {
  const [ev, setEv] = React.useState<Evidence | null>(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!call) return;
    setEv(null);
    setErr("");
    const q = new URLSearchParams({ term: call.term, campaign: call.campaign, ad_group: call.ad_group, day: call.day, kind: call.kind });
    fetch(`/api/evidence?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b.error ? setErr(b.error) : setEv(b)))
      .catch(() => setErr("The dashboard could not be reached."));
  }, [call]);

  const inSame = ev?.matches.filter((m) => m.same_campaign) ?? [];
  const elsewhere = ev?.matches.filter((m) => !m.same_campaign) ?? [];
  const after = ev?.seen.filter((s) => s.day > (call?.day ?? "")) ?? [];
  const afterCost = after.reduce((n, s) => n + s.cost, 0);
  const isEx = call?.kind !== "add";

  return (
    <Sheet open={!!call} onOpenChange={(o) => !o && onClose()} title={call?.term ?? ""}
      description={call ? <>Sheet day {dlong(call.day)} · {label(call.campaign)}{call.ad_group ? ` · ${call.ad_group}` : ""}</> : undefined}>
      {!call ? null : (
        <div className="space-y-6 text-sm">
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="font-medium">What the agency&apos;s sheet asked for</div>
            <p className="mt-1 text-muted-foreground">
              {isEx ? <>Exclude this search{call.neg_term ? <> with the negative <code className="rounded border bg-background px-1 font-mono text-[12px]">{call.neg_term}</code></> : <> (no negative written in the sheet)</>}</> : <>Add this search as a keyword</>} in <b className="text-foreground">{label(call.campaign)}</b>{call.ad_group ? <> › {call.ad_group}</> : null}. It cost {inr(call.cost)} that day.
            </p>
          </div>

          {err ? <p className="text-bad">{err}</p> : !ev ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading the change history and search terms reports…</div>
          ) : (
            <>
              <section>
                <h3 className="font-medium">In this campaign ({label(call.campaign)})</h3>
                {inSame.length ? <EvList rows={inSame} label={label} /> : (
                  <p className="mt-2 flex items-start gap-2 text-bad"><XCircle className="mt-0.5 size-4 shrink-0" />
                    No {isEx ? "negative that blocks this search" : "keyword for this search"} was added in this campaign in the change history (loaded up to {dshort(ev.last_change)}).</p>
                )}
              </section>

              <section>
                <h3 className="font-medium">In other campaigns</h3>
                {elsewhere.length ? <EvList rows={elsewhere} label={label} /> : <p className="mt-2 text-muted-foreground">None.</p>}
                {isEx && !inSame.length && elsewhere.length ? <p className="mt-2 text-[13px] text-muted-foreground">A negative in another campaign does not stop this search in {label(call.campaign)}: negatives only work inside their own campaign (or shared list).</p> : null}
              </section>

              <section>
                <h3 className="font-medium">Did the search come back after the sheet day?</h3>
                {after.length ? (
                  <>
                    <p className="mt-1 text-muted-foreground">Yes: {n0(after.length)} {after.length === 1 ? "time" : "times"} in Google&apos;s search terms report, costing {inr(afterCost)} more.</p>
                    <table className="mt-2 w-full text-[13px]">
                      <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1.5">Day</th><th>Campaign · ad group</th><th className="text-right">Clicks</th><th className="text-right">Cost</th></tr></thead>
                      <tbody>{after.map((s, i) => (
                        <tr key={i} className="border-b last:border-0"><td className="py-1.5 tabular">{dshort(s.day)}</td><td>{label(s.campaign)} · {s.ad_group}</td><td className="text-right tabular">{n0(s.clicks)}</td><td className="text-right tabular">{inr(s.cost)}</td></tr>
                      ))}</tbody>
                    </table>
                  </>
                ) : <p className="mt-1 text-muted-foreground">No: it does not appear in any search terms report loaded after {dshort(call.day)}.</p>}
              </section>
              <p className="text-[12px] text-muted-foreground">Source: the Google Ads change history and search terms reports you imported, matched with the same rule the dashboard uses everywhere.</p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

function EvList({ rows, label }: { rows: Match[]; label: (c: string) => string }) {
  return (
    <ul className="mt-2 divide-y rounded-lg border">
      {rows.map((m, i) => (
        <li key={i} className="flex items-start gap-2 px-3 py-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />
          <div className="min-w-0">
            <code className="font-mono text-[12px]">{m.item}</code>
            <div className="text-[12px] text-muted-foreground">{dshort(m.day)} · {label(m.campaign)} › {m.ad_group} · by {String(m.user || "").split("@")[0] || "–"}</div>
          </div>
          {m.same_campaign && !m.same_ad_group ? <Badge tone="warn" className="ml-auto shrink-0">other ad group</Badge> : null}
        </li>
      ))}
    </ul>
  );
}
