// Deal Finder: ONE buyer list (2026-09-25). Every card a store or eBay seller in
// the viewer's market is selling for less than TCGplayer's US market price,
// converted into local currency, ranked by how far below it sits. The buy side
// is selectable (every store, eBay, or any mix — "eBay only" is a preset of the
// same list); the reference side is always TCGplayer's market price.
//
// It used to be four tabs. "Worth more on eBay" (buy at a store, sell on eBay
// after a ~13% fee) and "Cross-region" were cut: the first was seller framing
// the site's positioning rules out, and its pager/sort/filter had silently sent
// paying members to a different tab since 2026-09-21; the second ranked worse
// than the free /market/records board it was advertised from. "Cheapest on
// eBay" became the eBay-only preset of this list, ranked by delivered cost from
// the eBay row cache below instead of a second, item-price-only query.
// getCrossRegionGaps (bottom of this file) stays because /market/records uses it.
//
// The homepage's "Cheapest on eBay" row came back on 2026-09-26 as
// getCheapestOnEbay (below getPricesAsOf): the owner's original feature, free,
// because every click on it is an eBay affiliate click. It is not a second
// ranking pipeline — it re-reads the SAME day-cached aggregates the default list
// above builds, and adds one detail lookup for at most four cards.
//
// Egress-bounded: a groupBy aggregate and two row pulls rank everything;
// per-listing detail (urls/names) is fetched only for the page being shown. The
// full-set pulls that can't be done as a groupBy (one market's cheapest eBay
// listing per card, TCGplayer's US rows, the cross-region catalogue read) go
// through the SHARED Next data cache via cachedOrDirect: day-keyed and
// CONTENT_TAG-busted on import, so it's one pull per market per day across every
// lambda instance. These used to be per-instance globalThis memos, but those only
// dedupe within one warm lambda — under Vercel's fan-out every cold instance
// re-pulled the whole set, which is exactly what has burned through this
// project's Neon free-tier transfer allowance before.
import { prisma } from "./db";
import { COUNTRY_LIST, currencyOf, pickPrice, type Country } from "./country";
import { RETAILERS } from "./retailers";
import { affiliateUrl } from "./affiliate";
import { cardTileSelect } from "./cards";
import { TCG_US } from "./tcgplayer";
import { preferMarketRows, TCG_US_MARKET_READ_KEYS } from "./tcg-market-rows";
import { usdCentsToCountry, convertCents } from "./fx";
import { cachedOrDirect, inNextRequest, sydneyDayKey } from "./price-history";
import { CONTENT_TAG } from "./revalidate-content";
import { CARDTRADER_RETAILER, isFallbackRetailer, TCGPLAYER_SG_RETAILER, TCGPLAYER_UK_RETAILER } from "./constants";
import type { CardTileData } from "@/components/CardTile";

const MIN_BUY_CENTS = 300;
// A row must sit at least this far below TCGplayer market to count at all.
const MIN_BELOW_CENTS = 100;
// Outlier guard. A card "75% below market" almost always means the two sides
// are not the same product (a $9 die against a mislabelled listing, a foil
// matched to a base printing) — bad data, not a deal. 75% below market is the
// same line as the old "300% margin over the buy price" guard, restated from the
// buyer's side: market ≥ 4 × buy either way.
const MAX_BELOW_PCT = 75;
// The page every getArbitrageVsTcgplayer link renders on — its affiliateUrl `loc`.
const DEAL_FINDER_PATH = "/tools/deal-finder";

// ── The one "% below" definition ─────────────────────────────────────────────
/**
 * How far below TCGplayer market a price sits, as a percentage OF THE MARKET
 * PRICE, to one decimal: (market − price) / market. The homepage's "Save X%"
 * badge (lib/top-deals.ts) and Deal Finder's "% below" column both call this,
 * so the same card can never read one figure on the homepage and another in the
 * tool (it used to: the tool showed the gap over the BUY price, so a card at
 * half of market read "Save 50%" on the homepage and "100%" in the tool).
 * Null when there is no positive market price to measure against.
 */
export function belowTcgPct(priceCents: number, marketCents: number): number | null {
  if (!(marketCents > 0)) return null;
  return Math.round(((marketCents - priceCents) / marketCents) * 1000) / 10;
}

// ── eBay ─────────────────────────────────────────────────────────────────────
// eBay retailer key per market.
const EBAY_KEY: Record<Country, string | null> = { AU: "ebay", US: "ebay_us", UK: "ebay_uk", SG: "ebay_sg", CA: "ebay_ca", EU: "ebay_eu" };

// Markets whose "eBay" rows are ANOTHER market's listings. ebay_ca is US listings
// converted to CAD, written with shippingCents = null on purpose (price-import.ts:
// "carrying the US number over would understate the delivered cost") — a
// Canadian pays international postage nobody has quoted. So in these markets an
// eBay row is item-price-only, is never called "delivered", and is left out of
// the default buy side (it stays selectable, clearly labelled).
const EBAY_CROSS_BORDER: Partial<Record<Country, true>> = { CA: true };

/**
 * What an eBay row is called in the Best price column. "delivered" ONLY when the
 * seller stated postage and it is included in the figure; an unknown postage is
 * never counted as free.
 */
export function ebayBuyLabel(country: Country, postageKnown: boolean): string {
  if (EBAY_CROSS_BORDER[country]) return "eBay US + intl postage";
  return postageKnown ? "eBay (delivered)" : "eBay + postage";
}

// One pull per (country, eBay retailer) per DAY, shared across every lambda
// instance — NOT a per-instance globalThis memo. cachedOrDirect puts it in the
// shared Next data cache, day-keyed and CONTENT_TAG-busted on import (the data
// only changes then), and falls back to a direct query in any context without
// the incremental cache (scripts) so nothing else has to care.
//
// REDUCED IN POSTGRES, NOT NODE (2026-09-14, DECISIONS.md "Find the fifth burn
// before RM10 dies"). DISTINCT ON keeps the cheapest listing per card, so the
// result is bounded by the CARD catalogue (~1,400 rows), not by how many eBay
// listings exist. DISTINCT ON's leading ORDER BY term must match the DISTINCT
// list, so cardId sorts first and the comparable-cost expression sorts last.
//
// The COALESCE is the COMPARABLE cost, not a claim that unknown postage is
// free: a listing whose seller stated no postage is compared on its item price,
// exactly like a store row, and cheapestEbayByCard() below marks it
// postageKnown: false so the page labels it "eBay + postage", never "delivered".
// That figure is a floor (the buyer pays item + something), so a listing with
// STATED postage wins whenever its delivered total is no higher — the trailing
// ("shippingCents" IS NULL) sends exact ties to the known one. Where the known
// total is higher we keep the cheaper item price, flagged, rather than invent a
// postage figure to compare with; the page copy says the row is ranked on its
// item price. (Same value shape, so no key bump: an entry built before this
// line only differs on exact ties, and rolls over with the day key.)
type EbayRow = { cardId: string; priceCents: number; shippingCents: number | null; url: string };

// ONE READ PER RENDER, whatever the data cache is doing (2026-09-26, "Pushing
// eBay clicks" in DECISIONS.md). Since the homepage's "Cheapest on eBay" row
// ranks from the same three day-cached inputs as the savings column beside it
// (minByCard, the eBay row pull, TCGplayer's rows), one render reads each of
// them twice. That was assumed free — the second read "finds the entry the
// first just wrote" — and review showed it is not in Next 14.2: a TAGGED
// unstable_cache read never matches the untagged in-memory copy the write
// leaves (FetchCache.get's hasMatchingTags), so it goes to the remote cache,
// and if the first read's un-awaited upload has not landed it gets a 404 and
// recomputes — the full-market groupBy and row pulls, again, on exactly the
// cold renders after an import purge. A stale entry does the same with two
// background recomputes.
//
// So each loader's promise is shared for a minute within this lambda: the
// second caller in a render gets the first caller's promise, hit or miss.
// Rule 2 of lib/db.ts (a globalThis TTL memo for big datasets) in its smallest
// form; the shared data cache underneath is untouched, and a failed read is
// dropped at once so the next caller retries. Only inside a Next render or
// request: scripts and tests have no data cache, and a test that stubs the
// database twice in a minute must get two reads.
const COALESCE_MS = 60_000;
const g = globalThis as unknown as { __rcArbCoalesce?: Map<string, { at: number; p: Promise<unknown> }> };
function coalesced<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!inNextRequest()) return load();
  const memo = (g.__rcArbCoalesce ??= new Map());
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.at < COALESCE_MS) return hit.p as Promise<T>;
  if (memo.size > 64) for (const [k, v] of memo) if (now - v.at >= COALESCE_MS) memo.delete(k);
  const p = load();
  memo.set(key, { at: now, p });
  p.catch(() => {
    if (memo.get(key)?.p === p) memo.delete(key);
  });
  return p;
}

function getEbayRowsMemoized(country: Country, ebayKey: string): Promise<EbayRow[]> {
  return coalesced(`ebay-rows|${country}|${ebayKey}|${sydneyDayKey()}`, () => cachedOrDirect(
    () =>
      prisma.$queryRaw<EbayRow[]>`
        SELECT DISTINCT ON ("cardId")
               "cardId", "priceCents", "shippingCents", "url"
        FROM "RetailerPrice"
        WHERE country = ${country} AND retailer = ${ebayKey} AND "inStock" = true
        ORDER BY "cardId", ("priceCents" + COALESCE("shippingCents", 0)) ASC, ("shippingCents" IS NULL) ASC
      `,
    ["arb-ebay-rows", country, ebayKey, sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  ));
}

export type EbayBest = { cents: number; url: string; postageKnown: boolean };

/**
 * Pure: the cheapest eBay listing per card, as the Best price column shows it —
 * item + stated postage when postage is known, item price alone (flagged) when
 * it is not. Cross-border markets (CA) always compare on the item price. On a
 * tie the listing whose postage is known wins, as in the SQL above.
 */
export function cheapestEbayByCard(country: Country, rows: readonly EbayRow[]): Map<string, EbayBest> {
  const cross = !!EBAY_CROSS_BORDER[country];
  const best = new Map<string, EbayBest>();
  for (const r of rows) {
    const postageKnown = !cross && r.shippingCents != null;
    const cents = r.priceCents + (postageKnown ? r.shippingCents! : 0);
    const prev = best.get(r.cardId);
    if (!prev || cents < prev.cents || (cents === prev.cents && postageKnown && !prev.postageKnown)) {
      best.set(r.cardId, { cents, url: r.url, postageKnown });
    }
  }
  return best;
}

// ── TCGplayer (the reference side) ───────────────────────────────────────────
// TCGplayer's US rows are market-neutral (one price per card regardless of the
// viewer's country), so this is a single global slot, not keyed by country.
//
// TWO PRICES PER CARD (2026-09-25). Since 2026-09-23 the US "tcgplayer" row is
// the cheapest English Near-Mint LISTING and the market price lives in its own
// reference row (lib/tcg-market-rows.ts). The ranking benchmarks against the
// MARKET price, but in the US it also needs the listing: without it a store at
// $8 was called "underpriced" against a $10 market while TCGplayer itself sold
// the card at $6.50. mergeTcgUsRows keeps both on one row per card.
//
// Documented invariant: ONE row per card per key — enforced with a `take`
// rather than only asserted in prose, so a data bug that broke it would truncate
// rather than silently balloon this cache entry. The merged row adds one int per
// card; ~1,500 cards is ~250-350 KB of JSON, well under the ~1.2 MB unstable_cache
// ceiling (tests/deal-finder-buyer-list.test.ts sizes a 3,000-card worst case).
// The key carries a -v2 because the cached VALUE's shape changed: the outer
// cachedOrDirect wrapper's source is identical across builds, so without it a
// pre-deploy entry could be served in the old shape.
export type TcgUsRow = {
  cardId: string;
  priceCents: number; // TCGplayer US MARKET price, USD cents
  url: string;
  lowCents: number | null; // TCGplayer's own cheapest listing, USD cents, when there is one
};

/** Pure: one row per card — market price (via preferMarketRows) plus the cheapest-listing price. */
export function mergeTcgUsRows(rows: readonly { cardId: string; priceCents: number; url: string; retailer: string }[]): TcgUsRow[] {
  const low = new Map<string, number>();
  for (const r of rows) {
    if (r.retailer !== TCG_US.retailer) continue;
    const prev = low.get(r.cardId);
    if (prev == null || r.priceCents < prev) low.set(r.cardId, r.priceCents);
  }
  const out = new Map<string, TcgUsRow>();
  for (const r of preferMarketRows(rows)) {
    out.set(r.cardId, { cardId: r.cardId, priceCents: r.priceCents, url: r.url, lowCents: low.get(r.cardId) ?? null });
  }
  return [...out.values()];
}

function getTcgUsRowsMemoized(): Promise<TcgUsRow[]> {
  return coalesced(`tcg-us-rows|${sydneyDayKey()}`, () => cachedOrDirect(
    async () =>
      mergeTcgUsRows(
        await prisma.retailerPrice.findMany({
          // Never a DERIVED row: buildTcgplayerRows clones the BASE card's
          // product into a promo with no TCGplayer match of its own, market
          // rows included, so a promo was scored against its base printing's
          // price (review, 2026-09-25). No own row → no reference, no deal.
          where: { retailer: { in: [...TCG_US_MARKET_READ_KEYS] }, country: "US", inStock: true, OR: [{ derived: null }, { derived: false }] },
          select: { cardId: true, priceCents: true, url: true, retailer: true },
          take: 10000, // ~3.5x the catalogue across both keys — see invariant above
        }),
      ),
    // -v3: the derived filter changes the cached value; a pre-deploy entry
    // would otherwise keep serving cloned promo rows until it expired.
    ["arb-tcg-us-rows-v3", sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  ));
}

/**
 * Pure: does buying at `buyCents` count as "cheaper than TCGplayer market"? The
 * figures the row shows, or null when it does not qualify. One predicate for the
 * cached ranking AND the live detail row, so a row whose store repriced since
 * the cache was built is re-checked against the same rules.
 *
 * In the US a row is dropped when TCGplayer's own cheapest listing is at or
 * below the buy price: sending a US buyer to a store TCGplayer already beats is
 * not a deal. Outside the US that listing is a US seller's price with
 * international postage behind it, so it is not a local option and is ignored.
 */
export function scoreVsTcg(
  country: Country,
  buyCents: number,
  marketCents: number,
  tcgLowUsdCents: number | null,
): { belowCents: number; belowPct: number } | null {
  if (buyCents < MIN_BUY_CENTS) return null;
  const belowCents = marketCents - buyCents;
  if (belowCents < MIN_BELOW_CENTS) return null;
  if (country === "US" && tcgLowUsdCents != null && tcgLowUsdCents <= buyCents) return null;
  const belowPct = belowTcgPct(buyCents, marketCents);
  if (belowPct == null || belowPct > MAX_BELOW_PCT) return null;
  return { belowCents, belowPct };
}

/** TCGplayer's market figures for one card, as the price-alert run reads them. */
export interface TcgMarketRef {
  marketCents: number; // TCGplayer US MARKET price, converted into the market's currency
  marketUsdCents: number; // the same figure before conversion
  lowUsdCents: number | null; // TCGplayer's own cheapest listing (US only matters — see scoreVsTcg)
}

/**
 * TCGplayer's market price for JUST these cards, read directly — for the
 * below-market price alert (lib/price-alerts.ts), which re-scores each watched
 * card's alert price with scoreVsTcg instead of trusting the day-cached Deal
 * Finder ranking (built on a different price set, eBay included, and possibly
 * from the previous import). Uncached on purpose and scoped: a handful of
 * candidate cards × the two TCG_US_MARKET_READ_KEYS rows each, four columns,
 * capped. Called once per market from the cron, never inside an unstable_cache
 * (src/lib/db.ts rule 6). Throws on a failed read; the caller decides.
 */
export async function tcgMarketFor(
  country: Country,
  cardIds: readonly string[],
  db: Pick<typeof prisma, "retailerPrice"> = prisma,
): Promise<Map<string, TcgMarketRef>> {
  const ids = [...new Set(cardIds)];
  const out = new Map<string, TcgMarketRef>();
  if (!ids.length) return out;
  const rows = await db.retailerPrice.findMany({
    // Never a DERIVED (cloned-from-the-base-card) row: a promo with only
    // cloned rows has no market reference, so the below-market trigger stays
    // off for it instead of quoting another product's price.
    where: {
      retailer: { in: [...TCG_US_MARKET_READ_KEYS] },
      country: "US",
      inStock: true,
      cardId: { in: ids },
      OR: [{ derived: null }, { derived: false }],
    },
    select: { cardId: true, priceCents: true, url: true, retailer: true },
    take: ids.length * 8, // ≤ 2 keys × foil/non-foil per card; generous
  });
  for (const r of mergeTcgUsRows(rows)) {
    out.set(r.cardId, { marketCents: usdCentsToCountry(r.priceCents, country), marketUsdCents: r.priceCents, lowUsdCents: r.lowCents });
  }
  return out;
}

// ── Sources ──────────────────────────────────────────────────────────────────
// "saving" = most below market (money); "pct" = biggest % below market. The
// pre-2026-09-25 URL values ("profit", "margin") are still accepted by the page.
export type ArbSort = "saving" | "pct";

export interface ArbSource {
  key: string;
  name: string;
  isEbay: boolean;
}

// TCGplayer retailer key per market. In the US it is the cheapest-listing row;
// in the UK and SG it is a CONVERTED MARKET REFERENCE (UK_/SG_FALLBACK_RETAILERS,
// "not a buyable store"). getArbSources only offers a key that is not a
// fallback/reference row, and the Deal Finder strips this key from its buy side
// either way (resolveTcgBuyKeys): TCGplayer is the thing every row is measured
// against, so it is never also the thing you are sent to buy from.
export const TCGPLAYER_KEY: Record<Country, string | null> = {
  AU: null,
  US: TCG_US.retailer,
  UK: TCGPLAYER_UK_RETAILER,
  SG: TCGPLAYER_SG_RETAILER,
  // tcgplayer_ca exists (refreshTcgplayerPrices writes it) but is a converted
  // reference like the UK/SG rows, so it would be filtered out anyway.
  CA: null,
  // The EU market has NO reference source at all — a licensing fact, not an
  // oversight. TCGplayer publishes no EUR market price, and Cardmarket is
  // feature-flagged OFF pending written permission to redisplay its data (read
  // the header of lib/cardmarket.ts before assuming this is a gap to fill).
  EU: null,
};

/**
 * Every selectable source for a market: its tracked stores, eBay, and TCGplayer
 * only where TCGplayer's row is a real listing (not a converted reference).
 */
export function getArbSources(country: Country): ArbSource[] {
  const stores = Object.values(RETAILERS)
    .filter((r) => (r.country ?? "AU") === country && !isFallbackRetailer(r.key))
    .map((r) => ({ key: r.key, name: r.name, isEbay: false }));
  const ek = EBAY_KEY[country];
  const sources: ArbSource[] = ek ? [{ key: ek, name: EBAY_CROSS_BORDER[country] ? "eBay US" : "eBay", isEbay: true }, ...stores] : stores;
  const tcgKey = TCGPLAYER_KEY[country];
  if (tcgKey && !isFallbackRetailer(tcgKey)) sources.push({ key: tcgKey, name: "TCGplayer", isEbay: false });
  return sources;
}

/** The sources the Deal Finder's "Buy from" picker offers: everything but TCGplayer itself. */
export function dealFinderSources(country: Country): ArbSource[] {
  const tcgKey = TCGPLAYER_KEY[country];
  return getArbSources(country).filter((s) => s.key !== tcgKey);
}

/**
 * Pure: a requested buy side, reduced to keys that are really buyable here —
 * known for this market, not TCGplayer (the reference side), never a converted
 * reference row. A URL can carry anything; this is what makes that safe.
 */
export function resolveTcgBuyKeys(country: Country, buy: readonly string[]): string[] {
  const valid = new Set(dealFinderSources(country).map((s) => s.key));
  return [...new Set(buy)].filter((k) => valid.has(k) && !isFallbackRetailer(k));
}

/**
 * The default BUY side of the Deal Finder: every store and eBay — never
 * TCGplayer itself, and never a cross-border eBay feed whose postage nobody has
 * quoted (CA). One definition for /tools/deal-finder, the homepage's Biggest
 * savings column and lib/premium-nudge.ts.
 */
export function defaultTcgBuyKeys(country: Country): string[] {
  const sources = dealFinderSources(country);
  const stores = sources.filter((s) => !s.isEbay).map((s) => s.key);
  const ebay = sources.find((s) => s.isEbay);
  return ebay && !EBAY_CROSS_BORDER[country] ? [...stores, ebay.key] : stores;
}

/**
 * Pure: a resolved buy side split into its store keys and its eBay key (null
 * when eBay is not on it). rankVsTcgplayer splits with this, and so does
 * getCheapestOnEbay (2026-09-26) for the default list's keys — so the homepage
 * row asks minByCard for exactly the store-key list the default Deal Finder
 * ranking does, and reads that same day-cached aggregate instead of a second.
 */
export function splitBuyKeys(country: Country, buyKeys: readonly string[]): { storeKeys: string[]; buyEbayKey: string | null } {
  const ebayKey = EBAY_KEY[country];
  const buyEbayKey = ebayKey && buyKeys.includes(ebayKey) ? ebayKey : null;
  return { storeKeys: buyKeys.filter((k) => k !== buyEbayKey), buyEbayKey };
}

/**
 * The default Deal Finder list's buy side, split: what the homepage "Cheapest
 * on eBay" row compares against (storeKeys) and the eBay feed it ranks
 * (buyEbayKey — null in Canada, whose eBay rows are off the default list).
 */
export function defaultBuySplit(country: Country): { storeKeys: string[]; buyEbayKey: string | null } {
  return splitBuyKeys(country, resolveTcgBuyKeys(country, defaultTcgBuyKeys(country)));
}

// ── Ranking ──────────────────────────────────────────────────────────────────
export interface ArbItem {
  card: CardTileData; // full tile data so the row can open the QuickView popup
  buyCents: number; // Best price: a store's item price, or an eBay listing (+ stated postage when known)
  buyStore: string; // retailer key of that listing (click-tracking + labelling)
  buyStoreName: string;
  buyUrl: string;
  postageIncluded: boolean; // true only for an eBay row whose postage is known and included
  marketCents: number; // TCGplayer US market price, converted into the market's currency
  marketUrl: string;
  tcgLowCents: number | null; // US only: TCGplayer's own cheapest listing, for context
  belowCents: number; // marketCents − buyCents
  belowPct: number; // belowTcgPct(buyCents, marketCents)
}

export interface ArbPage {
  items: ArbItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  // Sum of belowCents across EVERY qualifying row, not just this page's slice:
  // the homepage feed and the Premium proof line quote "$X on the board" for
  // the WHOLE board, and deriving it from a paged slice would understate it by
  // an order of magnitude. Optional; read it with `?? 0`.
  savingsTotalCents?: number;
}

// The ranking aggregate below is a full-market groupBy (~1,400 rows), shared-
// cached like the row pulls above: day-keyed, CONTENT_TAG-busted on import (the
// only time RetailerPrice changes). The cached value is the plain groupBy row
// array — a Map would JSON-serialise to {} on the way into the data cache — and
// the Map is rebuilt on the way out. The retailer-key list is part of the key
// because the caller's source selection changes the aggregate.
async function minByCard(country: Country, keys: string[]) {
  if (!keys.length) return new Map<string, number>();
  const keyList = [...keys].sort().join("|");
  const rows = await coalesced(`min-by-card|${country}|${keyList}|${sydneyDayKey()}`, () =>
    cachedOrDirect(
      () =>
        prisma.retailerPrice.groupBy({
          by: ["cardId"],
          where: { country, inStock: true, retailer: { in: keys } },
          _min: { priceCents: true },
        }),
      ["arb-min-by-card", country, keyList, sydneyDayKey()],
      { revalidate: 172800, tags: [CONTENT_TAG] },
    ),
  );
  return new Map(rows.filter((r) => r._min.priceCents != null).map((r) => [r.cardId, r._min.priceCents!]));
}

// THE "CHEAPER THAN TCGPLAYER MARKET" RANKING, on its own (2026-09-23). Split out
// of getArbitrageVsTcgplayer so the page, lib/premium-nudge.ts and the alert
// cron rank from ONE definition — a nudge that says "3 of your cards are in Deal
// Finder" must count exactly the rows Deal Finder would show. Reads only the
// day-cached aggregates above; no detail query, so ranking the whole set costs
// no extra database read.
//
// eBay is ranked by DELIVERED cost where the seller stated postage (a cheap item
// hiding expensive postage would otherwise look like a bigger gap than it is),
// and by item price where they did not — flagged, and labelled "eBay + postage".
// Stores stay item-price-only: their postage is usually unknown until checkout,
// and we never fabricate a number for it.
type TcgRankRow = { cardId: string; buy: number; buyIsEbay: boolean; market: number; low: number | null; below: number; pct: number };
async function rankVsTcgplayer(country: Country, buyKeys: string[], sort: ArbSort) {
  const { storeKeys, buyEbayKey } = splitBuyKeys(country, buyKeys);

  const [storeMin, ebayRows, tcgRows] = await Promise.all([
    minByCard(country, storeKeys),
    buyEbayKey ? getEbayRowsMemoized(country, buyEbayKey) : Promise.resolve([]),
    getTcgUsRowsMemoized(),
  ]);
  const tcgByCard = new Map(tcgRows.map((r) => [r.cardId, r]));
  const ebayBest = cheapestEbayByCard(country, ebayRows);

  const rows: TcgRankRow[] = [];
  const cardIds = new Set([...storeMin.keys(), ...ebayBest.keys()]);
  for (const cardId of cardIds) {
    const storeBuy = storeMin.get(cardId);
    const ebayBuy = ebayBest.get(cardId)?.cents;
    let buy: number;
    let buyIsEbay: boolean;
    if (storeBuy != null && (ebayBuy == null || storeBuy <= ebayBuy)) {
      buy = storeBuy;
      buyIsEbay = false;
    } else if (ebayBuy != null) {
      buy = ebayBuy;
      buyIsEbay = true;
    } else {
      continue;
    }
    const tcg = tcgByCard.get(cardId);
    if (!tcg) continue;
    const market = usdCentsToCountry(tcg.priceCents, country);
    const score = scoreVsTcg(country, buy, market, tcg.lowCents);
    if (!score) continue;
    rows.push({ cardId, buy, buyIsEbay, market, low: tcg.lowCents, below: score.belowCents, pct: score.belowPct });
  }
  rows.sort((a, b) => (sort === "pct" ? b.pct - a.pct || b.below - a.below : b.below - a.below || b.pct - a.pct));

  return { rows, storeKeys, buyEbayKey, ebayBest, tcgByCard };
}

/**
 * Pure: the page a caller asked for, AFTER the optional "only my cards" filter —
 * so total, pageCount and the board's savings total describe the list the
 * reader is actually looking at, and page 2 of "My watchlist" is the 26th-50th
 * watched deal rather than whichever watched cards happen to fall on page 2 of
 * the global list.
 */
export function pageRanked<T extends { cardId: string; below: number }>(
  rows: readonly T[],
  opts: { page: number; pageSize: number; onlyCardIds?: ReadonlySet<string> },
): { slice: T[]; total: number; page: number; pageCount: number; savingsTotalCents: number } {
  const only = opts.onlyCardIds;
  const filtered = only ? rows.filter((r) => only.has(r.cardId)) : rows;
  const total = filtered.length;
  const savingsTotalCents = filtered.reduce((sum, r) => sum + r.below, 0);
  const pageCount = Math.max(1, Math.ceil(total / opts.pageSize));
  const page = Math.min(Math.max(1, opts.page), pageCount);
  return { slice: filtered.slice((page - 1) * opts.pageSize, page * opts.pageSize), total, page, pageCount, savingsTotalCents };
}

/**
 * Card id → 1-based rank in the Deal Finder's default list (most below market
 * first), for the given buy sources. Empty map on any error. Called directly —
 * never inside another unstable_cache (src/lib/db.ts rule 6).
 */
export async function getTcgDealRanks(country: Country, buyKeys: string[]): Promise<Map<string, number>> {
  try {
    const keys = resolveTcgBuyKeys(country, buyKeys);
    if (!keys.length) return new Map();
    const { rows } = await rankVsTcgplayer(country, keys, "saving");
    return new Map(rows.map((r, i) => [r.cardId, i + 1]));
  } catch {
    return new Map();
  }
}

// ── The Deal Finder list ─────────────────────────────────────────────────────
// Cards cheaper than TCGplayer's US MARKET price (the sales-based figure it
// headlines — see lib/tcgplayer.ts), converted from USD into the viewer's
// currency via the shared fx table. A REFERENCE comparison: TCGplayer market is
// not a price anyone can check out at, so there is no fee to net off and no
// "sell" side — the row answers "is this cheap", not "can I flip it".
//
// `onlyCardIds` ("Only my cards", Plus): the caller's own watched or binder card
// ids, from lib/premium-nudge.ts getUserCardIds. Applied in memory to the
// already-ranked rows BEFORE paging (pageRanked); the cache keys and the
// ≤pageSize detail lookup are unchanged, so it costs no extra shared read.
export async function getArbitrageVsTcgplayer(
  country: Country,
  opts: { buy: string[]; sort: ArbSort; page?: number; pageSize?: number; onlyCardIds?: ReadonlySet<string> },
): Promise<ArbPage> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  try {
    // resolveTcgBuyKeys strips TCGplayer's own key and any converted reference
    // row, so a URL like ?buy=tcgplayer_uk can never put a price nobody can
    // check out at on the buy side.
    const buyKeys = resolveTcgBuyKeys(country, opts.buy);
    if (!buyKeys.length) return { items: [], total: 0, page, pageSize, pageCount: 1, savingsTotalCents: 0 };

    const { rows, storeKeys, buyEbayKey, ebayBest, tcgByCard } = await rankVsTcgplayer(country, buyKeys, opts.sort);
    const { slice, total, page: p, pageCount, savingsTotalCents } = pageRanked(rows, { page, pageSize, onlyCardIds: opts.onlyCardIds });
    if (!slice.length) return { items: [], total, page: p, pageSize, pageCount, savingsTotalCents };

    const ids = slice.map((r) => r.cardId);
    const storeWinnerIds = slice.filter((r) => !r.buyIsEbay).map((r) => r.cardId);
    const [cards, storeListings] = await Promise.all([
      prisma.card.findMany({ where: { id: { in: ids } }, select: cardTileSelect(country) }),
      storeWinnerIds.length
        ? prisma.retailerPrice.findMany({
            where: { cardId: { in: storeWinnerIds }, country, inStock: true, retailer: { in: storeKeys } },
            select: { cardId: true, retailer: true, retailerName: true, priceCents: true, url: true },
            orderBy: { priceCents: "asc" },
          })
        : Promise.resolve([]),
    ]);
    const cardMap = new Map(cards.map((c) => [c.id, c as unknown as CardTileData]));
    const bestStore = new Map<string, (typeof storeListings)[number]>();
    for (const l of storeListings) if (!bestStore.has(l.cardId)) bestStore.set(l.cardId, l);

    // Every link built here renders on /tools/deal-finder (the homepage's
    // Biggest savings column links to card pages, not to these URLs), so each
    // carries that page as its `loc` (2026-09-26): EPN's customid and Impact's
    // sharedid then name the Deal Finder instead of the "-home" default every
    // one of these clicks used to report under.
    const items = slice
      .map((r): ArbItem | null => {
        const c = cardMap.get(r.cardId);
        const tcg = tcgByCard.get(r.cardId);
        if (!c || !tcg) return null;
        const marketUrl = affiliateUrl(tcg.url, TCG_US.retailer, DEAL_FINDER_PATH);
        const tcgLowCents = country === "US" ? r.low : null;
        if (r.buyIsEbay) {
          // The cached eBay row carries its own price AND its own URL, so the
          // figure and the link always describe the same listing.
          const e = ebayBest.get(r.cardId);
          if (!e || !buyEbayKey) return null;
          return {
            card: c,
            buyCents: e.cents, buyStore: buyEbayKey, buyStoreName: ebayBuyLabel(country, e.postageKnown),
            buyUrl: affiliateUrl(e.url, buyEbayKey, DEAL_FINDER_PATH), postageIncluded: e.postageKnown,
            marketCents: r.market, marketUrl, tcgLowCents, belowCents: r.below, belowPct: r.pct,
          };
        }
        // A store row's price is the LIVE listing's own price, next to that
        // listing's own name and link. The ranking came from the day-cached
        // aggregate; if the store has repriced or sold out since, this is a
        // different number (or a different store), so it is re-scored with the
        // same rules and dropped if it no longer qualifies — never a cached
        // price shown beside another store's link.
        const b = bestStore.get(r.cardId);
        if (!b) return null;
        const live = scoreVsTcg(country, b.priceCents, r.market, r.low);
        if (!live) return null;
        return {
          card: c,
          buyCents: b.priceCents, buyStore: b.retailer, buyStoreName: b.retailerName,
          buyUrl: affiliateUrl(b.url, b.retailer, DEAL_FINDER_PATH), postageIncluded: false,
          marketCents: r.market, marketUrl, tcgLowCents, belowCents: live.belowCents, belowPct: live.belowPct,
        };
      })
      .filter((x): x is ArbItem => x !== null);

    return { items, total, page: p, pageSize, pageCount, savingsTotalCents };
  } catch {
    return { items: [], total: 0, page, pageSize, pageCount: 1, savingsTotalCents: 0 };
  }
}

/**
 * When this market's prices were last seen — the newest in-stock lastSeen —
 * for the page's "Prices as of …" line. One aggregate row per market per day,
 * shared-cached and busted on import like everything above, so it reads the
 * import time without a per-request query. ISO string (JSON-safe), or null.
 */
export async function getPricesAsOf(country: Country): Promise<string | null> {
  try {
    return await cachedOrDirect(
      async () => {
        const r = await prisma.retailerPrice.aggregate({ where: { country, inStock: true }, _max: { lastSeen: true } });
        return r._max.lastSeen ? new Date(r._max.lastSeen).toISOString() : null;
      },
      ["arb-prices-as-of", country, sydneyDayKey()],
      { revalidate: 172800, tags: [CONTENT_TAG] },
    );
  } catch {
    return null;
  }
}

// ── Cheapest on eBay (the homepage row) ──────────────────────────────────────
// Cards whose cheapest eBay listing in the visitor's market costs less than any
// store we track there (2026-09-26, "Pushing eBay clicks" in DECISIONS.md). The
// owner built the site's first deal feature as "cheapest on eBay"; it left the
// homepage on 2026-09-21 when Biggest savings switched to the TCGplayer
// benchmark, and comes back as its own FREE row because every click on it is an
// eBay affiliate click — the site's main revenue — on a listing that really is
// the cheapest tracked copy.
//
// Honest by construction, because nothing here is re-ranked or softened:
//  - a row exists only where eBay is genuinely cheaper, so no comparison anywhere
//    is reordered to favour eBay;
//  - eBay's figure is the Deal Finder's own (cheapestEbayByCard): item + stated
//    postage when the seller stated it, the item price alone otherwise, and the
//    row says which ("delivered" / "+ postage");
//  - the store side is the cheapest in-stock item price across exactly the
//    default Deal Finder list's stores. In the US it is the cheaper of that and
//    TCGplayer's own cheapest listing, which is a buyable row there: a card
//    TCGplayer sells for no more than the eBay copy is not "cheapest on eBay",
//    and the gap shown is never wider than what a US buyer would really save;
//  - Canada is skipped: its eBay rows are US listings with international
//    postage nobody has quoted, so "costs less" could not be claimed.
//
// Guards: an eBay cost of at least 100 minor units (bulk commons are noise), at
// least 50 below the cheapest alternative, and a gap under 80% of that
// alternative — a copy at a fifth of every store's price is almost always a
// mismatched listing (a proxy, a different printing), not a bargain. Ranked by
// the money gap.
//
// EGRESS: the ranking reads only the three day-cached pulls the default list
// already reads — minByCard with the SAME store-key list (defaultBuySplit), the
// same eBay row pull, and in the US the same TCGplayer rows — so it adds no
// Neon read; then ONE detail query for at most `limit` cards. Self-cached
// through those inputs: never wrap it in cachedOrDirect / unstable_cache, and
// never call it from inside one (src/lib/db.ts rule 6, tests/nested-cache.test.ts).
const CHEAPEST_EBAY_MIN_CENTS = 100;
const CHEAPEST_EBAY_MIN_GAP_CENTS = 50;
const CHEAPEST_EBAY_MAX_GAP_PCT = 80;

export interface CheapestEbayRanked {
  cardId: string;
  ebayCents: number; // the eBay listing: item + stated postage, or the item price alone
  postageKnown: boolean;
  url: string; // the listing's own URL, untagged — the caller tags it with its page
  storeCents: number; // the cheapest tracked alternative (see the header above)
  gapCents: number; // storeCents − ebayCents
}

/**
 * Pure: the "Cheapest on eBay" ranking from the three cached inputs — the
 * cheapest store item price per card, the cheapest eBay listing per card
 * (cheapestEbayByCard) and TCGplayer's US rows (only read in the US; pass []
 * elsewhere). Money gap first, then the bigger share of the store price.
 */
export function rankCheapestOnEbay(
  country: Country,
  storeMin: ReadonlyMap<string, number>,
  ebayBest: ReadonlyMap<string, EbayBest>,
  tcgRows: readonly TcgUsRow[],
): CheapestEbayRanked[] {
  if (EBAY_CROSS_BORDER[country] || !EBAY_KEY[country]) return [];
  // TCGplayer's cheapest listing is a buyable row only in the US; elsewhere it
  // is a US seller's price with international postage behind it (scoreVsTcg).
  const tcgLow = new Map<string, number>();
  if (country === "US") for (const r of tcgRows) if (r.lowCents != null) tcgLow.set(r.cardId, r.lowCents);
  const out: CheapestEbayRanked[] = [];
  for (const [cardId, e] of ebayBest) {
    const store = storeMin.get(cardId);
    if (store == null) continue; // no tracked store to be cheaper than
    if (e.cents < CHEAPEST_EBAY_MIN_CENTS) continue;
    const low = tcgLow.get(cardId);
    if (low != null && low <= e.cents) continue; // TCGplayer sells it for no more
    const alt = low != null ? Math.min(store, low) : store;
    const gap = alt - e.cents;
    if (gap < CHEAPEST_EBAY_MIN_GAP_CENTS) continue;
    if (gap * 100 >= alt * CHEAPEST_EBAY_MAX_GAP_PCT) continue;
    out.push({ cardId, ebayCents: e.cents, postageKnown: e.postageKnown, url: e.url, storeCents: alt, gapCents: gap });
  }
  out.sort(
    (a, b) =>
      b.gapCents - a.gapCents ||
      b.gapCents / b.storeCents - a.gapCents / a.storeCents ||
      (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0),
  );
  return out;
}

// The narrow card read behind the row: what it renders, nothing more (no
// cardTileSelect — no price columns, no per-row _count subquery).
const CHEAPEST_EBAY_CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  setCode: true,
  collectorNumber: true,
  imageThumbUrl: true,
} as const;

export type CheapestEbayCard = { id: string; slug: string | null; name: string; setCode: string; collectorNumber: string; imageThumbUrl: string | null };
export type CheapestOnEbayItem = CheapestEbayRanked & { card: CheapestEbayCard; ebayKey: string };

// Buyable sources the card page RANKS that are not RETAILERS entries, so they
// are not on the Deal Finder's store list (2026-09-26, review of "Pushing eBay
// clicks"). The row says an eBay listing "costs less than any store we track",
// and the card it links to must agree: in the EU that page ranks CardTrader —
// the market's main in-stock source (lib/cardtrader.ts, country "EU" only) —
// beside the Shopify stores, so eBay has to beat it too. One more day-cached
// aggregate for the EU, a small one (CardTrader's rows only); the Deal
// Finder's own store-list entry is left exactly as it was. The US's buyable
// non-store row, TCGplayer's cheapest listing, is handled in the ranking.
const RANKED_NON_STORE_SOURCES: Partial<Record<Country, string[]>> = { EU: [CARDTRADER_RETAILER] };

/** Pure: the per-card minimum across two minimum maps. */
export function mergeMin(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map(a);
  for (const [k, v] of b) {
    const cur = out.get(k);
    if (cur == null || v < cur) out.set(k, v);
  }
  return out;
}

/**
 * The homepage "Cheapest on eBay" row for one market: at most `limit` cards,
 * [] for Canada, for a market with no eBay feed, or on any error. Called
 * directly by lib/top-deals.ts — see the section header for why it is never
 * wrapped in a cache.
 */
export async function getCheapestOnEbay(country: Country, limit = 4): Promise<CheapestOnEbayItem[]> {
  try {
    if (EBAY_CROSS_BORDER[country]) return [];
    const { storeKeys, buyEbayKey } = defaultBuySplit(country);
    if (!buyEbayKey || !storeKeys.length) return [];
    const extraKeys = RANKED_NON_STORE_SOURCES[country] ?? [];
    const [storeMin, extraMin, ebayRows, tcgRows] = await Promise.all([
      minByCard(country, storeKeys),
      minByCard(country, extraKeys),
      getEbayRowsMemoized(country, buyEbayKey),
      country === "US" ? getTcgUsRowsMemoized() : Promise.resolve<TcgUsRow[]>([]),
    ]);
    const ranked = rankCheapestOnEbay(country, mergeMin(storeMin, extraMin), cheapestEbayByCard(country, ebayRows), tcgRows).slice(0, Math.max(0, limit));
    if (!ranked.length) return [];
    const cards = await prisma.card.findMany({
      where: { id: { in: ranked.map((r) => r.cardId) } },
      select: CHEAPEST_EBAY_CARD_SELECT,
    });
    const byId = new Map<string, CheapestEbayCard>(cards.map((c) => [c.id, c]));
    return ranked.flatMap((r) => {
      const card = byId.get(r.cardId);
      return card ? [{ ...r, card, ebayKey: buyEbayKey }] : [];
    });
  } catch {
    return [];
  }
}

// ── Cross-region price gaps ──────────────────────────────────────────────────
// Where the SAME card is priced meaningfully cheaper in another tracked market
// than the viewer's own. Read by the free /market/records board only since
// 2026-09-25 (the Deal Finder's Cross-region tab was cut; the board ranks the
// same rows by money and links to stores, which the tab never did).
// Deliberately INFORMATIONAL — acting on it means actually
// shipping cross-border, and this models none of that (international postage
// cost/time, customs, and whether the away market's stores will even ship
// overseas are all real, unmodelled costs; see the disclaimer in the page
// copy). Reuses the per-country lowestPriceCents* columns already sitting on
// every Card row, so unlike the Deal Finder ranking above this needs no
// RetailerPrice scan — one narrow Card query, one in-memory pass.
export interface CrossRegionGap {
  card: CardTileData;
  homeCents: number;
  homeCurrency: string;
  homeCountry: Country;
  awayCountry: Country;
  awayCurrency: string; // the away market's OWN currency
  awayCentsNative: number; // in awayCurrency — what it's actually listed at
  awayCentsConverted: number; // converted into homeCurrency, for the gap math
  gapPct: number;
}

export interface CrossRegionPage {
  items: CrossRegionGap[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const XREGION_MIN_HOME_CENTS = 300; // same floor as MIN_BUY_CENTS — ignore near-zero prices
const XREGION_MIN_GAP_PCT = 20; // has to be a meaningful gap to be worth surfacing at all
const XREGION_MAX_GAP_PCT = 300; // same outlier-guard reasoning as MAX_BELOW_PCT — a huge gap is
// almost always a converted reference price or a thin/stale market, not a real 300%+ difference.

type XRegionRow = { card: CardTileData; homeCents: number; away: Country; awayNative: number; awayConverted: number; pct: number };
// Day-cached in the SHARED Next data cache, not a per-instance globalThis memo.
// This read had no bound at all originally — a plain card.findMany with no take,
// pulling the WHOLE catalogue (cardTileSelect, two image URLs/row, ~1,000-1,500
// cards) on every request to the force-dynamic Deal Finder cross-region tab (cut
// 2026-09-25) and /market/records. cachedOrDirect collapses it to one pull per home market per
// day (CONTENT_TAG busts it on import), shared across all lambda instances.
//
// TWO PASSES, NOT ONE (2026-09-14, DECISIONS.md "Find the fifth burn before
// RM10 dies"). Ranking every card needs only its six lowestPriceCents* columns
// (pickPrice reads nothing else) — but this used to fetch the FULL cardTileSelect
// width (two image URLs, name/slug/set text, a per-row _count subquery) for
// every one of ~1,400 cards just to throw most of them away in the loop below.
// Only the cards that actually clear XREGION_MIN_GAP_PCT — typically a small
// fraction — need the full display payload. Splitting into a narrow SCORING
// pass + a display pass scoped to just the winners cuts the egress of this
// (already once-a-day, shared) compute without changing a single result.
function computeCrossRegionRows(homeCountry: Country): Promise<XRegionRow[]> {
  return cachedOrDirect(async () => {
  const homeCurrency = currencyOf(homeCountry);
  const priceRows = await prisma.card.findMany({
    where: { variant: null, isPromo: false },
    select: {
      id: true,
      lowestPriceCents: true,
      lowestPriceCentsUs: true,
      lowestPriceCentsUk: true,
      lowestPriceCentsSg: true,
      lowestPriceCentsCa: true,
      lowestPriceCentsEu: true,
    },
  });

  type Ranked = { id: string; homeCents: number; away: Country; awayNative: number; awayConverted: number; pct: number };
  const ranked: Ranked[] = [];
  for (const c of priceRows) {
    const homeCents = pickPrice(c, homeCountry);
    if (homeCents == null || homeCents < XREGION_MIN_HOME_CENTS) continue;

    let best: { native: number; converted: number; country: Country; pct: number } | null = null;
    for (const info of COUNTRY_LIST) {
      if (info.code === homeCountry) continue;
      const awayNative = pickPrice(c, info.code);
      if (awayNative == null) continue;
      const awayConverted = convertCents(awayNative, info.currency, homeCurrency);
      if (awayConverted >= homeCents) continue;
      const pct = Math.round(((homeCents - awayConverted) / homeCents) * 1000) / 10;
      if (pct < XREGION_MIN_GAP_PCT || pct > XREGION_MAX_GAP_PCT) continue;
      if (!best || pct > best.pct) best = { native: awayNative, converted: awayConverted, country: info.code, pct };
    }
    if (!best) continue;
    ranked.push({ id: c.id, homeCents, away: best.country, awayNative: best.native, awayConverted: best.converted, pct: best.pct });
  }
  if (!ranked.length) return [];

  // DISPLAY PASS: full tile data only for the cards that actually qualified.
  const cards = await prisma.card.findMany({
    where: { id: { in: ranked.map((r) => r.id) } },
    select: cardTileSelect(homeCountry),
  });
  const cardById = new Map((cards as unknown as CardTileData[]).map((c) => [c.id, c]));

  const rows: XRegionRow[] = [];
  for (const r of ranked) {
    const card = cardById.get(r.id);
    if (!card) continue; // defensive — the id came from the same table a moment ago
    rows.push({ card, homeCents: r.homeCents, away: r.away, awayNative: r.awayNative, awayConverted: r.awayConverted, pct: r.pct });
  }
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
  }, ["arb-xregion-rows", homeCountry, sydneyDayKey()], { revalidate: 172800, tags: [CONTENT_TAG] });
}

export async function getCrossRegionGaps(homeCountry: Country, page = 1, pageSize = 25): Promise<CrossRegionPage> {
  try {
    const homeCurrency = currencyOf(homeCountry);
    const rows = await computeCrossRegionRows(homeCountry);

    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, page), pageCount);
    const slice = rows.slice((p - 1) * pageSize, p * pageSize);

    return {
      items: slice.map((r) => ({
        card: r.card,
        homeCents: r.homeCents,
        homeCurrency,
        homeCountry,
        awayCountry: r.away,
        awayCurrency: currencyOf(r.away),
        awayCentsNative: r.awayNative,
        awayCentsConverted: r.awayConverted,
        gapPct: r.pct,
      })),
      total,
      page: p,
      pageSize,
      pageCount,
    };
  } catch {
    return { items: [], total: 0, page, pageSize, pageCount: 1 };
  }
}
