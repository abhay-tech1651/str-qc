# Setting up the Google Ads feed script

The script `ads-script/County_Search_QC_Feed.js` runs inside Google Ads every morning. It reads the account and writes the latest data into the County Search QC spreadsheet, so nobody has to download and upload export files. It only reads the account. It never changes campaigns, keywords, budgets or anything else in Google Ads.

You need:

- edit access to the Google Ads account (the County Group account that runs Ivory, Clove, Cocoa and Jade), and
- edit access to the County Search QC spreadsheet. The script writes as the Google user who authorises it, so that user needs edit access too.

Setup takes about 10 minutes.

## 1. Copy the spreadsheet link

Open the County Search QC spreadsheet and copy the full address from the browser bar. It looks like this:

`https://docs.google.com/spreadsheets/d/1AbC...xyz/edit`

## 2. Create the script in Google Ads

1. Sign in to Google Ads and open the County Group account. If you are in a manager account, open the single account first.
2. Go to **Tools** (the wrench icon) › **Bulk actions** › **Scripts**.
3. Click the blue **+** button and choose **New script**.
4. Name the script **County Search QC feed**.
5. Delete the sample code in the editor (`function main() { ... }`).
6. Open `ads-script/County_Search_QC_Feed.js` in this repository, copy the whole file and paste it into the editor.

## 3. Paste the spreadsheet link

Near the top of the script there is a `CONFIG` block. Replace `PASTE_SPREADSHEET_URL_HERE` with the link from step 1. Keep the quotes:

```js
var CONFIG = {
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1AbC...xyz/edit',
  SEARCH_TERM_DAYS: 7,
  CHANGE_DAYS: 14,
  CAMPAIGN_DAYS: 30,
  KEYWORD_DAYS: 30,
  BACKFILL: true
};
```

Change `BACKFILL: false` to `BACKFILL: true` for the first run only (see step 6).

Leave the rest of the file as it is.

## 4. Authorise

Click **Authorise** above the editor, pick your Google account and allow access. Google asks for two permissions: to manage your Google Ads data (the script only reads it) and to edit your spreadsheets (the script only writes the five `feed_` tabs).

## 5. Preview

Click **Preview**. Preview runs the script without changing anything in Google Ads. This script never changes Google Ads anyway, but Preview does write to the spreadsheet. After a minute or two, open the **Logs** tab under the editor. A good run shows lines like these:

```
feed_search_terms: 2140 rows (2026-10-07 to 2026-11-05)
feed_changes: 913 rows (2026-10-08 to 2026-11-06)
feed_campaign_days: 248 rows (2026-10-07 to 2026-11-05)
feed_keywords: 1460 rows (2026-10-07 to 2026-11-05)
feed_meta: ok
```

Your numbers will be different. Things to watch for:

- `FAILED: ...` on a line: that one section could not be read. The other sections were still written. The error text is also saved in `feed_meta`. Send the error text to whoever maintains the script.
- `Set CONFIG.SPREADSHEET_URL ...`: the link in step 3 is missing or is not a Google Sheets link.
- `... _note: ...`: information only, for example when the script had to fall back to a simpler search-term query. Two notes need action:
  - `time_zone_note`: the Google Ads account is not set to Asia/Kolkata, so days and times in the feed are in another time zone than the dashboard expects. Tell whoever maintains the script.
  - `changes_note: ... next page was refused ...`: there were more than 10,000 changes in the window and Google refused the follow-up query, so the newest changes are missing from this run. Lower `CHANGE_DAYS` (for example to 7) and run again.

## 6. First run with BACKFILL, then switch it off

With `BACKFILL: true` the script fetches 30 days of search terms and 29 days of change history, which is as far back as Google keeps change history. This fills the history once.

1. With `BACKFILL: true`, click **Run** (or use the Preview from step 5) and wait until the log shows `feed_meta: ok`.
2. Open the dashboard and press **Refresh now**. The dashboard also refreshes on its own schedule. The refresh copies the feed tabs into the history tabs.
3. Back in the script editor, change `BACKFILL: true` to `BACKFILL: false` and click **Save**.

From then on each run fetches 7 days of search terms and 14 days of changes. The overlap is deliberate: if a run is missed, the next one fills the gap, and the dashboard merges the rows without making duplicates.

## 7. Schedule it daily at 07:00

1. Go back to **Tools › Bulk actions › Scripts**.
2. In the **Frequency** column for **County Search QC feed**, click the pencil icon.
3. Choose **Daily** and **7:00 AM**, then save.

The account's time zone is Asia/Kolkata, so this means 07:00 IST. Google starts the run some time during that hour, not always on the minute.

## What each tab contains

Every run clears and rewrites these tabs. Don't edit them by hand, because the next run overwrites them. The dashboard's refresh copies them into the `raw_` history tabs.

| Tab | Contents |
|---|---|
| `feed_search_terms` | One row per day, search term, match type, campaign, ad group and matched keyword, for Search campaigns, last 7 complete days (30 with BACKFILL), only terms that got at least one click. Includes clicks, impressions, cost (₹) and conversions. |
| `feed_changes` | Change history for the last 14 days (29 with BACKFILL): time, who made the change, campaign, ad group, what kind of change (for example `negative phrase match keyword added`) and the details (for example `-"golf links"`, or `Budget amount changed from ₹1,500.00 to ₹2,700.00`). |
| `feed_campaign_days` | One row per Search campaign per day for the last 30 complete days: status, bid strategy, current budget and target CPA, impressions, clicks, cost, conversions and impression-share figures. Impression shares that Google shows as "< 10%" or "> 90%" are left empty. |
| `feed_keywords` | Every enabled or paused keyword in Search campaigns, with totals for the last 30 complete days, status, quality score, ad relevance and landing page experience. Keywords with no impressions are included too. Keywords are written the way the keyword report writes them: `"phrase"`, `[exact]`, `broad`. |
| `feed_meta` | Facts about the last run: `last_run` time, whether it was a Preview (`preview`), account id and name, time zone, the date range and row count of each tab, any error per section, notes, and the script version. |

"Complete days" means the data stops at yesterday, because today's numbers are still coming in.

## How to tell it is working

- **Every morning**, `feed_meta › last_run` shows today's date, a little after 07:00.
- `feed_meta › status` says `ok`. If it says `1 section(s) failed`, look at the `..._error` rows.
- In Google Ads, **Tools › Bulk actions › Scripts** shows each run in the history with a status of **Completed**. Click **Logs** next to a run to see the row counts.
- In the dashboard, the newest search-term day is yesterday after the morning refresh.

## Things to know

- The script reads one account. If County Group adds another account, that account needs its own copy of the script, writing to its own spreadsheet.
- Google's change history includes a few things the API does not report, for example additions to shared negative keyword lists and changes made in Google Ads Editor. Those still need the manual change-history export.
- AI Max keyword totals (the "Total: AI Max" rows in the keyword export) are not part of the feed.
- If Google renames something in a future version and a section starts failing, the other sections keep working. The error text in `feed_meta` says what went wrong. A failed section leaves its tab with only the header row; the dashboard ignores an empty feed tab, so the history is not touched.
- A Google spreadsheet holds at most 10 million cells, history tabs included. Each feed tab is capped at 100,000 rows. Over the cap, search terms and campaign days keep the newest whole days, change history keeps the newest changes, and the keyword tab fails rather than being written incomplete; a `..._note` row in `feed_meta` says so. Lower the matching number of days in `CONFIG` if that happens.
- `CHANGE_DAYS` can be at most 29. Google keeps change history for 30 days, and a larger number is lowered to 29.
- Campaign status changes appear as `campaign paused` / `campaign active` like the export. Ad group, ad and asset changes show which settings changed (for example kind `Ad group changed` with item `status`), not the full wording of the export.
