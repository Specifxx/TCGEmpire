"use client";

import { useCountry } from "@/components/CountryProvider";
import { OutboundLink } from "@/components/OutboundLink";
import { ebayLabel, ebaySearchUrl, riftboundEbayQuery } from "@/lib/affiliate";
import { formatMoney } from "@/lib/format";
import type { Country } from "@/lib/country";

// The eBay button on each row of "Riftbound card prices today" (2026-09-26,
// "The homepage's eBay column" in DECISIONS.md). The table is server-rendered
// in its PAGE's market ("/" is the US page), but visitors from every market land
// on "/" — there is no geo redirect — so this one cell follows the VISITOR:
//
//  - in the page's own market, with a tracked listing: a direct link to that
//    listing (the link type that converts), labelled with its item price;
//  - anywhere else, or with no tracked listing: a search of the visitor's own
//    eBay for the card, labelled "Search" — never a price we do not have, and
//    never an Australian sent to ebay.com.
//
// Filled eBay blue only when the listing IS the row's cheapest price (the
// loader clamps "Cheapest" to it, so equality means eBay is the lowest source
// we track); every other state is the ghost weight, so eBay is never dressed up
// as the best buy when a store beats it. A fixed width, so the search → listing
// swap after hydration cannot shift the row.
export function PriceRowEbay({
  pageCountry,
  listing,
  cheapestCents,
  currency,
  cardId,
  cardName,
  searchName,
  position,
}: {
  pageCountry: Country;
  /** Already affiliate-tagged on the server for this page. */
  listing: { retailer: string; priceCents: number; href: string } | null;
  cheapestCents: number;
  currency: string;
  cardId: string;
  cardName: string;
  searchName: string;
  position: number;
}) {
  const { country } = useCountry();
  const direct = listing && country === pageCountry ? listing : null;
  const lowest = direct != null && direct.priceCents <= cheapestCents;
  const label = ebayLabel(country);
  const price = direct ? formatMoney(direct.priceCents, currency) : null;
  return (
    <OutboundLink
      href={direct ? direct.href : ebaySearchUrl(country, riftboundEbayQuery(searchName), "home-table")}
      retailer={direct ? direct.retailer : "ebay_search"}
      country={country}
      kind="single"
      pageType="homepage"
      surface="price_table_ebay"
      cardId={cardId}
      cardName={cardName}
      price={direct ? direct.priceCents / 100 : undefined}
      positionInList={position}
      inStock={direct ? true : undefined}
      className={`${lowest ? "btn-ebay" : "btn-ebay-ghost"} w-[4.75rem] shrink-0 flex-col gap-0 px-1 py-1 text-[11px] leading-tight`}
    >
      {/* The accessible name is the visible words plus an sr-only tail, never
          an aria-label: a label that does not contain "eBay Search" / "eBay
          US$4.50" fails WCAG 2.5.3 (voice control says what it sees). */}
      <span className="font-extrabold">eBay</span>{" "}
      <span className="num font-semibold">{price ?? "Search"}</span>
      <span className="sr-only">{`: ${cardName} on ${label}${lowest ? ", the lowest price we track" : ""}`}</span>
    </OutboundLink>
  );
}
