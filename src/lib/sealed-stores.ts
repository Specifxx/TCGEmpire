// Stores tracked for SEALED ONLY — not in lib/retailers.ts's RETAILERS.
// DECISIONS.md, "Sold-out pre-orders ranked as the cheapest", 2026-09-24.
//
// WHY A SEPARATE REGISTRY: RETAILERS drives the singles importer, store-health's
// "which tracked store has zero listings" alarm, the /stores/<slug> pages and
// the home page's store counts. A store that sells Riftbound boxes but no
// singles would show up in every one of those as a broken store with no
// prices. retailers.ts's own header warns about exactly that trap. The sealed
// importer reads both lists; nothing else reads this one.
//
// Two ways in:
//   - "shopify": the same collection read every Shopify store in RETAILERS
//     gets (sealed-import.ts), including pre-order collection discovery.
//   - "product-pages": a fixed list of product URLs, each read for its
//     schema.org price, currency and availability. For storefronts with no
//     public product feed (Game Nerdz is BigCommerce, Miniature Market is
//     Magento). Every URL was checked against the store's robots.txt, and both
//     stores ask for Crawl-delay: 10, which `crawlDelayMs` honours. Add a URL
//     here when the store lists a new product; there is no discovery.
//
// `currency` is REQUIRED here (optional in RETAILERS, where it defaults to the
// market's): it is what lib/offer-currency.ts checks before a price is shown in
// a market, and the Sky Fox Games bug (CAD shown as US$ for ten days) is why.
import type { RetailerInfo } from "./retailers";

export interface ProductPageStore {
  key: string;
  name: string;
  base: string;
  country: NonNullable<RetailerInfo["country"]>;
  currency: string;
  platform: "product-pages";
  productUrls: string[];
  crawlDelayMs: number;
}

export type ShopifySealedStore = RetailerInfo & {
  currency: string;
  country: NonNullable<RetailerInfo["country"]>;
  platform?: "shopify";
};

// Shopify stores, sealed only. Probed 2026-09-24: storefront currency from
// /cart.js, collections from the store's own sitemap (discoverCollections).
export const SEALED_ONLY_SHOPIFY: ShopifySealedStore[] = [
  {
    // No Riftbound collection at all: Radiance sits in the general "preorders"
    // collection (Booster Display US$159.99, Vault US$49.99 on 2026-09-24).
    // Read non-strict here, but every title still has to pass the importer's
    // Riftbound + sealed title gates, so another game's pre-order is dropped.
    key: "kollectkorner",
    name: "Kollect Korner",
    base: "https://kollectkorner.com",
    collections: ["preorders"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  },
  {
    // Fifteen Riftbound collections, found by sitemap discovery; the handle
    // below is the fallback. Radiance Booster Case and Showdown Deck Display
    // listed on 2026-09-24.
    key: "thecollectionrealm",
    name: "The Collection Realm",
    base: "https://thecollectionrealm.com",
    collections: ["lol-tcg-riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  },
  {
    // Quebec store, CAD storefront — tracked in the CA market, never the US.
    // Its Radiance Showdown Decks pre-order is in "riftbound-precommandes".
    key: "cryptmtg",
    name: "Crypt MTG",
    base: "https://cryptmtg.com",
    collections: ["riftbound-sealed", "riftbound-precommandes"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "CA",
    currency: "CAD",
  },
];

export const PRODUCT_PAGE_STORES: ProductPageStore[] = [
  {
    key: "gamenerdz",
    name: "Game Nerdz",
    base: "https://www.gamenerdz.com",
    country: "US",
    currency: "USD",
    platform: "product-pages",
    productUrls: ["https://www.gamenerdz.com/riftbound-league-of-legends-tcg-radiance-booster-box-preorder"],
    crawlDelayMs: 10_000,
  },
  {
    key: "miniaturemarket",
    name: "Miniature Market",
    base: "https://www.miniaturemarket.com",
    country: "US",
    currency: "USD",
    platform: "product-pages",
    productUrls: ["https://www.miniaturemarket.com/Riftbound-TCG-Radiance-Booster-Box-24-Preorder/UVSRB05BD01-BOX"],
    crawlDelayMs: 10_000,
  },
];

export const SEALED_ONLY_STORES: readonly { key: string; name: string; country: string; currency: string }[] = [
  ...SEALED_ONLY_SHOPIFY,
  ...PRODUCT_PAGE_STORES,
];

export interface ParsedProductPage {
  title: string;
  priceCents: number;
  currency: string | null;
  /** true = orderable (InStock / PreOrder / BackOrder), false = OutOfStock / SoldOut, null = not stated. */
  available: boolean | null;
  imageUrl: string | null;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

function metaContent(html: string, prop: string): string | null {
  // Attribute order varies by platform (Magento puts content on the next line).
  const re = new RegExp(`<meta[^>]*(?:property|name|itemprop)=["']${prop}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? null;
}

function availabilityFrom(v: string | null | undefined): boolean | null {
  if (!v) return null;
  if (/PreOrder|PreSale|InStock|BackOrder|LimitedAvailability|OnlineOnly/i.test(v)) return true;
  if (/OutOfStock|SoldOut|Discontinued/i.test(v)) return false;
  return null;
}

/**
 * Price, currency and availability from a product page, schema.org first.
 * Pure — exported for tests. Returns null when no price can be read, rather
 * than guessing: a wrong price is worse than a missing store.
 */
export function parseProductPage(html: string): ParsedProductPage | null {
  let title: string | null = null;
  let price: number | null = null;
  let currency: string | null = null;
  let available: boolean | null = null;
  let imageUrl: string | null = null;

  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const nodes = (Array.isArray(data) ? data : [data]).flatMap((d) =>
      d && typeof d === "object" && Array.isArray((d as { "@graph"?: unknown[] })["@graph"])
        ? (d as { "@graph": unknown[] })["@graph"]
        : [d],
    ) as Record<string, unknown>[];
    for (const n of nodes) {
      if (!n || n["@type"] !== "Product") continue;
      if (typeof n.name === "string") title ??= decode(n.name);
      const img = Array.isArray(n.image) ? n.image[0] : n.image;
      if (typeof img === "string") imageUrl ??= img;
      const offers = (Array.isArray(n.offers) ? n.offers : [n.offers]).filter(Boolean) as Record<string, unknown>[];
      for (const o of offers) {
        const p = Number(o.price ?? o.lowPrice);
        if (Number.isFinite(p) && p > 0 && price == null) price = p;
        if (typeof o.priceCurrency === "string") currency ??= o.priceCurrency;
        available ??= availabilityFrom(typeof o.availability === "string" ? o.availability : null);
      }
    }
  }

  title ??= metaContent(html, "og:title");
  if (price == null) {
    const p = Number(metaContent(html, "product:price:amount"));
    if (Number.isFinite(p) && p > 0) price = p;
  }
  currency ??= metaContent(html, "product:price:currency");
  available ??= availabilityFrom(metaContent(html, "availability"));
  imageUrl ??= metaContent(html, "og:image");

  if (price == null || !title) return null;
  return { title: decode(title), priceCents: Math.round(price * 100), currency, available, imageUrl };
}
