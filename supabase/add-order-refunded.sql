-- ============================================================
--  Order refund marker. Migration #40.
--  Run in Supabase -> SQL Editor. Replay-safe.
--
--  Backs the admin one-click refund (app/admin/actions.ts refundOrder,
--  which calls Stripe with reverse_transfer + refund_application_fee so
--  the destination-charge refund is always correct). refunded_at is a
--  MARKER, not a status change:
--    - idempotent: a set refunded_at blocks a second refund;
--    - a refund on an already-'completed' order keeps its fulfilled
--      history (we don't mangle status back to 'cancelled').
--  Written only by the service role (admin action), which bypasses the
--  orders update guard; it's not in any end-user allow-list, so a buyer
--  or cook session can't forge it. Additive; no RLS change.
-- ============================================================

alter table orders
  add column if not exists refunded_at timestamptz;
