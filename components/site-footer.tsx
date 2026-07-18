import Link from "next/link";

// Global footer. Selling lives here (not in a shopper's face) — framed as
// applying to a vetted program, the way Airbnb/Etsy/DoorDash do it.
export default function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted">
        <span>
          © {new Date().getFullYear()} HomePlate · A marketplace for
          county-approved home food operators.
        </span>
        <Link href="/sell" className="font-medium text-ink hover:text-brand">
          Run a permitted kitchen? Apply to sell →
        </Link>
      </div>
    </footer>
  );
}
