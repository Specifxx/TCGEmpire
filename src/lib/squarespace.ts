// Reading a Squarespace Commerce shop: the fifth storefront platform, after
// Shopify's products.json, the WooCommerce Store API (lib/woocommerce.ts) and
// the BigCommerce / Shopware category pages (lib/storefront-html.ts).
//
// CONSENT FIRST. Squarespace's platform-default robots.txt disallows
// `/*?format=json` for every crawler (lib/pending-platforms.ts, "SQUARESPACE —
// disqualified on PERMISSION"), and that JSON view is the only way to read a
// Squarespace shop's prices and stock. So this adapter reads ONLY a store whose
// owner has said yes in writing, recorded in `squarespaceConsent` on its entry
// (who, when, how). A store without it is refused here, whatever its config
// says, and the shop page itself must still be allowed by robots.txt.
// The first: Topaz Cards (UK), owner's email of 2026-11-27.
//
// `<shop path>?format=json` returns the collection's `items` (one per product)
// and `pagination.nextPageUrl` for the next page. Squarespace has shipped two
// variant shapes and a store may serve either:
//   - newer: `priceMoney` / `salePriceMoney` { currency, value: "89.99" } and
//     `stock` { quantity, unlimited };
//   - older: `price` / `salePrice` in minor units (8999) with `qtyInStock` and
//     `unlimited`, the currency only in the site's store settings.
// Both are read; a price whose stated currency is not the market's is refused,
// never converted, and a read that finds one keeps yesterday's rows.
//
// Returns the SHOPIFY product shape deliberately, like the other adapters, so
// every listing goes through the sealed importer's title gates and floors.
import type { ShopifyProduct, ShopifyVariant } from "./price-import";
import type { RetailerInfo } from "./retailers";
import { SCRAPE_HEADERS as UA, REQUEST_DELAY_MS, robotsAllows, sleep } from "./scrape-http";
import { decodeEntities } from "./woocommerce";
import { currencyOf } from "./country";

export interface SquarespaceListing extends ShopifyProduct {
  url: string;
  images?: { src: string }[];
  /** The currency the JSON stated for this product's price, when it did. */
  currency: string | null;
}

export interface SquarespacePage {
  products: SquarespaceListing[];
  /** Path (with query) of the next page, or null on the last. */
  next: string | null;
  /** The store's own currency setting, when the JSON carries it. */
  storeCurrency: string | null;
}

type Money = { currency?: string; value?: string | number } | undefined;

function moneyValue(m: Money): { value: number; currency: string | null } | null {
  if (!m || m.value == null) return null;
  const n = Number(m.value);
  return Number.isFinite(n) && n > 0 ? { value: n, currency: m.currency ?? null } : null;
}

function legacyValue(minor: unknown): number | null {
  const n = Number(minor);
  return Number.isFinite(n) && n > 0 ? n / 100 : null;
}

/** One page of `?format=json`. Exported for tests. */
export function parseSquarespacePage(json: any, base: string): SquarespacePage {
  const storeCurrency: string | null =
    json?.websiteSettings?.storeSettings?.selectedCurrency ?? json?.website?.baseCurrency ?? null;
  const items: any[] = Array.isArray(json?.items) ? json.items : [];
  const products: SquarespaceListing[] = [];
  for (const it of items) {
    const sc = it?.structuredContent;
    const variants: any[] = Array.isArray(sc?.variants) ? sc.variants : [];
    if (!it?.title || !it?.fullUrl || !variants.length) continue;
    let currency: string | null = null;
    const out: ShopifyVariant[] = [];
    for (const v of variants) {
      const onSale = !!v?.onSale;
      const modern = moneyValue(onSale ? v?.salePriceMoney : v?.priceMoney) ?? moneyValue(v?.priceMoney);
      const price = modern?.value ?? legacyValue(onSale ? v?.salePrice : v?.price) ?? legacyValue(v?.price);
      if (price == null) continue;
      if (modern?.currency) currency = modern.currency;
      const unlimited = !!(v?.stock?.unlimited ?? v?.unlimited);
      const qty = Number(v?.stock?.quantity ?? v?.qtyInStock ?? 0);
      const attrs = v?.attributes && typeof v.attributes === "object" ? Object.values(v.attributes).join(" / ") : "";
      out.push({ title: String(attrs), price: price.toFixed(2), available: unlimited || qty > 0 });
    }
    if (!out.length) continue;
    const path = String(it.fullUrl);
    const url = /^https?:\/\//.test(path) ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    products.push({
      title: decodeEntities(String(it.title)).replace(/\s+/g, " ").trim(),
      handle: path.replace(/^https?:\/\/[^/]+/, ""),
      url,
      variants: out,
      images: it.assetUrl ? [{ src: String(it.assetUrl) }] : undefined,
      currency,
    });
  }
  const p = json?.pagination;
  const next = p?.nextPage && typeof p?.nextPageUrl === "string" ? p.nextPageUrl : null;
  return { products, next, storeCurrency };
}

function jsonUrl(base: string, pathWithQuery: string): string {
  const abs = /^https?:\/\//.test(pathWithQuery) ? pathWithQuery : `${base}${pathWithQuery}`;
  const u = new URL(abs);
  u.searchParams.set("format", "json");
  return u.toString();
}

async function getJson(url: string): Promise<any | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(REQUEST_DELAY_MS * 4);
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(45_000) });
      if (r.status === 404 || r.status === 429) return null;
      if (r.ok) return await r.json();
    } catch {
      // retried once
    }
  }
  return null;
}

export const SQUARESPACE_MAX_PAGES = 30; // Squarespace pages hold ~20-200 items

/** Does this store carry a recorded written yes to reading `?format=json`? */
export function hasSquarespaceConsent(store: Pick<RetailerInfo, "squarespaceConsent">): boolean {
  return typeof store.squarespaceConsent === "string" && store.squarespaceConsent.trim().length >= 10;
}

/**
 * Every product under the given shop paths, de-duplicated. Returns [] (keep
 * yesterday's rows) when the store has no recorded consent, a path could not
 * be read, its first page held no product, or any price names another
 * currency than the market's.
 */
export async function fetchSquarespaceStoreProducts(store: RetailerInfo, paths: string[]): Promise<ShopifyProduct[]> {
  if (!hasSquarespaceConsent(store)) {
    console.warn(`  ⚠ ${store.name}: Squarespace store without recorded consent — not read.`);
    return [];
  }
  const currency = store.currency ?? currencyOf(store.country ?? "AU");
  const allowed = await robotsAllows(store.base);
  const products: ShopifyProduct[] = [];
  const seen = new Set<string>();
  for (const [i, path] of paths.entries()) {
    if (!allowed(path)) {
      console.warn(`  ⚠ ${store.name}: robots.txt disallows ${path} — keeping this store's existing rows.`);
      return [];
    }
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    let next: string | null = path;
    for (let page = 1; next && page <= SQUARESPACE_MAX_PAGES; page++) {
      if (page > 1) await sleep(REQUEST_DELAY_MS);
      const json = await getJson(jsonUrl(store.base, next));
      if (!json) {
        console.warn(`  ⚠ ${store.name}: could not read ${next} — keeping this store's existing rows.`);
        return [];
      }
      const got = parseSquarespacePage(json, store.base);
      if (page === 1 && !got.products.length) {
        console.warn(`  ⚠ ${store.name}: ${path} returned no products — keeping this store's existing rows.`);
        return [];
      }
      const wrong = got.products.find((p) => (p.currency ?? got.storeCurrency) && (p.currency ?? got.storeCurrency) !== currency);
      if (wrong) {
        console.warn(`  ⚠ ${store.name}: ${path} prices in ${wrong.currency ?? got.storeCurrency}, not ${currency} — keeping this store's existing rows.`);
        return [];
      }
      for (const p of got.products) {
        if (seen.has(p.handle)) continue;
        seen.add(p.handle);
        products.push({ title: p.title, handle: p.handle, variants: p.variants, url: p.url, ...(p.images ? { images: p.images } : {}) } as ShopifyProduct);
      }
      next = got.next;
    }
  }
  return products;
}
