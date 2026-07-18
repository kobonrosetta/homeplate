-- ============================================================
--  Add a private street address to kitchens (+ optional coordinates
--  for future distance search). Run once in Supabase -> SQL Editor.
--
--  IMPORTANT:
--    * The street address is PRIVATE — never shown publicly. Only the
--      city/area is public; the exact address is revealed to a buyer
--      only after they place an order.
--    * Run this BEFORE creating or editing kitchens, or those saves fail
--      (the column won't exist yet).
-- ============================================================

alter table cooks
  add column if not exists street_address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
