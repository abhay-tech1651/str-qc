"""Load exported files into the local database.

Usage
  python -m strqc.load                       load every file in inbox/
  python -m strqc.load path/to/file.csv ...  load these files
  python -m strqc.load --fetch-sheet         also download the agency sheet (only works while it is link-shared)
Prints a JSON summary. Files stay where they are; nothing is uploaded.
"""
import argparse
import json
import urllib.request
from pathlib import Path

from . import db

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = ROOT / "data" / "app" / "settings.json"


def agency_sheet_id() -> str:
    """The agency sheet's ID, kept in data/app/settings.json (private: never in code or git)."""
    try:
        sid = str(json.loads(SETTINGS.read_text(encoding="utf-8")).get("agency_sheet_id", "")).strip()
    except (OSError, ValueError):
        sid = ""
    if not sid:
        raise RuntimeError("No agency sheet saved: paste its link on the dashboard's Import data page first.")
    return sid


def fetch_sheet() -> Path:
    out = ROOT / "inbox" / "agency_str_sheet.xlsx"
    url = f"https://docs.google.com/spreadsheets/d/{agency_sheet_id()}/export?format=xlsx"
    with urllib.request.urlopen(url, timeout=60) as r:
        data = r.read()
    if not data.startswith(b"PK"):
        raise RuntimeError("The sheet did not download as Excel. If sharing was restricted, download it by hand (File > Download > .xlsx) into inbox/.")
    out.write_bytes(data)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--fetch-sheet", action="store_true")
    a = ap.parse_args()
    paths = [Path(p) for p in a.files] or sorted(p for p in (ROOT / "inbox").iterdir() if p.suffix.lower() in (".csv", ".xlsx"))
    if a.fetch_sheet:
        paths.append(fetch_sheet())
    print(json.dumps([db.load_file(p) for p in paths], indent=1, default=str))


if __name__ == "__main__":
    main()
