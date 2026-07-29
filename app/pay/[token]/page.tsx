import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcServiceFeeCents, formatUsd } from "@/lib/constants";
import VerifiedBadge from "@/components/verified-badge";
import { payLinkCheckout } from "./actions";

export const dynamic = "force-dynamic";

// A cook-minted payment link for a DM-negotiated custom order. The token in
// the URL is the whole capability: the row is read server-side (service role);
// there is no public read on custom_requests.
export default async function PayPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("custom_requests")
    .select(
      "id, cook_id, title, price_cents, full_price_cents, charge_kind, pickup_date, note, status, expires_at"
    )
    .eq("token", params.token)
    .maybeSingle();

  if (!request) {
    return (
      <Dead
        title="Link not found"
        body="This payment link doesn't exist. Double-check the link the kitchen sent you."
      />
    );
  }

  // Lazily expire an open link that's past its date (no cron needed).
  const expired =
    request.status === "open" && new Date(request.expires_at) < new Date();
  if (expired) {
    await admin
      .from("custom_requests")
      .update({ status: "expired" })
      .eq("id", request.id)
      .eq("status", "open");
  }

  if (request.status === "paid") {
    return (
      <Dead
        title="Already paid — thank you!"
        body="This order has been paid. The kitchen has your order and will be in touch."
      />
    );
  }
  if (request.status === "cancelled" || expired || request.status === "expired") {
    return (
      <Dead
        title="This link is no longer active"
        body="Ask the kitchen to send you a fresh payment link."
      />
    );
  }

  const { data: cook } = await admin
    .from("cooks")
    .select("business_name, slug, city, permit_verified, status")
    .eq("id", request.cook_id)
    .maybeSingle();
  if (!cook || cook.status !== "active") {
    return (
      <Dead
        title="This kitchen isn't taking payments right now"
        body="Reach out to the kitchen directly."
      />
    );
  }

  const fee = calcServiceFeeCents(request.price_cents);
  const total = request.price_cents + fee;
  const isDeposit = request.charge_kind === "deposit" && request.full_price_cents;

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <div className="rounded-2xl border border-line bg-card p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.11em] text-faint">
              Payment request from
            </p>
            <Link
              href={`/kitchen/${cook.slug}`}
              className="font-display text-xl font-semibold text-ink hover:underline"
            >
              {cook.business_name}
            </Link>
            {cook.city && <p className="text-sm text-muted">{cook.city}</p>}
          </div>
          {cook.permit_verified && <VerifiedBadge className="shrink-0" />}
        </div>

        <div className="mt-5 rounded-lg bg-line/40 p-4">
          <p className="font-medium text-ink">{request.title}</p>
          {request.pickup_date && (
            <p className="mt-1 text-sm text-muted">Pickup: {request.pickup_date}</p>
          )}
          {request.note && (
            <p className="mt-2 text-sm text-muted">{request.note}</p>
          )}
        </div>

        <div className="mt-5 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">
              {isDeposit
                ? `50% deposit (of ${formatUsd(request.full_price_cents!)} total)`
                : "Price"}
            </span>
            <span className="text-ink">{formatUsd(request.price_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">HomePlate service fee</span>
            <span className="text-ink">{formatUsd(fee)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-ink">
            <span>Total today</span>
            <span>{formatUsd(total)}</span>
          </div>
          {isDeposit && (
            <p className="pt-1 text-xs text-faint">
              The remaining {formatUsd(request.full_price_cents! - request.price_cents)}{" "}
              is arranged with the kitchen.
            </p>
          )}
        </div>

        {searchParams.error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </p>
        )}

        <form action={payLinkCheckout} className="mt-5 space-y-3">
          <input type="hidden" name="token" value={params.token} />
          <input
            name="contact_name"
            placeholder="Your name"
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="Email (for your receipt)"
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm"
          />
          <input
            name="contact_phone"
            required
            placeholder="Phone number"
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
          >
            Pay {formatUsd(total)}
          </button>
          <p className="text-center text-xs text-faint">
            Secure card payment via Stripe · link expires{" "}
            {new Date(request.expires_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </p>
        </form>
      </div>
    </main>
  );
}

function Dead({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-muted">{body}</p>
      <Link
        href="/browse"
        className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
      >
        Browse kitchens
      </Link>
    </main>
  );
}
