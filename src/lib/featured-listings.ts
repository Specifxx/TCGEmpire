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
  /** "auction" shows the bid count and the end time; default Buy It Now. */
  format?: "auction" | "buy_it_now";
  /** Bids at the check (auctions). */
  bids?: number;
  /** The listing's own end time (ISO, from eBay's page/getItem). The box hides
   *  itself in the browser at this moment, even on a page cached for hours. */
  endsAt?: string;
  /** Also featured on the homepages (owner, 2026-11-07). */
  home?: boolean;
  /** eBay's own photo, for the homepage (the card page uses our card image). */
  imageUrl?: string;
  /** A Premium member's own listing, put forward by them (lib/featured/). */
  byMember?: boolean;
}

// The Seraphine 174* Buy It Now listing (eBay AU 117475654360) ran 20 to 22
// October (owner: "get rid of the featured listing now"). The same card from the
// same seller came back as an auction, featured on the homepages until it ends
// (owner, 2026-11-07: "feature this listing on the homepage of Riftcompare until
// it ends"; ebay.io/m/dXigXF). DECISIONS.md, "A featured auction on the homepage".
export const FEATURED_LISTINGS: FeaturedListing[] = [
  {
    cardSlug: "seraphine-starry-eyed-songstress-rad-174s-167",
    itemId: "117507452881",
    url: "https://www.ebay.com.au/itm/117507452881",
    retailer: "ebay_au",
    title: "Riftbound Radiance Seraphine, Starry-Eyed Songstress SIGNATURE 174*/167",
    priceCents: 152600,
    currency: "AUD",
    condition: "Ungraded, near mint or better",
    seller: "bc-cards",
    location: "Kellyville NSW, Australia",
    checked: "2026-11-07",
    until: "2026-11-12",
    format: "auction",
    bids: 33,
    endsAt: "2026-11-11T08:01:20Z",
    home: true,
    imageUrl: "https://i.ebayimg.com/images/g/w-MAAeSwrv1q1qc6/s-l500.webp",
  },
];

/** When an entry stops showing: its listing's own end, else `until`. */
export function featuredLapsesAt(f: FeaturedListing): number {
  const until = Date.parse(`${f.until}T00:00:00Z`);
  return f.endsAt ? Math.min(until, Date.parse(f.endsAt)) : until;
}

/** The live listing featured on the homepages, or null. */
export function homeFeaturedListing(now: number = Date.now()): FeaturedListing | null {
  return FEATURED_LISTINGS.find((f) => f.home && now < featuredLapsesAt(f)) ?? null;
}

/** The live featured listing for a card page, or null. */
export function featuredListingFor(cardSlug: string | null | undefined, now: number = Date.now()): FeaturedListing | null {
  if (!cardSlug) return null;
  return (
    FEATURED_LISTINGS.find((f) => f.cardSlug === cardSlug && now < featuredLapsesAt(f)) ?? null
  );
}
