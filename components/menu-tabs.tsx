"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

// Pinned section tabs for a sectioned kitchen menu. Each tab is a plain anchor
// — it works before JS loads, and the browser's own hash jump lands each
// section heading just under the bar via the sections' scroll-margin. JS only
// adds the active-section highlight and keeps that tab in view inside the bar.
//
// Rendered as the first child of the wrapper that holds the sections, so it
// pins for exactly the length of the menu and lets go before Extras / Meet the
// chef / Reviews. Styled as underline tabs (like the dashboard's), never as
// pills, so it can't be mistaken for the kitchen's informational tags.
// Layering: z-30 keeps it under the cart pill (z-50), the replace-cart dialog
// (z-60) and the add-to-cart toast (z-70).
export default function MenuTabs({
  sections,
  kitchen,
}: {
  sections: { id: string; label: string }[];
  kitchen: string;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const ids = sections.map((s) => s.id).join("|");

  // Scroll-spy: the active section is the last one whose top has reached the
  // bar (plus a little slack, so a tapped section lights up even though its
  // scroll-margin parks it a few px below the bar).
  useEffect(() => {
    const list = ids.split("|");
    let raf = 0;
    const update = () => {
      raf = 0;
      const barBottom = navRef.current?.getBoundingClientRect().bottom ?? 0;
      let current = list[0] ?? "";
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= barBottom + 24) current = id;
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
    const tab = bar?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (!bar || !tab) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left >= bar.scrollLeft && right <= bar.scrollLeft + bar.clientWidth) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bar.scrollTo({ left: Math.max(0, left - 16), behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="Menu sections"
      className="sticky top-0 z-30 -mx-6 mt-4 border-b border-line bg-bg px-6"
    >
      <div
        ref={barRef}
        className="relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              data-tab={s.id}
              aria-current={on ? "location" : undefined}
              onClick={() => {
                setActive(s.id);
                track("menu_tab_click", { kitchen, section: s.id });
              }}
              className={
                on
                  ? "whitespace-nowrap border-b-2 border-brand px-4 py-3 text-sm font-medium text-ink"
                  : "whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm text-muted hover:text-ink"
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
