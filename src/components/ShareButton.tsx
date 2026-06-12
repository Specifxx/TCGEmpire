"use client";

import { useState } from "react";

// Copy-the-link button — TCG communities share cards in Discord constantly
// (user feedback), so the permanent URL gets a one-tap copy.
export function ShareButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable — ignore */
        }
      }}
      aria-label="Copy link to this card"
      className={`btn-ghost text-xs ${className ?? ""}`}
    >
      {copied ? "✓ Copied!" : "🔗 Share"}
    </button>
  );
}
