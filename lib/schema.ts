// schema.org builders for structured data (JSON-LD). Feeds Google rich results
// (LocalBusiness panels, product price, star ratings, breadcrumbs) and the AI
// answer engines that extract facts from structured data rather than prose.
//
// Conventions:
// - Ratings live on the KITCHEN (reviews are per-kitchen), never on a Product —
//   attaching a business rating to product markup violates Google's policy.
// - The chef's street address is private, so kitchen markup carries city/region
//   only, never the exact address.
import { SITE_URL } from "@/lib/constants";

const base = SITE_URL.replace(/\/$/, "");

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ForkFork",
    url: base,
    logo: `${base}/icon.svg`,
    description:
      "A marketplace for county-verified home chefs in Santa Clara County, California — permitted MEHKO kitchens and cottage-food bakers.",
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Santa Clara County, California",
    },
  };
}

export function kitchenSchema(opts: {
  slug: string;
  name: string;
  operationType?: string | null;
  description?: string | null;
  city?: string | null;
  image?: string | null;
  ratingValue?: number;
  reviewCount?: number;
  cuisines?: string[];
}) {
  const url = `${base}/kitchen/${opts.slug}`;
  const type = opts.operationType === "cottage" ? "Bakery" : "Restaurant";
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": type,
    name: opts.name,
    url,
    ...(opts.image ? { image: opts.image } : {}),
    ...(opts.description ? { description: opts.description } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: opts.city || "Santa Clara County",
      addressRegion: "CA",
      addressCountry: "US",
    },
    ...(opts.cuisines && opts.cuisines.length
      ? { servesCuisine: opts.cuisines }
      : {}),
  };
  if (opts.reviewCount && opts.reviewCount > 0 && opts.ratingValue) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(opts.ratingValue.toFixed(1)),
      reviewCount: opts.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return schema;
}

export function listingSchema(opts: {
  id: string;
  title: string;
  description?: string | null;
  image?: string | null;
  priceCents: number;
  available: boolean;
  kitchenName: string;
}) {
  const url = `${base}/listing/${opts.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.title,
    ...(opts.image ? { image: opts.image } : {}),
    ...(opts.description ? { description: opts.description } : {}),
    brand: { "@type": "Brand", name: opts.kitchenName },
    offers: {
      "@type": "Offer",
      price: (opts.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      availability: opts.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url,
      seller: { "@type": "Organization", name: opts.kitchenName },
    },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${base}${it.path}`,
    })),
  };
}
