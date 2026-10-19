// LIVE STOCK FOR THE PRE-ORDER HEADLINES (2026-10-19, owner, forwarding a
// buyer: "start manually checking these posts … Your $119 is sold out" and "a
// lot of our preorder products are sold out"). DECISIONS.md, "Pre-order
// headlines are re-checked at the store".
//
// The pre-order pages read sealed stock from the daily public snapshot
// (PUBLIC_DATA_MODE=files) behind getAllSealedGroups' own cache, so a store
// that sells out after the morning export stays "Pre-order open" on our page
// for a day or more. Vault Game Store's US$119.99 Radiance display was the US
// headline on /radiance-preorders for a day after Vault had sold out.
//
// The fix asks the store itself, for the offers that matter: the cheapest few
// OPEN store offers of each pre-order product, the ones that become its
// headline price. A Shopify store's `/products/<handle>.js` answers
// `available` for the product, the same flag the importer reads from
// products.json. A row the store now calls unavailable is turned "Sold out",
// and the group's headline and open-store count are recomputed with the
// shared rules (lib/sealed-offers.ts).
//
// ONE-WAY, like the in-store lock check in sealed-import.ts: this can only take
// a false "open" away, never invent one. A store that is not Shopify, times
// out, or answers anything but a clear `false` leaves the row as stored.
//
// CACHING: each answer is held in the Data Cache for 21600 s, the pages' own
// revalidate. Lower would drag every pre-order page under six hours (CLAUDE.md,
// rule 5), so a sell-out now shows within about six hours of the page's next
// regeneration, not a day or more.
import { headlineOffer, offerStock, openStoreCount } from "./sealed-offers";
import type { SealedGroup } from "./sealed-import";

/** How many open store offers per product are re-checked, cheapest first. */
export const LIVE_CHECKS_PER_GROUP = 3;
const TIMEOUT_MS = 4000;
const REVALIDATE_S = 21600;

/** Marketplaces and feeds, never a Shopify product page. */
const MARKETPLACE = /^(ebay|tcgplayer|cardmarket)/;

/** The `.js` endpoint for a Shopify product URL, or null when the URL is not one. */
export function shopifyProductJsUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const m = u.pathname.match(/^(?:\/[a-z]{2}(?:-[a-z]{2})?)?(\/products\/[^/]+?)\/?$/i);
    if (!m) return null;
    return `${u.origin}${m[1]}.js`;
  } catch {
    return null;
  }
}

/** The store's own answer: true, false, or null when it gave no clear one. */
export async function shopifyAvailable(url: string): Promise<boolean | null> {
  const js = shopifyProductJsUrl(url);
  if (!js) return null;
  try {
    const res = await fetch(js, {
      headers: { Accept: "application/json", "User-Agent": "RiftCompareBot/1.0 (+https://riftcompare.com)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_S },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { available?: unknown };
    return typeof d.available === "boolean" ? d.available : null;
  } catch {
    return null;
  }
}

/**
 * The groups with every re-checked offer that its store now calls unavailable
 * turned sold out, and each touched group's headline recomputed. Pure apart
 * from `check`, which tests replace.
 */
export async function withLiveStock(
  groups: SealedGroup[],
  check: (url: string) => Promise<boolean | null> = shopifyAvailable,
  now: number = Date.now(),
): Promise<SealedGroup[]> {
  return Promise.all(
    groups.map(async (g) => {
      const candidates = g.listings
        .filter((l) => !MARKETPLACE.test(l.retailer) && offerStock(l, now) === "open")
        .sort((a, b) => a.priceCents - b.priceCents)
        .slice(0, LIVE_CHECKS_PER_GROUP);
      if (!candidates.length) return g;
      const answers = await Promise.all(candidates.map((l) => check(l.url)));
      const gone = new Set(candidates.filter((_, i) => answers[i] === false).map((l) => l.url));
      if (!gone.size) return g;
      const checkedAt = new Date(now).toISOString();
      const listings = g.listings.map((l) => (gone.has(l.url) ? { ...l, inStock: false, lastSeen: checkedAt } : l));
      return {
        ...g,
        listings,
        lowestPriceCents: headlineOffer(listings, now)?.priceCents ?? null,
        storeCount: openStoreCount(listings, now),
      };
    }),
  );
}
