// Amazon's own price of a sealed product in one market, from the Creators API at request time (owner,
// 2026-11-05: "all the sites … showing the API prices as price rows"). Called only by /api/amazon/sealed/<slug>,
// whose answer the CDN keeps six hours; the sealed page's Amazon row (SealedOffers → AmazonLiveSlot) asks it from
// the browser and shows the price with its time, 24 hours at most, as Amazon's licence requires. The price is
// Amazon's row's alone: never a store row, the best price, a deal, an alert, a watch, history or the quick view.
import { riftboundEbayQuery } from "./affiliate";
import { amazonFor } from "./amazon";
import { AmazonRefused, credentialsFor, MARKETS, pickListing, searchItems } from "./amazon-creators";
import type { Country } from "./country";
import { classifySealed, detectSet, isTrackableSealedTitle } from "./sealed-import";

export type AmazonLiveStatus = "ok" | "none" | "no-credentials" | "no-store" | "refused" | "error";
export interface AmazonLiveAnswer {
  status: AmazonLiveStatus;
  /** Amazon's own item page, tagged, with the sub id (only with a price). */
  url?: string;
  asin?: string;
  /** in the market's currency, minor units */
  priceCents?: number;
  currency?: string;
  /** ISO time the price was fetched */
  at?: string;
}

/** The clock an Amazon price's "as of" time is shown in: the market's own. */
export const AMAZON_CLOCK: Partial<Record<Country, { timeZone: string; label: string }>> = {
  US: { timeZone: "America/New_York", label: "New York time" },
  CA: { timeZone: "America/Toronto", label: "Toronto time" },
  UK: { timeZone: "Europe/London", label: "London time" },
  EU: { timeZone: "Europe/Berlin", label: "Berlin time" },
  AU: { timeZone: "Australia/Sydney", label: "Sydney time" },
};

export function median(xs: number[]): number | undefined {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return undefined;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Amazon's own page for an item, tagged like a search (ascsubtag = sub); null where the market has no Amazon. */
export function amazonItemUrl(asin: string, country: Country, sub: string): string | null {
  const a = amazonFor(country);
  if (!a || !/^[A-Z0-9]{10}$/.test(asin)) return null;
  const u = new URL(`https://${a.host}/dp/${asin}`);
  u.searchParams.set("tag", a.tag);
  u.searchParams.set("ascsubtag", sub.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 60));
  return u.toString();
}

/** Whether an Amazon title is THIS sealed group: a trackable Riftbound sealed title of the same set and product type. */
export function amazonTitleMatches(title: string, group: { productType: string; setCode: string | null }): boolean {
  // Amazon titles name the game; a set name alone ("Origins") is shared with other games' products there.
  if (!/\briftbound\b/i.test(title) || !isTrackableSealedTitle(title)) return false;
  if (detectSet(title) !== group.setCode) return false;
  return classifySealed(title) === group.productType;
}

/**
 * The first search result whose title is this product (a wrong product is worse than no price), priced new and in
 * stock in the market's currency, and within 60%–160% of the market's in-stock store median (a case or a pack behind
 * a similar title, or a marketplace seller's fantasy, is dropped).
 */
export function pickAmazonItem(items: { asin: string; title: string; price: number | null }[], group: { productType: string; setCode: string | null }, storeMedianCents: number | undefined): { asin: string; cents: number } | null {
  for (const it of items) {
    if (it.price == null || !amazonTitleMatches(it.title, group)) continue;
    const cents = Math.round(it.price * 100);
    if (storeMedianCents && (cents < storeMedianCents * 0.6 || cents > storeMedianCents * 1.6)) continue;
    return { asin: it.asin, cents };
  }
  return null;
}

export async function amazonLivePrice(
  group: { name: string; productType: string; setCode: string | null; listings: { priceCents: number; inStock: boolean; retailer: string }[] },
  country: Country,
  sub = "amazon_sealed-sealed",
): Promise<AmazonLiveAnswer> {
  const store = amazonFor(country);
  const market = MARKETS[country];
  if (!store || !market) return { status: "no-store" };
  const creds = credentialsFor(country);
  if (!creds) return { status: "no-credentials" };
  try {
    const items = await searchItems(country, store.tag, creds, riftboundEbayQuery(group.name));
    const pick = pickAmazonItem(
      items.map((it) => ({ asin: it.asin, title: it.itemInfo?.title?.displayValue ?? "", price: pickListing(it, market.currency)?.amount ?? null })),
      group,
      median(group.listings.filter((l) => l.inStock && !/^(ebay|tcgplayer)/i.test(l.retailer)).map((l) => l.priceCents)),
    );
    if (!pick) return { status: "none" };
    const url = amazonItemUrl(pick.asin, country, sub);
    if (!url) return { status: "no-store" };
    return { status: "ok", url, asin: pick.asin, priceCents: pick.cents, currency: market.currency, at: new Date().toISOString() };
  } catch (e) {
    return { status: e instanceof AmazonRefused ? "refused" : "error" };
  }
}
