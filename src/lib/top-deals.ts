// "Today's Top Deals" — one normalized feed blending the four live deal signals so
// the homepage can surface the best opportunities in the viewer's market:
//   • savings-vs-market  (PREMIUM) — cards eBay is cheapest on vs the best store
//   • price-drops        (free)    — biggest 7-day price falls
//   • cheapest-sealed    (free)    — lowest in-stock sealed products right now
//   • undervalued        (PREMIUM) — cards furthest below their 30-day average
//
// price-drops + undervalued depend on PriceHistory (AU-only today) and savings needs
// an eBay market, so some columns are naturally empty in some markets — the homepage
// hides empty columns. Each source is independently guarded, so one failing never
// sinks the rest. The two PREMIUM columns are gated in the UI (only the single top
// item is rendered to non-subscribers); the data layer itself is ungated.
import type { Country } from "./country";
import { cardHref } from "./card-url";
import { affiliateUrl } from "./affiliate";
import { getEbayCheapest } from "./arbitrage";
import { getPriceMovers } from "./price-history";
import { getSealedGroups } from "./sealed-import";
import { getUndervalued } from "./screener";

export type DealType = "savings-vs-market" | "price-drops" | "cheapest-sealed" | "undervalued";

export type Deal = {
  dealType: DealType;
  title: string;
  subtitle: string | null; // "SET · 123" for singles, productType for sealed
  href: string | null; // internal card page (singles); null for sealed
  outboundUrl: string | null; // external buy link (sealed only)
  outboundRetailer: string | null; // retailer key for OutboundLink logging
  imageUrl: string | null;
  priceCents: number;
  pctLabel: number | null; // magnitude of saving / drop / discount, shown as a badge
  note: string | null; // small context, e.g. "vs Card Empire" or "30-day avg"
};

export type TopDeals = {
  savingsVsMarket: Deal[]; // PREMIUM
  priceDrops: Deal[]; // free
  cheapestSealed: Deal[]; // free
  undervalued: Deal[]; // PREMIUM
  hasAny: boolean;
};

const sub = (c: { setCode: string; collectorNumber: string }) => `${c.setCode} · ${c.collectorNumber}`;

export async function getTopDeals(country: Country, perType = 4): Promise<TopDeals> {
  const [savingsVsMarket, priceDrops, cheapestSealed, undervalued] = await Promise.all([
    (async (): Promise<Deal[]> => {
      try {
        const { items } = await getEbayCheapest(country, "saving", 1, perType);
        return items.map((it) => ({
          dealType: "savings-vs-market" as const,
          title: it.card.name,
          subtitle: sub(it.card),
          href: cardHref(it.card),
          outboundUrl: null,
          outboundRetailer: null,
          imageUrl: it.card.imageThumbUrl,
          priceCents: it.ebayCents,
          pctLabel: it.savingPct,
          note: `vs ${it.storeName}`,
        }));
      } catch {
        return [];
      }
    })(),
    (async (): Promise<Deal[]> => {
      try {
        const movers = await getPriceMovers(country, perType);
        return movers.plummeting.slice(0, perType).map((m) => ({
          dealType: "price-drops" as const,
          title: m.card.name,
          subtitle: sub(m.card),
          href: cardHref(m.card),
          outboundUrl: null,
          outboundRetailer: null,
          imageUrl: m.card.imageThumbUrl,
          priceCents: m.nowCents,
          pctLabel: Math.abs(Math.round(m.pct)),
          note: "7-day drop",
        }));
      } catch {
        return [];
      }
    })(),
    (async (): Promise<Deal[]> => {
      try {
        const groups = (await getSealedGroups(country)).filter((g) => g.lowestPriceCents != null);
        return [...groups]
          .sort((a, b) => a.lowestPriceCents! - b.lowestPriceCents!)
          .slice(0, perType)
          .map((g) => ({
            dealType: "cheapest-sealed" as const,
            title: g.name,
            subtitle: g.productType,
            href: null,
            outboundUrl: g.listings[0] ? affiliateUrl(g.listings[0].url, g.listings[0].retailer) : null,
            outboundRetailer: g.listings[0]?.retailer ?? null,
            imageUrl: g.imageUrl,
            priceCents: g.lowestPriceCents!,
            pctLabel: null,
            note: g.listings[0]?.retailerName ?? null,
          }));
      } catch {
        return [];
      }
    })(),
    (async (): Promise<Deal[]> => {
      try {
        const picks = await getUndervalued(country, perType);
        return picks.slice(0, perType).map((p) => ({
          dealType: "undervalued" as const,
          title: p.card.name,
          subtitle: sub(p.card),
          href: cardHref(p.card),
          outboundUrl: null,
          outboundRetailer: null,
          imageUrl: p.card.imageThumbUrl,
          priceCents: p.currentCents,
          pctLabel: p.discountPct,
          note: "below 30-day avg",
        }));
      } catch {
        return [];
      }
    })(),
  ]);

  const hasAny =
    savingsVsMarket.length + priceDrops.length + cheapestSealed.length + undervalued.length > 0;
  return { savingsVsMarket, priceDrops, cheapestSealed, undervalued, hasAny };
}
