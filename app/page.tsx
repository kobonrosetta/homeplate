import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HeroSlideshow, { type HeroKitchen } from "@/components/hero-slideshow";

export const metadata = {
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

export default async function Home() {
  // The landing page is the site's home for everyone: the ForkFork logo returns
  // here whether or not you're signed in. Signed-in visitors get into the app
  // via the header (Browse / My kitchen) and the hero CTA; we no longer bounce
  // them straight to Browse (login itself still lands them there).
  const supabase = createClient();

  // Real kitchens for the hero slideshow — same criteria as Browse (active,
  // payout-ready, something in stock), narrowed to ones with a photo to show.
  const { data: cooksData } = await supabase
    .from("cooks")
    .select(
      "business_name, slug, city, permit_verified, listings(photo_url, is_available, price_cents, limited_quantity, quantity_available)"
    )
    .eq("status", "active")
    .eq("stripe_ready", true)
    .limit(20);

  const heroKitchens: HeroKitchen[] = (cooksData ?? [])
    .map((c: any) => {
      const avail = (c.listings ?? []).filter(
        (l: any) =>
          l.is_available && (!l.limited_quantity || l.quantity_available > 0)
      );
      const prices = avail
        .map((l: any) => l.price_cents)
        .filter((n: any) => typeof n === "number" && n > 0);
      return {
        slug: c.slug,
        name: c.business_name,
        city: c.city,
        photo: avail.find((l: any) => l.photo_url)?.photo_url ?? null,
        verified: c.permit_verified,
        minPriceCents: prices.length ? Math.min(...prices) : null,
        count: avail.length,
      };
    })
    .filter((k) => k.count > 0 && k.photo)
    .slice(0, 5)
    .map(({ count, ...k }) => k);

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-14 sm:pt-24 lg:grid-cols-[1fr_minmax(0,26rem)]">
        <div className="max-w-2xl">
          <Link
            href="/verified"
            className="text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            ✓ Every kitchen verified against the county&rsquo;s approved list
          </Link>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Incredible chefs, hiding a few blocks away.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            From neighbors whose home kitchens are county-permitted or
            state-registered under California&rsquo;s cottage food law. Order the
            dishes people line up for &mdash; pick up or get it delivered.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/browse"
              className="rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
            >
              Find food near you
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">
            Now serving Santa Clara County.
          </p>
        </div>
        {heroKitchens.length > 0 && <HeroSlideshow kitchens={heroKitchens} />}
      </section>

      {/* Value props */}
      <section className="border-t border-line bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-3">
          <Feature
            title="Held to restaurant rules, at home"
            body="Hot-meal kitchens are permitted and inspected by the county health department, the same office that inspects restaurants. Bakers are registered under California's cottage food law, with state-required food-safety training."
          />
          <Feature
            title="Verified twice before day one"
            body="We match every permit against Santa Clara County's own approved-operator list, then a person reviews each kitchen before it can take a single order. Not cleared by the county? Not on ForkFork."
          />
          <Feature
            title="Your money goes to the chef"
            body="Chefs keep 100% of the price they set. The small service fee at checkout is what runs ForkFork. You're paying the person who made your dinner, not a middleman."
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
