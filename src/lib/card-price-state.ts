import { prisma } from "./db";
import { dbHistory } from "./db-history";

// ─────────────────────────────────────────────────────────────────────────────
// "Does this card have enough price data to be worth indexing?"
// ─────────────────────────────────────────────────────────────────────────────
// ONE rule, consumed by three places that must never disagree:
//   • app/card/[id]/page.tsx  generateMetadata → robots index:false when EMPTY
//   • lib/sitemap-sections.ts cards()          → EMPTY cards are left out
//   • scripts/adsense-audit.ts                 → measures the same population
//
// Roughly a tenth of the catalogue has no live listing anywhere. Those pages
// rendered as a shell: a name, a rarity badge, a templated sentence and an empty
// price table. A reviewer sampling random /card/* URLs lands on one about one
// time in ten, and that is precisely what "low-value content" means — not that
// the page is malicious, but that there is nothing on it.
//
// THE RE-INDEX PATH IS AUTOMATIC AND DATA-DRIVEN. There is no manual list, no
// allowlist to maintain and nothing to remember. A card becomes indexable again
// the moment either condition below turns true, because both the metadata and
// the sitemap re-evaluate this same query on their next regeneration:
//   • at least one IN-STOCK retailer listing, in any market; or
//   • at least MIN_HISTORY_DAYS distinct days of recorded price history.
//
// Why history counts even with no listing today: a card that has traded for a
// week has a real chart, a real trend paragraph and a real range — genuinely
// useful, and worth indexing, even while it is briefly out of stock everywhere.
export const MIN_HISTORY_DAYS = 7;

export type CardPriceState = {
  /** Any in-stock listing, in any market. */
  hasListings: boolean;
  /** Distinct days of recorded price history. */
  historyDays: number;
  /** True when the page has nothing of substance to show. */
  isEmpty: boolean;
};

export function priceStateFrom(hasListings: boolean, historyDays: number): CardPriceState {
  return { hasListings, historyDays, isEmpty: !hasListings && historyDays < MIN_HISTORY_DAYS };
}

/**
 * Resolve the state for one card. Cheap: a `findFirst` with `take: 1` semantics
 * and a grouped count, both index-covered.
 *
 * Fails OPEN (treated as "has data", i.e. indexable) if the database is
 * unreachable. A transient DB blip must never noindex the catalogue — losing
 * 1,000 indexed pages to a timeout is far worse than briefly indexing a handful
 * of empty ones.
 */
export async function getCardPriceState(cardId: string): Promise<CardPriceState> {
  try {
    const [listing, days] = await Promise.all([
      prisma.retailerPrice.findFirst({
        where: { cardId, inStock: true },
        select: { id: true },
      }),
      dbHistory.priceHistory
        .findMany({ where: { cardId }, select: { day: true }, distinct: ["day"], take: MIN_HISTORY_DAYS })
        .then((rows) => rows.length)
        .catch(() => 0),
    ]);
    return priceStateFrom(listing != null, days);
  } catch {
    return priceStateFrom(true, MIN_HISTORY_DAYS);
  }
}

/**
 * The set of card ids that are EMPTY, for the sitemap generator — one pair of
 * grouped queries for the whole catalogue instead of one round-trip per card.
 *
 * Fails OPEN too: an empty set means "nothing is excluded", so a database
 * problem degrades to the previous behaviour rather than emptying the sitemap.
 */
export async function getEmptyCardIds(): Promise<Set<string>> {
  try {
    const [allCards, withListings, historyRows] = await Promise.all([
      prisma.card.findMany({ select: { id: true } }),
      prisma.retailerPrice
        .groupBy({ by: ["cardId"], where: { inStock: true }, _count: { _all: true } })
        .then((rows) => new Set(rows.map((r) => r.cardId))),
      dbHistory.priceHistory
        .groupBy({ by: ["cardId", "day"], _count: { _all: true } })
        .then((rows) => rows)
        .catch(() => [] as { cardId: string }[]),
    ]);

    const daysByCard = new Map<string, number>();
    for (const row of historyRows) daysByCard.set(row.cardId, (daysByCard.get(row.cardId) ?? 0) + 1);

    const empty = new Set<string>();
    for (const { id } of allCards) {
      if (!withListings.has(id) && (daysByCard.get(id) ?? 0) < MIN_HISTORY_DAYS) empty.add(id);
    }
    return empty;
  } catch {
    return new Set();
  }
}
