import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

// Served at /robots.txt. Explicitly allows crawlers (previously /robots.txt
// 404'd, which returned an HTML page carrying Next's default 404 `noindex` —
// easy to misread as "the site blocks bots"). Points crawlers at the sitemap.
export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private, transactional, or auth-gated areas — no value as search
      // results and some require a session anyway.
      disallow: [
        "/dashboard",
        "/admin",
        "/checkout",
        "/cart",
        "/orders",
        "/pay/",
        "/api/",
        "/auth/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
