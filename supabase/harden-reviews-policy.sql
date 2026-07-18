-- Stop review forgery / review-bombing.
-- The old policy only checked buyer_id = auth.uid(), so a user could spawn a
-- throwaway order against ANY cook and post a fake (e.g. 1-star) review.
-- New rule: a review must be tied to a COMPLETED order that belongs to the
-- reviewer and whose cook matches. Only a kitchen's own cook can mark an order
-- completed, so a competitor's spawned order stays 'pending' and is unreviewable.
-- Run in Supabase: SQL Editor -> paste -> Run.

drop policy if exists "buyer writes own review" on reviews;

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
