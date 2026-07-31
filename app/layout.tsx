import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { CartProvider } from "@/components/cart-context";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  // Absolute base for Open Graph/Twitter URLs — link unfurls need full URLs.
  metadataBase: new URL(SITE_URL),
  title: "ForkFork — county-verified home kitchens near you",
  description:
    "Order hot home-cooked meals and fresh-baked goods from county-verified home kitchens in Santa Clara County. Every cook is checked against the county's approved-operator list.",
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
