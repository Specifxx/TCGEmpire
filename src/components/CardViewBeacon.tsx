"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

// Records a card-page view (the page is ISR-cached, so a server-side counter would
// miss most visits). Fire-and-forget on mount. Also fires the `card_page_view`
// GA4/Vercel event from the same effect — the metrics guardrail for the
// qualified-retailer-click-through work needs a funnel step between "search
// happened" (search_submitted) and "retailer_click" (buy_click), and this was
// the one surface in that funnel with no trackEvent call at all.
export function CardViewBeacon({
  idOrSlug,
  cardId,
  cardName,
  rarity,
}: {
  idOrSlug: string;
  cardId?: string;
  cardName?: string;
  rarity?: string;
}) {
  useEffect(() => {
    fetch(`/api/card/${idOrSlug}/view`, { method: "POST", keepalive: true }).catch(() => {});
    trackEvent("card_page_view", { card_id: cardId ?? idOrSlug, card_name: cardName, rarity });
  }, [idOrSlug, cardId, cardName, rarity]);
  return null;
}
