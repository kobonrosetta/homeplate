-- Per-dish "announced to followers" flag, for the digest alert sweep.
--
-- The old inline alert fired on dish insert and a 6h cooldown made it SKIP the
-- 2nd–Nth dish of a posting session, so only the first dish was ever emailed.
-- This column lets a cron sweep gather all of a cook's un-announced dishes into
-- ONE digest, so nothing is silently lost. null = not yet announced.
--
-- Backfill: mark every EXISTING dish announced so the first sweep doesn't email
-- followers about the whole back catalogue. New inserts default to null (the
-- insert doesn't set the column) and get picked up.
--
-- Additive-only; run BEFORE deploying the digest code.

alter table public.listings
  add column if not exists announced_at timestamptz;

update public.listings
  set announced_at = now()
  where announced_at is null;

comment on column public.listings.announced_at is
  'When followers were emailed about this dish (null = pending). Set by the announce-dishes cron sweep.';
