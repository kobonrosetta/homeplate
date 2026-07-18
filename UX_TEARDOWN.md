# HomePlate — Expert UX Teardown (both sides)
_July 2026 · grounded in your actual screens + researched marketplace patterns (Airbnb, DoorDash/Uber Eats, Etsy, Shef, Stripe, Baymard Institute, Nielsen Norman Group). Effort tags: S = hours, M = a session, L = multi-session._

## Verdict

The bones are genuinely good — trust framing is on the landing page, the cook has a real workspace, the buyer flow works end to end. The gaps that matter most aren't polish; they're **three friction/leak points that quietly cost you buyers, cooks, and orders**, plus a set of trust upgrades that are cheap and high-return. Ranked below by impact-per-effort.

---

## TIER 1 — Fix before you put real buyers or cooks on it

### 1. ✅ DONE (Jul 2026) — Checkout forces an account *before* paying — the single biggest conversion leak  · **M**
_Shipped: no login wall at `/checkout`; guests pay via Supabase anonymous sign-in + `orders.contact_email`; optional one-tap account-claim on the success page. Backend verified live (guest creates order under RLS, sees only their own). Front-end click-through pending._
**Now:** `/checkout` bounces anyone not signed in to `/login`. A first-time buyer who found a cook, added to cart, and hit checkout is stopped cold and told to make an account.
**Experts:** Forcing account creation is a top-tier abandon driver — **19–24% of shoppers abandon** specifically because a site made them register (Baymard; NN/g: "sites that add guest checkout immediately realize increased sales"). The fix isn't to drop accounts — it's to **let them pay as a guest, then offer to create the account on the confirmation page**, where you already have their name/email/phone and only need a password. 84% of sites get this wrong.
**Fix:** Guest checkout by default. Capture the account *after* payment (one tap on the success page). You keep order history + reviews (the reasons you wanted accounts) without the upfront wall.
**Why:** This reverses a call we made earlier — and the data says our earlier call is leaving money on the table. Highest-leverage change on the buyer side.

### 2. ✅ DONE (Jul 2026) — Cook onboarding gates entry on the permit and is one long form  · **L**
_Shipped: `/sell` is now a 3-step, save-and-resume wizard (kitchen basics → first dish → permit + address) with a progress tracker, verification LAST, and cooks land in "pending" and build their menu while under review; the email-gated `/admin` console approves them. Wizard DB path verified live (create pending kitchen with no permit → add dish → finalize; stays hidden from buyers until approval)._
**Now:** `/sell` is a single long form; on submit the kitchen either goes live instantly (permit string-matches) or lands in `pending` with no real "under review" experience. Nothing to do while waiting; no save/resume.
**Experts:** The strongest onboarding pattern is the opposite — **don't gate the front door on verification.** Uber Eats/DoorDash collect basics first and verify *after* the seller is committed; Airbnb uses a 3-phase, save-and-resume wizard; Stripe's incremental model keeps sellers productive while "under review." Etsy lets you build the whole shop before the final publish.
**Fix:** Let a cook sign up and **build their kitchen + listings immediately**, with the permit match running as a parallel "under review" state (this also pairs perfectly with the verification hardening we discussed: match → pending → you approve). Break the form into a short staged flow ("Tell us about your food → Add your first dish → Get verified & go live") with a visible step tracker. Before the permit step, say exactly what's needed and why + an expected review time.
**Why:** This is your supply side. Every cook who bounces off a long gated form is a kitchen you don't have.

### 3. ✅ DONE (email; Jul 2026) — There are no order notifications — a cook only knows they sold something if they're staring at the tab  · **M–L**
_Shipped: email via Resend (`lib/email.ts`, key-safe). Cook emailed on a new paid order (`confirmPaidOrder`), admins emailed on a new kitchen application (`wizardFinalize`), buyer emailed when an order is marked ready (`advanceOrder`). Verified a live send (HTTP 200). SMS deliberately deferred (Twilio + A2P 10DLC cost/friction). Note: until a domain is verified at deploy, Resend only delivers to the account's own address._
**Now:** Orders appear in My Kitchen → Orders, but nothing pings the cook. No email, no SMS.
**Experts:** Missed orders are *the* known failure mode of food platforms; DoorDash/Uber Eats explicitly warn that in-app alerts alone are unreliable and layer **redundant channels (push + SMS + email) plus an explicit accept step** so an unseen order can't silently lapse.
**Fix:** Email the cook the instant an order is paid (and the buyer when it's marked ready). This is the milestone we deferred — it's Tier 1 for real operations.
**Why:** One missed order = one furious buyer + one refund + a cook who doesn't trust the platform. Make-or-break.

---

## TIER 2 — High impact, mostly cheap

### 4. ✅ DONE (Jul 2026) — The service fee only appears at the cart — surface it earlier (and there's a CA legal angle)  · **S–M**
_Shipped: a reusable `FeeNote` discloses "8% + $0.30 service fee" on browse, the kitchen page, and the listing page (with an all-in per-item estimate); cart/checkout rows relabeled; all-in total still shown before payment. SB 478 remains a "confirm with counsel" item, but the fee is now conspicuous before commit._
**Now:** Buyers see the 8% + $0.30 for the first time in the cart. Browse/kitchen/listing show only the item price.
**Experts:** Surprise fees are the **#1 fixable abandonment reason (39%)**, and another **14% abandon because they couldn't see the total up-front** (Baymard). NN/g: nonstandard *service* fees should be disclosed on the listing page, not sprung at checkout. **Legal flag (confirm with counsel):** California's SB 478 "honest pricing" law (in effect July 2024) requires mandatory fees to be shown in the displayed price — directly relevant to a Santa Clara launch.
**Fix:** Show the fee as a plain-language line the moment it's relevant, and label it ("Service fee — supports vetting & support"). Keep the all-in total visible before the buyer commits.
**Why:** Conversion *and* compliance.

### 5. ✅ DONE (Jul 2026) — Cook Overview shows listing counts, not money or what needs doing  · **M**
_Shipped: Overview now leads with "Earned $X on completed orders" + a ranked Top Tasks list (new orders to prepare, add first dish, orders ready, sold-out items, no visible listings), each a deep link. Doubles as a never-miss backup for order notifications._
**Now:** The dashboard Overview surfaces "Listings / Visible / Status." Useful once, ignored after.
**Experts:** The best seller homes (Etsy Shop Manager) lead with **a health number (recent revenue)** then a **prioritized "Top Tasks" list** — the new order to accept, the payout action needed, the listing that's out of stock. Charts as bars/lines only, never pie/gauge (NN/g).
**Fix:** Overview = "You've earned $X" + a ranked task list, with **"You have N new orders"** at the top when there are any. It becomes the screen a cook checks every morning.
**Why:** Drives engagement and doubles as never-miss backup for #3.

### 6. ✅ DONE (Jul 2026) — "County-verified" is asserted but never explained  · **S**
_Shipped: a `/verified` explainer page (matched to Santa Clara County's approved list · real MEHKO/Cottage Food permit on file · human-reviewed before live · what it guarantees), linked from the browse trust strip, the kitchen-page badge, and the homepage hero badge._
**Now:** The badge and "Verified, not sketchy" copy state it; nothing tells a nervous first-time buyer *what* it means.
**Experts:** Shef pairs its safety badge with a short, concrete process walkthrough — specifics read as competence, fear-language reads as risk. Naming the actual authority ("Santa Clara County") beats a vague "verified" (institutional-trust research).
**Fix:** A small "What County-verified means" explainer (matched to the county's approved-operator list · permit on file · what that guarantees), in plain, positive language. Name Santa Clara County explicitly.
**Why:** This is home food from a stranger — the whole sale hinges on this feeling real. Cheapest trust win on the board.

---

## TIER 3 — Medium; do as you polish

### 7. ✅ DONE (Jul 2026) — Reviews show only an average + a list  · **M**
_Shipped: `components/reviews-section.tsx` — a clickable ratings-distribution bar (5★→1★ with counts) shown at ≥5 reviews, filters the list by rating; newest-first; negatives/star-only reviews visible; simple list below 5 (cold-start)._
**Experts (Baymard):** the ratings **distribution bar chart** is the most-used part of a review section — show it (clickable as star filters), **display negative reviews** (all-positive reads as fake; 53% seek out the negatives), and **sort by recency**. Keep hiding it under ~5 reviews (you already show "New kitchen" — correct for cold-start).
**Fix:** Add a distribution bar + recency sort once a kitchen crosses ~5 reviews.

### 8. ✅ DONE (Jul 2026) — One photo per listing, and no allergen field  · **M**
_Shipped: `photo_urls[]` + `allergens` on listings; form has "More photos" (up to 4, each AI-gated) + an allergens field; listing page shows a cover+thumbnail gallery (`components/photo-gallery.tsx`) and a "Contains:" line. Migration: supabase/add-listing-photos-allergens.sql._
**Experts:** Item photos are the single biggest conversion lever (DoorDash: **+44%**); multiple angles + a lifestyle shot beat a single hero (Etsy). And AI can't know ingredients — for *food*, allergens must be cook-confirmed, never AI-guessed.
**Fix:** Allow multiple photos; add an explicit allergens/ingredients field the cook fills (don't let the AI description stand in for it).
**Why:** Appetite + safety, the two things that sell food.

### 9. ✅ DONE (Jul 2026) — Kitchens have a bio but no face  · **S–M**
_Shipped: wired the unused `cooks.avatar_url` — optional photo upload in wizard step 1 + Settings (`uploadCookAvatar`, no food gate), circular avatar shown next to the kitchen name with the bio as the story. No migration._
**Experts:** Etsy/Airbnb — "people buy from people"; a maker photo + short story materially lifts trust. Your schema already has an unused `avatar_url`.
**Fix:** Add a cook photo + one-line story to the kitchen page header.

### 10. ✅ DONE (Jul 2026) — Payouts is a dead stub  · **S**
_Shipped: `/dashboard/payouts` now shows the cook their Earned (completed orders) / Paid / Owed + a pilot note + payment history (read from the payouts ledger). **All 10 teardown items complete.**_
**Now:** "Payouts aren't set up yet" — a dead end a cook will click.
**Experts:** Stripe Express shows total / on-the-way / available-soon / **next arrival date** — it answers "when do I get paid?".
**Fix (pilot version):** Even before Stripe Connect, show "You've earned $X across N orders — payouts handled directly during our pilot." Not a dead end; sets expectations.

---

## LATER — right call to defer, revisit when you have supply/volume

- **Browse filters + sort** (cuisine, dietary, pickup vs delivery, distance, "ready soonest"). Baymard: provide a filter for every attribute on a card, and invest in sort. Premature at ~3 live kitchens; essential by ~20. **[L]**
- **Money-back guarantee + real numbers on the landing page** (Shef's "Love it or it's on us" + "millions of meals"). You have no numbers to show yet — add when you do. **[S]**
- **A "Verified Pro" tier with published criteria** (Airbnb Superhost: 4.8+, N orders, response rate — and it earns those sellers ~29% more). Needs a base of cooks + reviews first. **[M]**

---

## If you only do three things
1. **Guest checkout** (#1) — stops the biggest buyer leak.
2. **Ungate + stage cook onboarding** (#2) — stops the biggest supply leak.
3. **Order notifications** (#3) — stops the operational disaster.

## Sources
Airbnb Trust & Safety / host onboarding · DoorDash & Uber Eats merchant + menu UX · Etsy Seller Handbook / Shop Manager · Shef food-safety · Stripe Connect (Express Dashboard, identity verification) · Baymard Institute (checkout, cart abandonment, product lists, ratings distribution) · Nielsen Norman Group (guest checkout, fees, dashboards, wizards, empty states, status trackers). Full URLs available on request.
