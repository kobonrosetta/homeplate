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

- **Next.js 15.5.29**, App Router, **React 19**, TypeScript, server components +
  server actions. (Moved from 14.2.35 in Nov 2026; gotchas #10 and #11 say why and
  what that move must not lose.)
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
npm run check:build  # after a build: scans .next for patterns the minifier corrupted (gotcha #9)
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
  page.tsx                # marketing landing / home — renders for everyone (the logo
                          #   returns here); login lands signed-in users in /browse
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
  refunds.ts              # refundOrderNow() + reinstateCancelledOrder(): the ONLY refund / un-cancel paths
                          #   (cook buttons, admin console and the sweep all call these) — SERVER ONLY
  refund-hold.ts          # pure rules of the 24h refund hold on a cook-cancelled order — unit-tested
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
orders; `archived_at` = admin-archived, hidden but records kept) · **`cook_private`** (a
cook's home address/geo — owner-only, split out for safety) ·
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
- **Cook-triggered refunds are still server-authored.** A cook session can change
  ONLY an order's status (trigger `orders_guard_update`); `refunded_at`,
  `cancelled_at`, `refund_claimed_at` and `refund_failed_at` are written by the
  service role or a trigger. The cook's "Refund now" / "Undo cancel" actions prove the session, then
  `lib/refunds.ts` re-checks that the order belongs to that cook's kitchen and is
  CANCELLED before the service role touches it. Don't add a client-side or
  cook-session write to any of those columns.
- **`order_items` are server-authored** (migration 35): end users have **no INSERT
  policy** — both checkout paths write line items via the service role from
  authoritative DB prices. Do NOT restore a buyer-session `order_items` insert or a
  client INSERT policy: the old policy never checked that `listing_id` belonged to the
  order's cook, so a buyer could inject a competitor's limited-inventory listing into
  their own order and zero that cook's stock on payment (verified live). `confirmPaidOrder`
  also guards stock writes on `listing.cook_id === order.cook_id`.
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
   - **Every refund goes through ONE routine** — `lib/refunds.ts refundOrderNow`
     (→ `lib/stripe.ts createRefund`, which always sets `reverse_transfer=true` +
     `refund_application_fee=true`; a naive refund on a destination charge leaves
     the cook their cut and the platform eating the whole refund). Never call
     Stripe's refund from anywhere else, and never refund by hand in the Stripe
     dashboard without both flags. Full refunds only. The `payouts` table is the
     legacy manual ledger, kept for history.
   - **A cook's cancel starts a 24-hour refund hold** (migration 45, Nov 2026;
     rules in `lib/refund-hold.ts`, unit-tested). During the hold the cook's
     Orders tab offers "Undo cancel" and "Refund now"; after it, the sweep
     `/api/cron/refund-cancelled` (a second step in the order-reminders and
     announce-dishes workflows) sends the refund. Before this, refunds waited
     on an admin click and buyers waited up to a week. The admin console can
     still Refund any paid order and Reinstate a cancelled one; refunds of
     COMPLETED orders, and of cancels that predate the hold, stay admin-only.
     Do NOT undo these (each is covered by `tests/refund-hold/` — run those
     before touching this code; they need `npm i --no-save @electric-sql/pglite`):
     - `refundOrderNow` **claims the order (`refund_claimed_at`) BEFORE asking
       Stripe**, and the undo (`reinstateCancelledOrder`) refuses a claimed
       order. That ordering is the only thing stopping "buyer refunded AND
       order back on". If Stripe clearly says no the claim is released; if we
       can't tell, it is KEPT and the sweep finishes the refund later — on
       ANY order, cancelled or not (an admin's refund of an active order can
       time out too).
     - The refund is recorded and an un-fulfilled order cancelled **in one
       write** (`refunded_at` + `status`), so a crash can't leave an order
       refunded yet active.
     - `orders.cancelled_at` is stamped by a DATABASE TRIGGER
       (`orders_stamp_cancelled_at`), never by the app; the sweep never
       refunds an order without it, and re-checks "hold still over" in the
       same write that claims the order. The trigger's name must keep sorting
       after `orders_guard_update` (Postgres fires them alphabetically).
     - After a failed attempt (`refund_failed_at`) the sweep leaves that order
       alone for 12 hours and puts never-failed orders first — without this
       a refund Stripe keeps refusing is retried, and the admins emailed, on
       every run.
     - The code works with OR without migration 45 (deploy and SQL can land in
       either order): without the columns, refunds are an admin click exactly
       as before, and the emails say so. The "columns are missing" test
       (`isMissingHoldColumn`) is deliberately narrow — any other database
       error must fail closed, never fall back to the unguarded path.
     - The cook's two actions pass `heldOnly` (only cancels stamped under the
       hold) and send the cook back with a REASON CODE that the page words
       itself; Stripe's error text goes to the admins, never into a URL.
3. **Payment confirmation has two paths:** the success-page redirect *and* the webhook.
   `confirmPaidOrder` (in `lib/orders.ts`) is idempotent and shared by both. The webhook is
   only live once `STRIPE_WEBHOOK_SECRET` is set (Stripe CLI locally / dashboard at deploy).
4. **Guest checkout** uses Supabase **anonymous** sign-ins; buyers can later claim the account.
5. **Admin access** is gated purely by the `ADMIN_EMAILS` env var (`lib/admin.ts`); every
   admin write runs through the service role AFTER the `getAdminUser()` gate. The console is
   `/admin` (list) + `/admin/kitchen/[id]` (full detail): status lifecycle
   (approve/pause/suspend/reactivate/send-to-review, decoupled from a manual verified-badge
   toggle), **Archive** (hide + keep records — for kitchens with orders; hard-delete stays
   0-order-only), field editing (`updateCookFields`, whitelisted columns — not slug/money),
   and listing/review moderation. Actions live in `app/admin/actions.ts`, shared UI in
   `app/admin/ui.tsx`.
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
9. **Patterns are regex LITERALS only — never `new RegExp(...)` built from a string —
   and the production build is the thing to test.** Next 14.2.5's minifier can fold a
   template string such as `` `\\b${MONTHS}…` `` into a plain string literal and write
   its `\\b` as `\\\b` (a backslash plus a BACKSPACE character). The pattern then
   matches nothing — in the built SERVER code only; `next dev`, the unit tests (tsx)
   and the browser bundle all keep working. That is how holiday pickup days shipped
   broken on Nov 24 2026 and stayed broken for a day: the live server recognized no
   dated pickup line, so the dashboard kept offering a day the cook had already added
   (Chef Q tapped it four times), the storefront dumped her raw lines, "Get it" lost
   the weekly schedule, and checkout refused the holiday time slots the browser
   offered. Do NOT undo:
   - every pattern in `lib/availability.ts` is written out as a literal, the day-name
     alternation repeated in each (keep the copies identical);
   - `tests/unit.test.ts` fails on any `RegExp(` call in `app/`, `components/`, `lib/`
     or `middleware.ts`;
   - `npm run check:build` (`scripts/check-build.mjs`) scans a finished build for the
     damage itself — run it after `npm run build`;
   - repeated pickup lines are harmless by construction: `activePickupWindows` drops a
     block that repeats an earlier one, and `expandPickupWindows` /
     `pickupScheduleSummary` never return the same text twice.
   **Anything a buyer or cook sees must be checked on the real build** —
   `npm run build && npx next start -p 3457`, then load the page — not only through
   tsx or `next dev`. Server and browser run DIFFERENT compiled copies of `lib/`, so
   also check that what the browser offers is what the server accepts.
10. **Images are the attack surface; the framework is on a dead-end line (Nov 2026).**
    `npm audit --omit=dev` on Nov 27 2026 showed 38 published notices against
    `next` 14.2.5 (4 rated critical) plus two against `sharp`. The serious ones were
    remote-code holes in the image libraries (`libheif` for AVIF, `librsvg` for SVG)
    that `sharp` bundles, reachable on this site three ways. All three are closed,
    and each closure is deliberate — do NOT undo:
    - **The built-in image resizer is OFF** (`next.config.mjs`: `images.unoptimized`
      true, no `remotePatterns`). The site never used it (plain `<img>` tags; photos
      are resized once, at upload), but it was live at `/_next/image` with a leftover
      `*.supabase.co` allowance, so anyone could make the server download and decode
      an image from ANY Supabase project. It must answer 404.
    - **Only real JPEG, PNG or WebP bytes are ever decoded.** `lib/image.ts
      sniffPhotoFormat` checks the first bytes before `sharp` sees a file (`sharp`
      picks its decoder from the bytes, whatever type the upload claimed, and anyone
      can open a cook account and upload a "photo"). The kitchen share-card route
      (`app/kitchen/[slug]/opengraph-image.tsx`) applies the same gate and only
      fetches photos from our own storage address. Unit-tested with real AVIF, TIFF,
      GIF and SVG files.
    - **`sharp` stays at 0.35.5 or newer** (the release with the fixed libraries).
    Updating `next` to 14.2.35 closed 12 of the 38 (including the middleware login
    bypass, which never applied here: pages check the login themselves). **26 remain
    by version number and are only fixed in Next 15.5.29 or newer, or the current 16.4
    line (npm suggested 16.4.6).** Of those, the
    ones that still apply to this site are the "knock the site over" kind (crafted
    requests against Server Actions / Server Components that pin the CPU) and a
    request-forwarding hole in the built-in server's WebSocket upgrade handling; the
    rest need features this site doesn't use (rewrites, Pages Router with i18n, a
    custom server, Windows hosting, security-policy nonces, the edge runtime). Moving
    to Next 15/16 is a real migration (React 19, `params` / `searchParams` /
    `cookies()` become async in every page) — plan it as its own piece of work and
    verify it the way gotcha #9 says. Still open and smaller: nothing in the database
    limits `photo_url` / `avatar_url` / `cover_url` to our own storage address, and
    the share-card route's database answer is saved by Next until the next restart
    (so the card's photo can go stale).
11. **Next 15.5.29 + React 19 (moved from 14.2.35, Nov 2026).** Done to get onto a
    framework line that still receives security fixes (gotcha #10). What the move
    changed, on purpose — do NOT undo:
    - `params` / `searchParams` are awaited in every page, and `headers()` in the
      four actions that use it (the official codemod plus hand fixes).
    - `lib/supabase/server.ts`: `createClient()` stays SYNCHRONOUS; its two cookie
      hooks are async and wait for `cookies()`. Do not make `createClient()` async —
      42 call sites would need an `await`, and a missed one is a signed-out page.
    - `next.config.mjs` `htmlLimitedBots: /.*/`: every visitor gets `<title>` and
      the `og:` share tags inside `<head>`, as on Next 14. The Next 15 default sends
      them later in the page for everyone except a built-in list of preview robots.
    - **`app/dashboard/loading.tsx` is GONE and must stay gone.** On Next 15.5.29 a
      route-level loading screen above a form whose action ends in `redirect()`
      makes the browser drop the redirect: the action runs on the server, answers
      303 with the full page data, and the page just sits there. Measured on the
      holiday button: 8 of 8 taps lost with the file, 8 of 8 fine without it; Chrome
      and WebKit both; `experimental.staleTimes` and the title setting made no
      difference. Almost every dashboard button ends in a redirect, so this is the
      "button did nothing" failure that made the cook tap four times in November.
      `components/dashboard-tabs.tsx` shows a small spinner on the tapped tab
      instead (`useLinkStatus`). The other loading screens (`browse`,
      `kitchen/[slug]`, `listing/[id]`) have no redirecting action beneath them;
      do not add one without re-running the tap test.
    - How it was tested without any real sign-in: two scratch copies of the site
      (old and new framework), each with `lib/supabase/server.ts`,
      `lib/supabase/admin.ts` and `lib/admin.ts` swapped for a READ-ONLY stand-in
      that acts as the kitchen's owner, then real buttons tapped in a real browser
      and the two compared. The stand-in must call `cookies()` like the real
      client, or the framework treats the pages differently and the result lies.
      Never run `next dev` in a folder whose production build is being served: it
      overwrites `.next` and the running site turns into a dead page.
    - It was also tested with ONE real sign-in: a throwaway pending kitchen
      ("ZZ Test, delete me", approved by Kobon, created and deleted the same night)
      on a local production build — sign up, start a kitchen, every dashboard page,
      tab taps, save settings, add / hide / show / delete a dish, sign out, sign in
      again, in WebKit and in Chrome. A real upload was NOT part of that pass (the
      upload code path ran only against the stand-in).
    - Two things a cook or buyer can notice: tapping a dashboard tab no longer
      flashes a grey placeholder (the tab shows a spinner and the page appears when
      it is ready), and a browser tab left open across a deploy must be reloaded
      before its buttons work (Next 15 gives every build new action ids).
    - `npm audit --omit=dev` now shows only Next's own bundled copy of postcss,
      which runs at build time on our own stylesheet. Next 15.5 is the "backport"
      line; the next hop is Next 16 (Turbopack by default, `middleware.ts` →
      `proxy.ts`, ESLint flat config, Node 20.9+). Every request API here is
      already fully async, which is the bulk of that hop.
    - Slow-connection trap for whoever tests next: on Nov 27 this laptop's
      connection stalled ~30 s on about one request in eight (Google and the live
      site included). Judge a tap by whether its result ARRIVES, record when each
      answer finishes (not when its first bytes come), and compare against the old
      version under the same connection before calling anything a regression.

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
3. **Go fully live:** follow **`STRIPE_GO_LIVE.md`** (the audited, ordered cutover
   runbook). In short: rotate all secrets (they were shared in chat / a screenshot — still on
   Stripe **test** mode), then switch Stripe to live keys + BOTH live-mode webhook
   endpoints (platform + Connect — see gotcha #2 for the two-secret setup),
   **wipe the pre-launch test data** (run `supabase/reset-test-data.sql` by hand in
   the SQL editor — clears test orders/payouts so the admin + chef dashboards start
   at zero; deliberately NO destructive button in the UI), and
   have the first real cook complete live Express onboarding (real SSN/bank — payouts are
   automated via Connect destination charges; refunds: see gotcha #2). ~~Verify a Resend
   sending domain~~ ✅ Done 2026-07-30 — `forkfork.app` verified, `EMAIL_FROM` =
   `orders@forkfork.app` (replies alias to `hello@`), Supabase auth email on custom SMTP.

## Companion docs

- `README.md` — human setup guide.
- `PROJECT_REVIEW.md` — verdict, security findings (mostly fixed), roadmap status.
- `UX_TEARDOWN.md` — ranked UX fixes (implemented).
- `VISUAL_POLISH.md` — visual design plan (implemented).
- `supabase/MIGRATIONS.md` — every migration, applied-status, replay order.
