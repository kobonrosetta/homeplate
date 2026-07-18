-- ============================================================
--  Make the signup trigger work for Google sign-ins too.
--  Run this once in Supabase -> SQL Editor.
--
--  Email signups put the person's name in "full_name". Google sends it as
--  "name". This makes the trigger accept either, so a Google user still gets
--  a proper profile row with their name.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    )
  );
  return new;
end;
$$;
