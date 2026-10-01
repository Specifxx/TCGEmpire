"use client";

import type { Country } from "@/lib/country";
import { useCountry } from "../CountryProvider";
import { EbaySearchPanel, type EbaySearchLink } from "../EbaySearchPanel";

// An eBay search panel for an ISR page, which reads no cookie and so cannot
// know the visitor's market on the server. The server builds every market's
// links (lib/affiliate.ts ebaySearchUrl, where the campaign id is read) and
// this picks the visitor's after hydration, the product board's pattern. The
// server HTML carries the US links, the default market's.
//
// Trimmed props: the six link lists only, never the post or a catalogue.
export function PokemonMarketEbayPanel({
  linksByMarket,
  heading,
  sub,
  pageType,
  className,
}: {
  linksByMarket: Partial<Record<Country, EbaySearchLink[]>>;
  heading: string;
  sub?: string;
  pageType: string;
  className?: string;
}) {
  const { country } = useCountry();
  const own = linksByMarket[country];
  const market: Country = own ? country : "US";
  const links = own ?? linksByMarket.US ?? [];
  return <EbaySearchPanel heading={heading} sub={sub} links={links} country={market} pageType={pageType} className={className} />;
}
