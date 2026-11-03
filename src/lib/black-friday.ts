import type { SealedGroup } from "./sealed-import";
import { offerStock } from "./sealed-offers";

// /black-friday: Riftbound sealed deals through Black Friday and Cyber Monday
// (2026-10-30, the weekly growth review: the Radiance pre-order wave that drove
// October's affiliate earnings ended at release, Legacy is three months off, and
// November's buying moment is Black Friday). DECISIONS.md, "A Black Friday deals
// page on RiftCompare". Same rule as DexCompare's page: what stores ask TODAY,
// against the other stores and the US MSRP; never a "was" price, a countdown or
// "ends soon". PURE: tests/black-friday.test.ts.

/** Black Friday: the day after the fourth Thursday of November (US Thanksgiving), YYYY-MM-DD. */
export function blackFriday(year: number): string {
  const firstOfNov = new Date(Date.UTC(year, 10, 1));
  const firstThursday = 1 + ((4 - firstOfNov.getUTCDay() + 7) % 7);
  return `${year}-11-${String(firstThursday + 22).padStart(2, "0")}`;
}

/** Cyber Monday: three days after Black Friday. */
export function cyberMonday(year: number): string {
  const d = new Date(`${blackFriday(year)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
}

/** The nav shows the page from 1 October to a week after Cyber Monday; the page itself is always there. */
export function inSeason(today: string): boolean {
  const y = Number(today.slice(0, 4));
  const end = new Date(`${cyberMonday(y)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  return today >= `${y}-10-01` && today <= end.toISOString().slice(0, 10);
}

/** A deal is the cheapest open store at least this far under the median open store price… */
export const UNDER_MEDIAN_PCT = 10;
/** …among at least this many open stores, or the cheapest at least this far under MSRP. */
export const MIN_STORES = 3;
export const UNDER_MSRP_PCT = 5;

export interface SealedDeal {
  group: SealedGroup;
  cheapestCents: number;
  medianCents: number | null;
  underMedianPct: number | null;
  underMsrpPct: number | null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Products whose cheapest open store offer is well under the other stores or the MSRP, biggest saving first. */
export function sealedDeals(groups: readonly SealedGroup[], now: number = Date.now()): SealedDeal[] {
  const out: SealedDeal[] = [];
  for (const g of groups) {
    // Stores only: an eBay row is a seller's asking price, not a store's deal.
    const open = g.listings.filter((l) => !l.retailer.startsWith("ebay") && offerStock(l, now) === "open").map((l) => l.priceCents);
    if (!open.length) continue;
    const cheapestCents = Math.min(...open);
    const medianCents = open.length >= MIN_STORES ? median(open) : null;
    const underMedianPct = medianCents ? Math.round((1 - cheapestCents / medianCents) * 100) : null;
    const underMsrpPct = g.msrpCents ? Math.round((1 - cheapestCents / g.msrpCents) * 100) : null;
    if ((underMedianPct ?? 0) < UNDER_MEDIAN_PCT && (underMsrpPct ?? 0) < UNDER_MSRP_PCT) continue;
    out.push({ group: g, cheapestCents, medianCents, underMedianPct, underMsrpPct });
  }
  const best = (d: SealedDeal) => Math.max(d.underMedianPct ?? 0, d.underMsrpPct ?? 0);
  return out.sort((a, b) => best(b) - best(a) || a.cheapestCents - b.cheapestCents);
}
