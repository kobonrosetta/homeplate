// The county-verified trust mark — the product's whole positioning, so it must
// read identically everywhere. One label ("County-verified"), two variants:
// - "pill": solid emerald pill for on-page use (kitchen, pay).
// - "overlay": translucent pill that sits on top of a food photo (browse card,
//   hero slideshow).
export default function VerifiedBadge({
  variant = "pill",
  className = "",
}: {
  variant?: "pill" | "overlay";
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium";
  const skin =
    variant === "overlay"
      ? "bg-white/85 text-emerald-800 backdrop-blur-sm"
      : "bg-emerald-100 text-emerald-800";
  return (
    <span className={`${base} ${skin}${className ? ` ${className}` : ""}`}>
      ✓ County-verified
    </span>
  );
}
