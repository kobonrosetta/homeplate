"use client";

import { useEffect } from "react";

// Re-applies a #fragment once the kitchen page's real content has mounted.
//
// The page streams in behind app/kitchen/[slug]/loading.tsx, so on a fresh
// load of /kitchen/<slug>#trays (the cook's "Catering link") or a "Back to
// menu" visit, the browser's — and Next's — one fragment scroll runs against
// the skeleton, finds no target, and leaves the buyer at the top of a very long
// page. This mounts with the real content and finishes the job, but only when
// the target is still BELOW where a jump would park it — it never yanks back a
// buyer who has already scrolled past it, and is a no-op when the browser did
// land correctly.
export default function HashScroll() {
  useEffect(() => {
    let id = "";
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    const pad =
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    if (el.getBoundingClientRect().top > pad + margin + 4) el.scrollIntoView();
  }, []);
  return null;
}
