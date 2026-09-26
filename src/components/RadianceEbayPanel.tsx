import { ebayLabel, ebaySealedQuery, ebaySearchUrl } from "@/lib/affiliate";
import type { Country } from "@/lib/country";
import { EbaySearchPanel } from "./EbaySearchPanel";

// "Also on eBay" for the two Radiance price pages — /radiance-preorders and the
// /sets/radiance hub (2026-09-26, "Pushing eBay clicks" in DECISIONS.md). The
// Reddit and search traffic these pages draw arrives for pre-orders, where a
// store is usually cheaper than eBay, so the eBay table rows rarely win the
// click. This panel is eBay's own place on those pages: directly UNDER the
// store ranking, never inside it, and it says so in its sub-line.
//
// A server component so the hrefs are built where the country is known (see
// EbaySearchPanel's header on why). One list, rendered by both pages, so their
// four searches cannot drift apart; each page reports its own EPN sources.
//
// Queries: singles exclude sealed words so a singles search is not a page of
// boxes; the box search takes ebaySealedQuery's "booster (box,display)" for the
// UK/EU "Booster Display" titles; eBay reads "(a,b)" as a OR b. The released-
// sets search is a cross-sell (promo), so ad-free members do not see it.

const SOURCES = {
  radiance_preorders: {
    singles: "preorders-singles",
    box: "preorders-box",
    bundle: "preorders-bundle",
    released: "preorders-released-sealed",
  },
  set_hub: {
    singles: "set-hub-singles",
    box: "set-hub-box",
    bundle: "set-hub-bundle",
    released: "set-hub-released-sealed",
  },
} as const;

export function RadianceEbayPanel({
  country,
  pageType,
  besideRanking,
  headingLevel,
  className,
}: {
  country: Country;
  /** Which page renders it — buy_click's page_type and the EPN sources. */
  pageType: keyof typeof SOURCES;
  /** A store price ranking sits directly above: the sub-line says the panel
   *  is separate from it. False on an empty or released page, where there is
   *  no ranking above to be separate from. */
  besideRanking: boolean;
  /** 3 inside the hub's own h2 section; 2 (the default) on /radiance-preorders. */
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const label = ebayLabel(country);
  const src = SOURCES[pageType];
  return (
    <EbaySearchPanel
      heading="Also on eBay"
      sub={`Searches of ${label}${besideRanking ? ", separate from the price ranking above" : ""}. eBay sellers set their own prices and dispatch dates — check both on the listing.`}
      country={country}
      pageType={pageType}
      headingLevel={headingLevel}
      className={className}
      links={[
        {
          label: `Search ${label} for Radiance singles`,
          href: ebaySearchUrl(country, "Riftbound Radiance -booster -display -case", src.singles),
        },
        {
          label: `Search ${label} for Radiance booster boxes`,
          href: ebaySearchUrl(country, ebaySealedQuery("Radiance Booster Box", "Booster Box"), src.box),
        },
        {
          label: `Search ${label} for Radiance packs and Vault Bundles`,
          href: ebaySearchUrl(country, "Riftbound Radiance (pack,bundle,vault)", src.bundle),
        },
        {
          label: `Search ${label} for booster boxes from released sets`,
          href: ebaySearchUrl(country, "Riftbound booster (box,display) -Radiance", src.released),
          promo: true,
        },
      ]}
    />
  );
}
