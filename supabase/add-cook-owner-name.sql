-- Add a public, cook-controlled display name for the person behind the kitchen.
--
-- The storefront's new "Meet the cook" section wants to show WHO a buyer is
-- buying from ("run by Maria") — the single biggest trust signal on a
-- home-food marketplace. The person's real name lives on `profiles.full_name`,
-- but that row is readable ONLY by its owner (profiles RLS is `auth.uid() = id`),
-- so a shopper literally cannot read a cook's name. Rather than expose the
-- profiles table or reach for the service role on every public page view, give
-- the cook a public field they fill in themselves — so THEY choose how they
-- appear (a first name, a nickname) instead of us leaking their legal name.
--
-- PUBLIC column on `cooks` by design (like business_name / neighborhood); it's
-- a name the cook chooses to publish, never auto-filled from profiles. The
-- home address and other private data stay in cook_private, untouched.
--
-- Re-issues enforce_cook_update_rules (the current #29 body) with 'owner_name'
-- added to the editable allow-list, so a cook's own session can save it without
-- tripping "this kitchen column is protected". (cover_url is already on the
-- list — the cover-photo hero needs no migration.)
--
-- Additive-only; run BEFORE deploying the code that selects/writes owner_name
-- (the absent column would otherwise 42703 against the storefront + settings).

alter table public.cooks
  add column if not exists owner_name text;

comment on column public.cooks.owner_name is
  'Cook-chosen display name of the person behind the kitchen, shown publicly in the storefront "Meet the cook" section (e.g. "Maria"). Cook-controlled — they pick how much of their name to publish; never auto-filled from profiles.full_name.';

-- Re-issue the guard with owner_name on the editable allow-list (current #29
-- body + this one entry). Everything else is byte-for-byte the #29 function.
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
    'business_name', 'owner_name', 'bio', 'cuisine_tags', 'operation_type',
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
