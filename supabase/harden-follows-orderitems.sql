-- Harden two RLS policies on the newer tables (follows, order_items) that each
-- left a client-supplied column unconstrained — surfaced by the full-codebase
-- security review. Both changes only REJECT the attack shapes; every legitimate
-- flow (the follow button, checkout, the pay-link) already satisfies the tighter
-- checks, so this is migration-first-safe and needs no code change. Re-issues
-- each policy (drop-by-name then recreate).

-- 1) follows insert — the stored `email` must be the follower's OWN address.
--    The old policy constrained profile_id + non-anonymity + active cook, but
--    NOT `email`, so a signed-in user could POST straight to /rest/v1/follows
--    with {email: 'victim@example.com'} and the dish-digest cron (service role)
--    would then email an arbitrary recipient from our sending domain — an
--    email relay / deliverability-reputation burner. The follow route already
--    sets email = the auth user's own email, so pinning it to the JWT email
--    claim closes the raw-REST bypass without touching the app.
drop policy if exists "follows: insert own" on follows;
create policy "follows: insert own" on follows
  for insert with check (
    auth.uid() = profile_id
    -- guest-checkout sessions have no email; a follow from one is dead weight
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    -- the email must be the follower's OWN (or null when the JWT has none) —
    -- never a client-chosen recipient. `is not distinct from` treats null=null
    -- as a match, so a legit follow with no email claim still passes.
    and email is not distinct from (auth.jwt()->>'email')
    -- only live kitchens can be followed
    and exists (select 1 from cooks c where c.id = cook_id and c.status = 'active')
  );

-- 2) order_items insert — a buyer may add line items only while the parent
--    order is still 'pending' (i.e. during checkout, before payment). The old
--    policy checked only that the order belonged to the buyer, so a buyer who
--    had ever placed one order could POST arbitrary rows to /rest/v1/order_items
--    for that order_id at ANY lifecycle stage — injecting fake served_hot lines
--    into an already-paid order, which inflates the cook's quarterly CDTFA tax
--    total (taxes/export sums order_items.line_total_cents for paid orders) and
--    pollutes their order view. Both checkout paths insert their items while the
--    order is 'pending', so the status gate never blocks a real checkout.
--
--    NOTE: this closes injection into already-paid orders. A buyer can still
--    inject into their OWN order during the pre-payment window; fully closing
--    that requires making order_items server-authored (insert via the service
--    role + drop this end-user insert policy) — tracked as a follow-up.
drop policy if exists "buyer adds items to own order" on order_items;
create policy "buyer adds items to own order" on order_items
  for insert with check (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.buyer_id = auth.uid()
        and o.status = 'pending'
    )
  );
