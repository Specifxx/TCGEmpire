"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

// "checked 3h ago" for one sealed offer. Client-only for the same reason as the
// card page's per-row stamp (CardMarketSection): wall-clock-relative text is
// frozen into ISR HTML and would both lie and throw a hydration mismatch. The
// server renders a <time> with the absolute stamp so the fact is in the HTML.
export function CheckedAgo({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!iso) return null;
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {mounted ? `checked ${timeAgo(iso)}` : ""}
    </time>
  );
}
