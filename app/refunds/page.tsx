import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection as S } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Refund Policy — ForkFork",
  description: "When and how ForkFork orders are refunded.",
};

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" effective="July 31, 2026">
      <p className="text-[15px] leading-relaxed text-muted">
        Food is made to order by independent home kitchens, so refunds work a
        little differently than at a big retailer. Here is exactly how it
        works. This policy is part of our{" "}
        <Link href="/terms" className="text-brand hover:underline">
          Terms of Service
        </Link>
        .
      </p>

      <S title="If the kitchen cancels">
        <p>
          If a kitchen cancels your order for any reason, you get a{" "}
          <strong>full refund — the item price and the service fee</strong> —
          to your original payment method. You&rsquo;ll get an email when the
          kitchen cancels. Once we issue the refund, your bank typically posts
          it within 5–10 business days; if you don&rsquo;t see it, email{" "}
          <a
            href="mailto:hello@forkfork.app"
            className="text-brand hover:underline"
          >
            hello@forkfork.app
          </a>
          .
        </p>
      </S>

      <S title="If you need to cancel">
        <p>
          Contact the kitchen as soon as possible (their contact details, when
          the kitchen has provided them, are in your confirmation email and
          under Purchases), and email{" "}
          <a
            href="mailto:hello@forkfork.app"
            className="text-brand hover:underline"
          >
            hello@forkfork.app
          </a>
          . Because food is prepared to order,{" "}
          <strong>
            cancellations are at the kitchen&rsquo;s reasonable discretion once
            preparation has started
          </strong>
          . If the kitchen hasn&rsquo;t started your order, they&rsquo;ll
          generally cancel it and you&rsquo;ll receive a full refund.
        </p>
      </S>

      <S title="If something is wrong with your order">
        <p>
          If your order is materially wrong — missing items, inedible, not what
          was listed — email{" "}
          <a
            href="mailto:hello@forkfork.app"
            className="text-brand hover:underline"
          >
            hello@forkfork.app
          </a>{" "}
          within 48 hours with your order number and a photo if you can. We
          review these case by case with the kitchen and can refund part or all
          of the order when the complaint is substantiated.
        </p>
      </S>

      <S title="Missed pickups">
        <p>
          Food is perishable and pickup windows matter. If you miss your pickup
          without arranging a new time with the kitchen, the order is{" "}
          <strong>not automatically refundable</strong> — the kitchen already
          bought ingredients and made your food. Reach out anyway; kitchens are
          human and will often work something out.
        </p>
      </S>

      <S title="How refunds are issued">
        <p>
          All refunds go to the original payment method via Stripe. No cash
          alternatives. If you believe a charge is unauthorized, contact us
          first — we can resolve most issues faster than a card dispute.
        </p>
      </S>
    </LegalPage>
  );
}
