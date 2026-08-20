// "Today's Top Deals" — one normalized feed blending the live deal signals so
// the homepage can surface the best opportunities in the viewer's market:
//   • savings-vs-market  (PREMIUM) — cards eBay is cheapest on vs the best store
//   • price-drops        (free)    — biggest 7-day price falls
//   • cheapest-sealed    (free)    — lowest in-stock sealed products right now
//
// price-drops depends on PriceHistory (AU-only today) and savings needs an eBay
// market, so some columns are naturally empty in some markets — the homepage
// hides empty columns. Each source is independently guarded, so one failing never
// sinks the rest. The one PREMIUM column is gated in the UI (only the single top
// item is rendered to non-subscribers); the data layer itself is ungated.
import { unstable_cache } from "next/cache";
//
// "undervalued" (cards furthest below their 30-day average) USED to be a fourth
// column here — removed from the homepage feed entirely (not just hidden in the
// UI) per a homepage-declutter pass: four competing signals on one page read as
// "study this table," not "here's a deal." The Value Finder tool
// (/tools/value-finder, src/app/tools/value-finder/page.tsx) still calls
// getUndervalued() directly for visitors who want that specific signal — this
// file no longer needs to fetch it just to leave it unrendered.
import type { Country } from "./country";
import { cardHref } from "./card-url";
import { affiliateUrl } from "./affiliate";
import { getEbayCheapest } from "./arbitrage";
import { getPriceMovers } from "./price-history";
import { getSealedGroups } from "./sealed-import";
import { CONTENT_TAG } from "./revalidate-content";
import type { CardTileData } from "@/components/CardTile";

export type DealType = "savings-vs-market" | "price-drops" | "cheapest-sealed";

export type Deal = {
  dealType: DealType;
  title: string;
  subtitle: string | null; // "SET · 123" for singles, productType for sealed
  href: string | null; // internal card page (singles); null for sealed
  outboundUrl: string | null; // external buy link (sealed only)
  outboundRetailer: string | null; // retailer key for OutboundLink logging
  imageUrl: string | null;
  priceCents: number;
  pctLabel: number | null; // magnitude of saving / drop, shown as a badge
  // Absolute dollar counterpart to pctLabel (e.g. the $4.10 in "US$4.10 · Save
  // 47%") — null for a deal type with no natural "delta" (cheapest-sealed has no
  // "was" price, only the MSRP context folded into `note` below).
  deltaCents: number | null;
  // The OTHER side of the comparison priceCents is being measured against — the
  // cheapest-store price for savingsVsMarket, the 7-days-ago price for
  // priceDrops. Null wherever deltaCents is null (cheapest-sealed). Kept for
  // callers that want the full figure (e.g. /tools/deal-finder); the homepage
  // feed's own badge deliberately no longer renders it — see TodaysTopDeals.tsx.
  refCents: number | null;
  note: string | null; // small context, e.g. "vs Card Empire" or "7-day drop"
  // Full card-tile data for singles (savings-vs-market, price-drops), so the
  // homepage can pop the shared QuickView preview on click instead of always
  // navigating to the full card page — null for cheapest-sealed, which isn't a
  // card and has no QuickView equivalent (it already goes straight to an
  // outbound buy link, which is the correct click target for a sealed product).
  card: CardTileData | null;
};

export type TopDeals = {
  savingsVsMarket: Deal[]; // PREMIUM
  priceDrops: Deal[]; // free
  cheapestSealed: Deal[]; // free
  hasAny: boolean;
};

const sub = (c: { setCode: string; collectorNumber: string }) => `${c.setCode} · ${c.collectorNumber}`;

export async function getTopDeals(country: Country, perType = 4): Promise<TopDeals> {
  const [savingsVsMarket, priceDrops, cheapestSealed] = await Promise.all([
    (async (): Promise<Deal[]> => {
      try {
        // "pct", not "saving" (raw dollar amount) — sorting this homepage
        // feed by absolute savings let a four-figure chase card's modest
        // percentage discount outrank an everyday card's much bigger
        // percentage-off deal, just because the dollar figure was larger.
        // TodaysTopDeals' own mixByTier() already tries to interleave a
        // cheap item to the front of the default view, but it can only work
        // with what this fetch hands it — a perType=4 dollar-sorted slice
        // could easily be four uniformly expensive cards with nothing cheap
        // left to interleave. Sorting by percentage upstream fixes that at
        // the source: /tools/deal-finder (the "All opportunities" link this
        // column points to) still defaults to its own sort, unaffected.
        const { items } = await getEbayCheapest(country, "pct", 1, perType);
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
          card: it.card,
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
          card: m.card,
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
              card: null,
            };
          });
      } catch {
        return [];
      }
    })(),
  ]);

  const hasAny = savingsVsMarket.length + priceDrops.length + cheapestSealed.length > 0;
  return { savingsVsMarket, priceDrops, cheapestSealed, hasAny };
}

// Cached wrapper, keyed by market only ["top-deals", country] — so "/" and all
// four region home pages (/au, /uk, /sg, /ca) share ONE cache entry per
// market instead of each route computing its own copy of the same blended
// deal feed. getTopDeals() itself calls getEbayCheapest/getSealedGroups/
// getPriceMovers, none of which are cheap to run six times an hour times five
// routes. Same 1h TTL as the homepage used inline before this was factored
// out — CONTENT_TAG lets the daily import bust it on-demand; the TTL is the
// self-healing fallback for environments where that on-demand ping is skipped.
export function getCachedTopDeals(country: Country): Promise<TopDeals> {
  return unstable_cache(() => getTopDeals(country), ["top-deals", country], {
    revalidate: 3600,
    tags: [CONTENT_TAG],
  })();
}
