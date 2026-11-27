import "server-only";
import { dataVersion, getModel, readTable } from "./store";
import { engineHelpers } from "./engine";
import { fixList, getFollowup, getLedger, type FixItem } from "./ledger";
import { bestGroups, scorecard, themeWords, type Followup, type Scorecard, type TabDay } from "./followup-core";
import type { Ledger } from "./ledger-core";

/**
 * Everything the agency pages show, from one place: the ledger (where the money went), the follow-through of every
 * sheet call (followup-core.ts) and the fix list. Every count on Overview, Day by day, Agency report, Negatives and Fix
 * list comes from here, so two pages can never disagree.
 */
export interface Audit {
  led: Ledger;
  items: Followup[];
  /** the agency's calls (Google's CTM campaigns are run by Google's team, so they are kept apart) */
  agency: Followup[];
  google: Followup[];
  card: Scorecard;
  tabs: TabDay[];
  fixes: FixItem[];
  byProject: { id: string; name: string; color: string; card: Scorecard; open: number; overdue: number }[];
  byWeek: { from: string; to: string; card: Scorecard }[];
  asOf: string;
  lastChange: { ts: string; who: string } | null;
  labels: Record<string, string>;
  /** single-word broad or phrase negatives that went in over the last 30 days (change history) */
  oneWord30: { n: number; since: string };
  /** every agency campaign's ad groups (from the keyword report), with their theme words: themes differ by campaign */
  adGroups: { campaign: string; groups: { name: string; theme: string[]; enabled: number; cost: number; conv: number }[] }[];
  /** enabled keywords that sit in an ad group of another theme, when their own campaign has an ad group that fits better */
  themeKeywords: { campaign: string; ad_group: string; keyword: string; fits: string[]; cost: number; conv: number }[];
}

const weekStart = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  return new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
};
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const audits = new WeakMap<object, { v: string; out: Audit }>();
/** The audit for a ledger, built once per data change (Overview, Agency report, Day by day and Negatives share it). */
export function getAudit(toParam?: string | null): Audit | null {
  const led = getLedger(toParam);
  if (!led) return null;
  const v = dataVersion();
  const hit = audits.get(led);
  if (hit && hit.v === v) return hit.out;
  const out = buildAudit(led);
  audits.set(led, { v, out });
  return out;
}

function buildAudit(led: Ledger): Audit {
  const fu = getFollowup(led);
  const m = getModel();
  const agency = fu.items.filter((f) => f.owner === "agency");
  const google = fu.items.filter((f) => f.owner === "google");
  const fixes = fixList(led);
  const byProject = m.projects.map((p) => {
    const fx = fixes.filter((f) => f.project === p.id);
    return { id: p.id, name: p.name, color: p.id, card: scorecard(agency.filter((f) => f.project === p.id)), open: fx.length, overdue: fx.filter((f) => f.overdue).length };
  });
  const weeks = new Map<string, Followup[]>();
  for (const f of agency) {
    const w = weekStart(f.call_day);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w)!.push(f);
  }
  const byWeek = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([w, l]) => ({ from: w < led.from ? led.from : w, to: addDay(w, 6) > led.to ? led.to : addDay(w, 6), card: scorecard(l) }));
  const since = addDay(fu.as_of, -29);
  const oneWord30 = { n: fu.change_days.filter((d) => d.day >= since).reduce((n, d) => n + d.one_words.length, 0), since };
  const last = fu.change_days[0];
  const lastPerson = last?.people.slice().sort((a, b) => b.last.localeCompare(a.last))[0];
  // ad group theming (owner, 27 Nov 2026): each campaign's own ad groups, and keywords sitting outside their theme
  const H = engineHelpers();
  const kws = readTable("keywords").filter((k) => /^ROI/i.test(String(k.campaign ?? "")) && String(k.ad_group ?? "").trim());
  const byCamp = new Map<string, Map<string, { enabled: number; cost: number; conv: number }>>();
  for (const k of kws) {
    const c = String(k.campaign), g = String(k.ad_group);
    if (!byCamp.has(c)) byCamp.set(c, new Map());
    const e = byCamp.get(c)!.get(g) ?? { enabled: 0, cost: 0, conv: 0 };
    if (String(k.keyword_status) === "Enabled") e.enabled++;
    e.cost += Number(k.cost) || 0; e.conv += Number(k.conv) || 0;
    byCamp.get(c)!.set(g, e);
  }
  const adGroups = [...byCamp].map(([campaign, m]) => ({ campaign, groups: [...m].map(([name, e]) => ({ name, theme: themeWords(H, name), ...e })).sort((a, b) => b.cost - a.cost) }))
    .sort((a, b) => a.campaign.localeCompare(b.campaign));
  const themeKeywords: Audit["themeKeywords"] = [];
  for (const { campaign, groups } of adGroups) {
    const live = groups.filter((g) => g.enabled > 0).map((g) => g.name);
    for (const k of kws) {
      if (String(k.campaign) !== campaign || String(k.keyword_status) !== "Enabled") continue;
      const fit = bestGroups(H, live, String(k.keyword));
      if (fit.best.length && !fit.best.includes(String(k.ad_group)) && fit.score(String(k.ad_group)) < fit.score(fit.best[0])) {
        themeKeywords.push({ campaign, ad_group: String(k.ad_group), keyword: String(k.keyword), fits: fit.best, cost: Number(k.cost) || 0, conv: Number(k.conv) || 0 });
      }
    }
  }
  themeKeywords.sort((a, b) => b.cost - a.cost);
  return {
    adGroups, themeKeywords,
    led, items: fu.items, agency, google, card: scorecard(agency), tabs: fu.tabs, fixes, byProject, byWeek, asOf: fu.as_of,
    lastChange: lastPerson ? { ts: lastPerson.last, who: lastPerson.who } : null,
    labels: Object.fromEntries(m.campaigns.map((c) => [c.id, c.label])),
    oneWord30,
  };
}

export function changeDays(toParam?: string | null) {
  const led = getLedger(toParam);
  return led ? getFollowup(led).change_days : [];
}
