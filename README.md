# County Search QC

A dashboard for County Group's Google Ads search campaigns: what the agency decided in its STR sheet, whether it reached the account, where money leaks, and how each project (Ivory, Clove, Cocoa, Jade) is doing. It runs on your own computer and opens at http://127.0.0.1:3000.

## Open it

- **Windows:** double-click **Start Search QC.cmd** in this folder. The dashboard opens in your browser; close the black window to stop it.
- **Mac:** double-click **start-search-qc.command**.

The start file does everything else by itself: it gets the latest version from GitHub, unlocks the data the first time (it asks for your passphrase), installs and builds the app when needed, and opens the browser. The first start on a computer takes about 3 minutes; later starts take a few seconds. You need Node.js 22 or newer (the LTS version from https://nodejs.org).

## Every morning (2 minutes)

1. In Google Ads, download yesterday's **Search terms** report and the last 7 days of **Change history** (Download › CSV).
2. In the dashboard, open **Import data** and press **Import new reports from Downloads**. Press **Refresh the agency sheet** to read the agency's STR sheet from Google.
3. If you also use the dashboard on another computer, double-click **Save data to GitHub** (Mac: **save-data-to-github.command**) when you are done.

Once a week, also download the **Campaign report by day** (with impression-share columns) and the **Search keywords** report (with Quality Score columns). The Import data page lists the exact columns.

## Use it on another computer

1. Install Node.js (LTS) and GitHub Desktop, sign in to GitHub, and clone the private repository **str-qc**. Or ask Claude Code: "clone abhay-tech1651/str-qc".
2. Double-click the start file and type the data passphrase once. You get the same dashboard with all the data.
3. Open the folder in Claude Code to carry on the work: it reads `CLAUDE.md`, which holds everything decided so far. The full chat history is in `history/`, unlocked with the data.

Work on one computer at a time and save before you switch. If both computers import data without saving in between, the start file keeps the local data and tells you; Claude can combine the two.

## What it shows

| Page | Question it answers |
|---|---|
| Overview | Last 7 days in one sentence, the most urgent issues, every project on one card, daily spend, the agency report card |
| Issues to fix | Every open problem, who fixes it (Agency / County / Google CTM team), with a ready-to-send message for the agency |
| Ivory · Clove · Cocoa · Jade | One page per project, all built the same way: issues, campaigns, search terms, keywords, agency follow-through (Ivory also has the CTM case) |
| Said vs done | Every Add and Exclude in the agency sheet, checked against the Google Ads change history |
| Search terms | Every search with a click, day by day, with the agency's call and an automatic flag |
| Campaigns · Keywords · Competitors | Can each campaign show its ads, Quality Score and landing pages, who we meet in the auction |
| Import data · How to read this | Getting data in; the words and rules used; the handbook |

## How the numbers are made (and checked)

- `apps-script/00_Util.js`, `01_Config.js`, `10_Parse.js`, `20_Model.js`, `30_Store.js`: the calculation engine (plain JavaScript). The dashboard loads these files unchanged.
- `strqc/model.py`: the Python reference that specifies every rule. `npm test` (in this folder) runs 102 checks, including field-by-field parity between the engine and the reference (those need the unlocked data and skip without it).
- On 7 Nov 2026 the dashboard's numbers on the live data equalled the reference with 0 differences, and every day's search-term spend equalled the agency sheet except 22 Oct (+₹1,212.97) and 28 Oct (+₹78.50), where Google's report has searches the sheet missed.

## Folders

| Folder | What |
|---|---|
| `dashboard/` | The Next.js app (React pages, Node server routes, design system) |
| `apps-script/` | The shared engine (00–30 files), plus the shelved Google Sheets version (40_Main.js, Dashboard.html) |
| `scripts/` | The start, save and vault tools used by the double-click files |
| `vault/` | Your data, locked: `data.qcvault` (the dashboard's tables) and `archive.qcvault` (test data, raw exports, chat history) |
| `ads-script/` | Optional Google Ads Script that can push data into a Google Sheet daily |
| `strqc/` | The Python reference model and fixture tools |
| `tests-js/` | The checks (`npm test`) |
| `docs/` | SOP, Google Ads basics, the handbook, the data contract, the hand-over notes |
| `data/`, `inbox/`, `history/` | Your data, unlocked. Never in git as plain files |

## Data safety

- The repository on GitHub is private, and the data in it is only the two locked files in `vault/`. They are encrypted with AES-256-GCM using a key made from your passphrase (scrypt), so GitHub, or anyone who ever gets into the repository, sees only scrambled bytes. The passphrase is never stored anywhere: keep it in your password manager, because nobody can reset it.
- The agency sheet's link is kept with the data (`data/app/settings.json`), not in the code: a sheet shared by link can be read by anyone who has the link.
- The dashboard listens on 127.0.0.1 only: other computers on the network cannot open it.
- Every change request must come from the dashboard's own pages (same origin plus a custom header), so a website you visit cannot push data into it.
- Imports accept only Google Ads CSV exports and the agency workbook (by content, up to 15 MB). Pages render every value as text; CSV downloads neutralise spreadsheet formulas.
- The only outside requests are GitHub (getting updates, saving the locked data) and Google (downloading the agency STR sheet when you press Refresh). Next.js usage statistics are switched off.
