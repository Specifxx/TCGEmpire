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
  // Absolute dollar counterpart to pctLabel (e.g. the $4.10 in "US$4.10 · Save
  // 47%") — null for a deal type with no natural "delta" (cheapest-sealed has no
  // "was" price, only the MSRP context folded into `note` below).
  deltaCents: number | null;
  // The OTHER side of the comparison priceCents is being measured against — the
  // cheapest-store price for savingsVsMarket, the 7-days-ago price for
  // priceDrops, the 30-day average for undervalued. Rendered as "was X" next to
  // the badge so the two numbers on a row can't be misread as a before→after
  // pair with the new price higher than the old (a >50% drop puts deltaCents
  // ABOVE priceCents, e.g. "$10.00" then a badge dollar figure of "$10.64" reads
  // like a price INCREASE unless the reader knows that second number is a delta,
  // not a price). Null wherever deltaCents is null (cheapest-sealed).
  refCents: number | null;
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
          deltaCents: it.savingCents,
          refCents: it.storeCents,
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
          deltaCents: Math.max(0, m.refCents - m.nowCents),
          refCents: m.refCents,
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
          .map((g) => {
            // lowestPriceCents is the cheapest IN-STOCK price, but listings[0] is the
            // cheapest overall (may be sold out) — link the cheapest in-stock listing
            // so the headline price and the buy link agree. One is guaranteed to exist
            // because the group was filtered to lowestPriceCents != null.
            const best = g.listings.find((l) => l.inStock) ?? g.listings[0];
            // "vs avg" context for sealed: there's no rolling average-price series
            // for sealed products (unlike singles' PriceHistory), but RRP/MSRP is a
            // real, already-computed reference (see lib/msrp.ts, threaded through
            // by getSealedGroups) — so use that instead of fabricating an average.
            // Folded into `note` (same slot `retailerName` already uses) rather than
            // a new field, since the row only has room for one context line.
            let msrpNote: string | null = null;
            if (g.msrpCents != null) {
              const pct = g.overMsrpPct ?? 0;
              msrpNote =
                Math.abs(pct) <= 2 ? "at MSRP" : pct < 0 ? `${Math.round(Math.abs(pct))}% below MSRP` : `${Math.round(pct)}% over MSRP`;
            }
            return {
              dealType: "cheapest-sealed" as const,
              title: g.name,
              subtitle: g.productType,
              href: null,
              outboundUrl: best ? affiliateUrl(best.url, best.retailer) : null,
              outboundRetailer: best?.retailer ?? null,
              imageUrl: g.imageUrl,
              priceCents: g.lowestPriceCents!,
              pctLabel: null,
              deltaCents: null,
              refCents: null,
              note: [best?.retailerName, msrpNote].filter(Boolean).join(" · ") || null,
            };
          });
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
          deltaCents: Math.max(0, p.avgCents - p.currentCents),
          refCents: p.avgCents,
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
