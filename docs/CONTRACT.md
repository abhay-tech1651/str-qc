# Data contract: County Search QC (Google Sheets + Apps Script)

One spreadsheet holds the data. Apps Script computes the checks. A web app shows the briefing. Every part below agrees on these shapes.

```
Google Ads ──(Ads Script, daily 07:00 IST)──> feed_* tabs ─┐
Exports dropped on the dashboard's Upload page ─> raw_* tabs ┼─> refresh() ─> buildModel() ─> _model + _review tabs ─> web app
Agency STR Google Sheet (read directly by ID) ──────────────┘
```

## 1. Runtime rules for every file in `apps-script/`

- Apps Script V8: **no `import`/`export`, no `require`**. Every file shares one global scope. Top-level code may only *declare* (functions, `var`/`const` literals); never call another file's function at load time.
- File order: `00_Util.js`, `01_Config.js`, `10_Parse.js`, `20_Model.js` are **pure** (no Apps Script services). They run unchanged in Node (`tests-js/harness.js` loads them into one `vm` context). `30_Store.js`, `40_Main.js` use Apps Script services (SpreadsheetApp, PropertiesService, HtmlService, ScriptApp, Session) only inside functions.
- No `Intl`, no `Utilities.parseCsv`, no `Date.now()` inside pure files; dates are `'YYYY-MM-DD'` strings; the caller passes `asOf`.
- Rounding: always `rnd(x, nd)` (round half up). Sorting: explicit keys with deterministic tie-breakers, exactly as `strqc/model.py`.

## 2. Normalized tables (the input of `buildModel`)

Column order is the tab column order. `null` = empty cell. Percentages are 0–100; `null` when Google hides the value (`< 10%`, `> 90%`, or API 0.0999 / 0.9001).

| Table | Columns | Merge rule when new data arrives |
|---|---|---|
| `search_terms` | day, term, match_type, ads_status, campaign, ad_group, keyword, clicks, impr, cost, conv | the rows of each (day, campaign) in the new file replace that day's rows for that campaign; other campaigns are kept |
| `changes` | ts, day, user, campaign, ad_group, kind, item | union; a row is unique by (ts, campaign, ad_group, kind, item) |
| `campaign_days` | day, campaign, campaign_id, campaign_status, status, status_reasons, bid_strategy, budget_now, target_cpa_now, impr, clicks, cost, conv, all_conv, is_pct, lost_budget_pct, lost_rank_pct, top_is_pct, abs_top_is_pct | a (day, campaign) row is replaced |
| `keywords` | period_start, day, keyword_status, keyword, match_type, campaign, ad_group, status, status_reasons, cost, clicks, impr, conv, quality_score, ad_relevance, landing_page, is_pct, lost_rank_pct | the snapshot with the latest `day` (period end) replaces the previous one |
| `auction` | period_start, day, domain, impression_share, impression_share_raw, overlap_rate, position_above_rate, top_of_page_rate, abs_top_rate, outranking_share | rows of the same (period_start, day) are replaced |
| `agency_calls` | day, tab, term, match_type, ads_status, campaign, ad_group, keyword, clicks, impr, cost, conv, decision, neg_term, county_comment | rebuilt from the agency sheet on every refresh |

Value conventions (the agency sheet and the CSV exports already use these; the Ads Script must produce the same):

- `term`: lower-case, trimmed. `day`: `YYYY-MM-DD` (Asia/Kolkata). `ts`: `YYYY-MM-DDTHH:MM:SS`.
- `match_type` (search terms): `Exact match`, `Phrase match`, `Broad match`, `Exact match (close variant)`, `Phrase match (close variant)`, `AI Max`.
- `ads_status`: `Added`, `Excluded`, `Added/Excluded`, `None`.
- `keyword` (search terms): exact → `[text]`; phrase and broad → `text` (no quotes). Unknown → `-`.
- `changes.kind` / `changes.item` follow Google's change-history CSV: e.g. kind `negative phrase match keyword added`, item `-"golf links"`; kind `negative exact match keyword added`, item `-[a b]`; kind `negative broad match keyword added`, item `-word`; kind `phrase match keyword added`, item `"a b"`; kind `exact match keyword added`, item `[a b]`; kind `broad match keyword added`, item `a b`; removals use `... removed`; settings use kind `Campaign changed` / `Ad group changed` / `budget amount increased|decreased` with a readable item such as `Target CPA increased from ₹511.80 to ₹800.00`, `Budget amount changed from ₹1,500.00 to ₹2,700.00`, `Disable search term matching changed from False to True`.
- `bid_strategy`: `Maximise Conversions`, `Maximise clicks`, `Target CPA`, `Target Impression Share`, `Target ROAS`, `Maximise conversion value`, `Manual CPC`.
- `keywords.match_type`: `Exact`, `Phrase`, `Broad`. `keyword_status`: `Enabled` / `Paused`. `status`: `Eligible`, `Limited`, `Not eligible`, `Paused`. `ad_relevance` / `landing_page`: `Above average`, `Average`, `Below average`, or `` (not rated). AI Max totals, when present, are rows with `keyword_status` = `Total` and the total's name in `keyword`.

## 3. Spreadsheet tabs

| Tab | Written by | Content |
|---|---|---|
| `Read me` | setup | what this is, links, last refresh |
| `Settings` | setup, then Abhay | key / value: `agency_sheet_id`, `viewers` (comma-separated emails allowed to open the dashboard), `owner` |
| `Projects` | setup, then Abhay | id, name, match, location, product, starting_price_cr, max_price_cr, villas_or_penthouses |
| `feed_search_terms`, `feed_changes`, `feed_campaign_days`, `feed_keywords`, `feed_meta` | Google Ads Script (overwritten each run) | normalized columns, header row first |
| `raw_search_terms`, `raw_changes`, `raw_campaign_days`, `raw_keywords`, `raw_auction` | refresh / upload (merged history) | normalized columns |
| `agency_calls` | refresh | normalized columns |
| `_model` | refresh | the model JSON split into 45,000-character chunks down column A |
| `_review` | refresh | the review rows JSON split the same way |

Writing rule (security): every string written to a cell is written as **text**, never parsed: strings that start with `= + - @` or look like a number or date are prefixed with `'`. Search terms and agency comments are typed by strangers; a search for `=IMPORTXML(...)` must never become a formula.

## 4. `buildModel(T, cfg, asOf) -> {model, review}`

`strqc/model.py` is the specification: the JavaScript in `apps-script/20_Model.js` mirrors it function by function, and `tests-js/parity.test.js` requires the two outputs to match field by field (numbers within 0.011). `cfg` has the shape of `data/fixtures/config.json` (`projects` as a list in display order: ivory, clove, cocoa, jade).

## 5. Server functions the web app calls (`40_Main.js`)

| Function | Returns |
|---|---|
| `getModel()` | the model JSON string (from `_model`) |
| `getReview()` | the review rows JSON string (from `_review`) |
| `whoAmI()` | `{email, canUpload}` |
| `uploadExports(files)` | `files = [{name, text}]` (text already decoded by the browser). Detects each file's kind, merges it, refreshes, returns `[{name, kind, rows, first_day, last_day, note}]` |
| `refreshNow()` | re-reads the agency sheet and feeds, rebuilds the model, returns `{ok, at}` |

`doGet()` serves `Dashboard.html` only to the owner and the emails in `Settings › viewers` (deployed "execute as the user accessing", so a viewer also needs view access to the spreadsheet). Everyone else gets a plain "no access" page.
