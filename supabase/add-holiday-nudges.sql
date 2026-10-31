-- Migration 44: holiday_nudges — one row per kitchen per holiday once the
-- "Taking Thanksgiving orders? Add your pickup day" email has gone out, so the
-- daily job (/api/cron/holiday-nudge) never sends it twice. The job claims the
-- row BEFORE sending (the primary key makes a second claim fail) and deletes
-- it again if the send fails, so tomorrow's run retries.
--
-- SERVICE-ROLE ONLY: RLS on with zero policies, like waitlist / cook_stripe —
-- the anon and authenticated keys can neither read nor write it.
-- Additive; nothing else changes. Safe to re-run.

create table if not exists holiday_nudges (
  cook_id uuid not null references cooks(id) on delete cascade,
  holiday_key text not null, -- e.g. 'thanksgiving-2026'
  sent_at timestamptz not null default now(),
  primary key (cook_id, holiday_key)
);

alter table holiday_nudges enable row level security;
