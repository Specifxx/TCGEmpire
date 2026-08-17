// Per-store data-health checks — the "is a scraper silently broken" monitor.
//
// WHY THIS EXISTS: 110+ store scrapers is the site's moat and its recurring tax.
// Store sites redesign, add bot protection, or change stock semantics, and a
// solo operator running 18 product surfaces will not notice a silently broken
// scraper for weeks — the importer keeps running, keeps reporting "success", and
// the store's last-known prices just sit there, increasingly stale, looking
// exactly like a healthy quiet store. This is the one engineering surface where
// that failure mode is caught automatically instead of by a user complaint.
//
// Every read here is try/catch-guarded and degrades to an empty/safe result —
// same convention as lib/demand-snapshot.ts — so this ships inert before
// StoreHealthSnapshot exists in production (it materialises on the next
// `prisma db push` deploy) and never turns a monitoring failure into a 500 on
// the cron route that calls it.
import { prisma } from "./db";
import { RETAILER_LIST } from "./retailers";
import { median } from "./stats";

// Calendar day (date-only) in Australia/Sydney — same bucketing as
// PriceHistory/DemandSnapshot. Duplicated (not imported) because it's a
// four-line pure function and demand-snapshot.ts doesn't export it.
function sydneyDay(d = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(d);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export type StoreHealthAlertKind = "stale" | "listings-dropped" | "frozen-prices" | "price-jump";

export interface StoreHealthAlert {
  retailer: string;
  country: string;
  kind: StoreHealthAlertKind;
  detail: string;
}

export interface StoreHealthRow {
  retailer: string;
  retailerName: string;
  country: string;
  listings: number;
  inStock: number;
  lastSeen: Date | null;
  medianPriceCents: number | null;
  medianListings7d: number | null;
  alerts: StoreHealthAlert[];
}

// Importer cadence is 3x/day (07:00 + 19:00 UTC via GH Actions, plus 18:00 UTC
// via the Vercel cron — see the note at price-import.ts:1574-1578), so "stale"
// has to tolerate more than a single missed run without false-alarming on
// ordinary timing jitter. 30h covers a missed run with room to spare; anything
// beyond that is a genuine multi-run gap.
const STALE_HOURS = 30;
// A >30% overnight drop in a store's listing count against its own 7-day median
// is the signature of a scraper breaking (bot-blocked, page structure changed,
// selector stopped matching) rather than real destocking.
const LISTING_DROP_RATIO = 0.7;
// Need enough history to trust a comparison at all; a store with fewer than
// this many recorded days is too new to say anything "dropped" or "froze"
// against a baseline that barely exists yet.
const MIN_HISTORY_DAYS = 3;
// A store's median in-stock price identical for this many consecutive recorded
// days, on a store with enough listings that SOME price should plausibly move,
// looks like a frozen scraper — a live catalogue this size drifting by exactly
// $0.00 for three straight snapshots is far more likely a stuck cache/selector
// than a genuinely unchanged market.
const FROZEN_STREAK_DAYS = 3;
const FROZEN_MIN_LISTINGS = 5;
// A store's median price 10x above or below its own recent median is the
// classic sign of a unit-parsing bug (cents read as dollars, or vice versa)
// rather than a real market move across an entire store's catalogue at once.
const PRICE_JUMP_RATIO = 10;

// Snapshot every tracked store's listing count/freshness/median price for
// today, and return health alerts for anything that looks broken rather than
// quiet. Reads today's live counts, reads the last week's snapshots to
// establish each store's normal range, then writes today's row (idempotent — a
// same-day re-run replaces it, same convention as PriceHistory/DemandSnapshot).
export async function checkStoreHealth(): Promise<{ rows: StoreHealthRow[]; alerts: StoreHealthAlert[] }> {
  const empty = { rows: [], alerts: [] };
  try {
    const today = sydneyDay();
    const nameByKey = new Map(RETAILER_LIST.map((r) => [r.key, r.name]));
    const trackedKeys = RETAILER_LIST.map((r) => r.key);
    const key = (retailer: string, country: string) => `${retailer}|${country}`;

    const [counts, lastSeenRows, inStockRows, medianRows] = await Promise.all([
      prisma.retailerPrice.groupBy({
        by: ["retailer", "country"],
        where: { retailer: { in: trackedKeys } },
        _count: { _all: true },
      }),
      prisma.retailerPrice.groupBy({
        by: ["retailer", "country"],
        where: { retailer: { in: trackedKeys } },
        _max: { lastSeen: true },
      }),
      prisma.retailerPrice.groupBy({
        by: ["retailer", "country"],
        where: { retailer: { in: trackedKeys }, inStock: true },
        _count: { _all: true },
      }),
      // Median in-stock price per store, computed IN Postgres via percentile_cont
      // rather than pulling every in-stock row into Node — RetailerPrice is a
      // whole-catalogue table (tens of thousands of rows across every tracked
      // store), and this repo has already exhausted five consecutive Neon
      // projects' transfer allowances from exactly this shape of unbounded read
      // (see the rotation history in lib/db.ts). Prisma's groupBy has no median
      // aggregate — only min/max/avg, and avg is skewed by outliers in exactly
      // the way a health check can least afford — so this is the one query in
      // this file that has to drop to raw SQL. Only the small aggregate (one row
      // per store/market, not one per listing) crosses the wire.
      prisma.$queryRaw<{ retailer: string; country: string; median: number | null }[]>`
        SELECT retailer, country,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY "priceCents") AS median
        FROM "RetailerPrice"
        WHERE "inStock" = true AND retailer = ANY(${trackedKeys}::text[])
        GROUP BY retailer, country
      `,
    ]);

    const lastSeenByKey = new Map(lastSeenRows.map((r) => [key(r.retailer, r.country), r._max.lastSeen]));
    const inStockByKey = new Map(inStockRows.map((r) => [key(r.retailer, r.country), r._count._all]));
    const medianByKey = new Map(medianRows.map((r) => [key(r.retailer, r.country), r.median != null ? Math.round(r.median) : null]));

    // 7-day history for the trend comparisons, one query for every store at
    // once (grouped in-process rather than one query per store). Table may not
    // exist yet on a pre-deploy read — degrade to no history rather than throw.
    const history = await prisma.storeHealthSnapshot
      .findMany({
        where: { day: { gte: sydneyDay(new Date(Date.now() - 7 * 86_400_000)) } },
        orderBy: { day: "asc" },
        select: { retailer: true, country: true, listings: true, medianPriceCents: true, day: true },
      })
      .catch(() => []);
    const historyByKey = new Map<string, { listings: number; medianPriceCents: number | null; day: Date }[]>();
    for (const h of history) {
      const k = key(h.retailer, h.country);
      (historyByKey.get(k) ?? historyByKey.set(k, []).get(k)!).push(h);
    }

    const rows: StoreHealthRow[] = [];
    const alerts: StoreHealthAlert[] = [];
    const now = Date.now();

    for (const c of counts) {
      const k = key(c.retailer, c.country);
      const listings = c._count._all;
      const inStock = inStockByKey.get(k) ?? 0;
      const lastSeen = lastSeenByKey.get(k) ?? null;
      const medianPriceCents = medianByKey.get(k) ?? null;
      const hist = historyByKey.get(k) ?? [];
      const historyDays = new Set(hist.map((h) => h.day.getTime())).size;
      const medianListings7d = historyDays >= MIN_HISTORY_DAYS ? median(hist.map((h) => h.listings)) : null;

      const rowAlerts: StoreHealthAlert[] = [];

      if (lastSeen && now - lastSeen.getTime() > STALE_HOURS * 3_600_000) {
        const hoursAgo = Math.round((now - lastSeen.getTime()) / 3_600_000);
        rowAlerts.push({ retailer: c.retailer, country: c.country, kind: "stale", detail: `no successful fetch in ${hoursAgo}h (threshold ${STALE_HOURS}h)` });
      }

      if (medianListings7d != null && medianListings7d > 0 && listings < medianListings7d * LISTING_DROP_RATIO) {
        rowAlerts.push({
          retailer: c.retailer,
          country: c.country,
          kind: "listings-dropped",
          detail: `${listings} listings today vs 7-day median of ${Math.round(medianListings7d)} (${Math.round((listings / medianListings7d) * 100)}%)`,
        });
      }

      // Frozen-price streak: the most recent FROZEN_STREAK_DAYS-1 history rows,
      // plus today, all report the exact same median price.
      if (medianPriceCents != null && listings >= FROZEN_MIN_LISTINGS && historyDays >= FROZEN_STREAK_DAYS - 1) {
        const recent = hist.slice(-1 * (FROZEN_STREAK_DAYS - 1));
        const allFrozen = recent.length === FROZEN_STREAK_DAYS - 1 && recent.every((h) => h.medianPriceCents === medianPriceCents);
        if (allFrozen) {
          rowAlerts.push({
            retailer: c.retailer,
            country: c.country,
            kind: "frozen-prices",
            detail: `median price unchanged for ${FROZEN_STREAK_DAYS} consecutive days on ${listings} listings`,
          });
        }
      }

      // Order-of-magnitude price jump vs this store's own recent median.
      const recentMedianPrices = hist.map((h) => h.medianPriceCents).filter((v): v is number => v != null);
      const baselinePrice = recentMedianPrices.length ? median(recentMedianPrices) : null;
      if (medianPriceCents != null && baselinePrice != null && baselinePrice > 0) {
        const ratio = medianPriceCents / baselinePrice;
        if (ratio >= PRICE_JUMP_RATIO || ratio <= 1 / PRICE_JUMP_RATIO) {
          rowAlerts.push({
            retailer: c.retailer,
            country: c.country,
            kind: "price-jump",
            detail: `median price ${(medianPriceCents / 100).toFixed(2)} vs recent median ${(baselinePrice / 100).toFixed(2)} (${ratio.toFixed(1)}x) — likely a unit-parsing bug, not a real move`,
          });
        }
      }

      rows.push({
        retailer: c.retailer,
        retailerName: nameByKey.get(c.retailer) ?? c.retailer,
        country: c.country,
        listings,
        inStock,
        lastSeen,
        medianPriceCents,
        medianListings7d,
        alerts: rowAlerts,
      });
      alerts.push(...rowAlerts);
    }

    // Write today's snapshot for tomorrow's comparison — idempotent (same-day
    // re-run replaces it), same shape as snapshotDemand(). Best-effort: a write
    // failure must not turn a completed health CHECK into a failed cron run —
    // the alerts already computed above are still valid and still worth posting.
    await prisma.storeHealthSnapshot
      .deleteMany({ where: { day: today } })
      .then(() =>
        prisma.storeHealthSnapshot.createMany({
          data: rows.map((r) => ({
            retailer: r.retailer,
            country: r.country,
            day: today,
            listings: r.listings,
            inStock: r.inStock,
            medianPriceCents: r.medianPriceCents,
            lastSeen: r.lastSeen,
          })),
        }),
      )
      .catch((e) => console.warn("storeHealthSnapshot write skipped:", (e as Error).message));

    return { rows, alerts };
  } catch (e) {
    console.warn("checkStoreHealth skipped:", (e as Error).message);
    return empty;
  }
}

const KIND_LABEL: Record<StoreHealthAlertKind, string> = {
  stale: "STALE",
  "listings-dropped": "LISTINGS DROPPED",
  "frozen-prices": "FROZEN PRICES",
  "price-jump": "PRICE JUMP",
};

// Human-readable lines for the Discord alert — one per alert, store name first
// (the display name, not the retailer key) since that's what a human scanning
// the channel needs to act on.
export function formatHealthAlerts(alerts: StoreHealthAlert[]): string[] {
  const nameByKey = new Map(RETAILER_LIST.map((r) => [r.key, r.name]));
  return alerts.map((a) => `**${nameByKey.get(a.retailer) ?? a.retailer}** (${a.country}) — ${KIND_LABEL[a.kind]}: ${a.detail}`);
}
