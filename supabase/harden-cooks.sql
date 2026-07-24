-- ============================================================
--  Harden the cooks table + kitchen pause. Run once in
--  Supabase -> SQL Editor. Replay-safe.
--
--  Found while building the pause button (Jul 2026): the
--  "owner manages own kitchen" RLS policy is FOR ALL on the
--  whole row, and RLS filters rows, not columns. So via the
--  REST API a cook's own session could:
--    1) UPDATE their row to status='active' +
--       permit_verified=true — full self-approval, skipping
--       admin review; and
--    2) INSERT a kitchen born 'active' and verified, same hole.
--
--  Same medicine as harden-orders.sql: a trigger limits WHAT an
--  end-user session may change, RLS keeps limiting WHICH rows.
--
--  Also in this migration:
--    - Owners may flip status active <-> paused (the dashboard
--      pause button). All other transitions are server-only.
--    - New 'suspended' status for admin suspension — 'paused'
--      would let the cook just un-pause themselves.
--    - Permit fields become server-written only; the sell
--      wizard's permit step now writes them via the service
--      role (app/sell/actions.ts).
-- ============================================================

-- Admin suspension is distinct from a cook's own pause.
alter type cook_status add value if not exists 'suspended';

-- (1) End-user updates: profile-ish columns only, plus the
--     active <-> paused toggle. Columns added later are
--     protected automatically (the diff ignores only the
--     allow-list).
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
    'delivery_notes', 'avatar_url', 'cover_url', 'updated_at'
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

drop trigger if exists cooks_guard_update on cooks;
create trigger cooks_guard_update
  before update on cooks
  for each row execute procedure public.enforce_cook_update_rules();

-- (2) End-user inserts: kitchens are born pending and unverified.
create or replace function public.enforce_cook_insert_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status is distinct from 'pending'
     or new.permit_verified
     or new.approved_operator_id is not null then
    raise exception 'new kitchens must start pending and unverified';
  end if;

  return new;
end;
$$;

drop trigger if exists cooks_guard_insert on cooks;
create trigger cooks_guard_insert
  before insert on cooks
  for each row execute procedure public.enforce_cook_insert_rules();
