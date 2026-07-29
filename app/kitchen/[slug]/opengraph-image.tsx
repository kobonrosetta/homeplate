import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

// The share card for a kitchen — what unfurls when the cook's link lands in a
// WhatsApp group or an Instagram bio. Split layout: warm-editorial brand panel
// (name + verified badge) beside their best food photo; a full-bleed branded
// gradient when no photo exists yet. Kept deliberately small in pixels — chat
// apps render previews tiny, and WhatsApp's crawler skips heavy images, so a
// compact PNG beats a beautiful one that never loads.
//
// Uses a bare anon-key client (public data only: active kitchens + their
// listing photos) — no cookies/session machinery in an image route.

export const alt = "A county-verified home kitchen on HomePlate";
export const size = { width: 840, height: 441 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: cook } = await supabase
    .from("cooks")
    .select("id, business_name, city, permit_verified")
    .eq("slug", params.slug)
    .eq("status", "active")
    .maybeSingle();

  let photo: string | null = null;
  if (cook) {
    const { data: ls } = await supabase
      .from("listings")
      .select("photo_url")
      .eq("cook_id", cook.id)
      .eq("is_available", true)
      .not("photo_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    photo = ls?.[0]?.photo_url ?? null;
  }

  const rawName = cook?.business_name ?? "HomePlate";
  const name =
    rawName.length > 44 ? `${rawName.slice(0, 43).trimEnd()}…` : rawName;
  const badge = cook?.permit_verified
    ? `County-verified${cook.city ? ` · ${cook.city}` : ""}`
    : cook?.city || "Santa Clara County";

  const Badge = (
    <div style={{ display: "flex" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          backgroundColor: "#059669",
          color: "#ffffff",
          fontSize: 19,
          fontWeight: 600,
          padding: "7px 16px",
          borderRadius: 999,
        }}
      >
        {cook?.permit_verified && (
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M20 6L9 17l-5-5"
              stroke="#ffffff"
              strokeWidth={3.2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {badge}
      </div>
    </div>
  );

  if (!photo) {
    // Branded fallback for kitchens with no food photo yet.
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 40,
            background: "linear-gradient(135deg, #b45309 0%, #7c2d12 100%)",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#ffffff",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            HomePlate
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                display: "flex",
                fontSize: 50,
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1.08,
              }}
            >
              {name}
            </div>
            {Badge}
          </div>
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#faf7f2",
        }}
      >
        <div
          style={{
            width: 390,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "34px 34px 30px 38px",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#b45309",
              fontSize: 23,
              fontWeight: 700,
            }}
          >
            HomePlate
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                display: "flex",
                fontSize: name.length > 22 ? 36 : 44,
                fontWeight: 700,
                color: "#292524",
                lineHeight: 1.1,
              }}
            >
              {name}
            </div>
            {Badge}
            <div style={{ display: "flex", fontSize: 17, color: "#78716c" }}>
              Order ahead · pick up nearby
            </div>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img
          src={photo}
          width={450}
          height={441}
          style={{ width: 450, height: 441, objectFit: "cover" }}
        />
      </div>
    ),
    { ...size }
  );
}
