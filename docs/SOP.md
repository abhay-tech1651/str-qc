# SOP: Daily search-terms review (STR) for County Group Google Ads

Version 0.4 draft, 25 Nov 2026. Owner: County QC lead. Approver: County approver (proposed).

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

**Judge by buying intent, not by whether a search converted once (owner, 23 Nov 2026).** A search that names our project, or our location with a buying word (*3 bhk in noida sector 115*), is **high**; our location alone, or a city with a buying word (*noida flat purchase*), is **medium**; another builder's project or group (*prestige 150 noida*), another County project, rent, budget or research words are **low**. Blocking a low-intent search is fine even if it converted once. The dashboard shows the level on every search; the words are in `config/intent.json`. **Location searches are low intent** (owner, 25 Nov 2026), even with our project name (*ivory county sector 115 noida location*): that person opens Google Maps, not the ad. Exclude them by the full search, not the word `location`, and do not keep a keyword that asks for them.

**County's decisions of 27 Nov 2026 (owner):**
- **Clove does not want Noida Extension searches.** `-extension` in Clove Non-brand is right. Clove's own Noida Extension keywords (*4 bhk flats in noida extension*) should be paused, not kept.
- **Villa searches are fine for Clove.** Clove starts at Rs 8 Cr, so a villa buyer can fit. Ivory and Jade still do not want villas.
- **County Spaces is County's commercial project, and County runs no ads for it.** `-spaces` and the paused keyword *county spaces* are right.
- **County Group brand searches (*county group*, *county group noida*, *countygroup*) need neither an Add nor an Exclude.** They are brand searches, and pausing those keywords in Clove Brand is accepted.
- **The /campaign/ landing pages in the new ads are approved.**

**Other County project names are negated on purpose.** In each campaign, the names of County's other projects (in a Cocoa campaign: Coco, Ivy, Ivory, Cleo, County 107 and the rest) are negatives, because someone searching *ivy county* wants that project, not the one the campaign sells.

Write **Leave** in the Status column instead of leaving it blank. A blank cell cannot tell "decided to leave" apart from "not reviewed".

## 7. How to write the negative (the part that goes wrong most)

**County's rule (owner, 22 Nov 2026): negate the search term itself, never a single word.** When a row is Exclude (and when County writes a comment on it), the negative column must hold the **full search term**, written as a phrase (`"pm awas gramin report"`) or exact (`[pm awas gramin report]`). A part of two or more of its words is fine when that part can only mean junk (`"pm awas"`). A single word in broad or phrase match (`-ivy`, `-107`, `-flat`, `-m`) blocks every search that contains it, in every combination, including searches we pay for; use one only when the word can never be part of a County search (for example `rent`, `pg`, `jobs`), and then put it in the shared list.

How Google Ads reads a negative (Google Ads Help, "About negative keywords" and "About negative keyword lists"):
- **Negatives do not stretch to close variants.** `-flat` does not stop "flats", and `-flower` does not stop "flowers". Positive keywords do match close variants, so a junk search can keep arriving in a new spelling.
- **Broad negative** (`-ats pristine`): blocks a search that has all its words, in any order. **Phrase** (`-"ats pristine"`): the words together, in that order. **Exact** (`-[ats pristine noida]`): only that search, with no extra words.
- **Levels:** a campaign negative stops the search in the whole campaign; an ad-group negative only in that ad group (the search can still run in another ad group of the campaign); a shared negative list works like a campaign negative in every campaign it is attached to.
- **Limits:** up to 10,000 negatives per campaign, 5,000 per shared list and 20 shared lists per account (Google's limits page; check it before planning a very large list). Jade Brand NCR held 15,706 negatives on 25 Nov (3,161 campaign level, 12,545 in ad groups).
- **Shared lists are not exported** by the negative keyword report (it only names them). The change history shows each word added to or removed from a list, so the dashboard knows the words added since 1 Oct; older ones stay unknown.

What the dashboard checks every day against this rule:
- **Overview › The agency's scorecard › How the negatives went in**: for every junk search blocked today, the most specific negative that went in on the first day it was blocked (full search, part of it, or one word). On 25 Nov: 1,541 by the full search, 161 by part of it, 175 by one word.
- **Agency report › 5 · How the sheet writes its negatives**: week by week, how often the sheet's negative column gives one word or nothing. On 25 Nov: 947 of 2,030 Excludes gave one word and 248 gave nothing.
- **Negatives › One-word negatives added in the last 30 days**: every single word that went in as a broad or phrase negative, with who and where (859 in the 30 days to 25 Nov), red where it now blocks a search we want or our own keyword.
- **Negatives › Negatives that block searches we want** (also on the Fix list): a negative that stops a high- or medium-intent search that converted, that the sheet said to Add, or that is our keyword, with the junk searches to negate instead. Left out on purpose: negatives that only block low-intent searches (`-prestige`), County's other project names (County's rule, 22 Nov), our brand words in non-brand and competitor campaigns (rule 1 in section 6), and ad-group negatives where a campaign-level negative already stops the search.
- **Fix list › Junk searches still not blocked** always suggests the full search term as the negative, and says when the sheet wrote one word or nothing.
- **Blocked means stopped in the whole campaign**: a negative at campaign level, in a shared list the campaign uses, or in every ad group. A negative in only some ad groups steers the search; when it sits in another ad group than the one the search ran in, the Exclude is marked **Wrong place**.

1. **Use the smallest negative that removes the junk.** Prefer the project name as a phrase (`"skyline suites"`) over a single word (`skyline`).
2. **Never** use a bare number (`-62`, `-24`, `-124`), or a single common property word (home, house, flat, project, society, villa, sector, city, new, greater) as a campaign-wide broad negative.
3. **Pick the level on purpose and write it in the sheet:** ad group, campaign, or shared list.
4. **Junk that applies to every project** (rent, PG, jobs, address patterns, budget words) goes into the **shared list**, not into one campaign. One example: *hans residency* was excluded in Ivory, then cost Rs 830 in Clove.
5. **Before applying**, the dashboard's *Account risks* page must show no clash with our own keywords or the sheet's Add terms.
6. **Do not add the same block twice.** On 5 Nov, 160 of 162 exact negatives were already blocked by the broad or phrase negatives added the evening before.

## 8. Sheet columns (proposed additions)

Keep the current columns, and add: **Level** (ad group / campaign / shared list), **Negative match type** (broad / phrase / exact), **Add to** (campaign and ad group for an Add), **Applied on** (date), **Applied by**.

## 9. Daily QC checklist (County QC lead, about 15 minutes with the dashboard)

1. *Data*: import the new reports; the agency tab's spend matches Google's report for that day.
2. *Day by day*: the newest tabs (did their calls go in, and when) and the right-hand list (who changed what in Google Ads; a weekday with **No change** is a question for the agency).
3. *Overview*: the scorecard and *What to raise*, red first.
4. *Fix list*: tick *Only past the deadline*, download the CSV and send it to the agency.
5. *Negatives*: new one-word negatives, and negatives that block searches we want.
6. Before a meeting: print *Agency report* (every mistake, with the change-history time, the person and the place in Google Ads). Click any row for the search's full story.
7. Once a week: load the campaign report and keyword report, then read *Performance* (campaigns, keywords) and the project pages.

## 10. What we measure every week

| Measure | How it is counted |
|---|---|
| Calls applied on time | Exclude calls in the account by the deadline (sheet day + 3 days) ÷ Excludes past their deadline; the same for Adds (*Overview › Week by week*) |
| Money lost to delay | spend on a search after its deadline, up to the day its negative went in (or up to the last tab, if it is still not in) |
| Overdue backlog | calls past the deadline and not in the account (*Fix list*, *Only past the deadline*) |
| Brand leakage | spend in brand campaigns on searches with no brand word, and brand searches inside non-brand |
| Self-blocks | our own keywords blocked by our own negatives |
| Junk share | spend on rows called Exclude ÷ all reviewed spend |

## 11. Known gaps

- Performance Max (Clove) has campaign-wide broad negatives such as `-sector`, `-city`, `-tower`, `-greater`, which are not in any sheet.
- Ivory CTM and the agency's Ivory brand campaign bid on the same brand searches.
- Clove's product details (configurations, sizes) are not written down yet.
- Ivory Non-brand still runs Villa and Pent House ad groups although Ivory sells neither.
- Conversions are not yet linked to CRM lead quality, so "it converted" cannot yet mean "it was a good lead".

## 12. After the search terms: what comes next

Once the searches are clean, the same daily discipline moves to the three parts of Quality Score that Google reports for each keyword: **expected click-through rate**, **ad relevance** and **landing page experience** (Search keywords report, Quality Score columns, already loaded weekly on *Performance › Keywords*). The keyword report of 13 Nov showed 67% of keyword spend on keywords with a below-average landing page experience (Ivory 90%), so landing pages are the first candidate.

## Version notes

- 0.1 (6 Nov 2026): first draft from the 15 Oct to 5 Nov data.
- 0.2 (6 Nov 2026): project prices and configurations added; numbers re-checked against the change history from 1 Oct.
- 0.3 (22 Nov 2026): County's rule "negate the full search term, never one word" added to section 7, with the dashboard checks that follow it.
- **0.4 (25 Nov 2026):** how Google reads negatives (close variants, match types, levels, limits, shared lists); the checks now live on Overview, Agency report, Day by day, Negatives and Fix list; deadline-based measures; section 12 (what comes after the search terms).
