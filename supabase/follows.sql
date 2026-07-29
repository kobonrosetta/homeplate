-- Follows + drop alerts — the retention loop.
--
-- Home-food buyers are repeat customers of one specific cook. A signed-in
-- buyer can follow a kitchen; when the cook posts a new dish, followers get
-- one email (debounced server-side via cooks.followers_notified_at so a cook
-- adding five dishes in an afternoon sends one alert, not five).
--
-- Privacy: rows are owner-only (a cook cannot list who follows them; nobody
-- can read anyone else's follows). `email` is snapshotted from the follower's
-- auth session at follow time — server-derived, never from form input —
-- because profiles has no email column and the notifier (service role) needs
-- somewhere to send. Guests (anonymous sessions) cannot follow: they have no
-- email to alert.
--
-- Additive-only; run BEFORE deploying the code that uses it (the follow
-- button's insert and the notifier both need the table).

create table if not exists follows (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  cook_id     uuid not null references cooks(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now(),
  unique (profile_id, cook_id)
);

create index if not exists follows_cook_idx on follows(cook_id);

alter table follows enable row level security;

drop policy if exists "follows: read own" on follows;
create policy "follows: read own" on follows
  for select using (auth.uid() = profile_id);

drop policy if exists "follows: insert own" on follows;
create policy "follows: insert own" on follows
  for insert with check (
    auth.uid() = profile_id
    -- guest-checkout sessions have no email; a follow from one is dead weight
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    -- only live kitchens can be followed
    and exists (select 1 from cooks c where c.id = cook_id and c.status = 'active')
  );

drop policy if exists "follows: delete own" on follows;
create policy "follows: delete own" on follows
  for delete using (auth.uid() = profile_id);

-- Debounce stamp for follower alerts. Written by the service role only — the
-- cooks_guard_update allow-list (#17/#24) does not include it, so end-user
-- sessions are blocked from touching it automatically.
alter table public.cooks
  add column if not exists followers_notified_at timestamptz;
