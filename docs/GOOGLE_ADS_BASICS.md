# Google Ads, explained simply (with County Group examples)

Read this top to bottom once. Every later idea builds on the one before it.

## 1. What happens when someone searches

1. A person types something into Google, for example *3 bhk flat in noida*. What they typed is the **search term**.
2. In a fraction of a second Google runs an **auction** among all advertisers who said they want to show for searches like that.
3. Each advertiser's position is decided by **Ad Rank**. In simple words, Ad Rank = how much you are willing to pay (your **bid**) combined with how good and relevant Google thinks your ad and page are (**quality**). A highly relevant ad can beat a bigger bid.
4. The winners show their ads. You pay only when someone **clicks** (cost per click, **CPC**), and you usually pay a bit less than your full bid: roughly what was needed to beat the advertiser below you.

**One rule to remember for later:** Google shows at most one ad from the same advertiser in one auction. If two of *our* campaigns both want the same search, only one of them takes part: the one with the higher Ad Rank. Our own campaigns can therefore block each other.

## 2. How an account is organised

```
Account (County Group)
 └─ Campaign      e.g. ROI_Ivory_Non_Brand_Search      ← budget, bidding, locations live here
     └─ Ad group  e.g. Flats in Noida                   ← one theme
         ├─ Keywords  e.g. "3 bhk flat in noida"        ← what we tell Google we want
         └─ Ads       headlines, descriptions, link     ← what the person sees
```

Our campaign types:

| Type | Who it is for | Example |
|---|---|---|
| **Brand** | people who already typed our name | *ivory county sector 115 noida* |
| **Non-brand** | people looking for homes in general | *luxury flats in noida* |
| **Competitor** | people searching another builder's project with a similar price and area | *ats kingston heath* |
| **CTM** (run by Google's own team) | Ivory, managed by Google, not the agency | Ivory_County_SearchCTM |
| **Performance Max** | Google's automatic campaign across Search, YouTube, Maps and more | ROI-Clove-P-Max-Site-Visit |

## 3. Keyword vs search term (the most important idea)

- A **keyword** is what *we* give Google: "show my ad for searches like this".
- A **search term** is what the *person* actually typed.
- They are rarely identical. Google decides which search terms are close enough to a keyword, using the keyword's **match type**.

Real example: our keyword *"noida premium apartments"* (Clove non-brand) showed an ad for a search about a holiday-stay brand. One click cost over **Rs 2,000**. Nobody typed our keyword; Google decided the search was close enough.

## 4. Match types: how loosely Google may match

| Match type | Written as | Google may show the ad for | County example |
|---|---|---|---|
| **Broad** | luxury flats noida | anything related in meaning, even without those words | can match other builders' project names |
| **Phrase** | "luxury flats in noida" | searches that include the meaning of the phrase, with words around it | *luxury flats in noida for sale*, and also looser variants |
| **Exact** | [luxury flats in noida] | searches with the same meaning | *noida luxury flats* |

In the search terms report you will see "(close variant)" next to the match type. It means Google matched something it considers the same meaning: plurals, misspellings, word order, synonyms (flat/apartment), and sometimes dropped words. **Most of our junk comes in through phrase-match close variants.**

## 5. Negative keywords: telling Google "never for this"

A **negative** stops an ad from showing when the search contains it. Negatives have the same three match types, but they are **strict**: they do *not* stretch to plurals, misspellings or synonyms.

| Negative | Blocks | Does not block |
|---|---|---|
| broad `-supertech` | any search containing the word *supertech* | *super tech* (two words) |
| phrase `-"golf links"` | searches with *golf links* in that order | *golf link* (singular) |
| exact `-[godrej greater noida]` | only that exact search | *godrej greater noida project* |

Where a negative lives matters:

| Level | Covers | Use it when |
|---|---|---|
| **Ad group** | only that ad group | steering searches between our own ad groups (see section 7) |
| **Campaign** | every ad group in that campaign | junk for that project only |
| **Shared negative list** | every campaign the list is attached to | junk for all projects (rent, PG, jobs, address searches) |

Danger: a single common word as a campaign-wide broad negative can silently kill good traffic. `-62` blocks *sector 62 gurgaon*; `-home` blocks *luxury home in noida*; `-society` would block *best high rise society in noida*.

## 6. The two reports we use every day

**Search terms report (STR):** for one day, every search that triggered our ads, with clicks, cost and conversions. The *Added/Excluded* column tells you whether that search already is a keyword (*Added*) or is already blocked by a negative (*Excluded*). Google hides some rare searches for privacy, so the STR never adds up to the full campaign spend.

**Change history:** every change anyone made to the account, with the time, the person's email and exactly what changed. This is the only proof that a decision in a sheet actually reached the account.

## 7. Many ad groups and "funnelling" (your question about Ivory non-brand)

Ivory non-brand has nine ad groups (Flats, Apartments, Projects, Villa, House, Home, Penthouse, Property, Societies). Google treats flat, apartment, home and house as near-synonyms, so a search like *luxury flats in noida* could be picked up by several of them. On 2 Nov the agency added ad-group negatives so each small group only takes its own word (Villa refuses *flat, apartment, home, house, society, project…*). This is called **query funnelling**. It is a real technique, and it only works at ad-group level.

What the data shows: it also blocked some of the agency's own keywords (Villa in Noida refuses *projects*, so its keyword *new villa projects in noida* can never show), and on 4 Nov *villa projects in noida* ended up in the Apartments ad group.

Your Google manager is right that one theme per ad group is normal. With nine groups for one product and little traffic per group, fewer groups (for example: apartments/flats/homes together, projects/societies together) would remove the need for funnelling. That is an opinion to discuss with the agency, not a rule.

What is not an opinion: **Ivory County sells 3, 4 and 5 BHK apartments, and no villas or penthouses** (confirmed 6 Nov). The Villa and Pent House ad groups advertise a product we do not have. From 1 Oct to 6 Nov they cost ₹10,361 with 0 conversions.

## 8. Bidding: what "target CPA" really does

- **Conversion**: an action we count as success, here mostly a lead form.
- **CPA** (cost per acquisition) = spend ÷ conversions. Rs 10,000 spent for 2 leads = Rs 5,000 CPA.
- **Target CPA (tCPA)**: we tell Google "aim for leads at this cost". Google then bids, for each search, roughly **target CPA × the chance this click turns into a lead**.

Worked example with Ivory CTM's own numbers: from 1 Oct to 6 Nov the campaign report shows 398 clicks and 30 Google conversions, a conversion rate of about 7.5%. At a target CPA of Rs 800, Google can afford roughly 800 × 7.5% ≈ **Rs 60 per click**; in November CTM actually paid about **Rs 26** a click on average. The agency's Ivory brand campaign paid **Rs 198–494 per click** in the same week. In the auction between our own two campaigns (section 1), the one willing to pay more wins almost every time.

The campaign report shows a second, bigger cause. Impressions ÷ impression share = the number of searches a campaign could have entered. For CTM that fell from about **15,800 a day** (1–8 Oct) to about **190 a day** (26 Oct–4 Nov). It fell in two steps: when its generic keywords were switched to exact match (10 Oct), and when search term matching was turned off (16 Oct). A campaign with almost no searches to enter cannot spend its budget, whatever the target. The guide *Reading the reports* explains these columns.

- **Budget** is the most a campaign may spend per day. It only limits a campaign that is actually reaching it. If a campaign spends far less than its budget, raising the budget changes nothing: the target or the bid is what holds it back.
- **Learning period**: after a big bidding change Google shows the strategy as "Learning" while it adjusts, usually for about one to two weeks. Results in that window are not a fair test.

## 9. Conversions in Google vs leads in our CRM

Google counts a conversion when the form is submitted. Our CRM later marks the lead Qualified, Disqualified or Pending. A search with a "conversion" can still be a bad lead. That is why a search term that converted is not automatically a keeper; we check the lead quality before deciding.

## 10. Glossary

| Word | Meaning |
|---|---|
| Impression | the ad was shown once |
| Click | someone clicked the ad |
| CTR | clicks ÷ impressions |
| CPC | cost of one click |
| Conversion | a counted success, here a lead form |
| CPA | spend ÷ conversions |
| tCPA | target CPA, the bidding goal we give Google |
| Ad Rank | bid combined with ad and page quality; decides who shows |
| Impression share | share of eligible auctions where we showed; "lost to budget" or "lost to rank" says why we missed the rest |
| Close variant | a search Google treats as the same meaning as a keyword |
| Negative | a word or phrase that stops ads for searches containing it |
| Shared negative list | a set of negatives attached to several campaigns at once |
| STR | search terms report |
