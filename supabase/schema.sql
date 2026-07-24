-- ============================================================
--  HomePlate database schema
--  Run this in Supabase: SQL Editor -> New query -> paste -> Run
-- ============================================================

-- ---------- Types (fixed sets of allowed values) ----------
create type operation_type   as enum ('cottage', 'mehko');
create type cook_status       as enum ('pending', 'active', 'paused');
create type listing_category  as enum ('bread', 'pastry', 'dessert', 'meal', 'preserves', 'beverage', 'other');
create type fulfillment_type  as enum ('pickup', 'delivery');
create type order_status      as enum ('pending', 'confirmed', 'ready', 'completed', 'cancelled');

-- ---------- profiles ----------
-- One row per person (buyers AND cooks). Linked to Supabase's built-in auth.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  is_cook     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- approved_operators ----------
-- The county's PUBLIC approved-operator list, scraped + refreshed daily.
-- This is the "verified supply" hook: we check cook signups against it.
create table approved_operators (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  permit_number   text,
  operation_type  operation_type not null,
  county          text not null default 'Santa Clara',
  city            text,
  source_url      text,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- ---------- cooks (the kitchens) ----------
create table cooks (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid not null references profiles(id) on delete cascade,
  business_name         text not null,
  slug                  text unique not null,           -- for the URL, e.g. /kitchen/kates-bread
  bio                   text,
  cuisine_tags          text[] default '{}',
  operation_type        operation_type not null,
  permit_number         text,
  permit_verified       boolean not null default false, -- true once matched to approved list
  approved_operator_id  uuid references approved_operators(id),
  county                text not null default 'Santa Clara',
  city                  text,
  zip                   text,
  pickup_available      boolean not null default true,
  delivery_available    boolean not null default false,
  delivery_notes        text,
  avatar_url            text,
  cover_url             text,
  stripe_account_id     text,                            -- their Stripe Connect account
  status                cook_status not null default 'pending',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------- cook_private (home address + geocoding — NEVER public) ----------
-- Kept out of `cooks` because RLS filters rows, not columns: anything on a
-- publicly-readable table is readable column-by-column via the anon API.
create table cook_private (
  cook_id        uuid primary key references cooks(id) on delete cascade,
  street_address text,
  latitude       double precision,
  longitude      double precision,
  updated_at     timestamptz not null default now()
);

-- ---------- listings (the items for sale) ----------
create table listings (
  id                   uuid primary key default gen_random_uuid(),
  cook_id              uuid not null references cooks(id) on delete cascade,
  title                text not null,
  description          text,                              -- AI can draft this
  category             listing_category not null default 'other',
  price_cents          integer not null check (price_cents >= 0),
  photo_url            text,
  photo_quality_score  smallint,                          -- 0-100, set by the AI photo check
  quantity_available   integer not null default 0,        -- inventory
  is_available         boolean not null default true,     -- the out-of-office / OOO toggle
  lead_time_note       text,                              -- e.g. "Order by Fri for Sun pickup"
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------- orders ----------
create table orders (
  id                        uuid primary key default gen_random_uuid(),
  buyer_id                  uuid not null references profiles(id),
  cook_id                   uuid not null references cooks(id),
  status                    order_status not null default 'pending',
  fulfillment               fulfillment_type not null default 'pickup',
  subtotal_cents            integer not null,   -- cook keeps 100% of this
  service_fee_cents         integer not null,   -- HomePlate's 8% + $0.30
  total_cents               integer not null,   -- subtotal + service fee (what the buyer pays)
  stripe_payment_intent_id  text,
  pickup_time               text,
  notes                     text,
  created_at                timestamptz not null default now()
);

-- ---------- order_items (the lines inside an order) ----------
create table order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  listing_id        uuid references listings(id) on delete set null,
  title             text not null,             -- snapshot, in case the listing later changes
  unit_price_cents  integer not null,
  quantity          integer not null check (quantity > 0),
  line_total_cents  integer not null
);

-- ---------- reviews ----------
create table reviews (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  buyer_id    uuid not null references profiles(id),
  cook_id     uuid not null references cooks(id),
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

-- ---------- indexes (make common lookups fast) ----------
create index on listings (cook_id);
create index on orders (buyer_id);
create index on orders (cook_id);
create index on order_items (order_id);
create index on reviews (cook_id);
create index on cooks (status);

-- ============================================================
--  Row Level Security (RLS)
--  Supabase locks every table by default. These policies say
--  who is allowed to read/write what.
-- ============================================================
alter table profiles           enable row level security;
alter table cooks              enable row level security;
alter table cook_private       enable row level security;
alter table listings           enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table reviews            enable row level security;
alter table approved_operators enable row level security;

-- profiles: you can see and edit only your own.
create policy "own profile - select" on profiles for select using (auth.uid() = id);
create policy "own profile - insert" on profiles for insert with check (auth.uid() = id);
create policy "own profile - update" on profiles for update using (auth.uid() = id);

-- cooks: anyone can view ACTIVE kitchens; the owner manages their own.
create policy "active cooks are public" on cooks
  for select using (status = 'active' or profile_id = auth.uid());
create policy "owner manages own kitchen" on cooks
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- cook_private: only the owner can read/write their home address.
create policy "owner reads own private" on cook_private
  for select using (
    exists (select 1 from cooks c where c.id = cook_private.cook_id and c.profile_id = auth.uid())
  );
create policy "owner writes own private" on cook_private
  for all using (
    exists (select 1 from cooks c where c.id = cook_private.cook_id and c.profile_id = auth.uid())
  ) with check (
    exists (select 1 from cooks c where c.id = cook_private.cook_id and c.profile_id = auth.uid())
  );

-- listings: anyone can view available items; the owning cook manages their own.
create policy "available listings are public" on listings
  for select using (
    is_available = true
    or exists (select 1 from cooks c where c.id = listings.cook_id and c.profile_id = auth.uid())
  );
create policy "cook manages own listings" on listings
  for all using (
    exists (select 1 from cooks c where c.id = listings.cook_id and c.profile_id = auth.uid())
  ) with check (
    exists (select 1 from cooks c where c.id = listings.cook_id and c.profile_id = auth.uid())
  );

-- orders: a buyer sees their own; a cook sees orders for their kitchen.
create policy "buyer and cook see their orders" on orders
  for select using (
    buyer_id = auth.uid()
    or exists (select 1 from cooks c where c.id = orders.cook_id and c.profile_id = auth.uid())
  );
-- Orders are born 'pending' with amounts that add up — confirmation
-- (pending -> confirmed) only ever happens server-side after Stripe
-- verifies payment. Blocks forged "completed" orders, which would
-- otherwise unlock forged reviews.
create policy "buyer creates own order" on orders
  for insert with check (
    buyer_id = auth.uid()
    and status = 'pending'
    and subtotal_cents >= 0
    and service_fee_cents >= 0
    and total_cents = subtotal_cents + service_fee_cents
  );

-- order_items: visible to whoever can see the parent order.
create policy "order items follow the order" on order_items
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (o.buyer_id = auth.uid()
             or exists (select 1 from cooks c where c.id = o.cook_id and c.profile_id = auth.uid()))
    )
  );

-- approved_operators: public read so signup can check a permit; writes via service role only.
create policy "approved operators are public" on approved_operators
  for select using (true);

-- reviews: anyone can read; a buyer can write a review for their own order.
create policy "reviews are public" on reviews for select using (true);
-- A review must be tied to a COMPLETED order owned by the reviewer, whose cook
-- matches. Blocks fake/competitor reviews via the raw API.
create policy "buyer reviews own completed order" on reviews
  for insert with check (
    buyer_id = auth.uid()
    and exists (
      select 1 from orders o
      where o.id = reviews.order_id
        and o.buyer_id = auth.uid()
        and o.cook_id = reviews.cook_id
        and o.status = 'completed'
    )
  );

-- ============================================================
--  Auto-create a profile row whenever someone signs up.
--  Runs as the database owner so it bypasses RLS during signup.
-- ============================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
--  Order policies needed for checkout + the order lifecycle.
-- ============================================================

-- A buyer can add line items to an order that belongs to them.
create policy "buyer adds items to own order" on order_items
  for insert with check (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id and o.buyer_id = auth.uid()
    )
  );

-- A cook can update orders for their own kitchen (advance the status).
create policy "cook updates own kitchen orders" on orders
  for update using (
    exists (select 1 from cooks c where c.id = orders.cook_id and c.profile_id = auth.uid())
  ) with check (
    exists (select 1 from cooks c where c.id = orders.cook_id and c.profile_id = auth.uid())
  );

-- ============================================================
--  Orders may only change status, and only along the lifecycle.
--  RLS limits WHICH rows a cook can touch; this trigger limits
--  WHAT they can change: money columns feed the manual payout
--  ledger, and pending -> confirmed must stay server-only (the
--  service role confirms after Stripe verifies payment).
-- ============================================================
create or replace function public.enforce_order_update_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- The Postgres role PostgREST switched into for this request:
  -- 'authenticated'/'anon' for end users, 'service_role' for the server
  -- (Stripe-verified confirmation), 'postgres' in the SQL editor. Using the
  -- role directly avoids depending on which JWT-claims GUC this instance sets.
  req_role text := current_user;
begin
  if req_role not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'only order status may be changed';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'confirmed' and new.status in ('ready', 'completed', 'cancelled'))
    or (old.status = 'ready'     and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'illegal order status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_update on orders;
create trigger orders_guard_update
  before update on orders
  for each row execute procedure public.enforce_order_update_rules();
