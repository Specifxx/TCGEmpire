"use client";

import { useEffect } from "react";

// Records a card-page view (the page is ISR-cached, so a server-side counter would
// miss most visits). Fire-and-forget on mount.
export function CardViewBeacon({ idOrSlug }: { idOrSlug: string }) {
  useEffect(() => {
    fetch(`/api/card/${idOrSlug}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [idOrSlug]);
  return null;
}
