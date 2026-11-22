# SOP: Daily search-terms review (STR) for County Group Google Ads

Version 0.2 draft, 6 Nov 2026. Owner: County QC lead. Approver: County approver (proposed).

## 0. What an SOP is, and why we need one

An **SOP (Standard Operating Procedure)** is a written recipe for a job that repeats. It says **who** does **what**, **when**, **with which inputs**, **by which rules**, and **how we check it was done**. It exists so that:

- the job is done the same way every day, whoever does it (the agency's fresher, a new hire, you on leave);
- mistakes are caught by a check, not by luck;
- when your manager asks "why did we exclude this?" the answer is written down, with a date and a person;
- the agency's work can be measured against an agreed standard, instead of opinions.

A good SOP is short, has numbered steps, uses fixed rules instead of "use judgement" wherever possible, and is changed only through a version note at the bottom.

## 1. Purpose

Stop paying for clicks from people who will not buy a County home, without cutting the people who would. Every rupee here is real: in 15 Oct to 5 Nov the search terms in the agency sheet cost about Rs 5.66 lakh.

## 2. Scope

All Google Ads **search** campaigns run by ROI for Ivory, Clove, Cocoa and Jade (brand, non-brand, competitor). Google's Ivory CTM campaign is **watched but not edited** by the agency: findings go to Google's team through the County QC lead. Performance Max and Display negatives are out of scope for now (listed as a gap).

## 3. Who does what

| Role | Person | Does |
|---|---|---|
| Reviewer | Agency reviewer (ROI) | downloads the report, fills the sheet, applies the changes |
| Strategy owner | Agency strategist (ROI) | owns the rules for Add / Leave / Exclude; answers questions |
| QC | County QC lead | checks the sheet and the account every day with the dashboard; comments in the sheet |
| Approver | County approver | approves rule changes in this SOP |

## 4. Inputs (all exported, nothing typed by hand)

1. **Search terms report** for yesterday, Clicks > 0, as CSV.
2. **Change history** for the last 7 days, as CSV.
3. **The agency STR sheet** (one tab per day; the tab holds that day's data).

## 5. Daily steps and times

| Time | Step | Who |
|---|---|---|
| by 11:00 | Download yesterday's search terms report; paste into a new tab named with yesterday's date | ROI |
| by 13:00 | Make a call on every row (section 6) and write the negative, its match type and its level (section 7) | ROI |
| by 15:00 | QC: load the three files into the dashboard; read *Command centre*; comment in the sheet's County Comments column | QC lead |
| by 18:00 | Apply all agreed calls in Google Ads | ROI |
| next morning | Dashboard *Agency follow-through* confirms they reached the account | QC lead |

**Service level (proposed):** every Exclude and Add is in the account within **1 working day** of the sheet day. The data so far: typical delay 2 days; 91 Exclude calls from 20 to 29 Oct never applied (change history 1 Oct to 6 Nov).

## 6. Decision rules for one search term

Ask the questions in order; stop at the first answer.

1. **Which campaign type is it in?**
   - *Brand campaign and no brand word* (county, clove, cocoa, ivory, jade) → **Exclude** the non-brand part (for example the competitor's project name). Example: *ats pious hideaways sector 150 noida* in the Clove brand campaign.
   - *Non-brand or competitor campaign and it has our brand word* → **Exclude** from this campaign and make sure the brand campaign has the keyword. Brand searches belong to the brand campaign.
2. **Is it someone who lives there, not someone buying?** Address searches (house or flat number, block, pin code, "near me", tower number) → **Exclude**.
3. **Is it renting or staying, not buying?** Rent, PG, 1 RK, studio, serviced apartment, furnished, sharing, Airbnb, stays → **Exclude**.
4. **Is the budget clearly below ours?** Lakhs, "under 1 crore", affordable, cheap, 1 or 2 BHK → **Exclude**. Starting prices: Jade Rs 2.71 Cr, Ivory Rs 3.8 Cr, Cocoa Rs 4.14 Cr (to Rs 8 Cr), Clove Rs 8 Cr.
5. **Is it another builder's project?**
   - In a *non-brand* campaign → **Exclude** the project name.
   - In a *competitor* campaign → keep only if that project's starting price is within ours ± Rs 50 lakh **and** its location is one we accept; otherwise **Exclude**.
6. **Is it the wrong area?** A different city or a far area for that project (for example Ghaziabad in a Gurgaon campaign) → **Exclude** the area name.
7. **Is it a real buyer search with a clear signal that fits the product?** Configuration the project has (Ivory 3/4/5 BHK, Jade 3/4/5 BHK, Cocoa 3/4 BHK), luxury, our sector or corridor, ready to move or new launch → **Add** as a keyword (phrase match) in the right ad group. **Villa and penthouse searches are never an Add for Ivory**: it sells neither.
8. **Is it relevant but general, with no signal?** *flats in noida*, *noida flat price*, Hinglish without budget or configuration → **Leave** (no Add, no Exclude). This is the agency strategist's rule: adding these as keywords would pull in broad cheap traffic; excluding them would cut volume.

Write **Leave** in the Status column instead of leaving it blank. A blank cell cannot tell "decided to leave" apart from "not reviewed".

## 7. How to write the negative (the part that goes wrong most)

**County's rule (owner, 22 Nov 2026): negate the search term itself, never a single word.** When a row is Exclude (and when County writes a comment on it), the negative column must hold the **full search term**, written as a phrase (`"pm awas gramin report"`) or exact (`[pm awas gramin report]`). A part of two or more of its words is fine when that part can only mean junk (`"pm awas"`). A single word in broad or phrase match (`-ivy`, `-107`, `-flat`, `-m`) blocks every search that contains it, in every combination, including searches we pay for; use one only when the word can never be part of a County search (for example `rent`, `pg`, `jobs`), and then put it in the shared list.

What the dashboard checks every day against this rule:
- **Overview › Done** counts how each blocked junk search is blocked: by its own full term (safe), by part of it, or only by one word. On 22 Nov: 1,512 by the full term, 61 by part, 53 by one word.
- **Overview › Still to do** shows how the sheet writes its negatives: on 22 Nov, 879 of 1,924 Exclude calls gave a single word and 274 gave none (the 20 and 21 Nov tabs had almost all blank).
- **Fix list › Junk searches still not blocked** always suggests the full search term as the negative, and says when the sheet wrote one word or nothing.
- **Fix list › Negatives blocking searches we want** lists every negative in the account that also blocks a search that converted, that the sheet said to Add, or that is our keyword, with the junk searches to negate instead (for example `-prestige` in Ivory Competitor blocks "prestige 150 noida", 5 conversions, and the keyword "prestige sector 150 noida").

1. **Use the smallest negative that removes the junk.** Prefer the project name as a phrase (`"skyline suites"`) over a single word (`skyline`).
2. **Never** use a bare number (`-62`, `-24`, `-124`), or a single common property word (home, house, flat, project, society, villa, sector, city, new, greater) as a campaign-wide broad negative.
3. **Pick the level on purpose and write it in the sheet:** ad group, campaign, or shared list.
4. **Junk that applies to every project** (rent, PG, jobs, address patterns, budget words) goes into the **shared list**, not into one campaign. One example: *hans residency* was excluded in Ivory, then cost Rs 830 in Clove.
5. **Before applying**, the dashboard's *Account risks* page must show no clash with our own keywords or the sheet's Add terms.
6. **Do not add the same block twice.** On 5 Nov, 160 of 162 exact negatives were already blocked by the broad or phrase negatives added the evening before.

## 8. Sheet columns (proposed additions)

Keep the current columns, and add: **Level** (ad group / campaign / shared list), **Negative match type** (broad / phrase / exact), **Add to** (campaign and ad group for an Add), **Applied on** (date), **Applied by**.

## 9. Daily QC checklist (County QC lead, about 15 minutes with the dashboard)

1. *Load data*: three files loaded; the agency tab's spend matches Google's report for that day.
2. *Command centre*: read "Decisions waiting", red first.
3. *Daily STR review*, filter "Flagged, no call": comment on each row.
4. *Said vs done*: overdue Excludes and Adds; chase anything older than the service level.
5. *Account risks*: brand campaigns paying for non-brand searches, brand searches in non-brand campaigns, keywords blocked by our own negatives, risky campaign-wide negatives.
6. Once a week: load the campaign report and keyword report, then read *Campaign health*, *Keyword quality* and the *Ivory CTM case*.

## 10. What we measure every week

| Measure | How it is counted |
|---|---|
| Calls applied on time | Exclude and Add calls in the account within 1 working day ÷ all calls |
| Overdue backlog | calls past 3 days and not in the account, with the spend on those rows |
| Brand leakage | spend in brand campaigns on searches with no brand word, and brand searches inside non-brand |
| Self-blocks | our own keywords blocked by our own negatives |
| Junk share | spend on rows called Exclude ÷ all reviewed spend |

## 11. Known gaps

- Performance Max (Clove) has campaign-wide broad negatives such as `-sector`, `-city`, `-tower`, `-greater`, which are not in any sheet.
- Ivory CTM and the agency's Ivory brand campaign bid on the same brand searches.
- Clove's product details (configurations, sizes) are not written down yet.
- Ivory Non-brand still runs Villa and Pent House ad groups although Ivory sells neither.
- Conversions are not yet linked to CRM lead quality, so "it converted" cannot yet mean "it was a good lead".

## Version notes

- 0.1 (6 Nov 2026): first draft from the 15 Oct to 5 Nov data.
- 0.2 (6 Nov 2026): project prices and configurations added; numbers re-checked against the change history from 1 Oct.
- 0.3 (22 Nov 2026): County's rule "negate the full search term, never one word" added to section 7, with the dashboard checks that follow it.
