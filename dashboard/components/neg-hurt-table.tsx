/** Negatives in the account that block searches we want or switch off our keywords, with what to do instead (server component). */
import type { FixItem } from "@/lib/ledger";
import { dshort, pcolor } from "@/lib/format";
import { Card } from "./ui";

export function NegHurtTable({ rows: negs, labels }: { rows: FixItem[]; labels: Record<string, string> }) {
  const lab = (c: string) => labels[c] ?? c;
  return (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 font-medium">Negative</th><th className="px-3 py-2 font-medium">Where</th><th className="px-3 py-2 font-medium">Added</th><th className="px-3 py-2 font-medium">What it stops that we want</th><th className="px-4 py-2 font-medium">Do instead</th></tr>
            </thead>
            <tbody className="divide-y align-top">
              {negs.map((f) => {
                const by = /^Added by (.+)\.$/.exec(f.note)?.[1] ?? "";
                return (
                  <tr key={f.id}>
                    <td className="px-4 py-2.5"><span className="font-mono text-[12.5px] font-medium">{f.neg ?? f.todo}</span>{f.neg_how ? <span className="block text-[12px] font-medium">{f.neg_how}</span> : null}<span className="mt-0.5 block text-[12px] capitalize" style={{ color: pcolor(f.project) }}>{f.project}</span></td>
                    <td className="px-3 py-2.5 text-[12.5px]">{lab(f.campaign)}<span className="block text-muted-foreground">{f.ad_group ? `ad group ${f.ad_group}` : "campaign level"}</span></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px]">{f.since ? dshort(f.since) : <span className="text-muted-foreground">before 1 Oct</span>}<span className="block text-muted-foreground">{by}</span></td>
                    <td className="max-w-[340px] px-3 py-2.5 text-[12.5px]">{f.term}{f.type === "keyword_blocked" ? <span className="block text-muted-foreground">(our enabled keywords)</span> : null}</td>
                    <td className="max-w-[300px] px-4 py-2.5 text-[12.5px] text-muted-foreground">{f.instead ?? f.todo}</td>
                  </tr>
                );
              })}
              {!negs.length ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No negative blocks a search we want.</td></tr> : null}
            </tbody>
          </table>
        </Card>
  );
}
