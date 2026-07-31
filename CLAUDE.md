# ForkFork — Agent Orientation

**Read this first.** It's the fastest way to become productive here and to avoid
"helpfully" undoing deliberate decisions. Kobon is the founder/CEO and non-technical:
he owns product and go-to-market ("I worry about getting customers and cooks; you build
the tech"). He wants **blunt, data-backed** guidance — lead with the honest verdict and
the hardest problem, not a feature list.

## What this is

A premium marketplace connecting **county-permit-verified** California home cooks
(MEHKO home kitchens + cottage-food bakers) to local buyers, launching in **Santa Clara
County**. Positioning: the best home kitchens near you, verified against the county's
approved-operator list — *not* a sketchy Facebook group. Cooks keep 100% of their listed
price; buyers pay a service fee (8% + $0.30) on top at checkout.

Current reality: a **complete, working marketplace loop, deployed and live on Render**
(Stripe still test mode) — discover → pay → cook sees the order + buyer contact →
advances status ("I'm on it" → ready → completed) → buyer reviews → inventory deducts
and sells out. The **real Santa Clara County MEHKO + cottage-food permit lists are
loaded** and signup verification runs against them. There are still **zero real cooks** — the demo kitchens
are fake data. The tech is ahead of the business.

## Stack

- **Next.js 14.2.5**, App Router, React 18, TypeScript, server components + server actions.
- **Supabase** — Postgres + Auth (email, Google OAuth, **anonymous** sign-ins for guest
  checkout) + Storage + Row-Level Security.
- **Stripe** — hosted Checkout + webhook + **Connect (Express, destination charges)**
  for automated cook payouts. **Test mode.** (Money flow in gotcha #2.)
- **Resend** — transactional email.
- **Groq** — AI helpers (listing descriptions, photo-quality check).
- **Tailwind** with semantic CSS-variable tokens; **Fraunces** (headings) + **Inter** (body).
  "Warm editorial" visual direction.
- Hosting: **Render** (deploys from the GitHub repo `kobonrosetta/homeplate`). **Live at
  https://homeplate-jyd2.onrender.com** — see `DEPLOY.md`. (The free instance sleeps after
  ~15 min idle.)

> ⚠️ **Stripe and Resend are called via raw `fetch`, not their SDKs** (`lib/stripe.ts`,
> `lib/email.ts`). This is deliberate — do not "upgrade" them to the Node SDKs, and no
> Stripe npm package belongs in `package.json` (checkout redirects server-side to
> Stripe's hosted URL; the unused `stripe`/`@stripe/stripe-js` deps were removed Jul 2026).

## Run & verify

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build — must pass before shipping
npx tsc --noEmit     # type check — must be clean
npm test             # fee-math unit tests (tsx tests/unit.test.ts)
npm run lint
```

Env: copy `.env.example` → `.env.local` and fill keys. **`.env.local` is gitignored and
must stay that way** — it holds live secrets that were shared in chat and **must be
rotated before production**.

Every change should end with a clean `tsc --noEmit` **and** a passing `npm run build`.
For backend/RLS changes, prove them with a live API test (small Python `urllib` script
against the Supabase REST API using the anon key for the attack and the service-role key
for setup). Note: Resend's API blocks the sandbox unless you send a `User-Agent` header.

## Architecture

```
app/                      # App Router — 20 pages, force-dynamic throughout
  page.tsx                # marketing landing (redirects signed-in users to /browse)
  browse/                 # buyer: kitchen grid (only kitchens with in-stock items)
  kitchen/[slug]/         # buyer: a kitchen's menu + reviews
  listing/[id]/           # buyer: single item
  cart/  checkout/  checkout/success/   # cart → Stripe → confirmation
  orders/                 # buyer: "Purchases" (food you ordered) + review form
  dashboard/              # COOK area: overview, menu, listings, orders, payouts, settings, edit
  sell/                   # 3-step cook onboarding wizard (kitchen → dish → permit/address)
  admin/                  # operator console (gated by ADMIN_EMAILS): approvals, payouts, pulse
  verified/               # "what County-verified means" explainer
  (auth)/login, signup    # auth route group
  api/ai/describe, api/ai/photo-check   # Groq (auth-gated)
  api/stripe/webhook      # payment confirmation + Connect account lifecycle (TWO Stripe
                          #   endpoints, one URL: STRIPE_WEBHOOK_SECRET + STRIPE_CONNECT_WEBHOOK_SECRET)
  auth/callback           # OAuth code exchange
lib/
  constants.ts            # FEE MATH lives here: round(subtotal*0.08)+30, formatUsd — unit-tested
  stripe.ts               # fetch-based createCheckoutSession (+ Connect destination-charge params) /
                          #   retrieveSession / verifyStripeSignature / createConnectAccount /
                          #   createAccountLink / retrieveAccount / accountStatus
  connect.ts              # syncCookStripeStatus(): service-role write of cook_stripe + cooks.stripe_ready
  orders.ts               # confirmPaidOrder(): idempotent, deducts stock, emails the cook
  email.ts                # sendEmail (Resend REST, key-safe no-op) + wrapEmail (branded HTML)
  listings.ts             # insertListingFromForm (photo gate + extra photos + allergens), uploadCookAvatar,
                          #   uploadPermitPhoto — ALL storage writes via the service role (paths derived
                          #   server-side from the caller's own cook; Storage-side user-JWT verification
                          #   broke with Supabase's ES256 key migration, Jul 2026)
  ai.ts                   # Groq calls
  cook.ts                 # getCurrentCook()
  match.ts                # county-list matching: normalizePermit, nameMatchTier (advisory), isExpired — unit-tested
  tax.ts                  # CA sales-tax helpers: tax-INCLUDED math, Santa Clara city rates, CDTFA quarters — unit-tested
  admin.ts                # isAdminEmail / getAdminUser (ADMIN_EMAILS env)
  slug.ts                 # slug helper
  supabase/               # client.ts (browser), server.ts (RSC), admin.ts (service-role, SERVER ONLY), middleware.ts
components/               # 18 client components (cart-context, checkout-form, site-header/footer, etc.)
supabase/                # hand-run SQL migrations — see supabase/MIGRATIONS.md
middleware.ts             # refreshes the Supabase session cookie
```

Server actions live in each route's `actions.ts`. Auth/session flows through
`middleware.ts` → `lib/supabase/middleware.ts`.

## Data model (10 tables)

`profiles` (one per person) · `approved_operators` (the county permit list we match against
— the trust hook) · `cooks` (a kitchen; belongs to a profile; `stripe_ready` = can take
orders) · **`cook_private`** (a cook's home address/geo — owner-only, split out for safety) ·
**`cook_stripe`** (Connect account id + onboarding status — service-role only) · `listings`
(items, inventory, photos, allergens) · `orders` (subtotal = cook's cut, service_fee = your
cut, total = buyer pays; contact fields) · `order_items` · `reviews` (tied to a completed
order) · `payouts` (legacy manual cook-payout log, pre-Connect). Full schema:
`supabase/schema.sql`. Applied-migration history + replay instructions:
`supabase/MIGRATIONS.md`.

## Security model — do NOT undo these

Supabase RLS filters **rows, not columns**. That single fact drove several fixes; reversing
them re-opens real vulnerabilities:

- **`cook_private` split.** A cook's street address/geo is in its own owner-only table
  *because* row-RLS on `cooks` couldn't hide a column — the anon key could read addresses
  straight off the REST API. Never move address fields back onto `cooks` or loosen
  `cook_private` RLS. (Verified: anon read returns empty; server-side reveal still works.)
- **Reviews RLS** requires a *completed* order owned by the reviewer for the matching cook —
  blocks forged/ bombed reviews. (Verified: forged insert → 403.)
- **Photo uploads are server-side only** (`lib/listings.ts`): every storage write —
  listing photos, avatars, permit photos — goes through the **service role**, with the
  destination path always derived in code from the authenticated caller's own cook id
  (never from form input) and MIME/size validated first. Do NOT "restore" client-credential
  uploads: bucket RLS is defense-in-depth now, and Storage-side verification of ES256 user
  JWTs has been broken platform-wide since Supabase's Jul 2026 signing-key migration —
  client uploads would silently fail. (Verified live: owner upload works, cross-kitchen +
  anon writes 400.)
- **The `permits` bucket is private and strictly server-controlled** (migration 21): no
  SELECT policy and no end-user write policies at all — a permit photo shows the holder's
  name/address. Admins view via short-lived signed URLs only. Never make this bucket
  public or add end-user policies to it.
- **Orders RLS**: buyers see only their orders; cooks update only their kitchen's.
- **AI routes** require a signed-in user (401 otherwise).
- `lib/supabase/admin.ts` (service-role, god-mode) is **server-only** — never import it into
  a client component.

## Gotchas & deliberate decisions

1. **"County-verified" is real for MEHKO, manual for cottage food.** `approved_operators`
   holds the real Santa Clara County MEHKO list (174 permits, imported 2026-07-24 via
   `scripts/import-mehko.mjs` — re-runnable, upserts on permit number; fake seeds removed
   from the live DB). Signup auto-flags `permit_verified` on a live (non-expired) permit
   match only; the kitchen NAME is deliberately advisory (cooks brand differently from
   their permit name — the admin console shows an exact/partial/none tier), and an optional
   permit-photo upload (private bucket) backs the human review. Cooks can never self-activate
   (migration 17); admin approval is the real gate. The Santa Clara cottage-food list is
   loaded too (323 operators, imported 2026-07-29 via `scripts/import-cottage.mjs`; cottage
   operators carry the same `PT…` permit numbers, so cottage bakers auto-verify on a permit
   match exactly like MEHKO). There is still **no scheduled refresh**: re-run the importers
   manually; say "checked periodically", never "refreshed daily".
2. **Stripe Connect (Express) IS built — destination charges** (migration #33 + the
   Connect PR, Jul 2026). Money flow: buyer pays `total`; `application_fee_amount =
   service_fee` stays with the platform; Stripe auto-transfers the remainder (= the
   cook's full `subtotal`) to their connected account; Stripe's processing cut comes
   out of the platform's fee (net ~4.85%). Key invariants — do NOT undo:
   - **Readiness = the `transfers` capability being active** (+ `payouts_enabled` +
     `details_submitted`), rolled up into `cooks.stripe_ready` by
     `lib/connect.ts syncCookStripeStatus` (webhook + return route). **Never gate on
     `charges_enabled`** — a transfers-only Express account keeps it false forever.
   - The connected-**account id lives in `cook_stripe` (service-role only)**, never on
     the public `cooks` row; `stripe_ready` is the only public flag. It's not in the
     cook-update trigger allow-list, so a cook session can't forge it.
   - Browse/kitchen/checkout/pay all require `stripe_ready` — a kitchen invisible to
     buyers until Express onboarding completes ("Set up payouts" on /dashboard/payouts).
   - **TWO webhook endpoints at the one URL** — a Stripe endpoint delivers platform
     events OR connected-account events, never both. Endpoint 1 ("your account"):
     `checkout.session.completed`, secret `STRIPE_WEBHOOK_SECRET`. Endpoint 2
     ("Connected accounts"): `account.updated` + `account.application.deauthorized`,
     secret `STRIPE_CONNECT_WEBHOOK_SECRET`. The route verifies against either.
     `account.updated` re-fetches the account live (events arrive out of order) and
     a failed sync returns 5xx so Stripe retries; deauthorization clears the stored
     account id so the cook can re-onboard fresh.
   - **Refunds are still manual** and destination charges make naive refunds lose
     money: always `reverse_transfer=true` + `refund_application_fee=true` (the
     admin cancellation email spells this out). The `payouts` table is the legacy
     manual ledger, kept for history.
3. **Payment confirmation has two paths:** the success-page redirect *and* the webhook.
   `confirmPaidOrder` (in `lib/orders.ts`) is idempotent and shared by both. The webhook is
   only live once `STRIPE_WEBHOOK_SECRET` is set (Stripe CLI locally / dashboard at deploy).
4. **Guest checkout** uses Supabase **anonymous** sign-ins; buyers can later claim the account.
5. **Admin access** is gated purely by the `ADMIN_EMAILS` env var (`lib/admin.ts`).
6. **Migrations are run by hand** in the Supabase SQL editor — this is NOT a Supabase-CLI
   project. Log every new one in `supabase/MIGRATIONS.md`. Do **not** enable Supabase's
   GitHub integration (the loose SQL files aren't in its expected `migrations/` format).
7. **Known deferred / cleanup** (see `PROJECT_REVIEW.md`): limited-inventory oversell race
   (low priority at pilot scale) and unused `cooks.latitude/longitude`. (Dead
   `browse-filters.tsx` and the committed `.fuse_hidden*` junk were removed Jul 2026.)
8. **Sales tax is tax-INCLUDED for the pilot** (migration 23, Jul 2026). Hot prepared
   food is CA-taxable (CDTFA Reg. 1603); each cook remits on their own CDTFA seller's
   permit (collected in the wizard, stored on `cook_private` — never move it to the
   public `cooks` table). The taxability flag is `listings.served_hot`, asked as "How
   is it served?" and shown to **MEHKO cooks only** — cottage bakers see zero tax UI
   (cottage law covers only shelf-stable foods). It's snapshotted onto
   `order_items.served_hot` at checkout so later listing edits can't rewrite tax
   history. The dashboard Taxes card + `/dashboard/taxes/export` CSV derive the cook's
   quarterly numbers via `lib/tax.ts`, whose Santa Clara city rates were hand-verified
   against CDTFA on 2026-07-28 — re-check when CDTFA reposts (Jan/Apr/Jul/Oct). Buyers
   see one checkout footnote ("Prices include any California sales tax"), never a tax
   line. The marketplace-facilitator flip (ForkFork collecting tax at checkout) is
   deliberately NOT built — it needs the CPA answer on whether a Santa Clara-based
   facilitator must register regardless of the $500k remote-seller threshold.

## Current status & what's left to launch

Everything through the build + visual polish is **done** — full loop, security batch,
guest checkout, admin console, onboarding wizard, email notifications, fee transparency,
reviews, inventory, payouts view, and the warm-editorial visual pass. **Deployed and live
on Render** (https://homeplate-jyd2.onrender.com): env vars wired, `STRIPE_WEBHOOK_SECRET`
set + the webhook endpoint verified against the live URL, `ADMIN_EMAILS` set, Google OAuth
redirects configured. A second security batch (Jul 23 2026) closed a reopened
review-forgery hole + payout-ledger tampering + checkout-trust bugs — see
`PROJECT_REVIEW.md` and `supabase/harden-orders.sql`. What remains is **not more features**:

1. ~~Load real Santa Clara County permit data~~ ✅ **Done** — 174 MEHKO permits (2026-07-24)
   + 323 cottage-food operators (2026-07-29), permit-gated auto-verify + advisory name tiers
   + optional permit photo + admin review. Both load via re-runnable scripts
   (`import-mehko.mjs` / `import-cottage.mjs`).
2. **Recruit one real cook.** The only thing that tests whether cooks will actually join.
3. **Go fully live:** rotate all secrets (they were shared in chat / a screenshot — still on
   Stripe **test** mode), then switch Stripe to live keys + BOTH live-mode webhook
   endpoints (platform + Connect — see gotcha #2 for the two-secret setup) and
   have the first real cook complete live Express onboarding (real SSN/bank — payouts are
   automated via Connect destination charges; refunds still manual). ~~Verify a Resend
   sending domain~~ ✅ Done 2026-07-30 — `forkfork.app` verified, `EMAIL_FROM` =
   `orders@forkfork.app` (replies alias to `hello@`), Supabase auth email on custom SMTP.

## Companion docs

- `README.md` — human setup guide.
- `PROJECT_REVIEW.md` — verdict, security findings (mostly fixed), roadmap status.
- `UX_TEARDOWN.md` — ranked UX fixes (implemented).
- `VISUAL_POLISH.md` — visual design plan (implemented).
- `supabase/MIGRATIONS.md` — every migration, applied-status, replay order.
