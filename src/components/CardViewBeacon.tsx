"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { pushRecentCard } from "@/lib/recently-viewed";

// Records a card-page view (the page is ISR-cached, so a server-side counter would
// miss most visits). Fire-and-forget on mount. Also fires the `card_page_view`
// GA4/Vercel event from the same effect — the metrics guardrail for the
// qualified-retailer-click-through work needs a funnel step between "search
// happened" (search_submitted) and "retailer_click" (buy_click), and this was
// the one surface in that funnel with no trackEvent call at all.
//
// Also the OTHER writer of the recently-viewed rail (see QuickView.open() for
// the first): the card page already has everything on hand, so this is pure
// parity with what QuickView already had to pass. `imageSrc` must already be
// resolved via lib/card-image-url.ts's cardImageSrc() — see RecentCardEntry.
export function CardViewBeacon({
  idOrSlug,
  cardId,
  cardName,
  rarity,
  slug,
  setCode,
  collectorNumber,
  imageSrc,
}: {
  idOrSlug: string;
  cardId?: string;
  cardName?: string;
  rarity?: string;
  slug?: string | null;
  setCode?: string;
  collectorNumber?: string;
  imageSrc?: string | null;
}) {
  useEffect(() => {
    fetch(`/api/card/${idOrSlug}/view`, { method: "POST", keepalive: true }).catch(() => {});
    trackEvent("card_page_view", { card_id: cardId ?? idOrSlug, card_name: cardName, rarity });
    if (cardId && cardName && setCode && collectorNumber) {
      pushRecentCard({
        id: cardId,
        slug: slug ?? null,
        name: cardName,
        setCode,
        collectorNumber,
        imageSrc: imageSrc ?? null,
      });
    }
  }, [idOrSlug, cardId, cardName, rarity, slug, setCode, collectorNumber, imageSrc]);
  return null;
}
