-- Security review (Jul 2026, verified live): the order_items INSERT policy only
-- checked that the parent order was YOURS and still 'pending' — it never checked
-- that order_items.listing_id belonged to the order's cook. A buyer could inject
-- a COMPETITOR's limited-inventory listing into their own tiny pending order
-- (anon key + their own JWT → POST /rest/v1/order_items → HTTP 201), and on
-- payment confirmPaidOrder() would zero that competitor's quantity_available —
-- selling them out and dropping them off /browse. (Also the vector for the
-- previously-deferred "same-order served_hot/quantity injection" tax residual.)
--
-- Order items are ALREADY server-authored: startCheckout / payLinkCheckout build
-- them server-side from authoritative DB prices. End users never legitimately
-- insert them. So drop the end-user INSERT policy entirely — the service role
-- (the checkout actions) still writes them, bypassing RLS. This closes the whole
-- class in one move.
--
-- ⚠️ DEPLOY ORDER: ship the CODE first (the checkout/pay actions now insert
-- order_items via the service role), THEN run this. If this runs while the old
-- code is live, its buyer-session order_items insert is denied and checkout
-- breaks. Running it after the code deploy is always safe.
drop policy if exists "buyer adds items to own order" on order_items;



