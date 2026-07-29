-- Pickup / handoff location + neighborhood — buyer-facing, cook-controlled.
--
-- Buyers shopping around can't tell if a kitchen is near them, and the exact
-- home address is (correctly) hidden until they pay. This lets a cook OPT to
-- publish a handoff location — a public meetup spot, or their home address if
-- they're comfortable — plus an optional coarse neighborhood label. When set,
-- pickup_location shows to shoppers AND becomes the post-order pickup detail;
-- when null, pickup stays private (the home address in cook_private is revealed
-- only after an order, exactly as today).
--
-- SECURITY: these are PUBLIC columns on `cooks` (the shopper-readable table) by
-- design — like pickup_windows. The private home street stays in cook_private
-- and is NEVER mirrored here automatically; if a cook shows their home, that's
-- a value they deliberately typed into the public field.
--
-- Additive-only; run BEFORE deploying the code that selects it.

alter table public.cooks
  add column if not exists pickup_location text;
alter table public.cooks
  add column if not exists neighborhood text;

comment on column public.cooks.pickup_location is
  'Cook-published public handoff location (meetup spot, or home if they choose). Null = pickup stays private (home revealed post-order from cook_private).';
comment on column public.cooks.neighborhood is
  'Optional coarse area label shown to shoppers (e.g. "West Sunnyvale"); never the exact address.';

-- The cooks_guard_update trigger blocks end-user updates to any column outside
-- its allow-list. Re-issue the function (current body from pickup-windows.sql,
-- #24) with pickup_location + neighborhood added, so a cook's own session
-- (dashboard settings) can edit them. Copied verbatim plus those two entries.
create or replace function public.enforce_cook_update_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- 'authenticated'/'anon' for end users, 'service_role' for the
  -- server, 'postgres' in the SQL editor (see harden-orders.sql).
  req_role text := current_user;
  editable text[] := array[
    'business_name', 'bio', 'cuisine_tags', 'operation_type',
    'city', 'zip', 'pickup_available', 'delivery_available',
    'delivery_notes', 'pickup_windows', 'pickup_location', 'neighborhood',
    'avatar_url', 'cover_url', 'updated_at'
  ];
begin
  if req_role not in ('authenticated', 'anon') then
    return new;
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
