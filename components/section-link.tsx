"use client";

import type { ReactNode } from "react";

// In-page jumps on the kitchen page (menu tabs, "See trays", the chef strip).
//
// A plain <a href="#id"> click makes the browser push a history entry with
// state = null, and Next 14.2's App Router ignores popstate for such entries
// (`if (!state) return`) — so after tapping a tab and opening a dish, Back
// changed the URL but left the dish page on screen. Once hydrated we take the
// click: scroll ourselves (scrollIntoView honours the page's scroll-padding /
// scroll-margin) and REPLACE the URL hash through Next's patched replaceState,
// which copies its router state into the entry. Replace, not push, so tab taps
// don't pile up Back steps either. Before hydration the href still works.
export function jumpToSection(e: React.MouseEvent<HTMLAnchorElement>, id: string): boolean {
  // Let the browser handle new-tab / modified clicks natively.
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
    return false;
  }
  const el = document.getElementById(id);
  if (!el) return false;
  e.preventDefault();
  el.scrollIntoView();
  window.history.replaceState(null, "", `#${id}`);
  return true;
}

export default function SectionLink({
  id,
  className,
  children,
  onJump,
}: {
  id: string;
  className?: string;
  children: ReactNode;
  onJump?: () => void;
}) {
  return (
    <a
      href={`#${id}`}
      className={className}
      onClick={(e) => {
        if (jumpToSection(e, id)) onJump?.();
      }}
    >
      {children}
    </a>
  );
}
