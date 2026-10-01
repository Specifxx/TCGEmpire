// The Pokémon section's editorial copy, in one place so the visible FAQ and its
// JSON-LD can never disagree (CURRENT-STATE "FAQ: one field feeds both"), and so
// every claim about the data is made from what the data actually holds.
//
// Held to the site's own honesty rules (tests/site-claims.test.ts scans this
// file's callers): listings, never sales; item price, postage extra; updated
// daily, never "real-time"; six markets; no prediction, no "worth".

import type { PkListingSource, PkSource } from "./types";

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The sources behind the figures, for "prices from …" copy. TCGplayer always
 * (its market price is the reference on every product); Cardmarket and eBay
 * only when the data holds their rows. eBay used to be named unconditionally,
 * which was false wherever no eBay row had been imported yet. Copy about the
 * eBay SEARCH links says "eBay searches", never that a price came from eBay.
 */
/**
 * Said wherever a UK visitor's euro display converts listing prices (pound
 * listings shown in euros with lib/fx.ts's approximate rate): the set page
 * marks each figure ≈, list pages say it once.
 */
export const EUR_DISPLAY_NOTE = "Shown in euros: the pound prices of UK listings converted with an approximate exchange rate.";

export function sourceList(sources: readonly PkSource[]): string {
  const names = ["TCGplayer"];
  if (sources.includes("cardmarket") || sources.includes("cardmarket_trend")) names.push("Cardmarket");
  if (sources.includes("ebay")) names.push("eBay");
  return joinNames(names);
}

const LISTING_NAMES: Record<PkListingSource, string> = { tcgplayer: "TCGplayer", cardmarket: "Cardmarket", ebay: "eBay" };

/** Listing sources only ("TCGplayer and eBay"), in a fixed order; "" when there are none. */
export function listingSourceList(sources: readonly PkListingSource[]): string {
  return joinNames((["tcgplayer", "cardmarket", "ebay"] as const).filter((s) => sources.includes(s)).map((s) => LISTING_NAMES[s]));
}

export function pokemonFaq(sources: readonly PkSource[]): { q: string; a: string }[] {
  const cardmarket = sources.includes("cardmarket") || sources.includes("cardmarket_trend");
  const ebayTracked = sources.includes("ebay");
  // TCGplayer listings exist in the US only; elsewhere its data is the reference alone.
  const tcgplayerListings = sources.includes("tcgplayer");
  return [
    {
      q: "Where do these Pokémon sealed prices come from?",
      a:
        (tcgplayerListings
          ? "TCGplayer's own published price data gives the cheapest TCGplayer listing and its market price, for each product that has them. "
          : "TCGplayer's own published price data gives its market price, shown as a reference for each product that has one; TCGplayer listings are shown in the United States only. ") +
        (ebayTracked
          ? "For booster boxes, Elite Trainer Boxes, booster bundles and premium collections from recent sets, we also search eBay in the United States, the United Kingdom, Australia, Canada and the EU for the cheapest listing that matches the product. "
          : "") +
        (cardmarket ? "European prices come from Cardmarket's published price guide. " : "") +
        "Every product also links to a search of your own eBay site.",
    },
    {
      q: "How often are they updated?",
      a:
        "Once a day. TCGplayer" +
        (cardmarket ? " and Cardmarket publish" : " publishes") +
        " new figures daily, and each row shows when it was checked. " +
        (ebayTracked
          ? "eBay listings are checked in rotation, a few days apart for each product and market; a row older than 72 hours is shown as unknown rather than in stock. "
          : "") +
        "Nothing here is real-time, so check the listing itself before you buy.",
    },
    {
      q: "What does the ≈ next to a price mean?",
      a:
        "It marks a reference price converted from another currency with an approximate exchange rate, such as TCGplayer's US market price shown in pounds or Australian dollars. " +
        "A reference sits below the comparison and is never offered as a price you can buy at.",
    },
    {
      q: "Are prices compared on the total I'll pay?",
      a:
        "No. Rows are ranked cheapest first by item price. eBay rows show the seller's stated postage beside the price where the listing gives it; every other price is the item price, postage extra.",
    },
    {
      q: "Which products are covered?",
      a:
        "English-language sealed Pokémon TCG products from Sword & Shield (2020) onward: booster boxes, Elite Trainer Boxes, booster bundles, collections, tins, blisters, packs and decks. Distributor cases and displays, multi-product bundles and Japanese products are not covered yet.",
    },
    {
      q: "Does RiftCompare earn from these links?",
      a:
        "Yes. As an eBay Partner Network affiliate and a TCGplayer affiliate, RiftCompare earns from qualifying purchases at no extra cost to you. It never changes the order: the cheapest listing comes first wherever it is.",
    },
  ];
}
