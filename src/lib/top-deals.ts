// "Today's Top Deals" — one normalized feed blending the live deal signals so
// the homepage can surface the best opportunities in the viewer's market:
//   • savings-vs-market  (PREMIUM) — cards eBay is cheapest on vs the best store
//   • price-drops        (free)    — biggest 7-day price falls
//   • cheapest-sealed    (free)    — lowest in-stock sealed products right now
//   • rising-cards       (PREMIUM) — the Rising Cards screener's top picks
//
// price-drops depends on PriceHistory (AU-only today) and savings needs an eBay
// market, so some columns are naturally empty in some markets — the homepage
// hides empty columns. Each source is independently guarded, so one failing never
// sinks the rest. Both PREMIUM columns are gated in the UI (only the single top
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
//
// Rising Cards was added as a FOURTH column on 2026-08-20, a deliberate
// reversal of part of that declutter call (explicit request) — the grid can
// now show up to four columns on a given day instead of three. Kept as its
// own gated PREMIUM column rather than folded into savings-vs-market so its
// distinct screener (demand + price-timing, not "cheaper on eBay than in
// stores") stays legible as its own signal.
import type { Country } from "./country";
import { cardHref } from "./card-url";
import { affiliateUrl } from "./affiliate";
import { getEbayCheapest } from "./arbitrage";
import { getPriceMovers } from "./price-history";
import { getSealedGroups } from "./sealed-import";
import { getRisingCards } from "./rise-predictor";
import { CONTENT_TAG } from "./revalidate-content";
import type { CardTileData } from "@/components/CardTile";

export type DealType = "savings-vs-market" | "price-drops" | "cheapest-sealed" | "rising-cards";

// The Deal[]-valued keys of TopDeals — i.e. NOT hasAny (boolean) and NOT the
// *Total number fields (savingsVsMarketTotal, risingCardsTotal). Shared so
// TodaysTopDeals.tsx and DealsRow.tsx both index TopDeals the same narrow way
// instead of each re-deriving it from `keyof Omit<TopDeals, "hasAny">`, which
// would incorrectly include those number fields too.
export type DealColumnKey = "savingsVsMarket" | "priceDrops" | "cheapestSealed" | "risingCards";

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
  // The REAL count behind the Premium gate — getEbayCheapest's own `total`,
  // never derived from savingsVsMarket.length. That array is capped at perType
  // (4) for this feed regardless of how many deals actually exist, so
  // items.length - 1 would silently understate "how many more" to almost
  // every visitor almost every day (there are usually well over 4). The
  // homepage teaser reads this field instead — see TodaysTopDeals.tsx.
  savingsVsMarketTotal: number;
  priceDrops: Deal[]; // free
  cheapestSealed: Deal[]; // free
  risingCards: Deal[]; // PREMIUM
  // Real total behind the gate, same reasoning as savingsVsMarketTotal — capped
  // at the Rising Cards screener's own DISPLAY limit (40), not at perType.
  risingCardsTotal: number;
  hasAny: boolean;
};

const sub = (c: { setCode: string; collectorNumber: string }) => `${c.setCode} · ${c.collectorNumber}`;

export async function getTopDeals(country: Country, perType = 4): Promise<TopDeals> {
  const [savings, priceDrops, cheapestSealed, rising] = await Promise.all([
    (async (): Promise<{ deals: Deal[]; total: number }> => {
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
        const { items, total } = await getEbayCheapest(country, "pct", 1, perType);
        const deals = items.map((it) => ({
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
        return { deals, total };
      } catch {
        return { deals: [], total: 0 };
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
    (async (): Promise<{ deals: Deal[]; total: number }> => {
      try {
        // Per-market scope (not GLOBAL, the tool's own default): every other
        // column here is genuinely priced in the visitor's market, and
        // RisePick.priceCents is only safe to show under the country's
        // currency symbol when that country WAS the scope — GLOBAL mixes each
        // card's own basis-market price under one blended view. Cache key
        // matches /tools/rising's own ["rising-cards-public", scope] exactly,
        // so a visit to either page warms the same entry — no extra query
        // cost for adding this column on top of the tool that already exists.
        const analysis = await unstable_cache(() => getRisingCards(country), ["rising-cards-public", country], {
          revalidate: 3600,
          tags: [CONTENT_TAG],
        })();
        const priced = analysis.picks.filter((p) => p.priceCents != null);
        const deals = priced.slice(0, perType).map((p) => ({
          dealType: "rising-cards" as const,
          title: p.displayName,
          subtitle: sub(p),
          href: cardHref(p),
          outboundUrl: null,
          outboundRetailer: null,
          imageUrl: p.imageThumbUrl,
          priceCents: p.priceCents!,
          pctLabel: p.score,
          deltaCents: null,
          refCents: null,
          note: `${p.confidence} confidence`,
          card: null,
        }));
        // The real total, not the perType slice — same fix as savingsVsMarket
        // above. Already capped at the tool's own DISPLAY limit (40), which is
        // a genuine, disclosed limit of the screener itself, not a hidden
        // homepage-feed truncation.
        return { deals, total: priced.length };
      } catch {
        return { deals: [], total: 0 };
      }
    })(),
  ]);

  const hasAny = savings.deals.length + priceDrops.length + cheapestSealed.length + rising.deals.length > 0;
  return {
    savingsVsMarket: savings.deals,
    savingsVsMarketTotal: savings.total,
    priceDrops,
    cheapestSealed,
    risingCards: rising.deals,
    risingCardsTotal: rising.total,
    hasAny,
  };
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
