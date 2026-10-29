// Reciprocal partner links that sit OUTSIDE the editorial /resources page
// (which keeps its own list). One constant per partner, so a page never
// hand-types a partner URL and a deeper link can be swapped in here later.
//
// Plain FOLLOWED links: rel="noopener" only (no nofollow, sponsored or
// noreferrer), the terms agreed with the partner. No outbound click tracking:
// it is off on purpose.

export interface PartnerLink {
  /** Who it is, for comments and tests. */
  name: string;
  /** Short heading above the link where it is a block. */
  heading: string;
  /** The agreed anchor text in a page block. */
  label: string;
  /** The anchor text in the footer site map. */
  footerLabel: string;
  /** Where the link goes, UTM tags included. */
  url: string;
  rel: "noopener";
}

const UTM = "utm_source=riftcompare&utm_medium=referral";

/**
 * The Card Shop Finder (thecardshopfinder.com), a US directory of ~1,800 local
 * card shops. Reciprocal link exchange agreed with its owner (Ben Gunther,
 * eSEOspace), 2026-10-29 (owner): a "Prefer to buy local?" block on every
 * /stores/[slug] page and one footer link.
 *
 * It links /browse/ today. The site also has /{state}/ and /{state}/{city}/
 * pages (e.g. /co/, /co/denver/): `cardShopFinderUrl` is the one place to
 * swap in a per-state or per-city deep link once a store page knows one.
 */
export function cardShopFinderUrl(path = "/browse/"): string {
  return `https://thecardshopfinder.com${path}?${UTM}`;
}

export const CARD_SHOP_FINDER: PartnerLink = {
  name: "The Card Shop Finder",
  heading: "Prefer to buy local?",
  label: "Find a local card shop near you",
  footerLabel: "Local Card Shop Directory",
  url: cardShopFinderUrl(),
  rel: "noopener",
};
