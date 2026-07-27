# HomePlate — Database Migrations

Every schema change to the HomePlate Supabase project has been applied **by hand** in
the Supabase SQL editor — this project does not use the Supabase CLI migration system.
This file is the canonical record of what was run, in what order, and whether it's live.

**Status: 20 of 21 applied — #21 (`harden-permits-bucket.sql`) is written but NOT yet
run.** (Its bucket-limit half — 10MB cap + image/PDF MIME allowlist — was already
applied live via the storage API on 2026-07-27; running the file also drops the
now-unneeded end-user write policies and makes the replay complete.) #19 + #20 applied
2026-07-24; real county data imported the same day (174 MEHKO permits; fake seeds
removed). #17 (`harden-cooks.sql`) and #18 (`add-order-in-progress.sql`) applied
2026-07-24. #16 (`harden-orders.sql`) applied and verified
live on **2026-07-23** (forged `completed` order insert → 403; cook editing money
columns → 400; cook completing an unpaid order → 400; legit `confirmed→ready→completed`
and guest checkout still work). Migrations 1–15 verified against the live database on
**2026-07-16** — tables and columns by direct query, policies and triggers by behavior
tests.

Project ref: `jycefrvkqybadwupokdn` (Santa Clara County pilot)

## Migrations, in run order

| #  | File | Purpose | Live? |
|----|------|---------|:-----:|
| 1  | `schema.sql` | Base tables (profiles, approved_operators, cooks, cook_private, listings, orders, order_items, reviews), indexes, RLS enabled, core access policies | ✅ |
| 2  | `seed.sql` | Seeds `approved_operators` with the initial Santa Clara County permit list (5 rows) | ✅ |
| 3  | `google-oauth.sql` | `handle_new_user` trigger — auto-creates a profile row on signup (Google + email) | ✅ |
| 4  | `add-cook-address.sql` | *(historical)* Added street_address / latitude / longitude to `cooks` | ✅ |
| 5  | `private-cook-columns.sql` | Moved the address into a separate `cook_private` table (owner-only RLS) and dropped it from `cooks` — this is the fix for the address leak | ✅ |
| 6  | `add-order-contact.sql` | `orders`: contact_name, contact_phone, delivery_address | ✅ |
| 7  | `add-order-email.sql` | `orders`: contact_email | ✅ |
| 8  | `add-review-constraint.sql` | Unique index — one review per order (blocks review spam) | ✅ |
| 9  | `harden-reviews-policy.sql` | Reviews RLS — only the buyer of a *completed* order can post a review | ✅ |
| 10 | `add-listing-quantity-mode.sql` | `listings`: limited_quantity + quantity_available (inventory / auto-deduct) | ✅ |
| 11 | `add-listing-photos-allergens.sql` | `listings`: photo_urls[] + allergens | ✅ |
| 12 | `add-payouts.sql` | `payouts` table + RLS + index (manual cook payouts for the pilot) | ✅ |
| 13 | `one-kitchen-per-user.sql` | Unique constraint — one kitchen per user (profile_id) | ✅ |
| 14 | `orders-policies.sql` | RLS — buyer can add items to own order; cook can update own kitchen's orders | ✅ |
| 15 | `storage-policies.sql` | Storage RLS — a cook can only write/delete photos in their own folder | ✅ |
| 16 | `harden-orders.sql` | Orders hardening — orders must be born `pending` with consistent amounts (blocks forged completed orders → forged reviews); status-only, legal-transition updates for end-user sessions (protects the payout ledger); `order_items.listing_id` nulls out on listing delete | ✅ |
| 17 | `harden-cooks.sql` | Cooks hardening + kitchen pause — closes REST self-approval (a cook's session could set `status='active'` + `permit_verified=true` on their own row, or insert a kitchen born active); end-user sessions may only edit profile columns and toggle `active↔paused` (the dashboard pause button); adds `suspended` status for admin suspension; permit columns become server-written (sell wizard now uses the service role) | ⬜ |
| 18 | `add-order-in-progress.sql` | "Never miss an order" — `in_progress` order status (the cook's "I'm on it" acknowledgment), `orders.reminder_sent_at` (at-most-once reminder emails from the cron endpoint), re-issues the orders transition trigger with the new legal moves | ✅ |
| 19 | `add-operator-expiry.sql` | Real county permit data — adds `approved_operators.expires_at` + a unique index on `permit_number` (integrity + upsert target). Rows loaded by `scripts/import-mehko.mjs` from the Santa Clara County MEHKO open-data API. Signup auto-flags verified on a live (non-expired) **permit** match; the kitchen name is advisory only (shown to the admin), since cooks brand differently from their permit name | ✅ |
| 20 | `add-permit-photo.sql` | Optional permit-photo upload — private `permits` storage bucket (no public read), `cook_private.permit_photo_path`. Admin views it via a short-lived signed URL. The real evidence behind the human review, since the county list is public | ✅ |
| 21 | `harden-permits-bucket.sql` | Permits bucket server-writes-only — drops the end-user write policies (uploads moved to the service role in `lib/listings.ts`, path always derived server-side from the caller's own kitchen) + bucket-level 10MB / image-or-PDF limits that bind even service-role uploads | ⬜ |

## Replaying on a fresh database

If you ever spin up a new Supabase project (staging or production), run these files **in
the order above** in the SQL editor. Each file is safe to re-run: Postgres has no
`create policy if not exists`, so policy files drop the policy by name first and then
recreate it (everything else uses `if not exists` / `if exists` / `create or replace`
guards). Files 9 and 14 originally lacked those drop-guards and would abort a replay
with "policy already exists" — fixed 2026-07-23.

- **Files 4 and 5 are historical.** The address split is already baked into `schema.sql`,
  so on a fresh database #4 adds the columns and #5 immediately removes them — a harmless
  round-trip. You can skip #4 if you like.
- **Sanity check after running everything:** `cook_private` exists, `cooks.street_address`
  is gone, and `payouts` exists.

## Adding a new migration (going forward)

1. Write the change as a new `supabase/your-change.sql` file — use `if not exists` guards.
2. Paste it into the Supabase SQL editor and run it.
3. Add a row to the table above with the date, then commit the `.sql` file **and** this doc.

That keeps this file honest: it should always match your live database.
