import { negativeBlocks, tokens } from "@/lib/engine";
import { readTable } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?term=&campaign=&ad_group=&day=&kind=exclude|add
 * The evidence behind one agency call, straight from the loaded reports:
 *  - every change-history line (any campaign) that would block this search, or added it as a keyword
 *  - every day this exact search appeared in Google's search terms report from the sheet day on, with campaign and cost
 */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const term = String(u.get("term") ?? "").slice(0, 300);
  const campaign = String(u.get("campaign") ?? "");
  const adGroup = String(u.get("ad_group") ?? "");
  const day = String(u.get("day") ?? "");
  const kind = u.get("kind") === "add" ? "add" : "exclude";
  if (!term || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return Response.json({ error: "bad request" }, { status: 400 });

  const q = tokens(term);
  const changes = readTable("changes") as Record<string, string>[];
  const matches = changes.filter((c) => {
    const k = String(c.kind ?? "").toLowerCase();
    if (kind === "exclude") return /negative .*keyword added/.test(k) && negativeBlocks(String(c.item ?? ""), term);
    return /^(exact|phrase|broad) match keyword added/.test(k) && tokens(String(c.item ?? "")) === q;
  }).map((c) => ({
    ts: c.ts, day: c.day, user: c.user, campaign: c.campaign, ad_group: c.ad_group || "(whole campaign)", item: c.item,
    same_campaign: c.campaign === campaign, same_ad_group: c.campaign === campaign && (!c.ad_group || c.ad_group === adGroup),
  })).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  const seen = (readTable("search_terms") as Record<string, unknown>[])
    .filter((r) => String(r.day) >= day && tokens(String(r.term ?? "")) === q)
    .map((r) => ({ day: r.day, campaign: r.campaign, ad_group: r.ad_group, clicks: Number(r.clicks) || 0, cost: Number(r.cost) || 0, ads_status: r.ads_status }))
    .sort((a, b) => String(a.day).localeCompare(String(b.day)));

  const lastChange = changes.reduce((m, c) => (String(c.day) > m ? String(c.day) : m), "");
  return Response.json({ term, campaign, ad_group: adGroup, day, kind, matches, seen, last_change: lastChange });
}
