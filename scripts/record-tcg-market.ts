/**
 * TCGPLAYER'S MARKET PRICE, ONE POINT PER CARD PER SYDNEY DAY (2026-11-19, owner: "I really really like opcompare's
 * price history where you have the tcgplayer market price as well as the cheapest price locally").
 *
 * Writes data/price-history/tcg-market/<Sydney day>.json (lib/price-history-store.ts), the dashed gold line of the card
 * page's chart. Runs in refresh-prices.yml right after the import, before "Publish the day's price-history files", so
 * the same commit carries it. A second run the same day replaces the day (the store's rule).
 *
 * ONE QUERY, about 1,800 short rows (two columns): the US TCGplayer market rows the import just wrote, never a DERIVED
 * row (a promo with no TCGplayer product of its own would chart its base printing's price), market rows preferred over
 * the legacy "tcgplayer" row per card (preferMarketRows, the rule every market-price reader shares). Never fatal: a
 * failed read only loses the day's point.
 *
 * Usage: npx tsx scripts/record-tcg-market.ts
 */
import { prisma } from "../src/lib/db";
import { preferMarketRows, TCG_US_MARKET_READ_KEYS } from "../src/lib/tcg-market-rows";
import { writeTcgMarketHistoryDay } from "../src/lib/price-history-store";
import { sydneyDay } from "../src/lib/price-history";

async function main() {
  const rows = await prisma.retailerPrice.findMany({
    where: { retailer: { in: [...TCG_US_MARKET_READ_KEYS] }, country: "US", inStock: true, OR: [{ derived: null }, { derived: false }] },
    select: { cardId: true, priceCents: true, retailer: true },
    take: 10000,
  });
  // One market row per card today; should a card ever carry two (foil and non-foil), the lower is its price.
  const low = new Map<string, number>();
  for (const r of preferMarketRows(rows)) {
    if (!(r.priceCents > 0)) continue;
    const prev = low.get(r.cardId);
    if (prev == null || r.priceCents < prev) low.set(r.cardId, r.priceCents);
  }
  const day = sydneyDay();
  const written = writeTcgMarketHistoryDay(day, low);
  console.log(written ? `TCGplayer market history: ${written.count} cards for ${day.toISOString().slice(0, 10)} in ${written.file}.` : "TCGplayer market history: no market rows; the day's file was left as it was.");
}

main()
  .catch((e) => console.warn("::warning::TCGplayer market history not recorded:", e))
  .finally(() => prisma.$disconnect().catch(() => {}));
