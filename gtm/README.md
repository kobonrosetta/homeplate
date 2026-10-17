# Chef outreach CRM

Your working list for recruiting the first chefs. See `../GTM.md` for the full
strategy; this is the operational tool.

## Files
- **`chef-outreach-crm.csv`** — every permitted operator in Santa Clara County
  (487: 171 MEHKO hot-meal + 316 cottage bakers), pulled from the county's
  public open-data feeds. Prioritized and ready to work.
- **`build-crm.mjs`** — regenerates the CSV. Re-run any time to refresh as the
  county updates its lists: `node gtm/build-crm.mjs`

- **`contacts-researched.csv`** — the researched contact channels (agent
  research pass, Oct 2026): every MEHKO operator with permit #, confidence
  (HIGH / MEDIUM / LOW / GHOST), social, best contact, and a one-line note.
  **This file is the system of record for contacts.**

> ✅ Re-running `build-crm.mjs` is now safe: it refreshes the county data AND
> merges `contacts-researched.csv` back in by permit number, so a refresh can
> no longer wipe outreach research. (It used to blank the contact columns —
> hence the old "work in a Google Sheets copy" warning.) Status / Last
> contacted / your own notes still live only in the CSV, so if you track those,
> keep a Sheets copy or add them to the research file.

## Contact research (Oct 17 2026)
All **182 MEHKO** (hot-meal) operators in the county were researched by an
agent sweep — Instagram, Google Maps, Yelp, Facebook, TikTok and the open web —
with a second adversarial pass verifying each match against name, city and
food type so a same-named business in another city never gets contacted by
mistake. Result:

| Confidence | Count | What it means |
|---|---|---|
| HIGH | 40 | Contact now — match verified against city + food type |
| MEDIUM | 11 | Plausible: open the evidence link and eyeball it first |
| LOW | 2 | Probably the wrong business — treat as unresearched |
| GHOST | 124 | No findable web presence (word-of-mouth cooks; the exact gap ForkFork fills) |

Findability drops sharply with permit age: the 40 newest permits yielded a
~58% hit rate, the older 142 about 20%. **New names on the weekly permit
refresh are the warmest and most reachable leads — work them while they're
fresh.** Cottage bakers (318) are not yet researched.

## How it's prioritized
Sorted by **Tier**, active permits first:
- **A · SJ hot-meal (98 operators) — START HERE.** San Jose holds 57% of all
  MEHKOs in the county. Density is everything: buyers need real choice nearby.
- **B · SJ baker** — cottage bakers in San Jose.
- **C · other-city hot-meal** — MEHKO in Milpitas (15), Santa Clara (13),
  Sunnyvale (9), Cupertino (8)… your second-wave geographies.
- **D · other-city baker.**

You only need **5–10 yeses from Tier A** to launch a real cluster.

## Sourcing contact info (the county feed has names + city, not contacts)
For each target, search the facility name + "San Jose" on: **Instagram, Facebook,
Yelp, Google, Nextdoor.** Most already sell *somewhere* and have a public page you
can DM or a site with contact info. Worked examples from Tier A:

| Facility | Found | Notes |
|---|---|---|
| **40 Acres Soul Kitchen** (Chef Quiana Negrón) | Website `40acressoulkitchen.com`, FB `@40acressoulkitchen`, Yelp | Southern + Puerto Rican. **Already listed on cookin.com** (a rival MEHKO platform) — validated seller, and a competitive signal. Very reachable. |
| **23rd Parallel Supper Club** | Website `23rdparallelclub.com` (booking page) | Indian supper club, $60/seat, reservation-based. Reachable — but it's a *dine-in experience*, not takeout, so a weaker fit for order-ahead pickup. Qualify before pitching. |
| **Arepas Pal Tiesto** | Not found via search | Some are newer/smaller with no web presence — reach via county business record or in person. |

**What this tells you:** roughly a third are instantly reachable online, a third
take digging, a third need a phone call or a knock. And watch for chefs already on
**cookin.com / Hotplate / Instagram** — they're validated demand, and your pitch
to them is "extra discovery, free to try," not "come sell food online."

## The pitch & objection-handling
In `../GTM.md` §6. Short version: _"You did the hard part — you got the permit. I
built you a free storefront so neighbors can find you and pay online, you keep
100% of your price, and I'll set the whole thing up for you. Want me to build
yours?"_

## Suggested workflow
1. Import the CSV to Google Sheets.
2. Work Tier A top-down: fill `Website/social` + `Contact`, set `Status`
   (Not started → Contacted → Interested → Onboarding → Live → Passed).
3. Aim to contact ~20–30 to land the first 5–10.
4. Concierge-onboard every yes by hand (photos, listing, Stripe) — see GTM.md §5.
