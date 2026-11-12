/** Plain names for the kinds of file the import reads (shared by the Import data page's server and client parts). */
export const KIND_LABEL: Record<string, string> = {
  search_terms: "Search terms report",
  changes: "Change history",
  campaign_days: "Campaign report (by day)",
  keywords: "Keyword report",
  auction: "Auction insights",
  agency_sheet: "Agency STR sheet",
  "already loaded": "Already loaded",
  unknown: "Not recognised",
};

export const kindLabel = (k: string | null | undefined) => (k ? KIND_LABEL[k] ?? k : "Not recognised");

/** A loaded-at timestamp in India time, the same on the server and in the browser. */
export function istTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}
