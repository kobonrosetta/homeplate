"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/constants";

export type HeroKitchen = {
  slug: string;
  name: string;
  city: string | null;
  photo: string;
  verified: boolean;
  minPriceCents: number | null;
};

// Landing-page hero slideshow of real kitchens pulled from the database.
// Each slide links to the kitchen's page; advances every few seconds and
// pauses while the visitor is hovering or focused on it.
export default function HeroSlideshow({
  kitchens,
}: {
  kitchens: HeroKitchen[];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || kitchens.length < 2) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % kitchens.length),
      4500
    );
    return () => clearInterval(timer);
  }, [paused, kitchens.length]);

  if (kitchens.length === 0) return null;

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-line bg-line shadow-lift lg:aspect-[4/5]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {kitchens.map((k, i) => (
        <Link
          key={k.slug}
          href={`/kitchen/${k.slug}`}
          aria-hidden={i !== index}
          tabIndex={i === index ? 0 : -1}
          className={`absolute inset-0 transition-opacity duration-700 ${
            i === index ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={k.photo}
            alt={k.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-5 pt-16 text-white">
            {k.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-medium text-emerald-800 backdrop-blur-sm">
                ✓ Verified
              </span>
            )}
            <p className="mt-2 font-display text-2xl font-semibold leading-tight">
              {k.name}
            </p>
            <p className="mt-1 text-sm text-white/80">
              {k.city ? `${k.city} · ` : ""}
              {k.minPriceCents != null
                ? `from ${formatUsd(k.minPriceCents)}`
                : "View kitchen"}{" "}
              →
            </p>
          </div>
        </Link>
      ))}

      {kitchens.length > 1 && (
        <div className="absolute right-4 top-4 flex gap-1.5">
          {kitchens.map((k, i) => (
            <button
              key={k.slug}
              type="button"
              aria-label={`Show ${k.name}`}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-5 bg-white" : "w-2 bg-white/50 hover:bg-white/75"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
