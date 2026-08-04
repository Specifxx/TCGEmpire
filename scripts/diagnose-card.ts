/**
 * Read-only: why does THIS card have no price?
 *
 * "Card X isn't updating" is one of the most common reports and the slowest to
 * answer, because the honest answer is one of several very different things and
 * the card page shows the same empty state for all of them:
 *   • no store stocks it (correct, nothing to fix);
 *   • eBay has listings but our matcher rejects them (a matching bug);
 *   • eBay was never queried for it (budget/quota ran out);
 *   • it has no TCGplayer row (a product-matching gap);
 *   • rows exist but are stale/orphaned.
 *
 * This prints the evidence for each, and — crucially — re-runs the LIVE eBay
 * search so you can see what the matcher does with today's listings rather than
 * guessing from yesterday's rows.
 *
 * Usage (CI): DIAG_CARD="akali rogue assassin" npx tsx scripts/diagnose-card.ts
 *   DIAG_CARD     name fragment, slug, collector number, or card id (required)
 *   DIAG_COUNTRY  market for the live eBay re-search (default AU)
 */
import { prisma } from "../src/lib/db";
import { searchEbayLowest, type EbayResult } from "../src/lib/ebay";
import { EBAY_ALWAYS_MARKETS, EBAY_ROTATING_MARKETS } from "../src/lib/price-import";

const fmt = (cents: number | null | undefined, cur = "AUD") =>
  cents == null ? "—" : `${cur} ${(cents / 100).toFixed(2)}`;

async function main() {
  const q = (process.env.DIAG_CARD || "").trim();
  if (!q) {
    console.error('Set DIAG_CARD, e.g. DIAG_CARD="akali rogue assassin"');
    process.exit(1);
  }
  const country = (process.env.DIAG_COUNTRY || "AU").toUpperCase();

  const cards = await prisma.card.findMany({
    where: {
      OR: [
        { id: q },
        { slug: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { collectorNumber: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true, slug: true, name: true, setCode: true, setName: true, rarity: true,
      collectorNumber: true, variant: true, isPromo: true, isOvernumbered: true,
      lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true,
    },
    take: 12,
  });

  if (!cards.length) {
    console.log(`No card matches ${JSON.stringify(q)}.`);
    return;
  }
  console.log(`${cards.length} card(s) match ${JSON.stringify(q)}.\n`);

  for (const c of cards) {
    console.log("═".repeat(78));
    console.log(`${c.name}  —  ${c.setCode} ${c.collectorNumber}  [${c.rarity}]`);
    console.log(`  id=${c.id}  slug=${c.slug}`);
    console.log(
      `  variant=${c.variant ?? "—"}  isPromo=${c.isPromo}  isOvernumbered=${c.isOvernumbered}` +
        `  signature=${c.collectorNumber.includes("*")}`,
    );
    console.log(
      `  denormalised lows: AU=${fmt(c.lowestPriceCents)} US=${fmt(c.lowestPriceCentsUs, "USD")} UK=${fmt(c.lowestPriceCentsUk, "GBP")}`,
    );

    const prices = await prisma.retailerPrice.findMany({
      where: { cardId: c.id },
      select: {
        retailer: true, retailerName: true, country: true, currency: true,
        priceCents: true, shippingCents: true, inStock: true, isFoil: true,
        condition: true, lastSeen: true, title: true,
      },
      orderBy: [{ country: "asc" }, { priceCents: "asc" }],
    });
    console.log(`\n  RetailerPrice rows: ${prices.length}`);
    for (const p of prices) {
      console.log(
        `    ${p.country} ${p.retailer.padEnd(18)} ${fmt(p.priceCents, p.currency).padStart(14)}` +
          ` inStock=${p.inStock ? "Y" : "N"} foil=${p.isFoil ? "Y" : "N"}` +
          ` seen=${p.lastSeen.toISOString().slice(0, 16)}  ${(p.title ?? "").slice(0, 50)}`,
      );
    }
    if (!prices.length) console.log("    (none — this is why the page shows no price)");

    const ads = await prisma.ebayAdListing
      .findMany({
        where: { cardId: c.id },
        select: { country: true, rank: true, priceCents: true, currency: true, title: true, updatedAt: true },
        orderBy: [{ country: "asc" }, { rank: "asc" }],
      })
      .catch(() => [] as { country: string; rank: number; priceCents: number; currency: string; title: string; updatedAt: Date }[]);
    console.log(`\n  EbayAdListing (carousel) rows: ${ads.length}`);
    for (const a of ads) {
      console.log(
        `    ${a.country} #${a.rank} ${fmt(a.priceCents, a.currency).padStart(14)}` +
          ` written=${a.updatedAt.toISOString().slice(0, 16)}  ${a.title.slice(0, 56)}`,
      );
    }
    // THE TELL. Carousel rows with no matching price row for the same market
    // means the carousel is showing listings the price pass no longer finds —
    // i.e. stale ads that were never cleared.
    const adCountries = new Set(ads.map((a) => a.country));
    for (const cc of adCountries) {
      const hasPrice = prices.some((p) => p.country === cc && p.retailer.startsWith("ebay"));
      if (!hasPrice) {
        console.log(
          `    ⚠ ${cc}: carousel has ${ads.filter((a) => a.country === cc).length} listing(s) but NO eBay price row — ` +
            `stale carousel, or today's search matched nothing.`,
        );
      }
    }

    // Live re-search: what does the matcher do with TODAY's listings?
    const mkt =
      [...EBAY_ALWAYS_MARKETS, ...EBAY_ROTATING_MARKETS].find((m) => m.country === country) ?? EBAY_ALWAYS_MARKETS[0];
    const [rawNum, total] = c.collectorNumber.split("/");
    const captured: EbayResult[] = [];
    console.log(`\n  LIVE eBay ${mkt.country} re-search…`);
    const hit = await searchEbayLowest(
      {
        name: c.name,
        setCode: c.setCode,
        number: rawNum.replace(/\*/g, ""),
        total: total ?? "",
        isSignature: c.collectorNumber.includes("*"),
        isPromo: c.isPromo,
        marketplace: mkt.marketplace,
      },
      captured,
    ).catch((e) => {
      console.log(`    search threw: ${(e as Error).message}`);
      return null;
    });
    console.log(`    listings passing every filter: ${captured.length}`);
    for (const l of captured) console.log(`      ${fmt(l.priceCents, mkt.currency).padStart(14)}  ${l.title.slice(0, 60)}`);
    console.log(
      hit
        ? `    → would price at ${fmt(hit.priceCents, mkt.currency)} — so the importer simply has not re-run for this card.`
        : `    → NO match. Either eBay genuinely has no listing for this exact printing, or the title filters reject them all.`,
    );
    console.log();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
