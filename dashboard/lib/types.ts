/**
 * The model the verified engine builds (apps-script/20_Model.js, specified by strqc/model.py).
 * Every number on every page comes from one of these fields; the pages only format and arrange them.
 */
export type Pid = string;
export type Severity = "high" | "medium" | "low";
export type Owner = "Agency" | "County" | "Google CTM team";
export type Verdict = "idle" | "underspending" | "budget" | "rank" | "brand_gap" | "ok";

export interface Span { from: string | null; to: string | null }

export interface Totals { cost: number; clicks: number; impr: number; conv: number; all_conv: number; cpa: number | null }

export interface CampStats {
  days: number; cost: number; clicks: number; impr: number; conv: number; all_conv: number;
  cpa: number | null; cpc: number | null; cost_per_day: number; budget_use: number | null;
  is_pct: number | null; lost_budget_pct: number | null; lost_rank_pct: number | null; top_is_pct: number | null;
}

export interface SeriesPoint {
  day: string; cost: number; impr: number; clicks: number; conv: number;
  is_pct: number | null; lost_budget_pct: number | null; lost_rank_pct: number | null; eligible: number | null;
}

export interface Campaign {
  id: string; label: string; project: Pid; runner: string; ctype: string; bid_strategy: string;
  status: string; status_reasons: string; budget_now: number; target_cpa_now: number | null;
  since: CampStats | null; last7: CampStats | null; prev7: CampStats | null;
  verdict: Verdict; conv_gap: boolean; series: SeriesPoint[];
}

export interface Project { id: Pid; name: string; location: string; product: string; starting_price_cr: number | null; max_price_cr: number | null }

export interface ProjectStats { since: Totals; last7: Totals; prev7: Totals; share_of_spend: number | null; campaigns: string[]; daily: { day: string; cost: number }[] }

export interface Fix {
  type: string; owner: Owner; project: Pid; severity: Severity;
  money: number | null; money_kind: "wasted" | "affected" | "misrouted" | null;
  params: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface CallRow { day: string; term: string; project: Pid; campaign: string; ad_group: string; cost: number; neg_term: string; county_comment: string; status: string }
export interface AddRow { day: string; term: string; project: Pid; campaign: string; ad_group: string; cost: number; clicks: number; conv: number }

export interface Agency {
  grace_days: number; last_change_day: string; changes_from: string;
  excludes: { total: number; applied: number; applied_elsewhere: number; waiting: number; unchecked: number; overdue: number; overdue_cost: number; judged: number; applied_pct: number | null; median_lag: number | null };
  adds: { total: number; added: number; added_elsewhere: number; already: number; waiting: number; unchecked: number; overdue: number };
  no_negative: { rows: number; cost: number; open: number };
  by_day: { day: string; applied: number; applied_elsewhere: number; waiting: number; overdue: number; unchecked: number }[];
  lag: { days: string; count: number }[];
  by_project: Record<Pid, { excludes: number; judged: number; applied_pct: number | null; overdue: number; overdue_cost: number; adds: number; adds_overdue: number }>;
  overdue_excludes: CallRow[]; overdue_adds: AddRow[]; no_negative_rows: CallRow[];
}

export interface StRow { day: string; term: string; project: Pid; campaign: string; ad_group: string; keyword: string; match_type: string; clicks: number; cost: number }

export interface Risks {
  brand_no_word: StRow[]; brand_leak: StRow[];
  blocked: { project: Pid; campaign: string; ad_group: string; keyword: string; blocked_by: string; level: string; added: string; added_by: string }[];
  risky: { project: Pid; campaign: string; ad_group: string; item: string; level: string; added: string; added_by: string; why: string }[];
  conflicts: { day: string; project: Pid; campaign: string; negative: string; written_for: string; would_block: number; example: string }[];
  leaks: { project: Pid; campaign: string; negative: string; level: string; ad_group: string; added: string; later_rows: number; later_cost: number; example: string; last_seen: string }[];
  repeats: { day: string; term: string; project: Pid; campaign: string; cost: number; first_excluded: string; excluded_in: string[] }[];
  by_project: Record<Pid, { brand_no_word_cost: number; brand_no_word_rows: number; brand_leak_cost: number; brand_leak_rows: number; blocked_keywords: number; risky: number; conflicts: number; repeats_cost: number }>;
}

export interface KwRow { keyword: string; match_type: string; project: Pid; campaign: string; ad_group: string; status: string; cost: number; clicks: number; impr: number; conv: number; quality_score: number | null; ad_relevance: string; landing_page: string }

export interface Keywords {
  from: string; to: string; total_cost: number; below_lp_cost: number; qs13_cost: number;
  lp_cost: Record<string, number>; rel_cost: Record<string, number>; qs: { label: string; cost: number; n: number }[];
  status_counts: Record<string, number>;
  by_project: Record<Pid, { cost: number; below_lp_cost: number; qs13_cost: number; keywords: number; enabled: number; not_eligible: number; limited: number }>;
  no_conv: KwRow[]; low_quality: KwRow[];
  duplicates: { project: Pid; keyword: string; campaigns: string[]; cost: number; impr: number }[];
  product_mismatch: KwRow[]; product_mismatch_cost: number; product_mismatch_conv: number;
  ai_max: { type: string; cost: number; clicks: number; impr: number; conv: number }[];
}

export interface Ctm {
  campaign: string; project: Pid; budget_now: number; target_cpa_now: number | null;
  events: { day: string; who: string; lines: string[]; setting: boolean }[];
  periods: { start: string; end: string; days: number; change: string[]; impr_per_day: number; clicks_per_day: number; cost_per_day: number; conv: number; eligible_per_day: number | null }[];
  duplicates: { project: Pid; keyword: string; campaigns: string[]; cost: number; impr: number }[];
  overlap: { campaign: string; searches: number; ctm_cost: number; roi_cost: number }[];
}

export interface Competitors {
  from: string; to: string;
  rows: { domain: string; impression_share: number | null; impression_share_raw: string; overlap_rate: number | null; position_above_rate: number | null; top_of_page_rate: number | null; abs_top_rate: number | null; outranking_share: number | null }[];
}

export interface LatestDay {
  day: string; source: string; rows: number; cost: number; reviewed: number;
  by_decision: Record<string, { rows: number; cost: number }>;
  flagged_no_call: { rows: number; cost: number };
  by_project: Record<Pid, { rows: number; cost: number; exclude_cost: number; add_cost: number; none_cost: number }>;
}

export interface Model {
  version: number; as_of: string;
  data: {
    campaign_days: (Span & { complete_through: string | null }) | null;
    search_terms: Span & { days: string[]; raw_days: string[] };
    agency_sheet: Span | null; changes: Span | null; keywords: Span | null; auction: Span | null;
  };
  projects: Project[];
  windows: { since: Span | null; last7: Span | null; prev7: Span | null };
  account: { since: Totals; last7: Totals; prev7: Totals; daily: { day: string; cost: number; conv: number; by_project: Record<Pid, number> }[] };
  project_stats: Record<Pid, ProjectStats>;
  campaigns: Campaign[];
  latest_day: LatestDay | null;
  agency: Agency; keywords: Keywords | null; risks: Risks; ctm: Ctm | null; competitors: Competitors | null;
  fixes: Fix[];
  coverage: { day: string; report_rows: number; report_cost: number; sheet_rows: number; sheet_cost: number; reviewed: number; cost_matches: boolean }[];
  /** Added by the dashboard (not the engine): the period every page is showing. */
  period?: { key: string; from: string | null; to: string | null; name: string; prev: string };
}

export interface ReviewRow {
  day: string; term: string; project: Pid; ctype: string; campaign: string; ad_group: string; keyword: string; match_type: string;
  clicks: number; cost: number; cpc: number | null; conv: number; decision: string; neg_term: string; county_comment: string; flags: string[]; source: string;
}

export interface LoadedFile { name: string; kind: string; rows: number; first_day: string | null; last_day: string | null; loaded_at: string; sha: string; note?: string; covers_to?: string }
