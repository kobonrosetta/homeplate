import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection as S } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — ForkFork",
  description: "What ForkFork collects, how it's used, and your choices.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effective="July 31, 2026">
      <p className="text-[15px] leading-relaxed text-muted">
        This policy describes what information ForkFork (&ldquo;we&rdquo;)
        collects through forkfork.app, how we use and share it, and the choices
        you have. It applies to buyers, cooks, and visitors. By using ForkFork
        you agree to this policy and our{" "}
        <Link href="/terms" className="text-brand hover:underline">
          Terms of Service
        </Link>
        .
      </p>

      <S n="1" title="What we collect">
        <p>
          <strong>Account information.</strong> Name, email address, and a
          password — or your Google account email if you sign in with Google. A
          phone number if you provide one. Guest checkout creates a limited
          account from the contact details you enter with your order.
        </p>
        <p>
          <strong>Order information (buyers).</strong> The items you order,
          your contact name, phone, and email, a delivery address if you choose
          delivery, any note you add, your order history, and the kitchens you
          choose to follow. We do NOT collect or store your card number —
          payments are processed by Stripe.
        </p>
        <p>
          <strong>Kitchen information (cooks).</strong> Your business name and
          public storefront details (menu, photos, bio, city/neighborhood), and
          — kept private — your home address, pickup location, permit number,
          CDTFA seller&rsquo;s permit number, and an optional photo of your
          permit. Payout details (bank account, SSN/tax info) are collected
          directly by Stripe through its onboarding, not by us; we store only
          your Stripe account identifier and its onboarding status.
        </p>
        <p>
          <strong>Automatic information.</strong> Standard server logs (IP
          address, browser type, pages requested) and the cookies described
          below. We do not currently run third-party advertising or analytics
          trackers.
        </p>
      </S>

      <S n="2" title="How we use it">
        <p>
          To operate the marketplace: create and secure your account, process
          and coordinate orders, route payments and cook payouts through
          Stripe, verify cook permits against Santa Clara County&rsquo;s
          published operator lists, show reviews tied to real orders, provide
          support, send transactional email (order confirmations, updates,
          password resets, and — if you follow a kitchen — new-dish
          notifications you can stop at any time), prevent fraud and abuse, and
          comply with law. If a cook uses our AI helpers, the listing text or
          photo they submit is processed by our AI provider to generate a
          description or quality check.
        </p>
      </S>

      <S n="3" title="When we share it">
        <p>
          <strong>Between buyers and cooks (the point of the service).</strong>{" "}
          When you place an order, the cook receives your order details and
          contact information (name, phone, email, delivery address or note) so
          they can prepare and hand off your food. After you order, you receive
          the kitchen&rsquo;s pickup details and, where the cook has provided
          them, their contact info. Cooks&rsquo;
          public storefronts (business name, menu, photos, city) are visible to
          everyone; a cook&rsquo;s home address is never shown publicly.
        </p>
        <p>
          <strong>Service providers.</strong> We use a small set of processors
          to run ForkFork: Supabase (database, authentication, file storage),
          Stripe (payments and cook payouts), Resend (email delivery), Groq
          (AI processing of cook-submitted listing text/photos), Render
          (hosting), and Google (optional sign-in). Each receives only what it
          needs to provide its service.
        </p>
        <p>
          <strong>Legal and safety.</strong> We may disclose information when
          required by law, to enforce our Terms, or to protect the rights,
          safety, or property of users, cooks, or ForkFork — including sharing
          permit-related information with Santa Clara County authorities where
          appropriate.
        </p>
        <p>
          <strong>We do not sell your personal information</strong> and we do
          not share it with third parties for their own advertising.
        </p>
      </S>

      <S n="4" title="Cookies">
        <p>
          We use first-party cookies strictly to keep you signed in and to make
          the site work (authentication/session cookies, and your cart is kept
          in your browser&rsquo;s local storage). We do not use advertising
          cookies. Because behavior doesn&rsquo;t vary by tracking preference,
          we do not respond to browser &ldquo;Do Not Track&rdquo; signals —
          there is no cross-site tracking to turn off.
        </p>
      </S>

      <S n="5" title="Retention and security">
        <p>
          We keep account and order records while your account is active and as
          needed for legitimate business purposes — order history, payment and
          tax records in particular have legally required retention periods.
          Permit photos are stored in a private bucket accessible only to our
          review team. Data is transmitted over HTTPS and stored with
          access-controlled infrastructure. No system is perfectly secure; if a
          breach affects your information we will notify you as required by
          California law.
        </p>
      </S>

      <S n="6" title="Your choices">
        <p>
          Cooks can view and update their kitchen and profile details in the
          dashboard. Anyone can unfollow a kitchen to stop its notifications
          and reset their password anytime. To view, update, or correct
          anything else, or to request a copy of your data or deletion of your
          account, email{" "}
          <a
            href="mailto:hello@forkfork.app"
            className="text-brand hover:underline"
          >
            hello@forkfork.app
          </a>{" "}
          — we will honor deletion requests except for records we must keep
          (for example, completed order, payment, and tax records).
        </p>
      </S>

      <S n="7" title="Children">
        <p>
          ForkFork is not directed to children and is intended for users 18 and
          older. We do not knowingly collect personal information from children
          under 13; if you believe a child has provided us information, contact
          us and we will delete it.
        </p>
      </S>

      <S n="8" title="Changes and contact">
        <p>
          We may update this policy as ForkFork evolves; material changes will
          be reflected in the effective date above and, where appropriate,
          notified by email or in-product notice. Questions and requests:{" "}
          <a
            href="mailto:hello@forkfork.app"
            className="text-brand hover:underline"
          >
            hello@forkfork.app
          </a>
          .
        </p>
      </S>
    </LegalPage>
  );
}
