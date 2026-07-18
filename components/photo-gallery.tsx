"use client";

import { useState } from "react";

// Cover photo + clickable thumbnails for a listing's extra photos.
export default function PhotoGallery({
  urls,
  alt,
}: {
  urls: string[];
  alt: string;
}) {
  const [active, setActive] = useState(0);

  if (urls.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-line text-6xl text-faint">
        🍽️
      </div>
    );
  }

  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-2xl bg-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[active]}
          alt={alt}
          className="h-full w-full object-cover"
        />
      </div>
      {urls.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {urls.map((u, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${
                i === active ? "border-brand" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
