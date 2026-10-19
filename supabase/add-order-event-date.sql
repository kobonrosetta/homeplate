-- Migration 43: orders.event_date — the buyer-stated date a DELIVERY order is
-- actually for (a party, an office lunch), as opposed to ready_by_date, which
-- is computed from listing lead times and caps out ~2 weeks — provably wrong
-- for a Dec-20 event ordered Dec 1, yet printed as "For: <date>" in every
-- email and order surface. Optional; collected on the delivery branch of
-- checkout at first, and on the PICKUP branch too since Oct 18 2026 (a
-- pre-booked pickup date, validated against the kitchen's handoff days); all
-- surfaces prefer it over ready_by_date when present.
-- Additive and insert-path only (the orders UPDATE trigger is unaffected).

alter table orders add column if not exists event_date date;
