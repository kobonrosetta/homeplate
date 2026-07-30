import Link from "next/link";

// Public pitch shown at /sell when nobody (or only a guest session) is signed
// in. The footer's "Apply to sell" link lands here, so this is the first thing
// a curious cook ever sees — it has to sell the program, not a login wall.
// Signed-in users never see this; they go straight into the wizard.
export default function CookPitch() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pt-24">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            ✓ For Santa Clara County permit holders
          </span>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            You did the hard part. You got the permit.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            ForkFork turns your county approval into a real storefront — a
            menu, online payment, and neighbors who can finally find you. You
            keep 100% of every price you set.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/signup?intent=sell"
              className="rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
            >
              Apply to sell — it&apos;s free
            </Link>
            <Link
              href="/login?next=/sell"
              className="text-sm font-medium text-muted hover:text-ink"
            >
              Already on ForkFork? Sign in →
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">
            About ten minutes, and your progress saves after each step — leave
            and come back anytime.
          </p>
        </div>
      </section>

      {/* Why sell here */}
      <section className="border-t border-line bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-2">
          <Perk
            title="Keep 100% of your price"
            body="You price it, you keep it. Buyers pay a small service fee at checkout — there's no commission, no listing fee, no monthly charge."
          />
          <Perk
            title="A badge buyers actually trust"
            body="We match your permit against the county's published operator list, and a person reviews every kitchen before it goes live. That verified check is why buyers choose ForkFork over a Facebook group."
          />
          <Perk
            title="Your home stays private"
            body="Buyers see your city and nothing more until they've placed an order. Your address never appears on your public page."
          />
          <Perk
            title="The boring parts run themselves"
            body="Orders, payments, buyer contact details, email alerts — handled. Sell hot meals? Your dashboard does the sales-tax math too — quarterly totals, one-click export."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-semibold tracking-tight text-ink">
          Three steps, one afternoon
        </h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <Step
            n="1"
            title="Tell us about your kitchen"
            body="Your name, what you make, and how customers get it. No permit paperwork up front."
          />
          <Step
            n="2"
            title="Add your first dish"
            body="One photo and a price. Our AI helps write a description that does your food justice."
          />
          <Step
            n="3"
            title="Get verified, go live"
            body="Add your address. A permit number speeds verification but isn't required — a person reviews and approves your kitchen, usually within a day."
          />
        </div>
      </section>

      {/* Who can join */}
      <section className="border-t border-line bg-card/60">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-ink">Who can apply</h2>
            <p className="mt-3 leading-relaxed text-muted">
              ForkFork is for permitted home food businesses in Santa Clara
              County: <span className="font-medium text-ink">MEHKO
              operators</span> selling hot, home-cooked meals, and{" "}
              <span className="font-medium text-ink">cottage food
              operators</span> selling baked goods, jams, and other
              shelf-stable foods.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              No permit yet? The county walks you through it:{" "}
              <a
                href="https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/apply-microenterprise-home-kitchen-operations"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline hover:text-ink"
              >
                apply for a MEHKO permit
              </a>{" "}
              or{" "}
              <a
                href="https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/apply-cottage-food-operator-cfo-permit"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline hover:text-ink"
              >
                register as a cottage food operator
              </a>
              . Come back when it&apos;s in hand — we&apos;ll be here.
            </p>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-2xl border border-line bg-card p-8 sm:p-10">
          <h2 className="text-2xl font-semibold text-ink">
            Be one of the founding kitchens
          </h2>
          <p className="mt-2 max-w-xl leading-relaxed text-muted">
            ForkFork is launching in Santa Clara County right now, and the
            first kitchens set the tone — and get the spotlight.
          </p>
          <Link
            href="/signup?intent=sell"
            className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
          >
            Start your application
          </Link>
        </div>
      </section>
    </main>
  );
}

function Perk({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
        {n}
      </span>
      <h3 className="mt-3 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 leading-relaxed text-muted">{body}</p>
    </div>
  );
}
