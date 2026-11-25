import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { hasData, readInventory } from "@/lib/store";
import { ledgerDays } from "@/lib/ledger";
import { getAudit, changeDays } from "@/lib/audit";
import { getInventory } from "@/lib/neg-inventory";
import { KIND_LABEL } from "@/lib/follow-labels";
import { cn, dlong, dshort, n0, pcolor } from "@/lib/format";
import { Button, Card, EmptyState, Explain, PageHeader, Section } from "@/components/ui";
import { FollowTable, OneWordTable, ScoreBar } from "@/components/audit-views";
import { NegHurtTable } from "@/components/neg-hurt-table";
import { UpToPicker } from "@/components/upto-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Negatives" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const WROTE = ["term", "part", "one_word", "different", "none"] as const;

export default async function NegativesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const A = hasData() ? getAudit(one(sp.to)) : null;
  if (!A) {
    return (
      <>
        <PageHeader eyebrow="Negatives" title="Where the negatives went, and what they block" />
        <EmptyState icon={<Database className="size-8" />} title="No data yet">Load the negative keyword report, the change history and the agency sheet on <Link href="/data" className="text-primary hover:underline">Data</Link>.</EmptyState>
      </>
    );
  }
  const { led, agency, fixes, labels } = A;
  const lab = (c: string) => labels[c] ?? c;
  const ex = agency.filter((f) => f.type === "exclude");
  // the matrix: what the sheet wrote (rows) against how it is blocked today (columns)
  const cols = [
    { key: "term", label: "Full search", pick: (f: (typeof ex)[number]) => f.done?.kind === "term", tone: "text-good" },
    { key: "part", label: "Part (2+ words)", pick: (f: (typeof ex)[number]) => f.done?.kind === "part", tone: "" },
    { key: "one_word", label: "One word", pick: (f: (typeof ex)[number]) => f.done?.kind === "one_word", tone: "text-bad" },
    { key: "wrong", label: "Wrong ad group", pick: (f: (typeof ex)[number]) => f.status === "wrong_place", tone: "text-bad" },
    { key: "open", label: "Not done", pick: (f: (typeof ex)[number]) => f.status === "open_overdue", tone: "text-bad" },
    { key: "wait", label: "Not due yet", pick: (f: (typeof ex)[number]) => f.status === "open_in_time", tone: "text-muted-foreground" },
  ];
  const level = (l: string) => ex.filter((f) => f.done?.level === l).length;
  const negs = fixes.filter((f) => f.type === "neg_blocks_good" || f.type === "keyword_blocked");
  const hurtKey = new Set(negs.map((f) => `${f.campaign}\u0001${(f.neg ?? "").replace(/ \(shared list .*\)$/, "").toLowerCase()}`));
  // one-word negatives that went in over the last 30 days, from the change history
  const since = new Date(Date.parse(`${A.asOf}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  const ow = changeDays(one(sp.to)).filter((d) => d.day >= since).flatMap((d) => d.one_words.map((o) => ({ ...o, day: d.day })));
  const owHurt = ow.filter((o) => hurtKey.has(`${o.campaign}\u0001${o.text.toLowerCase()}`)).length;
  const byWho = [...ow.reduce((m, o) => m.set(o.who, (m.get(o.who) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const inv = readInventory() ? getInventory() : null;
  const invRaw = readInventory();
  const oneWordCamp = inv?.campaigns.reduce((s, c) => s + c.one_word_campaign, 0) ?? 0;
  // a one-word negative in an ROI campaign whose search the sheet had called junk: the sheet's own one-word answers
  const oneWordFromSheet = ex.filter((f) => f.done?.kind === "one_word");

  return (
    <>
      <PageHeader
        eyebrow={`Negatives · account as of ${dshort(invRaw?.as_of ?? A.asOf)} · sheet tabs to ${dshort(led.to)}`}
        title="Where the negatives went, and what they block"
        description={<>
          The account holds <b className="text-foreground">{n0(invRaw?.negatives.length ?? 0)} negatives</b>{inv ? <> ({n0(inv.campaigns.reduce((s, c) => s + c.campaign_level, 0))} at campaign level, {n0(inv.campaigns.reduce((s, c) => s + c.ad_group_level, 0))} in ad groups)</> : null}, plus {n0((invRaw?.lists ?? []).length)} links to shared lists.{" "}
          <b className="text-foreground">{n0(oneWordCamp)}</b> are a single word in broad or phrase match at campaign level: each one blocks every search in that campaign with the word.
          County&apos;s rule is to negate the full search. This page shows what the sheet wrote, how it went in, and the negatives that stop searches we want.
        </>}
        actions={<><UpToPicker days={ledgerDays().days} value={led.to} /><Button asChild variant="outline"><Link href="/account-negatives">Every negative in the account <ArrowRight /></Link></Button></>}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="overflow-x-auto lg:col-span-3">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">What the sheet wrote, and how it is blocked today</h2>
            <p className="text-[12.5px] text-muted-foreground">Every Exclude in the sheet ({n0(ex.length)}). Rows: the sheet&apos;s negative column. Columns: the negative that blocks the search in Google Ads today.</p>
          </div>
          <table className="w-full min-w-[620px] text-[13px]">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 text-left font-medium">Sheet wrote</th>{cols.map((c) => <th key={c.key} className="px-2 py-2 text-right font-medium">{c.label}</th>)}<th className="px-4 py-2 text-right font-medium">All</th></tr>
            </thead>
            <tbody className="divide-y">
              {WROTE.map((w) => {
                const r = ex.filter((f) => f.written_kind === w);
                if (!r.length) return null;
                return (
                  <tr key={w}>
                    <td className="px-4 py-2 font-medium">{KIND_LABEL[w][0].toUpperCase() + KIND_LABEL[w].slice(1)}</td>
                    {cols.map((c) => { const n = r.filter(c.pick).length; return <td key={c.key} className={cn("tabular px-2 py-2 text-right", n ? c.tone : "text-muted-foreground")}>{n ? n0(n) : "–"}</td>; })}
                    <td className="tabular px-4 py-2 text-right font-medium">{n0(r.length)}</td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30 font-medium"><td className="px-4 py-2">All Excludes</td>{cols.map((c) => <td key={c.key} className={cn("tabular px-2 py-2 text-right", c.tone)}>{n0(ex.filter(c.pick).length)}</td>)}<td className="tabular px-4 py-2 text-right">{n0(ex.length)}</td></tr>
            </tbody>
          </table>
          <Explain><span className="px-4">Read across: of the Excludes where the sheet wrote one word, how many are blocked by their full search today, by a single word, or not at all.</span></Explain>
        </Card>
        <Card className="space-y-6 p-5 lg:col-span-2">
          <ScoreBar title="Where the blocked Excludes are blocked" segs={[
            { key: "c", label: "campaign level", n: level("campaign"), tone: "info" },
            { key: "a", label: "every ad group", n: level("ad group"), tone: "muted" },
            { key: "l", label: "shared list", n: level("shared list"), tone: "good" },
          ]} note="Campaign level and shared lists stop the search in the whole campaign. An ad-group negative stops it only when every ad group of the campaign has one; otherwise the search moves to another ad group." />
          <ScoreBar title="Kind of negative that blocks them" segs={[
            { key: "t", label: "full search", n: ex.filter((f) => f.done?.kind === "term").length, tone: "good" },
            { key: "p", label: "part of it", n: ex.filter((f) => f.done?.kind === "part").length, tone: "info" },
            { key: "o", label: "one word", n: oneWordFromSheet.length, tone: "bad" },
          ]} note="A full search in exact match blocks only that search. One word blocks every search that contains it, including ones we want." />
        </Card>
      </div>

      <Section title="Negatives that block searches we want" description={<>Each of these stops a high- or medium-intent search (it converted, the sheet said Add, or it is our keyword), or switches off keywords enabled in the same campaign. Other County project names are left out (County asked for them). {n0(negs.length)} in all.</>}>
        <NegHurtTable rows={negs} labels={labels} />
      </Section>

      <Section title="One-word negatives added in the last 30 days" description={<>From the change history, {dshort(since)} to {dshort(A.asOf)}: <b className="text-foreground">{n0(ow.length)}</b> single words went in as broad or phrase negatives{ow.length ? <> ({byWho.map(([w, n]) => `${w} ${n0(n)}`).join(", ")})</> : null}. {n0(owHurt)} of them now block a search we want or our own keyword (red). Each one blocks every search with that word in its campaign.</>}>
        <OneWordTable rows={ow.map((o) => ({ ...o, hurt: hurtKey.has(`${o.campaign}\u0001${o.text.toLowerCase()}`) }))} labels={labels} />
      </Section>

      <Section title="Excludes blocked only by one word" description={<>{n0(oneWordFromSheet.length)} junk searches the sheet called Exclude are blocked by a single word. Each can be negated by its full search instead, so the word is free for searches we want. Click a row for its story.</>}>
        <FollowTable rows={oneWordFromSheet} labels={labels} cols={["term", "campaign", "day", "written", "went", "how"]} csvName="blocked-by-one-word" pageSize={10} />
      </Section>

      {inv ? (
        <Section title="Negatives per campaign" description={<>From the negative keyword report of {dlong(invRaw?.as_of)}. Shared lists are named; Google Ads does not export what is in them, so only the words the change history shows going in are known. Google allows up to 10,000 negatives per campaign and 5,000 per shared list.</>}>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-2 font-medium">Campaign</th><th className="px-2 py-2 text-right font-medium">All</th><th className="px-2 py-2 text-right font-medium">Campaign level</th><th className="px-2 py-2 text-right font-medium">Ad groups</th><th className="px-2 py-2 text-right font-medium">Exact</th><th className="px-2 py-2 text-right font-medium">Phrase</th><th className="px-2 py-2 text-right font-medium">Broad</th><th className="px-2 py-2 text-right font-medium">One word, campaign level</th><th className="px-4 py-2 font-medium">Shared lists</th></tr>
              </thead>
              <tbody className="divide-y">
                {inv.campaigns.map((c) => (
                  <tr key={c.campaign}>
                    <td className="px-4 py-2"><span className="flex items-center gap-2 font-medium"><span className="size-2 shrink-0 rounded-full" style={{ background: pcolor(c.project) }} />{lab(c.campaign)}</span></td>
                    <td className="tabular px-2 py-2 text-right font-medium">{n0(c.total)}</td>
                    <td className="tabular px-2 py-2 text-right">{n0(c.campaign_level)}</td>
                    <td className="tabular px-2 py-2 text-right">{n0(c.ad_group_level)}</td>
                    <td className="tabular px-2 py-2 text-right">{n0(c.exact)}</td>
                    <td className="tabular px-2 py-2 text-right">{n0(c.phrase)}</td>
                    <td className="tabular px-2 py-2 text-right">{n0(c.broad)}</td>
                    <td className={cn("tabular px-2 py-2 text-right", c.one_word_campaign ? "text-bad" : "text-muted-foreground")}>{n0(c.one_word_campaign)}</td>
                    <td className="px-4 py-2 text-[12px] text-muted-foreground">{c.lists.join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}
    </>
  );
}
