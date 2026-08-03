-- ============================================================
--  Harden cook_private column writes. Migration #38.
--  Run in Supabase -> SQL Editor. Replay-safe.
--
--  Found in the targeted security review (Aug 2026): the
--  "owner writes own private" policy on cook_private is FOR ALL
--  on the whole row, and RLS filters rows, not columns. So a
--  cook's own session could PATCH cook_private.permit_photo_path
--  to point at ANOTHER cook's storage object. No data reaches the
--  attacker (the permit photo is shown, via a signed URL, only to
--  the admin during review) — but the admin would then see the
--  wrong permit (a stranger's name/address) while reviewing this
--  kitchen: a review-integrity problem.
--
--  Same medicine as harden-cooks.sql: a trigger limits WHICH
--  columns an end-user session may write; RLS keeps limiting WHICH
--  rows. permit_photo_path (and the never-user-written lat/long)
--  become server-managed. The sell wizard already writes the photo
--  path via the service role (app/sell/actions.ts) — the caller's
--  OWN, server-derived path.
--
--  ⚠️ DEPLOY ORDER: ship the CODE first (the wizard now writes
--  permit_photo_path via the service role), THEN run this. If this
--  runs while the old code is live, the wizard's end-user upsert of
--  permit_photo_path is rejected and permit-photo submit breaks.
--  Running it after the code deploy is always safe.
-- ============================================================

create or replace function public.enforce_cook_private_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- 'authenticated'/'anon' for end users; 'service_role' for the server and
  -- 'postgres' in the SQL editor bypass (see harden-orders.sql).
  req_role text := current_user;
  -- Columns a cook's own session may write. Anything else on the row
  -- (permit_photo_path, latitude, longitude) is server-managed. Columns added
  -- later are protected automatically — they just aren't on this list.
  editable text[] := array[
    'cook_id', 'street_address', 'cdtfa_permit', 'pickup_location', 'updated_at'
  ];
begin
  if req_role not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A cook creates their row with editable fields only; the server-managed
    -- columns must start empty (the service role sets permit_photo_path after).
    if new.permit_photo_path is not null
       or new.latitude is not null
       or new.longitude is not null then
      raise exception 'this private column is server-managed';
    end if;
    return new;
  end if;

  -- UPDATE: every non-editable column must be byte-for-byte unchanged.
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'this private column is protected';
  end if;

  return new;
end;
$$;

drop trigger if exists cook_private_guard on cook_private;
create trigger cook_private_guard
  before insert or update on cook_private
  for each row execute procedure public.enforce_cook_private_rules();
