"use client";

import { useEffect, useState } from "react";
import { EbayTabs, type EbayTab } from "./EbayTabs";
import { EbayAdCarouselLive, type AdListing } from "./EbayAdCarouselLive";
import { EbayGradedLive, type GradedRow } from "./EbayGradedLive";
import { EbayAuctionsLive, type AuctionRow } from "./EbayAuctionsLive";
import { EbayBuyCta } from "./EbayBuyCta";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";

/**
 * Client half of the card page's eBay panel.
 *
 * Tabs appear only for the ones that have something in THIS market. A tab that
 * opens onto "nothing here" is worse than no tab: it advertises a section the
 * card does not have. Most cards will show a single Listings tab and no chrome
 * at all (EbayTabs hides the tablist for one tab); chase cards get the full set.
 *
 * Counts are computed per market, which is why this is a client component — the
 * server ships every market's rows so the page can stay ISR-cached.
 */
export function EbayCardPanelLive({
  cardId,
  query,
  listings,
  graded,
  auctions,
  className,
}: {
  cardId: string;
  query: string;
  /** Ad-carousel listings, already loaded by the page for the Listings tab. */
  listings?: AdListing[];
  graded: GradedRow[];
  auctions: AuctionRow[];
  className?: string;
}) {
  const { country } = useCountry();

  // Elapsed-time and per-market counts computed during SSR are frozen into the
  // ISR-cached HTML and would disagree with the first client render. Same gate
  // the auction panel and CardMarketSection's "updated N ago" line use.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const gradedHere = graded.filter((g) => g.country === country);
  const auctionsHere = auctions.filter(
    (a) => a.country === country && new Date(a.endsAt).getTime() > Date.now(),
  );

  const tabs: EbayTab[] = [
    {
      key: "listings",
      label: "Listings",
      content: listings ? (
        <EbayAdCarouselLive listings={listings} query={query} />
      ) : (
        <EbayBuyCta query={query} />
      ),
    },
  ];
  if (mounted && gradedHere.length > 0) {
    tabs.push({
      key: "graded",
      label: "Graded",
      count: gradedHere.length,
      content: <EbayGradedLive listings={graded} />,
    });
  }
  if (mounted && auctionsHere.length > 0) {
    tabs.push({
      key: "auctions",
      label: "Auctions",
      count: auctionsHere.length,
      // Heading suppressed: the tab already names it, and the panel's own
      // header would repeat the word directly under the tab that says it.
      content: <EbayAuctionsLive auctions={auctions} heading="Live auctions" bare />,
    });
  }

  return (
    <div className={className} data-card={cardId}>
      <EbayTabs tabs={tabs} label="eBay listings, graded copies and auctions" />
      {/* One disclosure for the whole panel — every tab is affiliate-tagged, and
          repeating it per tab would be noise. Outside the tabpanel so it is
          never hidden with an inactive tab. */}
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}
