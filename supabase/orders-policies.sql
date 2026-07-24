-- ============================================================
--  Missing order policies — REQUIRED before checkout works.
--  Run this once in Supabase -> SQL Editor.
--
--  Without these:
--    * writing an order's line items is denied by security rules
--      (every checkout would fail), and
--    * a cook can never advance an order's status.
-- ============================================================

-- A buyer can add line items to an order that belongs to them.
drop policy if exists "buyer adds items to own order" on order_items;
create policy "buyer adds items to own order" on order_items
  for insert with check (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id and o.buyer_id = auth.uid()
    )
  );

-- A cook can update orders for their own kitchen (confirmed -> ready -> completed).
drop policy if exists "cook updates own kitchen orders" on orders;
create policy "cook updates own kitchen orders" on orders
  for update using (
    exists (select 1 from cooks c where c.id = orders.cook_id and c.profile_id = auth.uid())
  ) with check (
    exists (select 1 from cooks c where c.id = orders.cook_id and c.profile_id = auth.uid())
  );
