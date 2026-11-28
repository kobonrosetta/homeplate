"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/menu", label: "Menu" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/payouts", label: "Payouts" },
  { href: "/dashboard/settings", label: "Settings" },
];

// A small spinner on the tab that was just tapped, shown until its page has
// arrived. The dashboard deliberately has NO route-level loading screen
// (app/dashboard/loading.tsx was removed with the move to Next 15: with one
// in place, a button whose action answers with a redirect usually left the
// page sitting still; see CLAUDE.md gotcha #11). Without a loading screen the
// old page stays up while the next one loads, so this is the only sign the
// tap landed. Must render inside the <Link> it reports on.
function TabPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="ml-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-brand align-middle"
    />
  );
}

export default function DashboardTabs({
  payoutsPending = false,
}: {
  payoutsPending?: boolean;
}) {
  const path = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return path === "/dashboard";
    if (href === "/dashboard/menu") {
      return path.startsWith("/dashboard/menu") || path.startsWith("/dashboard/listings");
    }
    return path.startsWith(href);
  }

  return (
    <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={
            isActive(t.href)
              ? "whitespace-nowrap border-b-2 border-brand px-4 py-2 text-sm font-medium text-ink"
              : "whitespace-nowrap border-b-2 border-transparent px-4 py-2 text-sm text-muted hover:text-ink"
          }
        >
          {t.label}
          {payoutsPending && t.href === "/dashboard/payouts" && (
            <span
              aria-hidden
              className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle"
            />
          )}
          <TabPending />
        </Link>
      ))}
    </nav>
  );
}
