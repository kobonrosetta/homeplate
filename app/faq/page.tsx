import Link from "next/link";
import JsonLd from "@/components/json-ld";
import { faqSchema } from "@/lib/schema";

export const metadata = {
  title: "Frequently asked questions · ForkFork",
  description:
    "How ForkFork works, whether home-kitchen food is safe, what MEHKO and cottage food mean, fees, pickup and delivery, and how to sell — answered.",
  alternates: { canonical: "/faq" },
};

// Content lives in these arrays and is rendered via {expressions} (not JSX
// text), which keeps apostrophes clean and lets the same source feed both the
// visible page and the FAQPage JSON-LD below — the two never drift.
const BUYER_FAQS: { q: string; a: string }[] = [
  {
    q: "What is ForkFork?",
    a: "ForkFork is an online marketplace for county-verified home chefs in Santa Clara County, California. You order hot, home-cooked meals and fresh-baked goods from local home kitchens that hold a current county permit, for pickup or delivery.",
  },
  {
    q: "Is it safe to buy food from a home kitchen?",
    a: "Yes. Every ForkFork kitchen holds a current Santa Clara County permit. Hot-meal (MEHKO) kitchens are inspected by the county health department — the same office that inspects restaurants — and the chef holds a food-safety certification. Cottage-food bakers are registered under California law and may only sell shelf-stable foods like breads, pastries, and jams.",
  },
  {
    q: "What is a MEHKO kitchen?",
    a: "A MEHKO (Microenterprise Home Kitchen Operation) is a home kitchen permitted under California law to cook and sell hot meals directly to the public. In Santa Clara County, a MEHKO permit requires a health inspection of the actual home kitchen and food-safety certification for the operator.",
  },
  {
    q: "What is the difference between MEHKO and cottage food?",
    a: "MEHKO permits cover hot, prepared meals made and sold from a home kitchen that the county inspects. Cottage food registration covers shelf-stable, non-refrigerated goods — baked items, jams, and similar — made under California's cottage food law. ForkFork verifies both.",
  },
  {
    q: "How does ForkFork verify its chefs?",
    a: "We match every chef's permit against Santa Clara County's published list of approved operators, and a person on our team reviews each kitchen before it can take a single order. No valid county permit means no selling on ForkFork.",
  },
  {
    q: "What fees does ForkFork charge?",
    a: "Chefs keep 100% of the price they set. Buyers pay a service fee of 8% plus $0.30 at checkout. Listed prices already include any California sales tax, so there is no separate tax line.",
  },
  {
    q: "Does ForkFork offer pickup and delivery?",
    a: "Both, depending on the chef. Each kitchen sets whether it offers pickup, delivery, or both, and you choose at checkout.",
  },
  {
    q: "Where is ForkFork available?",
    a: "ForkFork is launching in Santa Clara County, California — including San Jose, Sunnyvale, Santa Clara, Mountain View, and the surrounding cities.",
  },
  {
    q: "How is ForkFork different from buying food in a Facebook group?",
    a: "Every ForkFork kitchen is a real, county-permitted food business verified against the county's approved-operator list, with a real name and address on file and reviews from actual orders. You are not ordering from an anonymous stranger.",
  },
];

const CHEF_FAQS: { q: string; a: string }[] = [
  {
    q: "Who can sell on ForkFork?",
    a: "Permitted home food businesses in Santa Clara County: MEHKO operators selling hot, home-cooked meals, and cottage food operators selling baked goods, jams, and other shelf-stable foods.",
  },
  {
    q: "How much does it cost to sell on ForkFork?",
    a: "Nothing to list. There is no commission, no listing fee, and no monthly charge — chefs keep 100% of every price they set. ForkFork's revenue is the service fee buyers pay at checkout.",
  },
  {
    q: "Do I need a permit to sell?",
    a: "Yes. You must hold a current Santa Clara County MEHKO permit or cottage food registration appropriate to what you sell. You can start your application before your permit number is in hand, but a kitchen cannot go live without a valid permit.",
  },
];

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <JsonLd data={faqSchema([...BUYER_FAQS, ...CHEF_FAQS])} />

      <h1 className="text-3xl font-semibold leading-tight text-ink">
        Frequently asked questions
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-muted">
        The short version: ForkFork is the best home kitchens near you, verified
        against Santa Clara County&rsquo;s approved-operator list.
      </p>

      <Section title="For buyers" faqs={BUYER_FAQS} />
      <Section title="For chefs" faqs={CHEF_FAQS} />

      <div className="mt-12 rounded-xl bg-card p-5 shadow-soft">
        <p className="text-sm leading-relaxed text-ink">
          Still curious how verification works?{" "}
          <Link href="/verified" className="font-medium text-brand hover:underline">
            See what county-verified means
          </Link>
          , or{" "}
          <Link href="/browse" className="font-medium text-brand hover:underline">
            browse kitchens near you
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function Section({
  title,
  faqs,
}: {
  title: string;
  faqs: { q: string; a: string }[];
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.11em] text-faint">
        {title}
      </h2>
      <div className="mt-2">
        {faqs.map((f) => (
          <div key={f.q} className="border-t border-line py-5">
            <h3 className="font-display text-lg font-semibold text-ink">{f.q}</h3>
            <p className="mt-2 leading-relaxed text-muted">{f.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
