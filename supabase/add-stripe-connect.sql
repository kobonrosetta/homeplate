-- Stripe Connect (Express) — automated cook payouts. Migration #33.
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to re-run.
--
-- Cooks are paid automatically at checkout via a Connect *destination charge*:
-- the cook receives 100% of their listed price (order.subtotal), ForkFork keeps
-- the service fee (application_fee), Stripe's cut comes out of ForkFork's fee.
-- This table holds each cook's connected-account id + onboarding status. Like
-- `payouts`, it is SERVICE-ROLE ONLY (RLS on, no anon/authenticated policies) so
-- the account id can never be read column-by-column off the public REST API.

create table if not exists cook_stripe (
  cook_id           uuid primary key references cooks(id) on delete cascade,
  stripe_account_id text,
  -- The destination-charge readiness signal is the TRANSFERS capability being
  -- active (NOT charges_enabled — a transfers-only Express account keeps
  -- charges_enabled=false forever). payouts_enabled means funds reach their bank.
  transfers_active  boolean not null default false,
  payouts_enabled   boolean not null default false,
  details_submitted boolean not null default false,
  disabled_reason   text,                                  -- why Stripe is holding them, if any
  updated_at        timestamptz not null default now()
);

alter table cook_stripe enable row level security;
create unique index if not exists cook_stripe_account_id_idx
  on cook_stripe (stripe_account_id);

-- Public-safe gate flag: true once the cook can actually receive money and get
-- paid out. Drives browse visibility, the checkout gate, and the dashboard nudge.
-- Written ONLY by the service role (the account.updated webhook). It is NOT in
-- the enforce_cook_update_rules editable[] allow-list, so a cook session can't
-- forge it (the trigger raises 'protected'); the service role bypasses the trigger.
alter table cooks add column if not exists stripe_ready boolean not null default false;

-- The account id now lives in cook_stripe (service-role only). The old public
-- column was unused (all null) and would have leaked acct_ ids via the anon key.
alter table cooks drop column if exists stripe_account_id;

-- The UPDATE trigger's allow-list already blocks a cook session from flipping
-- stripe_ready, but INSERT goes through enforce_cook_insert_rules (a deny-list,
-- harden-cooks.sql) — without this re-issue, a crafted REST insert could be born
-- with stripe_ready=true and, once approved, pass every visibility/checkout gate
-- without ever completing Stripe onboarding. Same body as the current function
-- plus the one new check.
create or replace function public.enforce_cook_insert_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status is distinct from 'pending'
     or new.permit_verified
     or new.approved_operator_id is not null
     or new.stripe_ready then
    raise exception 'new kitchens must start pending and unverified';
  end if;

  return new;
end;
$$;
