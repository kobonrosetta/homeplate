-- Lock down cook home addresses.
-- RLS filters ROWS, not COLUMNS — so while street_address sits on the publicly
-- readable `cooks` table, anyone with the anon key can read it column-by-column
-- via the REST API. Move the private fields into their own owner-only table.
-- Run in Supabase: SQL Editor -> paste -> Run.

create table if not exists cook_private (
  cook_id        uuid primary key references cooks(id) on delete cascade,
  street_address text,
  latitude       double precision,
  longitude      double precision,
  updated_at     timestamptz not null default now()
);

alter table cook_private enable row level security;

-- Only the kitchen's owner can read/write their own private row. The
-- service-role key (used server-side to reveal the address to a buyer AFTER
-- they pay) bypasses RLS, so the post-order reveal still works.
drop policy if exists "owner reads own private" on cook_private;
create policy "owner reads own private" on cook_private
  for select using (
    exists (select 1 from cooks c
            where c.id = cook_private.cook_id and c.profile_id = auth.uid())
  );

drop policy if exists "owner writes own private" on cook_private;
create policy "owner writes own private" on cook_private
  for all using (
    exists (select 1 from cooks c
            where c.id = cook_private.cook_id and c.profile_id = auth.uid())
  ) with check (
    exists (select 1 from cooks c
            where c.id = cook_private.cook_id and c.profile_id = auth.uid())
  );

-- Move any existing addresses across, then drop the public columns for good.
insert into cook_private (cook_id, street_address, latitude, longitude)
  select id, street_address, latitude, longitude
  from cooks
  where street_address is not null or latitude is not null or longitude is not null
  on conflict (cook_id) do nothing;

alter table cooks
  drop column if exists street_address,
  drop column if exists latitude,
  drop column if exists longitude;
