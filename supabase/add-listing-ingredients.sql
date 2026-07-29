-- Optional per-listing ingredients list.
--
-- Shown on the item page only when the cook filled it in. Two reasons it
-- exists: buyers with allergies read ingredient lists, and California cottage
-- food labels legally require one — this is the one label field HomePlate
-- didn't already hold, so it's quietly step one of the future printable-label
-- generator for bakers.
--
-- Additive-only; run BEFORE deploying the code that writes it (creating or
-- editing a listing includes the column in its insert/update).

alter table public.listings
  add column if not exists ingredients text;

comment on column public.listings.ingredients is
  'Optional cook-entered ingredient list; shown on the listing page when present, future source for cottage-label printing.';
