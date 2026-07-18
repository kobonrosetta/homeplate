# HomePlate — Database Migrations

Every schema change to the HomePlate Supabase project has been applied **by hand** in
the Supabase SQL editor — this project does not use the Supabase CLI migration system.
This file is the canonical record of what was run, in what order, and whether it's live.

**Status: all 15 migrations applied.** Verified against the live database on
**2026-07-16** — tables and columns by direct query, policies and triggers by behavior
tests.

Project ref: `jycefrvkqybadwupokdn` (Santa Clara County pilot)

## Migrations, in run order

| #  | File | Purpose | Live? |
|----|------|---------|:-----:|
| 1  | `schema.sql` | Base tables (profiles, approved_operators, cooks, cook_private, listings, orders, order_items, reviews), indexes, RLS enabled, core access policies | ✅ |
| 2  | `seed.sql` | Seeds `approved_operators` with the initial Santa Clara County permit list (6 rows) | ✅ |
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

## Replaying on a fresh database

If you ever spin up a new Supabase project (staging or production), run these files **in
the order above** in the SQL editor. They use `if not exists` / `if exists` guards, so
re-running them is safe.

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
