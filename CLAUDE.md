# County Search QC: notes for Claude (read first)

This repository holds the daily quality check of County Group's Google Ads **search** campaigns that the agency **ROI** runs (projects Ivory, Clove, Cocoa, Jade). It was built in one long conversation (4 to 14 Nov 2026) with the owner, a 23-year-old SEO/content-systems lead at County Group who is building SOPs for the first time. The conversation cannot be reopened on another machine, so everything it decided is written here and in `docs/HANDOVER.md`. After the data is unlocked (see "First thing on a new machine"), `history/` holds the full chat history in plain text.

## Goal
Show, every day, in a form a layman and a senior manager can follow: what the agency decided in its STR sheet, what was really changed in Google Ads (change history), what was not done, and the money wasted. Every statement must be a fact from the data. **Never write conjecture** ("likely because...", "fatigue", "brokers bidding"). Present agency issues as structure and facts, never as blame (the agency cannot be attacked directly; internal politics).

## First thing on a new machine
1. `git pull`, then double-click **Start Search QC.cmd** (Windows) or **start-search-qc.command** (Mac). It pulls, asks the data passphrase once (the owner types it; never ask for it in chat, never write it anywhere), unlocks `vault/*.qcvault` into `data/`, `inbox/` and `history/`, installs, builds and opens http://127.0.0.1:3000.
2. Read `docs/HANDOVER.md`, then `history/` (unlocked): `mined-notes.md` (facts, rules, decisions, open items extracted from the chat), `transcript/` (condensed chat), `memory/` (the owner's memory files from the original machine), `audits/` (earlier scripts and results).
3. Copy the useful parts of `history/memory/` into your own memory if the owner asks.

## Rules that must never be broken
- **Data security comes first.** The repository is private; real data never goes into git as plain files (`data/`, `inbox/`, `history/`, `backups/` are git-ignored). It travels only inside `vault/*.qcvault` (AES-256-GCM, scrypt key from the owner's passphrase, `scripts/vault.mjs`). The agency sheet link is private (a sheet shared by link can be read by anyone with the ID): it lives in `data/app/settings.json`, never in code, tests or docs. Never commit with `git add -A`; add explicit paths. Before any commit run `git grep --cached -nE '14blmb[9]93|AKf[y]|@gmai[l].com'` and expect nothing.
- The dashboard binds to 127.0.0.1 only, refuses foreign Hosts (`dashboard/proxy.ts`), and every write needs a same-origin `x-qc: 1` request (`dashboard/lib/guard.ts`). Next.js telemetry is switched off in `scripts/start.mjs`.
- Do not add outside services. The only outside requests: GitHub (updates, saving the locked data) and Google (downloading the agency sheet on Refresh).

## How the owner likes to work (from their own words)
- Plain, short sentences; no long multi-step instructions (they get confused). Teach concepts from zero with County examples.
- They rejected, in order: the Streamlit dashboard, the React/Recharts "cheap" dashboard, and the Google Sheets + Apps Script web app (opens in some browsers and not others). They asked for a modern React/Next.js + Node dashboard that opens reliably. Manual daily steps are fine; **the numbers must be perfect**.
- They liked the "County Search Ads Handbook" artifact: editorial, plain-language, a lede with numbers in sentences, one card per project with the same structure, problems grouped by who fixes them (Agency / County / Google CTM team), few charts each with a "how to read it" caption. All four projects get equal depth, not only Ivory.
- Verify before claiming; say what was and was not checked. They hit usage limits: avoid needless verification rounds unless asked.

## Project facts (confirmed by the owner, 6 to 7 Nov 2026)
- **Ivory County**, Sector 115 Noida: 3 and 4 BHK from Rs 3.8 Cr ("prices keep increasing"); 5 BHK is **Ivory Gold**; **no villas or penthouses**.
- **Jade County**, Wave City, NH-24 Ghaziabad: from Rs 2.71 Cr; 3 and 4 BHK; 5 BHK is **Jade Gold**.
- **Cocoa County**, Sector 88A Gurugram (Dwarka Expressway): Rs 4.14 Cr to 8 Cr; 3 and 4 BHK; **Cocoa Gold**.
- **Clove County**, Sector 151 Noida: from Rs 8 Cr ("that's all you need to know").
- Ivory also runs a **CTM** campaign managed by Google's team (separate from the agency's Ivory Brand campaign). Findings about it go to Google's team through the owner; the agency only watches it.

## What is here
- `dashboard/` Next.js 16 + React 19 + Tailwind 4 + Recharts app (pages: Overview, Issues, one page per project, Said vs done, Search terms, Campaigns, Keywords, Competitors, Import data, Help, Handbook). Data = JSON files in `data/app/`.
- `apps-script/00_Util.js, 01_Config.js, 10_Parse.js, 20_Model.js, 30_Store.js` the calculation engine in plain JS; `dashboard/lib/engine.ts` loads them unchanged through Node `vm`. `40_Main.js`, `Dashboard.html`, `ui/`, `dev/`, `ads-script/` belong to the shelved Google Sheets version.
- `strqc/model.py` the Python reference that specifies every rule; `tests-js/` (run `npm test` in the repo root; 103 checks; parity and fixture tests skip when the unlocked data is missing).
- `scripts/vault.mjs`, `save.mjs`, `start.mjs` the lock/unlock, save-to-GitHub and start tools. `docs/CONTRACT.md` the table contract. `docs/SOP.md`, `GOOGLE_ADS_BASICS.md`, `METRICS.md`, `handbook.html` the written guides (roles, not names).

## Data and import rules (all implemented; see `dashboard/lib/store.ts`)
- Daily: Search terms report (one day, **all campaigns**, CSV) and Change history; weekly: Campaign report by day + Search keywords report; monthly: Auction insights. Import page: "Import new reports from Downloads" and "Refresh the agency sheet".
- Search terms merge per (day, campaign). Files without a Campaign column (downloaded from inside one campaign), multi-day files and zero-click rows are refused or dropped, so nothing is double counted. Campaign rows for the export day are dropped (partial day). Older keyword/auction exports never replace newer ones.
- A multi-day search-terms file is accepted only with a Day column (Segment › Time › Day); Google's per-day "Total" lines are skipped. A campaign report without a Day column is refused with instructions. "Import new reports from Downloads" reads files changed in the last 21 days; older files go through the file picker (multipart POST to `/api/import`).
- Campaign reports: only rows whose Campaign type is Search are kept (Performance Max, Display, Video and Demand Gen rows are left out, with a note); a report without impression-share columns keeps the shares an earlier report brought for the same day and campaign. Search-term rows for the day the report was downloaded are left out (that day was not finished).
- Change history covers up to min(end of its period line, day before export) (`covers_to` in `data/app/files.json`, `changes_through` in the config); the model uses it as the last checked day.
- Period filter: cookie `qc_period` (all, last7, last14, last30, month, lastmonth, custom:FROM:TO) is resolved by `resolvePeriod()` in `dashboard/lib/store.ts`; pages read `periodModel()` from `dashboard/lib/period.ts`. The period replaces the "last 7 days" window; the comparison window is the same number of days just before. Python: `strqc/model.py --period FROM:TO`.
- Every issue panel lists the rows behind it (`dashboard/components/issue-evidence.tsx`); a Said vs done row opens the evidence panel (`dashboard/components/call-evidence.tsx`, `/api/evidence`).
- Grace 3 days before an agency call counts as late; "unchecked" when the change history does not reach the day before. Verdicts: underspending <30% of budget used; budget: lost to budget >= 20%; rank: lost to rank >= 40%; brand gap: brand IS < 80%.
- Last proven state (14 Nov 2026): every day's search-term spend 15 Oct to 12 Nov equals the agency sheet to the paisa, except 22 Oct (+Rs 1,212.97) and 28 Oct (+Rs 78.50), where Google's report has searches the sheet missed; 17 Oct had no spend. Google's daily "Total: Search" equals the campaign report cost (within 2 paisa). Loaded: campaigns to 12 Nov, search terms to 13 Nov, change history covering to 12 Nov, keywords 1 to 13 Nov, auction 6 to 11 Nov. 103 tests pass; engine and Python reference agree.

## Open items
See "Open items" in `docs/HANDOVER.md`.
