// The Pokémon sealed import, run once a day by .github/workflows/pokemon-import.yml
// (scripts/pokemon/import.ts). Writes ONLY to the Pokémon database.
//
//   1. TCGCSV  → the catalogue (sets, products) and TCGplayer's US prices
//   2. Cardmarket (POKEMON_CARDMARKET=1 only) → EU lowest + trend prices
//   3. eBay Browse → the cheapest matching listing, a capped slice a day
//
// Each stage fails alone and keeps yesterday's rows: a group that did not
// download keeps its products and prices exactly as they were, and a failed
// stage never deletes anything. Whole-table reads are fine here (egress rule 4:
// they belong in scripts); the request path reads two cached loaders only.

import { convertCents, convertUsdCents } from "../fx";
import { COUNTRIES, type Country } from "../country";
import { pokemonDb } from "./db";
import {
  TCGCSV_BASE,
  assignSetSlugs,
  assignSlugs,
  buildCatalog,
  groupRole,
  type TcgcsvGroup,
  type TcgcsvPrice,
  type TcgcsvProduct,
} from "./catalog";
import { CM_NONSINGLES_URL, CM_PRICEGUIDE_URL, cardmarketPokemonUrl, cmFigures, matchCardmarket, type CmPrice, type CmProduct } from "./cardmarket-match";
import {
  EBAY_TRACKED_KINDS,
  KIND_FLOOR_USD_CENTS,
  bestEbayMatch,
  pickEbayWork,
  pokemonEbayBudget,
  type EbayPair,
} from "./ebay-match";
import { POKEMON_EBAY_MARKETS, ebayRemainingToday, pokemonEbayEnabled, searchPokemonEbay } from "./ebay";
import { pokemonEbayQuery } from "./ebay-query";
import type { PkKind } from "./kinds";

const UA = "RiftCompare/1.0 (+https://riftcompare.com; Pokemon sealed prices)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== "" ? n : fallback;
};

async function getJson<T>(url: string, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      last = e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const utcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const asDate = (day: string | null) => (day ? new Date(`${day}T00:00:00Z`) : null);

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export interface PokemonImportSummary {
  groups: { inScope: number; fetched: number; failed: string[] };
  catalog: { sets: number; products: number; deactivated: number; skipped: Record<string, number> };
  tcgplayer: { listings: number; market: number };
  cardmarket: { enabled: boolean; matched: number; written: number; error?: string };
  ebay: { enabled: boolean; remaining: number | null; budget: number; searched: number; matched: number; error?: string };
}

// ── 1. TCGCSV ─────────────────────────────────────────────────────────────────
async function importTcgcsv(summary: PokemonImportSummary): Promise<void> {
  const db = pokemonDb();
  const all = (await getJson<{ results: TcgcsvGroup[] }>(`${TCGCSV_BASE}/groups`)).results;
  const groups = all.filter((g) => groupRole(g));
  summary.groups.inScope = groups.length;

  const productsByGroup = new Map<number, TcgcsvProduct[]>();
  const pricesByGroup = new Map<number, TcgcsvPrice[]>();
  await mapLimit(groups, 4, async (g) => {
    try {
      const [p, pr] = await Promise.all([
        getJson<{ results: TcgcsvProduct[] }>(`${TCGCSV_BASE}/${g.groupId}/products`),
        getJson<{ results: TcgcsvPrice[] }>(`${TCGCSV_BASE}/${g.groupId}/prices`),
      ]);
      productsByGroup.set(g.groupId, p.results);
      pricesByGroup.set(g.groupId, pr.results);
    } catch (e) {
      summary.groups.failed.push(`${g.name}: ${(e as Error).message}`);
    }
  });
  summary.groups.fetched = productsByGroup.size;
  // A group that did not download is left exactly as it was (no deactivation, no price change).
  const fetchedGroups = groups.filter((g) => productsByGroup.has(g.groupId));
  const build = buildCatalog(fetchedGroups, productsByGroup, pricesByGroup);
  summary.catalog.skipped = build.skipped;

  // Sets: a set keeps its slug once written, like a product.
  const existingSets = new Map((await db.pokemonSet.findMany({ select: { id: true, slug: true } })).map((s) => [s.id, s.slug]));
  const freshSetSlugs = assignSetSlugs(build.sets.filter((s) => !existingSets.has(s.id)).map((s) => s));
  const takenSetSlugs = new Set(existingSets.values());
  for (const s of build.sets) {
    let slug = existingSets.get(s.id) ?? freshSetSlugs.get(s.id) ?? s.slug;
    if (!existingSets.has(s.id) && takenSetSlugs.has(slug)) slug = `${slug}-${s.id}`;
    takenSetSlugs.add(slug);
    const data = { name: s.name, code: s.code, series: s.series, releasedOn: asDate(s.releasedOn) };
    await db.pokemonSet.upsert({ where: { id: s.id }, create: { id: s.id, slug, ...data }, update: data });
  }
  summary.catalog.sets = build.sets.length;

  const existing = new Map((await db.pokemonProduct.findMany({ select: { id: true, slug: true } })).map((p) => [p.id, p.slug]));
  const slugs = assignSlugs(build.products, existing);
  for (const batch of chunk(build.products, 100)) {
    await db.$transaction(
      batch.map((p) => {
        const data = {
          name: p.name,
          setId: p.setId,
          groupId: p.groupId,
          kind: p.kind,
          series: p.series,
          imageUrl: p.imageUrl,
          tcgplayerUrl: p.tcgplayerUrl,
          releasedOn: asDate(p.releasedOn),
          presale: p.presale,
          contents: p.contents,
          upc: p.upc,
          packCount: p.packCount,
          packCountFrom: p.packCountFrom,
          active: true,
        };
        return db.pokemonProduct.upsert({
          where: { id: p.id },
          create: { id: p.id, slug: slugs.get(p.id) as string, ...data },
          update: data,
        });
      }),
    );
  }
  summary.catalog.products = build.products.length;

  // Gone from a group that DID download: no longer listed, so no longer shown.
  const seen = build.products.map((p) => p.id);
  const deactivated = await db.pokemonProduct.updateMany({
    where: { groupId: { in: fetchedGroups.map((g) => g.groupId) }, id: { notIn: seen }, active: true },
    data: { active: false },
  });
  summary.catalog.deactivated = deactivated.count;

  // TCGplayer prices: replaced only for products in groups that downloaded.
  const now = new Date();
  const productById = new Map(build.products.map((p) => [p.id, p]));
  const rows = build.prices.flatMap((pr) => {
    const p = productById.get(pr.productId);
    if (!p) return [];
    const base = { productId: pr.productId, market: "US", currency: "USD", url: p.tcgplayerUrl, checkedAt: now, inStock: true };
    return [
      ...(pr.lowCents != null ? [{ ...base, source: "tcgplayer", priceCents: pr.lowCents }] : []),
      ...(pr.marketCents != null ? [{ ...base, source: "tcgplayer_market", priceCents: pr.marketCents }] : []),
    ];
  });
  await db.$transaction([
    db.pokemonOffer.deleteMany({ where: { productId: { in: seen }, source: { in: ["tcgplayer", "tcgplayer_market"] } } }),
    db.pokemonOffer.createMany({ data: rows }),
  ]);
  summary.tcgplayer.listings = rows.filter((r) => r.source === "tcgplayer").length;
  summary.tcgplayer.market = rows.filter((r) => r.source === "tcgplayer_market").length;

  // One point a day: a re-run the same day replaces it.
  const day = utcDay(now);
  const points = build.prices
    .filter((pr) => pr.marketCents != null)
    .map((pr) => ({ productId: pr.productId, series: "tcgplayer_market", day, cents: pr.marketCents as number }));
  await db.$transaction([
    db.pokemonPricePoint.deleteMany({ where: { series: "tcgplayer_market", day, productId: { in: points.map((p) => p.productId) } } }),
    db.pokemonPricePoint.createMany({ data: points }),
  ]);
}

// ── 2. Cardmarket ─────────────────────────────────────────────────────────────
export function pokemonCardmarketEnabled(): boolean {
  return process.env.POKEMON_CARDMARKET === "1";
}

async function importCardmarket(summary: PokemonImportSummary): Promise<void> {
  const db = pokemonDb();
  const [catalogue, guide] = await Promise.all([
    getJson<{ products: CmProduct[] }>(process.env.POKEMON_CARDMARKET_PRODUCTS_URL || CM_NONSINGLES_URL),
    getJson<{ priceGuides: CmPrice[] }>(process.env.POKEMON_CARDMARKET_PRICES_URL || CM_PRICEGUIDE_URL),
  ]);
  const ours = await db.pokemonProduct.findMany({ where: { active: true }, select: { id: true, name: true, kind: true } });
  const matches = matchCardmarket(
    ours.map((o) => ({ ...o, kind: o.kind as PkKind })),
    catalogue.products,
  );
  summary.cardmarket.matched = matches.size;
  if (matches.size === 0) {
    summary.cardmarket.error = "0 matches — keeping existing rows";
    return;
  }
  const priceById = new Map(guide.priceGuides.map((p) => [p.idProduct, p]));
  const now = new Date();
  const rows: { productId: number; market: string; source: string; priceCents: number; currency: string; url: string; checkedAt: Date; inStock: boolean }[] = [];
  const points: { productId: number; series: string; day: Date; cents: number }[] = [];
  const day = utcDay(now);
  for (const [productId, cmId] of matches) {
    const { lowCents, trendCents } = cmFigures(priceById.get(cmId));
    const base = { productId, market: "EU", currency: "EUR", url: cardmarketPokemonUrl(cmId), checkedAt: now, inStock: true };
    if (lowCents != null) rows.push({ ...base, source: "cardmarket", priceCents: lowCents });
    if (trendCents != null) {
      rows.push({ ...base, source: "cardmarket_trend", priceCents: trendCents });
      points.push({ productId, series: "cardmarket_trend", day, cents: trendCents });
    }
  }
  await db.$transaction([
    db.pokemonOffer.deleteMany({ where: { source: { in: ["cardmarket", "cardmarket_trend"] } } }),
    db.pokemonOffer.createMany({ data: rows }),
    db.pokemonPricePoint.deleteMany({ where: { series: "cardmarket_trend", day } }),
    db.pokemonPricePoint.createMany({ data: points }),
  ]);
  for (const batch of chunk([...matches], 200)) {
    await db.$transaction(batch.map(([id, cmId]) => db.pokemonProduct.update({ where: { id }, data: { cardmarketId: cmId } })));
  }
  summary.cardmarket.written = rows.length;
}

// ── 3. eBay ───────────────────────────────────────────────────────────────────
// RIFTBOUND FIRST (owner, 2026-10-01: "prioritise our eBay quota for riftbound
// and only use sparingly any remaining quota for pokemon"). The 5,000-a-day
// Browse quota is one app's; Pokémon searches only in the late run
// (pokemon-import.yml, 21:47 UTC), after both Riftbound refreshes (07:00 and
// 19:00 UTC), spends at most 60 calls, and never takes the count below 2,500:
// one full Riftbound run (~1,400 calls) plus its own 600 reserve, with room to
// spare, wherever eBay's daily reset falls. An unreadable count spends nothing.
export const POKEMON_EBAY_CAP = 60;
export const POKEMON_EBAY_RESERVE = 2500;
/**
 * Tracked: the box-shaped kinds of sets released in the last N months, plus
 * pre-orders. Sized to the cap: ~29 products × 5 markets = ~145 pairs, so at 60
 * a day each pair is searched again about every two and a half days, inside the
 * 72h after which a row shows as unknown.
 */
export const POKEMON_EBAY_MONTHS = 12;

async function importEbay(summary: PokemonImportSummary): Promise<void> {
  const db = pokemonDb();
  const remaining = await ebayRemainingToday();
  const budget = pokemonEbayBudget(
    remaining,
    envInt("POKEMON_EBAY_MAX_CALLS", POKEMON_EBAY_CAP),
    envInt("POKEMON_EBAY_RESERVE", POKEMON_EBAY_RESERVE),
  );
  summary.ebay.remaining = remaining;
  summary.ebay.budget = budget;
  if (budget <= 0) return;

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - envInt("POKEMON_EBAY_MONTHS", POKEMON_EBAY_MONTHS));
  const products = await db.pokemonProduct.findMany({
    where: {
      active: true,
      setId: { not: null },
      kind: { in: [...EBAY_TRACKED_KINDS] },
      OR: [{ presale: true }, { releasedOn: { gte: since } }],
    },
    select: { id: true, name: true, kind: true, releasedOn: true, set: { select: { name: true } } },
  });
  const setNames = (await db.pokemonSet.findMany({ select: { name: true } })).map((s) => s.name);
  const usMarket = new Map(
    (
      await db.pokemonOffer.findMany({
        where: { source: "tcgplayer_market", productId: { in: products.map((p) => p.id) } },
        select: { productId: true, priceCents: true },
      })
    ).map((o) => [o.productId, o.priceCents]),
  );
  const checks = new Map(
    (await db.pokemonEbayCheck.findMany({ select: { productId: true, market: true, checkedAt: true } })).map((c) => [
      `${c.productId}|${c.market}`,
      c.checkedAt.getTime(),
    ]),
  );
  const byNewest = [...products].sort((a, b) => (b.releasedOn?.getTime() ?? 0) - (a.releasedOn?.getTime() ?? 0));
  const priority = new Map(byNewest.map((p, i) => [p.id, i]));
  const pairs: EbayPair[] = products.flatMap((p) =>
    POKEMON_EBAY_MARKETS.map((market) => ({
      productId: p.id,
      market,
      lastChecked: checks.get(`${p.id}|${market}`) ?? null,
      priority: priority.get(p.id) ?? 0,
    })),
  );
  const work = pickEbayWork(pairs, budget);
  const byId = new Map(products.map((p) => [p.id, p]));

  for (const pair of work) {
    const p = byId.get(pair.productId);
    if (!p) continue;
    const market = pair.market as Country;
    const currency = COUNTRIES[market].currency;
    const outcome = await searchPokemonEbay(pokemonEbayQuery(p.name), market);
    if (outcome.status === "rate-limited") {
      summary.ebay.error = "429 from eBay — stopped";
      break;
    }
    summary.ebay.searched++;
    if (outcome.status === "error") continue; // leave the pair due; try again next run
    const ref = usMarket.get(p.id);
    const best = bestEbayMatch(outcome.items, {
      productName: p.name,
      kind: p.kind as PkKind,
      setName: p.set?.name ?? null,
      setNames,
      refCents: ref != null ? convertCents(ref, "USD", currency) : null,
      floorCents: convertUsdCents(KIND_FLOOR_USD_CENTS[p.kind as PkKind] ?? 0, currency),
      currency,
    });
    const now = new Date();
    const key = { productId_market_source: { productId: p.id, market, source: "ebay" } };
    if (best) {
      summary.ebay.matched++;
      const data = {
        priceCents: best.priceCents,
        currency,
        shippingCents: best.shippingCents,
        url: best.url,
        title: best.title.slice(0, 200),
        inStock: true,
        checkedAt: now,
      };
      await db.pokemonOffer.upsert({ where: key, create: { productId: p.id, market, source: "ebay", ...data }, update: data });
    } else {
      // Nothing matched today: yesterday's listing is not evidence of today's.
      await db.pokemonOffer.deleteMany({ where: { productId: p.id, market, source: "ebay" } });
    }
    await db.pokemonEbayCheck.upsert({
      where: { productId_market: { productId: p.id, market } },
      create: { productId: p.id, market, checkedAt: now, matched: Boolean(best) },
      update: { checkedAt: now, matched: Boolean(best) },
    });
    await sleep(150);
  }
}

// ── The run ───────────────────────────────────────────────────────────────────
export async function importPokemon(): Promise<PokemonImportSummary> {
  const db = pokemonDb();
  const summary: PokemonImportSummary = {
    groups: { inScope: 0, fetched: 0, failed: [] },
    catalog: { sets: 0, products: 0, deactivated: 0, skipped: {} },
    tcgplayer: { listings: 0, market: 0 },
    cardmarket: { enabled: pokemonCardmarketEnabled(), matched: 0, written: 0 },
    ebay: { enabled: pokemonEbayEnabled(), remaining: null, budget: 0, searched: 0, matched: 0 },
  };
  const run = await db.pokemonImportRun.create({ data: {} });
  let ok = true;
  try {
    await importTcgcsv(summary);
  } catch (e) {
    ok = false;
    summary.groups.failed.push(`TCGCSV stage: ${(e as Error).message}`);
  }
  if (summary.cardmarket.enabled) {
    try {
      await importCardmarket(summary);
    } catch (e) {
      summary.cardmarket.error = (e as Error).message;
    }
  }
  if (summary.ebay.enabled) {
    try {
      await importEbay(summary);
    } catch (e) {
      summary.ebay.error = (e as Error).message;
    }
  }
  await db.pokemonImportRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), ok, summary: JSON.parse(JSON.stringify(summary)) },
  });
  return summary;
}
