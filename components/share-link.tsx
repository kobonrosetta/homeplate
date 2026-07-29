"use client";

import { useState } from "react";

// One-tap share: native share sheet on phones (WhatsApp, Messages, Instagram
// DM — where home-food audiences actually live), clipboard copy on desktop.
export default function ShareLink({
  url,
  text,
}: {
  url: string;
  text?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url, text });
        return;
      } catch {
        // fall through to copy (user may have dismissed the sheet)
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand/90"
    >
      {copied ? "Link copied!" : "Share your link"}
    </button>
  );
}
