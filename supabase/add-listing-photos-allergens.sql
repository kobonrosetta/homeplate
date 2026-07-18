-- Extra listing photos (a gallery beyond the cover) + a buyer-facing allergen
-- field. Allergens are cook-declared — the AI description can't know them.
-- Run in Supabase: SQL Editor -> paste -> Run.

alter table listings
  add column if not exists photo_urls text[] not null default '{}',
  add column if not exists allergens text;
