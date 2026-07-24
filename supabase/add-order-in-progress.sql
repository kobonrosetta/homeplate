-- ============================================================
--  "Never miss an order" — migration 18. Run once in the
--  Supabase SQL editor, AFTER harden-cooks.sql (17).
--
--  1) New 'in_progress' order status: the cook's "I'm on it"
--     acknowledgment between paid and ready. Buyers see the
--     cook has seen their order; the reminder job knows when
--     to stop nagging.
--  2) orders.reminder_sent_at — set by the reminder job
--     (service role) so each order is reminded at most once.
--     The harden-orders trigger already blocks end users from
--     touching any non-status column, including this one.
--  3) Re-issues enforce_order_update_rules with the new legal
--     transitions (replaces the version from harden-orders.sql;
--     on a fresh database run 16 first, then this).
--
--  If the editor complains about "unsafe use of new value" of
--  the enum, run the ALTER TYPE line by itself first, then the
--  rest of the file.
-- ============================================================

alter type order_status add value if not exists 'in_progress' before 'ready';

alter table orders add column if not exists reminder_sent_at timestamptz;

create or replace function public.enforce_order_update_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- 'authenticated'/'anon' for end users, 'service_role' for the server,
  -- 'postgres' in the SQL editor (see harden-orders.sql).
  req_role text := current_user;
begin
  if req_role not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'only order status may be changed';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'confirmed'   and new.status in ('in_progress', 'ready', 'completed', 'cancelled'))
    or (old.status = 'in_progress' and new.status in ('ready', 'completed', 'cancelled'))
    or (old.status = 'ready'       and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'illegal order status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;
