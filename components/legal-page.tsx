import Link from "next/link";

// Shared shell for the legal pages (/terms, /privacy, /refunds,
// /chef-agreement): one consistent typographic frame so the documents read as a
// set, with cross-links in the footer of each.
export function LegalPage({
  title,
  effective,
  children,
}: {
  title: string;
  effective: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">Effective {effective}</p>
      <div className="mt-8 space-y-8">{children}</div>
      <div className="mt-12 border-t border-line pt-6 text-sm text-muted">
        <p>
          Questions? Email{" "}
          <a
            href="mailto:hello@forkfork.app"
            className="font-medium text-brand hover:underline"
          >
            hello@forkfork.app
          </a>
          .
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
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
        </p>
      </div>
    </main>
  );
}

export function LegalSection({
  n,
  title,
  children,
}: {
  n?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-ink">
        {n ? `${n}. ` : ""}
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}
