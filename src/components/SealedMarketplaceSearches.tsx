"use client";

import { ebaySearchUrl } from "@/lib/affiliate";
import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";

// The eBay search rows at the foot of /sealed, tagged for the visitor's market (2026-11-05: the page is one CDN copy for everyone,
// so the market is read here, in the browser). The searches are the page's (sealedSearches() in app/sealed/page.tsx); this only
// draws the links. No second marketplace here since 2026-11-12: these are category searches, and each product's own page carries
// the row for the stores that sell it.
export function SealedMarketplaceSearches({ searches }: { searches: { label: string; q: string }[] }) {
  const { country } = useCountry();
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {searches.map((x) => (
        <div key={x.q} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2.5">
          <span className="text-sm font-semibold text-white">{x.label}</span>
          <span className="flex gap-1.5">
            <OutboundLink
              href={ebaySearchUrl(country, x.q, "sealed-page")}
              retailer="ebay_sealed_search"
              country={country}
              kind="sealed"
              className="btn-ghost px-2.5 py-1 text-xs"
            >
              eBay →
            </OutboundLink>
          </span>
        </div>
      ))}
    </div>
  );
}
