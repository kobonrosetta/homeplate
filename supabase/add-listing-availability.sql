-- ============================================================
--  Dish availability / timing model. Migration #39.
--  Run in Supabase -> SQL Editor. Replay-safe.
--
--  Fixes the core hole: today a buyer can pay for food that isn't
--  planned to be made for weeks — a dish's only timing signal is a
--  free-text "lead time note" nothing enforces. This makes every dish
--  answer ONE required question ("when can people get this?") that
--  always resolves to a concrete DATE the checkout enforces:
--    ready_now  -> today  (also the "available now" signal)
--    lead_time  -> today + lead_days
--    preorder   -> a fixed ready_date, sellable until an order_by cutoff
--  Logic + Pacific date math live in lib/availability.ts (unit-tested).
--
--  Additive; no new tables; no RLS changes. The only guarded surface is
--  the two kitchen-DEFAULT columns on `cooks` (a cook picks their usual,
--  new dishes inherit it, any dish overrides) — so enforce_cook_update_
--  rules is re-issued with them added to the editable allow-list.
-- ============================================================

-- (1) Per-listing timing. No trigger guards listings columns (owner-row RLS
--     only), so the owner-session insert/update paths write these directly.
alter table listings
  add column if not exists fulfillment_mode text not null default 'ready_now'
    check (fulfillment_mode in ('ready_now', 'lead_time', 'preorder')),
  add column if not exists lead_days smallint
    check (lead_days is null or (lead_days >= 0 and lead_days <= 14)),
  add column if not exists ready_date date,
  add column if not exists order_by  date;

-- (2) The concrete date snapshotted onto an order at checkout (mirrors how
--     served_hot is frozen), so later listing edits can't rewrite the promise.
alter table orders
  add column if not exists ready_by_date date;

-- (3) Kitchen-level DEFAULT a new dish inherits (overridable per dish). These
--     are cook-editable preferences, so they join the update allow-list below.
alter table cooks
  add column if not exists default_fulfillment_mode text not null default 'ready_now'
    check (default_fulfillment_mode in ('ready_now', 'lead_time', 'preorder')),
  add column if not exists default_lead_days smallint
    check (default_lead_days is null or (default_lead_days >= 0 and default_lead_days <= 14));

-- (4) Re-issue enforce_cook_update_rules — byte-for-byte the current (#32) body
--     PLUS 'default_fulfillment_mode' and 'default_lead_days' in editable[], so
--     a cook can set their kitchen default from Settings. Everything else
--     (operation_type lock, status transitions, protected-column check) is
--     unchanged.
create or replace function public.enforce_cook_update_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  req_role text := current_user;
  editable text[] := array[
    'business_name', 'owner_name', 'bio', 'cuisine_tags', 'operation_type',
    'city', 'zip', 'pickup_available', 'delivery_available',
    'delivery_notes', 'pickup_windows', 'neighborhood',
    'default_fulfillment_mode', 'default_lead_days',
    'avatar_url', 'cover_url', 'updated_at'
  ];
begin
  if req_role not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.operation_type is distinct from old.operation_type and old.permit_verified then
    raise exception 'operation type is locked once your kitchen is verified';
  end if;

  if (to_jsonb(new) - editable - 'status')
     is distinct from (to_jsonb(old) - editable - 'status') then
    raise exception 'this kitchen column is protected';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'active' and new.status = 'paused')
    or (old.status = 'paused' and new.status = 'active')
  ) then
    raise exception 'illegal kitchen status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;
