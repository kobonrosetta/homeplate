-- Pickup windows — the cook owns the schedule, not the buyer.
--
-- Home cooks sell in batches on the days they actually cook; the old checkout
-- let the buyer type any pickup time into a free-text box and hope. This adds
-- cook-defined pickup windows (plain text lines like "Saturdays 4–6 PM"),
-- edited in dashboard settings / the sell wizard, shown on the kitchen page,
-- and offered as the checkout choices. The chosen window still lands in the
-- existing orders.pickup_time text column — no orders change needed.
--
-- Public by design: windows are schedule info (no address), and `cooks` is the
-- publicly readable table. Additive-only; run BEFORE deploying the code that
-- selects it.

alter table public.cooks
  add column if not exists pickup_windows text[] not null default '{}';

comment on column public.cooks.pickup_windows is
  'Cook-defined pickup windows (free-text lines, e.g. "Saturdays 4-6 PM"); offered as checkout pickup_time choices.';

-- The cooks_guard_update trigger (harden-cooks.sql, #17) blocks end-user
-- updates to any column outside its allow-list — new columns are protected by
-- default. Re-issue the function with pickup_windows allowed so a cook's own
-- session (dashboard settings / sell wizard step 1) can edit their windows.
-- This is the #17 function verbatim plus that one array entry.
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
    'delivery_notes', 'pickup_windows', 'avatar_url', 'cover_url',
    'updated_at'
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
