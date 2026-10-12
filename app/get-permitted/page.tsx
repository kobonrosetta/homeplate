import Link from "next/link";
import { FormError } from "@/components/form";
import { submitCookLead } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Get permitted to sell your cooking — ForkFork",
  description:
    "ForkFork only lists county-permitted home kitchens. Here's exactly how to get a Santa Clara County MEHKO permit or cottage food registration — and we'll help you through it.",
};

// Where the sell-wizard's permit gate sends cooks who answered "not yet":
// an honest explainer of the two county paths plus a lead form that emails
// the founder. These people are future supply, not rejects — the page's job
// is to keep them warm and point them at the county.
export default function GetPermittedPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string };
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink">
        One thing before you can sell: a county permit
      </h1>
      <p className="mt-3 leading-relaxed text-muted">
        Every kitchen on ForkFork is verified against Santa Clara
        County&rsquo;s list of permitted home food businesses — that&rsquo;s
        exactly why buyers trust a stranger&rsquo;s home kitchen here. The good
        news: getting permitted is a well-worn path, and we&rsquo;ll help you
        through it.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-card p-5 shadow-soft">
          <h2 className="font-display text-lg font-semibold text-ink">
            Hot meals → MEHKO
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            A Microenterprise Home Kitchen Operation permit lets you cook and
            sell real meals from your home kitchen. Expect roughly $700 in
            county fees, an inspection, and a few weeks start to finish.
          </p>
          <a
            href="https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/apply-microenterprise-home-kitchen-operations"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            County MEHKO application →
          </a>
        </div>
        <div className="rounded-2xl bg-card p-5 shadow-soft">
          <h2 className="font-display text-lg font-semibold text-ink">
            Baked &amp; shelf-stable → Cottage Food
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Breads, pastries, jams, and other shelf-stable foods go through the
            simpler (and cheaper) Cottage Food Operator registration instead.
          </p>
          <a
            href="https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/apply-cottage-food-operator-cfo-permit"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            County cottage food registration →
          </a>
        </div>
      </div>

      <section className="mt-10 rounded-2xl border border-line bg-card p-6 shadow-soft">
        <h2 className="font-display text-xl font-semibold text-ink">
          Tell us you&rsquo;re on the way
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Leave your details and we&rsquo;ll personally help you through the
          process — and have your storefront ready the day your permit comes
          through. Our first kitchen is doing real holiday business right now;
          there&rsquo;s room for yours.
        </p>

        {searchParams.sent === "1" ? (
          <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            Got it — we&rsquo;ll be in touch soon. Go start that county
            application. 🎉
          </p>
        ) : (
          <form action={submitCookLead} className="mt-5 space-y-4">
            <FormError message={searchParams.error} />
            {/* Honeypot — humans never see or fill this. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />
            <label className="block">
              <span className="text-sm font-medium text-ink">Your name</span>
              <input
                name="name"
                required
                maxLength={120}
                className="mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">Phone</span>
                <input
                  name="phone"
                  type="tel"
                  maxLength={40}
                  className="mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Email</span>
                <input
                  name="email"
                  type="email"
                  maxLength={254}
                  className="mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-ink">
                What do you cook?
              </span>
              <textarea
                name="what_you_cook"
                rows={2}
                maxLength={500}
                placeholder="e.g. birria, tamales, pan dulce…"
                className="mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-brand px-6 py-2.5 font-medium text-white hover:bg-brand/90"
            >
              Keep me posted
            </button>
          </form>
        )}
      </section>

      <p className="mt-8 text-sm text-muted">
        Already have your permit?{" "}
        <Link
          href="/sell"
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          Apply to sell →
        </Link>
      </p>
    </main>
  );
}
