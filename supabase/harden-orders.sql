-- ============================================================
--  Harden the orders table — closes three holes found in the
--  July 2026 security review. Run once in Supabase -> SQL Editor.
--  Replay-safe: every statement drops/replaces before creating.
--
--  1) Orders must be born 'pending' with consistent amounts.
--     Before this, ANY signed-in session (including a throwaway
--     anonymous one) could insert a status='completed' order via
--     the REST API and then post a forged review against it —
--     the reviews policy only checks for a completed owned order.
--
--  2) End-user sessions may update ONLY an order's status, and
--     only along the legal lifecycle. Before this, a cook could
--     PATCH money columns (subtotal_cents feeds the manual payout
--     ledger) or jump an unpaid pending order straight to
--     'completed'. pending -> confirmed stays server-only: it is
--     done by the service role after Stripe verifies payment.
--
--  3) order_items.listing_id blocked deleting any listing that
--     had ever been ordered (silently — the app ignored the
--     error). Order history keeps its own title/price snapshot,
--     so the reference can null out safely.
-- ============================================================

-- (1) Orders are created pending, with amounts that add up.
--     The 8% + $0.30 fee formula itself stays in the app
--     (lib/constants.ts) — the database only insists the parts
--     are non-negative and sum to the total.
drop policy if exists "buyer creates own order" on orders;
create policy "buyer creates own order" on orders
  for insert with check (
    buyer_id = auth.uid()
    and status = 'pending'
    and subtotal_cents >= 0
    and service_fee_cents >= 0
    and total_cents = subtotal_cents + service_fee_cents
  );

-- (2) Status-only, legal-transition updates for end-user sessions.
--     The service role (Stripe-verified confirmation in
--     lib/orders.ts) and the SQL editor are exempt. RLS already
--     limits WHICH rows a cook can touch; this trigger limits WHAT
--     they can change. Diffing to_jsonb(...) minus 'status' means
--     any column added later is protected automatically.
create or replace function public.enforce_order_update_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- The Postgres role PostgREST switched into for this request:
  -- 'authenticated'/'anon' for end users, 'service_role' for the server
  -- (Stripe-verified confirmation), 'postgres' in the SQL editor. Using the
  -- role directly avoids depending on which JWT-claims GUC this instance sets.
  req_role text := current_user;
begin
  if req_role not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'only order status may be changed';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'confirmed' and new.status in ('ready', 'completed', 'cancelled'))
    or (old.status = 'ready'     and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'illegal order status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_update on orders;
create trigger orders_guard_update
  before update on orders
  for each row execute procedure public.enforce_order_update_rules();

-- (3) Let listings be deleted; order history keeps its snapshot.
alter table order_items
  drop constraint if exists order_items_listing_id_fkey;
alter table order_items
  add constraint order_items_listing_id_fkey
  foreign key (listing_id) references listings(id) on delete set null;
