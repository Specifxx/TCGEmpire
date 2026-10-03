import { prisma } from "./db";
import { hasNoRetailChannel, NO_RETAIL_CHANNEL_SETS } from "./constants";
import { cardHistoryDayCount } from "./price-history-store";

// ─────────────────────────────────────────────────────────────────────────────
// "Does this card have a price to show?" — and NOTHING about whether to index.
// ─────────────────────────────────────────────────────────────────────────────
// A CARD PAGE IS ALWAYS INDEXABLE. There is no longer any price condition on
// robots or on the sitemap, and this file no longer exposes one. Read on before
// reinstating it, because it was here for a real reason and the reason expired.
//
// WHAT IT USED TO DO (Phase 7a, docs/adsense-remediation.md): a card with no
// in-stock listing and no price history was noindexed and dropped from
// cards.xml, because such a page "rendered as a shell: a name, a rarity badge,
// a templated sentence and an empty price table" — genuinely low-value content
// for a reviewer sampling /card/* URLs.
//
// WHY THAT PREMISE NO LONGER HOLDS. Phase 7b de-templatised the card narrative
// and took the median card page to ~1,021 unique editorial words. A card with no
// price today still carries its rules text, its art, a printings rail, a FAQ,
// and several paragraphs that say — accurately — that nothing we track has it in
// stock and why. That is not a shell; for a token or a promo rune it is the most
// useful page on the web about that card.
//
// WHY IT WAS ACTIVELY HARMFUL. Indexability was a FUNCTION OF TODAY'S STOCK, and
// it swung both ways: a page that had earned its place in Google's index would
// leave it the day its last listing sold out, taking its accumulated Search
// Console history with it, and have to earn it all back afterwards. The other
// half of the OR was supposed to catch that — a card with recorded history stays
// indexable — and that half keeps failing. When this was measured
// (audit-indexability, 2026-09-17) PriceHistory held zero joinable rows, so
// 1,411 of 1,431 pages were resting on live stock alone. That particular outage
// was fixed hours later by a history-database cutover, which is exactly the
// point: DECISIONS.md records eighteen-plus history project terms, each ending in
// transfer exhaustion within days, each cutover another chance to re-break the
// cardId join. And a card with fewer than MIN_HISTORY_DAYS days of history —
// every newly imported card — was noindexed regardless of how healthy the
// history project was. A safety net that fails that often is not one.
//
// The owner's call, and the right one: ranking takes months to accumulate and a
// page cannot accumulate anything while it is dropping in and out of the index.
// A page that is briefly priceless is worth far less than a page that is
// permanently unranked.
//
// WHAT SURVIVES. `isEmpty` still exists and still means "no price to show" —
// the honest no-listings explainer and the thin-page ad treatment both key off
// it. It is PRESENTATION, not indexing. And `getCanonicalTwin`
// (lib/card-duplicates.ts) still noindexes duplicate rows, which is a
// duplicate-content rule about two URLs for one card, not a judgement about
// whether a card deserves an index slot at all.
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
   * explainer and the thin-page ad treatment both key off this.
   *
   * PRESENTATION ONLY. There is deliberately no `indexable` field any more: a
   * card page is always indexable, and removing the field is what stops this
   * from being quietly rewired into a robots decision again. See the header.
   */
  isEmpty: boolean;
  /** This printing is never sold at retail, so `isEmpty` carries no signal. */
  noRetailChannel: boolean;
};

export function priceStateFrom(
  hasListings: boolean,
  historyDays: number,
  noRetailChannel = false
): CardPriceState {
  const isEmpty = !hasListings && historyDays < MIN_HISTORY_DAYS;
  return { hasListings, historyDays, isEmpty, noRetailChannel };
}

/**
 * Resolve the state for one card. Cheap: a `findFirst` with `take: 1` semantics
 * and a grouped count, both index-covered.
 *
 * Fails OPEN (treated as "has data") if the database is unreachable. That used
 * to be load-bearing, because a blip would otherwise have noindexed the
 * catalogue; now it only means a blip shows the normal page rather than the
 * no-listings explainer, which is still the right way round.
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
      // How many days of price history the card has, from the day files bundled
      // with the release (lib/price-history-store.ts). This runs on EVERY card
      // page, twice (generateMetadata and the body); until 2026-10-03 it was a
      // COUNT(DISTINCT day) against the Neon history project per render, and
      // before that a findMany that pulled the card's whole history to count it.
      Promise.resolve(cardHistoryDayCount(card.id)),
    ]);
    return priceStateFrom(listing != null, days, exempt);
  } catch {
    return priceStateFrom(true, MIN_HISTORY_DAYS, exempt);
  }
}

// getEmptyCardIds() USED TO LIVE HERE and has been deleted, not emptied. It
// returned the card ids to withhold from cards.xml, and with no price condition
// left there is nothing for it to return. Keeping a function that must always
// answer "none" is an invitation to wire it back up; the sitemap now submits
// every card and lib/sitemap-sections.ts says so where the filter used to be.
