-- ============================================================
--  Optional permit-photo upload — migration 20. Run once in the
--  Supabase SQL editor. Replay-safe.
--
--  A photo of the physical permit shows the holder's name AND
--  address, so unlike listing photos it must NEVER be public.
--  This creates a PRIVATE "permits" bucket, scopes writes to the
--  owner's own {cook.id}/ folder, and grants NO public/anon read
--  — admins view it through a short-lived signed URL generated
--  with the service role (which bypasses RLS).
--
--  The path is stored on cook_private (owner-only table), next to
--  the street address it's as sensitive as.
-- ============================================================

alter table cook_private
  add column if not exists permit_photo_path text;

-- Private bucket (public = false → no anonymous object URLs).
insert into storage.buckets (id, name, public)
values ('permits', 'permits', false)
on conflict (id) do update set public = false;

-- Writes: a cook may add/replace files only inside their own kitchen's folder
-- (upload path is "{cook.id}/{file}", so the first path segment must be a
-- kitchen they own). No SELECT policy is created, so end-user/anon sessions
-- cannot read the bucket at all; the service role reads it to sign URLs.
drop policy if exists "cook uploads own permit photo" on storage.objects;
drop policy if exists "cook updates own permit photo" on storage.objects;
drop policy if exists "cook deletes own permit photo" on storage.objects;

create policy "cook uploads own permit photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'permits'
    and exists (
      select 1 from cooks c
      where c.id::text = (storage.foldername(name))[1]
        and c.profile_id = auth.uid()
    )
  );

create policy "cook updates own permit photo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'permits'
    and exists (
      select 1 from cooks c
      where c.id::text = (storage.foldername(name))[1]
        and c.profile_id = auth.uid()
    )
  );

create policy "cook deletes own permit photo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'permits'
    and exists (
      select 1 from cooks c
      where c.id::text = (storage.foldername(name))[1]
        and c.profile_id = auth.uid()
    )
  );
