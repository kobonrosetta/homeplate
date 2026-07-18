"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/menu", label: "Menu" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/payouts", label: "Payouts" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardTabs() {
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
        </Link>
      ))}
    </nav>
  );
}
