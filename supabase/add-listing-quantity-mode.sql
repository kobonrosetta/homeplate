-- Inventory mode for listings.
--   limited_quantity = false  → "made to order" (no cap; quantity_available ignored)
--   limited_quantity = true   → track quantity_available; it counts down on each
--                               paid order and shows "Sold out" at zero.
-- Run in Supabase: SQL Editor -> paste -> Run.

alter table listings
  add column if not exists limited_quantity boolean not null default false;
