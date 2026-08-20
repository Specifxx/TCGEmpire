// Whole-catalog summary for the public /api/v1/cards.json route — the one new
// query shape the public API needed that no existing helper quite provided.
//
// Modeled directly on computePriceMovers's bulk-read in price-history.ts (same
// table, same window-bounded query, same day-cache): read PriceHistory once for
// every card in the window, group by card, derive stats in memory. Returns
// COMPUTED STATS per card (latest + a few deltas + high/low), not raw daily
// points — same reason computePriceMovers does: a raw dump for ~1000+ cards is
// exactly the per-request unbounded-table read db.ts's egress guard exists to
// catch, where a handful of numbers per card is not.
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "./country";
import { CONTENT_TAG } from "./revalidate-content";
import { cachedOrDirect, sydneyDayKey } from "./price-history";
import { cardHref } from "./card-url";
import { affiliateUrl } from "./affiliate";
import { effectiveShippingCents, shippingPolicyUrl } from "./retailers";
import { computeMarket, type MarketRow } from "./market-rows";
import { SITE_URL } from "./site";

export interface BulkCardEntry {
  externalId: string | null;
  slug: string | null;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  domain: string;
  type: string;
  /** Latest lowest live in-stock price, in the requested market's currency. */
  priceCents: number;
  /** Nearest available point to N days ago. null when the window doesn't reach that far. */
  d1Cents: number | null;
  d7Cents: number | null;
  d30Cents: number | null;
  highCents: number;
  lowCents: number;
}

type Point = { t: number; v: number };

// 32, not 30: two days of slack so "30 days ago" always has a real point on
// or before its target even when the importer missed a day.
const SUMMARY_WINDOW_DAYS = 32;
// Below this, don't report a 30-day delta at all — a card whose set released
// 4 days ago has no real month-ago price, and "nearest available" would silently
// answer with day-4 data mislabeled as day-30.
const MIN_SPAN_FOR_D30_MS = 25 * 86400_000;

function nearest(points: Point[], targetT: number): number {
  let best = points[0];
  for (const p of points) {
    if (Math.abs(p.t - targetT) < Math.abs(best.t - targetT)) best = p;
  }
  return best.v;
}

async function computeBulkCardSummary(country: Country): Promise<BulkCardEntry[]> {
  const cutoff = new Date(Date.now() - SUMMARY_WINDOW_DAYS * 86400_000);
  const rows = await dbHistory.priceHistory.findMany({
    where: { country, day: { gte: cutoff } },
    orderBy: { day: "asc" },
    select: { cardId: true, day: true, lowestPriceCents: true },
  });
  if (!rows.length) return [];

  const series = new Map<string, Point[]>();
  for (const r of rows) {
    const arr = series.get(r.cardId) ?? [];
    arr.push({ t: r.day.getTime(), v: r.lowestPriceCents });
    series.set(r.cardId, arr);
  }

  const cards = await prisma.card.findMany({
    where: { id: { in: Array.from(series.keys()) } },
    select: {
      id: true, externalId: true, slug: true, name: true,
      setCode: true, setName: true, collectorNumber: true,
      rarity: true, domain: true, type: true,
    },
  });

  const out: BulkCardEntry[] = [];
  for (const c of cards) {
    const pts = series.get(c.id);
    if (!pts || !pts.length) continue;

    const last = pts[pts.length - 1];
    let hi = pts[0].v;
    let lo = pts[0].v;
    for (const p of pts) {
      if (p.v > hi) hi = p.v;
      if (p.v < lo) lo = p.v;
    }
    const spanMs = last.t - pts[0].t;

    out.push({
      externalId: c.externalId,
      slug: c.slug,
      name: c.name,
      setCode: c.setCode,
      setName: c.setName,
      collectorNumber: c.collectorNumber,
      rarity: c.rarity,
      domain: c.domain,
      type: c.type,
      priceCents: last.v,
      d1Cents: nearest(pts, last.t - 1 * 86400_000),
      d7Cents: nearest(pts, last.t - 7 * 86400_000),
      d30Cents: spanMs >= MIN_SPAN_FOR_D30_MS ? nearest(pts, last.t - 30 * 86400_000) : null,
      highCents: hi,
      lowCents: lo,
    });
  }
  return out;
}

// Day-scoped cache, same convention as getPriceMovers/getRecentlyUpdated: one
// whole-market read per market per day, shared across every caller (here, just
// the public API route, but keeping the same pattern costs nothing and means a
// second internal consumer could reuse it for free later).
export function getBulkCardSummary(country: Country = DEFAULT_COUNTRY): Promise<BulkCardEntry[]> {
  return cachedOrDirect(
    () => computeBulkCardSummary(country),
    ["rc-public-api-cards", country, sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  );
}

const cardWhereParam = (p: string) => ({ OR: [{ slug: p }, { id: p }] });

// Shared by /api/v1/card/[id]/prices.json and the MCP get_card_prices tool —
// one query, one response shape, so the two surfaces can't drift apart.
export async function getCardPricesData(idOrSlug: string) {
  const card = await prisma.card
    .findFirst({
      where: cardWhereParam(idOrSlug),
      select: {
        id: true, slug: true, name: true, setName: true, setCode: true, collectorNumber: true, imageUrl: true,
        lowestPriceCents: true, lowestPriceCentsUs: true,
        lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true,
        lowestPriceCentsDe: true,
      },
    })
    .catch(() => null);
  if (!card) return null;

  return {
    card: {
      name: card.name,
      set: card.setName,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      url: `${SITE_URL}${cardHref(card)}`,
      image: card.imageUrl,
    },
    prices: {
      AU: { lowestCents: card.lowestPriceCents, currency: "AUD" },
      US: { lowestCents: card.lowestPriceCentsUs, currency: "USD" },
      UK: { lowestCents: card.lowestPriceCentsUk, currency: "GBP" },
      SG: { lowestCents: card.lowestPriceCentsSg, currency: "SGD" },
      CA: { lowestCents: card.lowestPriceCentsCa, currency: "CAD" },
      DE: { lowestCents: card.lowestPriceCentsDe, currency: "EUR" },
    },
    note: "Prices are the lowest live in-stock listing per market, in integer cents. null = no tracked in-stock listing.",
    source: `${SITE_URL}${cardHref(card)}`,
    generatedAt: new Date().toISOString(),
  };
}

// Shared by /api/v1/card/[id]/listings.json and the MCP cheapest_listing tool —
// the full per-store comparison table, cheapest total delivered cost first. Same
// query + enrichment (affiliateUrl, shippingPolicyUrl, effectiveShippingCents)
// and the pure computeMarket() ranking the card page itself renders from.
export async function getCardListingsData(idOrSlug: string, market: Country = DEFAULT_COUNTRY) {
  const card = await prisma.card
    .findFirst({
      where: cardWhereParam(idOrSlug),
      select: {
        id: true, slug: true, name: true,
        retailerPrices: {
          orderBy: { priceCents: "asc" },
          select: {
            id: true, country: true, retailer: true, retailerName: true, priceCents: true,
            shippingCents: true, condition: true, isFoil: true, inStock: true, lastSeen: true, url: true,
          },
        },
      },
    })
    .catch(() => null);
  if (!card) return null;

  const pageUrl = `${SITE_URL}${cardHref(card)}`;
  const rows: MarketRow[] = card.retailerPrices.map((p) => ({
    id: p.id,
    country: p.country,
    retailer: p.retailer,
    retailerName: p.retailerName,
    priceCents: p.priceCents,
    ship: effectiveShippingCents(p.shippingCents),
    condition: p.condition,
    isFoil: p.isFoil,
    inStock: p.inStock,
    lastSeen: p.lastSeen.toISOString(),
    buyHref: affiliateUrl(p.url, p.retailer, pageUrl),
    policyUrl: shippingPolicyUrl(p.retailer),
  }));
  const view = computeMarket(rows, market);

  return {
    name: card.name,
    market,
    currency: COUNTRIES[market].currency,
    storeCount: view.storeCount,
    hasEbay: view.hasEbay,
    // Each row already carries `delivered` (priceCents + ship) — see ComputedRow
    // in market-rows.ts — so this is a direct pass-through, not a re-derivation.
    listings: view.prices,
    outOfStock: view.outOfStock,
    source: pageUrl,
    generatedAt: new Date().toISOString(),
  };
}
