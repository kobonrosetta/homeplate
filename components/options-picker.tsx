"use client";

import { useMemo, useState } from "react";
import { formatUsd, calcServiceFeeCents } from "@/lib/constants";
import AddToCart from "@/components/add-to-cart";
import type { CartCook } from "@/components/cart-context";

type Group = {
  id: string;
  name: string;
  options: { id: string; name: string; price_delta_cents: number }[];
};

// Buyer-side dropdowns for a listing's cook-defined options. The price shown
// updates as choices change; it's display-only — checkout re-derives the same
// math server-side from the option rows.
export default function OptionsPicker({
  cook,
  listingId,
  title,
  basePriceCents,
  photoUrl,
  groups,
}: {
  cook: CartCook;
  listingId: string;
  title: string;
  basePriceCents: number;
  photoUrl: string | null;
  groups: Group[];
}) {
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      groups.map((g) => [g.id, g.options[0]?.id ?? ""])
    )
  );

  const { priceCents, optionIds, optionsLabel } = useMemo(() => {
    let delta = 0;
    const ids: string[] = [];
    const names: string[] = [];
    for (const g of groups) {
      const opt = g.options.find((o) => o.id === chosen[g.id]);
      if (opt) {
        delta += opt.price_delta_cents;
        ids.push(opt.id);
        names.push(opt.name);
      }
    }
    return {
      priceCents: basePriceCents + delta,
      optionIds: ids,
      optionsLabel: names.join(" · "),
    };
  }, [groups, chosen, basePriceCents]);

  const fee = calcServiceFeeCents(priceCents);

  return (
    <div className="mt-4 space-y-3">
      {groups.map((g) => (
        <label key={g.id} className="block">
          <span className="text-sm font-medium text-ink">{g.name}</span>
          <select
            value={chosen[g.id]}
            onChange={(e) =>
              setChosen((c) => ({ ...c, [g.id]: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm"
          >
            {g.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.price_delta_cents > 0
                  ? ` (+${formatUsd(o.price_delta_cents)})`
                  : ""}
              </option>
            ))}
          </select>
        </label>
      ))}

      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-xl font-semibold text-ink">{formatUsd(priceCents)}</p>
          <p className="text-xs text-faint">
            about {formatUsd(priceCents + fee)} total at checkout
          </p>
        </div>
        <AddToCart
          cook={cook}
          item={{
            listingId,
            title,
            priceCents,
            photoUrl,
            optionIds,
            optionsLabel,
          }}
        />
      </div>
    </div>
  );
}
