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
}): Promise<{ id: string; url: string }> {
  const key = secretKey();
  if (!key) throw new Error("Payments aren't set up yet (missing Stripe key).");

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
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
  const res = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  if (!res.ok) return null;
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
