"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

// "3h ago" for the last price import, on the cached homepages.
//
// The homes are ISR-cached for up to six hours (DECISIONS.md, "Cached pages
// refresh every 6 to 24 hours", 2026-10-14), so a relative time computed at
// render would be frozen into the HTML and could understate the age by that
// much (the CheckedAgo rule). The first render, on the server and at
// hydration, is the server's own string, so there is no mismatch and no empty
// flash; after mount it is recomputed from the import's timestamp. An entry
// cached before `iso` existed simply keeps the server string.
export function UpdatedAgo({ iso, fallback }: { iso?: string | null; fallback: string }) {
  const [text, setText] = useState(fallback);
  useEffect(() => {
    if (iso) setText(timeAgo(iso));
  }, [iso]);
  return (
    <time dateTime={iso ?? undefined} suppressHydrationWarning>
      {text}
    </time>
  );
}
