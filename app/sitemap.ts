import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/constants";

// Regenerate on each request so a newly-approved kitchen appears without a
// redeploy — the whole app is force-dynamic, and the sitemap follows suit.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL.replace(/\/$/, "");

  // Public marketing + legal pages worth indexing (private/auth areas are
  // excluded here and disallowed in robots.ts).
  const staticPaths: { path: string; priority: number; freq: "daily" | "weekly" | "monthly" }[] = [
    { path: "", priority: 1.0, freq: "daily" },
    { path: "/browse", priority: 0.9, freq: "daily" },
    { path: "/verified", priority: 0.7, freq: "monthly" },
    { path: "/faq", priority: 0.6, freq: "monthly" },
    { path: "/sell", priority: 0.7, freq: "monthly" },
    { path: "/terms", priority: 0.3, freq: "monthly" },
    { path: "/privacy", priority: 0.3, freq: "monthly" },
    { path: "/refunds", priority: 0.3, freq: "monthly" },
    { path: "/chef-agreement", priority: 0.3, freq: "monthly" },
  ];
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${base}${p.path}`,
    changeFrequency: p.freq,
    priority: p.priority,
  }));

  // Live kitchens — same visibility rule as Browse (active + payout-ready).
  // Best-effort: if the query fails, still return the static pages so the
  // sitemap never breaks.
  let kitchenEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("cooks")
      .select("slug")
      .eq("status", "active")
      .eq("stripe_ready", true)
      .limit(5000);
    kitchenEntries = (data ?? [])
      .filter((c: any) => c.slug)
      .map((c: any) => ({
        url: `${base}/kitchen/${c.slug}`,
        changeFrequency: "daily" as const,
        priority: 0.8,
      }));
  } catch {
    /* keep the static entries even if the kitchen query fails */
  }

  return [...staticEntries, ...kitchenEntries];
}
