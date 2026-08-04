-- Buyer waitlist — demand capture for the (pre-launch / thin-supply) browse page.
--
-- A logged-out visitor who lands on Browse before there are kitchens near them
-- can leave an email (+ optional zip) to be notified when a verified kitchen
-- opens in their area. The list doubles as the sharpest cook-recruiting asset
-- ("40 people are waiting within 3 miles of you"), so we keep zip from day one.
--
-- SERVICE-ROLE ONLY, exactly like `payouts` and `cook_stripe`: RLS is ON with
-- ZERO policies, so the anon/authenticated keys can neither read nor write the
-- table over the REST API (nobody can scrape the email list). The "Get notified"
-- form posts to a server action that writes via the service role, and the admin
-- count/export reads via the service role. This is the same rows-not-columns
-- discipline the rest of the app follows — a waitlist row is an email address,
-- so it must never be publicly readable.

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  zip        text,          -- optional 5-digit US zip; powers area matching + per-neighborhood recruiting
  city       text,          -- optional, if we later resolve it
  source     text not null default 'browse',  -- where the signup came from (server-set, not client-trusted)
  created_at timestamptz not null default now()
);

-- Dedupe on the normalized email. The server action lowercases/trims before
-- insert, so a plain unique on `email` is enough (and lets supabase-js upsert
-- with onConflict:'email' / ON CONFLICT DO NOTHING treat a re-submit as an
-- idempotent success rather than an error).
create unique index if not exists waitlist_email_key on public.waitlist (email);
create index if not exists waitlist_created_idx on public.waitlist (created_at desc);

-- RLS on, no policies → only the service role can touch it.
alter table public.waitlist enable row level security;
