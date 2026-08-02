-- ============================================================================
-- reset-test-data.sql  —  wipe pre-launch TEST data (run by hand, once)
-- ============================================================================
--
-- WHY THIS EXISTS (and why there is deliberately NO "Clear data" button in the
-- admin UI): everything in the database today is Stripe TEST-mode data — fake
-- kitchens and their test orders inflate the admin dashboard (GMV, fees, "to
-- chefs") and would pollute a chef's earnings + quarterly tax numbers. A
-- permanent destructive button is a footgun that could one day wipe REAL order
-- and tax records (which you are legally required to retain). Instead this is a
-- deliberate, one-time cleanup you run yourself in the Supabase SQL editor —
-- ideally as part of the go-live cutover, right when you switch Stripe from
-- test keys to live keys. After that, real orders accumulate and you never run
-- this again.
--
-- WHAT IT DOES NOT TOUCH (on purpose):
--   • approved_operators  — the REAL Santa Clara County MEHKO + cottage lists.
--   • auth users / profiles — your own account and any real sign-ups.
--   • the schema itself — tables, policies, triggers are all left intact.
--
-- HOW TO RUN: paste into the Supabase SQL editor and Run. Deletes are
-- idempotent, so re-running is harmless. Row counts are reported at the end.
-- ============================================================================


-- ── BLOCK A · Clear all sales / order data ──────────────────────────────────
-- Zeroes out the admin dashboard and every chef's earnings/tax history while
-- KEEPING the kitchens and their menus, so you can keep testing the storefront.
-- Deleting an order cascades to its order_items and reviews automatically.
begin;

delete from orders;            -- cascades: order_items, reviews
delete from custom_requests;   -- DM payment links
delete from payouts;           -- legacy manual payout ledger

commit;


-- ── BLOCK B · (OPTIONAL) Also remove the test kitchens entirely ─────────────
-- Uncomment to go all the way to a pristine slate: deletes every kitchen, which
-- cascades to its listings, cook_private (address), and cook_stripe (Connect
-- account link). Leave commented if you want to keep a test kitchen or two to
-- demo with. Safe to run only AFTER Block A (orders reference cooks and would
-- otherwise block the delete).
--
-- begin;
-- delete from follows;   -- who follows whom (references cooks)
-- delete from cooks;     -- cascades: listings, cook_private, cook_stripe
-- commit;
--
-- To keep ONE kitchen instead of wiping all, use this in place of the line above:
--   delete from cooks where id <> 'YOUR-KEEP-KITCHEN-UUID';


-- ── BLOCK C · REQUIRED ONCE at the Stripe test→live cutover ─────────────────
-- Stripe TEST-mode Connect accounts (acct_…) DO NOT EXIST in live mode. Any
-- kitchen that onboarded while the platform ran test keys is carrying a dead
-- account id and a stripe_ready=true flag it no longer deserves: it would look
-- open to buyers while every checkout 400s, and the cook has no self-heal path
-- (the payouts page thinks setup is done). Run this at the moment you flip
-- Render to sk_live keys, so those cooks drop to "Set up payouts" and onboard
-- fresh live accounts.
--
-- ⚠️ Run EXACTLY ONCE, at the cutover. NEVER run after real cooks have
-- completed LIVE onboarding — it would disconnect their real payout accounts.
-- (Skip it entirely if cook_stripe is already empty, e.g. after Block B.)
--
-- begin;
-- delete from cook_stripe;
-- update cooks set stripe_ready = false;
-- commit;


-- ── Verify (optional) ───────────────────────────────────────────────────────
-- Expect 0 for orders/order_items/reviews/custom_requests/payouts after Block A.
select
  (select count(*) from orders)          as orders,
  (select count(*) from order_items)     as order_items,
  (select count(*) from reviews)         as reviews,
  (select count(*) from custom_requests) as custom_requests,
  (select count(*) from payouts)         as payouts,
  (select count(*) from cooks)           as kitchens,
  (select count(*) from approved_operators) as approved_operators_KEEP;
