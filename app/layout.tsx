import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { CartProvider } from "@/components/cart-context";
import { SITE_URL } from "@/lib/constants";
import JsonLd from "@/components/json-ld";
import { organizationSchema } from "@/lib/schema";
import AnalyticsProvider from "@/components/analytics-provider";

const TITLE = "ForkFork · county-verified home kitchens near you";
const DESCRIPTION =
  "Order hot home-cooked meals and fresh-baked goods from county-verified home kitchens in Santa Clara County. Every chef is checked against the county's approved-operator list.";

export const metadata: Metadata = {
  // Absolute base for Open Graph/Twitter URLs — link unfurls need full URLs.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // Defaults for every page; kitchen/listing override with their own card.
  // The root app/opengraph-image.tsx supplies og:image / twitter:image.
  openGraph: {
    type: "website",
    siteName: "ForkFork",
    locale: "en_US",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  // Google Search Console verification. Set GOOGLE_SITE_VERIFICATION on Render to
  // the code Google gives you (HTML-tag method); renders
  // <meta name="google-site-verification" ...>. Omitted when unset.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

// Warm editorial type: Fraunces for display headings, Inter for everything else.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fraunces",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <JsonLd data={organizationSchema()} />
        <AnalyticsProvider />
        <CartProvider>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
        </CartProvider>
      </body>
    </html>
  );
}
