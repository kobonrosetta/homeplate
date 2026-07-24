import {
  calcServiceFeeCents,
  formatUsd,
  SERVICE_FEE_PERCENT,
  SERVICE_FEE_FLAT_CENTS,
} from "@/lib/constants";

// Honest, consistent disclosure of the buyer-side service fee, shown wherever a
// price appears (not just the cart). Pass priceCents to also show the all-in
// estimate for a single item.
export default function FeeNote({
  priceCents,
  className = "",
}: {
  priceCents?: number;
  className?: string;
}) {
  const pct = Math.round(SERVICE_FEE_PERCENT * 100);
  const flat = formatUsd(SERVICE_FEE_FLAT_CENTS);

  if (priceCents && priceCents > 0) {
    const total = priceCents + calcServiceFeeCents(priceCents);
    return (
      <p className={`text-xs text-faint ${className}`}>
        + {pct}% + {flat} service fee · about {formatUsd(total)} total at
        checkout
      </p>
    );
  }
  return (
    <p className={`text-xs text-faint ${className}`}>
      An {pct}% + {flat} service fee is added at checkout.
    </p>
  );
}
