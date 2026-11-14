"""Read the files people export and turn each into a clean table.

Seven kinds of file are understood, detected from their content (not their name):
  search_terms   Google Ads "Search terms report" CSV (UTF-16 or UTF-8)
  changes        Google Ads "Change history report" CSV
  campaign_days  Google Ads "Campaign report" CSV segmented by Day (with impression-share columns)
  keywords       Google Ads "Search keyword report" CSV (with Quality Score columns)
  auction        Google Ads "Auction insights report" CSV
  roi_sheet      the agency's daily STR workbook (.xlsx), one tab per day, Status/Negative columns
  abhay_sheet    the older personal workbooks (.xlsx), yellow fill on column A = exclude
Nothing here writes anywhere; it only reads and returns pandas DataFrames.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import re
from pathlib import Path

import pandas as pd

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def _text(path: Path) -> str:
    """Google Ads exports are UTF-16 with a byte-order mark; files re-saved by Excel are often UTF-8 or cp1252."""
    raw = Path(path).read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16")
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _pct(v) -> float | None:
    """'35.64%' -> 35.64. Google hides small or large values as '< 10%' / '> 90%': those become None, never a guess."""
    s = str(v).replace(",", "").replace("%", "").strip()
    if not s or s.startswith(("<", ">")) or s in ("--", "nan"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _table(path: Path, header_starts: str) -> tuple[str, pd.DataFrame]:
    """Title on line 1, period on line 2, column header on the line starting with header_starts."""
    lines = _text(path).splitlines()
    hi = next(i for i, l in enumerate(lines[:6]) if l.startswith(header_starts))
    sep = "\t" if "\t" in lines[hi] else ","
    rows = list(csv.reader(io.StringIO("\n".join(l for l in lines[hi:] if l.strip())), delimiter=sep))
    df = pd.DataFrame([r + [""] * (len(rows[0]) - len(r)) for r in rows[1:]], columns=rows[0]).fillna("")
    return (lines[1] if len(lines) > 1 else ""), df


def _period(line: str) -> tuple[str, str]:
    parts = line.split(" - ")
    a, b = _date_from_text(parts[0]), _date_from_text(parts[-1])
    return (a.isoformat() if a else "", b.isoformat() if b else "")


def read_campaign_days(path: Path) -> pd.DataFrame:
    """Campaign report segmented by Day: one row per campaign per day."""
    _, df = _table(path, "Day")
    df = df[df["Day"].str.match(r"\d{4}-\d{2}-\d{2}") & ~df["Campaign status"].str.startswith("Total")]
    return pd.DataFrame({
        "day": df["Day"], "campaign": df["Campaign"], "campaign_id": df.get("Campaign ID", ""),
        "campaign_status": df["Campaign status"], "status": df.get("Status", ""), "status_reasons": df.get("Status reasons", ""),
        "bid_strategy": df.get("Bid strategy type", ""),
        "budget_now": df.get("Budget", "0").map(_num),  # Google shows today's budget on every row, not that day's
        "target_cpa_now": df.get("Target CPA", "").map(_num),
        "impr": df["Impr."].map(_num), "clicks": df["Clicks"].map(_num), "cost": df["Cost"].map(_num),
        "conv": df["Conversions"].map(_num), "all_conv": df.get("All conv.", "0").map(_num),
        "is_pct": df.get("Search impr. share", "").map(_pct), "is_raw": df.get("Search impr. share", ""),
        "lost_budget_pct": df.get("Search lost IS (budget)", "").map(_pct),
        "lost_rank_pct": df.get("Search lost IS (rank)", "").map(_pct), "lost_rank_raw": df.get("Search lost IS (rank)", ""),
        "top_is_pct": df.get("Search top IS", "").map(_pct), "abs_top_is_pct": df.get("Search abs. top IS", "").map(_pct),
    })


def read_keywords(path: Path) -> pd.DataFrame:
    """Search keyword report over a period: one row per keyword (a snapshot, not daily)."""
    period, df = _table(path, "Keyword status")
    a, b = _period(period)
    totals = df[df["Keyword status"].str.startswith("Total")]
    df = df[df["Keyword status"].isin(["Enabled", "Paused"])]
    out = pd.DataFrame({
        "period_start": a, "day": b, "keyword_status": df["Keyword status"], "keyword": df["Keyword"],
        "match_type": df["Match type"].str.replace(" match", "", regex=False), "campaign": df["Campaign"], "ad_group": df["Ad group"],
        "status": df["Status"], "status_reasons": df["Status reasons"], "final_url": df.get("Final URL", ""),
        "cost": df["Cost"].map(_num), "clicks": df["Clicks"].map(_num), "impr": df["Impr."].map(_num), "conv": df["Conversions"].map(_num),
        "quality_score": pd.to_numeric(df["Quality Score"].str.strip(), errors="coerce"),
        "ad_relevance": df.get("Ad relevance", "").str.strip().replace("--", ""),
        "landing_page": df.get("Landing page exp.", "").str.strip().replace("--", ""),
        "is_pct": df.get("Search impr. share", "").map(_pct), "lost_rank_pct": df.get("Search lost IS (rank)", "").map(_pct),
    })
    ai = totals[totals["Keyword status"].str.contains("AI Max")]
    extra = pd.DataFrame({"period_start": a, "day": b, "keyword_status": "Total", "keyword": ai["Keyword status"].str.replace("Total: ", ""),
                          "match_type": "", "campaign": "(all)", "ad_group": "", "status": "", "status_reasons": "", "final_url": "",
                          "cost": ai["Cost"].map(_num), "clicks": ai["Clicks"].map(_num), "impr": ai["Impr."].map(_num),
                          "conv": ai["Conversions"].map(_num), "quality_score": None, "ad_relevance": "", "landing_page": "",
                          "is_pct": None, "lost_rank_pct": None})
    return pd.concat([out, extra], ignore_index=True)


def read_auction(path: Path) -> pd.DataFrame:
    period, df = _table(path, "Display URL domain")
    a, b = _period(period)
    return pd.DataFrame({
        "period_start": a, "day": b, "domain": df["Display URL domain"],
        "impression_share": df["Impression share"].map(_pct), "impression_share_raw": df["Impression share"],
        "overlap_rate": df["Overlap rate"].map(_pct), "position_above_rate": df["Position above rate"].map(_pct),
        "top_of_page_rate": df["Top of page rate"].map(_pct), "abs_top_rate": df["Abs. Top of page rate"].map(_pct),
        "outranking_share": df["Outranking share"].map(_pct),
    })


def _num(v) -> float:
    s = str(v).replace(",", "").replace("%", "").strip()
    if s in ("", "--", "nan", "None"):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _date_from_text(s: str) -> dt.date | None:
    m = re.search(r"(\d{1,2})\w*\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})", s)
    if m and m.group(2).lower() in MONTHS:
        return dt.date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
    return None


def detect(path: Path) -> str:
    p = Path(path)
    if p.suffix.lower() in (".xlsx", ".xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
        for ws in wb.worksheets[:6]:
            for row in ws.iter_rows(max_row=6, values_only=True):
                vals = [str(v).strip().lower() for v in row if v]
                if "status" in vals and any(v.startswith("negative") for v in vals):
                    return "roi_sheet"
        return "abhay_sheet"
    head = _text(p)[:400].lstrip("﻿")
    if head.startswith("Change history report") or "Date & time" in head:
        return "changes"
    if head.startswith("Campaign report") and "\nDay" in head:
        return "campaign_days"
    if head.startswith("Search keyword report"):
        return "keywords"
    if head.startswith("Auction insights report"):
        return "auction"
    if "Search term" in head:
        return "search_terms"
    return "unknown"


def _row_day(v: str, period) -> str:
    """A Day cell ('2026-10-30' or '30 Oct 2026'); falls back to the report's period."""
    if re.match(r"\d{4}-\d{2}-\d{2}", v):
        return v[:10]
    d = _date_from_text(v) or period
    return d.isoformat() if d else ""


def read_search_terms(path: Path) -> pd.DataFrame:
    """One row per search term x match type x campaign x ad group x keyword for the report's day."""
    lines = _text(path).splitlines()
    period = _date_from_text(lines[1]) if len(lines) > 1 else None
    hi = next(i for i, l in enumerate(lines[:6]) if re.match(r"(Day[\t,])?Search term[\t,]", l))  # the column header, not the "Search terms report" title
    sep = "\t" if "\t" in lines[hi] else ","
    body = [l for l in lines[hi:] if l.strip() and not l.startswith("Total")]
    rows = list(csv.reader(io.StringIO("\n".join(body)), delimiter=sep))
    df = pd.DataFrame([r + [""] * (len(rows[0]) - len(r)) for r in rows[1:]], columns=rows[0]).fillna("")
    out = pd.DataFrame({
        # with Segment > Time > Day the report has a Day column, so one file can hold several days
        "day": df["Day"].map(lambda v: _row_day(v, period)) if "Day" in df.columns else (period.isoformat() if period else ""),
        "term": df["Search term"].str.strip().str.lower(),
        "match_type": df.get("Match type", ""),
        "ads_status": df.get("Added/Excluded", ""),
        "campaign": df.get("Campaign", ""),
        "ad_group": df.get("Ad group", ""),
        "keyword": df.get("Keyword", "").str.strip('"').str.replace('""', '"'),
        "clicks": df.get("Clicks", "0").map(_num),
        "impr": df.get("Impr.", "0").map(_num),
        "cost": df.get("Cost", "0").map(_num),
        "conv": df.get("Conversions", "0").map(_num),
    })
    # a day-segmented report repeats Google's totals for each day
    return out[~(out["term"].str.startswith("total:") & (out["campaign"] == ""))].reset_index(drop=True)


def read_changes(path: Path) -> pd.DataFrame:
    """One row per item changed (each keyword / negative), keeping the change type it sits under."""
    lines = _text(path).splitlines(True)
    start = next(i for i, l in enumerate(lines[:6]) if l.startswith("Date & time"))
    rows = list(csv.reader(io.StringIO("".join(lines[start:])), delimiter="\t"))
    head = rows[0]
    items = []
    for r in rows[1:]:
        if len(r) < 5:
            continue
        e = dict(zip(head, r))
        ts = pd.to_datetime(e["Date & time"], format="%d %b %Y, %H:%M:%S")
        parts = e["Changes"].split("\n")
        kind = re.sub(r"^\d+\s+", "", parts[0].strip())
        body = [p.strip() for p in parts[1:] if p.strip()]
        base = dict(ts=ts.isoformat(), day=ts.date().isoformat(), user=e["User"], campaign=e["Campaign"], ad_group=e["Ad group"])
        if "keyword" not in kind:
            items.append(dict(base, kind=kind, item=" | ".join(body)[:500]))
            continue
        for p in body:
            sub = re.match(r"^\d+\s+(.*keyword.*)$", p)
            if sub:
                kind = sub.group(1)
                continue
            items.append(dict(base, kind=kind, item=p))
    return pd.DataFrame(items)


def _tab_date(title: str, ws) -> dt.date | None:
    for row in ws.iter_rows(max_row=3, values_only=True):  # "9 October 2026 - 9 October 2026" header beats the tab name
        if row and row[0] and re.search(r"\d{4} - ", str(row[0])):
            d = _date_from_text(str(row[0]))
            if d:
                return d
    m = re.match(r"\s*(\d{1,2})\w*\s+([A-Za-z]{3})", title)
    if m and m.group(2).lower() in MONTHS:
        return dt.date(2026, MONTHS[m.group(2).lower()], int(m.group(1)))
    return None


def _cell_text(v) -> str:
    """Text of a sheet cell the way Google Sheets shows it: a whole number typed as 124 is '124', never '124.0'."""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v)


def read_sheet(path: Path, kind: str) -> pd.DataFrame:
    """Agency sheet: decision from the Status column. Personal sheet: yellow fill on the search term = exclude."""
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    out = []
    for ws in wb.worksheets:
        day = _tab_date(ws.title, ws)
        if not day:
            continue
        rows = list(ws.iter_rows())
        hi = next((i for i, r in enumerate(rows[:10]) if any(str(c.value or "").strip().lower() == "match type" for c in r)), None)
        if hi is None:
            continue
        H = {str(c.value).strip().lower(): j for j, c in enumerate(rows[hi]) if c.value}

        def g(r, *keys):
            for k in keys:
                if k in H and H[k] < len(r):
                    return r[H[k]].value
            return None
        for r in rows[hi + 1:]:
            term = r[0].value
            if not term or str(term).lower().startswith("total"):
                continue
            a = r[0]
            fill = a.fill.fgColor.rgb if a.fill and a.fill.fill_type and a.fill.fgColor.type == "rgb" else ""
            if kind == "roi_sheet":
                decision = _cell_text(g(r, "status") or "").strip().title()
                neg = _cell_text(g(r, "negative broad") or "").strip()
                comment = _cell_text(g(r, "county comments", "county comment") or "").strip()
            else:
                decision = "Exclude" if fill == "FFFFFF00" else ""
                neg, comment = "", ""
            out.append(dict(sheet=kind, tab=ws.title, day=day.isoformat(), term=_cell_text(term).strip().lower(),
                            match_type=g(r, "match type") or "", ads_status=g(r, "added/excluded") or "",
                            campaign=g(r, "campaign") or ("Ivory_County_SearchCTM" if "ctm" in path.name.lower() else ""),
                            ad_group=g(r, "ad group") or "", keyword=_cell_text(g(r, "keywords", "keyword") or ""),
                            clicks=_num(g(r, "clicks")), impr=_num(g(r, "impr.")), cost=_num(g(r, "cost")),
                            conv=_num(g(r, "conversions")), decision=decision, neg_term=neg, county_comment=comment))
    return pd.DataFrame(out)


def read_any(path: Path) -> tuple[str, pd.DataFrame]:
    kind = detect(path)
    if kind == "search_terms":
        return kind, read_search_terms(path)
    if kind == "changes":
        return kind, read_changes(path)
    if kind in ("roi_sheet", "abhay_sheet"):
        return kind, read_sheet(path, kind)
    if kind == "campaign_days":
        return kind, read_campaign_days(path)
    if kind == "keywords":
        return kind, read_keywords(path)
    if kind == "auction":
        return kind, read_auction(path)
    return kind, pd.DataFrame()
