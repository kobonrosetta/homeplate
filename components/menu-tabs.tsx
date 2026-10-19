"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { jumpToSection } from "@/components/section-link";

// Pinned section tabs for a sectioned kitchen menu. Each tab is an anchor that
// works before JS loads; once hydrated, taps go through jumpToSection (see
// section-link.tsx for why a plain hash jump breaks Back under Next 14.2).
// The landing offset comes from the page's scroll-padding-top (globals.css),
// which also keeps keyboard focus from hiding under the bar.
//
// Rendered as the first child of the wrapper that holds the sections, so it
// pins for exactly the length of the menu and lets go before Extras / Meet the
// chef / Reviews. Styled as underline tabs (like the dashboard's), never as
// pills, so it can't be mistaken for the kitchen's informational tags.
// Layering: z-30 keeps it under the cart pill (z-50), the replace-cart dialog
// (z-60) and the add-to-cart toast (z-70).
export default function MenuTabs({
  sections,
  cookSlug,
}: {
  sections: { id: string; label: string }[];
  cookSlug: string;
}) {
  // Empty until mounted: the server-rendered bar must not claim a section
  // (a page opened at #trays would otherwise flash "Plates & sides").
  const [active, setActive] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const ids = sections.map((s) => s.id).join("|");

  // Scroll-spy: the active section is the last one whose top has reached the
  // landing line (the bar, or the scroll-padding a jump parks headings at —
  // whichever is lower, so a larger root font size still lights the tapped
  // tab). At the very bottom of the page a short final section can never reach
  // that line, so there the last section on screen wins.
  useEffect(() => {
    const list = ids.split("|");
    let raf = 0;
    const update = () => {
      raf = 0;
      const barBottom = navRef.current?.getBoundingClientRect().bottom ?? 0;
      const pad =
        parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const line = Math.max(barBottom + 24, pad + 8);
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      let current = list[0] ?? "";
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top === undefined) continue;
        if (top <= line || (atBottom && top < window.innerHeight)) current = id;
      }
      setActive((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids]);

  // Keep the active tab visible inside a bar that scrolls sideways on narrow
  // phones. bar.scrollTo only — scrollIntoView would also scroll the PAGE.
  useEffect(() => {
    const bar = barRef.current;
    const tab = active
      ? bar?.querySelector<HTMLElement>(`[data-tab="${active}"]`)
      : null;
    if (!bar || !tab) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left >= bar.scrollLeft && right <= bar.scrollLeft + bar.clientWidth) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bar.scrollTo({ left: Math.max(0, left - 24), behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  const base =
    "whitespace-nowrap border-b-2 px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand";
  return (
    <nav
      ref={navRef}
      aria-label="Menu sections"
      className="sticky top-0 z-30 -mx-6 mt-4 border-b border-line bg-bg"
    >
      {/* Padding lives on the scroller, not the nav, so overflowing tabs run
          to the screen edge instead of being clipped 24px short of it. */}
      <div
        ref={barRef}
        className="relative flex gap-1 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              data-tab={s.id}
              aria-current={on ? "location" : undefined}
              onClick={(e) => {
                if (!jumpToSection(e, s.id)) return;
                setActive(s.id);
                track("menu_tab_click", { cook_slug: cookSlug, section: s.id });
              }}
              className={
                on
                  ? `${base} border-brand font-medium text-ink`
                  : `${base} border-transparent text-muted hover:text-ink`
              }
            >
              {s.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
