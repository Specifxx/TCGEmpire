/**
 * ONE-OFF (2026-09-27): corrects the cards an importer named wrongly, and
 * reports any others that look the same.
 *
 *   VEN-155  "Yordle, Heart of the Tempest"      → "Kennen, Heart of the Tempest"
 *   OGS-019  "Master, Wuju Bladesman - Starter"  → "Master Yi, Wuju Bladesman"
 *            (the base row and its promo printing)
 *
 * The importers themselves are fixed in the same change (lib/legend-name.ts), so
 * a re-sync keeps these names. Both importers rewrite `name` on every run but
 * never touch an existing `slug`, so the slug is corrected only here.
 *
 * PER ROW: name, nameNormalized and slug. The old slug keeps working: every card
 * route matches it through lib/card-slug-renames.ts and 308s to the new one, so
 * a new slug must be listed there first (checked below). Published decks built
 * on the renamed Legend get its new legendName/legendSlug, and any deck list
 * text naming the card is updated to match.
 *
 * SAFE TO RE-RUN. A row already corrected prints "already fixed". A row whose
 * set or number is not what's expected, or whose new slug belongs to another
 * card, is refused with the reason, and nothing is written for it.
 *
 * DRY RUN BY DEFAULT — pass --apply to write. Afterwards run maintenance.yml's
 * `revalidate-now` so cached card pages pick up the new name.
 *
 * Usage:  npx tsx scripts/fix-card-names.ts            # report only
 *         npx tsx scripts/fix-card-names.ts --apply
 */
import { prisma } from "../src/lib/db";
import { normalizeSearch } from "../src/lib/format";
import { CARD_SLUG_RENAMES } from "../src/lib/card-slug-renames";
import { championForCardName, CHAMPIONS } from "../src/lib/champions";
import { legendSlugFrom } from "../src/lib/published-decks";

const APPLY = process.argv.includes("--apply");

type Fix = { oldSlug: string; name: string; setCode: string; number: string };
const FIXES: Fix[] = [
  { oldSlug: "yordle-heart-of-the-tempest-ven-155", name: "Kennen, Heart of the Tempest", setCode: "VEN", number: "155" },
  { oldSlug: "master-wuju-bladesman-starter-ogs-019-024", name: "Master Yi, Wuju Bladesman", setCode: "OGS", number: "019" },
  { oldSlug: "master-wuju-bladesman-starter-ogs-019-024-promo", name: "Master Yi, Wuju Bladesman", setCode: "OGS", number: "019" },
];

async function fixCard(f: Fix): Promise<void> {
  const newSlug = CARD_SLUG_RENAMES[f.oldSlug];
  const tag = `${f.setCode}-${f.number} ${f.oldSlug}`;
  if (!newSlug) {
    console.log(`REFUSED ${tag}: not in CARD_SLUG_RENAMES — the old URL would 404. Add it there first.`);
    return;
  }
  const row = await prisma.card.findFirst({
    where: { OR: [{ slug: f.oldSlug }, { slug: newSlug }] },
    select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true },
  });
  if (!row) {
    console.log(`MISSING ${tag}: no card has either slug.`);
    return;
  }
  if (row.setCode !== f.setCode || row.collectorNumber.split("/")[0] !== f.number) {
    console.log(`REFUSED ${tag}: row is ${row.setCode} ${row.collectorNumber} "${row.name}", not ${f.setCode}-${f.number}.`);
    return;
  }
  if (row.slug === newSlug && row.name === f.name) {
    console.log(`already fixed  ${newSlug}  "${f.name}"`);
    return;
  }
  const clash = await prisma.card.findFirst({ where: { slug: newSlug, id: { not: row.id } }, select: { id: true, name: true } });
  if (clash) {
    console.log(`REFUSED ${tag}: ${newSlug} already belongs to "${clash.name}" (${clash.id}).`);
    return;
  }
  const oldName = row.name;
  console.log(`${APPLY ? "FIXED" : "(dry) would fix"}  "${oldName}" → "${f.name}"   /card/${row.slug} → /card/${newSlug}`);
  if (APPLY) {
    await prisma.card.update({
      where: { id: row.id },
      data: { name: f.name, nameNormalized: normalizeSearch(f.name), slug: newSlug },
    });
  }

  // Published decks: the Legend's stored name/slug, and the list text.
  const legendSlug = legendSlugFrom(f.name, championForCardName(f.name)?.slug);
  const asLegend = await prisma.publishedDeck.findMany({ where: { legendCardId: row.id }, select: { id: true, slug: true, legendName: true, legendSlug: true } });
  for (const d of asLegend) {
    if (d.legendName === f.name && d.legendSlug === legendSlug) continue;
    console.log(`  ${APPLY ? "deck" : "(dry) deck"} /decks/${d.slug}: legend "${d.legendName}" (${d.legendSlug}) → "${f.name}" (${legendSlug})`);
    if (APPLY) await prisma.publishedDeck.update({ where: { id: d.id }, data: { legendName: f.name, legendSlug } });
  }
  if (oldName !== f.name) {
    const inList = await prisma.publishedDeck.findMany({ where: { cardIds: { has: row.id }, list: { contains: oldName } }, select: { id: true, slug: true, list: true } });
    for (const d of inList) {
      console.log(`  ${APPLY ? "deck" : "(dry) deck"} /decks/${d.slug}: list text "${oldName}" → "${f.name}"`);
      if (APPLY) await prisma.publishedDeck.update({ where: { id: d.id }, data: { list: d.list.split(oldName).join(f.name) } });
    }
  }
}

// The same kind of defect elsewhere, reported only. Two shapes:
//  - a product label left in the name (" - Starter");
//  - a champion-style "Prefix, Title" name whose prefix is no champion we know
//    — how "Yordle," and "Master," showed up. Units named for a non-champion
//    creature ("Allay, Eager Admirer") land here too; those are fine.
async function reportSuspects(): Promise<void> {
  const known = new Set(CHAMPIONS.map((c) => c.name.toLowerCase()));
  const rows = await prisma.card.findMany({
    where: { OR: [{ name: { contains: " - " } }, { name: { contains: "," } }] },
    select: { slug: true, name: true, setCode: true, collectorNumber: true, type: true },
    orderBy: [{ setCode: "asc" }, { collectorNumber: "asc" }],
  });
  const fixing = new Set(FIXES.flatMap((f) => [f.oldSlug, CARD_SLUG_RENAMES[f.oldSlug]]));
  const suspects = rows.filter((r) => {
    if (r.slug && fixing.has(r.slug)) return false;
    if (/\s-\s*Starter$/i.test(r.name)) return true;
    if (!r.name.includes(",")) return false;
    return !known.has(r.name.split(",")[0].trim().toLowerCase());
  });
  console.log(`\n${suspects.length} other card(s) with the same kind of name (report only):`);
  for (const r of suspects) console.log(`  ${r.setCode} ${r.collectorNumber.padEnd(9)} ${r.type.padEnd(11)} "${r.name}"  /card/${r.slug}`);
}

async function main() {
  console.log(APPLY ? "APPLYING\n" : "DRY RUN — pass --apply to write\n");
  for (const f of FIXES) await fixCard(f);
  await reportSuspects();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
