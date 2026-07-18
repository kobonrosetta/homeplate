import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  // The landing page is for prospects. Anyone signed in goes straight into the
  // app (Browse — the marketplace home); cooks reach their kitchen via the header.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/browse");

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-14 sm:pt-24">
        <div className="max-w-2xl">
          <Link
            href="/verified"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
          >
            ✓ Every kitchen is county-approved &amp; verified
          </Link>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Exceptional food from the best home kitchens near you.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            The bakers and cooks your neighbors rave about — the sourdough, the
            tamales, the pastries — now in one place. Permit-verified, not a
            Facebook group. Order ahead, pick up or get it delivered.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/browse"
              className="rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
            >
              Find food near you
            </Link>
            <Link
              href="/sell"
              className="rounded-full border border-line px-6 py-3 font-medium text-ink hover:border-muted hover:bg-card"
            >
              I&apos;m a cook →
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">
            Now serving Santa Clara County.
          </p>
        </div>
      </section>

      {/* Value props */}
      <section className="border-t border-line bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-3">
          <Feature
            title="Verified, not sketchy"
            body="Every kitchen is matched against the county's approved-operator list before they can sell. You know it's legit."
          />
          <Feature
            title="Cooks keep what they earn"
            body="Makers keep 100% of their price. A small service fee at checkout keeps the lights on — no gouging."
          />
          <Feature
            title="Built for quality, not cheap"
            body="This isn't fast food. It's the artisan down the street who happens to be the best baker you've ever tasted."
          />
        </div>
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 leading-relaxed text-muted">{body}</p>
    </div>
  );
}
