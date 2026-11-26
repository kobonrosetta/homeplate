-- ============================================================
--  Refund hold for cook-cancelled orders. Migration #45.
--  Run in Supabase -> SQL Editor. Replay-safe. Additive.
--
--  Before this, a cook's cancel told the buyer "you're being
--  refunded" and then waited for an admin to click Refund —
--  buyers waited up to a week (Nov 2026). Now the cancel starts
--  a 24-hour HOLD: the cook can undo it or refund at once, and a
--  scheduled sweep (app/api/cron/refund-cancelled) refunds
--  whatever is left when the hold runs out. Rules live in
--  lib/refund-hold.ts; the money code in lib/refunds.ts.
--
--  Two new columns on orders:
--
--    cancelled_at       When the order became 'cancelled'. Stamped
--                       by the trigger below — never by the app —
--                       so it is set on EVERY path into
--                       'cancelled' and can't be forgotten or
--                       forged. Cleared when an order is put back.
--                       The sweep only ever refunds an order whose
--                       cancelled_at is set and older than the
--                       hold: existing rows (all null) are never
--                       auto-refunded.
--
--    refund_claimed_at  Set by the server (service role) the
--                       moment before it asks Stripe for a refund,
--                       and required to be NULL to put an order
--                       back. It makes "refund" and "undo cancel"
--                       mutually exclusive in the database.
--
--  Neither needs a policy or an allow-list entry: the existing
--  orders_guard_update trigger (migrations 16 + 18) already rejects
--  ANY non-status change from an end-user session, including these
--  columns ("any column added later is protected automatically").
--
--  TRIGGER ORDER MATTERS. Postgres fires same-event triggers in
--  alphabetical order by name: orders_guard_update runs first and
--  sees the cook's change exactly as sent (status only), THEN
--  orders_stamp_cancelled_at adds the timestamp. Keep this
--  trigger's name sorting after "orders_guard_update" — if it ever
--  ran first, the guard would see the stamped column as an illegal
--  change and reject every cook cancel.
--
--  The app works with or without this migration: until it is run,
--  refunds stay an admin click exactly as before.
-- ============================================================

alter table orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists refund_claimed_at timestamptz;

create or replace function public.stamp_order_cancelled_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := now();
  elsif old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    new.cancelled_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_cancelled_at on orders;
create trigger orders_stamp_cancelled_at
  before update on orders
  for each row execute procedure public.stamp_order_cancelled_at();

-- Self-check: the result pane should show 2 and
-- "orders_guard_update -> orders_stamp_cancelled_at".
select
  (select count(*)
     from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name in ('cancelled_at', 'refund_claimed_at')
  ) as hold_columns_should_be_2,
  (select string_agg(tgname::text, ' -> ' order by tgname)
     from pg_catalog.pg_trigger
    where tgrelid = 'public.orders'::regclass
      and not tgisinternal
  ) as update_triggers_in_firing_order;
