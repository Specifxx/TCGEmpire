// Reading a store whose storefront has no public product feed, from the plain
// category pages a shopper browses: BigCommerce (Stencil themes) and Shopware 6.
// The third and fourth storefront platforms this importer can read, after
// Shopify's products.json and the WooCommerce Store API (lib/woocommerce.ts).
//
// Returns the SHOPIFY product shape deliberately, like the Woo adapter: every
// listing then goes through the same resolveCardId, MULTI_CARD, conditionRank
// and write path, and the sealed importer's title gates and floors.
//
// BigCommerce has no anonymous JSON catalogue (its storefront GraphQL needs a
// token not every theme exposes), so this reads /<category-path>/?limit=100&page=N
// (Stencil's own page-size option; a theme that ignores it serves its default
// 40): one `<article class="card …">` per product with its title, its price
// ("699.95$ AUD", "$24.99") and an "Add to Cart" or "Out of stock" button. A
// theme whose grid is drawn in the browser (Star City Games, ToyWiz, Game
// Nerdz) has no product in its HTML and is NOT readable this way: the first
// page returns no card and the read FAILS, so the caller keeps yesterday's
// rows instead of publishing an empty store. Ported from OP Compare's
// lib/bigcommerce.ts and MTG Compare's lib/storefront-html.ts (2026-11-04).
//
// Shopware 6 (Miniature Market) renders `<div class="card product-box">` per
// product, paged with ?p=N; a box with a "btn-buy" button is in stock, one with
// a stock-notify form is not.
//
// Both honour robots.txt (robotsAllows), read one page at a time with the usual
// delay, and never touch search, faceted (?_bc_fsnf=) or sort URLs, which these
// stores disallow. Prices are taken only when the page names the market's
// currency or none; a price in another currency is refused, never converted.
import type { ShopifyProduct } from "./price-import";
import type { RetailerInfo } from "./retailers";
import { SCRAPE_HEADERS as UA, REQUEST_DELAY_MS, robotsAllows, sleep } from "./scrape-http";
import { decodeEntities } from "./woocommerce";
import { currencyOf } from "./country";

export type HtmlPlatform = "bigcommerce" | "shopware";

export interface HtmlListing extends ShopifyProduct {
  url: string;
  /** The ISO code the page stated beside the price (or in its JSON-LD), when it did. */
  currency: string | null;
}

/** "3,096.00$ AUD" / "$24.99" / "£5.49" → "3096.00" (a Shopify-shaped price string); null when the text names another currency or no number. */
export function parseMoney(text: string, currency: string): string | null {
  const t = decodeEntities(text).trim();
  const codes = t.match(/\b[A-Z]{3}\b/g) ?? [];
  if (codes.some((c) => c !== currency)) return null;
  const m = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(t);
  if (!m) return null;
  const n = Number(`${m[1].replace(/,/g, "")}.${m[2] ?? "0"}`);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** The ISO code a page states for its prices (JSON-LD or a data attribute), if any. */
export function pageCurrency(html: string): string | null {
  return /"priceCurrency"\s*:\s*"([A-Z]{3})"/.exec(html)?.[1] ?? /currency[_-]?code["']?\s*[:=]\s*["']([A-Z]{3})/i.exec(html)?.[1] ?? null;
}

/** The products on one BigCommerce (Stencil) category page; empty past the last page. */
export function parseBigCommercePage(html: string, currency: string): HtmlListing[] {
  const out: HtmlListing[] = [];
  const stated = pageCurrency(html);
  for (const chunk of html.split(/<article\b[^>]*\bclass="card\b/).slice(1)) {
    const a = /<h[2-5] class="card-title">\s*<a\b([^>]*)>([^<]+)<\/a>/.exec(chunk);
    if (!a) continue;
    const href = /href="([^"]*)"/.exec(a[1])?.[1];
    if (!href) continue;
    const priceText = /data-product-price-with(?:out)?-tax[^>]*>([^<]+)</.exec(chunk)?.[1] ?? "";
    const price = parseMoney(priceText, currency);
    if (price == null) continue;
    const soldOut = /button--outstock|>\s*Out of stock\s*</i.test(chunk);
    const buyable = /Add to Cart|Pre-?Order/i.test(chunk);
    const url = decodeEntities(href);
    out.push({
      title: decodeEntities(a[2]).replace(/\s+/g, " ").trim(),
      handle: url.replace(/^https?:\/\/[^/]+/, ""),
      url,
      variants: [{ title: "", price, available: buyable && !soldOut }],
      currency: priceText.match(/\b[A-Z]{3}\b/)?.[0] ?? stated,
    });
  }
  return out;
}

/** The products on one Shopware 6 listing page; empty past the last page. */
export function parseShopwarePage(html: string, currency: string): HtmlListing[] {
  const out: HtmlListing[] = [];
  const stated = pageCurrency(html);
  for (const chunk of html.split(/<div class="card product-box\b/).slice(1)) {
    const a = /<a\s+href="([^"]+)"\s+class="product-name[^"]*"\s+title="([^"]*)"/.exec(chunk);
    if (!a) continue;
    const priceText = /<span class="product-price">\s*([^<]+)</.exec(chunk)?.[1] ?? "";
    const price = parseMoney(priceText, currency);
    if (price == null) continue;
    const available = /btn-buy/.test(chunk) && !/stock-notify/.test(chunk);
    const url = decodeEntities(a[1]);
    out.push({
      title: decodeEntities(a[2]).replace(/\s+/g, " ").trim(),
      handle: url.replace(/^https?:\/\/[^/]+/, ""),
      url,
      variants: [{ title: "", price, available }],
      currency: priceText.match(/\b[A-Z]{3}\b/)?.[0] ?? stated,
    });
  }
  return out;
}

function pageUrl(base: string, path: string, platform: HtmlPlatform, page: number): string {
  const sep = path.includes("?") ? "&" : "?";
  return platform === "shopware" ? `${base}${path}${sep}limit=100&p=${page}` : `${base}${path}${sep}limit=100&page=${page}`;
}

async function getHtml(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(REQUEST_DELAY_MS * 4);
    try {
      const r = await fetch(url, { headers: { ...UA, Accept: "text/html" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(45_000) });
      if (r.status === 404 || r.status === 429) return null;
      if (r.ok) return await r.text();
    } catch {
      // retried once below
    }
  }
  return null;
}

export const HTML_MAX_PAGES = 60; // 6,000 products per category path

/**
 * Every product under one category path, page by page until a page adds
 * nothing new. `failed` when the first page could not be read or held no
 * product grid (the theme draws it in the browser, or the path is gone): the
 * caller keeps the store's rows for this run rather than emptying them.
 */
export async function fetchHtmlCategory(base: string, path: string, platform: HtmlPlatform, currency: string, maxPages = HTML_MAX_PAGES): Promise<{ products: HtmlListing[]; failed: boolean }> {
  const allowed = await robotsAllows(base);
  if (!allowed(path)) {
    console.warn(`${base}: robots.txt disallows ${path} — skipping.`);
    return { products: [], failed: false };
  }
  const products: HtmlListing[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(REQUEST_DELAY_MS);
    const html = await getHtml(pageUrl(base, path, platform, page));
    if (!html) return { products, failed: true };
    const got = platform === "shopware" ? parseShopwarePage(html, currency) : parseBigCommercePage(html, currency);
    if (page === 1 && !got.length) return { products, failed: true };
    const fresh = got.filter((p) => !seen.has(p.handle));
    for (const p of fresh) {
      seen.add(p.handle);
      products.push(p);
    }
    if (!fresh.length || got.length < 20) break;
  }
  return { products, failed: false };
}

/**
 * Every product in the given category paths of a BigCommerce or Shopware
 * store, de-duplicated. Returns [] (keep yesterday's rows) when a configured
 * path could not be read or any price names another currency than the
 * market's; the importers treat that exactly like a failed Shopify collection.
 */
export async function fetchHtmlStoreProducts(store: RetailerInfo, paths: string[]): Promise<ShopifyProduct[]> {
  const platform = store.platform as HtmlPlatform;
  const currency = store.currency ?? currencyOf(store.country ?? "AU");
  const products: ShopifyProduct[] = [];
  const seen = new Set<string>();
  for (const [i, path] of paths.entries()) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    const { products: got, failed } = await fetchHtmlCategory(store.base, path, platform, currency);
    if (failed) {
      console.warn(`  ⚠ ${store.name}: could not read ${path} — keeping this store's existing rows for this run.`);
      return [];
    }
    const wrong = got.find((p) => p.currency && p.currency !== currency);
    if (wrong) {
      console.warn(`  ⚠ ${store.name}: ${path} prices in ${wrong.currency}, not ${currency} — keeping this store's existing rows.`);
      return [];
    }
    for (const p of got) {
      if (seen.has(p.handle)) continue;
      seen.add(p.handle);
      products.push({ title: p.title, handle: p.handle, variants: p.variants, url: p.url });
    }
  }
  return products;
}
