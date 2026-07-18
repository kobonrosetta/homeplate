# HomePlate — Agent Orientation

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

Current reality: a **complete, working marketplace loop on localhost** — discover → pay
(real Stripe test mode) → cook sees the order + buyer contact → advances status → buyer
reviews → inventory deducts and sells out. It has **not** been deployed and has no real
cooks or real permit data yet. The tech is ahead of the business.

## Stack

- **Next.js 14.2.5**, App Router, React 18, TypeScript, server components + server actions.
- **Supabase** — Postgres + Auth (email, Google OAuth, **anonymous** sign-ins for guest
  checkout) + Storage + Row-Level Security.
- **Stripe** — hosted Checkout + webhook. **Test mode.** Connect is NOT built (see gotchas).
- **Resend** — transactional email.
- **Groq** — AI helpers (listing descriptions, photo-quality check).
- **Tailwind** with semantic CSS-variable tokens; **Fraunces** (headings) + **Inter** (body).
  "Warm editorial" visual direction.
- Hosting target: **Vercel** (connect it to the GitHub repo `kobonrosetta/homeplate`).

> ⚠️ **Stripe and Resend are called via raw `fetch`, not their SDKs** (`lib/stripe.ts`,
> `lib/email.ts`). This is deliberate — do not "upgrade" them to the Node SDKs. The
> `@stripe/stripe-js` dependency is only the browser redirect helper.

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
  api/stripe/webhook      # payment confirmation (needs STRIPE_WEBHOOK_SECRET to be live)
  auth/callback           # OAuth code exchange
lib/
  constants.ts            # FEE MATH lives here: round(subtotal*0.08)+30, formatUsd — unit-tested
  stripe.ts               # fetch-based createCheckoutSession / retrieveSession / verifyStripeSignature
  orders.ts               # confirmPaidOrder(): idempotent, deducts stock, emails the cook
  email.ts                # sendEmail (Resend REST, key-safe no-op) + wrapEmail (branded HTML)
  listings.ts             # insertListingFromForm (photo gate + extra photos + allergens), uploadCookAvatar
  ai.ts                   # Groq calls
  cook.ts                 # getCurrentCook()
  admin.ts                # isAdminEmail / getAdminUser (ADMIN_EMAILS env)
  slug.ts                 # slug helper
  supabase/               # client.ts (browser), server.ts (RSC), admin.ts (service-role, SERVER ONLY), middleware.ts
components/               # 18 client components (cart-context, checkout-form, site-header/footer, etc.)
supabase/                # hand-run SQL migrations — see supabase/MIGRATIONS.md
middleware.ts             # refreshes the Supabase session cookie
```

Server actions live in each route's `actions.ts` (8 of them). Auth/session flows through
`middleware.ts` → `lib/supabase/middleware.ts`.

## Data model (9 tables)

`profiles` (one per person) · `approved_operators` (the county permit list we match against
— the trust hook) · `cooks` (a kitchen; belongs to a profile) · **`cook_private`** (a cook's
home address/geo — owner-only, split out for safety) · `listings` (items, inventory, photos,
allergens) · `orders` (subtotal = cook's cut, service_fee = your cut, total = buyer pays;
contact fields) · `order_items` · `reviews` (tied to a completed order) · `payouts` (manual
cook-payout log). Full schema: `supabase/schema.sql`. Applied-migration history + replay
instructions: `supabase/MIGRATIONS.md`.

## Security model — do NOT undo these

Supabase RLS filters **rows, not columns**. That single fact drove several fixes; reversing
them re-opens real vulnerabilities:

- **`cook_private` split.** A cook's street address/geo is in its own owner-only table
  *because* row-RLS on `cooks` couldn't hide a column — the anon key could read addresses
  straight off the REST API. Never move address fields back onto `cooks` or loosen
  `cook_private` RLS. (Verified: anon read returns empty; server-side reveal still works.)
- **Reviews RLS** requires a *completed* order owned by the reviewer for the matching cook —
  blocks forged/ bombed reviews. (Verified: forged insert → 403.)
- **Storage RLS** scopes photo writes to the owner's `{cook.id}/` folder. (Verified:
  cross-kitchen upload → 403.)
- **Orders RLS**: buyers see only their orders; cooks update only their kitchen's.
- **AI routes** require a signed-in user (401 otherwise).
- `lib/supabase/admin.ts` (service-role, god-mode) is **server-only** — never import it into
  a client component.

## Gotchas & deliberate decisions

1. **"County-verified" is currently manual and not backed by real data.** `seed.sql` has
   ~6 *fake* permits; signup auto-approves on a permit-number string match with no name
   check. There is **no "refreshed daily" scraper** (older README copy implied one — it's
   false). Loading the real Santa Clara County approved-operator list + a name match/review
   step is the #1 real blocker. This is the whole trust pitch; treat claims about it honestly.
2. **Stripe Connect is not built.** 100% of every charge lands in the platform account;
   cooks are paid **by hand** for the pilot (the payouts pages track who's owed). `stripe_account_id` is an unused column. Don't assume automated payouts exist.
3. **Payment confirmation has two paths:** the success-page redirect *and* the webhook.
   `confirmPaidOrder` (in `lib/orders.ts`) is idempotent and shared by both. The webhook is
   only live once `STRIPE_WEBHOOK_SECRET` is set (Stripe CLI locally / dashboard at deploy).
4. **Guest checkout** uses Supabase **anonymous** sign-ins; buyers can later claim the account.
5. **Admin access** is gated purely by the `ADMIN_EMAILS` env var (`lib/admin.ts`).
6. **Migrations are run by hand** in the Supabase SQL editor — this is NOT a Supabase-CLI
   project. Log every new one in `supabase/MIGRATIONS.md`. Do **not** enable Supabase's
   GitHub integration (the loose SQL files aren't in its expected `migrations/` format).
7. **Known deferred / cleanup** (see `PROJECT_REVIEW.md`): limited-inventory oversell race
   (low priority at pilot scale), dead `components/browse-filters.tsx`, unused
   `cooks.latitude/longitude`, and test/junk data to purge before launch.

## Current status & what's left to launch

Everything through the build + visual polish is **done** — full loop, security batch,
guest checkout, admin console, onboarding wizard, email notifications, fee transparency,
reviews, inventory, payouts view, and the warm-editorial visual pass. What remains is
**not more features**:

1. **Deploy** — Vercel (from the GitHub repo) + Supabase; wire env vars (set
   `STRIPE_WEBHOOK_SECRET`, verify a Resend sending domain and update `EMAIL_FROM`, set
   `ADMIN_EMAILS`, Google OAuth redirect URLs). **Rotate all secrets** first.
2. **Load real Santa Clara County permit data** into `approved_operators` (+ name-match/review).
3. **Recruit one real cook.** The only thing that tests whether cooks will actually join.

## Companion docs

- `README.md` — human setup guide.
- `PROJECT_REVIEW.md` — verdict, security findings (mostly fixed), roadmap status.
- `UX_TEARDOWN.md` — ranked UX fixes (implemented).
- `VISUAL_POLISH.md` — visual design plan (implemented).
- `supabase/MIGRATIONS.md` — every migration, applied-status, replay order.
