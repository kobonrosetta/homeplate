"use client";

import { useState } from "react";

// Clamp a long chef bio to four lines with a "Read more" toggle, so "Meet
// the chef" keeps its warmth without becoming a wall of text. Short bios
// render as a plain paragraph — no toggle, no behavior change.
export default function BioClamp({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  return (
    <div className={className}>
      <p
        className={`whitespace-pre-line leading-relaxed text-ink ${
          long && !open ? "line-clamp-4" : ""
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-sm font-medium text-brand hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
