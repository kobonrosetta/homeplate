-- ============================================================
--  Sales-tax pilot — migration 23. Run once in the Supabase SQL
--  editor. Replay-safe. Additive only — safe to run BEFORE the
--  matching code deploy (old code ignores the new columns).
--
--  Pilot model: prices are tax-INCLUDED. Each cook remits their
--  own California sales tax on their own CDTFA seller's permit;
--  HomePlate derives the numbers for them (dashboard Taxes card
--  + CSV). Buyers never see a tax line. The marketplace-
--  facilitator flip (HomePlate collects tax at checkout) is
--  deliberately NOT built yet — it needs the CPA answer first.
--
--  1) listings.served_hot — the CA taxability signal (CDTFA
--     Reg. 1603: hot prepared food is taxable; cold/room-temp
--     food sold to-go generally isn't), asked in the listing
--     form as "How is it served?". Only MEHKO kitchens see the
--     control; cottage listings stay false (cottage-food law
--     covers only shelf-stable items, so there is no hot option
--     to ask a baker about).
--
--  2) order_items.served_hot — snapshot at purchase, exactly
--     like title/unit_price_cents: the cook's quarterly tax
--     numbers must not change when a listing is later edited
--     or deleted.
--
--  3) cook_private.cdtfa_permit — the cook's CDTFA seller's-
--     permit number, collected in the sell wizard (optional at
--     submit; checked at admin approval). Lives on cook_private
--     because RLS filters rows, not columns: `cooks` is publicly
--     readable and a tax registration doesn't belong on the
--     anon API.
-- ============================================================

alter table listings
  add column if not exists served_hot boolean not null default false;

alter table order_items
  add column if not exists served_hot boolean not null default false;

alter table cook_private
  add column if not exists cdtfa_permit text;
