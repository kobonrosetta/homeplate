import { ImageResponse } from "next/og";

// The default share card for the whole site (homepage + any page without its
// own opengraph-image). Kitchen pages override this with their own card.
export const alt =
  "ForkFork — county-verified home kitchens in Santa Clara County";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(135deg, #b45309 0%, #7c2d12 100%)",
        }}
      >
        <div style={{ display: "flex", color: "#ffffff", fontSize: 34, fontWeight: 700 }}>
          ForkFork
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.08,
              maxWidth: 960,
            }}
          >
            {"The best food near you isn't from a restaurant."}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#fde8d5" }}>
            County-verified home kitchens in Santa Clara County
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
