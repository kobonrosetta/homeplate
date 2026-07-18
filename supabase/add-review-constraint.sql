-- Optional hardening: one review per order at the database level.
-- The app already checks before inserting, but this makes it airtight even if
-- two review submissions race. Run in Supabase: SQL Editor -> paste -> Run.

create unique index if not exists reviews_one_per_order
  on reviews (order_id);
