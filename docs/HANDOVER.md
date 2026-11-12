# Hand-over: how this project got here, and what comes next

Written 12 Nov 2026 so that the work can continue on any computer. The full chat is in `history/` (after unlocking the vault); this page is the short version.

## Timeline
- **4 to 5 Nov.** Audit of the agency's daily STR sheet with scratch scripts: 89 Exclude calls with no negative written; negatives that would block the agency's own Add terms; searches that leaked again after being negated. The Google Ads change history was reconciled against the sheet (829 of 1,114 Excludes done, 253 not; 300 of 425 Adds added). The earlier scripts and results are in `history/audits/`.
- **6 Nov.** Built a Streamlit dashboard, then a FastAPI + React one. The owner rejected both ("looks cheap", Ivory-only, not understandable) and preferred the handbook artifact (`docs/handbook.html`, also published as a private artifact). Rebuilt as Google Sheets + Apps Script (their suggestion): a Google Ads Script feed, an engine, a web app. A Python reference model (`strqc/model.py`) became the specification of every rule.
- **7 Nov.** The Apps Script web app was rejected too (it opened in some browsers and not others). Built the current Next.js dashboard on the same engine. Data was re-imported with corrected rules and checked day by day against the agency sheet.
- **12 Nov.** Imported 6 to 11 Nov (search terms, change history, auction insights) and refreshed the agency sheet to 11 Nov: all six new days match to the paisa. Moved the agency sheet link out of the code into `data/app/settings.json`, added a Host check (`dashboard/proxy.ts`), the encrypted vault, the start and save tools, and these notes.

## Decisions worth knowing
- Plain JSON files, not a database: one owner, one computer at a time, a few MB, trivially backed up and encrypted. (SQLite and Mongo were considered; Docker was never installed, so any Docker files were removed or are untested.)
- One engine, two implementations: the JS engine is what runs; `strqc/model.py` is the reference; `tests-js/parity.test.js` requires them to agree field by field (tolerance 0.011). Change a rule in both.
- Risky negatives are judged at campaign level only: a bare number, a very common word, or a common pair (minus area phrases). Ad-group negatives are not flagged by that rule (for example the 10 Nov `-flats` and `-flat` broad negatives added to Cocoa Gurugram "Apartments" show in the change history, not in the risky list).
- The agency gets 3 days of grace. "Applied in another place" means a matching negative went in, but in a different ad group of the same campaign.
- Findings are grouped by who fixes them: Agency (ROI), County, Google's CTM team.

## Key findings so far (7 Nov data unless stated; recheck on current data)
- Ivory CTM: the searches it was eligible for fell about 99% after generic keywords were switched to exact match (10 Oct) and search-term matching was turned off (16 Oct); it converts about 7.5% of clicks; its target CPA was set to Rs 511.80 with the budget 1,500 to 2,700 on 26 Oct, then Rs 800 on 5 Nov.
- Ivory ads run on villa and penthouse keywords, which Ivory does not sell: Rs 13,202 spent, 0 conversions.
- 57% of keyword spend goes to keywords with a below-average landing page experience (Ivory 86%).
- Clove brand campaign paid for searches that do not mention County or Clove. Cocoa brand costs far more per conversion than Cocoa non-brand.
- Agency follow-through (12 Nov view): 82% of checked Exclude calls applied; 240 never applied (Rs 26,020 spent on them); 172 of 632 Add calls never added.
- 10 Nov: the agency strategist added a "Lead Gen" label to every campaign and `-flats` / `-flat` broad negatives to one Cocoa ad group.

## Open items
1. Download a **Campaign report by day** (with impression-share columns) and the **Search keywords** report covering 6 Nov onwards; the Campaigns, Keywords and Overview "last 7 days" figures stop at 5 Nov until then.
2. Ask the agency to explain the 22 Oct and 28 Oct gaps (searches Google reports that the sheet does not contain).
3. Find out what Ivory Non-brand's "All conv." (6,741 against about 20 conversions) counts before quoting it.
4. The old one-campaign CTM search-term exports in Downloads (files 23 to 38) are refused on purpose: no Campaign column. Download the all-campaign report instead.
5. Google Ads Script feed (`ads-script/`, `docs/ADS_SCRIPT_SETUP.md`) is optional and unused; the Google Sheet version is shelved. Decide whether to delete the sheet and the Apps Script project.
6. PDFs: the owner once mentioned uploading reports as PDFs; only CSV and the agency .xlsx are read.
7. The agency sheet is shared by link (anyone with the link can read it). Suggest restricting it to named accounts; the dashboard then needs the owner to download the .xlsx and drop it on the Import page.
8. Known gaps: changes to shared negative lists and Google Ads Editor edits are not in the change history export, so follow-through for those cannot be confirmed.
9. Keep the guides (`docs/SOP.md`, handbook) in step with the dashboard's page names.

## Working on two computers
Save before you switch (double-click **Save data to GitHub**), start on the other with the start file (it pulls and unlocks). If both computers imported different data without saving, the start file keeps the local data and prints a note; combine them by importing the same files on one computer.
