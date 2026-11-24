// The loader behind the Black Friday / Cyber Monday pages' one deal list (lib/sale-deals.ts). Candidates are the products the two
// old lists drew on, in the visitor's market: the groups furthest under their own 30-day typical price (components/RealDrops.tsx
// realDropRows, from the history files bundled with the release) and the sealed deals under the other stores or the MSRP
// (lib/black-friday.ts sealedDeals, after the page's live stock re-check). Each row uses ONE offer, the cheapest open store
// listing (never eBay), and every discount is measured against that price. No database read: the page passes what it loaded.
import { affiliateUrl, ebaySealedQuery, ebaySearchUrl } from "@/lib/affiliate";
import { MIN_STORES, UNDER_MEDIAN_PCT, UNDER_MSRP_PCT, type SealedDeal } from "@/lib/black-friday";
import type { Country } from "@/lib/country";
import { sealedHistoryRows } from "@/lib/price-history-store";
import { DROPS_WINDOW_DAYS, realDrop } from "@/lib/real-drops";
import type { SaleDealRow } from "@/lib/sale-deals";
import type { SealedGroup } from "@/lib/sealed-import";
import { headlineOffer, offerStock } from "@/lib/sealed-offers";
import { sealedSlug } from "@/lib/sealed-slug";

const isEbay = (retailer: string) => retailer.startsWith("ebay");

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function saleDealRows(
  groups: readonly SealedGroup[],
  deals: readonly SealedDeal[],
  country: Country,
  page: string,
  source: string,
  now: Date = new Date(),
): SaleDealRow[] {
  const today = now.toISOString().slice(0, 10);
  let hist: ReturnType<typeof sealedHistoryRows> = [];
  try {
    hist = sealedHistoryRows({ since: new Date(now.getTime() - (DROPS_WINDOW_DAYS + 3) * 86_400_000) });
  } catch {
    hist = [];
  }
  const byGroup = new Map<string, { day: string; cents: number }[]>();
  for (const r of hist) {
    if (r.country !== country) continue;
    const list = byGroup.get(r.groupKey) ?? [];
    list.push({ day: r.day.toISOString().slice(0, 10), cents: r.lowestPriceCents });
    byGroup.set(r.groupKey, list);
  }
  // The live-checked deal groups replace their unchecked copies (a store sold out since the import is closed there).
  const pick = new Map<string, SealedGroup>(groups.map((g) => [g.groupKey, g]));
  for (const d of deals) pick.set(d.group.groupKey, d.group);
  const out: SaleDealRow[] = [];
  for (const g of pick.values()) {
    const stores = g.listings.filter((l) => !isEbay(l.retailer));
    const offer = headlineOffer(stores, now.getTime());
    if (!offer) continue;
    const price = offer.priceCents;
    const days = (byGroup.get(g.groupKey) ?? []).sort((a, b) => a.day.localeCompare(b.day));
    const drop = days.length ? realDrop(days, price, today) : null;
    const typical = drop ? { pct: drop.pct, cents: drop.typicalCents, lowest: drop.lowest, sinceDay: drop.sinceDay } : null;
    const open = stores.filter((l) => offerStock(l, now.getTime()) === "open").map((l) => l.priceCents);
    const med = open.length >= MIN_STORES ? median(open) : null;
    const mPct = med ? Math.round((1 - price / med) * 100) : null;
    const medianOff = med && mPct != null && mPct >= UNDER_MEDIAN_PCT && mPct < 50 ? { pct: mPct, cents: med } : null;
    const sPct = g.msrpCents ? Math.round((1 - price / g.msrpCents) * 100) : null;
    const msrp = g.msrpCents && sPct != null && sPct >= UNDER_MSRP_PCT && sPct < 50 ? { pct: sPct, cents: g.msrpCents } : null;
    if (!typical && !medianOff && !msrp) continue;
    const byDay = new Map(days.map((d) => [d.day, d.cents]));
    const spark: (number | null)[] = [];
    for (let i = DROPS_WINDOW_DAYS; i >= 1; i--) spark.push(byDay.get(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10)) ?? null);
    out.push({
      slug: sealedSlug(g.groupKey),
      name: g.name,
      productType: g.productType,
      imageUrl: g.imageUrl,
      preorder: false,
      priceCents: price,
      storeName: offer.retailerName,
      buyHref: affiliateUrl(offer.url, offer.retailer, page),
      retailer: offer.retailer,
      ebayHref: ebaySearchUrl(country, ebaySealedQuery(g.name, g.productType), `${source}-list`),
      checkedAt: offer.lastSeen,
      typical,
      median: medianOff,
      msrp,
      spark,
    });
  }
  // The strongest 48 per basis ship to the browser (DexCompare's list reads 48 + 36), so the page stays light.
  const keep = new Set<string>();
  for (const b of ["typical", "median", "msrp"] as const) {
    out
      .filter((r) => r[b])
      .sort((x, y) => y[b]!.pct - x[b]!.pct || x.priceCents - y.priceCents)
      .slice(0, 48)
      .forEach((r) => keep.add(r.slug));
  }
  return out.filter((r) => keep.has(r.slug));
}
