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

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{cook.business_name}</h1>
        <p className="mt-0.5 text-sm text-muted">
          {cook.status === "active"
            ? "✓ County-verified · live"
            : cook.status === "pending"
              ? "⏳ Under review — we'll email you when you're approved"
              : "Paused"}
          {cook.city ? ` · ${cook.city}` : ""}
        </p>
      </div>

      <DashboardTabs />

      <div className="mt-6">{children}</div>
    </div>
  );
}
