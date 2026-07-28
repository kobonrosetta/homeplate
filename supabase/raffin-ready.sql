-- ============================================================
--  "Raffin-ready" batch — migration 22. Run once in the
--  Supabase SQL editor. Replay-safe.
--
--  Three features, one migration:
--
--  1) PAYMENT LINKS (custom_requests): a cook quotes a one-off
--     custom order in DMs, then mints a pay link instead of
--     naming a Venmo handle. The token is the capability — there
--     is NO public SELECT policy; the /pay/[token] page reads the
--     row server-side with the service role. End-user sessions
--     may INSERT their own requests (born 'open') and may only
--     ever flip open→cancelled (guard trigger, house style);
--     'paid'/'expired' are service-role-only outcomes.
--
--  2) EXTRAS (listings.kind): non-food add-ons (insulated tote,
--     cake lettering). 'extra' listings skip the AI food-photo
--     gate in app code and render in their own strip.
--
--  3) ITEM OPTIONS (listing_option_groups/listing_options):
--     cook-defined single-select dropdowns with price deltas
--     (sizes, characters, stamps). Public read (they're menu
--     data); writes only by the listing's owner. The buyer's
--     price is ALWAYS re-derived server-side at checkout —
--     these tables are the authoritative source the server
--     reads, exactly like listings.price_cents today.
-- ============================================================

-- ---------- 1) payment links ----------
create table if not exists custom_requests (
  id                uuid primary key default gen_random_uuid(),
  cook_id           uuid not null references cooks(id) on delete cascade,
  token             text unique not null,
  title             text not null,
  price_cents       integer not null check (price_cents > 0),      -- charged now
  full_price_cents  integer check (full_price_cents >= price_cents), -- informational when deposit
  charge_kind       text not null default 'full' check (charge_kind in ('full', 'deposit')),
  pickup_date       text,
  note              text,
  status            text not null default 'open' check (status in ('open', 'paid', 'cancelled', 'expired')),
  expires_at        timestamptz not null default now() + interval '7 days',
  created_at        timestamptz not null default now()
);

alter table custom_requests enable row level security;

drop policy if exists "cook creates own payment requests" on custom_requests;
create policy "cook creates own payment requests" on custom_requests
  for insert with check (
    status = 'open'
    and exists (
      select 1 from cooks c
      where c.id = custom_requests.cook_id and c.profile_id = auth.uid()
    )
  );

drop policy if exists "cook reads own payment requests" on custom_requests;
create policy "cook reads own payment requests" on custom_requests
  for select using (
    exists (
      select 1 from cooks c
      where c.id = custom_requests.cook_id and c.profile_id = auth.uid()
    )
  );

drop policy if exists "cook updates own payment requests" on custom_requests;
create policy "cook updates own payment requests" on custom_requests
  for update using (
    exists (
      select 1 from cooks c
      where c.id = custom_requests.cook_id and c.profile_id = auth.uid()
    )
  );

-- End-user updates: cancel only, nothing else (see harden-orders.sql for the
-- role-detection rationale). paid/expired are set by the service role.
create or replace function public.enforce_custom_request_update_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'only the request status may be changed';
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'open' and new.status = 'cancelled') then
    raise exception 'illegal payment-request transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists custom_requests_guard_update on custom_requests;
create trigger custom_requests_guard_update
  before update on custom_requests
  for each row execute procedure public.enforce_custom_request_update_rules();

alter table orders
  add column if not exists custom_request_id uuid references custom_requests(id) on delete set null;

-- ---------- 2) extras ----------
alter table listings
  add column if not exists kind text not null default 'dish'
  check (kind in ('dish', 'extra'));

-- ---------- 3) item options ----------
create table if not exists listing_option_groups (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references listings(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists listing_options (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references listing_option_groups(id) on delete cascade,
  name               text not null,
  price_delta_cents  integer not null default 0 check (price_delta_cents >= 0),
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists listing_option_groups_listing_idx on listing_option_groups (listing_id);
create index if not exists listing_options_group_idx on listing_options (group_id);

alter table listing_option_groups enable row level security;
alter table listing_options enable row level security;

-- Menu data is public (buyers need it to pick + price an item)...
drop policy if exists "option groups are public" on listing_option_groups;
create policy "option groups are public" on listing_option_groups
  for select using (true);

drop policy if exists "options are public" on listing_options;
create policy "options are public" on listing_options
  for select using (true);

-- ...but only the listing's owner writes them (same ownership chain as
-- the storage policies: listing -> cook -> profile).
drop policy if exists "cook manages own option groups" on listing_option_groups;
create policy "cook manages own option groups" on listing_option_groups
  for all using (
    exists (
      select 1 from listings l join cooks c on c.id = l.cook_id
      where l.id = listing_option_groups.listing_id and c.profile_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from listings l join cooks c on c.id = l.cook_id
      where l.id = listing_option_groups.listing_id and c.profile_id = auth.uid()
    )
  );

drop policy if exists "cook manages own options" on listing_options;
create policy "cook manages own options" on listing_options
  for all using (
    exists (
      select 1 from listing_option_groups g
      join listings l on l.id = g.listing_id
      join cooks c on c.id = l.cook_id
      where g.id = listing_options.group_id and c.profile_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from listing_option_groups g
      join listings l on l.id = g.listing_id
      join cooks c on c.id = l.cook_id
      where g.id = listing_options.group_id and c.profile_id = auth.uid()
    )
  );
