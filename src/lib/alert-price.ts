import type { prisma } from "./db";
import { ALL_FALLBACK_RETAILERS } from "./constants";
import { alertConditionRank } from "./condition";

// ─────────────────────────────────────────────────────────────────────────────
// THE ALERT PRICE — what a price alert compares, and the stores it names.
// ─────────────────────────────────────────────────────────────────────────────
// Until 2026-09-25 every trigger read Card.lowestPriceCents*: the minimum over
// every in-stock non-reference row, which includes eBay (ebay_ca's FX-converted
// US listings too), played and damaged store copies, stale rows from a store
// whose feed is failing, TCGplayer's market aggregate written as a listing and
// promo rows cloned from the base card. Each of those fired real emails
// (DECISIONS.md, "Price alerts fire on the price you would pay").
//
// The alert price is narrower, by construction:
//   • a real store, CardTrader, or TCGplayer US's cheapest-listing row — never
//     an eBay key (startsWith "ebay" covers ebay_ca), never a converted
//     reference row (ALL_FALLBACK_RETAILERS), never a derived (cloned) row;
//   • in stock, Near Mint or no stated condition (alertConditionRank 0);
//   • seen within ALERT_FRESH_MS (36h: every alert-eligible source rewrites
//     its rows on each of the two daily imports).
// eBay is excluded outright, with no opt-in (owner, 2026-09-25): its identity
// and condition guards are the weakest of any source.
//
// It is a SUBSET of the rows behind Card.lowestPriceCents*, so on the first run
// after the switch baselines can only rise — which sends nothing.
//
// STATE, not just a number:
//   • "priced"  — at least one eligible fresh copy; the cheapest is the price.
//   • "soldout" — nothing eligible in stock, and no stale row claims otherwise.
//   • "unknown" — no fresh eligible copy, but a row seen 36-72h ago claims one
//                 (a store whose feed is failing). Never read as sold out, or
//                 an outage would email "back in stock" when the feed recovers.
//
// ONE bounded query for every watched (card, market) pair: grouped by market
// (at most six OR branches of `cardId IN (…)`), in-stock rows seen in the last
// 72h only, eight narrow columns, capped. Roughly 150-300 pairs × ~10 rows ×
// ~150 B ≈ 0.5 MB a run. Called directly from the alert cron, never inside an
// unstable_cache (src/lib/db.ts rule 6).

export const ALERT_FRESH_MS = 36 * 60 * 60 * 1000;
export const ALERT_LOOKBACK_MS = 72 * 60 * 60 * 1000;
/** Stores an alert names, cheapest first. */
export const ALERT_STORE_LIMIT = 3;
/** Row cap per watched pair — far above any real card's store count per market. */
export const ALERT_ROWS_PER_PAIR = 40;

export type AlertPriceState = "priced" | "soldout" | "unknown";

/** One RetailerPrice row as the alert query selects it. */
export interface AlertPriceRow {
  cardId: string;
  country: string;
  retailer: string;
  retailerName: string;
  priceCents: number;
  shippingCents: number | null;
  condition: string | null;
  url: string;
  inStock: boolean;
  lastSeen: Date;
  derived?: boolean | null;
}

/** A copy an alert may quote: the row's own price, condition and link. */
export interface AlertOffer {
  retailer: string;
  name: string;
  priceCents: number;
  shippingCents: number | null; // postage the listing itself states, else null
  condition: string | null;
  url: string; // the raw listing URL; the alert run affiliate-wraps it
  lastSeen: Date;
}

export interface AlertPrice {
  state: AlertPriceState;
  priceCents: number | null; // the cheapest offer's price when "priced", else null
  condition: string | null; // that offer's condition (NM or unstated by construction)
  checkedAt: Date | null; // when that offer was last seen by an import
  stores: AlertOffer[]; // up to ALERT_STORE_LIMIT, one per retailer, cheapest first
}

export const alertPairKey = (market: string, cardId: string) => `${market}:${cardId}`;

/** May rows from this retailer ever set or name an alert price? */
export function isAlertEligibleRetailer(retailer: string): boolean {
  return !retailer.toLowerCase().startsWith("ebay") && !ALL_FALLBACK_RETAILERS.includes(retailer);
}

/** Pure: may this ROW set the alert price right now? */
export function isAlertEligibleRow(r: AlertPriceRow, now: Date, freshMs = ALERT_FRESH_MS): boolean {
  return (
    r.inStock &&
    r.derived !== true &&
    isAlertEligibleRetailer(r.retailer) &&
    alertConditionRank(r.condition) === 0 &&
    r.priceCents > 0 &&
    now.getTime() - r.lastSeen.getTime() <= freshMs
  );
}

/**
 * Pure: one (card, market)'s alert price from its rows. Order among ties:
 * price, then a listing that states its postage, then retailer key — so which
 * store an email names is deterministic run to run.
 */
export function alertPriceFromRows(rows: readonly AlertPriceRow[], now: Date): AlertPrice {
  const fresh = rows.filter((r) => isAlertEligibleRow(r, now));
  if (!fresh.length) {
    // Would a row seen 36-72h ago have counted if it were fresh? Then we
    // cannot tell sold out from a failing feed.
    const stale = rows.some((r) => isAlertEligibleRow(r, now, ALERT_LOOKBACK_MS));
    return { state: stale ? "unknown" : "soldout", priceCents: null, condition: null, checkedAt: null, stores: [] };
  }
  const sorted = [...fresh].sort(
    (a, b) =>
      a.priceCents - b.priceCents ||
      Number(a.shippingCents == null) - Number(b.shippingCents == null) ||
      (a.retailer < b.retailer ? -1 : a.retailer > b.retailer ? 1 : 0),
  );
  const stores: AlertOffer[] = [];
  const seen = new Set<string>();
  for (const r of sorted) {
    if (seen.has(r.retailer)) continue; // a store's foil and non-foil rows are one store
    seen.add(r.retailer);
    stores.push({
      retailer: r.retailer,
      name: r.retailerName,
      priceCents: r.priceCents,
      shippingCents: r.shippingCents ?? null,
      condition: r.condition ?? null,
      url: r.url,
      lastSeen: r.lastSeen,
    });
    if (stores.length >= ALERT_STORE_LIMIT) break;
  }
  const lead = stores[0]!;
  return { state: "priced", priceCents: lead.priceCents, condition: lead.condition, checkedAt: lead.lastSeen, stores };
}

export type AlertPriceDb = Pick<typeof prisma, "retailerPrice">;

/**
 * The alert price for every watched (card, market) pair, in ONE query. A pair
 * with no rows at all comes back "soldout" (nobody eligible lists it). Throws
 * if the read fails: with no prices there is nothing safe to compare, and the
 * caller must not read that as every card selling out.
 */
export async function computeAlertPrices(
  db: AlertPriceDb,
  pairs: readonly { cardId: string; market: string }[],
  now: Date,
): Promise<Map<string, AlertPrice>> {
  const byMarket = new Map<string, Set<string>>();
  for (const p of pairs) {
    const ids = byMarket.get(p.market) ?? new Set<string>();
    ids.add(p.cardId);
    byMarket.set(p.market, ids);
  }
  const out = new Map<string, AlertPrice>();
  if (!byMarket.size) return out;
  const pairCount = [...byMarket.values()].reduce((n, s) => n + s.size, 0);
  const rows = await db.retailerPrice.findMany({
    where: {
      inStock: true,
      lastSeen: { gte: new Date(now.getTime() - ALERT_LOOKBACK_MS) },
      retailer: { notIn: [...ALL_FALLBACK_RETAILERS] },
      NOT: { retailer: { startsWith: "ebay" } },
      OR: [...byMarket].map(([country, ids]) => ({ country, cardId: { in: [...ids] } })),
    },
    select: {
      cardId: true,
      country: true,
      retailer: true,
      retailerName: true,
      priceCents: true,
      shippingCents: true,
      condition: true,
      url: true,
      inStock: true,
      lastSeen: true,
      derived: true,
    },
    // Cheapest first, so a (never expected) truncation drops the dearest rows,
    // which cannot change any pair's price.
    orderBy: { priceCents: "asc" },
    take: pairCount * ALERT_ROWS_PER_PAIR,
  });
  const grouped = new Map<string, AlertPriceRow[]>();
  for (const r of rows) {
    const k = alertPairKey(r.country, r.cardId);
    const list = grouped.get(k);
    if (list) list.push(r);
    else grouped.set(k, [r]);
  }
  for (const [market, ids] of byMarket) {
    for (const cardId of ids) {
      const k = alertPairKey(market, cardId);
      out.set(k, alertPriceFromRows(grouped.get(k) ?? [], now));
    }
  }
  return out;
}
