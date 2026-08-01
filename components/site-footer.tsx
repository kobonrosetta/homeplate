import Link from "next/link";

// Global footer. Selling lives here (not in a shopper's face) — framed as
// applying to a vetted program, the way Airbnb/Etsy/DoorDash do it.
export default function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span>
            © {new Date().getFullYear()} ForkFork · County-verified home
            kitchens in Santa Clara County.
          </span>
          <Link href="/sell" className="font-medium text-ink hover:text-brand">
            Run a permitted kitchen? Apply to sell →
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
          <Link href="/faq" className="hover:text-ink hover:underline">
            FAQ
          </Link>
          <Link href="/terms" className="hover:text-ink hover:underline">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-ink hover:underline">
            Privacy Policy
          </Link>
          <Link href="/refunds" className="hover:text-ink hover:underline">
            Refund Policy
          </Link>
          <Link href="/chef-agreement" className="hover:text-ink hover:underline">
            Chef Agreement
          </Link>
          <a
            href="mailto:hello@forkfork.app"
            className="hover:text-ink hover:underline"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
