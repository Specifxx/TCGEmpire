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
//   • "unknown" — we cannot tell, because a source whose feed is failing still
//                 claims stock. Never read as sold out, or an outage would
//                 email "back in stock" when the feed recovers. Three shapes:
//       – no fresh eligible copy, but a row seen 36-72h ago claims one;
//       – no eligible row inside 72h at all, but one seen up to
//         ALERT_OUTAGE_MAX_MS (14 days) ago does. Every source deletes and
//         re-inserts its rows on a SUCCESSFUL import, so an old in-stock row
//         exists only while its source keeps failing (CardTrader and TCGplayer
//         keep their rows through a failed fetch). A Shopify store's rows are
//         deleted after 72h of failure (price-import.ts STORE_ROWS_MAX_AGE_H),
//         so an outage longer than that can still read as sold out;
//       – fresh copies exist, but a STALE eligible row (36-72h) from another
//         retailer is CHEAPER than all of them (review, 2026-09-25). The price
//         is either that store's figure or higher, and we cannot tell which;
//         reading it as "priced" at the dearer store raised the baseline, and
//         the cheap store's recovery at its unchanged price then emailed a
//         phantom "new low" (or re-fired a target). A stale row dearer than
//         the fresh minimum cannot lower the price, so that stays "priced".
//
// ONE bounded query for every watched (card, market) pair: grouped by market
// (at most six OR branches of `cardId IN (…)`), in-stock rows seen in the last
// 72h only, eleven narrow columns, capped. Roughly 150-300 pairs × ~10 rows ×
// ~150 B ≈ 0.5 MB a run. Plus, only when some pair reads sold out, one more
// bounded read of those pairs' older rows (the outage check above). Called directly from the alert cron, never inside an
// unstable_cache (src/lib/db.ts rule 6).

export const ALERT_FRESH_MS = 36 * 60 * 60 * 1000;
export const ALERT_LOOKBACK_MS = 72 * 60 * 60 * 1000;
/** An in-stock eligible row older than 72h but newer than this still says "unknown", not "soldout". */
export const ALERT_OUTAGE_MAX_MS = 14 * 24 * 60 * 60 * 1000;
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
const NO_PRICE = { priceCents: null, condition: null, checkedAt: null, stores: [] } as const;

export function alertPriceFromRows(rows: readonly AlertPriceRow[], now: Date): AlertPrice {
  const fresh = rows.filter((r) => isAlertEligibleRow(r, now));
  // Rows that would count if they were fresh, but were last seen 36-72h ago.
  const stale = rows.filter((r) => !isAlertEligibleRow(r, now) && isAlertEligibleRow(r, now, ALERT_LOOKBACK_MS));
  if (!fresh.length) {
    // We cannot tell sold out from a failing feed.
    return { state: stale.length ? "unknown" : "soldout", ...NO_PRICE, stores: [] };
  }
  // A failing store that was CHEAPER than every fresh copy: the price may be
  // that store's, or it may have risen — unknown, so the run writes nothing.
  // A stale row from a retailer that also has a fresh copy of this card is a
  // listing that store dropped, not an outage, and is ignored.
  const freshMin = Math.min(...fresh.map((r) => r.priceCents));
  const freshRetailers = new Set(fresh.map((r) => r.retailer));
  if (stale.some((r) => !freshRetailers.has(r.retailer) && r.priceCents < freshMin)) {
    return { state: "unknown", ...NO_PRICE, stores: [] };
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
 * The baseline a NEW watch starts from (/api/alerts/subscribe and the
 * watchlist's POST): the alert price when the pair is "priced", else null —
 * so the first store listing fires "now listed" / "pre-order", as the /alerts
 * FAQ promises. Until 2026-09-25 both routes seeded Card.lowestPriceCents*,
 * which includes eBay, played and stale copies: a card only eBay listed was
 * then read as SOLD OUT by the first run, and its first store listing emailed
 * "back in stock … $<eBay price> before it sold out" (review, 2026-09-25).
 * dropAnchorCents is seeded too: it marks a baseline that IS an alert price
 * (lib/price-alerts.ts resets a baseline without one instead of stamping it
 * sold out).
 */
export function alertBaselineSeed(p: AlertPrice | undefined): {
  lastPriceCents: number | null;
  startPriceCents: number | null;
  dropAnchorCents: number | null;
} {
  const cents = p?.state === "priced" ? p.priceCents : null;
  return { lastPriceCents: cents, startPriceCents: cents, dropAnchorCents: cents };
}

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
  // slim: skip the listing URL and stated postage — for callers that need only
  // the price, state, store name and condition (seeding a new watch, the
  // confirmation email). The URL is the widest column read.
  opts: { slim?: boolean } = {},
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
      shippingCents: !opts.slim,
      condition: true,
      url: !opts.slim,
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
    const row: AlertPriceRow = { ...r, url: r.url ?? "", shippingCents: r.shippingCents ?? null };
    const list = grouped.get(k);
    if (list) list.push(row);
    else grouped.set(k, [row]);
  }
  for (const [market, ids] of byMarket) {
    for (const cardId of ids) {
      const k = alertPairKey(market, cardId);
      out.set(k, alertPriceFromRows(grouped.get(k) ?? [], now));
    }
  }

  // A pair with nothing eligible inside 72h is "soldout" only if no OLDER
  // in-stock eligible row (up to ALERT_OUTAGE_MAX_MS) survives from a source
  // whose imports keep failing. One more bounded read, only for those pairs
  // and only when there are any; four narrow columns plus the filters.
  const soldOut = new Map<string, Set<string>>();
  for (const [market, ids] of byMarket) {
    for (const cardId of ids) {
      if (out.get(alertPairKey(market, cardId))?.state !== "soldout") continue;
      const set = soldOut.get(market) ?? new Set<string>();
      set.add(cardId);
      soldOut.set(market, set);
    }
  }
  if (soldOut.size) {
    const soldOutCount = [...soldOut.values()].reduce((n, s) => n + s.size, 0);
    const old = await db.retailerPrice.findMany({
      where: {
        inStock: true,
        lastSeen: { gte: new Date(now.getTime() - ALERT_OUTAGE_MAX_MS), lt: new Date(now.getTime() - ALERT_LOOKBACK_MS) },
        retailer: { notIn: [...ALL_FALLBACK_RETAILERS] },
        NOT: { retailer: { startsWith: "ebay" } },
        OR: [...soldOut].map(([country, ids]) => ({ country, cardId: { in: [...ids] } })),
      },
      select: { cardId: true, country: true, retailer: true, priceCents: true, condition: true, inStock: true, lastSeen: true, derived: true },
      take: soldOutCount * ALERT_ROWS_PER_PAIR,
    });
    for (const r of old) {
      if (!soldOut.get(r.country)?.has(r.cardId)) continue;
      const eligible = isAlertEligibleRow({ ...r, retailerName: "", shippingCents: null, url: "" }, now, ALERT_OUTAGE_MAX_MS);
      if (eligible) out.set(alertPairKey(r.country, r.cardId), { state: "unknown", ...NO_PRICE, stores: [] });
    }
  }
  return out;
}
