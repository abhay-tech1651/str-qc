"""Reference model: the exact JSON the briefing dashboard reads, built from the shared fixture tables.

This file is the contract. The Apps Script engine (apps-script/*.js) builds the same model from the same tables and
tests-js/parity.test.js compares the two field by field. Every rule, threshold and sort order lives here once.

Usage:  python -m strqc.model [--as-of 2026-11-06]   reads data/fixtures/*.json, writes data/fixtures/model.json and review.json
Plain lists and dicts on purpose (no pandas): the JavaScript port mirrors these loops line for line.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "data" / "fixtures"
MODEL_VERSION = 1


# ---------------------------------------------------------------- small helpers (mirrored in apps-script/Util.js)
def rnd(x, nd=0):
    """Round half up, the way JavaScript's Math.round does. Never Python's banker's rounding."""
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    f = 10 ** nd
    v = math.floor(x * f + 0.5) / f
    return int(v) if nd == 0 else v


def tok(s) -> list:
    return [t for t in re.split(r"[^a-z0-9&]+", str(s or "").lower()) if t]


def add_days(day: str, n: int) -> str:
    return (dt.date.fromisoformat(day) + dt.timedelta(days=n)).isoformat()


def days_between(a: str, b: str) -> int:
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def parse_negative(s: str):
    s = str(s or "").strip().lstrip("-").strip()
    if s.startswith("["):
        return "exact", tok(s)
    if s.startswith('"'):
        return "phrase", tok(s)
    return "broad", tok(s)


def blocks(match: str, words: list, q: list) -> bool:
    """Would a negative (match type + words) block this search (already split into words)?"""
    if not words or not set(words) <= set(q):
        return False
    if match == "broad":
        return True
    if match == "phrase":
        n = len(words)
        return any(q[i:i + n] == words for i in range(len(q) - n + 1))
    return q == words


def median(xs):
    return statistics.median(xs) if xs else None


def wavg(rows, key):
    """Impression-weighted average of a percentage, skipping days Google hid the exact value ('< 10%')."""
    use = [x for x in rows if x.get(key) is not None and (x.get("impr") or 0) > 0]
    tot = sum(x["impr"] for x in use)
    return rnd(sum(x[key] * x["impr"] for x in use) / tot, 1) if tot else None


# Two common words that together name a place: excluding a wrong area is SOP rule 6, not a risky negative.
AREA_PHRASES = {"greater noida", "noida extension", "new gurgaon", "new delhi", "dwarka expressway", "golf course"}

MONTH_TOKEN = re.compile(r"^(jan|feb|mar|apr|april|may|jun|june|jul|july|aug|sep|sept|oct|nov|dec)\d*$", re.I)
DROP_TOKENS = {"roi", "search", "searchctm", "brand", "non", "competitor", "maxconv", "county", "pmax", "p-max"}


class Ctx:
    """Config-driven facts about campaigns and search terms."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.projects = cfg["projects"]
        self.pids = [p["id"] for p in self.projects]
        self.pmap = {p["id"]: p for p in self.projects}
        self.brand_words = set(cfg["brand_words"])
        self.flags = cfg["flags"]
        self.risky_words = set(cfg["flags"]["risky_negative_words"])
        self.grace = cfg.get("grace_days", 3)
        self._facts = {}
        self._flag_res = {k: [re.compile(p) for p in cfg["flags"][k]] for k in ("address", "budget", "rent_or_stay", "jobs_or_other")}

    def facts(self, campaign: str) -> dict:
        if campaign in self._facts:
            return self._facts[campaign]
        low = str(campaign or "").lower()
        project = next((p["id"] for p in self.projects if any(m in low for m in p["match"])), "other")
        runner = next((r for r, keys in self.cfg["runners"].items() if any(k.lower() in low for k in keys)), "other")
        if "non_brand" in low:
            ctype = "Non-brand"
        elif "competitor" in low:
            ctype = "Competitor"
        elif "brand" in low:
            ctype = "Brand"
        elif "ctm" in low:
            ctype = "Google CTM"
        elif "p-max" in low or "pmax" in low:
            ctype = "Performance Max"
        else:
            ctype = "Other"
        f = dict(project=project, runner=runner, ctype=ctype, label=self.label(campaign, project, ctype))
        self._facts[campaign] = f
        return f

    def label(self, campaign: str, project: str, ctype: str) -> str:
        """ROI_CocoaCounty_Non_Brand_Search_NCR_Dwarka_Expressway_Sept_26 -> 'Cocoa · Non-brand · NCR Dwarka Expressway'."""
        name = self.pmap[project]["name"].replace(" County", "") if project in self.pmap else "Other"
        keep = []
        for t in str(campaign or "").split("_"):
            low = t.lower()
            if (not t or low in DROP_TOKENS or MONTH_TOKEN.match(t) or re.match(r"^\d+$", t) or re.match(r"^\d{1,2}-\d{1,2}-\d{4}$", t)
                    or (project in self.pmap and any(m in low for m in self.pmap[project]["match"]))):
                continue
            keep.append(t.upper() if t.upper() == "NCR" else t[:1].upper() + t[1:].lower())
        return " · ".join([name, ctype] + ([" ".join(keep)] if keep else []))

    def has_brand(self, term) -> bool:
        return any(w in self.brand_words for w in tok(term))

    def flag_codes(self, term: str, ctype: str) -> list:
        out = []
        for code, key in (("address", "address"), ("budget", "budget"), ("rent", "rent_or_stay"), ("not_purchase", "jobs_or_other")):
            if any(rx.search(term) for rx in self._flag_res[key]):
                out.append(code)
        if ctype == "Brand" and not self.has_brand(term):
            out.append("brand_missing")
        if ctype in ("Non-brand", "Competitor") and self.has_brand(term):
            out.append("brand_in_nonbrand")
        return out


# ---------------------------------------------------------------- the model
def build(T: dict, cfg: dict, as_of: str) -> tuple[dict, list]:
    C = Ctx(cfg)
    F = C.facts
    raw, calls, changes = T["search_terms"], T["agency_calls"], T["changes"]
    cdays, kwrows, auction = T["campaign_days"], T["keywords"], T["auction"]

    # -- search-term rows: Google's own report where we have the day, otherwise the agency's copy of it
    raw_days = sorted({x["day"] for x in raw})
    # per day AND campaign: a report filtered to one campaign must not hide the agency rows of the others
    have = {(x["day"], x["campaign"]) for x in raw}
    st_cols = ["day", "term", "match_type", "ads_status", "campaign", "ad_group", "keyword", "clicks", "impr", "cost", "conv"]
    st = [dict({c: x[c] for c in st_cols}, source="Google Ads report") for x in raw]
    st += [dict({c: x[c] for c in st_cols}, source="agency sheet") for x in calls if (x["day"], x["campaign"]) not in have]
    for x in st:
        x.update({k: v for k, v in F(x["campaign"]).items() if k != "label"})
    st.sort(key=lambda x: (x["day"], x["campaign"], x["ad_group"], x["term"], x["match_type"]))
    calls = sorted(calls, key=lambda x: (x["day"], x["campaign"], x["ad_group"], x["term"], x["match_type"]))

    # -- changes split into negatives added and keywords added, oldest first
    chs = sorted(changes, key=lambda x: (x["ts"], x["campaign"], x["ad_group"], x["kind"], x["item"]))
    negs = []
    for x in chs:
        if x["kind"].startswith("negative") and "added" in x["kind"]:
            m, w = parse_negative(x["item"])
            negs.append(dict(x, nmatch=m, nwords=w, level="ad group" if x["ad_group"] else "campaign"))
    kws = [dict(x, kw=" ".join(tok(x["item"])), kmatch=x["kind"].split()[0]) for x in chs
           if "match keyword added" in x["kind"] and not x["kind"].startswith("negative")]
    # the export period can run past the last change (days with no changes); the store passes that end as changes_through
    last_change = max([x["day"] for x in changes] + ([str(cfg["changes_through"])] if cfg.get("changes_through") else []), default="")
    first_change = min((x["day"] for x in changes), default="")

    def covered(day):
        """Does the loaded change history reach back to the day before this sheet day? If not, a missing negative proves nothing."""
        return bool(first_change) and add_days(day, -1) >= first_change
    by_camp = {}
    for n in negs:
        by_camp.setdefault(n["campaign"], []).append(n)

    # ======================================================= 1. agency said vs done
    ex_rows = []
    for c in calls:
        if c["decision"] != "Exclude":
            continue
        start, q = add_days(c["day"], -1), tok(c["term"])
        hit = other = None
        for n in by_camp.get(c["campaign"], []):
            if n["day"] < start or not blocks(n["nmatch"], n["nwords"], q):
                continue
            if n["ad_group"] in ("", c["ad_group"]):
                hit = n
                break
            other = other or n
        age = days_between(c["day"], last_change) if last_change else None
        if hit:
            status, when, how = "applied", hit["day"], hit["item"]
        elif other:
            status, when, how = "applied_elsewhere", other["day"], other["item"]
        elif not covered(c["day"]):
            status, when, how = "unchecked", "", ""
        else:
            status = "waiting" if age is not None and age <= C.grace else "overdue"
            when = how = ""
        ex_rows.append(dict(day=c["day"], term=c["term"], project=F(c["campaign"])["project"], campaign=c["campaign"],
                            ad_group=c["ad_group"], cost=c["cost"], clicks=c["clicks"], neg_term=c["neg_term"],
                            county_comment=c["county_comment"], status=status, applied_on=when, applied_as=how,
                            days_late=days_between(c["day"], when) if when else None))

    add_rows = []
    for c in calls:
        if c["decision"] != "Add":
            continue
        t, start = " ".join(tok(c["term"])), add_days(c["day"], -1)
        k = [x for x in kws if x["kw"] == t and x["day"] >= start]
        same = [x for x in k if x["campaign"] == c["campaign"]]
        age = days_between(c["day"], last_change) if last_change else None
        if c["ads_status"] == "Added":
            status, where, when = "already", "", ""
        elif same:
            status, where, when = "added", same[0]["ad_group"], same[0]["day"]
        elif k:
            status, where, when = "added_elsewhere", k[0]["campaign"], k[0]["day"]
        elif not covered(c["day"]):
            status, where, when = "unchecked", "", ""
        else:
            status, where, when = ("waiting" if age is not None and age <= C.grace else "overdue"), "", ""
        add_rows.append(dict(day=c["day"], term=c["term"], project=F(c["campaign"])["project"], campaign=c["campaign"],
                             ad_group=c["ad_group"], cost=c["cost"], clicks=c["clicks"], conv=c["conv"], status=status,
                             added_to=where, added_on=when))

    def count(rows, status):
        return sum(1 for x in rows if x["status"] == status)

    judged = [x for x in ex_rows if x["status"] not in ("waiting", "unchecked")]
    done = [x for x in judged if x["status"] in ("applied", "applied_elsewhere")]
    overdue = [x for x in ex_rows if x["status"] == "overdue"]
    lags = [x["days_late"] for x in ex_rows if x["days_late"] is not None]
    lag_bins = {}
    for v in lags:
        b = max(0, min(10, v))
        lag_bins[b] = lag_bins.get(b, 0) + 1
    by_day = {}
    for x in ex_rows:
        d = by_day.setdefault(x["day"], dict(day=x["day"], applied=0, applied_elsewhere=0, waiting=0, overdue=0, unchecked=0))
        d[x["status"]] += 1
    no_neg = [x for x in ex_rows if not x["neg_term"]]
    ag_by_project = {}
    for pid in C.pids:
        e = [x for x in ex_rows if x["project"] == pid]
        j = [x for x in e if x["status"] not in ("waiting", "unchecked")]
        o = [x for x in e if x["status"] == "overdue"]
        a = [x for x in add_rows if x["project"] == pid]
        ag_by_project[pid] = dict(excludes=len(e), judged=len(j),
                                  applied_pct=rnd(100 * sum(1 for x in j if x["status"] != "overdue") / len(j), 1) if j else None,
                                  overdue=len(o), overdue_cost=rnd(sum(x["cost"] for x in o), 2),
                                  adds=len(a), adds_overdue=count(a, "overdue"))
    row_cols = ["day", "term", "project", "campaign", "ad_group", "cost", "neg_term", "county_comment", "status"]
    agency = dict(
        grace_days=C.grace, last_change_day=last_change, changes_from=first_change,
        excludes=dict(total=len(ex_rows), applied=count(ex_rows, "applied"), applied_elsewhere=count(ex_rows, "applied_elsewhere"),
                      waiting=count(ex_rows, "waiting"), unchecked=count(ex_rows, "unchecked"), overdue=len(overdue), overdue_cost=rnd(sum(x["cost"] for x in overdue), 2),
                      judged=len(judged), applied_pct=rnd(100 * len(done) / len(judged), 1) if judged else None,
                      median_lag=median(lags)),
        adds=dict(total=len(add_rows), added=count(add_rows, "added"), added_elsewhere=count(add_rows, "added_elsewhere"),
                  already=count(add_rows, "already"), waiting=count(add_rows, "waiting"), unchecked=count(add_rows, "unchecked"),
                  overdue=count(add_rows, "overdue")),
        no_negative=dict(rows=len(no_neg), cost=rnd(sum(x["cost"] for x in no_neg), 2),
                         open=sum(1 for x in no_neg if x["status"] in ("waiting", "overdue"))),
        by_day=[by_day[d] for d in sorted(by_day)],
        lag=[dict(days=("10+" if b == 10 else str(b)), count=lag_bins[b]) for b in sorted(lag_bins)],
        by_project=ag_by_project,
        overdue_excludes=sorted([{k: x[k] for k in row_cols} for x in overdue], key=lambda x: (-x["cost"], x["day"], x["term"])),
        overdue_adds=sorted([{k: x[k] for k in ["day", "term", "project", "campaign", "ad_group", "cost", "clicks", "conv"]}
                             for x in add_rows if x["status"] == "overdue"], key=lambda x: (-x["cost"], x["day"], x["term"])),
        no_negative_rows=sorted([{k: x[k] for k in row_cols} for x in no_neg], key=lambda x: (-x["cost"], x["day"], x["term"])),
    )

    # ======================================================= 2. account risks
    # 2a. our keywords switched off by our own negatives
    K, seen = [], set()
    cand = [(x["campaign"], x["ad_group"], x["item"]) for x in kws] + \
           [(x["campaign"], x["ad_group"], x["keyword"]) for x in st if x["keyword"] not in ("", "-")]
    for camp, ag, text in cand:
        if re.search(r"Headline|Asset ID|Path ", text or ""):
            continue
        kwn = " ".join(tok(text))
        if not kwn or (camp, ag, kwn) in seen:
            continue
        seen.add((camp, ag, kwn))
        K.append(dict(campaign=camp, ad_group=ag, kwn=kwn, toks=kwn.split()))
    blocked = []
    for k in K:
        for n in by_camp.get(k["campaign"], []):
            if n["ad_group"] in ("", k["ad_group"]) and blocks(n["nmatch"], n["nwords"], k["toks"]):
                blocked.append(dict(project=F(k["campaign"])["project"], campaign=k["campaign"], ad_group=k["ad_group"],
                                    keyword=k["kwn"], blocked_by=n["item"], level=n["level"], added=n["day"],
                                    added_by=n["user"].split("@")[0]))
    blocked.sort(key=lambda x: (x["project"], x["campaign"], x["ad_group"], x["keyword"], x["blocked_by"]))

    # 2b. campaign-wide negatives that are risky as written (SOP section 7: never a bare number or a lone common word
    #     campaign-wide). Ad-group negatives are funnelling; their side effects show up in 2a instead.
    no_vp = {p["id"] for p in C.projects if p.get("villas_or_penthouses") == "no"}
    vp_words = ("villa", "villas", "penthouse", "penthouses", "pent", "house")
    risky, seen = [], set()
    for n in negs:
        key = (n["campaign"], n["ad_group"], n["item"])
        if n["level"] != "campaign" or n["nmatch"] == "exact" or len(n["nwords"]) > 2 or key in seen:
            continue
        seen.add(key)
        w, proj = n["nwords"], F(n["campaign"])["project"]
        why = ""
        if proj in no_vp and w != ["house"] and all(x in vp_words for x in w):
            why = ""  # this project sells no villas or penthouses, so blocking them campaign-wide is right
        elif len(w) == 1 and w[0].isdigit():
            why = "bare_number"
        elif len(w) == 1 and w[0] in C.risky_words:
            why = "common_word"
        elif len(w) == 2 and all(x in C.risky_words for x in w) and " ".join(w) not in AREA_PHRASES:
            why = "common_pair"
        if why:
            risky.append(dict(project=proj, campaign=n["campaign"], ad_group=n["ad_group"], item=n["item"], level=n["level"],
                              added=n["day"], added_by=n["user"].split("@")[0], why=why))
    risky.sort(key=lambda x: (x["project"], x["campaign"], x["added"], x["item"]))

    # 2c. the sheet contradicts itself: a negative it asks for would block a search it says to Add
    adds_by_camp = {}
    for c in calls:
        if c["decision"] == "Add":
            adds_by_camp.setdefault(c["campaign"], []).append(c["term"])
    conflicts, seen = [], set()
    for c in calls:
        if c["decision"] != "Exclude" or not c["neg_term"] or (c["campaign"], c["neg_term"]) in seen:
            continue
        seen.add((c["campaign"], c["neg_term"]))
        if c["campaign"] not in adds_by_camp:
            continue
        m, w = parse_negative(c["neg_term"])
        hit = sorted({t for t in adds_by_camp[c["campaign"]] if blocks(m, w, tok(t))})
        if hit:
            conflicts.append(dict(day=c["day"], project=F(c["campaign"])["project"], campaign=c["campaign"], negative=c["neg_term"],
                                  written_for=c["term"], would_block=len(hit), example=hit[0]))
    conflicts.sort(key=lambda x: (x["project"], x["campaign"], x["day"], x["negative"]))

    # 2d. a search kept getting clicks after a negative that should block it went in
    leaks, seen = [], set()
    st_by_camp = {}
    for x in st:
        st_by_camp.setdefault(x["campaign"], []).append(x)
    for n in negs:
        key = (n["campaign"], n["ad_group"], n["item"])
        if key in seen:
            continue
        seen.add(key)
        hits = [x for x in st_by_camp.get(n["campaign"], []) if x["day"] > n["day"] and n["ad_group"] in ("", x["ad_group"])
                and blocks(n["nmatch"], n["nwords"], tok(x["term"]))]
        if hits:
            top = sorted(hits, key=lambda x: (-x["cost"], x["term"]))[0]
            leaks.append(dict(project=F(n["campaign"])["project"], campaign=n["campaign"], negative=n["item"], level=n["level"],
                              ad_group=n["ad_group"], added=n["day"], later_rows=len(hits),
                              later_cost=rnd(sum(x["cost"] for x in hits), 2), example=top["term"], last_seen=max(x["day"] for x in hits)))
    leaks.sort(key=lambda x: (-x["later_cost"], x["campaign"], x["negative"]))

    # 2e. brand guard, both directions
    bcols = ["day", "term", "project", "campaign", "ad_group", "keyword", "match_type", "clicks", "cost"]
    brand_no_word = sorted([{k: x[k] for k in bcols} for x in st if x["ctype"] == "Brand" and not C.has_brand(x["term"])],
                           key=lambda x: (-x["cost"], x["day"], x["term"]))
    brand_leak = sorted([{k: x[k] for k in bcols} for x in st if x["ctype"] in ("Non-brand", "Competitor") and C.has_brand(x["term"])],
                        key=lambda x: (-x["cost"], x["day"], x["term"]))

    # 2f. junk excluded in one campaign, then paid for in another (negatives work per campaign)
    first_ex = {}
    for c in calls:
        if c["decision"] == "Exclude":
            f = first_ex.setdefault(c["term"], dict(day=c["day"], camps=set()))
            f["day"] = min(f["day"], c["day"])
            f["camps"].add(c["campaign"])
    repeats = []
    for x in st:
        f = first_ex.get(x["term"])
        if f and x["day"] > f["day"] and x["campaign"] not in f["camps"]:
            repeats.append(dict(day=x["day"], term=x["term"], project=x["project"], campaign=x["campaign"], cost=x["cost"],
                                first_excluded=f["day"], excluded_in=sorted(f["camps"])))
    repeats.sort(key=lambda x: (-x["cost"], x["day"], x["term"]))

    def proj_sum(rows, pid, key="cost"):
        return rnd(sum(x[key] for x in rows if x["project"] == pid), 2)

    risks = dict(
        brand_no_word=brand_no_word, brand_leak=brand_leak, blocked=blocked, risky=risky, conflicts=conflicts, leaks=leaks, repeats=repeats,
        by_project={pid: dict(brand_no_word_cost=proj_sum(brand_no_word, pid), brand_no_word_rows=sum(1 for x in brand_no_word if x["project"] == pid),
                              brand_leak_cost=proj_sum(brand_leak, pid), brand_leak_rows=sum(1 for x in brand_leak if x["project"] == pid),
                              blocked_keywords=len({(x["campaign"], x["ad_group"], x["keyword"]) for x in blocked if x["project"] == pid}),
                              risky=sum(1 for x in risky if x["project"] == pid), conflicts=sum(1 for x in conflicts if x["project"] == pid),
                              repeats_cost=proj_sum(repeats, pid))
                    for pid in C.pids})

    # ======================================================= 3. daily review rows (every search-term day)
    call_key = {}
    for c in calls:
        call_key.setdefault((c["day"], c["term"], c["campaign"], c["ad_group"], c["match_type"]), c)
    review = []
    for x in st:
        c = call_key.get((x["day"], x["term"], x["campaign"], x["ad_group"], x["match_type"]))
        review.append(dict(day=x["day"], term=x["term"], project=x["project"], ctype=x["ctype"], campaign=x["campaign"],
                           ad_group=x["ad_group"], keyword=x["keyword"], match_type=x["match_type"], clicks=x["clicks"],
                           cost=x["cost"], cpc=rnd(x["cost"] / x["clicks"], 2) if x["clicks"] else None, conv=x["conv"],
                           decision=c["decision"] if c else "", neg_term=c["neg_term"] if c else "",
                           county_comment=c["county_comment"] if c else "", flags=C.flag_codes(x["term"], x["ctype"]),
                           source=x["source"]))
    review.sort(key=lambda x: (x["day"], -x["cost"], x["term"], x["campaign"], x["ad_group"]))
    st_days = sorted({x["day"] for x in st})
    latest = None
    if st_days:
        day = st_days[-1]
        rows = [x for x in review if x["day"] == day]

        def agg(rs):
            return dict(rows=len(rs), cost=rnd(sum(x["cost"] for x in rs), 2))
        latest = dict(day=day, source=rows[0]["source"] if rows else "", **agg(rows),
                      reviewed=sum(1 for x in rows if x["decision"]),
                      by_decision={k: agg([x for x in rows if (x["decision"] or "None") == k]) for k in ("Exclude", "Add", "Discuss", "Leave", "None")},
                      flagged_no_call=agg([x for x in rows if x["flags"] and not x["decision"]]),
                      by_project={pid: dict(rows=sum(1 for x in rows if x["project"] == pid),
                                            cost=proj_sum(rows, pid),
                                            exclude_cost=rnd(sum(x["cost"] for x in rows if x["project"] == pid and x["decision"] == "Exclude"), 2),
                                            add_cost=rnd(sum(x["cost"] for x in rows if x["project"] == pid and x["decision"] == "Add"), 2),
                                            none_cost=rnd(sum(x["cost"] for x in rows if x["project"] == pid and not x["decision"]), 2))
                                  for pid in C.pids})

    coverage = []
    for day in raw_days:
        a = [x for x in raw if x["day"] == day]
        camps = {x["campaign"] for x in a}
        b = [x for x in calls if x["day"] == day and x["campaign"] in camps]
        coverage.append(dict(day=day, campaigns=len(camps), report_rows=len(a), report_cost=rnd(sum(x["cost"] for x in a), 2), sheet_rows=len(b),
                             sheet_cost=rnd(sum(x["cost"] for x in b), 2), reviewed=sum(1 for x in b if x["decision"]),
                             cost_matches=abs(sum(x["cost"] for x in a) - sum(x["cost"] for x in b)) < 1))

    # ======================================================= 4. campaigns
    cd = sorted(cdays, key=lambda x: (x["day"], x["campaign"]))
    camp_last = max((x["day"] for x in cd), default=None)
    complete = min(camp_last, add_days(as_of, -1)) if camp_last else None
    first = min((x["day"] for x in cd), default=None)
    win = dict(since=(first, complete), last7=(add_days(complete, -6), complete) if complete else None,
               prev7=(add_days(complete, -13), add_days(complete, -7)) if complete else None)

    def stats(rows):
        if not rows:
            return None
        days = len({x["day"] for x in rows})
        cost, clicks = sum(x["cost"] for x in rows), sum(x["clicks"] for x in rows)
        conv, impr = sum(x["conv"] for x in rows), sum(x["impr"] for x in rows)
        last = max(rows, key=lambda x: x["day"])
        budget = last.get("budget_now") or 0
        return dict(days=days, cost=rnd(cost, 2), clicks=rnd(clicks), impr=rnd(impr), conv=rnd(conv, 2),
                    all_conv=rnd(sum(x["all_conv"] for x in rows), 2), cpa=rnd(cost / conv) if conv else None,
                    cpc=rnd(cost / clicks, 2) if clicks else None, cost_per_day=rnd(cost / days),
                    budget_use=rnd(100 * cost / days / budget, 1) if budget else None,
                    is_pct=wavg(rows, "is_pct"), lost_budget_pct=wavg(rows, "lost_budget_pct"),
                    lost_rank_pct=wavg(rows, "lost_rank_pct"), top_is_pct=wavg(rows, "top_is_pct"))

    def in_win(rows, w):
        return [x for x in rows if w and w[0] <= x["day"] <= w[1]]

    def verdict(ctype, s):
        if not s or s["cost"] <= 0:
            return "idle"
        if s["budget_use"] is not None and s["budget_use"] < 30:
            return "underspending"
        if (s["lost_budget_pct"] or 0) >= 20:
            return "budget"
        if (s["lost_rank_pct"] or 0) >= 40 or (s["is_pct"] is None and s["impr"] > 0):
            return "rank"
        if ctype == "Brand" and s["is_pct"] is not None and s["is_pct"] < 80:
            return "brand_gap"
        return "ok"

    campaigns = []
    for name in sorted({x["campaign"] for x in cd}):
        rows = [x for x in cd if x["campaign"] == name]
        f = F(name)
        last = max(rows, key=lambda x: x["day"])
        since, l7 = stats(in_win(rows, win["since"])), stats(in_win(rows, win["last7"]))
        series = [dict(day=x["day"], cost=x["cost"], impr=x["impr"], clicks=x["clicks"], conv=x["conv"], is_pct=x["is_pct"],
                       lost_budget_pct=x["lost_budget_pct"], lost_rank_pct=x["lost_rank_pct"],
                       eligible=rnd(x["impr"] / (x["is_pct"] / 100)) if x["is_pct"] else None)
                  for x in rows if x["day"] <= complete]
        campaigns.append(dict(id=name, label=f["label"], project=f["project"], runner=f["runner"], ctype=f["ctype"],
                              bid_strategy=last["bid_strategy"], status=last["status"], status_reasons=last["status_reasons"],
                              budget_now=last["budget_now"], target_cpa_now=last["target_cpa_now"] or None,
                              since=since, last7=l7, prev7=stats(in_win(rows, win["prev7"])), verdict=verdict(f["ctype"], l7),
                              conv_gap=bool(since and since["all_conv"] >= 20 and since["all_conv"] > 5 * since["conv"]),
                              series=series))
    campaigns.sort(key=lambda c: (C.pids.index(c["project"]) if c["project"] in C.pids else 99, -((c["since"] or {}).get("cost") or 0)))

    def roll(rows):
        cost, conv = sum(x["cost"] for x in rows), sum(x["conv"] for x in rows)
        return dict(cost=rnd(cost, 2), clicks=rnd(sum(x["clicks"] for x in rows)), impr=rnd(sum(x["impr"] for x in rows)),
                    conv=rnd(conv, 2), all_conv=rnd(sum(x["all_conv"] for x in rows), 2), cpa=rnd(cost / conv) if conv else None)

    period_days = sorted({x["day"] for x in in_win(cd, win["since"])})
    acc_since = roll(in_win(cd, win["since"]))
    account = dict(since=acc_since, last7=roll(in_win(cd, win["last7"])), prev7=roll(in_win(cd, win["prev7"])), daily=[])
    for day in period_days:
        rows = [x for x in cd if x["day"] == day]
        account["daily"].append(dict(day=day, cost=rnd(sum(x["cost"] for x in rows)), conv=rnd(sum(x["conv"] for x in rows), 2),
                                     by_project={pid: rnd(sum(x["cost"] for x in rows if F(x["campaign"])["project"] == pid)) for pid in C.pids}))
    project_stats = {}
    for pid in C.pids:
        prow = [x for x in cd if F(x["campaign"])["project"] == pid]
        s = roll(in_win(prow, win["since"]))
        project_stats[pid] = dict(since=s, last7=roll(in_win(prow, win["last7"])), prev7=roll(in_win(prow, win["prev7"])),
                                  share_of_spend=rnd(100 * s["cost"] / acc_since["cost"], 1) if acc_since["cost"] else None,
                                  campaigns=[c["id"] for c in campaigns if c["project"] == pid],
                                  daily=[dict(day=d["day"], cost=d["by_project"][pid]) for d in account["daily"]])

    # ======================================================= 5. keywords (Quality Score report)
    kw_all = [x for x in kwrows if x["keyword_status"] != "Total"]
    ai = [x for x in kwrows if x["keyword_status"] == "Total"]
    keywords = None
    if kw_all:
        for x in kw_all:
            x["project"] = F(x["campaign"])["project"]
        paid = [x for x in kw_all if x["cost"] > 0]

        def group_cost(key):
            out = {}
            for x in paid:
                k = x[key] or "Not rated"
                out[k] = out.get(k, 0) + x["cost"]
            return {k: rnd(v) for k, v in sorted(out.items())}

        qs = {}
        for x in paid:
            q = int(x["quality_score"]) if x["quality_score"] is not None else 0
            g = qs.setdefault(q, dict(label="No score" if q == 0 else str(q), cost=0, n=0))
            g["cost"] += x["cost"]
            g["n"] += 1
        enabled = [x for x in kw_all if x["keyword_status"] == "Enabled"]
        kcols = ["keyword", "match_type", "project", "campaign", "ad_group", "status", "cost", "clicks", "impr", "conv", "quality_score",
                 "ad_relevance", "landing_page"]
        pick = lambda rows: [{k: x[k] for k in kcols} for x in rows]
        dup = {}
        for x in enabled:
            if x["impr"] > 0:
                g = dup.setdefault((x["project"], " ".join(tok(x["keyword"]))), dict(camps=set(), cost=0, impr=0))
                g["camps"].add(x["campaign"])
                g["cost"] += x["cost"]
                g["impr"] += x["impr"]
        duplicates = sorted([dict(project=p, keyword=k, campaigns=sorted(g["camps"]), cost=rnd(g["cost"]), impr=rnd(g["impr"]))
                             for (p, k), g in dup.items() if len(g["camps"]) > 1], key=lambda x: (-x["cost"], x["keyword"]))
        vp = re.compile(r"\bvillas?\b|\bpent ?houses?\b", re.I)
        mism = sorted([x for x in paid if x["project"] in no_vp and (vp.search(x["keyword"]) or vp.search(x["ad_group"]))],
                      key=lambda x: (-x["cost"], x["keyword"]))
        is13 = lambda x: x["quality_score"] is not None and 1 <= x["quality_score"] <= 3
        lp = group_cost("landing_page")
        keywords = dict(
            from_=kw_all[0]["period_start"], to=kw_all[0]["day"], total_cost=rnd(sum(x["cost"] for x in paid)),
            below_lp_cost=lp.get("Below average", 0), qs13_cost=rnd(sum(x["cost"] for x in paid if is13(x))),
            lp_cost=lp, rel_cost=group_cost("ad_relevance"),
            qs=[dict(label=qs[q]["label"], cost=rnd(qs[q]["cost"]), n=qs[q]["n"]) for q in sorted(qs)],
            status_counts={k: sum(1 for x in enabled if (x["status"] or "Unknown") == k) for k in sorted({x["status"] or "Unknown" for x in enabled})},
            by_project={pid: dict(cost=rnd(sum(x["cost"] for x in paid if x["project"] == pid)),
                                  below_lp_cost=rnd(sum(x["cost"] for x in paid if x["project"] == pid and x["landing_page"] == "Below average")),
                                  qs13_cost=rnd(sum(x["cost"] for x in paid if x["project"] == pid and is13(x))),
                                  keywords=sum(1 for x in kw_all if x["project"] == pid),
                                  enabled=sum(1 for x in enabled if x["project"] == pid),
                                  not_eligible=sum(1 for x in enabled if x["project"] == pid and x["status"] == "Not eligible"),
                                  limited=sum(1 for x in enabled if x["project"] == pid and x["status"] == "Limited"))
                        for pid in C.pids},
            no_conv=pick(sorted([x for x in paid if x["conv"] == 0], key=lambda x: (-x["cost"], x["keyword"]))[:25]),
            low_quality=pick(sorted([x for x in paid if is13(x)], key=lambda x: (-x["cost"], x["keyword"]))[:25]),
            duplicates=duplicates, product_mismatch=pick(mism), product_mismatch_cost=rnd(sum(x["cost"] for x in mism)),
            product_mismatch_conv=rnd(sum(x["conv"] for x in mism), 1),
            ai_max=[dict(type=x["keyword"], cost=x["cost"], clicks=x["clicks"], impr=x["impr"], conv=x["conv"]) for x in ai])
        keywords["from"] = keywords.pop("from_")

    # ======================================================= 6. the Ivory CTM case (any campaign whose name contains CTM)
    ctm = None
    ctm_names = sorted({x["campaign"] for x in cd if "CTM" in x["campaign"]})
    if ctm_names and complete:
        camp = ctm_names[0]
        ev_rows = [x for x in chs if x["campaign"] == camp]
        events = []
        for day in sorted({x["day"] for x in ev_rows}):
            g = [x for x in ev_rows if x["day"] == day]
            lines, setting = [], False
            na = sum(1 for x in g if x["kind"].startswith("negative") and "added" in x["kind"])
            nr = sum(1 for x in g if x["kind"].startswith("negative") and "removed" in x["kind"])
            if na:
                lines.append(f"{na} negative keyword(s) added")
            if nr:
                lines.append(f"{nr} negative keyword(s) removed")
            ka = [x for x in g if "match keyword added" in x["kind"] and not x["kind"].startswith("negative")]
            kr = [x for x in g if "keyword removed" in x["kind"] and not x["kind"].startswith("negative")]
            if ka or kr:
                types = "/".join(sorted({x["kind"].split()[0] for x in ka})) or "-"
                lines.append(f"{len(ka)} keyword(s) added as {types} match, {len(kr)} removed")
                setting = True
            for x in g:
                if "keyword" in x["kind"]:
                    continue
                text = f"{x['kind']}: {x['item']}".replace(f"{camp}: ", "")
                if any(k in text.lower() for k in ("budget", "target cpa", "search term matching", "negative keyword list", "bid")):
                    lines.append(text[:220])
                    setting = True
            if lines:
                events.append(dict(day=day, who=", ".join(sorted({x["user"].split("@")[0] for x in g})), lines=lines, setting=setting))
        series = next(c["series"] for c in campaigns if c["id"] == camp)
        cuts = [e["day"] for e in events if e["setting"]]
        if not cuts or cuts[0] > series[0]["day"]:
            cuts = [series[0]["day"]] + cuts
        periods = []
        for i, a in enumerate(cuts):
            b = add_days(cuts[i + 1], -1) if i + 1 < len(cuts) else complete
            g = [x for x in series if a <= x["day"] <= b]
            if not g:
                continue
            n = len(g)
            el = [x["eligible"] for x in g if x["eligible"] is not None]
            ev = next((e for e in events if e["day"] == a and e["setting"]), None)
            periods.append(dict(start=a, end=g[-1]["day"], days=n, change=[l for l in ev["lines"] if "negative" not in l] if ev else [],
                                impr_per_day=rnd(sum(x["impr"] for x in g) / n), clicks_per_day=rnd(sum(x["clicks"] for x in g) / n, 1),
                                cost_per_day=rnd(sum(x["cost"] for x in g) / n), conv=rnd(sum(x["conv"] for x in g), 1),
                                eligible_per_day=rnd(median(el)) if el else None))
        st_ctm = [x for x in st if x["ctype"] == "Google CTM"]
        ctm_projects = {x["project"] for x in st_ctm}
        roi = [x for x in st if x["runner"] == "ROI" and x["project"] in ctm_projects]
        ov = {}
        for a in st_ctm:
            for b in roi:
                if a["day"] == b["day"] and a["term"] == b["term"]:
                    g = ov.setdefault(b["campaign"], dict(campaign=b["campaign"], searches=0, ctm_cost=0.0, roi_cost=0.0))
                    g["searches"] += 1
                    g["ctm_cost"] += a["cost"]
                    g["roi_cost"] += b["cost"]
        cl = [c for c in campaigns if c["id"] == camp][0]
        ctm = dict(campaign=camp, project=cl["project"], budget_now=cl["budget_now"], target_cpa_now=cl["target_cpa_now"],
                   events=events, periods=periods,
                   duplicates=[d for d in (keywords or {}).get("duplicates", []) if camp in d["campaigns"]],
                   overlap=sorted([dict(g, ctm_cost=rnd(g["ctm_cost"], 2), roi_cost=rnd(g["roi_cost"], 2)) for g in ov.values()],
                                  key=lambda x: (-x["searches"], x["campaign"])))

    # ======================================================= 7. what to fix, and who fixes it
    fixes = []

    def fix(type_, owner, project, severity, money=None, money_kind=None, **params):
        fixes.append(dict(type=type_, owner=owner, project=project, severity=severity,
                          money=rnd(money, 2) if money is not None else None, money_kind=money_kind, params=params))

    camp_by_project = {pid: [c for c in campaigns if c["project"] == pid] for pid in C.pids}
    for pid in C.pids:
        o = [x for x in agency["overdue_excludes"] if x["project"] == pid]
        if o:
            fix("overdue_excludes", "Agency", pid, "high", sum(x["cost"] for x in o), "wasted", count=len(o),
                first_day=min(x["day"] for x in o), last_day=max(x["day"] for x in o))
        oa = [x for x in agency["overdue_adds"] if x["project"] == pid]
        if oa:
            fix("overdue_adds", "Agency", pid, "medium", None, None, count=len(oa), first_day=min(x["day"] for x in oa),
                last_day=max(x["day"] for x in oa))
        nn = [x for x in agency["no_negative_rows"] if x["project"] == pid and x["status"] in ("waiting", "overdue")]
        if nn:
            fix("no_negative_written", "Agency", pid, "medium", None, None, count=len(nn))
        bn = [x for x in brand_no_word if x["project"] == pid]
        if bn:
            c = sum(x["cost"] for x in bn)
            fix("brand_no_word", "Agency", pid, "high" if c >= 5000 else "medium", c, "wasted", count=len(bn), example=bn[0]["term"],
                example_cost=bn[0]["cost"], example_keyword=bn[0]["keyword"])
        bl = [x for x in brand_leak if x["project"] == pid]
        if bl:
            fix("brand_leak", "Agency", pid, "medium", sum(x["cost"] for x in bl), "misrouted", count=len(bl), example=bl[0]["term"])
        bk = sorted({(x["campaign"], x["ad_group"], x["keyword"]) for x in blocked if x["project"] == pid})
        if bk:
            ex = next(x for x in blocked if x["project"] == pid)
            fix("blocked_keywords", "Agency", pid, "medium", None, None, count=len(bk), example=ex["keyword"], example_negative=ex["blocked_by"])
        rk = [x for x in risky if x["project"] == pid]
        if rk:
            fix("risky_negatives", "Agency", pid, "medium", None, None, count=len(rk), examples=[x["item"] for x in rk[:3]])
        if keywords:
            mm = [x for x in keywords["product_mismatch"] if x["project"] == pid]
            if mm:
                fix("product_mismatch", "County", pid, "high", sum(x["cost"] for x in mm), "wasted", count=len(mm),
                    conv=rnd(sum(x["conv"] for x in mm), 1), ad_groups=sorted({x["ad_group"] for x in mm}))
            kp = keywords["by_project"][pid]
            if kp["cost"] and kp["below_lp_cost"] / kp["cost"] >= 0.3:
                share = 100 * kp["below_lp_cost"] / kp["cost"]
                fix("landing_pages", "County", pid, "high" if share >= 50 else "medium", kp["below_lp_cost"], "affected",
                    share=rnd(share), total=kp["cost"])
            dd = [d for d in keywords["duplicates"] if d["project"] == pid]
            if dd:
                fix("self_competition", "County", pid, "medium", sum(d["cost"] for d in dd), "affected", count=len(dd),
                    example=dd[0]["keyword"], example_campaigns=dd[0]["campaigns"])
        cs = camp_by_project[pid]
        gap = [c for c in cs if c["conv_gap"]]
        if gap:
            fix("conversion_gap", "County", pid, "medium", None, None,
                campaigns=[dict(id=c["id"], label=c["label"], conv=c["since"]["conv"], all_conv=c["since"]["all_conv"]) for c in gap])
        for c in cs:
            s = c["since"]
            if s and s["cost"] >= 10000 and s["conv"] == 0:
                fix("zero_conv", "County", pid, "medium", s["cost"], "affected", campaign=c["id"], label=c["label"], days=s["days"])
        nb = [c["since"] for c in cs if c["ctype"] == "Non-brand" and c["since"]]
        nb_cost, nb_conv = sum(s["cost"] for s in nb), sum(s["conv"] for s in nb)
        if nb_conv:
            nb_cpa = nb_cost / nb_conv
            for c in cs:
                s = c["since"]
                if c["ctype"] == "Brand" and s and s["cpa"] and s["cpa"] >= 3 * nb_cpa:
                    fix("brand_cpa", "County", pid, "medium", s["cost"], "affected", campaign=c["id"], label=c["label"], cpa=s["cpa"],
                        nonbrand_cpa=rnd(nb_cpa), cpc=s["cpc"], bid_strategy=c["bid_strategy"], conv=s["conv"])
        for c in cs:
            if c["verdict"] == "budget":
                fix("held_by_budget", "County", pid, "low", None, None, campaign=c["id"], label=c["label"],
                    lost_budget_pct=c["last7"]["lost_budget_pct"], cpa=c["last7"]["cpa"], budget=c["budget_now"])
        if ctm and ctm["project"] == pid and len(ctm["periods"]) >= 2:
            p0 = ctm["periods"][0]
            pn = next((p for p in reversed(ctm["periods"]) if p["days"] >= 3), ctm["periods"][-1])
            if p0["eligible_per_day"] and pn["eligible_per_day"] is not None and pn["eligible_per_day"] < 0.25 * p0["eligible_per_day"]:
                fix("ctm_pool", "Google CTM team", pid, "high", None, None, campaign=ctm["campaign"],
                    before=p0["eligible_per_day"], before_from=p0["start"], before_to=p0["end"],
                    now=pn["eligible_per_day"], now_from=pn["start"], now_to=pn["end"], spend_per_day=pn["cost_per_day"],
                    budget=ctm["budget_now"], drop_pct=rnd(100 * (1 - pn["eligible_per_day"] / p0["eligible_per_day"])))
    sev = {"high": 0, "medium": 1, "low": 2}
    fixes.sort(key=lambda f: (sev[f["severity"]], -(f["money"] or 0), C.pids.index(f["project"]) if f["project"] in C.pids else 99, f["type"]))

    # ======================================================= 8. competitors (auction insights)
    competitors = None
    if auction:
        # several exports can be loaded: show one period only, the one that ends latest (the longest of those if they tie)
        a_end = max(x["day"] for x in auction)
        a_start = min(x["period_start"] for x in auction if x["day"] == a_end)
        a_rows = [x for x in auction if x["day"] == a_end and x["period_start"] == a_start]
        competitors = dict(from_=a_start, to=a_end,
                           rows=sorted(a_rows, key=lambda x: (x["impression_share"] is None, -(x["impression_share"] or 0), x["domain"])))
        competitors["from"] = competitors.pop("from_")

    def span(rows, key="day"):
        ds = [x[key] for x in rows if x.get(key)]
        return dict(from_=min(ds), to=max(ds)) if ds else None

    def fix_span(d):
        if d:
            d["from"] = d.pop("from_")
        return d

    model = dict(
        version=MODEL_VERSION, as_of=as_of,
        data=dict(campaign_days=dict(fix_span(span(cd)) or {}, complete_through=complete) if cd else None,
                  search_terms=dict(days=st_days, raw_days=raw_days, **(fix_span(span(st)) or {})),
                  agency_sheet=fix_span(span(calls)), changes=fix_span(span(changes)),
                  keywords=dict(**{"from": keywords["from"], "to": keywords["to"]}) if keywords else None,
                  auction=dict(**{"from": competitors["from"], "to": competitors["to"]}) if competitors else None),
        projects=[dict(id=p["id"], name=p["name"], location=p.get("location", ""), product=p.get("product", ""),
                       starting_price_cr=p.get("starting_price_cr"), max_price_cr=p.get("max_price_cr")) for p in C.projects],
        windows={k: (dict(**{"from": v[0], "to": v[1]}) if v else None) for k, v in win.items()},
        account=account, project_stats=project_stats, campaigns=campaigns, latest_day=latest, agency=agency, keywords=keywords,
        risks=risks, ctm=ctm, competitors=competitors, fixes=fixes, coverage=coverage)
    return model, review


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", default=dt.date.today().isoformat())
    ap.add_argument("--only", default="", help="keep only these tables (comma list); use with --name")
    ap.add_argument("--name", default="model")
    a = ap.parse_args()
    T = json.loads((FIX / "tables.json").read_text(encoding="utf-8"))
    if a.only:
        keep = set(a.only.split(","))
        T = {k: (v if k in keep else []) for k, v in T.items()}
    cfg = json.loads((FIX / "config.json").read_text(encoding="utf-8"))
    model, review = build(T, cfg, a.as_of)
    (FIX / f"{a.name}.json").write_text(json.dumps(model, ensure_ascii=False, indent=1), encoding="utf-8")
    review_name = "review.json" if a.name == "model" else f"{a.name}_review.json"
    (FIX / review_name).write_text(json.dumps(review, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(dict(fixes=len(model["fixes"]), campaigns=len(model["campaigns"]), review=len(review)), indent=0))


if __name__ == "__main__":
    main()
