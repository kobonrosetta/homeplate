-- ============================================================
--  Storage access for listing photos.
--  Run AFTER creating the public bucket named "listing-photos".
--  Public read is automatic (public bucket). These lock WRITES so a cook can
--  only add/replace/remove photos inside their OWN kitchen's folder — the
--  upload path is "{cook.id}/{file}", so the first path folder must be a
--  kitchen owned by the current user.
--  Safe to re-run.
-- ============================================================

-- Remove the old, too-permissive policies (they checked only the bucket).
drop policy if exists "signed-in users can upload listing photos" on storage.objects;
drop policy if exists "signed-in users can update listing photos" on storage.objects;
drop policy if exists "signed-in users can delete listing photos" on storage.objects;

-- ...and any prior run of the scoped policies below.
drop policy if exists "cook uploads own listing photos" on storage.objects;
drop policy if exists "cook updates own listing photos" on storage.objects;
drop policy if exists "cook deletes own listing photos" on storage.objects;

create policy "cook uploads own listing photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from cooks c
      where c.id::text = (storage.foldername(name))[1]
        and c.profile_id = auth.uid()
    )
  );

create policy "cook updates own listing photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from cooks c
      where c.id::text = (storage.foldername(name))[1]
        and c.profile_id = auth.uid()
    )
  );

create policy "cook deletes own listing photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from cooks c
      where c.id::text = (storage.foldername(name))[1]
        and c.profile_id = auth.uid()
    )
  );
