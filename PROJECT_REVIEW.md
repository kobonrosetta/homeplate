# ForkFork — Project Review & Launch Checklist
_July 2026 · reviewed against the working codebase, not from memory_

## Verdict

The full marketplace loop works end to end: discover → pay (real Stripe test) → cook sees the order with contact → advance to completed → buyer reviews → rating shows → inventory counts down and sells out. Fee math is correct and unit-tested, client prices can't be tampered with, the photo gate and order confirmation are solid. That is genuinely further than most ideas ever get.

**What exists is live on Render with the real Santa Clara County MEHKO permit list loaded (174 permits) — verification is genuine for MEHKO kitchens.** The distance from here to "a stranger buys real food from a real cook" is not more features — it's recruiting one real cook, replacing the fake demo kitchens, rotating the shared secrets, and switching Stripe from test to live. The tech is now well ahead of the business.

---

## What's solid (don't re-spend time here)
- Fee math `round(subtotal*0.08)+30`, unit-tested (`lib/constants.ts`, `tests/unit.test.ts` — 9/9 pass).
- Checkout re-reads authoritative prices from the DB; cart prices are display-only. No price tampering.
- Service-role key is server-only (`lib/supabase/admin.ts` used only in a server component).
- Order confirmation is idempotent; photo-quality gate is enforced server-side.

---

## CRITICAL — do not put real cooks or real money on this until fixed

- [x] **Cook home addresses are public.** ✅ FIXED (Jul 2026) — split into owner-only `cook_private`; verified the public key now gets HTTP 400 / empty, server reveal still works. RLS filters rows, not columns, so the browser's anon key can read `street_address` + `latitude/longitude` straight from the REST API (`cooks` policy, `schema.sql:149`). The UI hiding it is not a security boundary. For home-based cooks this is a physical-safety/PII leak. Fix: split private columns into a separate table or a `public_cooks` view; lock the base table to owner-only.
- [x] **No Stripe webhook.** ✅ BUILT (Jul 2026) — `/api/stripe/webhook` with signature verification + shared idempotent confirm/deduct logic (`lib/orders.ts`). **Not live until `STRIPE_WEBHOOK_SECRET` is set** (Stripe CLI locally / dashboard endpoint at deploy). Payment was confirmed only on the success-page redirect (`app/checkout/success/page.tsx`). If a buyer pays but never lands there (closed tab, dropped connection), Stripe keeps the money, the order stays `pending` forever, the cook never sees it, nothing ships, inventory never moves. Fix: handle `checkout.session.completed` server-side.
- [x] **No payout rails.** ✅ BUILT (Jul 2026) — Stripe **Connect (Express)** with destination charges: each order's `application_fee_amount` keeps ForkFork's fee and auto-transfers the cook their full subtotal at charge time. The account id lives in the service-role-only `cook_stripe` table (migration #33 — **not yet run**; it also drops the old unused public `stripe_account_id` column); `/dashboard/payouts` is the cook's onboarding hub; kitchens stay hidden until payout-ready; the manual-payout ledger was retired (recording one now would double-pay). Refunds remain manual — reverse the transfer + refund the application fee (the admin email spells it out).
- [ ] **Rotate all secrets.** Live keys are in `.env.local` and were shared in chat — Supabase service-role (full god-mode), Stripe secret, Groq, DB password. Rotate before production.

## HIGH

- [x] **"County-verified" was backed by 5 fake permits** with no name check. ✅ FIXED (Jul 2026) — the real Santa Clara County MEHKO list (174 permits) is imported via `scripts/import-mehko.mjs` (fake seeds removed from the live DB); auto-verify requires a live, non-expired permit match; the kitchen name is a tiered *advisory* signal for the reviewer (never a disqualifier — cooks brand differently from their permit name); an optional permit-photo upload (private bucket, admin-only signed-URL view) backs the human review; and migration 17 makes admin approval the unforgeable gate. Cottage-food list still not imported (bakers reviewed by hand); refresh remains manual re-run, no scraper.
- [x] **Reviews can be forged / review-bombed via the API.** ✅ FIXED (Jul 2026) — stricter RLS requires a completed order owned by the reviewer with matching cook; verified a live forged-review attempt returns HTTP 403. RLS only checks `buyer_id = auth.uid()` on review insert — not that the order is real, completed, or the reviewer's, and a user can spawn free orders against any `cook_id`. A competitor could 1-star bomb a kitchen. Fix with a stricter RLS policy (or a SECURITY DEFINER function).
  - [x] **REOPENED + REFIXED (Jul 23 2026 review):** the fix above was bypassable — the orders INSERT policy didn't pin `status`, so an attacker could mint their own "completed" order and review it (proven live: 201 + 201 with a fresh anonymous session). `supabase/harden-orders.sql` closes it: orders must be born `pending` with consistent amounts, and a DB trigger makes `pending → completed` server-only. ✅ **Applied + verified live Jul 23 2026** — forged completed-order insert → 403; cook editing money columns → 400; cook completing an unpaid order → 400; legit flow + guest checkout unaffected. (Trigger needed one fix: role detection via `current_user`, not the plural JWT-claims GUC, which is empty on this instance.)

## MEDIUM

- [ ] **Limited-inventory oversell under concurrency** — 🅵 DEFERRED (decided Jul 2026, low priority). Two buyers hitting the *same last item* within ~2s can both pay → cook oversold by one. Rare at pilot scale and low-harm: the cook sees both orders and just makes one more or refunds one. The real fix (auto-refund the race loser) adds a confusing "charged then refunded" flow into the payment path and can't be cleanly tested. **Revisit if a cook runs "limited drop" launches** (e.g. "10 boxes, Saturday only") where a crowd buys at once. Technical note: the stock check + decrement aren't atomic; `confirmPaidOrder` (shared by webhook + success page) is the place to harden.
- [x] **Storage policy too loose** ✅ FIXED (Jul 2026) — writes scoped to the owner's `{cook.id}/` folder; verified a stranger uploading into another kitchen's folder returns 403. Was: any signed-in user could update/delete any cook's listing photos (`storage-policies.sql` checked only the bucket, not the owner path).
- [x] **AI routes are unauthenticated + unthrottled** ✅ FIXED (Jul 2026) — both `/api/ai/*` now require a signed-in user (401 otherwise). Per-user rate-limiting deferred (needs a shared store; low priority at pilot scale).

## Jul 23 2026 full-codebase review — found & fixed in one batch

All fixed in code the same day; the DB items go live when migration #16 runs.

- [x] **Payout-ledger integrity:** a cook could mark an unpaid `pending` order `completed` (`advanceOrder` had no state-machine guard) or PATCH money columns on their own orders via the raw API — both inflate the manual "owed to cook" sums. Fixed: legal-transition guard in the action + DB trigger (status-only, legal transitions) in `harden-orders.sql`.
- [x] **Checkout trust:** the cart's localStorage prices could go stale (buyer sees one total, Stripe charges another) and items that went unavailable were silently dropped from the order. Fixed: cart self-syncs against live listings, server bounces on price drift or missing items, and `/cart` finally renders checkout errors (they were silently lost).
- [x] **Cancelled orders never restored inventory** — now they restock limited items (and the dashboard gained a Cancel button).
- [x] **Email HTML injection:** buyer-typed notes/name/address went into the cook's email unescaped (phishing vector). Fixed with `escapeHtml` in all email templates.
- [x] **Migration replay landmine:** files 9 and 14 recreated policies that `schema.sql` now embeds, so a fresh-DB replay (i.e. deploy day) aborted. Drop-guards added; MIGRATIONS.md corrected.
- [x] Smaller: AI routes now reject anonymous sessions (free Groq-burn); listing prices must be > $0 (≤ $10k); deleting an ever-ordered listing no longer fails silently (FK now `set null` + error surfaced); guest "account created" message now says to confirm by email; stray "County-verified" badge removed from buyer header; empty-cart flash and duplicate checkout error banner fixed; fee note copy now mentions the $0.30.

## LOW / CLEANUP
- [x] Delete dead `components/browse-filters.tsx` (imported nowhere). ✅ deleted Jul 23 2026.
- [x] Remove 23 leftover `.fuse_hidden*` editor temp files before any deploy/copy. ✅ they were actually *committed to git* — `git rm`'d and gitignored Jul 23 2026.
- [x] Remove unused `stripe` + `@stripe/stripe-js` npm deps (imported nowhere). ✅ Jul 23 2026.
- [ ] `cooks.latitude/longitude` are never read — the distance search doesn't exist yet (scrub them in the address fix regardless).
- [x] README "What's built" checkboxes are stale/unchecked and still say "Stripe Connect" (not built). ✅ Fixed with the Connect PR (Jul 2026).
- [x] Run `supabase/one-kitchen-per-user.sql` ✅ applied (Jul 2026) — no dupes existed; unique constraint added, verified a second-kitchen insert now returns 409.
- [ ] Purge test kitchens/junk data (e.g. the dragon-photo / "THC" test listing). (Partial Jul 27 2026: all fake permits deleted — the three demo kitchens are now UNVERIFIED since their badges rode on a fake permit; kitchens/listings themselves still need replacing.)
- [ ] **Verification is a signup-time snapshot** — 🅵 DEFERRED (Jul 2026, fine at pilot scale where the admin reviews every kitchen). Re-running the importer doesn't re-match existing cooks, and an expired/revoked county permit never un-verifies an approved kitchen — `permit_verified` is set once at onboarding and never re-checked, so a lapsed cook keeps the buyer-facing "County-verified" badge indefinitely. **Stage 1 (visibility) shipped Aug 2 2026 (PR #76):** the admin list + detail now show each verified cook's permit expiry, amber-flagged inside 60 days, so the reviewer can act by hand. **Lifecycle actions deliberately ON HOLD (decided Aug 2 2026)** — build when cook count justifies it, per this recommended policy: (a) **notify + grace, don't lock out** — warn cook + admin ~30 days ahead and at expiry drop the *badge*, not the kitchen (they keep selling as a plain local kitchen until renewal is re-approved; hard-locking a legit cook over renewal-paperwork lag punishes the scarcest asset); (b) **automate the re-check** — a nightly Render cron re-running `isExpired` across verified cooks to flip the badge + fire an in-app/email notice (needs a scheduled job this project doesn't have yet). Also fold in the importer reconciliation pass (re-match + un-verify expired) at that time.
- [ ] **`cook_private.permit_photo_path` is owner-writable** — 🅵 DEFERRED (low). A cook could point it at another cook's storage path; the admin console would then sign+show the wrong photo to the ADMIN only (no data reaches the attacker). Fix with a column-guard trigger (like `enforce_cook_update_rules`) in the next migration batch.
- [ ] **Cottage-food county list not imported** — cottage bakers are hand-reviewed against their registration; the sell wizard + /verified copy say so honestly. Import it like the MEHKO list when a cottage cook shows up.

---

## Roadmap status
| Milestone | State |
|---|---|
| 1–4 Scaffold, auth/roles, cook side, buyer side | Done |
| 5 Checkout | Done — Stripe **Connect destination charges** (cook auto-paid at charge time) |
| 6 Orders, reviews, notifications | Done — incl. order emails + "I'm on it" + reminder cron (Jul 2026) |
| Inventory (made-to-order / set number) | Done |
| 7 Test e2e + deploy | Done — **live on Render** (Jul 2026); Stripe still test mode |

## What only you (CEO) can do — the real bottleneck
1. ~~Get the real Santa Clara County approved-operator list~~ ✅ Done (Jul 2026) — 174 real MEHKO permits loaded; verification is genuine for MEHKO kitchens.
2. **Recruit one real cook.** That single "yes" tests the actual risk (will cooks join?) and will teach us more than any feature. This is now THE bottleneck.

## Suggested sequence
1. Safety batch (I build): Stripe webhook, address-column lockdown, review + storage + AI-route hardening.
2. Rotate secrets; deploy to Render + Supabase Pro; wire Google OAuth redirect URLs.
3. Load real permit data (you) → onboard 1 real cook (you).
4. Then: notifications, then real Stripe (live keys + payout decision).
