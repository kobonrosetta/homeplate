# HomePlate — Database Migrations

Every schema change to the HomePlate Supabase project has been applied **by hand** in
the Supabase SQL editor — this project does not use the Supabase CLI migration system.
This file is the canonical record of what was run, in what order, and whether it's live.

**Status: 30 of 30 applied — all live.** #30 (`add-cook-owner-name.sql`) applied
+ verified live 2026-07-29 (six REST checks: `owner_name` + `cover_url`
anon-readable; a cook session CAN save `owner_name` — the guard allow-list works
— while flipping `permit_verified` still 400s "this kitchen column is protected";
throwaway cook + user cleaned up afterward). #29 (`move-pickup-location-private.sql`) applied 2026-07-29
— pickup spot moved to `cook_private`, code live via PR #32 (the deployed
settings form + post-order reveal read/write `cook_private.pickup_location`, so
the column is necessarily present and `cooks.pickup_location` is gone). #28
applied + confirmed live 2026-07-29 (`cooks.pickup_location` + `neighborhood`
present via anon REST select — pickup_location later relocated by #29).
#27 applied + verified live 2026-07-29 (`announced_at`
column present; existing dishes backfilled — zero un-announced; announce-dishes cron
behaviorally verified: no-follower announce path, settle gate holds a fresh dish,
send-failure leaves a dish for retry, second run idempotent). #26 applied + confirmed
live 2026-07-29 (anon REST select
of `listings.ingredients` → 200 before the code merge). #25 applied + verified live 2026-07-29
(nine REST checks: follow/unfollow, duplicate 409, pending-kitchen + forged-identity +
anon-session blocked, cross-user read empty, guard column 400). #24 applied + verified
live 2026-07-29
(cook session saves `pickup_windows` OK; `permit_verified` + self-activation still 400;
anon write touches zero rows; anon read works on active kitchens). #22 + #23 confirmed
live 2026-07-28 (columns/tables present
via REST; #23 behavior-verified the same day: Taxes card renders correct quarterly
numbers for a seeded MEHKO cook, CSV export matches to the cent, `cdtfa_permit`
unreadable by anon + cross-user sessions, checkout-shaped `order_items` insert with
`served_hot` passes RLS). #21 (`harden-permits-bucket.sql`) applied +
verified live 2026-07-27 (anon write to permits → 400; bucket MIME allowlist actively
rejecting untyped uploads; service-role path works). #19 + #20 applied 2026-07-24; real
county data imported the same day (174 MEHKO permits; ALL fake permits deleted from the
live DB by 2026-07-27, incl. the hand-entered "Los Gatos Cookie Co"). #17
(`harden-cooks.sql`) and #18 (`add-order-in-progress.sql`) applied
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
| 17 | `harden-cooks.sql` | Cooks hardening + kitchen pause — closes REST self-approval (a cook's session could set `status='active'` + `permit_verified=true` on their own row, or insert a kitchen born active); end-user sessions may only edit profile columns and toggle `active↔paused` (the dashboard pause button); adds `suspended` status for admin suspension; permit columns become server-written (sell wizard now uses the service role) | ✅ |
| 18 | `add-order-in-progress.sql` | "Never miss an order" — `in_progress` order status (the cook's "I'm on it" acknowledgment), `orders.reminder_sent_at` (at-most-once reminder emails from the cron endpoint), re-issues the orders transition trigger with the new legal moves | ✅ |
| 19 | `add-operator-expiry.sql` | Real county permit data — adds `approved_operators.expires_at` + a unique index on `permit_number` (integrity + upsert target). Rows loaded by `scripts/import-mehko.mjs` from the Santa Clara County MEHKO open-data API. Signup auto-flags verified on a live (non-expired) **permit** match; the kitchen name is advisory only (shown to the admin), since cooks brand differently from their permit name | ✅ |
| 20 | `add-permit-photo.sql` | Optional permit-photo upload — private `permits` storage bucket (no public read), `cook_private.permit_photo_path`. Admin views it via a short-lived signed URL. The real evidence behind the human review, since the county list is public | ✅ |
| 21 | `harden-permits-bucket.sql` | Permits bucket server-writes-only — drops the end-user write policies (uploads moved to the service role in `lib/listings.ts`, path always derived server-side from the caller's own kitchen) + bucket-level 10MB / image-or-PDF limits that bind even service-role uploads | ✅ |
| 22 | `raffin-ready.sql` | "Raffin-ready" batch — (a) `custom_requests` (cook-minted payment links for DM-negotiated customs; token-capability access, no public read, cancel-only guard trigger for end users, paid/expired service-role-only) + `orders.custom_request_id`; (b) `listings.kind` (`dish`/`extra` — extras skip the AI food gate); (c) `listing_option_groups` + `listing_options` (cook-defined single-select dropdowns with price deltas; public read, owner-only writes; checkout re-derives every line's price server-side) | ✅ |
| 23 | `tax-pilot.sql` | Sales-tax pilot (prices tax-INCLUDED; each cook remits on their own CDTFA seller's permit) — `listings.served_hot` (the CA taxability flag, asked as "How is it served?"; MEHKO-only UI, cottage always false), `order_items.served_hot` (snapshot at purchase, like title/price, so listing edits can't rewrite tax history), `cook_private.cdtfa_permit` (seller's-permit number — private table because `cooks` is publicly readable). Additive-only; safe to run before the code deploy | ✅ |
| 24 | `pickup-windows.sql` | `cooks.pickup_windows text[]` — cook-defined pickup windows (edited in dashboard settings + the sell wizard), shown on the kitchen page and offered as the checkout pickup-time choices (the chosen window lands in the existing `orders.pickup_time`; no orders change). Also re-issues `enforce_cook_update_rules` (#17's trigger function) with `pickup_windows` on the editable allow-list — without that, the guard blocks a cook's own session from saving windows. Additive-only; run before deploying the code that selects it | ✅ |
| 25 | `follows.sql` | Follow a kitchen + drop alerts — `follows` table (owner-only RLS: nobody can list a kitchen's followers; insert requires a non-anonymous session and an active target kitchen; `email` snapshotted server-side from the auth session since `profiles` has no email column) + `cooks.followers_notified_at` (service-role-written debounce stamp — one follower alert per 6h per kitchen, stamped before sending for at-most-once bias). Additive-only; run before deploying the code that uses it | ✅ |
| 26 | `add-listing-ingredients.sql` | `listings.ingredients text` — optional cook-entered ingredient list, shown on the item page only when present. Buyer trust (allergy readers) + the one missing field for the future cottage-label generator. Additive-only; run before deploying the code that writes it | ✅ |
| 27 | `add-listing-announced.sql` | `listings.announced_at timestamptz` — per-dish "announced to followers" flag for the digest sweep. Replaces the old inline alert whose 6h cooldown silently dropped the 2nd–Nth dish of a posting session; the `announce-dishes` cron now gathers a session's un-announced dishes into ONE digest. Backfills existing rows as announced so the first sweep doesn't blast the back catalogue. Additive-only; run before deploying the digest code | ✅ |
| 28 | `add-pickup-location.sql` | `cooks.pickup_location text` + `cooks.neighborhood text` — buyer-facing, cook-controlled handoff location. When `pickup_location` is set (a public meetup spot, or the home address if the cook chooses) it shows to shoppers on browse/kitchen AND becomes the post-order pickup detail; null = pickup stays private (home revealed post-order from `cook_private`, unchanged). `neighborhood` is an optional coarse area label. PUBLIC columns on `cooks` by design (like pickup_windows); the private home street is NEVER auto-mirrored here. Re-issues `enforce_cook_update_rules` (current #24 body) with both columns on the editable allow-list. Additive-only; run before deploying the code that selects it | ✅ |
| 29 | `move-pickup-location-private.sql` | Decision reversed: a cook's pickup spot must NEVER be shown pre-order (same rule as the home address), so `pickup_location` moves off the public `cooks` table onto **`cook_private`** (new column there; no new RLS needed — reuses the existing owner-only/service-role-reveal policy) and is dropped from `cooks`. `neighborhood` stays public — it's the only pre-order location signal now. Re-issues `enforce_cook_update_rules` with `pickup_location` removed from the allow-list (it's no longer a `cooks` column at all). No real cook had set one yet, so this is a clean relocation, not a data migration. Additive-then-subtractive; **run BEFORE deploying the code that reads/writes the new location** | ✅ |
| 30 | `add-cook-owner-name.sql` | Storefront "Meet the cook" — adds `cooks.owner_name text` (PUBLIC, cook-chosen display name of the person behind the kitchen, e.g. "Maria"; the real name on `profiles.full_name` is unreadable to shoppers under profiles' owner-only RLS, so the cook publishes a name they choose rather than us exposing profiles). Re-issues `enforce_cook_update_rules` (current #29 body) with `owner_name` on the editable allow-list. `cover_url` needed **no** migration — it already exists on `cooks` and is already allow-listed, so the cover-photo hero writes straight through. Additive-only; run BEFORE deploying the code that selects/writes it | ✅ |

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
- **After the SQL files, run `node scripts/import-mehko.mjs` and `node scripts/import-cottage.mjs`.**
  `seed.sql` (#2) inserts *fake* demo permits; the importers load the real county MEHKO +
  cottage-food lists and delete the fakes (they match `*2025-*`). A replayed database without
  this step would let cooks "verify" against made-up permits. (The cottage importer excludes
  any permit already loaded as MEHKO so it can't overwrite one.)
- **Sanity check after running everything:** `cook_private` exists, `cooks.street_address`
  is gone, `payouts` exists, and `approved_operators` holds ~174 MEHKO + ~323 cottage `PT…`
  operators with zero `*2025-*` rows.

## Adding a new migration (going forward)

1. Write the change as a new `supabase/your-change.sql` file — use `if not exists` guards.
2. Paste it into the Supabase SQL editor and run it.
3. Add a row to the table above with the date, then commit the `.sql` file **and** this doc.

That keeps this file honest: it should always match your live database.
