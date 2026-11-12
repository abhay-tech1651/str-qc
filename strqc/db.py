"""Local SQLite store. One file on this computer (data/strqc.sqlite); nothing is sent anywhere.

Loading rules, so re-loading a file never double-counts:
  search_terms   a day's rows are replaced by the newest report for that day
  sheet rows     a day's rows from that sheet are replaced (the agency edits old tabs)
  changes        each changed item is kept once (same time, campaign, ad group, type, item)
  campaign_days  a (day, campaign) row is replaced by the newest report covering it
  keywords       the newest keyword report replaces the previous snapshot
  auction        a period's rows are replaced by the newest report for that period
"""
from __future__ import annotations

import datetime as dt
import hashlib
import sqlite3
from pathlib import Path

import pandas as pd

from . import ingest

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "strqc.sqlite"

SCHEMA = """
CREATE TABLE IF NOT EXISTS files (sha256 TEXT PRIMARY KEY, name TEXT, kind TEXT, rows INTEGER, first_day TEXT, last_day TEXT, loaded_at TEXT);
CREATE TABLE IF NOT EXISTS search_terms (day TEXT, term TEXT, match_type TEXT, ads_status TEXT, campaign TEXT, ad_group TEXT,
  keyword TEXT, clicks REAL, impr REAL, cost REAL, conv REAL);
CREATE INDEX IF NOT EXISTS st_day ON search_terms(day);
CREATE TABLE IF NOT EXISTS sheet_rows (sheet TEXT, tab TEXT, day TEXT, term TEXT, match_type TEXT, ads_status TEXT, campaign TEXT,
  ad_group TEXT, keyword TEXT, clicks REAL, impr REAL, cost REAL, conv REAL, decision TEXT, neg_term TEXT, county_comment TEXT);
CREATE INDEX IF NOT EXISTS sh_day ON sheet_rows(sheet, day);
CREATE TABLE IF NOT EXISTS changes (ts TEXT, day TEXT, user TEXT, campaign TEXT, ad_group TEXT, kind TEXT, item TEXT,
  UNIQUE(ts, campaign, ad_group, kind, item));
CREATE TABLE IF NOT EXISTS campaign_days (day TEXT, campaign TEXT, campaign_id TEXT, campaign_status TEXT, status TEXT,
  status_reasons TEXT, bid_strategy TEXT, budget_now REAL, target_cpa_now REAL, impr REAL, clicks REAL, cost REAL, conv REAL,
  all_conv REAL, is_pct REAL, is_raw TEXT, lost_budget_pct REAL, lost_rank_pct REAL, lost_rank_raw TEXT, top_is_pct REAL,
  abs_top_is_pct REAL);
CREATE INDEX IF NOT EXISTS cd_day ON campaign_days(day, campaign);
CREATE TABLE IF NOT EXISTS keywords (period_start TEXT, day TEXT, keyword_status TEXT, keyword TEXT, match_type TEXT, campaign TEXT,
  ad_group TEXT, status TEXT, status_reasons TEXT, final_url TEXT, cost REAL, clicks REAL, impr REAL, conv REAL,
  quality_score REAL, ad_relevance TEXT, landing_page TEXT, is_pct REAL, lost_rank_pct REAL);
CREATE TABLE IF NOT EXISTS auction (period_start TEXT, day TEXT, domain TEXT, impression_share REAL, impression_share_raw TEXT,
  overlap_rate REAL, position_above_rate REAL, top_of_page_rate REAL, abs_top_rate REAL, outranking_share REAL);
"""


def connect() -> sqlite3.Connection:
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    return con


def load_file(path: Path) -> dict:
    path = Path(path)
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    kind, df = ingest.read_any(path)
    if kind == "unknown" or df.empty:
        return dict(name=path.name, kind=kind, rows=0, note="not recognised: export it again from Google Ads or the sheet")
    con = connect()
    with con:
        if kind == "search_terms":
            for d in df.day.unique():
                con.execute("DELETE FROM search_terms WHERE day=?", (d,))
            df.to_sql("search_terms", con, if_exists="append", index=False)
        elif kind in ("roi_sheet", "abhay_sheet"):
            for d in df.day.unique():
                con.execute("DELETE FROM sheet_rows WHERE sheet=? AND day=?", (kind, d))
            df.to_sql("sheet_rows", con, if_exists="append", index=False)
        elif kind == "changes":
            con.executemany("INSERT OR IGNORE INTO changes VALUES (?,?,?,?,?,?,?)",
                            df[["ts", "day", "user", "campaign", "ad_group", "kind", "item"]].itertuples(index=False, name=None))
        elif kind == "campaign_days":
            con.executemany("DELETE FROM campaign_days WHERE day=? AND campaign=?", df[["day", "campaign"]].itertuples(index=False, name=None))
            df.to_sql("campaign_days", con, if_exists="append", index=False)
        elif kind == "keywords":
            con.execute("DELETE FROM keywords")
            df.to_sql("keywords", con, if_exists="append", index=False)
        elif kind == "auction":
            con.execute("DELETE FROM auction WHERE period_start=? AND day=?", (df.period_start.iloc[0], df.day.iloc[0]))
            df.to_sql("auction", con, if_exists="append", index=False)
        con.execute("INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?)",
                    (sha, path.name, kind, len(df), df.day.min(), df.day.max(), dt.datetime.now().isoformat(timespec="seconds")))
    con.close()
    return dict(name=path.name, kind=kind, rows=len(df), first_day=df.day.min(), last_day=df.day.max())


def mtime() -> float:
    return DB.stat().st_mtime if DB.exists() else 0.0


def table(name: str) -> pd.DataFrame:
    con = connect()
    df = pd.read_sql(f"SELECT * FROM {name}", con)  # name comes from code, never from a user
    con.close()
    return df
