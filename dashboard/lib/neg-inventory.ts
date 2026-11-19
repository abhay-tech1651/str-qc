import "server-only";
import { engineHelpers } from "./engine";
import { getModel, readInventory, readTable } from "./store";
import { analyseInventory, type InvAnalysis } from "./neg-inventory-core";

let cache: { key: string; out: InvAnalysis } | null = null;

/** Every negative in the account (the last negative keyword report) checked against our keywords, searches and the sheet. */
export function getInventory(): InvAnalysis | null {
  const inv = readInventory();
  if (!inv) return null;
  const m = getModel();
  const calls = readTable("agency_calls"), changes = readTable("changes");
  const searchTerms = readTable("search_terms"), keywords = readTable("keywords");
  const key = [inv.exported_ms, inv.negatives.length, calls.length, changes.length, searchTerms.length, keywords.length, m.data.agency_sheet?.to].join("|");
  if (cache?.key === key) return cache.out;
  const proj = new Map(m.campaigns.map((c) => [c.id, c.project as string]));
  const projectOf = (c: string) => proj.get(c) ?? (/ivory/i.test(c) ? "ivory" : /clove/i.test(c) ? "clove" : /cocoa/i.test(c) ? "cocoa" : /jade/i.test(c) ? "jade" : "other");
  const out = analyseInventory(engineHelpers(), { inv, calls, keywords, searchTerms, changes, projectOf });
  cache = { key, out };
  return out;
}
