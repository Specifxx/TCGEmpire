// The Pokémon section's request-path reads: TWO loaders over the committed
// files in data/pokemon (lib/pokemon/store.ts). No database since 2026-11-01.
//
//   getPokemonCatalog(market)  every active product with ONE market's headline
//                              figures, plus the set list.
//   getPokemonProduct(slug)    one product with every market's offers and its
//                              price series. A few KB.
//
// The files change only with a deploy, so both are memoised per warm function
// (and per request through React's cache()); nothing is written to the Data
// Cache. Never wrap either in an unstable_cache (tests/nested-cache.test.ts).
// The product page keeps its `revalidate` of POKEMON_TTL; the grid pages are
// force-dynamic.

import * as React from "react";
import { OFFER_STALE_MS } from "../sealed-offers";
import { COUNTRIES, type Country } from "../country";
import { clearPokemonStore, pokemonData, productHistory } from "./store";
import { tileFigures } from "./board";
import { kindOrder, type PkKind } from "./kinds";
import { perPackCents } from "./packs";
import type { PkCatalog, PkOfferRow, PkProductDetail, PkSetSummary, PkSource, PkTile } from "./types";

import { POKEMON_TAG, POKEMON_TTL } from "./cache-keys";
export { POKEMON_TAG, POKEMON_TTL };

// React's server `cache` exists only under Next's module resolution; tests
// import this file outside Next, so fall back to a passthrough there (as
// lib/riftboundstocks.ts does).
const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof (React as { cache?: unknown }).cache === "function" ? (React as unknown as { cache: typeof cache }).cache : (fn) => fn;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ── Catalogue ─────────────────────────────────────────────────────────────────
function computeCatalog(market: Country): PkCatalog {
  const store = pokemonData();
  const products = store.products.filter((p) => p.active);
  // This market's rows plus the US market price every market references.
  const offers = store.offers.filter((o) => o.market === market || o.source === "tcgplayer_market");
  const sets = store.sets;
  const sourceGroups = [...new Set(store.offers.map((o) => o.source))].map((source) => ({ source }));

  const rowsByProduct = new Map<number, PkOfferRow[]>();
  const now = Date.now();
  // "As of" for this market's figures: the oldest live listing row, so every
  // listing a page quotes is at least that fresh (eBay rows are checked in
  // rotation, days apart; dating them by TCGplayer's daily import would make
  // them look newer). Without a live listing, the newest TCGplayer market price.
  let oldestListing: Date | null = null;
  let newestReference: Date | null = null;
  for (const stored of offers) {
    const o = { ...stored, checkedAt: new Date(stored.checkedAt) };
    const row: PkOfferRow = {
      market: o.market,
      source: o.source as PkSource,
      priceCents: o.priceCents,
      currency: o.currency,
      shippingCents: null,
      url: "",
      title: null,
      inStock: o.inStock,
      checkedAt: o.checkedAt.toISOString(),
    };
    const list = rowsByProduct.get(o.productId) ?? [];
    list.push(row);
    rowsByProduct.set(o.productId, list);
    if (o.source === "tcgplayer_market" && (!newestReference || o.checkedAt > newestReference)) newestReference = o.checkedAt;
    const listing = o.market === market && (o.source === "tcgplayer" || o.source === "ebay" || o.source === "cardmarket");
    if (listing && o.inStock && now - o.checkedAt.getTime() <= OFFER_STALE_MS && (!oldestListing || o.checkedAt < oldestListing)) {
      oldestListing = o.checkedAt;
    }
  }

  const setById = new Map(sets.map((s) => [s.id, s]));
  const tiles: PkTile[] = products.map((p) => {
    const set = p.setId != null ? setById.get(p.setId) : undefined;
    const figures = tileFigures(rowsByProduct.get(p.id) ?? [], market, now);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      kind: p.kind as PkKind,
      setSlug: set?.slug ?? null,
      setName: set?.name ?? null,
      series: p.series,
      imageUrl: p.imageUrl,
      releasedOn: p.releasedOn,
      presale: p.presale,
      firstSeenAt: p.firstSeenAt,
      ...figures,
      packCount: p.packCount,
      packCountFrom: (p.packCountFrom as "contents" | "name" | null) ?? null,
      perPackCents: perPackCents(figures.lowCents, p.packCount),
    };
  });

  const bySet = new Map<string, PkTile[]>();
  for (const t of tiles) if (t.setSlug) bySet.set(t.setSlug, [...(bySet.get(t.setSlug) ?? []), t]);
  const setSummaries: PkSetSummary[] = sets
    .filter((s) => bySet.has(s.slug))
    .map((s) => {
      const list = bySet.get(s.slug) as PkTile[];
      const face =
        list.find((t) => t.kind === "booster-box" && !/half/i.test(t.name) && t.imageUrl) ??
        list.find((t) => t.kind === "etb" && t.imageUrl) ??
        list.find((t) => t.imageUrl);
      return {
        slug: s.slug,
        name: s.name,
        code: s.code,
        series: s.series,
        releasedOn: s.releasedOn,
        productCount: list.length,
        imageUrl: face?.imageUrl ?? null,
      };
    })
    .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""));

  return {
    market,
    currency: COUNTRIES[market].currency,
    tiles,
    sets: setSummaries,
    pricesAsOf: iso(oldestListing ?? newestReference),
    sources: sourceGroups.map((g) => g.source as PkSource),
  };
}

// The files change only with a deploy, so one warm function computes each
// market's catalogue once and answers every later request from memory. No
// unstable_cache: there is no database read to save, and a Data Cache entry
// would only add writes.
type CatalogMemo = Map<Country, PkCatalog>;
const memo: CatalogMemo = ((globalThis as unknown as { __pokemonCatalog?: CatalogMemo }).__pokemonCatalog ??= new Map());

export function clearPokemonMemo(): void {
  memo.clear();
  productMemo.clear();
  clearPokemonStore();
}

// React's cache() de-duplicates within one request (generateMetadata and the body both ask).
export const getPokemonCatalog = cache(async (market: Country): Promise<PkCatalog> => {
  const hit = memo.get(market);
  if (hit) return hit;
  const data = computeCatalog(market);
  memo.set(market, data);
  return data;
});

// ── One product ───────────────────────────────────────────────────────────────
function computeProduct(slug: string): PkProductDetail | null {
  const store = pokemonData();
  const p = store.products.find((x) => x.slug === slug);
  if (!p || !p.active) return null;
  const set = p.setId != null ? store.sets.find((s) => s.id === p.setId) : undefined;
  const since = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const history = productHistory(p.id, since).slice(-400);
  const siblings =
    p.setId != null
      ? store.products
          .filter((s) => s.setId === p.setId && s.active && s.id !== p.id)
          .slice(0, 80)
          .map((s) => ({ slug: s.slug, name: s.name, kind: s.kind, imageUrl: s.imageUrl, packCount: s.packCount }))
      : [];
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    kind: p.kind as PkKind,
    series: p.series,
    set: set ? { slug: set.slug, name: set.name, code: set.code, releasedOn: set.releasedOn } : null,
    imageUrl: p.imageUrl,
    tcgplayerUrl: p.tcgplayerUrl,
    releasedOn: p.releasedOn,
    presale: p.presale,
    contents: p.contents,
    upc: p.upc,
    packCount: p.packCount,
    packCountFrom: (p.packCountFrom as "contents" | "name" | null) ?? null,
    offers: store.offers
      .filter((o) => o.productId === p.id)
      .map((o) => ({
        market: o.market,
        source: o.source as PkSource,
        priceCents: o.priceCents,
        currency: o.currency,
        shippingCents: o.shippingCents,
        url: o.url,
        title: o.title,
        inStock: o.inStock,
        checkedAt: o.checkedAt,
      })),
    history,
    siblings: siblings
      .map((s) => ({ ...s, kind: s.kind as PkKind }))
      .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.name.localeCompare(b.name)),
  };
}

type ProductMemo = Map<string, PkProductDetail | null>;
const productMemo: ProductMemo = ((globalThis as unknown as { __pokemonProducts?: ProductMemo }).__pokemonProducts ??= new Map());

export const getPokemonProduct = cache(async (slug: string): Promise<PkProductDetail | null> => {
  if (!productMemo.has(slug)) productMemo.set(slug, computeProduct(slug));
  return productMemo.get(slug) ?? null;
});
