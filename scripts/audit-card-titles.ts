/**
 * DO THE CARD TITLES FIT, AND ARE THEY UNIQUE?
 *
 * READ-ONLY. One query, no writes.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `cardTitle()` is a pure function with unit tests, and that is not enough. The
 * tests assert it on a dozen hand-written fixtures; production runs it over
 * ~1,430 real card names, in six sets, with collector numbers of four different
 * shapes. Two invariants can only be checked against the whole catalogue:
 *
 *   1. EVERY title fits 60 characters including " | RiftCompare". The ladder's
 *      `?? last` returns an over-long title rather than throwing, so a miss is
 *      silent — and Google truncates whatever overflows, which for this template
 *      historically meant losing the word "Riftbound".
 *   2. NO TWO submitted pages share a title. scripts/seo-gate.ts fails the build
 *      on a duplicate, but it runs against a deployed site, so a collision is
 *      found after the release rather than before it.
 *
 * There is no database in the dev sandbox (.env.production there holds one
 * public AdSense id), so CI is the only place this can run. Run it BEFORE
 * landing any change to the ladder.
 *
 * Usage:
 *   npx tsx scripts/audit-card-titles.ts
 *
 * Run in CI via .github/workflows/maintenance.yml (task: audit-card-titles).
 */
import { prisma } from "../src/lib/db";
import { cardTitle, cardMetaDescription, titleFits, TITLE_MAX } from "../src/lib/card-seo";
import { cardCredentials, cardDisplayName } from "../src/lib/card-name";
import { printingFieldsFrom, printingKind } from "../src/lib/content/card-narrative";
import { setByCode } from "../src/lib/constants";

const SUFFIX_LEN = " | RiftCompare".length;

function section(title: string) {
  console.log("");
  console.log(`━━━ ${title} ━━━`);
}

async function main() {
  // ONE query, and only the columns the two builders read. The egress rules at
  // the top of src/lib/db.ts apply to scripts too; this is ~1,430 rows of short
  // strings, comparable to what the sitemap already reads once a day.
  const cards = await prisma.card.findMany({
    select: {
      slug: true,
      name: true,
      setCode: true,
      setName: true,
      collectorNumber: true,
      rarity: true,
      type: true,
      domain: true,
      variant: true,
      isPromo: true,
      description: true,
      lowestPriceCents: true,
    },
  });

  console.log(`Wall clock: ${new Date().toISOString()}`);
  console.log(`cards in catalogue: ${cards.length.toLocaleString()}`);

  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  const over: { slug: string; len: number; title: string }[] = [];
  const descOver: number[] = [];

  for (const card of cards) {
    const displayName = cardDisplayName(card.name, card);
    const identCode = `${card.setCode} ${card.collectorNumber}`;
    const kind = printingKind(printingFieldsFrom(card));
    const hasPrice = card.lowestPriceCents != null;

    const title = cardTitle({
      name: card.name,
      displayName,
      setName: setByCode(card.setCode)?.name ?? card.setName,
      identCode,
      hasPrice,
      kind,
      type: card.type,
      credentials: cardCredentials(card),
    });

    const len = title.length + SUFFIX_LEN;
    if (!titleFits(title)) over.push({ slug: card.slug ?? "(no slug)", len, title });
    titles.set(title, [...(titles.get(title) ?? []), card.slug ?? "(no slug)"]);

    const description = cardMetaDescription({
      displayName,
      identCode,
      setName: card.setName,
      collectorNumber: card.collectorNumber,
      kind,
      textBit: card.description ? card.description.slice(0, 70) : null,
      statBit: `${card.domain} ${card.type.toLowerCase()} · ${card.rarity}`,
      priceBit: hasPrice ? "Live prices from A$0.00 across 1 store, updated daily." : "Compare live prices.",
    });
    descriptions.set(description, [...(descriptions.get(description) ?? []), card.slug ?? "(no slug)"]);
    descOver.push(description.length);
  }

  section(`Titles over ${TITLE_MAX} characters`);
  console.log(`  ${over.length.toLocaleString()} of ${cards.length.toLocaleString()}`);
  // A comma-less long name has no champion half to shorten, so the ladder has
  // nothing left to give without dropping the collector number — which it must
  // not. These are a known, bounded residue, not a bug.
  for (const o of over.slice(0, 25)) console.log(`  ${o.len}  ${o.title}`);
  if (over.length > 25) console.log(`  … and ${over.length - 25} more`);

  section("Duplicate titles (scripts/seo-gate.ts FAILS THE BUILD on these)");
  const dupTitles = [...titles.entries()].filter(([, slugs]) => slugs.length > 1);
  console.log(`  ${dupTitles.length.toLocaleString()} colliding titles`);
  for (const [title, slugs] of dupTitles.slice(0, 20)) {
    console.log(`  "${title}"`);
    for (const s of slugs) console.log(`      /card/${s}`);
  }

  section("Duplicate descriptions");
  const dupDesc = [...descriptions.entries()].filter(([, slugs]) => slugs.length > 1);
  console.log(`  ${dupDesc.length.toLocaleString()} colliding descriptions`);
  for (const [, slugs] of dupDesc.slice(0, 10)) console.log(`      ${slugs.map((s) => `/card/${s}`).join("  ")}`);

  section("Description length (Google renders ~155-160)");
  const sorted = [...descOver].sort((a, b) => a - b);
  const pctl = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  console.log(`  min ${pctl(0)}  p50 ${pctl(0.5)}  p90 ${pctl(0.9)}  max ${pctl(1)}`);

  section("Read");
  if (dupTitles.length > 0) {
    console.log("  ✗ Duplicate titles present. seo-gate will fail after deploy. Do not ship.");
    process.exitCode = 1;
  } else if (over.length > 0) {
    console.log(`  ${over.length} titles still overflow — acceptable only if every one is a comma-less`);
    console.log("    long name with nothing left to shorten. Read the list above and confirm.");
  } else {
    console.log("  ✓ Every title fits and every title is unique.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
