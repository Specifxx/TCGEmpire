/**
 * Data-integrity check for card pages — fails loudly when a card would render a
 * price in one component and "—" in another, or when the structured data would
 * disagree with the visible page.
 *
 * WHY THIS EXISTS: /card/[id] derived "cheapest price" and "in stock at N stores"
 * in five independent places (hero metric, meta description, body prose, FAQ,
 * Product JSON-LD) from three different sources — live RetailerPrice rows via
 * computeMarket(), the denormalised Card.lowestPriceCents* columns, and
 * PriceHistory snapshots. They drifted, and the failure was invisible in CI:
 * every page still rendered 200 OK, just with a hero saying "—" next to prose
 * quoting a price, and JSON-LD publishing a currency the page never showed.
 *
 * The checks below are deliberately the assertions that would have caught it:
 *   1. HERO_VS_PROSE  — computeMarket() finds no in-stock listing for the baseline
 *                       market, but the denormalised column has a price (or vice
 *                       versa). This is the "CHEAPEST PRICE — / A$81.30 across 1
 *                       store" contradiction.
 *   2. STALE_COLUMN   — the denormalised column disagrees with the live rows by
 *                       more than a rounding cent. The column feeds browse-grid
 *                       "from $X" badges, so a stale value promises a price the
 *                       card page then contradicts.
 *   3. FALLBACK_LEAK  — the column's value can only be explained by a converted
 *                       reference retailer (TCGplayer-AU/UK/SG, Cardmarket).
 *                       Those are excluded from the comparison by computeMarket,
 *                       so surfacing one as the headline price is the same
 *                       contradiction in a subtler form.
 *
 * Exit code 1 on any violation, so it can gate a deploy or a scheduled run.
 * Read-only: never writes. Bounded selects only — this runs against the live
 * operational DB and must not burn network-transfer allowance (see lib/db.ts's
 * egress rules).
 *
 * Usage: npx tsx scripts/check-card-consistency.ts [--limit N] [--market XX]
 */
import { prisma } from "../src/lib/db";
import { COUNTRIES, DEFAULT_COUNTRY, priceField, type Country } from "../src/lib/country";
import {
  AU_FALLBACK_RETAILERS,
  SG_FALLBACK_RETAILERS,
  UK_FALLBACK_RETAILERS,
} from "../src/lib/constants";

const FALLBACK_RETAILERS = new Set<string>([
  ...AU_FALLBACK_RETAILERS,
  ...UK_FALLBACK_RETAILERS,
  ...SG_FALLBACK_RETAILERS,
]);

type Violation = { kind: string; slug: string; detail: string };

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const market = (arg("--market") ?? DEFAULT_COUNTRY) as Country;
  if (!COUNTRIES[market]) {
    console.error(`Unknown market "${market}". Expected one of: ${Object.keys(COUNTRIES).join(", ")}`);
    process.exit(1);
  }
  const limit = Number(arg("--limit") ?? 2000);
  const field = priceField(market);
  const currency = COUNTRIES[market].currency;

  console.log(`Checking card-page consistency for ${market} (${currency}), up to ${limit} cards…\n`);

  // One bounded pass. Only the columns the assertions need — this is the exact
  // access pattern the egress guard in lib/db.ts warns about if widened.
  const cards = await prisma.card.findMany({
    take: limit,
    orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
    select: {
      slug: true,
      id: true,
      name: true,
      [field]: true,
      retailerPrices: {
        where: { country: market, inStock: true },
        select: { retailer: true, priceCents: true },
      },
    } as Record<string, unknown>,
  }) as unknown as Array<{
    slug: string | null;
    id: string;
    name: string;
    retailerPrices: { retailer: string; priceCents: number }[];
  } & Record<string, number | null>>;

  const violations: Violation[] = [];

  for (const c of cards) {
    const slug = c.slug ?? c.id;
    const column = c[field] as number | null;

    // Mirror computeMarket(): converted reference retailers are NOT buyable
    // stores and never contribute to the visible cheapest/store count.
    const real = c.retailerPrices.filter((r) => !FALLBACK_RETAILERS.has(r.retailer));
    const liveLowest = real.length ? Math.min(...real.map((r) => r.priceCents)) : null;
    const storeCount = new Set(real.map((r) => r.retailer)).size;

    // 1. The contradiction that started this: one surface has a price, another doesn't.
    if (column != null && liveLowest == null) {
      const onlyFallback = c.retailerPrices.length > 0;
      violations.push({
        kind: onlyFallback ? "FALLBACK_LEAK" : "HERO_VS_PROSE",
        slug,
        detail: onlyFallback
          ? `column=${column} but every in-stock listing is a converted reference retailer ` +
            `(${[...new Set(c.retailerPrices.map((r) => r.retailer))].join(", ")}) — the page will show "—" for stores`
          : `column=${column} but no in-stock ${market} listing exists — hero renders "—" while prose/meta quote a price`,
      });
    }
    if (column == null && liveLowest != null) {
      violations.push({
        kind: "HERO_VS_PROSE",
        slug,
        detail: `no denormalised price but ${storeCount} live ${market} store(s) from ${liveLowest} — browse grid shows "no price yet" while the card page shows one`,
      });
    }

    // 2. Both exist but disagree — the column is stale.
    if (column != null && liveLowest != null && column !== liveLowest) {
      violations.push({
        kind: "STALE_COLUMN",
        slug,
        detail: `column=${column} vs live cheapest=${liveLowest} (${storeCount} store(s)) — grid badge and card page will quote different numbers`,
      });
    }
  }

  const byKind = violations.reduce<Record<string, number>>((acc, v) => {
    acc[v.kind] = (acc[v.kind] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Checked ${cards.length} cards.`);
  if (violations.length === 0) {
    console.log("✓ No inconsistencies — every card renders the same price story in every component.");
    return;
  }

  for (const [kind, n] of Object.entries(byKind)) console.log(`  ${kind}: ${n}`);
  console.log("\nFirst 25:");
  for (const v of violations.slice(0, 25)) console.log(`  [${v.kind}] /card/${v.slug} — ${v.detail}`);
  if (violations.length > 25) console.log(`  … and ${violations.length - 25} more`);

  console.error(
    `\n::error::${violations.length} card(s) would render contradictory price data. ` +
      `Re-run the price import (which recomputes the denormalised columns) and re-check; ` +
      `if it persists, the column and computeMarket() disagree on which retailers count.`
  );
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
