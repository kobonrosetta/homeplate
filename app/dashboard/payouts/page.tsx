import { redirect } from "next/navigation";
import { getCurrentCook } from "@/lib/cook";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUsd } from "@/lib/constants";
import EmptyState from "@/components/empty-state";
import { startStripeOnboarding } from "./actions";

export const dynamic = "force-dynamic";

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { cook } = await getCurrentCook();
  if (!cook) redirect("/sell");

  // Earnings = the cook's cut on PAID orders (RLS lets them read their own).
  // Destination transfers move the money at CHARGE time, so this uses the same
  // paid-status set as the admin console — the figure matches what Stripe
  // actually sent; exact deposit dates live in the cook's Stripe dashboard.
  const PAID = new Set(["confirmed", "in_progress", "ready", "completed"]);
  const supabase = createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("status, subtotal_cents")
    .eq("cook_id", cook.id);
  const earned = (orders ?? [])
    .filter((o: any) => PAID.has(o.status))
    .reduce((n: number, o: any) => n + (o.subtotal_cents ?? 0), 0);

  // Payout status + any legacy manual payouts (both service-role only).
  const admin = createAdminClient();
  const { data: stripe } = await admin
    .from("cook_stripe")
    .select("details_submitted, disabled_reason")
    .eq("cook_id", cook.id)
    .maybeSingle();
  const { data: payouts } = await admin
    .from("payouts")
    .select("amount_cents, note, created_at")
    .eq("cook_id", cook.id)
    .order("created_at", { ascending: false });

  const ready = cook.stripe_ready === true;
  const inReview = !ready && !!stripe?.details_submitted;

  return (
    <div className="space-y-6">
      {searchParams.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      {ready ? (
        <>
          <p className="rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand">
            <strong>Payouts are active.</strong> You keep 100% of your listed
            price, and Stripe sends it to your bank on its regular payout
            schedule; exact dates are in your Stripe dashboard.
          </p>
          <div className="grid gap-4 sm:grid-cols-1">
            <Stat
              label="Earned so far (paid orders)"
              value={formatUsd(earned)}
              accent
            />
          </div>
        </>
      ) : (
        <div className="rounded-xl bg-card p-5 shadow-soft">
          <h3 className="font-display text-lg font-semibold text-ink">
            {inReview
              ? "Finishing your payout setup"
              : "Set up payouts to get paid"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {inReview
              ? stripe?.disabled_reason
                ? "Stripe still needs a detail or two from you. Continue below to finish."
                : "Stripe is verifying your details, usually just a few minutes. Add anything they still need below."
              : "Connect a bank account through Stripe so you can take orders and your earnings land automatically. You keep 100% of your listed price; ForkFork only ever takes its service fee from the buyer."}
          </p>
          <form action={startStripeOnboarding} className="mt-4">
            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {inReview
                ? "Continue payout setup"
                : "Set up payouts with Stripe"}
            </button>
          </form>
          <p className="mt-3 text-xs text-faint">
            {cook.status === "active"
              ? "Your kitchen goes live to buyers the moment payouts are active."
              : "Do this anytime. Your kitchen goes live once payouts are active and your application is approved."}
          </p>
        </div>
      )}

      {payouts && payouts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
            Manual payments
          </h3>
          <div className="mt-2 divide-y divide-line rounded-xl bg-card shadow-soft">
            {payouts.map((p: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span className="text-ink">
                  {new Date(p.created_at).toLocaleDateString()}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <span className="font-medium text-ink">
                  {formatUsd(p.amount_cents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ready && (!payouts || payouts.length === 0) && earned === 0 && (
        <EmptyState
          title="No earnings yet"
          subtitle="Your paid orders will show here."
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-line/50 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          accent ? "text-brand" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
