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
import { dbHistory } from "../src/lib/db-history";
import { cardSlug } from "../src/lib/card-url";
import { normalizeSearch } from "../src/lib/format";
import { DOMAIN_KEYS, RARITY_KEYS, CARD_TYPES, SETS } from "../src/lib/constants";
import type { PriceField } from "../src/lib/country";

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

// Neon (serverless Postgres) auto-suspends when idle; the first connection after
// a cold start can exceed Prisma's connect timeout. Knock politely until it wakes.
async function wakeDb(tries = 6, delayMs = 10_000): Promise<void> {
  for (let i = 1; i <= tries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (e) {
      if (i === tries) throw e;
      console.log(`  …database cold (attempt ${i}/${tries}), retrying in ${delayMs / 1000}s`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  await wakeDb();
  const cards = await prisma.card.findMany({
    select: {
      id: true, slug: true, name: true, nameNormalized: true, externalId: true,
      setCode: true, setName: true, collectorNumber: true, variant: true,
      isPromo: true, domain: true, type: true, rarity: true, imageUrl: true, imageThumbUrl: true,
      lowestPriceCents: true, lowestPriceCentsUs: true,
      lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true,
      ebayCheckedAt: true,
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
  // Valid shapes: "112/298", "112a/298" (alt-art), "223*/221" (signature),
  // "t06/000" (token), and bare rune numbers "R01" / "R03a".
  const numOk = (n: string) => /^[a-z]?\d+[a-z]*\*?\/\d+$/i.test(n) || /^r\d+[a-z]*$/i.test(n);
  report("malformed collector number",
    cards.filter((c) => !numOk(c.collectorNumber)).map((c) => `${label(c)} → "${c.collectorNumber}"`));
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
  // Every market, or the audit can't detect a broken one — SG was missing here
  // (so an SG-only phantom-price bug was undetectable) and CA would have been too.
  const MARKETS: { code: string; field: PriceField }[] = [
    { code: "AU", field: "lowestPriceCents" },
    { code: "US", field: "lowestPriceCentsUs" },
    { code: "UK", field: "lowestPriceCentsUk" },
    { code: "SG", field: "lowestPriceCentsSg" },
    { code: "CA", field: "lowestPriceCentsCa" },
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
  const unknownMarkets = badCountry.filter((r) => !["AU", "US", "UK", "SG", "CA"].includes(r.country));
  report("listings with an unknown market code", unknownMarkets.map((r) => `"${r.country}" × ${r._count._all}`));

  // ── Freshness ────────────────────────────────────────────────────────────────
  section("Freshness");
  // dbHistory, NOT prisma: PriceHistory lives in the separate history project
  // (RH6 — see src/lib/db-history.ts). This read used the OPERATIONAL client,
  // whose PriceHistory table is deliberately empty (migrate-main-db excludes its
  // data when copying into RM3), so this check reported a false
  // "PriceHistory is EMPTY" every run.
  const hist = await dbHistory.priceHistory.groupBy({ by: ["country"], _max: { day: true }, _count: { _all: true } });
  for (const h of hist) console.log(`  PriceHistory ${h.country}: ${h._count._all} rows, latest day ${h._max.day?.toISOString().slice(0, 10)}`);
  if (!hist.length) { issues++; console.log("  ✗ PriceHistory is EMPTY — movers/charts have no data"); }
  const ebayFresh = cards.filter((c) => c.ebayCheckedAt && Date.now() - c.ebayCheckedAt.getTime() < 28 * 3600_000).length;
  console.log(`  eBay pass reached ${ebayFresh}/${cards.length} cards in the last 28h`);

  // ── Images: identity + liveness ──────────────────────────────────────────────
  // (a) The CDN filename embeds the card id ("ogn-001-298-<hash>.png") — verify it
  //     matches the card it's attached to (set code + collector digits). Cloned
  //     printings (promos / signatures) share the base card's art by design, so the
  //     number must match but suffixes ("a", "*") need not.
  // (b) Fetch every unique URL and verify it returns 200 with real image bytes.
  section("Images (identity + liveness)");
  const urlToCards = new Map<string, string[]>();
  const wrongArt: string[] = [];
  for (const c of cards) {
    for (const u of [c.imageUrl, c.imageThumbUrl]) {
      if (!u) continue;
      const arr = urlToCards.get(u) ?? [];
      arr.push(label(c));
      urlToCards.set(u, arr);
    }
    // Identity check only applies to standard "N/M"-numbered cards. Rune promos
    // ("R01"…) intentionally share their base rune's art, which lives at a regular
    // OGN number (Fury Rune R01 → ogn-007), so a number comparison can't apply.
    if (c.imageUrl && /^\d/.test(c.collectorNumber)) {
      const m = c.imageUrl.match(/\/([a-z]{2,4})-(\d+)[a-z]*(?:-star)?-\d+-[0-9a-f]+\.\w+$/i);
      if (m) {
        const [, urlSet, urlNum] = m;
        const cardNum = c.collectorNumber.match(/\d+/)?.[0] ?? "";
        if (urlSet.toUpperCase() !== c.setCode || urlNum !== cardNum) {
          wrongArt.push(`${label(c)} → image is ${urlSet}-${urlNum} (${c.imageUrl})`);
        }
      }
    }
  }
  report("cards whose image belongs to a DIFFERENT card", wrongArt);

  const checkImage = async (u: string): Promise<string | null> => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20_000);
      const r = await fetch(u, {
        headers: { "User-Agent": "RiftCompare-audit/1.0", Range: "bytes=0-63" },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (r.status !== 200 && r.status !== 206) return `HTTP ${r.status}`;
      const buf = Buffer.from(await r.arrayBuffer());
      const isPng = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const isWebp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
      const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
      if (!isPng && !isWebp && !isJpg) return `not image bytes (starts "${buf.subarray(0, 8).toString("hex")}")`;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message.slice(0, 80) : "fetch failed";
    }
  };
  const allUrls = [...urlToCards.keys()];
  const broken: string[] = [];
  const POOL = 25;
  for (let i = 0; i < allUrls.length; i += POOL) {
    const batch = allUrls.slice(i, i + POOL);
    const results = await Promise.all(batch.map(checkImage));
    results.forEach((why, j) => {
      if (why) broken.push(`${urlToCards.get(batch[j])![0]}: ${why} — ${batch[j]}`);
    });
  }
  report(`broken image URLs (of ${allUrls.length} checked)`, broken);

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
