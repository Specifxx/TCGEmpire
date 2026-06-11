/**
 * Card-database integrity audit. READ-ONLY by default; prints a sectioned report.
 *
 * With --fix, repairs ONLY the two provably-safe derived fields:
 *   • missing slug            → backfilled from cardSlug() (collision-suffixed)
 *   • empty/stale nameNormalized → recomputed from the name (cards with a broken
 *     index are INVISIBLE to name search)
 * Everything else (price drift, zombie listings, duplicates…) is report-only —
 * those need a human or the importer, not a blind script.
 *
 * Usage:
 *   npx tsx scripts/db-audit.ts          # report only
 *   npx tsx scripts/db-audit.ts --fix    # report + safe fixes
 *
 * Run in CI via .github/workflows/db-audit.yml (needs DATABASE_URL).
 */
import { prisma } from "../src/lib/db";
import { cardSlug } from "../src/lib/card-url";
import { normalizeSearch } from "../src/lib/format";
import { DOMAIN_KEYS, RARITY_KEYS, CARD_TYPES, SETS } from "../src/lib/constants";

const FIX = process.argv.includes("--fix");
const MAX_SAMPLES = 10;

let issues = 0;
function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}
function report(label: string, items: string[], total = items.length) {
  if (total === 0) {
    console.log(`  ✓ ${label}: none`);
    return;
  }
  issues += total;
  console.log(`  ✗ ${label}: ${total}`);
  for (const s of items.slice(0, MAX_SAMPLES)) console.log(`      - ${s}`);
  if (total > MAX_SAMPLES) console.log(`      … and ${total - MAX_SAMPLES} more`);
}

async function main() {
  const cards = await prisma.card.findMany({
    select: {
      id: true, slug: true, name: true, nameNormalized: true, externalId: true,
      setCode: true, setName: true, collectorNumber: true, variant: true,
      isPromo: true, domain: true, type: true, rarity: true, imageUrl: true,
      lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true,
      lowestPriceCentsUk: true, ebayCheckedAt: true,
    },
  });
  const label = (c: (typeof cards)[number]) =>
    `${c.name} ${c.setCode} ${c.collectorNumber}${c.isPromo ? " [promo]" : ""} (${c.slug ?? c.id})`;

  section(`Overview`);
  const bySet = new Map<string, number>();
  for (const c of cards) bySet.set(c.setCode, (bySet.get(c.setCode) ?? 0) + 1);
  console.log(`  ${cards.length} cards · ` + [...bySet.entries()].map(([s, n]) => `${s}:${n}`).join(" · "));
  console.log(`  promos: ${cards.filter((c) => c.isPromo).length} · alt-arts: ${cards.filter((c) => c.variant).length}`);

  // ── Identity & search index ──────────────────────────────────────────────────
  section("Identity & search index");
  const missingSlug = cards.filter((c) => !c.slug);
  report("cards missing a slug (cuid URLs, weak SEO)", missingSlug.map(label));

  const badIndex = cards.filter((c) => c.nameNormalized !== normalizeSearch(c.name));
  report("nameNormalized out of sync (INVISIBLE to name search)", badIndex.map(label));

  // Slug drift is informational — fixing it would break live URLs, so never auto-fix.
  const drift = cards.filter((c) => c.slug && c.slug !== cardSlug(c) && !c.slug.startsWith(cardSlug(c)));
  if (drift.length) {
    console.log(`  ℹ slug differs from current cardSlug() formula: ${drift.length} (informational — do NOT mass-change live URLs)`);
    for (const c of drift.slice(0, 5)) console.log(`      - ${c.slug} ≠ ${cardSlug(c)}`);
  } else {
    console.log("  ✓ all slugs match the cardSlug() formula");
  }

  // ── Duplicates ───────────────────────────────────────────────────────────────
  section("Duplicates");
  const seen = new Map<string, (typeof cards)[number]>();
  const dupes: string[] = [];
  for (const c of cards) {
    const key = `${c.setCode}|${c.collectorNumber}|${c.variant ?? ""}|${c.isPromo}`;
    const first = seen.get(key);
    if (first) dupes.push(`${label(c)} duplicates ${first.slug ?? first.id}`);
    else seen.set(key, c);
  }
  report("duplicate (set, number, variant, promo) cards", dupes);

  // ── Taxonomy ─────────────────────────────────────────────────────────────────
  section("Taxonomy");
  const domains = new Set<string>(DOMAIN_KEYS);
  const rarities = new Set<string>(RARITY_KEYS);
  const types = new Set<string>(CARD_TYPES);
  const setCodes = new Set(SETS.map((s) => s.code));
  report("unknown domain", cards.filter((c) => !domains.has(c.domain)).map((c) => `${label(c)} → "${c.domain}"`));
  report("unknown rarity", cards.filter((c) => !rarities.has(c.rarity)).map((c) => `${label(c)} → "${c.rarity}"`));
  report("unknown type", cards.filter((c) => !types.has(c.type)).map((c) => `${label(c)} → "${c.type}"`));
  report("set code missing from SETS (no /sets page, breadcrumbs fall back)",
    cards.filter((c) => !setCodes.has(c.setCode)).map((c) => `${label(c)} → "${c.setCode}"`));
  report("malformed collector number",
    cards.filter((c) => !/^\d+[a-z]*\*?\/\d+$/i.test(c.collectorNumber)).map((c) => `${label(c)} → "${c.collectorNumber}"`));
  report("cards without an image (SVG fallback art)", cards.filter((c) => !c.imageUrl).map(label));

  // ── Price consistency (Card.lowestPrice vs live in-stock listings) ──────────
  section("Price consistency per market");
  const stockRows = await prisma.retailerPrice.groupBy({
    by: ["cardId", "country"],
    where: { inStock: true },
    _count: { _all: true },
  });
  const stock = new Map<string, number>();
  for (const r of stockRows) stock.set(`${r.cardId}|${r.country}`, r._count._all);
  const MARKETS: { code: string; field: "lowestPriceCents" | "lowestPriceCentsNz" | "lowestPriceCentsUs" | "lowestPriceCentsUk" }[] = [
    { code: "AU", field: "lowestPriceCents" },
    { code: "NZ", field: "lowestPriceCentsNz" },
    { code: "US", field: "lowestPriceCentsUs" },
    { code: "UK", field: "lowestPriceCentsUk" },
  ];
  for (const m of MARKETS) {
    const phantom = cards.filter((c) => c[m.field] != null && !stock.get(`${c.id}|${m.code}`));
    const unsurfaced = cards.filter((c) => c[m.field] == null && (stock.get(`${c.id}|${m.code}`) ?? 0) > 0);
    report(`${m.code}: price shown but ZERO in-stock listings (phantom price)`, phantom.map((c) => `${label(c)} = ${(c[m.field]! / 100).toFixed(2)}`));
    report(`${m.code}: in-stock listings but NO price surfaced`, unsurfaced.map((c) => `${label(c)} (${stock.get(`${c.id}|${m.code}`)} listings)`));
  }

  // ── Listing hygiene ──────────────────────────────────────────────────────────
  section("Listing hygiene");
  const cutoff = new Date(Date.now() - 3 * 86400_000); // importer runs 2×/day
  const zombies = await prisma.retailerPrice.findMany({
    where: { inStock: true, lastSeen: { lt: cutoff } },
    select: { retailer: true, country: true, lastSeen: true, card: { select: { name: true } } },
    take: 1000,
  });
  report(
    "in-stock listings not seen by the importer in 3+ days (zombies)",
    zombies.slice(0, MAX_SAMPLES).map((z) => `${z.card.name} @ ${z.retailer}/${z.country}, last seen ${z.lastSeen.toISOString().slice(0, 10)}`),
    zombies.length
  );
  const badCountry = await prisma.retailerPrice.groupBy({ by: ["country"], _count: { _all: true } });
  const unknownMarkets = badCountry.filter((r) => !["AU", "NZ", "US", "UK"].includes(r.country));
  report("listings with an unknown market code", unknownMarkets.map((r) => `"${r.country}" × ${r._count._all}`));

  // ── Freshness ────────────────────────────────────────────────────────────────
  section("Freshness");
  const hist = await prisma.priceHistory.groupBy({ by: ["country"], _max: { day: true }, _count: { _all: true } });
  for (const h of hist) console.log(`  PriceHistory ${h.country}: ${h._count._all} rows, latest day ${h._max.day?.toISOString().slice(0, 10)}`);
  if (!hist.length) { issues++; console.log("  ✗ PriceHistory is EMPTY — movers/charts have no data"); }
  const ebayFresh = cards.filter((c) => c.ebayCheckedAt && Date.now() - c.ebayCheckedAt.getTime() < 28 * 3600_000).length;
  console.log(`  eBay pass reached ${ebayFresh}/${cards.length} cards in the last 28h`);

  // ── Fixes ────────────────────────────────────────────────────────────────────
  if (FIX && (missingSlug.length || badIndex.length)) {
    section("Applying safe fixes");
    const taken = new Set(cards.map((c) => c.slug).filter((s): s is string => !!s));
    let fixedSlugs = 0;
    for (const c of missingSlug) {
      let slug = cardSlug(c);
      if (taken.has(slug)) slug = `${slug}-${c.id.slice(-4)}`;
      taken.add(slug);
      await prisma.card.update({ where: { id: c.id }, data: { slug } });
      fixedSlugs++;
    }
    let fixedIndex = 0;
    for (const c of badIndex) {
      await prisma.card.update({ where: { id: c.id }, data: { nameNormalized: normalizeSearch(c.name) } });
      fixedIndex++;
    }
    console.log(`  fixed: ${fixedSlugs} slugs backfilled, ${fixedIndex} search indexes recomputed`);
  } else if (missingSlug.length || badIndex.length) {
    console.log(`\nRe-run with --fix to repair ${missingSlug.length} missing slugs + ${badIndex.length} search indexes.`);
  }

  console.log(`\n${issues === 0 ? "✅ Audit clean — no issues found." : `⚠ Audit found ${issues} issue(s) — see sections above.`}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
