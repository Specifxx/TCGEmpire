"use client";

import { useEffect, useState } from "react";
import { activeStoreCode } from "@/lib/store-partner-deals";

// A store partner's exclusive discount code, beside that store's price
// (DECISIONS.md, "Store partner codes: the store links start earning",
// 2026-10-26). A LABEL, never a discount applied to the price or a reason to
// re-rank: the row's position and figure stay the store's own. Renders nothing
// for a store without a live, recently checked code. Tapping copies the code.
export function StoreCodeChip({ href, className }: { href: string | null | undefined; className?: string }) {
  const [copied, setCopied] = useState(false);
  // After mount only: whether a code is live depends on today's date, and the
  // pages around it are cached for hours, so the server never decides it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const c = mounted ? activeStoreCode(href) : null;
  if (!c) return null;
  const checked = new Date(c.checked).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(c.code).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
      className={`chip border border-dashed border-gold/50 bg-gold/10 font-semibold text-gold hover:bg-gold/20 ${className ?? ""}`}
      title={`Exclusive ${c.name} code for RiftCompare visitors: ${c.offer}. Checked at the store's checkout on ${checked}. The price shown is before the code. Tap to copy.`}
    >
      {copied ? "Copied ✓" : `${c.offer} · code ${c.code}`}
    </button>
  );
}
