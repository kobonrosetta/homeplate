-- Two RLS tightenings from the full-codebase security review (the low-severity
-- half that needs the database). RUN AFTER the paired code PR (#45) is deployed
-- — the operation_type guard below assumes the settings page renders
-- operation_type as read-only for a verified cook (so a normal save never
-- submits a change that would trip the guard and, since updateKitchen ignores
-- the cooks update error, silently lose the whole save).

-- 1) listings SELECT — the public branch must also require the owning cook to be
--    ACTIVE. The old policy exposed any is_available listing regardless of cook
--    status, so the anon key could read titles/prices/photos of kitchens that
--    are pending approval or admin-suspended (menu data only, no PII, but the
--    catalog of un-surfaced operators). The owner-can-always-read branch stays.
--    Migration-first-safe: browse/kitchen already only surface active cooks.
drop policy if exists "available listings are public" on listings;
create policy "available listings are public" on listings
  for select using (
    (
      is_available = true
      and exists (
        select 1 from cooks c
        where c.id = listings.cook_id and c.status = 'active'
      )
    )
    or exists (
      select 1 from cooks c
      where c.id = listings.cook_id and c.profile_id = auth.uid()
    )
  );

-- 2) Re-issue enforce_cook_update_rules with one added rule: operation_type is
--    LOCKED once the kitchen is verified. It stays in the editable allow-list so
--    an UNVERIFIED cook can still choose/switch program during onboarding, but a
--    VERIFIED cook flipping MEHKO<->cottage would keep a County-verified badge
--    earned under the OTHER program — so that specific change is rejected (a
--    post-verification change goes through the admin console). Everything else
--    is byte-for-byte the current (#30) function body.
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

  -- Program type is fixed once verified (would strand the badge on the wrong
  -- program). Unverified/onboarding kitchens may still change it.
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
