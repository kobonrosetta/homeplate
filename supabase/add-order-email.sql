-- Store the buyer's email on the order (needed for guest checkout: guests have
-- no account email yet, and it's used for the Stripe receipt + claiming the
-- account afterward). Run in Supabase: SQL Editor -> paste -> Run.

alter table orders add column if not exists contact_email text;
