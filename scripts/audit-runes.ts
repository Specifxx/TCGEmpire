/**
 * Rune census across EVERY set — read-only. Prints each Rune printing with the
 * fields that decide whether it shows real art or the generated placeholder
 * (imageUrl present/absent, and which host it points at), so a CI log is enough
 * to see which rune printings still lack a real photo and which already have one.
 *
 * Usage: npx tsx scripts/audit-runes.ts
 */
import { prisma } from "../src/lib/db";

// Where the art comes from — self-hosted re-uploads vs the official Riot CDN vs
// a TCGplayer product shot vs nothing at all.
function imgSrc(url: string | null): string {
  if (!url) return "NONE(placeholder)";
  if (url.includes("riftcompare.com")) return "self-hosted";
  if (url.includes("tcgplayer")) return "tcgplayer";
  if (/playriftbound|riotgames|riotcdn/.test(url)) return "official-cdn";
  return "other";
}

async function main() {
  const cards = await prisma.card.findMany({
    where: { type: "Rune" },
    orderBy: [{ setCode: "asc" }, { collectorNumber: "asc" }],
    select: {
      name: true, setCode: true, collectorNumber: true, variant: true, rarity: true,
      isPromo: true, externalId: true, slug: true, imageUrl: true,
    },
  });
  console.log(`Rune printings in DB: ${cards.length}\n`);
  for (const c of cards) {
    const src = c.externalId?.startsWith("ven-official-") ? "official"
      : c.externalId?.startsWith("manual-") ? "manual"
      : c.externalId?.startsWith("promo-") ? "promo"
      : c.externalId?.startsWith("tcg-") ? "tcg"
      : c.externalId ? "riftscribe" : "none";
    console.log(
      `${c.setCode} ${c.collectorNumber.padEnd(9)} var=${(c.variant ?? "-").padEnd(3)} ${c.rarity.padEnd(9)} ` +
      `${String(c.isPromo ? "PROMO" : "").padEnd(5)} img=${imgSrc(c.imageUrl).padEnd(17)} src=${src.padEnd(10)} ` +
      `/card/${c.slug}  ${c.name}`
    );
  }
  const missing = cards.filter((c) => !c.imageUrl);
  console.log(`\n--- ${missing.length} rune printings with NO image (rendering the generated placeholder) ---`);
  for (const c of missing) console.log(`  ${c.setCode} ${c.collectorNumber}  ${c.name}  /card/${c.slug}`);
  console.log("\n--- full imageUrl for every rune that HAS one ---");
  for (const c of cards.filter((x) => x.imageUrl)) console.log(`  ${c.setCode} ${c.collectorNumber.padEnd(9)} ${c.imageUrl}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
