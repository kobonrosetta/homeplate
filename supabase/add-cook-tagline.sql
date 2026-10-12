-- Migration 42: cooks.tagline — a cook-editable one-line storefront intro.
--
-- Shown in the new "chef strip" at the top of the kitchen page (face + one
-- line of story above the menu); the full bio stays in "Meet the chef".
-- Falls back in code to the first sentence of the bio when empty, so the
-- strip works before the cook ever touches the new field.
--
-- Also re-issues enforce_cook_update_rules byte-for-byte from its current
-- (#39, add-listing-availability.sql) body PLUS 'tagline' in editable[] —
-- without that, the cooks_guard_update trigger would reject the Settings
-- save of the new field ("this kitchen column is protected").

alter table cooks add column if not exists tagline text;

create or replace function public.enforce_cook_update_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  req_role text := current_user;
  editable text[] := array[
    'business_name', 'owner_name', 'bio', 'tagline', 'cuisine_tags',
    'operation_type', 'city', 'zip', 'pickup_available',
    'delivery_available', 'delivery_notes', 'pickup_windows', 'neighborhood',
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
