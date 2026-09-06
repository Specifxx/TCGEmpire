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
import { RETAILER_LIST, retailerCountry } from "./retailers";
import { REFERENCE_SOURCES } from "./constants";
import { median } from "./stats";

// Calendar day (date-only) in Australia/Sydney — same bucketing as
// PriceHistory/DemandSnapshot. Duplicated (not imported) because it's a
// four-line pure function and demand-snapshot.ts doesn't export it.
function sydneyDay(d = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(d);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export type StoreHealthAlertKind = "stale" | "listings-dropped" | "frozen-prices" | "price-jump" | "no-listings";

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
// looks like a frozen scraper — a live catalogue drifting by exactly $0.00 for a
// long run of snapshots is more likely a stuck cache/selector than a genuinely
// unchanged market.
//
// RAISED FROM 3 TO 7 ON 2026-08-23, because 3 was firing on almost everything:
// 67 of 132 stores raised `frozen-prices` in one run, which is not a finding, it
// is noise — and a monitor that flags 81% of its subjects gets ignored, which is
// exactly what happened to this one.
//
// Three was never enough evidence. It is the MINIMUM the streak test can use
// (two prior snapshots plus today), StoreHealthSnapshot held only about three
// days of rows at the time, and a small store's median price genuinely can sit
// still for three days — twenty cards in stock and no restock is an ordinary
// week, not a broken scraper. Worse, the operational database was restored from
// an older snapshot on 2026-08-22, so part of that three-day "history" was
// rewritten underneath the comparison.
//
// Seven days of an IDENTICAL median across at least FROZEN_MIN_LISTINGS listings
// is a claim worth paying attention to. The cost is that this alert goes quiet
// until a real week of snapshots accrues — which is correct, because until then
// there is no evidence to make the claim on.
const FROZEN_STREAK_DAYS = 7;
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
    // REFERENCE_SOURCES (Cardmarket) folded in alongside the real-store registry —
    // see its own header comment in lib/constants.ts for why: a marketplace
    // aggregate must never be scraped as a store or get a store page, but it can
    // still go silently to zero rows (exactly what happened 2026-09-06), and this
    // monitor is the one place that shape of failure should be visible.
    const nameByKey = new Map([
      ...RETAILER_LIST.map((r) => [r.key, r.name] as const),
      ...REFERENCE_SOURCES.map((r) => [r.key, r.name] as const),
    ]);
    const trackedKeys = [...RETAILER_LIST.map((r) => r.key), ...REFERENCE_SOURCES.map((r) => r.key)];
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

    // THE MONITOR USED TO ITERATE `counts`, AND `counts` IS A groupBy OVER
    // RetailerPrice — so a store with ZERO rows produced no group, never entered
    // this loop, and got no row and no alert.
    //
    // That is the blind spot at the exact centre of what this file is for. Every
    // check below needs data to fire: `stale` needs a lastSeen (null when there
    // are no rows), `listings-dropped` needs a listing count to compare, and the
    // price checks need a median. A scraper degrading from 400 listings to 40
    // alerted loudly; the same scraper degrading to 0 — a site redesign, new bot
    // protection, a changed URL, an expired token — went completely silent and
    // simply vanished from the report, which reads identically to "this store was
    // never configured".
    //
    // So the loop now walks the REGISTRY (every store we claim to track, in the
    // market it serves) unioned with whatever markets actually returned rows, and
    // a store with nothing at all reports listings: 0 and raises `no-listings`.
    // Losing a store outright is the most severe failure this monitor has, and it
    // was the only one it could not see.
    const expected = new Map<string, { retailer: string; country: string }>();
    for (const r of RETAILER_LIST) {
      expected.set(key(r.key, retailerCountry(r.key)), { retailer: r.key, country: retailerCountry(r.key) });
    }
    for (const r of REFERENCE_SOURCES) {
      expected.set(key(r.key, r.country), { retailer: r.key, country: r.country });
    }
    // A store can also legitimately return rows in a market the registry doesn't
    // name (eBay's per-market keys, a store that started shipping elsewhere).
    // Union rather than replace, so observed data is never dropped from the report.
    for (const c of counts) expected.set(key(c.retailer, c.country), { retailer: c.retailer, country: c.country });
    const countByKey = new Map(counts.map((c) => [key(c.retailer, c.country), c._count._all]));

    for (const c of expected.values()) {
      const k = key(c.retailer, c.country);
      const listings = countByKey.get(k) ?? 0;
      const inStock = inStockByKey.get(k) ?? 0;
      const lastSeen = lastSeenByKey.get(k) ?? null;
      const medianPriceCents = medianByKey.get(k) ?? null;
      const hist = historyByKey.get(k) ?? [];
      const historyDays = new Set(hist.map((h) => h.day.getTime())).size;
      const medianListings7d = historyDays >= MIN_HISTORY_DAYS ? median(hist.map((h) => h.listings)) : null;

      const rowAlerts: StoreHealthAlert[] = [];

      // Nothing at all. Checked first and on its own: with no rows there is no
      // lastSeen, no median and no count to compare, so every other check below
      // is structurally incapable of firing for this store.
      if (listings === 0) {
        rowAlerts.push({
          retailer: c.retailer,
          country: c.country,
          kind: "no-listings",
          detail: "tracked in the registry but has NO rows at all — scraper returning nothing, or never ran",
        });
      }

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
  "no-listings": "NO LISTINGS AT ALL",
};

// Human-readable lines for the Discord alert — one per alert, store name first
// (the display name, not the retailer key) since that's what a human scanning
// the channel needs to act on.
export function formatHealthAlerts(alerts: StoreHealthAlert[]): string[] {
  const nameByKey = new Map([
    ...RETAILER_LIST.map((r) => [r.key, r.name] as const),
    ...REFERENCE_SOURCES.map((r) => [r.key, r.name] as const),
  ]);
  return alerts.map((a) => `**${nameByKey.get(a.retailer) ?? a.retailer}** (${a.country}) — ${KIND_LABEL[a.kind]}: ${a.detail}`);
}
