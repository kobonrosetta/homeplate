-- Order contact snapshot.
-- The cook can't read a buyer's profile row (RLS blocks it), so we snapshot the
-- contact details the cook needs onto the order itself — revealed only after the
-- order exists (i.e. after payment). Run in Supabase: SQL Editor -> paste -> Run.

alter table orders
  add column if not exists contact_name    text,
  add column if not exists contact_phone   text,
  add column if not exists delivery_address text;
