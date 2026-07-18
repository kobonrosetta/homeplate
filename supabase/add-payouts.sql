-- Manual payout ledger: each row is a payment you sent a cook. "Owed" = what
-- they earned on fulfilled orders minus what you've recorded here. Admin-only
-- (RLS on, no anon/authenticated policies; the service-role key bypasses RLS).
-- Run in Supabase: SQL Editor -> paste -> Run.

create table if not exists payouts (
  id           uuid primary key default gen_random_uuid(),
  cook_id      uuid not null references cooks(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  note         text,
  created_at   timestamptz not null default now()
);

alter table payouts enable row level security;
create index if not exists payouts_cook_id_idx on payouts (cook_id);
