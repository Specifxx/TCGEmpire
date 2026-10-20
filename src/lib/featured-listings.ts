// FEATURED LISTINGS (2026-10-19, owner: "Promote this listing on riftcompare
// please. For the specific Seraphine card"). DECISIONS.md, "A featured eBay
// listing on a card page".
//
// One hand-picked eBay listing shown on its card's page, ABOVE and APART FROM
// the price comparison. It is never a row of the comparison, never moves a
// ranking, and is labelled "Featured listing" plus "Paid link" wherever it
// shows, so the comparison's ordering promise (/methodology#ordering) is
// untouched.
//
// Every figure is what eBay's Browse API (getItem, the maintenance task
// diagnose-ebay-item) said on `checked`; the box says so, and links to the
// listing for today's price. An entry lapses on `until`, so a sold listing is
// never promoted for long.
export interface FeaturedListing {
  /** The card page it shows on (Card.slug). */
  cardSlug: string;
  /** eBay legacy item id. */
  itemId: string;
  /** The listing on the marketplace it was found on (affiliate-tagged at render). */
  url: string;
  /** The retailer key for click attribution ("ebay_au", …). */
  retailer: string;
  title: string;
  /** Price at the check, in the listing's own currency (minor units). */
  priceCents: number;
  currency: string;
  condition: string;
  seller: string;
  location: string;
  /** ISO date of the Browse check behind every figure above. */
  checked: string;
  /** ISO date the promotion lapses (exclusive). */
  until: string;
}

export const FEATURED_LISTINGS: FeaturedListing[] = [
  {
    cardSlug: "seraphine-starry-eyed-songstress-rad-174s-167",
    itemId: "117475654360",
    url: "https://www.ebay.com.au/itm/117475654360",
    retailer: "ebay_au",
    title: "Riftbound Radiance Seraphine, Starry-Eyed Songstress SIGNATURE 174*/167",
    priceCents: 469070,
    currency: "AUD",
    condition: "Ungraded",
    seller: "bc-cards",
    location: "Kellyville, NSW, Australia",
    checked: "2026-10-20",
    until: "2026-11-20",
  },
];

/** The live featured listing for a card page, or null. */
export function featuredListingFor(cardSlug: string | null | undefined, now: number = Date.now()): FeaturedListing | null {
  if (!cardSlug) return null;
  return (
    FEATURED_LISTINGS.find((f) => f.cardSlug === cardSlug && now < Date.parse(`${f.until}T00:00:00Z`)) ?? null
  );
}
