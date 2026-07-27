-- ============================================================
--  Permits bucket: server-writes-only + bucket-level limits —
--  migration 21. Run once in the Supabase SQL editor. Replay-safe.
--
--  Permit-photo uploads moved fully server-side (service role,
--  lib/listings.ts) in Jul 2026 — the server action derives the
--  cook's own folder from their login, so end-user sessions no
--  longer need ANY write access to this bucket. Dropping the
--  write policies makes the private bucket strictly
--  server-controlled: no SELECT policy (never readable by end
--  users/anon) and now no INSERT/UPDATE/DELETE either.
--
--  Bucket-level constraints are enforced by Storage even for
--  service-role uploads — a second layer on top of the
--  server-side MIME/size validation.
-- ============================================================

drop policy if exists "cook uploads own permit photo" on storage.objects;
drop policy if exists "cook updates own permit photo" on storage.objects;
drop policy if exists "cook deletes own permit photo" on storage.objects;

update storage.buckets
set
  public = false,
  file_size_limit = 10485760, -- 10MB
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp',
    'image/heic', 'image/heif', 'application/pdf'
  ]
where id = 'permits';
