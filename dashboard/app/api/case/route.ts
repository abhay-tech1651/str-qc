import { negativeBlocks, tokens } from "@/lib/engine";
import { getFollowup, getLedger } from "@/lib/ledger";
import { readTable } from "@/lib/store";
import { whoOf } from "@/lib/followup-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?id=<campaign>\u0001<search words>&to=YYYY-MM-DD
 * The whole story of one search, for the case-file panel: the ledger row (what the sheet said, what blocks it now),
 * its follow-through (when it went in, who, where, how late, what the delay cost), every day it cost money in this
 * campaign, and every change-history line that added a matching negative or keyword (any campaign, marked).
 */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const id = String(u.get("id") ?? "").slice(0, 600);
  const to = String(u.get("to") ?? "");
  const led = getLedger(/^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null);
  if (!led || !id.includes("\u0001")) return Response.json({ error: "bad request" }, { status: 400 });
  const s = led.searches.find((x) => x.id === id);
  if (!s) return Response.json({ error: "This search is not in the period." }, { status: 404 });
  const f = getFollowup(led).items.find((x) => x.id === id) ?? null;
  const q = tokens(s.term);

  const days = (readTable("search_terms") as Record<string, unknown>[])
    .filter((r) => String(r.campaign) === s.campaign && tokens(String(r.term ?? "")) === q && String(r.day) <= led.to)
    .map((r) => ({ day: String(r.day), ad_group: String(r.ad_group ?? ""), keyword: String(r.keyword ?? ""), match_type: String(r.match_type ?? ""), clicks: Number(r.clicks) || 0, cost: Number(r.cost) || 0, conv: Number(r.conv) || 0 }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.ad_group.localeCompare(b.ad_group));

  const changes = (readTable("changes") as Record<string, string>[]).filter((c) => {
    const k = String(c.kind ?? "");
    if (/negative .*keyword added/i.test(k)) return negativeBlocks(String(c.item ?? ""), s.term);
    if (/^(exact|phrase|broad) match keyword added/i.test(k)) return tokens(String(c.item ?? "")) === q;
    return false;
  }).map((c) => {
    const w = whoOf(c.user);
    const list = /^(.+): \d+ negative/i.exec(String(c.kind ?? ""))?.[1] ?? "";
    return {
      ts: c.ts, day: c.day, who: w.who, org: w.org, campaign: c.campaign, ad_group: c.ad_group, list, item: c.item,
      negative: /negative/i.test(String(c.kind)), here: c.campaign === s.campaign || (!!list && s.lists.includes(list)),
    };
  }).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  return Response.json({ search: s, follow: f, days, changes, grace: led.grace, to: led.to });
}
