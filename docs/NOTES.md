# Dated notes

Every meeting with the agency and every recheck of the account gets one dated note, so what was said, what the numbers were and what was decided can be reconciled later.

## Where they live

- `data/notes/YYYY-MM-DD-<topic>.md`: the note itself, for example `data/notes/2026-11-23-str-meeting.md`.
- `data/meeting/`: printable briefs handed out in a meeting.

Both folders quote the agency's search terms and spend, so they are **never committed as plain files**. `npm run save` seals them into `vault/data.qcvault` together with `data/app/`, and opening the vault on another machine brings them back.

## What each note holds

1. The date, which sheet tabs it covers, and when the Google Ads reports were downloaded.
2. Each point raised, with the exact searches, campaign, ad group, level (campaign / ad group / shared list) and rupees behind it.
3. How every number is calculated, so it can be checked again.
4. What was decided, and by whom (County or agency).
5. Any change made to the dashboard's rules that day, with the before and after counts.

## To reconcile a note

Open the data saved that day (the `Save dashboard data (...)` commit), set **Checked up to** on the dashboard to the last tab in the note, and compare the Overview, Fix list and Every search pages with the note. Later data will show what was done since.

## Index

| Date | Note | What |
|---|---|---|
| 23 Nov 2026 | `data/notes/2026-11-23-str-meeting.md` | STR meeting: tabs not applied (18 to 22 Nov), money after the call, one-word negatives, negatives blocking wanted searches by intent, County's project-name rule, every County comment against the account, Adds by intent, converted searches now blocked, Excludes with buying intent |
| 25 Nov 2026 | `data/notes/2026-11-25-followthrough.md` | Follow-through after the 23 Nov meeting: Excludes from the 18 to 22 Nov tabs applied on 24 Nov, Adds still not done, the five meeting negatives still in place, new one-word negatives, Notes-tab words in shared lists, other account changes 23 to 25 Nov. Exports of 25 Nov 5:14 pm, not yet loaded into the dashboard |
