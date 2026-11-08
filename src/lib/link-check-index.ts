// "Is this a good price?" (2026-11-08): the store listings behind /api/check/<host>, read ONLY from the release's bundled
// public data files (src/lib/public-data/, PUBLIC_DATA_MODE=files), never from Neon: a pasted link must never cost
// database transfer. Built once per server instance (a globalThis memo, egress rule 2), keyed by the host each listing
// links to. In "db" mode the files are not bundled, so the index answers null and the route says so (503), still
// without a query. Singles count at Near Mint only (a played copy is another price); eBay, TCGplayer and Amazon are
// never a store here. Each product key is "<country>:c:<cardId>:<foil 0|1>" or "<country>:s:<groupKey>", and its
// cheapest and median come from the in-stock store prices in that country.
import { cardHref } from "./card-url";
import { linkPath, medianCents, normaliseHost, variantOf, type CheckOffer, type CheckProduct, type StoreCheck } from "./link-check";
import { publicDataMode } from "./public-data/mode";
import { publicDataSource } from "./public-data/store";
import { RETAILER_LIST } from "./retailers";
import { sealedPath } from "./sealed-slug";

type Row = Record<string, unknown>;
type Built = { offers: CheckOffer[]; products: Record<string, CheckProduct>; stores: Map<string, number>; names: Map<string, string>; countries: Map<string, number> };

const NOT_A_STORE = /ebay|tcgplayer|amazon|cardmarket/i;
const nearMint = (c: unknown) => c == null || c === "" || /^(nm|near[\s-]?mint|mint|m)\b/i.test(String(c));

const memo = globalThis as unknown as { __linkCheckIndex?: Map<string, Built> };

function hostOf(url: unknown): { host: string; path: string; variant: string } | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return { host: normaliseHost(u.hostname), path: linkPath(u.pathname), variant: variantOf(url) };
  } catch {
    return null;
  }
}

function build(): Map<string, Built> {
  const src = publicDataSource();
  const byHost = new Map<string, Built>();
  const add = (row: Row, key: string, product: CheckProduct) => {
    const at = hostOf(row.url);
    if (!at) return;
    let b = byHost.get(at.host);
    if (!b) byHost.set(at.host, (b = { offers: [], products: {}, stores: new Map(), names: new Map(), countries: new Map() }));
    b.products[key] = product;
    b.offers.push([at.path, key, Number(row.priceCents), row.inStock === false ? 0 : 1, at.variant]);
    const store = String(row.retailer);
    b.stores.set(store, (b.stores.get(store) ?? 0) + 1);
    if (typeof row.retailerName === "string") b.names.set(store, row.retailerName);
    const country = String(row.country ?? "AU");
    b.countries.set(country, (b.countries.get(country) ?? 0) + 1);
  };
  const summarise = (rows: Row[], name: string, href: string): CheckProduct => {
    const open = rows.filter((r) => r.inStock !== false);
    const prices = open.map((r) => Number(r.priceCents)).filter((n) => Number.isFinite(n) && n > 0);
    return {
      name,
      href,
      cheapestCents: prices.length ? Math.min(...prices) : null,
      medianCents: prices.length >= 2 ? medianCents(prices) : null,
      inStockStores: new Set(open.map((r) => r.retailer)).size,
      listedStores: new Set(rows.map((r) => r.retailer)).size,
    };
  };
  const group = (rows: readonly Row[], keyOf: (r: Row) => string | null) => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = keyOf(r);
      if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return m;
  };

  // Singles: Near Mint store listings, per card, finish and country.
  const cards = new Map(src.all("Card").map((c) => [String(c.id), c]));
  const singles = src.all("RetailerPrice").filter((r) => !NOT_A_STORE.test(String(r.retailer)) && nearMint(r.condition) && Number(r.priceCents) > 0);
  for (const [key, rows] of group(singles, (r) => `${r.country ?? "AU"}:c:${r.cardId}:${r.isFoil ? 1 : 0}`)) {
    const card = cards.get(String(rows[0].cardId));
    if (!card) continue;
    const product = summarise(rows, `${card.name} (${card.collectorNumber})${rows[0].isFoil ? " Foil" : ""}`, cardHref({ id: String(card.id), slug: (card.slug as string | null) ?? null }));
    for (const r of rows) add(r, key, product);
  }

  // Sealed: store listings per product group and country.
  const sealed = src.all("SealedListing").filter((r) => !NOT_A_STORE.test(String(r.retailer)) && Number(r.priceCents) > 0);
  for (const [key, rows] of group(sealed, (r) => (r.groupKey ? `${r.country ?? "AU"}:s:${r.groupKey}` : null))) {
    const title = String(rows.reduce((a, b) => (String(b.title).length < String(a.title).length ? b : a)).title);
    const product = summarise(rows, title, sealedPath(String(rows[0].groupKey)));
    for (const r of rows) add(r, key, product);
  }
  // A store whose listings link to its myshopify.com address is also found by its own domain (RetailerInfo.base): the
  // product paths are the same on both.
  const hostOfStore = new Map<string, string>();
  for (const [host, b] of byHost) for (const store of b.stores.keys()) if (!hostOfStore.has(store)) hostOfStore.set(store, host);
  for (const r of RETAILER_LIST) {
    const own = hostOf(r.base)?.host;
    const listed = hostOfStore.get(r.key);
    if (own && listed && own !== listed && !byHost.has(own)) byHost.set(own, byHost.get(listed)!);
  }
  return byHost;
}

const most = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
const CURRENCY: Record<string, string> = { AU: "AUD", NZ: "NZD", US: "USD", UK: "GBP", GB: "GBP", SG: "SGD", CA: "CAD", EU: "EUR" };

/** One host's listings for the checker; null when the files aren't bundled (db mode), undefined for a host we don't read. */
export function storeCheck(rawHost: string): StoreCheck | null | undefined {
  if (publicDataMode() === "db") return null;
  const index = (memo.__linkCheckIndex ??= build());
  const b = index.get(normaliseHost(rawHost));
  if (!b) return undefined;
  const store = most(b.stores);
  const region = most(b.countries);
  const updated = publicDataSource().meta.generatedAt as unknown;
  return {
    v: 1,
    store,
    name: b.names.get(store) ?? store,
    region,
    currency: CURRENCY[region] ?? "USD",
    checkedAt: typeof updated === "string" ? updated : null,
    offers: b.offers,
    products: b.products,
  };
}
