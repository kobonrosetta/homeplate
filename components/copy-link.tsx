"use client";

import { useState } from "react";

// One-tap copy for a payment link. Falls back to selecting the text if the
// clipboard API is unavailable (older browsers / non-HTTPS).
export default function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-line/60 px-3 py-2 text-xs text-ink">
        {url}
      </code>
      <button
        onClick={copy}
        className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
      >
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}
