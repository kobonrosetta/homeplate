// Minimal Stripe client over the REST API (no SDK dependency).
// Server-only — never import this into a client component.

import crypto from "crypto";

const STRIPE_API = "https://api.stripe.com/v1";

function secretKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY;
  return k && k.startsWith("sk_") ? k : null;
}

/** True once a real Stripe secret key is configured. */
export function stripeEnabled(): boolean {
  return secretKey() !== null;
}

export type LineItem = { name: string; amountCents: number; quantity: number };

/** Create a hosted Stripe Checkout session and return its id + redirect url. */
export async function createCheckoutSession(params: {
  lineItems: LineItem[];
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  customerEmail?: string;
  // Connect destination charge: when both are set, the buyer is charged the full
  // total, `applicationFeeCents` stays with the platform, and the remainder
  // (= the cook's subtotal) is transferred to their connected account.
  applicationFeeCents?: number;
  destinationAccountId?: string;
}): Promise<{ id: string; url: string }> {
  const key = secretKey();
  if (!key) throw new Error("Payments aren't set up yet (missing Stripe key).");

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  // Card only (which includes Apple/Google Pay in hosted Checkout). Pinning
  // this keeps async payment methods (bank debits/BNPL) out: those complete
  // with payment_status='unpaid' and settle later, a flow our confirm path
  // deliberately doesn't support at pilot scale.
  body.set("payment_method_types[0]", "card");
  // Sessions default to a 24h lifetime, but our stock guard runs at creation
  // time — a stale tab could pay for food that since sold out. Expire the
  // session instead (Stripe minimum is 30 minutes; 35 clears clock skew).
  body.set("expires_at", String(Math.floor(Date.now() / 1000) + 35 * 60));
  if (params.customerEmail) body.set("customer_email", params.customerEmail);
  params.lineItems.forEach((li, i) => {
    body.set(`line_items[${i}][price_data][currency]`, "usd");
    body.set(`line_items[${i}][price_data][product_data][name]`, li.name);
    body.set(`line_items[${i}][price_data][unit_amount]`, String(li.amountCents));
    body.set(`line_items[${i}][quantity]`, String(li.quantity));
  });
  for (const [k, v] of Object.entries(params.metadata ?? {})) {
    body.set(`metadata[${k}]`, v);
  }
  // Route the cook's cut to their connected account (destination charge). The
  // application fee (ForkFork's service fee) is always < total, so this can
  // never meet-or-exceed the charge. Both fields are set together — and they
  // are REQUIRED: every checkout on this platform pays a cook, so silently
  // omitting them would create a charge the platform keeps 100% of and the
  // cook is never paid for. Fail loudly instead.
  if (
    !params.destinationAccountId ||
    typeof params.applicationFeeCents !== "number" ||
    params.applicationFeeCents < 0
  ) {
    throw new Error("This kitchen isn't set up for payouts yet.");
  }
  body.set(
    "payment_intent_data[application_fee_amount]",
    String(params.applicationFeeCents)
  );
  body.set(
    "payment_intent_data[transfer_data][destination]",
    params.destinationAccountId
  );

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "Could not start payment.");
  }
  return { id: data.id as string, url: data.url as string };
}

/** Look up a checkout session to confirm payment on the success redirect. */
export async function retrieveSession(sessionId: string): Promise<{
  payment_status: string;
  payment_intent: string | null;
  metadata: Record<string, string>;
} | null> {
  const key = secretKey();
  if (!key) return null;
  // sessionId comes from the ?session_id= query param — encode it, and treat a
  // non-JSON response as a transient failure (null → the success page shows its
  // "couldn't verify" fallback) rather than crashing a buyer who just paid.
  const res = await fetch(
    `${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${key}` } }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) return null;
  return {
    payment_status: data.payment_status ?? "unpaid",
    payment_intent:
      typeof data.payment_intent === "string"
        ? data.payment_intent
        : (data.payment_intent?.id ?? null),
    metadata: (data.metadata ?? {}) as Record<string, string>,
  };
}

/**
 * Refund a destination-charge payment IN FULL, correctly.
 *
 * With destination charges the cook already received their cut via an automatic
 * transfer, so a naive refund would refund the buyer out of the PLATFORM's
 * balance while the cook keeps their money — the platform silently eats the
 * cook's share. So this ALWAYS sets:
 *   - reverse_transfer=true      → claw the cook's transfer back
 *   - refund_application_fee=true → return the platform's service fee too
 * (Stripe keeps only its processing cut — the unavoidable cost of any refund.)
 *
 * Returns { id } on success, or { error } — never throws, so the admin action
 * can show a message.
 *
 * `idempotencyKey` (the order id) is CRITICAL: if the refund succeeds at Stripe
 * but the HTTP response is lost (timeout/network), a retry with the same key
 * REPLAYS Stripe's original success instead of erroring — otherwise the money
 * is gone but the order is never marked refunded, and every retry fails on
 * "charge already refunded". Stripe caches the response for 24h.
 */
export async function createRefund(
  paymentIntentId: string,
  idempotencyKey: string
): Promise<{ id: string } | { error: string }> {
  const key = secretKey();
  if (!key) return { error: "Payments aren't set up (missing Stripe key)." };
  const body = new URLSearchParams();
  body.set("payment_intent", paymentIntentId);
  body.set("reverse_transfer", "true");
  body.set("refund_application_fee", "true");
  let res: Response;
  try {
    res = await fetch(`${STRIPE_API}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `refund-${idempotencyKey}`,
      },
      body,
    });
  } catch {
    return { error: "Couldn't reach Stripe. Try again." };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    return { error: data?.error?.message ?? "Stripe refund failed." };
  }
  return { id: data.id as string };
}

/**
 * Verify a Stripe webhook signature so we only act on genuine Stripe events.
 * Same scheme as stripe.webhooks.constructEvent, without pulling in the SDK.
 */
export function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
  toleranceSec = 300
): boolean {
  if (!sigHeader) return false;
  const items = sigHeader.split(",").map((kv) => kv.split("="));
  const t = items.find(([k]) => k === "t")?.[1];
  const v1s = items.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || v1s.length === 0) return false;

  // Replay protection: reject signatures with a stale timestamp.
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(Number(t)) || Math.abs(now - Number(t)) > toleranceSec) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`, "utf8")
    .digest("hex");
  const a = Buffer.from(expected);
  return v1s.some((v1) => {
    const b = Buffer.from(v1);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// ---------- Connect (Express) — automated cook payouts ----------

export type ConnectAccountStatus = {
  transfersActive: boolean; // the transfers capability is 'active' — CAN receive a destination transfer
  payoutsEnabled: boolean; // funds can leave Stripe for the cook's bank
  detailsSubmitted: boolean; // finished the hosted onboarding form
  disabledReason: string | null; // why Stripe is holding them, if any
};

/**
 * Map a Stripe account object to our status shape. Shared by retrieveAccount and
 * the account.updated webhook (which receives the same object). Readiness keys off
 * the TRANSFERS capability, not charges_enabled — a transfers-only Express account
 * keeps charges_enabled=false forever, so gating on that would block every order.
 */
export function accountStatus(account: any): ConnectAccountStatus {
  return {
    transfersActive: account?.capabilities?.transfers === "active",
    payoutsEnabled: account?.payouts_enabled === true,
    detailsSubmitted: account?.details_submitted === true,
    disabledReason: account?.requirements?.disabled_reason ?? null,
  };
}

/** Create an Express connected account for a cook (transfers capability only). */
export async function createConnectAccount(params: {
  cookId: string;
  email?: string | null;
  // Distinguishes account GENERATIONS for the same cook. Stable within one
  // generation (retries and parallel tabs dedupe to one account via Stripe's
  // idempotency layer) but different after a deauth-clear, so a dead account
  // is never resurrected from Stripe's 24h idempotency cache.
  idempotencySalt: string;
}): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("Payments aren't set up yet (missing Stripe key).");

  const body = new URLSearchParams();
  body.set("type", "express");
  // Destination charges with the platform as merchant of record need ONLY the
  // transfers capability on the connected account — not card_payments.
  body.set("capabilities[transfers][requested]", "true");
  body.set("metadata[cook_id]", params.cookId);
  if (params.email) body.set("email", params.email);

  const res = await fetch(`${STRIPE_API}/accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `connect-acct-${params.cookId}-${params.idempotencySalt}`,
    },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "Could not create your payout account.");
  }
  return data.id as string;
}

/** Create a single-use hosted onboarding link for an Express account. */
export async function createAccountLink(params: {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("Payments aren't set up yet (missing Stripe key).");

  const body = new URLSearchParams();
  body.set("account", params.accountId);
  body.set("return_url", params.returnUrl);
  body.set("refresh_url", params.refreshUrl);
  body.set("type", "account_onboarding");

  const res = await fetch(`${STRIPE_API}/account_links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "Could not start payout setup.");
  }
  return data.url as string;
}

/**
 * Read a connected account's live onboarding + capability status.
 * Returns "gone" when Stripe says the account is definitively unreachable
 * (deleted / access revoked — 403/404): retrying can never succeed, so callers
 * should clean up and ack rather than error-and-retry. `null` = transient
 * failure (worth a retry).
 */
export async function retrieveAccount(
  accountId: string
): Promise<ConnectAccountStatus | "gone" | null> {
  const key = secretKey();
  if (!key) return null;
  const res = await fetch(`${STRIPE_API}/accounts/${accountId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json().catch(() => null);
  if (res.status === 403 || res.status === 404) return "gone";
  if (!res.ok || !data) return null;
  return accountStatus(data);
}
