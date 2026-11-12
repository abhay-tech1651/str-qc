"""Export the local data as plain JSON tables, the shared input of the Python reference model and the Apps Script engine.

Usage:  python -m strqc.fixtures            writes data/fixtures/{tables,config,agency_tabs}.json
The files hold real account data, so they live in data/ (git-ignored) and never leave this computer.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import tomllib
from pathlib import Path

from . import db

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "fixtures"

COLS = {
    "search_terms": ["day", "term", "match_type", "ads_status", "campaign", "ad_group", "keyword", "clicks", "impr", "cost", "conv"],
    "agency_calls": ["day", "tab", "term", "match_type", "ads_status", "campaign", "ad_group", "keyword", "clicks", "impr", "cost", "conv",
                     "decision", "neg_term", "county_comment"],
    "changes": ["ts", "day", "user", "campaign", "ad_group", "kind", "item"],
    "campaign_days": ["day", "campaign", "campaign_id", "campaign_status", "status", "status_reasons", "bid_strategy", "budget_now",
                      "target_cpa_now", "impr", "clicks", "cost", "conv", "all_conv", "is_pct", "lost_budget_pct", "lost_rank_pct",
                      "top_is_pct", "abs_top_is_pct"],
    "keywords": ["period_start", "day", "keyword_status", "keyword", "match_type", "campaign", "ad_group", "status", "status_reasons",
                 "cost", "clicks", "impr", "conv", "quality_score", "ad_relevance", "landing_page", "is_pct", "lost_rank_pct"],
    "auction": ["period_start", "day", "domain", "impression_share", "impression_share_raw", "overlap_rate", "position_above_rate",
                "top_of_page_rate", "abs_top_rate", "outranking_share"],
}


def _clean(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    if hasattr(v, "item"):  # numpy scalar
        return _clean(v.item())
    return v


def tables() -> dict:
    sheets = db.table("sheet_rows")
    src = {
        "search_terms": db.table("search_terms"),
        "agency_calls": sheets[sheets.sheet == "roi_sheet"],  # the personal sheets are retired; the agency sheet is the record
        "changes": db.table("changes"),
        "campaign_days": db.table("campaign_days"),
        "keywords": db.table("keywords"),
        "auction": db.table("auction"),
    }
    out = {}
    for name, df in src.items():
        cols = COLS[name]
        out[name] = [{c: _clean(r[c]) for c in cols} for r in df[cols].to_dict("records")]
    return out


def config() -> dict:
    cfg = tomllib.loads((ROOT / "config" / "projects.toml").read_text(encoding="utf-8"))
    projects = [dict(id=pid, **p) for pid, p in cfg["projects"].items()]
    return dict(brand_words=cfg["brand_words"], runners=cfg["runners"], projects=projects, flags=cfg["flags"], grace_days=3)


def agency_tabs() -> list:
    """The agency workbook as 2-D arrays per tab, the shape SpreadsheetApp.getValues() returns."""
    import openpyxl
    p = ROOT / "inbox" / "agency_str_sheet.xlsx"
    if not p.exists():
        return []
    wb = openpyxl.load_workbook(p, data_only=True, read_only=True)
    tabs = []
    for ws in wb.worksheets:
        rows = [[_clean(v) if v is not None else "" for v in row] for row in ws.iter_rows(values_only=True)]
        tabs.append(dict(title=ws.title, values=rows))
    return tabs


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t = tables()
    (OUT / "tables.json").write_text(json.dumps(t, ensure_ascii=False), encoding="utf-8")
    (OUT / "config.json").write_text(json.dumps(config(), ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "agency_tabs.json").write_text(json.dumps(agency_tabs(), ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: len(v) for k, v in t.items()}))


if __name__ == "__main__":
    main()
