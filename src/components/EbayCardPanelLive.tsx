"use client";

import { useEffect, useState } from "react";
import { EbayTabs, type EbayTab } from "./EbayTabs";
import { EbayAdCarouselLive, type AdListing } from "./EbayAdCarouselLive";
import { EbayGradedLive, type GradedRow } from "./EbayGradedLive";
import { EbayBuyCta } from "./EbayBuyCta";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";

/**
 * Client half of the card page's eBay panel.
 *
 * Tabs appear only for the ones that have something in THIS market. A tab that
 * opens onto "nothing here" is worse than no tab: it advertises a section the
 * card does not have. Most cards will show a single Listings tab and no chrome
 * at all (EbayTabs hides the tablist for one tab); chase cards also get Graded.
 *
 * WHICH TAB OPENS is chosen the same way, and that is not cosmetic. A chase card
 * can have no RAW eBay copy in a market while having slabs there — every live
 * listing is graded, so they are all routed to the Graded tab and the Listings
 * tab falls back to EbayAdCarouselLive's generic "search eBay" CTA. Opening on
 * that CTA tells the visitor we found nothing, one unremarkable click away from
 * the copies we did find. Reported as a matching bug against
 * /card/irelia-fervent-sfd-225s-221 on AU (2026-09-19), where all three AU
 * results were a keychain and two PSA 10s: the pipeline was right, the landing
 * tab was wrong. So when this market has no raw listings but does have slabs,
 * Graded opens. A tab the visitor clicks themselves always wins after that.
 *
 * Counts are computed per market, which is why this is a client component — the
 * server ships every market's rows so the page can stay ISR-cached.
 */
export function EbayCardPanelLive({
  cardId,
  query,
  listings,
  graded,
  className,
}: {
  cardId: string;
  query: string;
  /** Ad-carousel listings, already loaded by the page for the Listings tab. */
  listings?: AdListing[];
  graded: GradedRow[];
  className?: string;
}) {
  const { country } = useCountry();

  // Per-market counts computed during SSR are frozen into the ISR-cached HTML
  // and would disagree with the first client render. Same gate
  // CardMarketSection's "updated N ago" line uses.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const gradedHere = graded.filter((g) => g.country === country);
  // Same filter EbayAdCarouselLive applies before it decides between the real
  // carousel and the generic CTA — kept in step with it deliberately, because
  // "the Listings tab has nothing of its own" is exactly the condition below.
  const listingsHere = (listings ?? []).some((l) => l.country === country);

  // null until the visitor picks a tab, and their pick is permanent from then
  // on. Controlled rather than relying on SegmentedTabs' uncontrolled default,
  // which seeds from tabs[0] on the FIRST render — before `mounted` flips and
  // the Graded tab exists at all, so it could never land on it.
  const [picked, setPicked] = useState<string | null>(null);

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
      content: <EbayGradedLive listings={gradedHere} />,
    });
  }
  const active =
    picked ?? (mounted && !listingsHere && gradedHere.length > 0 ? "graded" : "listings");

  return (
    <div className={className} data-card={cardId}>
      <EbayTabs
        tabs={tabs}
        label="eBay listings and graded copies"
        active={active}
        onActiveChange={setPicked}
      />
      {/* One disclosure for the whole panel — every tab is affiliate-tagged, and
          repeating it per tab would be noise. Outside the tabpanel so it is
          never hidden with an inactive tab. */}
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}
