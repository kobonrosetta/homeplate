import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection as S } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Chef Agreement — ForkFork",
  description: "The terms for selling on ForkFork as a permitted home kitchen.",
};

export default function CookAgreementPage() {
  return (
    <LegalPage title="Chef Agreement" effective="July 31, 2026">
      <p className="text-[15px] leading-relaxed text-muted">
        This agreement applies to anyone who applies to sell or sells on
        ForkFork (&ldquo;you,&rdquo; a &ldquo;chef&rdquo;), in addition to the{" "}
        <Link href="/terms" className="text-brand hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-brand hover:underline">
          Privacy Policy
        </Link>
        . You accept it when you submit your kitchen application.
      </p>

      <S n="1" title="You are an independent business">
        <p>
          You sell food as an independent operator — not as an employee, agent,
          franchisee, or representative of ForkFork. You control your menu,
          prices, schedule, and preparation. Nothing in this agreement creates
          an employment, agency, or partnership relationship, and you are not
          entitled to employee benefits of any kind.
        </p>
      </S>

      <S n="2" title="Permits are mandatory">
        <p>
          To sell on ForkFork you must hold and maintain a current, valid Santa
          Clara County MEHKO permit or cottage food registration/permit
          appropriate to what you sell, and you may only sell what your permit
          category allows (for example, cottage operations may only sell
          approved shelf-stable foods). You must tell us promptly if your
          permit is suspended, revoked, expired, or changed.{" "}
          <strong>No valid permit means no selling on ForkFork</strong> — we
          may suspend or remove a kitchen at any time if we believe its permit
          status or conduct puts buyers at risk.
        </p>
      </S>

      <S n="3" title="Food safety is your responsibility">
        <p>
          You are solely responsible for the safety, quality, preparation,
          packaging, labeling, and legal compliance of everything you sell —
          including accurate ingredient and allergen information on every
          listing and any labeling required by California cottage food or MEHKO
          law. ForkFork does not inspect kitchens or verify food and assumes no
          responsibility for it.
        </p>
      </S>

      <S n="4" title="Pricing, fees, and taxes">
        <p>
          You set your prices and{" "}
          <strong>you receive 100% of your listed price on every order</strong>
          . ForkFork charges you no commission, listing fee, or subscription;
          our revenue is a service fee buyers pay at checkout.
        </p>
        <p>
          <strong>Your prices include tax.</strong> The price you set for each
          item includes any California sales tax due on it. Reporting and
          remitting that tax on your own CDTFA seller&rsquo;s permit is your
          responsibility — your dashboard totals it for you each quarter as a
          convenience, not as tax advice. Income taxes on your earnings are
          also yours to report regardless of whether you receive a tax form;
          where IRS thresholds and Stripe&rsquo;s requirements apply, tax forms
          (such as a 1099-K) are issued for payouts Stripe processes, and your
          full payout history is always available in your Stripe dashboard.
        </p>
      </S>

      <S n="5" title="Getting paid">
        <p>
          <strong>
            You appoint ForkFork as your limited agent solely to collect
            payment from buyers on your behalf.
          </strong>{" "}
          A buyer&rsquo;s completed payment to ForkFork satisfies their payment
          obligation to you for that order, and your full listed price is then
          transferred to you automatically through Stripe.
        </p>
        <p>
          Payouts require you to complete Stripe&rsquo;s onboarding (identity
          and bank verification) and are subject to Stripe&rsquo;s Connected
          Account Agreement. Your kitchen is not visible to buyers until
          payouts are active. If an order you were paid for is refunded under
          the{" "}
          <Link href="/refunds" className="text-brand hover:underline">
            Refund Policy
          </Link>
          , the corresponding transfer to you may be reversed.
        </p>
      </S>

      <S n="6" title="Orders and buyer information">
        <p>
          Accept only what you can fulfill; prepare orders as listed and have
          them ready at the arranged pickup or delivery time; keep your menu
          and availability accurate; and communicate promptly with buyers.
          Repeated cancellations or no-shows can lead to suspension.
        </p>
        <p>
          Buyer contact details are shared with you{" "}
          <strong>only to fulfill orders</strong>. You may not use them for
          marketing, add them to mailing lists, sell or share them, or solicit
          buyers to transact off-platform for orders initiated on ForkFork.
        </p>
      </S>

      <S n="7" title="Your content">
        <p>
          You grant ForkFork a non-exclusive, royalty-free license to host and
          display the content you provide (kitchen name, photos, descriptions)
          to operate and promote the marketplace. You confirm you have the
          rights to everything you upload and that your kitchen branding
          doesn&rsquo;t infringe anyone else&rsquo;s trademark.
        </p>
      </S>

      <S n="8" title="Insurance (strongly recommended)">
        <p>
          ForkFork does not provide insurance of any kind. We strongly
          recommend carrying liability insurance appropriate for a home food
          business; you bear the business and legal risk of your operation,
          and you agree to indemnify ForkFork for claims arising from your
          food, your operation, or your breach of this agreement, per the
          Terms of Service.
        </p>
      </S>

      <S n="9" title="Ending things">
        <p>
          You can pause your kitchen anytime from your dashboard, or ask us to
          close it entirely. ForkFork may suspend or terminate a kitchen at any
          time for permit issues, safety concerns, policy violations, or risk
          to the marketplace. Orders already paid at termination are handled
          under the Refund Policy; completed order, payment, and tax records
          are retained as required by law.
        </p>
      </S>
    </LegalPage>
  );
}
