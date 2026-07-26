/**
 * TEMPORARY diagnostic — not wired into CI. Checks how TCGplayer represents the
 * "Chaos Rune" Nexus Night / Organized Play promos (166b/298 etc.) and whether
 * our DB already has a (possibly mis-cloned) row for them.
 *
 * Usage: npx tsx scripts/diag-ogn-promo.ts
 */
import { PrismaClient } from "@prisma/client";
import { fetchTcgplayerProducts } from "../src/lib/tcgplayer";

const prisma = new PrismaClient();

async function main() {
  const products = await fetchTcgplayerProducts();
  const matches = products.filter((p) => /rune/i.test(p.productName) && /organized play|nexus night/i.test(p.setName ?? ""));
  console.log(`TCGplayer rune OP-promo products found: ${matches.length}`);
  for (const p of matches) {
    console.log(`  productId=${p.productId} name="${p.productName}" setName="${p.setName}" number=${p.customAttributes?.number} sealed=${p.sealed}`);
  }

  const existing = await prisma.card.findMany({
    where: { OR: [{ externalId: { in: matches.map((p) => `tcg-${p.productId}`) } }, { collectorNumber: { contains: "166b" } }, { name: { contains: "Chaos Rune" } }] },
    select: { id: true, name: true, setCode: true, collectorNumber: true, externalId: true, slug: true, isPromo: true },
  });
  console.log(`\nExisting DB rows matching (externalId | collectorNumber~166b | name~Chaos Rune): ${existing.length}`);
  for (const c of existing) console.log(`  ${c.setCode} ${c.collectorNumber} name="${c.name}" promo=${c.isPromo} ext=${c.externalId} slug=${c.slug}`);

  // Also show what OGN's real numbered card #166 actually is, since add-tcg-printings.ts
  // path-1 clones by NUMBER match alone (no name check) — if a promo product's number
  // parses as "166b/298" it would clone whatever OGN calls card 166, right or wrong.
  const ognBase = await prisma.card.findFirst({ where: { setCode: "OGN", collectorNumber: "166/298" }, select: { name: true, collectorNumber: true } });
  console.log(`\nOGN's real base card at 166/298: ${ognBase ? `"${ognBase.name}"` : "(none found)"}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
