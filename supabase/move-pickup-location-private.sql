-- Move the pickup/handoff spot to the private table — never shown pre-order.
--
-- Migration #28 put `pickup_location` on the PUBLIC `cooks` table so a cook's
-- chosen meetup spot could be shown to shoppers before they order. Decision
-- reversed: the founder wants it treated exactly like the home address — a
-- buyer never sees ANY pickup location (home or a separate meetup spot) until
-- their order is confirmed. Only `neighborhood` (coarse, always public) stays
-- on `cooks` as the pre-order location signal.
--
-- No real cook has set pickup_location yet, so this is a clean relocation, not
-- a data migration: add the column to cook_private (which already has exactly
-- the right RLS — owner-only read/write, service-role reveal post-order — no
-- new policy needed), then drop it from cooks. The enforce_cook_update_rules
-- guard shrinks back to not needing to allow-list it at all (it's now written
-- via cook_private's own owner-write policy, the same path street_address
-- already uses).
--
-- Additive-then-subtractive; run BEFORE deploying the code that reads/writes
-- the new location (the old public column disappearing would otherwise 42703
-- against code still selecting cooks.pickup_location).

alter table public.cook_private
  add column if not exists pickup_location text;

comment on column public.cook_private.pickup_location is
  'Cook-chosen handoff spot (a meetup point, or their home address if they prefer) — revealed to a buyer only after their order is confirmed, exactly like street_address. Null = pick up at the home address.';

alter table public.cooks
  drop column if exists pickup_location;

-- Re-issue enforce_cook_update_rules with pickup_location removed from the
-- editable allow-list (it's no longer a column on `cooks` at all). Back to the
-- #28 list minus that one entry; `neighborhood` stays, since it remains public.
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
    'delivery_notes', 'pickup_windows', 'neighborhood',
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
