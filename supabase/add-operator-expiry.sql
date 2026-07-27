-- ============================================================
--  Real county permit data — migration 19. Run once in the
--  Supabase SQL editor (order relative to 17/18 doesn't matter).
--
--  Adds a permit expiration to approved_operators so an expired
--  permit can't verify a kitchen, and a UNIQUE index on
--  permit_number — integrity, the importer's upsert target, and
--  a fast signup lookup (input is normalized to the stored
--  uppercase form in lib/match.ts, so a plain index suffices).
--
--  The rows themselves are loaded by scripts/import-mehko.mjs
--  (pulls the Santa Clara County MEHKO open-data API), not here.
-- ============================================================

alter table approved_operators
  add column if not exists expires_at date;

-- One row per permit number: integrity + the conflict target the importer
-- upserts on. (Multiple NULLs are still allowed — a permit-less row is fine.)
create unique index if not exists approved_operators_permit_key
  on approved_operators (permit_number);
