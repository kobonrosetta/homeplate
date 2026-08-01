# ForkFork — Go-To-Market & Outreach Plan

_Owner: Kobon (founder/CEO). Last updated: 2026-08-01. This is a living working
doc — edit it as reality teaches you things. Incorporates the deep competitive
teardown in `gtm/foodnome-teardown.md`._

---

## 0. The blunt verdict

**The product is ready. The business is unproven. Those are different things, and
the gap between them is the entire job now.**

You have a complete, live, secure marketplace with the real Santa Clara County
permit lists loaded and a clean database. That's further than most people get.
But you have **zero real chefs and zero real buyers**, and — this is the part
that matters — **you are entering a category where every venture-backed attempt
before you has died or become a nonprofit.** That is not a reason to quit. It's a
reason to play a completely different game than they did.

**Your single hardest problem is not buyers, marketing, or the app. It is
recruiting and _keeping_ the first 5–10 real chefs in one small area.** Everything
in this plan bends toward that. If you internalize one thing: this is a
**supply-first, hyperlocal, do-things-that-don't-scale** business, and your
biggest asset is that you can afford to move slowly because you didn't raise money.

**And there's a deeper question under all of this** that the teardown surfaced and
you should answer on purpose, not by default: **are you building a business or a
movement?** The best-run version of exactly this (Foodnome) took 2× your fee and
_still_ concluded the answer was "movement" — it became a nonprofit that gives
cooks money instead of taking a cut. Your lean build means you can run ForkFork as
either, but the answer sets your fee model, whether you chase grants or investors,
and how you spend the next year. See §10.1.

---

## 1. What the market has already taught us (so you don't relearn it the expensive way)

I researched every prior attempt at this. The pattern is brutal and clarifying.

| Company | What it was | What happened | Lesson |
|---|---|---|---|
| **Josephine** | First home-cooking marketplace (pre-MEHKO, ~2015–18) | Shut down by regulators — selling home food was illegal then | Legality is existential. _MEHKO fixes this for you._ |
| **Foodnome** | The MEHKO marketplace, CA, VC-style | Founder handed it to a nonprofit (COOK Alliance → "COOK Connect"). Quote: _"This is a lifetime battle that doesn't operate at the speed of venture capital."_ | The economics don't support blitzscale. Slow is the only speed that works. |
| **Shef** | Raised $100M+ for home-cook delivery | Hit regulatory walls, pivoted away from the core model | Big money made it worse, not better — it forced scaling the category couldn't support. |
| **DishDivvy** | Home-cook platform | Folded, explicitly citing "regulatory complexity" | Compliance is a permanent tax; build for it, don't fight it. |
| **Hotplate** | Drop/pre-order **tool** (not a marketplace) | **Alive and healthy** | The one survivor sidesteps the hard part — it makes the chef bring their own audience. |

**The takeaways that shape your whole strategy:**

1. **The graveyard is full of the people who tried to scale fast on VC money.**
   You are not them. Your lack of funding is a genuine competitive advantage
   here — Foodnome _died of impatience_. You can afford the "lifetime battle."
2. **The one survivor (Hotplate) isn't actually a competitor to your bet** — it's
   a checkout tool for chefs who _already have customers_. It does no discovery
   and no verification. More on this in §3.
3. **Regulation is a moat, not just a cost.** MEHKO chefs are **legally banned
   from DoorDash / Uber Eats / third-party delivery.** A compliant discovery-and-
   ordering layer is a real, legal gap in the market. That gap is your reason to
   exist.
4. **Verification is _the_ demand unlock — confirmed by every source.** The
   recurring category conclusion: _"consumers don't want to buy food from an
   uncertified kitchen."_ Josephine (3,000+ cooks) died skipping health-department
   approval. Your county-verification isn't a nice differentiator — it's what makes
   the demand side possible at all. Treat it as the product's spine.
5. **Nobody has made marketplace fees alone sustain a for-profit here.** Foodnome
   charged **15% + a $1,000 onboarding fee** and still went nonprofit; DishDivvy
   took 15% and folded; "standard" is 15–25% _from cooks_. You take **0% from
   chefs** — the friendliest economics in the category (great for recruiting), but
   it means fee revenue is even thinner. Sustainability is a real open question,
   not a given (§10.1).

---

## 2. The market, sized honestly

- **Santa Clara County MEHKO is (very likely) now a _permanent_ program**, not a
  sunsetting pilot — it's listed among the permanent counties alongside Alameda
  and San Mateo. **ACTION: confirm this directly with SCC Environmental Health**
  before you bet the company on it. If it's still a pilot with a 2026 sunset,
  that's a company-level risk you must know.
- **18 California jurisdictions** now allow MEHKO (LA, San Diego, Riverside,
  Alameda, etc.) — that's your county-by-county expansion runway _if_ SCC works.
- **Your addressable supply, today, by name: ~487 operators** — 171 MEHKO + 316
  cottage-food (the live county count; it drifts as permits issue/expire) —
  already mapped in `gtm/chef-outreach-crm.csv`. **This is your crown jewel.**
  Most founders spend months figuring out how to find sellers. You have a
  complete, verified list of every legal home food business in your county.
  **98 of the MEHKOs are in San Jose — that's 57%, and it's your starting cluster.**
- **The catch — supply is structurally small and capped.** By law a MEHKO can
  sell **30 meals/day, 60/week, ~$107k/year max**. So per-chef GMV is capped, and
  at your 8% + $0.30 fee a chef doing $40k/yr is only ~$3.2k of platform revenue.
  **This math only works with _density_ — many active chefs, not a few big ones.**

---

## 3. Your unfair advantages (lean on these)

1. **The list.** 487 permitted operators, by name, verified against the county.
   Your outreach doesn't start cold — it starts with "I already know you're
   legal." (§6 is the playbook for working it.)
2. **No VC clock.** You can run this at the slow, patient speed the category
   actually requires — the speed that killed the funded players.
3. **County-verification as the trust wedge.** This is your one crisp
   differentiator vs. a Facebook group _and_ vs. Hotplate. Buyers of home food
   have one real fear ("is this safe / who is this person?") and you're the only
   one who answers it with the county's own records.
4. **You fill the legal gap.** MEHKOs can't be on DoorDash. You're the compliant
   way for them to be _found_ and take orders. That's a genuine job-to-be-done.
5. **The friendliest economics in the category.** Everyone else takes 15–25% _from
   cooks_ (Foodnome 15% + $1k onboarding, DishDivvy 15%). You take **0% from chefs
   — they keep 100%.** Say it out loud in every recruiting conversation; it's a
   real wedge. (Caveat: it also makes fee revenue thin — see §10.1.)
6. **A recruiting truth + a story that opens doors.** A home restaurant costs
   **<$1,000 to start** vs. ~$400k for a brick-and-mortar or ~$50k for a food
   truck — the most persuasive line you have for any cook who ever dreamed of
   "opening a place." And the movement's demographics (home cooks are ~84% women,
   ~48% Black/Latino, ~30% first-generation immigrant) are a genuine press,
   partnership, and grant story a plain "food app" can't tell.

**How to think about Hotplate (your most important "competitor"):**

> Hotplate is basically free (chef pays only Stripe's ~2.9% + 30¢) and is a
> brilliant tool — **if the chef already has an audience.** It does zero discovery
> and zero verification. It's a cash register, not a storefront in a mall.
>
> **ForkFork's wedge: the ~90% of your 487 permit-holders who have NO audience.**
> A chef with 8k Instagram followers should use Hotplate. A talented cook with a
> permit and 40 followers is invisible today — and that's who you serve, by
> _bringing them customers they could never reach alone._
>
> **But this cuts both ways and you must be honest about it:** your buyer-paid 8%
> fee is only justifiable if you actually deliver discovery/customers. If you
> don't bring demand, you're a more expensive Hotplate with extra steps. **Demand-
> seeding (§5, Phase 2) is therefore do-or-die, not a nice-to-have.**

---

## 4. The strategy in one paragraph

**Own one small geography completely before touching a second.** Recruit a
_dense cluster_ of 5–10 verified chefs in one part of Santa Clara County
(concierge-onboard each one by hand), then manually seed demand around that
cluster until the ordering loop spins on its own. Be the compliant discovery
layer MEHKOs are legally denied elsewhere. Keep burn near zero. Only after the
loop demonstrably works in one neighborhood do you widen — first across the
county, then (much later) to the next MEHKO county. **Density over reach.
Retention over acquisition. Patience over scale.**

---

## 5. The attack plan (phased)

### Phase 0 — Go-live readiness (do first; ~1 week of ops, mostly not code)
Before outreach, the moment a real chef says yes, the path must be flawless.

- [ ] **Confirm SCC MEHKO is permanent** (see §2). Company-level risk gate.
- [ ] **Rotate all secrets** (they were shared in chat/screenshots) and flip
      **Stripe to live keys + both live webhooks** (platform + Connect).
- [ ] **Upgrade off the free Render tier** so the site doesn't sleep — a
      cold-starting server hurts both crawlers _and_ a chef you're demoing to live.
- [ ] **Google Search Console**: verify `forkfork.app`, submit the sitemap,
      request indexing. (Robots/sitemap/structured-data are already shipped.)
- [ ] **Add product analytics** (see §8 — you have none; you're flying blind
      without it). At minimum: signups, listings created, orders, repeat orders.
- [ ] **Run `supabase/reset-test-data.sql`** at the test→live cutover for a clean
      production slate.
- [ ] Do one **full dry-run**: create a test kitchen, place a real (live-mode)
      $1 order, confirm the emails, payout, and status flow all fire.

### Phase 1 — Recruit the first 5–10 chefs (the whole ballgame)
This is 80% of your time for the next 1–2 months. See §6 for the playbook.

- [ ] Pick **ONE sub-area** (e.g. a cluster of San Jose ZIPs) and filter the 497
      to operators there. Density beats spread — buyers need _choices_ nearby.
- [ ] Build a simple CRM (a spreadsheet is fine): name, permit #, city, contact,
      status, notes.
- [ ] Source contact info (§6). Reach out to 20–30 to land the first 5–10.
- [ ] **Concierge-onboard every single one by hand** — sit with them (in person or
      video), build their kitchen, shoot/upload photos, write the first listing,
      **and coach their pricing** so they don't underprice into burnout (the #1
      quiet killer of home food businesses — §7). Do not rely on self-serve for
      chef #1–10. White-glove supply is how every marketplace that survived started.
- [ ] Get them **payout-ready** (Stripe Express) so they're live, not stuck.
- [ ] **Introduce yourself to Santa Clara County Environmental Health as a
      _partner_, not a scraper.** They run the MEHKO program, own the list, and
      talk to every permit holder. Every survivor of this category partnered with
      health departments; Josephine died fighting them. A friendly relationship
      could mean referrals, legitimacy, and a moat no competitor has.

### Phase 2 — Seed demand around the cluster (do-things-that-don't-scale)
Chefs churn fast if orders don't come (Foodnome watched cooks quit when demand
dried up). Your job is to manufacture the first orders by hand.

- [ ] **Your own network first.** You, the chefs' friends/family/neighbors, your
      circle. The first 50 orders should feel almost hand-placed.
- [ ] **Each chef is a demand channel.** They have _some_ people (even 40
      followers). Give them a dead-simple "order from me on ForkFork" link + a
      graphic. Their existing buyers become your first indexed reviews.
- [ ] **Hyperlocal physical channels:** Nextdoor, neighborhood Facebook groups,
      apartment-complex boards, farmers markets, cultural/community orgs matched
      to the cuisines you onboarded.
- [ ] **Lean on the verification story in every buyer message** — it's your only
      differentiated hook. "Real county-permitted home kitchens near you," not
      "cheap food."

### Phase 3 — Prove the loop, then widen
- [ ] Define "the loop works" before you start (see §7 metrics). Roughly: a chef
      gets repeat orders _without you hand-placing them_, and re-lists because
      it's worth their time.
- [ ] Only then: add chefs across the rest of the county, turn on lighter-touch
      (self-serve) onboarding, and start letting SEO/word-of-mouth carry more.
- [ ] The next _county_ is a Phase-3-of-a-new-region decision, quarters away. Don't
      let breadth tempt you before depth is proven.

---

## 6. The chef-outreach playbook (the part you'll actually run)

**Finding contact info for the 497.** The county's approved-operator list has
names, permit numbers, and cities but often not email/phone. To reach them:
- Many MEHKOs already sell somewhere — search each name on Instagram, Facebook,
  Yelp, Nextdoor, and Google. A large share have a social presence you can DM.
- The permit application/business record may be public via the county; some
  operators list a business phone.
- Cross-reference cottage-food operators with local farmers-market vendor lists.
- Start with the ones easiest to reach; you only need 5–10 yeses to begin.

**The pitch (lead with what's in it for _them_, not for ForkFork):**
> "You did the hard part — you got the county permit. I built a free storefront
> so neighbors can actually _find_ you and pay you online, and you keep 100% of
> your price. I'll set the whole thing up for you myself. Want me to build yours?"

**For the aspiring cook (no permit yet), the door-opener:** "A real home food
business costs under $1,000 to start — versus $400,000 for a restaurant. You've
already got the kitchen. I'll help you get there." (If you build the permit
concierge in §10.2, this becomes a full offer, not just a line.)

**Objection handling:**
- _"I already sell on Instagram / Hotplate."_ → "Keep doing that — this is extra
  discovery from people who _don't_ already follow you, and it's free to try. You
  lose nothing."
- _"What does it cost me?"_ → "Nothing. No listing fee, no commission, no monthly —
  you keep your full price; the buyer pays a small service fee. Every other
  platform takes 15–25% out of _your_ pocket. We take zero from you."
- _"Why should I trust a new platform?"_ → "You don't have to commit — I'll build
  it, you approve it, and you can pause anytime. And I'm local."
- _"I'm already at my meal cap."_ → Great problem; they're validated demand. Still
  worth a listing for the overflow/waitlist and reviews.

**The concierge close:** offer to do everything — photos, description (your AI
helper drafts it), pricing guidance, Stripe setup. Friction kills supply
onboarding; you remove all of it for the first cohort.

---

## 7. Metrics that actually matter (watch these, ignore vanity)

**Leading indicators of a working marketplace — in priority order:**
1. **Activated chefs** — verified _and_ payout-ready _and_ with ≥1 live listing.
   (A signup that never goes live is worth nothing.)
2. **Chef retention / re-listing** — do chefs come _back_ and post again? This is
   the truest signal; it's what Foodnome lost.
3. **Repeat order rate** — % of buyers who order a 2nd time. Home food lives or
   dies on repeat; a one-time novelty order is not a business.
4. **Orders per active chef per week** — is there enough demand to matter to them?
5. GMV and platform revenue — real, but a _lagging_ output of the above. Don't
   optimize these directly.

**Kill-criteria honesty:** if after ~10 activated chefs and a real demand push you
can't get chefs repeat orders they didn't have to source themselves, the wedge
isn't working — revisit fee, geography, or the core bet before spending more.

---

## 8. Accounts & infrastructure (reference)

_Secrets/keys are NOT in this doc — they live in `.env.local` (gitignored) and
each provider's dashboard. This is the map, not the keys._

| Service | Role | Status | Action needed |
|---|---|---|---|
| **Domain** `forkfork.app` | Primary domain | Live, email verified | Confirm registrar login is in your password manager |
| **Render** | Hosting (deploys from GitHub) | Live, **free tier (sleeps)** | **Upgrade to paid** before launch |
| **Supabase** | Postgres + Auth + Storage + RLS | Live, clean DB | — |
| **Stripe (Connect)** | Payments + chef payouts | **TEST mode** | Rotate keys → **go live** + both webhooks |
| **Resend** | Transactional email | Verified `orders@forkfork.app` | — |
| **Groq** | AI (descriptions, photo check) | Live | — |
| **Google OAuth** | Sign-in | Configured | — |
| **GitHub** `kobonrosetta/homeplate` | Source of truth | Active | — |
| **Google Search Console** | SEO/indexing | **Not set up** | Verify + submit sitemap |
| **Analytics** | Product metrics | **None** | **Add one** (Plausible/PostHog/GA4) |
| **Admin console** | `/admin`, gated by `ADMIN_EMAILS` | `kobonrosetta@gmail.com` | — |

**The two biggest infra gaps for GTM: no analytics (you can't see what's working)
and the free hosting tier (the site naps). Fix both in Phase 0.**

---

## 9. Risks & how each one kills you

| Risk | How it kills you | Mitigation |
|---|---|---|
| **Cold-start demand** | Chefs get no orders, churn, you're a ghost town | Concierge-seed the first 50 orders by hand (§5.2); density in one area |
| **Supply too thin/spread** | Buyers see 2 kitchens, nothing near them, bounce | One geography, 5–10 chefs, before widening |
| **Fee vs. free Hotplate** | Chefs with audiences don't need you | Target the _audience-less_ 90%; prove you bring _new_ demand |
| **MEHKO pilot sunsets** | Legal basis for supply vanishes | Confirm permanent status now (§2) |
| **Chef churn** | You refill a leaky bucket forever | Obsess over retention metric #2; make orders worth their time |
| **You run out of patience/energy** | Founder burnout — the real cause of most deaths | It's a "lifetime battle"; set a slow, sustainable pace and small milestones |

---

## 10. Open decisions for you

1. **Business or movement? (decide this first — it sets everything else.)** The
   best-run competitor concluded "movement," went nonprofit, and now _gives_ cooks
   money (grants, free permitting, training). Your lean build lets you run ForkFork
   as a scrappy for-profit _or_ a mission org that survives on grants + goodwill.
   The answer changes your fee model, your funding path (investors vs. grants), and
   how you spend the year. You don't have to pick the extreme — but pick a
   direction on purpose.
2. **Do you build a "permit concierge"? (the biggest product bet.)** Today you only
   _harvest_ the 487 who already have a permit. The survivors' real growth engine
   was _creating_ supply: handling county paperwork for aspiring cooks (Foodnome
   did it free), training them, even granting them money. A concierge — "we get you
   MEHKO-approved, then you're live on ForkFork" — would expand supply beyond the
   fixed list, build deep loyalty, and could be a services revenue line. Real work;
   possibly your best v2. Decide if/when.
3. **Is the buyer-paid 8% + $0.30 fee right for cold-start?** It's clean and chef-
   friendly, but buyers pay a premium in a market where trust isn't established.
   Consider a temporary lower/zero fee for launch to remove buyer friction, then
   raise it once value is proven. (Data from analytics should drive this.)
4. **Which sub-geography first?** San Jose is the obvious cluster (57% of MEHKOs).
   Narrow to a sub-area based on where you personally have demand-side reach.
5. **Delivery or pickup-first?** Pickup is simpler and cheaper to seed; delivery
   widens the radius but adds chef burden. Recommend pickup-first per cluster.
6. **How much to invest in the advocacy / movement angle?** The survivors leaned on
   the _movement_, not just the app. Being the friendly local face of "legal home
   cooking in Santa Clara" — and telling the women/immigrant-founder story — may be
   worth more than ads, and opens press and grants. (Ties to decision #1.)

---

### The one-sentence version
**Work your list, one neighborhood at a time, by hand, slowly, as the trusted
local face of legal home cooking — and let the fact that you can't afford to rush
be the very thing that lets you outlast everyone who tried to.**
