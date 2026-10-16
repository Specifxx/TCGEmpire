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
// Three ways in:
//   - "shopify": the same collection read every Shopify store in RETAILERS
//     gets (sealed-import.ts), including pre-order collection discovery.
//   - "product-pages": a fixed list of product URLs, each read for its
//     schema.org price, currency and availability. For storefronts with no
//     public product feed (Game Nerdz is BigCommerce, Miniature Market is
//     Magento). Every URL was checked against the store's robots.txt, and both
//     stores ask for Crawl-delay: 10, which `crawlDelayMs` honours. Add a URL
//     here when the store lists a new product; there is no discovery.
//   - "feed": a store's own JSON stock feed (FEED_STORES), read whole each run.
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
    key: "laboitemystere",
    name: "La Boîte Mystère",
    // Quebec LGS, CAD storefront (/cart.js, 2026-10-15), suggested by a visitor.
    // Sealed only: its Riftbound collections hold boxes, decks, sleeves,
    // playmats and event tickets, no singles. The title gates keep the English
    // sealed (Radiance Booster Display C$224.99, Showdown Decks C$32.99) and
    // drop the French prints, accessories and "avant-première" tickets.
    base: "https://laboitemystere.com",
    collections: ["riftbound-league-of-legends", "riftbound-radiance"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "CA",
    currency: "CAD",
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
  // ── Moved here from RETAILERS, 2026-10-16 (store audit) ───────────────────
  // Each one's Riftbound collections hold sealed product, accessories and
  // event tickets, and few or no matchable singles, so as a singles store each
  // read as broken. Same keys, so their sealed rows carry on; their old card
  // rows are purged by SINGLES_RETIRED_RETAILERS (lib/retailers.ts).
  {
    // Live: 47 products, 23 in stock, none a single; never had a single row.
    key: "hobbycollectorsaustralia",
    name: "Hobby Collectors Australia",
    base: "https://hobbycollectorsaustralia.com.au",
    collections: ["riftbound-league-of-legends-tcg", "riftbound-league-of-legends-tcg-origins"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "AU",
    currency: "AUD",
  },
  {
    // Zatu (board-game.co.uk): 30 products, 7 in stock, all sealed.
    key: "zatugames",
    name: "Zatu Games",
    base: "https://www.board-game.co.uk",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "UK",
    currency: "GBP",
  },
  {
    // 28 products, 11 in stock, two of them singles (the rest sleeves and boxes).
    key: "goblingaming",
    name: "Goblin Gaming",
    base: "https://www.goblingaming.co.uk",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "UK",
    currency: "GBP",
  },
  {
    // Its `riftbound-single` collection has been empty since July; the general
    // one holds decks, boxes and playmats.
    key: "gamerslodge",
    name: "The Gamers Lodge",
    base: "https://thegamerslodge.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "UK",
    currency: "GBP",
  },
  {
    // Its singles are titled "Riftbound: Single Card - Ambessa, Matriarch of
    // War (V.3 - Signed Showcase) 196*", with no set total, and never matched a
    // card (0 rows since it was added). Its sealed and event range is real.
    key: "rollnplay",
    name: "Roll N Play",
    base: "https://rollnplay.co.uk",
    collections: ["riftbound", "riftbound-booster-box", "riftbound-packs", "riftbound-starter-decks"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "UK",
    currency: "GBP",
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

// A store that publishes its own Riftbound stock feed: one JSON document of
// { game, currency, items: [{ type, name, set_name, language, price, quantity,
// url, preorder_ships_by? }] }, built from live stock. Read whole each run, so
// a new product appears without anyone adding a URL (unlike product-pages).
export interface FeedStore {
  key: string;
  name: string;
  base: string;
  country: NonNullable<RetailerInfo["country"]>;
  currency: string;
  platform: "feed";
  feedUrl: string;
}

export const FEED_STORES: FeedStore[] = [
  {
    // Suggested by the store itself, 2026-10-15 (/admin/messages): a new web
    // store from a seller with thousands of Cardmarket sales. Sealed only; the
    // feed refreshes from live stock at least every 15 minutes. robots.txt
    // allows it for every crawler except AI-training bots.
    key: "sephigames",
    name: "SephiGames",
    base: "https://sephigames.com",
    country: "EU",
    currency: "EUR",
    platform: "feed",
    feedUrl: "https://sephigames.com/feed/riftbound.json",
  },
];

export interface FeedItem {
  /** "Riftbound <name>": the feed's names omit the game, which every sealed title gate requires. */
  title: string;
  priceCents: number;
  url: string;
  inStock: boolean;
}

/**
 * The sealed, English items of a store feed, or null when the feed is not
 * what it claims (wrong game or currency, no items array) — a feed that
 * cannot be trusted must not replace the store's rows. Pure, for tests.
 */
export function parseSealedFeed(data: unknown, currency: string): FeedItem[] | null {
  const d = data as { game?: unknown; currency?: unknown; items?: unknown } | null;
  if (!d || d.game !== "riftbound" || d.currency !== currency || !Array.isArray(d.items)) return null;
  const out: FeedItem[] = [];
  for (const raw of d.items) {
    const it = raw as Record<string, unknown>;
    if (it.type !== "sealed" || it.language !== "en") continue; // English only, as everywhere (DECISIONS.md 2026-10-12)
    const price = typeof it.price === "number" ? it.price : NaN;
    const name = typeof it.name === "string" ? it.name.trim() : "";
    const url = typeof it.url === "string" ? it.url : "";
    if (!(price > 0) || !name || !/^https:\/\//.test(url)) continue;
    out.push({
      title: /riftbound/i.test(name) ? name : `Riftbound ${name}`,
      priceCents: Math.round(price * 100),
      url,
      inStock: typeof it.quantity === "number" && it.quantity > 0,
    });
  }
  return out;
}

export const SEALED_ONLY_STORES: readonly { key: string; name: string; country: string; currency: string }[] = [
  ...SEALED_ONLY_SHOPIFY,
  ...PRODUCT_PAGE_STORES,
  ...FEED_STORES,
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
 * BigCommerce's LIVE inventory for this page's product, or null when the page
 * carries none. Read from `var BCData = {"product_attributes":{...}}`, the object
 * the storefront's own theme JS reads to enable or disable the buy button.
 *
 * WHY THIS OUTRANKS schema.org (2026-10-15; DECISIONS.md "Game Nerdz: sold out
 * for a week, shown as open"). A BigCommerce product configured as a pre-order
 * emits `offers.availability: https://schema.org/PreOrder` in its JSON-LD for as
 * long as it is a pre-order product — that field describes the product's
 * PURCHASE MODE, not its stock. When Game Nerdz's Radiance box allocation sold
 * out, the JSON-LD still said PreOrder while the page said "Out of stock",
 * offered only "Set Restock Notification", and BCData read `"instock":false,
 * "available_to_sell":0`. We read the JSON-LD, so every daily read re-confirmed
 * "Pre-order open" and stamped a fresh "checked 2h ago" on a box nobody could buy
 * — for a week, at the top of the US list.
 *
 * Sellable = `instock`, or still taking backorders (`unlimited_backorder`, or a
 * positive `available_for_backorder` / `available_to_sell`); `purchasable: false`
 * vetoes all of it. `purchasable: true` is NOT stock — it was `true` on that same
 * sold-out page — so it can only ever say no.
 *
 * Brace-matched rather than regex-sliced, because the page also embeds other
 * products' attributes (HTML-escaped, for the related-products widget) and only
 * THIS object describes the product on the URL.
 */
type BigCommerceAttrs = {
  instock?: unknown;
  purchasable?: unknown;
  unlimited_backorder?: unknown;
  available_for_backorder?: unknown;
  available_to_sell?: unknown;
};

/**
 * "absent" when the page carries no BCData at all (not a BigCommerce page, or an
 * older theme) — schema.org then decides, as before. Otherwise what BCData
 * states, or null when it is present but unreadable: on a BigCommerce page the
 * JSON-LD PreOrder is exactly the field proven NOT to be stock, so it is not a
 * fallback here, and null is "not evidence of stock" to the importer.
 */
function readBigCommerceStock(html: string): boolean | null | "absent" {
  const at = html.search(/\bvar\s+BCData\s*=\s*\{/);
  if (at < 0) return "absent";
  const start = html.indexOf("{", at);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      let a: BigCommerceAttrs | undefined;
      try {
        a = (JSON.parse(html.slice(start, i + 1)) as { product_attributes?: BigCommerceAttrs }).product_attributes;
      } catch {
        return null;
      }
      if (!a || typeof a.instock !== "boolean") return null;
      // A product the store has switched off can't be bought whatever the count says.
      if (a.purchasable === false) return false;
      // BigCommerce's own sellability: on hand, OR still taking backorders (an
      // unlimited allowance, or units left in a capped one). Game Nerdz's
      // sold-out box: instock false, unlimited_backorder false, both counts 0.
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      return a.instock || a.unlimited_backorder === true || n(a.available_for_backorder) > 0 || n(a.available_to_sell) > 0;
    }
  }
  return null; // an object that never closes: present, unreadable
}

/** BigCommerce's live stock for this page's product; null when absent or unreadable. */
export function bigCommerceInStock(html: string): boolean | null {
  const r = readBigCommerceStock(html);
  return r === "absent" ? null : r;
}

/**
 * True when a Shopify product page's MAIN product block is locked against
 * online purchase — Thistle Tavern's custom Dawn theme renders "In-store only"
 * and drops the buy button by putting `data-purchase-locked="true"` and
 * `data-instore-only="true"` on `<product-info id="MainProduct-…">`, while the
 * store's products.json says available=true and its schema.org says InStock
 * (2026-10-15; DECISIONS.md "Thistle Tavern: in-store only, shown as open").
 *
 * Scoped to the MainProduct element on purpose: a related-product or quick-add
 * card elsewhere on the page could carry the same attribute for a different
 * product. Tags span lines in that theme, so the whole tag is read, not a line.
 *
 * Keyed on data-purchase-locked ALONE. data-instore-only describes where the
 * product is sold, not whether it can be ordered: the store's in-store events
 * (the Aberdeen Pre-Rift tickets) are bookable online, and a theme that marked
 * them in-store-only must not turn a bookable ticket "sold out".
 */
export function isPurchaseLocked(html: string): boolean {
  for (const m of html.matchAll(/<product-info\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\bid=["']MainProduct-/i.test(tag)) continue;
    return /\bdata-purchase-locked=["']true["']/i.test(tag);
  }
  return false;
}

/**
 * Price, currency and availability from a product page, schema.org first —
 * except that a platform's own live inventory (BigCommerce's BCData) overrides
 * schema.org's availability, which on pre-order products states the purchase
 * mode rather than the stock (see bigCommerceInStock).
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
  // Live inventory beats a schema type. Applied last, and unconditionally when
  // BCData is present, because a schema.org "PreOrder" is exactly the value it
  // must beat — including when BCData can't be read (null: not evidence of stock).
  const live = readBigCommerceStock(html);
  if (live !== "absent") available = live;
  imageUrl ??= metaContent(html, "og:image");

  if (price == null || !title) return null;
  return { title: decode(title), priceCents: Math.round(price * 100), currency, available, imageUrl };
}
