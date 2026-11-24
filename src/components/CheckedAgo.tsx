"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

// "checked 3h ago" for one sealed offer. Client-only for the same reason as the
// card page's per-row stamp (CardMarketSection): wall-clock-relative text is
// frozen into ISR HTML and would both lie and throw a hydration mismatch. The
// server renders a <time> with the absolute stamp so the fact is in the HTML.
/** Older than this, the stamp turns amber and says the price may have changed. */
export const STALE_MS = 24 * 3_600_000;

export function CheckedAgo({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!iso) return null;
  // Honest staleness (owner's UX review, 2026-11-24, P0 2): a row the import has not re-read for a day says so, in amber,
  // instead of passing for a fresh price. The import runs twice a day, so a day means at least one store read failed.
  const old = mounted && Date.now() - Date.parse(iso) > STALE_MS;
  return (
    <time
      dateTime={iso}
      className={old ? `${className ?? ""} text-amber-400` : className}
      title={old ? "This store has not been re-read for over a day: its price may have changed." : undefined}
      suppressHydrationWarning
    >
      {mounted ? `checked ${timeAgo(iso)}${old ? " · may have changed" : ""}` : ""}
    </time>
  );
}
