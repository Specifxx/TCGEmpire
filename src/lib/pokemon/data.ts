// The Pokémon section's request-path reads: TWO self-cached loaders, nothing
// else touches the database while serving a page (egress rules 1-6, lib/db.ts).
//
//   getPokemonCatalog(market)  every active product with ONE market's headline
//                              figures, plus the set list. ~1,000 products ×
//                              ~200 bytes, far under the ~1.2 MB cache ceiling.
//   getPokemonProduct(slug)    one product with every market's offers and its
//                              price series. A few KB.
//
// Both are cachedOrDirect (unstable_cache) under POKEMON_TAG with POKEMON_TTL,
// purged by /api/pokemon/revalidate after each daily import. Never wrap either
// in another unstable_cache, and never call one from inside one (egress rule 6,
// tests/nested-cache.test.ts lists them as self-cached). A page reading them
// must not export a `revalidate` ABOVE POKEMON_TTL: the loader's shorter TTL
// would become the whole segment's (egress rule 5, the segment-TTL inversion
// tests/segment-ttl-inversion.test.ts fails). The product page uses exactly
// POKEMON_TTL; the grid pages are force-dynamic.

import { cache } from "react";
import { cachedOrDirect } from "../price-history";
import { COUNTRIES, type Country } from "../country";
import { pokemonDb } from "./db";
import { tileFigures } from "./board";
import { kindOrder, type PkKind } from "./kinds";
import { perPackCents } from "./packs";
import type { PkCatalog, PkOfferRow, PkProductDetail, PkSetSummary, PkSource, PkTile } from "./types";

import { POKEMON_TAG, POKEMON_TTL } from "./cache-keys";
export { POKEMON_TAG, POKEMON_TTL };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

// ── Catalogue ─────────────────────────────────────────────────────────────────
async function computeCatalog(market: Country): Promise<PkCatalog> {
  const db = pokemonDb();
  const [products, offers, sets, sourceGroups] = await Promise.all([
    db.pokemonProduct.findMany({
      where: { active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        kind: true,
        series: true,
        imageUrl: true,
        releasedOn: true,
        presale: true,
        firstSeenAt: true,
        setId: true,
        packCount: true,
      },
    }),
    // This market's rows plus the US market price every market references.
    db.pokemonOffer.findMany({
      where: { OR: [{ market }, { source: "tcgplayer_market" }] },
      select: { productId: true, market: true, source: true, priceCents: true, currency: true, inStock: true, checkedAt: true },
    }),
    db.pokemonSet.findMany({ select: { id: true, slug: true, name: true, code: true, series: true, releasedOn: true } }),
    db.pokemonOffer.groupBy({ by: ["source"] }),
  ]);

  const rowsByProduct = new Map<number, PkOfferRow[]>();
  let pricesAsOf: Date | null = null;
  for (const o of offers) {
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
    if (o.source === "tcgplayer_market" && (!pricesAsOf || o.checkedAt > pricesAsOf)) pricesAsOf = o.checkedAt;
  }

  const setById = new Map(sets.map((s) => [s.id, s]));
  const now = Date.now();
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
      releasedOn: day(p.releasedOn),
      presale: p.presale,
      firstSeenAt: p.firstSeenAt.toISOString(),
      ...figures,
      packCount: p.packCount,
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
        releasedOn: day(s.releasedOn),
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
    pricesAsOf: iso(pricesAsOf),
    sources: sourceGroups.map((g) => g.source as PkSource),
  };
}

// One warm lambda answers repeat requests from memory, as getSealedGroups does
// (lib/sealed-import.ts): Vercel's fan-out makes the data cache the real layer,
// this only saves its round trip.
type CatalogMemo = Map<Country, { at: number; data: PkCatalog }>;
const memo: CatalogMemo = ((globalThis as unknown as { __pokemonCatalog?: CatalogMemo }).__pokemonCatalog ??= new Map());
const MEMO_TTL_MS = 15 * 60_000;

export function clearPokemonMemo(): void {
  memo.clear();
}

// React's cache() de-duplicates within one request: a page's generateMetadata
// and its body both ask, and on a cold entry both used to miss and compute.
export const getPokemonCatalog = cache(async (market: Country): Promise<PkCatalog> => {
  const hit = memo.get(market);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.data;
  const data = await cachedOrDirect(() => computeCatalog(market), ["pokemon-catalog-v2", market], {
    revalidate: POKEMON_TTL,
    tags: [POKEMON_TAG],
  });
  memo.set(market, { at: Date.now(), data });
  return data;
});

// ── One product ───────────────────────────────────────────────────────────────
async function computeProduct(slug: string): Promise<PkProductDetail | null> {
  const db = pokemonDb();
  const p = await db.pokemonProduct.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      series: true,
      imageUrl: true,
      tcgplayerUrl: true,
      releasedOn: true,
      presale: true,
      contents: true,
      upc: true,
      packCount: true,
      packCountFrom: true,
      active: true,
      setId: true,
      set: { select: { slug: true, name: true, code: true, releasedOn: true } },
      offers: {
        select: {
          market: true,
          source: true,
          priceCents: true,
          currency: true,
          shippingCents: true,
          url: true,
          title: true,
          inStock: true,
          checkedAt: true,
        },
      },
    },
  });
  if (!p || !p.active) return null;
  const since = new Date(Date.now() - 365 * 86400_000);
  const [history, siblings] = await Promise.all([
    db.pokemonPricePoint.findMany({
      where: { productId: p.id, series: "tcgplayer_market", day: { gte: since } },
      orderBy: { day: "asc" },
      select: { day: true, cents: true },
      take: 400,
    }),
    p.setId != null
      ? db.pokemonProduct.findMany({
          where: { setId: p.setId, active: true, id: { not: p.id } },
          select: { slug: true, name: true, kind: true, imageUrl: true, packCount: true },
          take: 80,
        })
      : Promise.resolve([]),
  ]);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    kind: p.kind as PkKind,
    series: p.series,
    set: p.set ? { slug: p.set.slug, name: p.set.name, code: p.set.code, releasedOn: day(p.set.releasedOn) } : null,
    imageUrl: p.imageUrl,
    tcgplayerUrl: p.tcgplayerUrl,
    releasedOn: day(p.releasedOn),
    presale: p.presale,
    contents: p.contents,
    upc: p.upc,
    packCount: p.packCount,
    packCountFrom: (p.packCountFrom as "contents" | "name" | null) ?? null,
    offers: p.offers.map((o) => ({ ...o, source: o.source as PkSource, checkedAt: o.checkedAt.toISOString() })),
    history: history.map((h) => ({ day: h.day.toISOString().slice(0, 10), cents: h.cents })),
    siblings: siblings
      .map((s) => ({ ...s, kind: s.kind as PkKind }))
      .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.name.localeCompare(b.name)),
  };
}

export const getPokemonProduct = cache(
  async (slug: string): Promise<PkProductDetail | null> =>
    cachedOrDirect(() => computeProduct(slug), ["pokemon-product-v2", slug], {
      revalidate: POKEMON_TTL,
      tags: [POKEMON_TAG],
    }),
);
