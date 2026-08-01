import Link from "next/link";

export const metadata = {
  title: "How ForkFork verifies every kitchen",
};

export default function VerifiedPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
        ✓ County-verified
      </span>
      <h1 className="mt-4 text-3xl font-semibold leading-tight text-ink">
        Every kitchen is a real, permitted home food business
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-muted">
        Not an anonymous seller. A home chef Santa Clara County has cleared to
        make and sell food. Here&rsquo;s exactly what the &ldquo;County-verified&rdquo;
        badge means.
      </p>

      <div className="mt-8 space-y-6">
        <Point n="1" title="A real county permit, not a promise">
          Every kitchen holds a current permit from Santa Clara County: a
          MEHKO permit for hot, home-cooked meals, or a Cottage Food
          registration for baked and shelf-stable goods. No valid permit means
          no selling on ForkFork.
        </Point>
        <Point n="2" title="Inspected and trained under state law">
          A MEHKO cook&rsquo;s actual home kitchen passes a county health
          inspection before the permit issues (by the same department that
          inspects restaurants), and the chef holds food-safety certification,
          just like a restaurant kitchen manager. Cottage-food bakers complete
          state-approved food-safety training and may only sell foods
          California classifies as low-risk to make at home: breads, pastries,
          jams and other shelf-stable goods, never anything that needs
          refrigeration.
        </Point>
        <Point n="3" title="Checked against the county&rsquo;s own records">
          We match every kitchen&rsquo;s permit against Santa Clara
          County&rsquo;s published lists of approved operators (both MEHKO and
          cottage food), and re-check those lists periodically. The county is
          the source of truth, not us.
        </Point>
        <Point n="4" title="Reviewed by a person before going live">
          Someone on our team confirms the match and approves the kitchen before
          it can take a single order. No automatic approvals.
        </Point>
      </div>

      <div className="mt-8 rounded-xl bg-card p-5 shadow-soft">
        <p className="text-sm leading-relaxed text-ink">
          <span className="font-medium">What that means for you:</span> you&rsquo;re
          ordering from a county-permitted kitchen with a real name and
          address on file and reviews from real orders, cleared by the county
          and backed by us. And portions are small-batch by design: state law caps
          how much a home kitchen can sell, so this stays real home cooking.
          Not a stranger in a Facebook group.
        </p>
      </div>

      <div className="mt-8">
        <Link
          href="/browse"
          className="inline-block rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
        >
          Browse verified kitchens
        </Link>
      </div>
    </main>
  );
}

function Point({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
        {n}
      </span>
      <div>
        <h2 className="font-semibold text-ink">{title}</h2>
        <p className="mt-1 leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}
