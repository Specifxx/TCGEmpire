import { prisma } from "./db";
import { hasNoRetailChannel, NO_RETAIL_CHANNEL_SETS } from "./constants";
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
// COUNTS SNAPSHOT ROWS, AND SNAPSHOTS ARE WEEKLY NOW (see price-import.ts).
// This was 7, meaning 7 daily rows ~ one week of evidence that a card is real
// and tracked. Left at 7 it would have silently become SEVEN WEEKS, holding
// every newly imported card at noindex — and out of sitemaps/cards.xml — for
// most of a quarter. 2 restores the original intent: about a fortnight of
// track record before we vouch for a card with no live listing.
export const MIN_HISTORY_DAYS = 2;

// The no-retail-channel exemption itself lives in constants.ts — card-narrative.ts
// needs the same predicate to stop promising "a price appears the moment a store
// lists it" on a printing no store will ever list, and that module must not pull
// in Prisma. Re-exported here so this file stays the one place to read the rule.
export { NO_RETAIL_CHANNEL_SETS, hasNoRetailChannel } from "./constants";

/** Enough card data on the row for the page to stand on its own without a price. */
export function cardIsSubstantial(card: { description?: string | null; imageUrl?: string | null }): boolean {
  return Boolean(card.description?.trim()) && Boolean(card.imageUrl?.trim());
}

export type CardPriceState = {
  /** Any in-stock listing, in any market. */
  hasListings: boolean;
  /** Distinct days of recorded price history. */
  historyDays: number;
  /**
   * True when there is no price data to show. STILL TRUE for a no-retail-channel
   * printing — the page genuinely has no price, and the "no live listings"
   * explainer and the thin-page ad treatment both key off this. Do not
   * repurpose it as "should we index"; that is `indexable`.
   */
  isEmpty: boolean;
  /** This printing is never sold at retail, so `isEmpty` carries no signal. */
  noRetailChannel: boolean;
  /** The actual robots/sitemap decision. */
  indexable: boolean;
};

export function priceStateFrom(
  hasListings: boolean,
  historyDays: number,
  noRetailChannel = false
): CardPriceState {
  const isEmpty = !hasListings && historyDays < MIN_HISTORY_DAYS;
  return { hasListings, historyDays, isEmpty, noRetailChannel, indexable: !isEmpty || noRetailChannel };
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
export async function getCardPriceState(card: { id: string; setCode: string }): Promise<CardPriceState> {
  // The substance half of the exemption is looked up HERE rather than taken from
  // the caller's row on purpose. Passing it in worked and then silently stopped
  // working, because generateMetadata's `select` does not pull imageUrl — so the
  // page said noindex while the sitemap (which does select it) submitted the URL,
  // the exact contradiction this file exists to prevent. One extra round-trip,
  // only ever for the handful of no-retail-channel printings, buys immunity from
  // every future caller's select.
  let exempt = false;
  if (hasNoRetailChannel(card.setCode)) {
    exempt = await prisma.card
      .findUnique({ where: { id: card.id }, select: { description: true, imageUrl: true } })
      .then((row) => (row ? cardIsSubstantial(row) : false))
      .catch(() => false);
  }
  try {
    const [listing, days] = await Promise.all([
      prisma.retailerPrice.findFirst({
        where: { cardId: card.id, inStock: true },
        select: { id: true },
      }),
      // COUNT(DISTINCT day), NOT findMany({ distinct }) — this needs a number,
      // and it runs on EVERY card page (twice: generateMetadata and the body).
      //
      // It was `findMany({ select: { day: true }, distinct: ["day"], take:
      // MIN_HISTORY_DAYS })`, which reads as "at most 7 rows". Prisma emits
      // (captured from the query log, 2026-08-22):
      //
      //   SELECT "PriceHistory"."id", "PriceHistory"."day" FROM "PriceHistory"
      //   WHERE "PriceHistory"."cardId" = $1 ORDER BY "id" ASC OFFSET $2
      //
      // No DISTINCT, no LIMIT. `distinct` and `take` are BOTH applied in the
      // client, so this pulled that card's ENTIRE history — one row per (day,
      // market), growing every day the importer runs, forever — and then threw
      // all but the count away. On the site's highest-volume page, against the
      // history project, which has itself now rotated through four transfer
      // allowances.
      //
      // getEmptyCardIds() below already does the same counting in Postgres for
      // the whole catalogue; this is the single-card version of it.
      dbHistory
        .$queryRaw<{ days: bigint }[]>`
          SELECT COUNT(DISTINCT day) AS days FROM "PriceHistory" WHERE "cardId" = ${card.id}
        `
        .then((rows) => Number(rows[0]?.days ?? 0))
        .catch(() => 0),
    ]);
    return priceStateFrom(listing != null, days, exempt);
  } catch {
    return priceStateFrom(true, MIN_HISTORY_DAYS, exempt);
  }
}

/**
 * The set of card ids that must NOT be submitted to the sitemap, for the sitemap
 * generator — one pair of grouped queries for the whole catalogue instead of one
 * round-trip per card.
 *
 * "Empty AND not exempt", i.e. the exact complement of `CardPriceState.indexable`
 * above. The two must agree: submitting a URL we simultaneously tell Google not
 * to index is the contradiction this whole file exists to prevent.
 *
 * Fails OPEN too: an empty set means "nothing is excluded", so a database
 * problem degrades to the previous behaviour rather than emptying the sitemap.
 */
export async function getEmptyCardIds(): Promise<Set<string>> {
  try {
    const [allCards, exemptCards, withListings, richHistoryCardIds] = await Promise.all([
      prisma.card.findMany({ select: { id: true } }),
      // The no-retail-channel test needs description+imageUrl, which are far too
      // fat to pull for the whole catalogue (see the egress rules in lib/db.ts).
      // Scoped to the exempt set codes it is a handful of rows.
      prisma.card.findMany({
        where: { setCode: { in: [...NO_RETAIL_CHANNEL_SETS] } },
        select: { id: true, description: true, imageUrl: true },
      }),
      prisma.retailerPrice
        .groupBy({ by: ["cardId"], where: { inStock: true }, _count: { _all: true } })
        .then((rows) => new Set(rows.map((r) => r.cardId))),
      // Was `groupBy({ by: ["cardId", "day"] })` with no threshold — one row PER
      // (card, day) pair across the WHOLE table, every call. PriceHistory has up
      // to one row per (card, day, market), so that grouped result still grows
      // with total card-days recorded FOREVER (this file's caller comment named
      // it as the prime suspect after three straight Neon transfer-allowance
      // rotations in two weeks — the 2026-08-21 HISTORY_DATABASE_URL_4 rotation
      // is the fourth). All this function needs is a boolean per card ("does it
      // have >= MIN_HISTORY_DAYS distinct days"), never the per-day breakdown,
      // so HAVING does the counting in Postgres and only the cards that CLEAR
      // the bar cross the wire — bounded by card count, not by history depth.
      dbHistory.$queryRaw<{ cardId: string }[]>`
        SELECT "cardId"
        FROM "PriceHistory"
        GROUP BY "cardId"
        HAVING COUNT(DISTINCT day) >= ${MIN_HISTORY_DAYS}
      `.catch(() => [] as { cardId: string }[]),
    ]);

    const richHistory = new Set(richHistoryCardIds.map((r) => r.cardId));
    const exempt = new Set(exemptCards.filter(cardIsSubstantial).map((c) => c.id));

    const empty = new Set<string>();
    for (const { id } of allCards) {
      if (withListings.has(id) || richHistory.has(id)) continue;
      if (exempt.has(id)) continue;
      empty.add(id);
    }
    return empty;
  } catch {
    return new Set();
  }
}
