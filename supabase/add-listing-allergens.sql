-- ============================================================
--  Structured dish-level allergens (Phase 1). Run once in
--  Supabase -> SQL Editor. Replay-safe.
--
--  The old model was a single OPTIONAL free-text `allergens`
--  column: unfilterable, inconsistent between cooks, and — worst —
--  a blank silently read as "allergen-free" when it actually meant
--  "the cook didn't say". This adds a structured, affirmative model:
--    - contains         : the allergens the dish HAS (from lib/allergens.ts)
--    - may_contain      : cross-contact ("kitchen also handles these")
--    - allergens_declared: the cook affirmatively completed the checklist
--                          (or confirmed none) — so blank != "safe".
--
--  The free-text `allergens` column is KEPT, repurposed in the UI as
--  optional supplemental notes.
-- ============================================================

alter table listings
  add column if not exists contains            text[]  not null default '{}',
  add column if not exists may_contain         text[]  not null default '{}',
  add column if not exists allergens_declared  boolean not null default false;

-- No RLS change: these are plain columns on `listings`, written by the same
-- owner-session insert/update paths that already write `allergens`. Existing
-- rows keep allergens_declared=false, so the listing page shows "not listed —
-- ask the chef" for them (never a false "allergen-free").
