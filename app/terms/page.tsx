import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection as S } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — ForkFork",
  description: "The terms that govern using the ForkFork marketplace.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effective="July 31, 2026">
      <p className="text-[15px] leading-relaxed text-muted">
        Welcome to ForkFork. These Terms of Service (&ldquo;Terms&rdquo;) govern
        your use of the ForkFork website and services at forkfork.app (the
        &ldquo;Services&rdquo;), operated by ForkFork (&ldquo;ForkFork,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account, placing an
        order, or otherwise using the Services, you agree to these Terms, our{" "}
        <Link href="/privacy" className="text-brand hover:underline">
          Privacy Policy
        </Link>
        , and our{" "}
        <Link href="/refunds" className="text-brand hover:underline">
          Refund Policy
        </Link>
        . If you sell on ForkFork, the{" "}
        <Link href="/cook-agreement" className="text-brand hover:underline">
          Cook Agreement
        </Link>{" "}
        also applies. If you do not agree, do not use the Services.
      </p>

      <S n="1" title="What ForkFork is (and is not)">
        <p>
          ForkFork is an online <strong>marketplace</strong> that connects
          buyers with <strong>independent home-food operators</strong>{" "}
          (&ldquo;cooks&rdquo;) who hold a Microenterprise Home Kitchen
          Operation (MEHKO) permit or a cottage food operation registration or
          permit issued by Santa Clara County, California.
        </p>
        <p>
          <strong>
            Cooks are independent businesses. ForkFork does not prepare, cook,
            package, label, store, transport, or sell any food.
          </strong>{" "}
          Each order is a transaction between you and the cook: the cook is the
          seller of the food, sets their own prices and menu, prepares the food
          in their own permitted home kitchen, and is solely responsible for
          food safety, ingredient and allergen accuracy, labeling, packaging,
          and complying with the laws that apply to their operation. Cooks are
          not employees, agents, partners, or joint venturers of ForkFork.
        </p>
      </S>

      <S n="2" title='What "County-verified" means'>
        <p>
          When a kitchen displays a &ldquo;County-verified&rdquo; badge (or
          similar), it means exactly this: at the time of review, the permit
          information the cook provided matched an entry on Santa Clara
          County&rsquo;s published list of approved MEHKO or cottage food
          operators — or our team verified the cook&rsquo;s permit
          documentation directly — and a member of our team reviewed the
          application. We check the county list periodically, not in real
          time.
        </p>
        <p>
          The badge is <strong>not</strong> a guarantee, endorsement, or
          certification of any cook, kitchen, or food item. It does not mean
          ForkFork has inspected any kitchen, tasted any food, or verified
          anything beyond the permit match described above. Permits are issued
          and enforced by the county, not by ForkFork, and a permit&rsquo;s
          status can change at any time.
        </p>
      </S>

      <S n="3" title="Food safety and allergens">
        <p>
          Food sold on ForkFork is prepared in home kitchens operating under
          California&rsquo;s home-kitchen and cottage-food laws — not in
          commercial restaurant facilities. Ingredient and allergen information
          is provided by the cook, and ForkFork does not verify it.
        </p>
        <p>
          <strong>
            If you have a food allergy or dietary restriction, contact the cook
            directly before ordering and make your own judgment about whether
            to order.
          </strong>{" "}
          Cross-contact with allergens is possible in any kitchen. You assume
          the risks inherent in purchasing and consuming food prepared by an
          independent operator.
        </p>
      </S>

      <S n="4" title="Accounts and eligibility">
        <p>
          You must be at least 18 years old to use the Services. You are
          responsible for your account credentials and for everything done under
          your account. Guest checkout creates a limited account tied to your
          order so you can view it later; you may claim it with an email and
          password.
        </p>
        <p>
          You agree to provide accurate information (including a working phone
          number and email for order coordination) and to use the Services only
          for lawful, personal, non-commercial purchases unless you are an
          approved cook.
        </p>
      </S>

      <S n="5" title="Orders, prices, and payment">
        <p>
          The listed price of every item is set by the cook, and the cook
          receives 100% of it. At checkout, buyers pay a ForkFork service fee
          (currently 8% of the subtotal plus $0.30), which is shown before you
          pay. Listed prices include any California sales tax due on the item;
          the cook is responsible for reporting and remitting that tax.
        </p>
        <p>
          Payments are processed by Stripe. ForkFork does not store your card
          number. When you pay, you authorize the total shown; your payment to
          ForkFork settles your payment obligation to the cook for that order,
          and the cook&rsquo;s share is transferred to them through Stripe. An
          order is a binding purchase once payment is confirmed, subject to the{" "}
          <Link href="/refunds" className="text-brand hover:underline">
            Refund Policy
          </Link>
          .
        </p>
        <p>
          Pickup and delivery are arranged between you and the cook as shown at
          checkout. Exact pickup details (and the kitchen&rsquo;s contact info,
          where provided) are shared after you order. Please be on time — food
          is perishable, and a missed pickup is not automatically refundable.
        </p>
      </S>

      <S n="6" title="Reviews and other content">
        <p>
          You may post a review only for an order you actually completed.
          Reviews must reflect your genuine experience and must not be
          defamatory, harassing, discriminatory, or unlawful. Cooks provide
          their own listing content (names, photos, descriptions). ForkFork may
          — but is not obligated to — moderate, edit the display of, or remove
          any content, listing, review, or account at its discretion, including
          for suspected policy violations or safety concerns.
        </p>
        <p>
          You grant ForkFork a non-exclusive, royalty-free license to host,
          display, and reproduce content you submit, for the purpose of
          operating and promoting the Services. Content belongs to whoever
          created it; ForkFork is a platform for it, and to the extent permitted
          by law we are not the publisher or speaker of user content.
        </p>
      </S>

      <S n="7" title="Acceptable use">
        <p>
          You agree not to: misrepresent your identity; place orders you do not
          intend to complete; circumvent the Services to solicit or complete
          off-platform payment for an order initiated on ForkFork; scrape,
          reverse-engineer, or interfere with the Services; attempt to access
          another user&rsquo;s data; use the Services to send spam; or use the
          Services in violation of any law. We may suspend or terminate
          accounts that violate these Terms.
        </p>
      </S>

      <S n="8" title="Disclaimers">
        <p>
          THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE.&rdquo; TO THE FULLEST EXTENT PERMITTED BY LAW, FORKFORK
          DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT. FORKFORK DOES NOT WARRANT THE QUALITY, SAFETY,
          LEGALITY, OR ACCURACY OF ANY FOOD, LISTING, OR REVIEW, OR THAT THE
          SERVICES WILL BE UNINTERRUPTED OR ERROR-FREE.
        </p>
      </S>

      <S n="9" title="Limitation of liability">
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW: (a) FORKFORK IS NOT LIABLE
          FOR THE ACTS OR OMISSIONS OF ANY COOK OR BUYER, INCLUDING ANY ILLNESS,
          INJURY, OR DAMAGE ARISING FROM FOOD PREPARED OR SOLD BY A COOK; (b)
          FORKFORK IS NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOST PROFITS; AND (c)
          FORKFORK&rsquo;S TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THE
          SERVICES WILL NOT EXCEED THE GREATER OF (i) THE SERVICE FEES YOU PAID
          TO FORKFORK IN THE SIX MONTHS BEFORE THE CLAIM AROSE OR (ii) $100.
        </p>
        <p>
          Some jurisdictions do not allow certain limitations, so parts of this
          section may not apply to you. Nothing in these Terms limits liability
          that cannot be limited by law.
        </p>
      </S>

      <S n="10" title="Indemnity">
        <p>
          You agree to indemnify and hold ForkFork harmless from claims,
          damages, and expenses (including reasonable attorneys&rsquo; fees)
          arising from your content, your use of the Services, your violation
          of these Terms, or — if you are a cook — the food and services you
          provide.
        </p>
      </S>

      <S n="11" title="Disputes: binding arbitration & class-action waiver">
        <p>
          <strong>Please read this section carefully — it affects your
          rights.</strong> Any dispute arising out of or relating to these
          Terms or the Services that cannot be resolved informally will be
          resolved by <strong>binding individual arbitration</strong>{" "}
          administered by the American Arbitration Association under its
          Consumer Arbitration Rules, in Santa Clara County, California (or by
          video, or in your county of residence, per those rules). Judgment on
          the award may be entered in any court of competent jurisdiction.
        </p>
        <p>
          <strong>
            You and ForkFork each waive the right to a jury trial and to
            participate in a class action.
          </strong>{" "}
          Disputes may only be brought individually. Either party may instead
          bring an individual claim in small-claims court, and either party may
          seek injunctive relief in court for intellectual-property misuse.
        </p>
        <p>
          You may opt out of this arbitration agreement by emailing
          hello@forkfork.app with your name and account email within 30 days of
          first accepting these Terms.
        </p>
      </S>

      <S n="12" title="General">
        <p>
          These Terms are governed by California law, without regard to
          conflict-of-laws rules. If a provision is found unenforceable, the
          rest remains in effect. Our failure to enforce a provision is not a
          waiver. You may not assign these Terms; we may assign them in
          connection with a merger, acquisition, or sale of assets. These
          Terms, the Privacy Policy, the Refund Policy, and (for cooks) the
          Cook Agreement are the entire agreement between you and ForkFork
          about the Services.
        </p>
        <p>
          We may update these Terms as the Services evolve. If we make material
          changes, we will update the effective date above and take reasonable
          steps to notify you (for example, by email or an in-product notice).
          Continued use of the Services after changes take effect constitutes
          acceptance.
        </p>
      </S>
    </LegalPage>
  );
}
