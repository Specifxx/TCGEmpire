// Real, non-fabricated data for the homepage's Vendetta block: the cheapest
// sealed booster box currently listed, and how the set's singles have moved in
// price since the earliest snapshot we have. Everything here returns null/empty
// rather than a guess when the underlying data doesn't exist yet (e.g. no store
// has listed a Vendetta box in a market, or price history is too young to diff).
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import type { Country } from "./country";
import { CONTENT_TAG } from "./revalidate-content";

const VEN_SET_CODE = "VEN";

function sydneyDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

// Mirrors price-history.ts's cachedOrDirect: unstable_cache needs the Next.js
// request-scoped incremental cache, which doesn't exist for plain tsx scripts.
async function cachedOrDirect<T>(fn: () => Promise<T>, keys: string[], opts: { revalidate: number; tags: string[] }): Promise<T> {
  try {
    return await unstable_cache(fn, keys, opts)();
  } catch (e) {
    if (e instanceof Error && e.message.includes("incrementalCache missing")) return fn();
    throw e;
  }
}

export type CheapestBox = { priceCents: number; retailerName: string; url: string } | null;
export type VendettaPulse = { cheapestBox: CheapestBox; pricePct: number | null; sinceLabel: string | null };

// Blended average of every currently-tracked Vendetta card's lowest price, on
// the earliest day we have a snapshot for vs. the most recent one — a real,
// computed set-level index, not a curated/fabricated number. Returns nulls
// (rendered as "not enough history yet") until at least two distinct days of
// PriceHistory exist for VEN cards in this market.
async function computePricePulse(country: Country): Promise<{ pricePct: number | null; sinceLabel: string | null }> {
  try {
    const venCards = await prisma.card.findMany({ where: { setCode: VEN_SET_CODE }, select: { id: true } });
    if (!venCards.length) return { pricePct: null, sinceLabel: null };

    const rows = await dbHistory.priceHistory.findMany({
      where: { cardId: { in: venCards.map((c) => c.id) }, country },
      orderBy: { day: "asc" },
      select: { day: true, lowestPriceCents: true },
    });
    if (!rows.length) return { pricePct: null, sinceLabel: null };

    const byDay = new Map<string, number[]>();
    for (const r of rows) {
      const key = r.day.toISOString().slice(0, 10);
      (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(r.lowestPriceCents);
    }
    const days = Array.from(byDay.keys()).sort();
    if (days.length < 2) return { pricePct: null, sinceLabel: null };

    const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;
    const first = avg(byDay.get(days[0])!);
    const last = avg(byDay.get(days[days.length - 1])!);
    if (first <= 0) return { pricePct: null, sinceLabel: null };

    const pct = ((last - first) / first) * 100;
    const sinceLabel = new Date(days[0]).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { pricePct: Math.round(pct * 10) / 10, sinceLabel };
  } catch {
    return { pricePct: null, sinceLabel: null };
  }
}

async function computeVendettaPulse(country: Country): Promise<VendettaPulse> {
  const [cheapestBox, pricePulse] = await Promise.all([
    prisma.sealedListing
      .findFirst({
        where: { setCode: VEN_SET_CODE, productType: "Booster Box", country, inStock: true },
        orderBy: { priceCents: "asc" },
        select: { priceCents: true, retailerName: true, url: true },
      })
      .catch((): CheapestBox => null),
    computePricePulse(country),
  ]);
  return { cheapestBox, ...pricePulse };
}

// Day-scoped cache, one read per market per day — same pattern as
// price-history.ts's getRecentlyUpdated/getPriceMovers.
export async function getVendettaPulse(country: Country = "AU"): Promise<VendettaPulse> {
  return cachedOrDirect(
    () => computeVendettaPulse(country),
    ["rc-vendetta-pulse", country, sydneyDayKey()],
    { revalidate: 3600, tags: [CONTENT_TAG] },
  );
}
