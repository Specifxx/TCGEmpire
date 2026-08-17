// Data for the homepage's "proof strip" — the PCPartPicker pattern: prove the
// price-comparison value proposition with one real card and its real prices,
// rather than describing the search → compare → buy mechanic in three
// abstract steps (that explainer still exists — see components/home/
// HowItWorks.tsx — it just now lives on /about instead of the homepage).
//
// This is NEW aggregation code, built the same way lib/top-deals.ts already
// blends several signals: it reads the same shared, read-only building blocks
// the card page itself uses (computeMarket() in lib/market-rows.ts,
// effectiveShippingCents() in lib/retailers.ts) rather than reimplementing
// price ranking — neither of those files is modified. Per this task's scope
// rules, pricing-logic files may be read for their data shape but not edited;
// this file only imports from them.
import { prisma } from "./db";
import { DEFAULT_COUNTRY, type Country } from "./country";
import { computeMarket, type MarketRow } from "./market-rows";
import { effectiveShippingCents } from "./retailers";
import { affiliateUrl } from "./affiliate";
import { cardHref } from "./card-url";

export interface ProofStripStore {
  retailer: string;
  retailerName: string;
  priceCents: number;
  /** Item price + effective shipping — the ranking rule the card page itself
   *  uses (market-rows.ts), not item price alone. */
  deliveredCents: number;
  buyHref: string;
}

export interface ProofStripPick {
  card: {
    id: string;
    slug: string | null;
    name: string;
    setCode: string;
    collectorNumber: string;
    imageThumbUrl: string | null;
  };
  href: string;
  currency: string;
  /** Up to SHOW_STORES distinct stores, cheapest TOTAL DELIVERED cost first. */
  stores: ProofStripStore[];
  /** stores[last].deliveredCents − stores[0].deliveredCents — the headline saving. */
  savingsCents: number;
}

export interface ProofCandidate {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
}

/** Two prices don't read as "compared" — three do. Below this, skip the card
 *  entirely rather than show a thin, unconvincing comparison. */
const MIN_STORES = 3;
const SHOW_STORES = 3;

/**
 * Picks the first candidate (in the order given — callers should pass their
 * most-popular-first list, e.g. the homepage's own `popularCards`) that has
 * at least MIN_STORES distinct in-stock listings in `country`, and returns
 * its cheapest three ranked by total delivered cost.
 *
 * Two queries, not one per candidate: a single small groupBy across every
 * candidate finds out WHICH card (if any) qualifies, then one more query
 * fetches the full rows only for that winner. Both are scoped to a handful of
 * candidate ids for one market — never a table scan (see lib/db.ts's egress
 * rules). The common case (a market with nothing yet) costs exactly one query.
 */
export async function getProofStripPick(
  candidates: ProofCandidate[],
  country: Country = DEFAULT_COUNTRY,
): Promise<ProofStripPick | null> {
  if (candidates.length === 0) return null;
  const ids = candidates.map((c) => c.id);

  // Cheapest LISTING per (card, retailer) — de-duplicates a store's own
  // NM/foil variants the same way market-rows.ts's storeCount does, so a
  // store with two conditions in stock doesn't get counted as two stores.
  const grouped = await prisma.retailerPrice.groupBy({
    by: ["cardId", "retailer"],
    where: { cardId: { in: ids }, country, inStock: true },
    _min: { priceCents: true },
  });
  const storeCountByCard = new Map<string, number>();
  for (const g of grouped) {
    storeCountByCard.set(g.cardId, (storeCountByCard.get(g.cardId) ?? 0) + 1);
  }
  // Preserve the caller's popularity order — the first QUALIFYING card wins,
  // not the cheapest one or the best-stocked one.
  const winner = candidates.find((c) => (storeCountByCard.get(c.id) ?? 0) >= MIN_STORES);
  if (!winner) return null;

  const rows = await prisma.retailerPrice.findMany({
    where: { cardId: winner.id, country, inStock: true },
    select: {
      id: true, retailer: true, retailerName: true, priceCents: true,
      shippingCents: true, condition: true, isFoil: true, url: true, lastSeen: true,
    },
  });

  const marketRows: MarketRow[] = rows.map((r) => ({
    id: r.id,
    country,
    retailer: r.retailer,
    retailerName: r.retailerName,
    priceCents: r.priceCents,
    ship: effectiveShippingCents(r.shippingCents),
    condition: r.condition,
    isFoil: r.isFoil,
    inStock: true,
    lastSeen: r.lastSeen.toISOString(),
    // Default `loc` (SITE_URL) resolves to the "home" sub-id inside
    // affiliateUrl — correct, since this click happens on the homepage, not
    // on the card's own page.
    buyHref: affiliateUrl(r.url, r.retailer),
    policyUrl: null,
  }));
  const view = computeMarket(marketRows, country);

  // One listing per retailer (its cheapest), ranked by total delivered cost —
  // matches the card page's own "cheapest first" contract.
  const seenRetailers = new Set<string>();
  const distinct = view.prices
    .filter((p) => (seenRetailers.has(p.retailer) ? false : (seenRetailers.add(p.retailer), true)))
    .sort((a, b) => a.delivered - b.delivered)
    .slice(0, SHOW_STORES);
  // The groupBy above counts fallback-retailer rows (TCGplayer-UK/AU/SG
  // reference prices, never shown as a buyable "store" — see computeMarket's
  // own comment) that computeMarket then filters back out, so a card that
  // looked qualified can still fall short here. Fail closed rather than show
  // fewer than three.
  if (distinct.length < MIN_STORES) return null;

  return {
    card: {
      id: winner.id,
      slug: winner.slug,
      name: winner.name,
      setCode: winner.setCode,
      collectorNumber: winner.collectorNumber,
      imageThumbUrl: winner.imageThumbUrl,
    },
    href: cardHref(winner),
    currency: view.currency,
    stores: distinct.map((p) => ({
      retailer: p.retailer,
      retailerName: p.retailerName,
      priceCents: p.priceCents,
      deliveredCents: p.delivered,
      buyHref: p.buyHref,
    })),
    savingsCents: distinct[distinct.length - 1].delivered - distinct[0].delivered,
  };
}
