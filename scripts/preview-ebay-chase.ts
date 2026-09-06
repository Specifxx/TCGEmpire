/**
 * Show what the graded panel will actually contain, for one card, against LIVE
 * eBay — before any of it is written to the database.
 *
 * This exists because the panel is invisible until real data lands: it renders
 * nothing when a card has no live slab, which is the correct behaviour and also
 * indistinguishable from "the feature is broken". This runs the exact production
 * search path and prints what the tab would show.
 *
 *   npx tsx scripts/preview-ebay-chase.ts "Akali, Rogue Assassin"
 *   npx tsx scripts/preview-ebay-chase.ts "Jinx" --market US
 *   npx tsx scripts/preview-ebay-chase.ts --list        # pick a card to try
 *
 * Needs EBAY_CLIENT_ID / EBAY_CLIENT_SECRET. Costs 1-2 Browse calls per market
 * per section, and does NOT go through primeEbayBudget — so run it a handful of
 * times, not in a loop.
 */
import { prisma } from "../src/lib/db";
import {
  isEbayEnabled, searchEbayLowest, parseGrade, primeEbayBudget,
  type EbayResult,
} from "../src/lib/ebay";
import { EBAY_ALWAYS_MARKETS, isTwiceDailyPrinting, eBayWorthSearching } from "../src/lib/price-import";
import { formatMoney } from "../src/lib/format";
import { priceField, type Country } from "../src/lib/country";

const args = process.argv.slice(2);
const wantList = args.includes("--list");
const marketArg = (() => {
  const i = args.indexOf("--market");
  return i >= 0 ? args[i + 1]?.toUpperCase() : null;
})();
const nameArg = args.filter((a) => !a.startsWith("--") && a !== marketArg).join(" ").trim();

async function main() {
  if (!isEbayEnabled()) {
    console.error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set — nothing to query.");
    process.exit(1);
  }

  // The cards the feature actually covers, best candidates first. Slabs exist
  // for chase printings; asking about a bulk common proves nothing.
  const candidates = (
    await prisma.card.findMany({
      orderBy: [{ lowestPriceCentsUs: { sort: "desc", nulls: "last" } }],
      take: 400,
      select: {
        id: true, name: true, setCode: true, collectorNumber: true, isPromo: true,
        rarity: true, variant: true, slug: true,
        lowestPriceCents: true, lowestPriceCentsUs: true,
      },
    })
    // Passed explicitly, never as `.filter(eBayWorthSearching)` — filter would
    // hand the array INDEX to the value-floor parameter and skip everything.
    // lowestPriceCentsUs is the cheapest US price rather than TCGplayer's
    // market price specifically, which is close enough to preview with.
  ).filter((c) => eBayWorthSearching(c, c.lowestPriceCentsUs));

  if (wantList || !nameArg) {
    const chase = candidates.filter(isTwiceDailyPrinting).slice(0, 25);
    console.log("\nBest cards to preview (chase printings, most valuable first):\n");
    for (const c of chase) {
      const us = c.lowestPriceCentsUs != null ? formatMoney(c.lowestPriceCentsUs, "USD") : "—";
      const kind = c.isPromo ? "promo" : c.collectorNumber.includes("*") ? "signature" : "overnumbered";
      console.log(`  ${us.padStart(10)}  ${kind.padEnd(12)} ${c.name} (${c.setCode} ${c.collectorNumber})`);
    }
    console.log(`\nRun: npx tsx scripts/preview-ebay-chase.ts "${chase[0]?.name ?? "Card name"}"\n`);
    return;
  }

  const needle = nameArg.toLowerCase();
  const card =
    candidates.find((c) => c.name.toLowerCase() === needle) ??
    candidates.find((c) => c.name.toLowerCase().includes(needle));
  if (!card) {
    console.error(`No searchable card matched "${nameArg}". Try --list.`);
    process.exit(1);
  }

  const markets = marketArg
    ? EBAY_ALWAYS_MARKETS.filter((m) => m.country === marketArg)
    : EBAY_ALWAYS_MARKETS;
  if (markets.length === 0) {
    console.error(`--market ${marketArg} is not one of: ${EBAY_ALWAYS_MARKETS.map((m) => m.country).join(", ")}`);
    process.exit(1);
  }

  await primeEbayBudget();
  const [rawNum, total] = card.collectorNumber.split("/");
  const identity = {
    name: card.name,
    setCode: card.setCode,
    number: rawNum.replace(/\*/g, ""),
    total: total ?? "",
    isSignature: card.collectorNumber.includes("*"),
    isPromo: card.isPromo,
  };

  console.log(`\n${"═".repeat(72)}`);
  console.log(`  ${card.name}  ·  ${card.setCode} ${card.collectorNumber}`);
  console.log(`  /card/${card.slug ?? card.id}`);
  console.log(`  twice-daily refresh: ${isTwiceDailyPrinting(card) ? "YES" : "no (base print)"}`);
  console.log(`${"═".repeat(72)}`);

  for (const mkt of markets) {
    const marketPrice = (card as any)[priceField(mkt.country as Country)] as number | null;
    console.log(`\n▸ ${mkt.country}  (our cheapest raw: ${marketPrice ? formatMoney(marketPrice, mkt.currency) : "none tracked"})`);

    // ── Graded, captured exactly as the importer does: free, off the price call.
    const graded: EbayResult[] = [];
    await searchEbayLowest(
      { ...identity, marketplace: mkt.marketplace, referenceCents: marketPrice ?? undefined },
      undefined,
      undefined,
      graded,
    );
    console.log(`\n  GRADED tab — ${graded.length} slab(s)`);
    if (graded.length === 0) console.log("    (nothing; the tab would not appear)");
    for (const g of graded.slice(0, 6)) {
      const { grader, grade } = parseGrade(g.title);
      const mult = marketPrice ? ` · ${(g.priceCents / marketPrice).toFixed(1)}× raw` : "";
      const label = grader ? `${grader}${grade != null ? " " + grade : " (no grade stated)"}` : "graded";
      console.log(`    ${label.padEnd(22)} ${formatMoney(g.priceCents, mkt.currency).padStart(10)}${mult}`);
      console.log(`      ${g.title.slice(0, 66)}`);
    }
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
