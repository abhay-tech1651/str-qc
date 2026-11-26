# Morning guide: get the new dashboard on the office laptop, check it, and keep building (26 Nov 2026)

Do these in order. Each step is short. You do not need to open the home chat again: everything that chat decided is written in `CLAUDE.md` (section "One engine for every agency number") and in the locked notes (`data/notes/2026-11-25-dashboard-rebuild.md`), which the office Claude reads.

The new version is on GitHub (`main`, 26 Nov), so the Start file brings it in by itself. The ZIP is only a spare way, in case the Start file cannot update.

## Part A. Get the new version on the office laptop (2 minutes, once)

1. Close the dashboard if it is open (close its black window).
2. In your `str-qc` folder, double-click **Start Search QC.cmd**.
3. The black window says **"Got the latest code and data from GitHub."** Then it asks for the passphrase (the locked data and notes changed too). Type it.
4. Go on with Part B, step 3.

If the window says **"Not updated: this computer has its own unsaved changes"**, or **"Keeping this computer's data"**, stop and ask Claude on the office laptop: "Bring this folder up to date with GitHub main without losing anything on this computer, then open the locked notes." Or use the spare way below.

**Spare way (only if the Start file cannot update):** `str-qc-office-26nov.zip` is the whole project folder, ready to start.
1. In `C:\Users\HP\Documents` (or wherever your `str-qc` folder is), rename `str-qc` to `str-qc-old`. Delete it only when the new one works.
2. Put the ZIP there. Right-click › **Extract All** › change the path to exactly that folder › **Extract**. You get a new `str-qc` folder.
3. In it, double-click **Start Search QC.cmd** and type the passphrase. The ZIP misses only this morning's small hand-over note on GitHub; double-clicking **Save data to GitHub.cmd** afterwards brings both together (if it says it could not push, ask Claude there: "merge origin/main into main and push").

## Part B. Open the dashboard (2 minutes)

1. Double-click **Start Search QC.cmd** in your `str-qc` folder (if Part A did not already).
2. Type the data passphrase when it asks. It unlocks the data and the new notes.
3. After an update the app is installed and built again: about 3 to 5 minutes (it needs the internet). The browser opens http://127.0.0.1:3000.
4. At the end of the day, as always: double-click **Save data to GitHub.cmd** and type the passphrase.

## Part C. What you will see (the menu, top to bottom)

| Page | What it tells you |
|---|---|
| **Overview** | One answer: did the agency do what the sheet said? Excludes on time, late, not done; money spent after deadlines; Adds not done; negatives that hurt us; what to raise; week by week. |
| **Agency report** | Every mistake with proof: when it went in, who, where (campaign, ad group, shared list), how (full search or one word), days late, rupees after the deadline. Printer icon at the top makes a PDF for meetings. |
| **Day by day** | Left: each sheet tab and what happened to its calls. Right: each day in Google Ads, who changed what. A weekday in red with **No change** is a question for the agency. |
| **Fix list** | What is still open, and exactly where to fix it. Tick **Only past the deadline**, press **CSV**, send it to the agency. |
| **Negatives** | What the sheet wrote against how each search is blocked; negatives that block searches we want (with match type and level); one-word negatives added in the last 30 days. |
| **Every search** | Search any term. Click it for its full story. |

**Click any row** on any of these pages: a panel opens with the search's story in order: first seen, the sheet's call, the deadline, when the negative went in (time and person), money after the deadline, and what Google Ads does today.

## Part D. The rules the dashboard now follows (your decisions)

- **Deadline:** sheet day + 3 days. If that lands on Saturday or Sunday, it moves to Monday (marked "weekend").
- **Not due yet is never a mistake.** Even a negative in the wrong ad group only counts after the deadline.
- **Brand words in non-brand campaigns** (county, ivory, clove, cocoa, jade): blocking them there is correct (SOP rule 1).
- **Other County project names** negated on purpose: never flagged.
- **Jade villa** and **Ivory villa, penthouse, Greater Noida, Noida Extension, Pari Chowk** searches are low intent, so negatives blocking them are fine. Edit the words in `config/intent.json` (list `not_for_us`), not in the code.
- **The Cocoa CTM campaign** (made by ROI on 23 Nov) counts as ROI's. Only the Ivory CTM campaign is Google's and is shown apart.
- **County comments** saying "add" or "why exclude": the agency must answer County; it is not counted as late.

## Part E. Every morning after that (15 minutes)

1. In Google Ads, download: **Search terms** (yesterday, all campaigns), **Change history** (last 7 days), **Negative keyword report** (whole account). Once a week also the **Search keywords** report and the **Campaign report by day**.
2. Dashboard › **Data** › **Import new reports from Downloads**, then **Refresh the agency sheet**.
3. Read in this order: **Day by day** (did yesterday's tabs go in?) › **Overview** (What to raise) › **Fix list** (CSV to the agency) › **Negatives** (new one-word negatives).
4. Before a meeting: **Agency report**, printer icon, save as PDF.
5. When done: double-click **Save data to GitHub.cmd** and type the passphrase.

## Part F. Numbers to expect when it opens (sheet tabs 15 Oct to 24 Nov)

- Excludes: 1,319 of 1,949 on time (68%), 558 late, 52 not done, 20 in the wrong ad group.
- Rs 7,243 spent on searches after their deadline.
- Adds: 341 became keywords, about 200 past the deadline did not.
- 5 negatives block searches we want, all in Ivory Non-brand at campaign level: -house (broad), -properties, -"new launch" (phrase), -"best society" (phrase), -"76 noida" (phrase).

If your numbers differ, new reports were imported after 25 Nov: that is fine.

## Part G. Check that everything works (10 minutes)

Tick each line. If one fails, tell the office Claude which line failed.

1. In the `str-qc` folder, Command Prompt: `npm test`. Expect **117 pass, 0 fail**.
2. The menu shows: Overview, Agency report, Day by day, Fix list, Negatives, Every search, the 4 projects, Performance, Data.
3. **Overview** shows the numbers in Part F (if no new data was imported).
4. **Fix list**: the card "Junk searches still not blocked" says **72 late**. The Overview says 52 not done + 20 wrong ad group = **72**. They must match.
5. **Fix list**: "Adds not done" **163 late** = Overview 155 not added + 8 only in another campaign.
6. Click any row on **Agency report**: a panel opens with "What happened, in order".
7. **Day by day**: the right column shows Thu 12 Nov, Wed 11 Nov and Mon 9 Nov as **No change** in red.
8. **Negatives** › "Negatives that block searches we want": the first row is **house**, "broad match · campaign level", Ivory Non-brand, added 16 Nov by aman.k.
9. Old addresses still work: http://127.0.0.1:3000/meeting opens the Agency report.

## Part H. Keep building with Claude on the office laptop

Claude on the office laptop starts with no memory of the home chat. In Claude on the office laptop, open the project folder `C:\Users\HP\Documents\str-qc`. Paste this as your first message there, after Part B:

> Read `CLAUDE.md` first, especially "One engine for every agency number (rebuild of 25 Nov 2026)", then `docs/HANDOVER.md` and `docs/MORNING_GUIDE.md`. After I unlock the data, read `data/notes/2026-11-25-dashboard-rebuild.md` and `data/notes/log/2026-11-25-evening.md`. The agency numbers all come from `dashboard/lib/audit.ts` and `dashboard/lib/followup-core.ts`; keep every page on that one engine, change a rule in one place, add a test in `tests-js/followup.test.js` or `tests-js/ledger.test.js`, and run `npm test` before every commit. My rules from 25 Nov: deadline = sheet day + 3 days, a weekend deadline moves to Monday; the Cocoa CTM campaign is ROI's; Jade villa and Ivory Greater Noida searches are low intent (`config/intent.json`, `not_for_us`); judge searches by the signals in the query (our project, our sector, configuration, price), not by one conversion. Next I want: [write what you want next].

Good next steps, when you are ready:
- Load the contents of the shared negative lists (Google Ads Editor export), so "not blocked" is never a guess.
- A weekly one-page agency scorecard (on time %, money after deadlines, one-word negatives), week against week.
- Then Quality Score: expected CTR, ad relevance and landing page experience per keyword (SOP section 12).

## Part I. Later (not urgent)

- Let Claude push from any computer: install the Claude GitHub app on the office GitHub account (https://claude.ai/connect-github, signed in as the office account, give it the `str-qc` repository).
- The passphrase was typed in a chat. If you want, ask Claude on the office laptop to change it (`node scripts/vault.mjs save all --new-passphrase`), then use the new one on every computer.
