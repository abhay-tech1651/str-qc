import "server-only";
import { engineHelpers } from "./engine";
import { getModel, readTable } from "./store";
import { analyseNegatives, type NegAnalysis } from "./negatives-core";

let cache: { key: string; out: NegAnalysis } | null = null;

/** Negatives as written vs as applied, from the stored tables. Rebuilt only when the data changes. */
export function getNegatives(): NegAnalysis {
  const m = getModel();
  const calls = readTable("agency_calls"), changes = readTable("changes");
  const searchTerms = readTable("search_terms"), keywords = readTable("keywords");
  const key = [calls.length, changes.length, searchTerms.length, keywords.length, m.agency.last_change_day, m.data.agency_sheet?.to].join("|");
  if (cache?.key === key) return cache.out;
  const proj = new Map(m.campaigns.map((c) => [c.id, c.project as string]));
  const out = analyseNegatives(engineHelpers(), {
    calls, changes, searchTerms, keywords,
    projectOf: (c) => proj.get(c) ?? "other",
    grace: m.agency.grace_days, changesFrom: m.agency.changes_from ?? "", lastChange: m.agency.last_change_day ?? "",
  });
  // keep the page light: negatives that answered a call, are one word, or block something of ours
  out.negatives = out.negatives.filter((n) => n.calls > 0 || n.words === 1 || n.keywords.length > 0 || n.conv > 0);
  cache = { key, out };
  return out;
}
