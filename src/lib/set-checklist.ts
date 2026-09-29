// A SET'S CATALOGUE WITH THE CHEAPEST REAL-STORE LISTING FOR EACH CARD (2026-09-29,
// DECISIONS.md, "Set tracker"). The server half of lib/set-scope.ts, and the only
// thing the /portfolio/sets pages read to say what a binder is missing and what
// finishing it costs.
//
// WHY ITS OWN QUERY, AND NOT Card.lowestPriceCents*. Those columns are "stores +
// eBay" (prisma/schema.prisma). Summing them for a cost to finish, or reading
// "has a price" as "in stock", would let an eBay-only card count as available
// and a cost to finish quote a price no store charges. So this reads RetailerPrice
// itself: in stock, in the reader's market, not an eBay key, not a converted
// reference row (ALL_FALLBACK_RETAILERS), not a derived (cloned) row, and
// prices at least one cent. The eligibility is lib/alert-price.ts's
// (isAlertEligibleRetailer), so a set page and an alert agree on "a real store".
//
// EGRESS (lib/db.ts). Its own unstable_cache entry, key ['set-checklist', code,
// country], revalidate 3600, tagged CONTENT_TAG so the price import purges it:
// at most one entry per (set, market), about 35, created on demand and never
// prewarmed. Two lean reads inside it, both scoped to ONE set:
//   1. the set's cards, ten narrow columns, capped;
//   2. ONE DB-side groupBy over RetailerPrice for those card ids, by
//      (card, store), min price: roughly 3-5 rows a card of about 60 bytes.
// The assembled entry is about 100 bytes a card for the groupBy result and about
// 150 for the card, so a 400-card set is ~100 KB, far under the ~1.2 MB ceiling
// (rule 2). It calls no self-caching loader and wraps none (rule 6,
// tests/nested-cache.test.ts): 'set-narrative-guide' on the set page is a
// different entry and is neither reused nor wrapped. The revalidate (3600) is
// not below any page's own: /portfolio/sets is force-dynamic, so rule 5's
// segment inheritance has nothing to lower.
//
// The result is the SAME for every reader in a market: it holds no user data.
// Who owns what is a separate, user-scoped, uncached read (lib/set-owned.ts).
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { ALL_FALLBACK_RETAILERS } from "./constants";
import { CONTENT_TAG } from "./revalidate-content";
import { priceField, type Country } from "./country";
import type { ChecklistCard } from "./set-scope";

/** A set is a few hundred cards; the cap is a backstop, not a limit anyone meets. */
const SET_CARD_CAP = 1200;

export const SET_CHECKLIST_KEY = "set-checklist";

/** Pure: fold the per-(card, store) minimums into a card's min price and store count. */
export function foldStoreRows(
  rows: readonly { cardId: string; retailer: string; _min: { priceCents: number | null } }[],
): Map<string, { minCents: number; stores: number }> {
  const out = new Map<string, { minCents: number; stores: number }>();
  for (const r of rows) {
    const p = r._min.priceCents;
    if (p == null || p <= 0) continue;
    const prev = out.get(r.cardId);
    if (!prev) out.set(r.cardId, { minCents: p, stores: 1 });
    else {
      prev.stores++;
      if (p < prev.minCents) prev.minCents = p;
    }
  }
  return out;
}

type Db = Pick<typeof prisma, "card" | "retailerPrice">;

/** The uncached read. Exported so a test can drive it against a stub client. */
export async function readSetChecklist(setCode: string, country: Country, db: Db = prisma): Promise<ChecklistCard[]> {
  const field = priceField(country);
  const cards = (await db.card.findMany({
    where: { setCode },
    select: {
      id: true, slug: true, name: true, collectorNumber: true, rarity: true,
      variant: true, isPromo: true, isOvernumbered: true, setCode: true,
      [field]: true,
    },
    take: SET_CARD_CAP,
  })) as unknown as (Omit<ChecklistCard, "minCents" | "stores" | "otherSource"> & Record<string, unknown>)[];
  if (!cards.length) return [];

  const groups = await db.retailerPrice.groupBy({
    by: ["cardId", "retailer"],
    where: {
      cardId: { in: cards.map((c) => c.id) },
      country,
      inStock: true,
      priceCents: { gt: 0 },
      retailer: { notIn: [...ALL_FALLBACK_RETAILERS] },
      NOT: { retailer: { startsWith: "ebay" } },
      OR: [{ derived: null }, { derived: false }],
    },
    _min: { priceCents: true },
  });
  const byCard = foldStoreRows(groups);

  return cards.map((c) => {
    const hit = byCard.get(c.id);
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      collectorNumber: c.collectorNumber,
      rarity: c.rarity,
      variant: c.variant ?? null,
      isPromo: !!c.isPromo,
      isOvernumbered: !!c.isOvernumbered,
      setCode: c.setCode,
      minCents: hit?.minCents ?? null,
      stores: hit?.stores ?? 0,
      // The market's own price column says something is listed, but no real
      // store has it: an eBay listing (or, in the UK and EU, a reference price).
      otherSource: !hit && typeof c[field] === "number",
    };
  });
}

/**
 * The set's cards with each one's cheapest real-store listing in `country`.
 * Call it directly from a page or route: it caches itself, so it must never sit
 * inside another unstable_cache callback.
 */
export async function getSetChecklist(setCode: string, country: Country): Promise<ChecklistCard[]> {
  return unstable_cache(() => readSetChecklist(setCode, country), [SET_CHECKLIST_KEY, setCode, country], {
    revalidate: 3600,
    tags: [CONTENT_TAG],
  })();
}
