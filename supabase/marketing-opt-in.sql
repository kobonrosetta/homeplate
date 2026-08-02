-- ============================================================================
-- marketing-opt-in.sql — capture a marketing-email opt-in at signup
-- ============================================================================
-- Adds profiles.marketing_opt_in and teaches the signup trigger to set it from
-- the checkbox on the signup form (passed through auth user metadata, so it
-- works for both email/password and — defaulting to false — Google signups).
--
-- The value is captured for LATER export into an email tool (Resend Broadcasts
-- etc.) — the app never sends marketing itself. To pull your opted-in list:
--   select u.email
--   from public.profiles p
--   join auth.users u on u.id = p.id
--   where p.marketing_opt_in = true;
--
-- Re-runnable. Ship the CODE first (the signup form/action just add harmless
-- metadata); running this before or after the code deploy is both safe — the
-- app never references the column directly, only this trigger does.
-- ============================================================================

alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false;

-- Update the signup trigger to also copy the opt-in from metadata. Preserves
-- the existing full_name behavior; only adds the new column.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, marketing_opt_in)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false)
  );
  return new;
end;
$$;
-- (The on_auth_user_created trigger already points at this function — no need
-- to recreate it.)
