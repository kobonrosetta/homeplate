# Stripe go-live runbook (test → live cutover)

_Produced by the pre-cutover audit (Aug 2026). Read once fully before starting.
Steps tagged **[ORDER-SENSITIVE]** must happen in the listed order — the tag says
why. Phase 0 is safe days ahead while the site stays on test mode; Phase 1 is the
actual flip — block out one quiet evening and do it end to end._

_Already done (don't redo): Render always-on upgrade; forkfork.app attached to
Render and serving; cron workflows point at forkfork.app; the webhook's
livemode fence, session expiry, and the other audit fixes shipped in code._

---

## Phase 0 — Prep (days before; zero risk, site stays on test mode)

**0.1 Stripe account activation** [ORDER-SENSITIVE: nothing live works until
this clears, and Stripe's review can take hours-to-days — start first]
- Stripe Dashboard → **Activate account**: business details, your SSN/DOB (sole
  prop) or EIN, and the **platform's** bank account (your service fees land
  there; chefs' money goes to their own connected accounts automatically).
- Turn on two-factor auth on the Stripe login.

**0.2 Public details + statement descriptor** [ORDER-SENSITIVE: must exist
before the first live charge — the code deliberately sets no descriptor]
- Settings → Business → Public details: name "ForkFork", statement descriptor
  **FORKFORK** (and the shortened descriptor), support email
  `hello@forkfork.app`, support phone.
- Why: with destination charges **you are the merchant of record**. A blank or
  personal-name descriptor produces "who charged me?" disputes, and dispute
  fees come out of your balance.

**0.3 Connect live-mode setup** [ORDER-SENSITIVE: live Express accounts cannot
be created until the platform profile is complete]
- Dashboard (live mode) → Settings → **Connect**: complete the platform-profile
  questionnaire. You'll acknowledge the platform bears losses
  (refunds/chargebacks) on its Express accounts — inherent to this design; yes.
- Settings → Connect → **Branding**: name, logo, brand color. Chefs see this on
  the Stripe onboarding form — unbranded looks scammy to the exact people
  you're recruiting.

**0.4 Domain + auth redirects** (domain itself is already live — verify only)
- Confirm https://forkfork.app serves the app (it does, per Render).
- Supabase → Authentication → URL Configuration: Site URL
  `https://forkfork.app`, and `https://forkfork.app/**` in Redirect URLs (keep
  onrender entries during transition). Google Cloud Console → OAuth client:
  forkfork.app redirect present. Login on the domain breaks without these.

**0.5 Rotate every non-Stripe secret** (all of `.env.local` was shared in chat).
Do it now, on test mode, where a bad paste is harmless:
- **Supabase service-role key**: regenerate → Render `SUPABASE_SERVICE_ROLE_KEY`
  + your `.env.local`. (The anon key is public by design — leave it.)
- **Resend**: revoke old key, create new → `RESEND_API_KEY`.
- **Groq**: rotate → `GROQ_API_KEY`.
- **CRON_SECRET**: new random string → BOTH Render env AND the GitHub Actions
  repo secret. They must match or the order-reminder cron 401s.
- **Google OAuth client secret**: rotate in Google Cloud Console → update in
  Supabase's Google provider settings.
- **ADMIN_EMAILS**: confirm it's exactly your email(s).
- Each Render env save redeploys — batch the edits in one session.

**0.6 Regression check on TEST mode**: one full loop on the live URL with card
`4242 4242 4242 4242` (order → chef email → advance status → review). Proves
the rotated secrets are pasted right BEFORE real money depends on them.

---

## Phase 1 — Cutover (one sitting; order matters throughout)

**1.1 Reset test data + kill stale Connect state** [ORDER-SENSITIVE: test-mode
`acct_…` ids do not exist in live mode]
- Supabase SQL editor → `supabase/reset-test-data.sql` **Block A** (orders etc.).
- Kitchens: either wipe them (**Block B**) — Connect state cascades away — or,
  if you keep ANY kitchen, run **Block C** (`delete from cook_stripe; update
  cooks set stripe_ready = false;`). Otherwise a kept kitchen stays browsable
  with a dead test account id and every live checkout for it errors. Kept
  kitchens simply redo "Set up payouts" in live mode.

**1.2 Create BOTH live webhook endpoints** [ORDER-SENSITIVE: before the key
flip, so live payments never confirm only via the buyer's browser. Dashboard
must be toggled to LIVE mode — test endpoints/secrets never verify live events]
- **Endpoint 1 (payments)**: Developers → Webhooks → Add endpoint → listen to
  "Events on your account" → URL `https://forkfork.app/api/stripe/webhook` →
  events: `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`. Copy its signing secret →
  becomes `STRIPE_WEBHOOK_SECRET`.
- **Endpoint 2 (chef payout status)**: Add endpoint, SAME URL, but "Events on
  Connected accounts" → events: `account.updated`,
  `account.application.deauthorized`. Copy ITS secret (different `whsec_…`) →
  becomes `STRIPE_CONNECT_WEBHOOK_SECRET`.

**1.3 Flip Render env in ONE edit session** [ORDER-SENSITIVE: partial flips are
the dangerous state]
- `STRIPE_SECRET_KEY` → the **live** secret key. Must start with `sk_live_`.
  Do NOT use a "restricted key" (`rk_live_…`) — the app only accepts `sk_`
  keys and will act as if payments aren't configured.
- `STRIPE_WEBHOOK_SECRET` → Endpoint 1's live secret.
- `STRIPE_CONNECT_WEBHOOK_SECRET` → Endpoint 2's live secret.
- `NEXT_PUBLIC_SITE_URL` → `https://forkfork.app` (build-time baked; this
  save's redeploy bakes it).
- Delete `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` if present (the code never reads it).

**1.4 Close the test-mode back door** [ORDER-SENSITIVE: same sitting as 1.3]
- Toggle Dashboard to TEST mode → Webhooks → **delete** both test endpoints
  pointing at the production URL.
- Still in test mode → API keys → **roll the test secret key** (it was shared
  in chat). (The code's livemode fence also ignores cross-mode events now, but
  don't rely on one layer.)

**1.5 Post-deploy verification (5 minutes)**
- https://forkfork.app loads; Google + email sign-in work.
- Render logs clean on boot.
- Stripe (live) → Webhooks → send a test event to Endpoint 1 → 2xx.

---

## Phase 2 — First live chef + the $1.38 smoke test (real money, small stakes)

**2.1 Live Express onboarding**
- As the first chef (you, or your recruit): `/dashboard/payouts` → "Set up
  payouts with Stripe" → complete LIVE onboarding (real SSN, DOB, bank).
- Verify: Endpoint 2 shows `account.updated` deliveries with 200s; the kitchen
  appears in /browse only after onboarding completes AND admin approval. If
  `stripe_ready` never flips, check Endpoint 2's delivery log first.

**2.2 The $1.38 smoke test**
- Create a $1.00 listing. In an incognito window, buy it with a REAL card.
- Expected math: subtotal $1.00 + fee (round(8¢)+30¢ = $0.38) = **$1.38**.
- Verify every leg: buyer sees "Order confirmed"; card statement (pending)
  reads FORKFORK; Stripe live Payments shows $1.38 with application fee $0.38;
  the connected account's balance shows +$1.00; Endpoint 1 delivered with 200;
  chef email arrived from orders@forkfork.app; order in /dashboard/orders;
  inventory deducted. Advance "I'm on it" → ready → completed; leave a review.
  That's the whole loop, live.

**2.3 The refund drill** — practice on this $1 order, BEFORE a customer needs one
- Stripe live Dashboard → the $1.38 payment → Refund → check BOTH boxes:
  **Reverse transfer** AND **Refund application fee**. (API fallback:
  `POST /v1/refunds` with `payment_intent`, `reverse_transfer=true`,
  `refund_application_fee=true`.)
- Verify: buyer refunded $1.38; connected account −$1.00; your fee returned.
  Stripe keeps its processing cut (~$0.36) — the known cost of any refund.
  Forgetting reverse_transfer = the chef keeps their cut and the platform
  silently pays for the refund.

**2.4 Aftercare**
- Calendar: re-run `scripts/import-mehko.mjs` + `import-cottage.mjs` monthly
  (permit lists have no scheduled refresh); re-check `lib/tax.ts` city rates
  when CDTFA reposts (Jan/Apr/Jul/Oct).
- Watch Stripe's live Webhooks page for failed deliveries the first week.

---

### Accepted risks (known, deliberate — revisit post-pilot)
- **No pinned Stripe-Version header**: requests use the account's default API
  version. The fields the code reads are long-stable; the $1.38 smoke test
  exercises the real version end to end. Pin one later if Stripe upgrades bite.
- **Cross-order stock decrement isn't atomic** (read-modify-write): the
  35-minute session expiry + the oversell admin alert shrink the practical
  window to near-zero at pilot scale.
- **Orphaned pending orders** (abandoned checkouts) accumulate quietly with
  buyer contact info; harmless, invisible to chefs, worth a cleanup cron someday.
- **Pay-link deposits settle the balance off-platform by design** (cash at
  pickup) — no fee, no record of the second half. Intentional for the pilot.
