// The Pokémon sealed import, run once a day by .github/workflows/pokemon-import.yml
// (scripts/pokemon/import.ts). Writes ONLY the section's files in data/pokemon
// (lib/pokemon/store.ts), which the workflow then commits to main.
//
//   1. TCGCSV  → the catalogue (sets, products) and TCGplayer's US prices
//   2. Cardmarket (POKEMON_CARDMARKET=1 only) → EU lowest + trend prices
//   3. eBay Browse → the cheapest matching listing, a capped slice a day
//
// Each stage fails alone and keeps yesterday's rows: a group that did not
// download keeps its products and prices exactly as they were, and a failed
// stage never deletes anything. The whole store is read into memory, changed
// stage by stage, and written back once at the end of the run.

import { convertCents, convertUsdCents } from "../fx";
import { COUNTRIES, type Country } from "../country";
import { readPokemonData, writeHistorySeries, writePokemonData, type PokemonData, type StoredOffer } from "./store";
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

const utcDayIso = (d = new Date()) => d.toISOString().slice(0, 10);

export interface PokemonImportSummary {
  groups: { inScope: number; fetched: number; failed: string[] };
  catalog: { sets: number; products: number; deactivated: number; skipped: Record<string, number> };
  tcgplayer: { listings: number; market: number };
  cardmarket: { enabled: boolean; matched: number; written: number; error?: string };
  ebay: { enabled: boolean; remaining: number | null; budget: number; searched: number; matched: number; error?: string };
}

// ── 1. TCGCSV ─────────────────────────────────────────────────────────────────
async function importTcgcsv(store: PokemonData, summary: PokemonImportSummary, now: Date): Promise<void> {
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
  const setById = new Map(store.sets.map((s) => [s.id, s]));
  const existingSets = new Map(store.sets.map((s) => [s.id, s.slug]));
  const freshSetSlugs = assignSetSlugs(build.sets.filter((s) => !existingSets.has(s.id)).map((s) => s));
  const takenSetSlugs = new Set(existingSets.values());
  for (const s of build.sets) {
    let slug = existingSets.get(s.id) ?? freshSetSlugs.get(s.id) ?? s.slug;
    if (!existingSets.has(s.id) && takenSetSlugs.has(slug)) slug = `${slug}-${s.id}`;
    takenSetSlugs.add(slug);
    const row = { id: s.id, slug, name: s.name, code: s.code, series: s.series, releasedOn: s.releasedOn };
    if (!setById.has(s.id)) store.sets.push(row);
    else Object.assign(setById.get(s.id) as object, row);
  }
  summary.catalog.sets = build.sets.length;

  const productById = new Map(store.products.map((p) => [p.id, p]));
  const existing = new Map(store.products.map((p) => [p.id, p.slug]));
  const slugs = assignSlugs(build.products, existing);
  for (const p of build.products) {
    const data = {
      name: p.name,
      setId: p.setId,
      groupId: p.groupId,
      kind: p.kind,
      series: p.series,
      imageUrl: p.imageUrl,
      tcgplayerUrl: p.tcgplayerUrl,
      releasedOn: p.releasedOn,
      presale: p.presale,
      contents: p.contents,
      upc: p.upc,
      packCount: p.packCount,
      packCountFrom: p.packCountFrom,
      active: true,
    };
    const row = productById.get(p.id);
    if (row) Object.assign(row, data);
    else {
      const created = { id: p.id, slug: slugs.get(p.id) as string, ...data, cardmarketId: null, firstSeenAt: now.toISOString() };
      store.products.push(created);
      productById.set(p.id, created);
    }
  }
  summary.catalog.products = build.products.length;

  // Gone from a group that DID download: no longer listed, so no longer shown.
  const seen = new Set(build.products.map((p) => p.id));
  const fetchedIds = new Set(fetchedGroups.map((g) => g.groupId));
  let deactivated = 0;
  for (const p of store.products) {
    if (p.active && fetchedIds.has(p.groupId) && !seen.has(p.id)) {
      p.active = false;
      deactivated++;
    }
  }
  summary.catalog.deactivated = deactivated;

  // TCGplayer prices: replaced only for products in groups that downloaded.
  const built = new Map(build.products.map((p) => [p.id, p]));
  const checkedAt = now.toISOString();
  const rows: StoredOffer[] = build.prices.flatMap((pr) => {
    const p = built.get(pr.productId);
    if (!p) return [];
    const base = { productId: pr.productId, market: "US", currency: "USD", url: p.tcgplayerUrl, checkedAt, inStock: true, shippingCents: null, title: null };
    return [
      ...(pr.lowCents != null ? [{ ...base, source: "tcgplayer", priceCents: pr.lowCents }] : []),
      ...(pr.marketCents != null ? [{ ...base, source: "tcgplayer_market", priceCents: pr.marketCents }] : []),
    ];
  });
  store.offers = [...store.offers.filter((o) => !(seen.has(o.productId) && (o.source === "tcgplayer" || o.source === "tcgplayer_market"))), ...rows];
  summary.tcgplayer.listings = rows.filter((r) => r.source === "tcgplayer").length;
  summary.tcgplayer.market = rows.filter((r) => r.source === "tcgplayer_market").length;

  // One point a day: a re-run the same day replaces it.
  const points: Record<string, number> = {};
  for (const pr of build.prices) if (pr.marketCents != null && built.has(pr.productId)) points[String(pr.productId)] = pr.marketCents;
  if (Object.keys(points).length) writeHistorySeries(utcDayIso(now), "tcgplayer_market", points);
}

// ── 2. Cardmarket ─────────────────────────────────────────────────────────────
export function pokemonCardmarketEnabled(): boolean {
  return process.env.POKEMON_CARDMARKET === "1";
}

async function importCardmarket(store: PokemonData, summary: PokemonImportSummary, now: Date): Promise<void> {
  const [catalogue, guide] = await Promise.all([
    getJson<{ products: CmProduct[] }>(process.env.POKEMON_CARDMARKET_PRODUCTS_URL || CM_NONSINGLES_URL),
    getJson<{ priceGuides: CmPrice[] }>(process.env.POKEMON_CARDMARKET_PRICES_URL || CM_PRICEGUIDE_URL),
  ]);
  const ours = store.products.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, kind: p.kind as PkKind }));
  const matches = matchCardmarket(ours, catalogue.products);
  summary.cardmarket.matched = matches.size;
  if (matches.size === 0) {
    summary.cardmarket.error = "0 matches — keeping existing rows";
    return;
  }
  const priceById = new Map(guide.priceGuides.map((p) => [p.idProduct, p]));
  const checkedAt = now.toISOString();
  const rows: StoredOffer[] = [];
  const points: Record<string, number> = {};
  for (const [productId, cmId] of matches) {
    const { lowCents, trendCents } = cmFigures(priceById.get(cmId));
    const base = { productId, market: "EU", currency: "EUR", url: cardmarketPokemonUrl(cmId), checkedAt, inStock: true, shippingCents: null, title: null };
    if (lowCents != null) rows.push({ ...base, source: "cardmarket", priceCents: lowCents });
    if (trendCents != null) {
      rows.push({ ...base, source: "cardmarket_trend", priceCents: trendCents });
      points[String(productId)] = trendCents;
    }
  }
  store.offers = [...store.offers.filter((o) => o.source !== "cardmarket" && o.source !== "cardmarket_trend"), ...rows];
  writeHistorySeries(utcDayIso(now), "cardmarket_trend", points);
  const byId = new Map(store.products.map((p) => [p.id, p]));
  for (const [id, cmId] of matches) {
    const p = byId.get(id);
    if (p) p.cardmarketId = cmId;
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

async function importEbay(store: PokemonData, summary: PokemonImportSummary): Promise<void> {
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
  const sinceDay = since.toISOString().slice(0, 10);
  const setById = new Map(store.sets.map((x) => [x.id, x]));
  const products = store.products
    .filter(
      (p) =>
        p.active &&
        p.setId != null &&
        (EBAY_TRACKED_KINDS as ReadonlySet<string>).has(p.kind) &&
        (p.presale || (p.releasedOn != null && p.releasedOn >= sinceDay)),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      releasedOn: p.releasedOn ? new Date(`${p.releasedOn}T00:00:00Z`) : null,
      set: p.setId != null && setById.has(p.setId) ? { name: (setById.get(p.setId) as { name: string }).name } : null,
    }));
  const setNames = store.sets.map((x) => x.name);
  const tracked = new Set(products.map((p) => p.id));
  const usMarket = new Map(store.offers.filter((o) => o.source === "tcgplayer_market" && tracked.has(o.productId)).map((o) => [o.productId, o.priceCents]));
  const checks = new Map(store.ebayChecks.map((c) => [`${c.productId}|${c.market}`, new Date(c.checkedAt).getTime()]));
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
    const checkedAt = new Date().toISOString();
    const isPair = (o: { productId: number; market: string }) => o.productId === p.id && o.market === market;
    // Nothing matched today: yesterday's listing is not evidence of today's.
    store.offers = store.offers.filter((o) => !(isPair(o) && o.source === "ebay"));
    if (best) {
      summary.ebay.matched++;
      store.offers.push({
        productId: p.id,
        market,
        source: "ebay",
        priceCents: best.priceCents,
        currency,
        shippingCents: best.shippingCents,
        url: best.url,
        title: best.title.slice(0, 200),
        inStock: true,
        checkedAt,
      });
    }
    store.ebayChecks = [...store.ebayChecks.filter((c) => !isPair(c)), { productId: p.id, market, checkedAt, matched: Boolean(best) }];
    await sleep(150);
  }
}

// ── The run ───────────────────────────────────────────────────────────────────
export async function importPokemon(): Promise<PokemonImportSummary> {
  const store = readPokemonData();
  const summary: PokemonImportSummary = {
    groups: { inScope: 0, fetched: 0, failed: [] },
    catalog: { sets: 0, products: 0, deactivated: 0, skipped: {} },
    tcgplayer: { listings: 0, market: 0 },
    cardmarket: { enabled: pokemonCardmarketEnabled(), matched: 0, written: 0 },
    ebay: { enabled: pokemonEbayEnabled(), remaining: null, budget: 0, searched: 0, matched: 0 },
  };
  const now = new Date();
  let ok = true;
  try {
    await importTcgcsv(store, summary, now);
  } catch (e) {
    ok = false;
    summary.groups.failed.push(`TCGCSV stage: ${(e as Error).message}`);
  }
  if (summary.cardmarket.enabled) {
    try {
      await importCardmarket(store, summary, now);
    } catch (e) {
      summary.cardmarket.error = (e as Error).message;
    }
  }
  if (summary.ebay.enabled) {
    try {
      await importEbay(store, summary);
    } catch (e) {
      summary.ebay.error = (e as Error).message;
    }
  }
  store.lastRun = { startedAt: now.toISOString(), finishedAt: new Date().toISOString(), ok, summary: JSON.parse(JSON.stringify(summary)) };
  // Never write an empty catalogue: products.json existing is what turns the
  // section on at the next build (next.config.js POKEMON_DATA_BUILT).
  if (store.products.length > 0) writePokemonData(store);
  return summary;
}
