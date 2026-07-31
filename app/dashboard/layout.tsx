import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCook } from "@/lib/cook";
import DashboardTabs from "@/components/dashboard-tabs";

// The cook's workspace shell: kitchen header + section tabs, wrapping every
// /dashboard/* page. All cook management lives here, separate from the storefront.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, cook } = await getCurrentCook();
  if (!user) redirect("/login");
  if (!cook) redirect("/sell");

  // Payouts not set up yet → surface it on EVERY dashboard page, including while
  // pending (the review wait is the ideal time to do it). Hidden once Stripe
  // onboarding is done, and for paused/suspended kitchens (not the moment).
  const showPayoutBanner =
    !cook.stripe_ready &&
    (cook.status === "pending" || cook.status === "active");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{cook.business_name}</h1>
        <p className="mt-0.5 text-sm text-muted">
          {cook.status === "active"
            ? cook.stripe_ready
              ? "✓ County-verified · live"
              : "✓ Approved · set up payouts to go live"
            : cook.status === "pending"
              ? "⏳ Under review — we'll email you when you're approved"
              : cook.status === "paused"
                ? "⏸ Paused — hidden from buyers until you resume (Settings)"
                : "Suspended — contact support"}
          {cook.city ? ` · ${cook.city}` : ""}
        </p>
      </div>

      {showPayoutBanner && (
        <Link
          href="/dashboard/payouts"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 transition hover:bg-brand/15"
        >
          <span className="text-sm font-medium text-brand">
            {cook.status === "active"
              ? "You're approved! Set up payouts to go live to buyers."
              : "Set up payouts now so you're ready to earn the day you're approved."}
          </span>
          <span className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">
            Set up payouts →
          </span>
        </Link>
      )}

      <DashboardTabs payoutsPending={showPayoutBanner} />

      <div className="mt-6">{children}</div>
    </div>
  );
}
