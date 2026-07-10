"use client";

import { useState } from "react";

// One-tap clipboard copy for the social-post generator — flips to "Copied ✓"
// briefly so posting is: open page, tap, paste into X.
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — user can select manually */
        }
      }}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
        copied ? "border-brand-500 bg-brand-500/20 text-brand-300" : "border-ink-700 bg-ink-850 text-slate-200 hover:border-brand-500"
      }`}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
