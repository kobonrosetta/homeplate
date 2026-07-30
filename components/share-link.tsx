"use client";

import { useState } from "react";

// One share/copy control for every ForkFork link (kitchen storefront, payment
// links). Native share sheet first (WhatsApp, Messages, IG DM — where home-food
// audiences live), then clipboard, then a prompt fallback for old/non-HTTPS
// browsers. `showUrl` renders the URL in a chip beside the button.
export default function ShareLink({
  url,
  text,
  showUrl = false,
  label = "Share your link",
}: {
  url: string;
  text?: string;
  showUrl?: boolean;
  label?: string;
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
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  const button = (
    <button
      type="button"
      onClick={share}
      className="shrink-0 rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand/90"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );

  if (!showUrl) return button;
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-line/60 px-3 py-2 text-xs text-ink">
        {url}
      </code>
      {button}
    </div>
  );
}
