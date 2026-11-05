"use client";

import { amazonFor } from "@/lib/amazon";
import { affiliateUrl, ebaySearchUrl } from "@/lib/affiliate";
import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";

// The eBay and Amazon search rows at the foot of /sealed, tagged for the visitor's
// market (2026-11-05: the page is one CDN copy for everyone, so the market is read
// here, in the browser, not on the server). The searches themselves are the page's
// (sealedSearches() in app/sealed/page.tsx); this only draws the links.
//
// Amazon per site market comes from lib/amazon.ts (2026-10-29): Amazon US and
// Amazon AU, each with ITS account's tag (riftcompare-20 earns only on
// amazon.com; Australians used to get amazon.com.au with it, and earned
// nothing), the UK, Canada and the EU only once their tag is set. Nowhere
// else, so a market without an Amazon account shows no Amazon button.
export function SealedMarketplaceSearches({ searches }: { searches: { label: string; q: string }[] }) {
  const { country } = useCountry();
  const amazon = amazonFor(country);
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
            {amazon && (
              <OutboundLink
                href={affiliateUrl(`https://${amazon.host}/s?k=${encodeURIComponent(x.q)}`, "amazon_sealed", "/sealed")}
                retailer="amazon_sealed_search"
                country={country}
                kind="sealed"
                className="btn-ghost px-2.5 py-1 text-xs"
              >
                Amazon →
              </OutboundLink>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
