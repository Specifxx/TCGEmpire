/**
 * VEN census — read-only. Prints every Vendetta card in the database with the
 * fields the chase-tier galleries classify on (collectorNumber, variant, rarity)
 * plus provenance (externalId, slug), so a CI log shows exactly why a card does
 * or doesn't land in the overnumbered / alt-art / epic galleries.
 *
 * Usage: npx tsx scripts/audit-ven.ts
 */
import { prisma } from "../src/lib/db";

function tier(c: { collectorNumber: string; variant: string | null; rarity: string }): string {
  const cn = c.collectorNumber;
  const sp = /^sp/i.test(cn);
  const star = cn.includes("*");
  const [n, t] = cn.split("/");
  const over = sp || (!star && Number.isFinite(parseInt(n, 10)) && Number.isFinite(parseInt(t ?? "", 10)) && parseInt(n, 10) > parseInt(t ?? "", 10));
  const tags: string[] = [];
  if (over) tags.push("OVERNUM");
  if (c.variant != null) tags.push("ALTART");
  if (star) tags.push("SIG");
  if (c.rarity === "Epic" && c.variant == null && !over && !star) tags.push("EPIC-TIER");
  return tags.join("+") || "-";
}

async function main() {
  const cards = await prisma.card.findMany({
    where: { setCode: "VEN" },
    orderBy: [{ collectorNumber: "asc" }],
    select: { name: true, collectorNumber: true, variant: true, rarity: true, isPromo: true, externalId: true, slug: true },
  });
  console.log(`VEN cards in DB: ${cards.length}`);
  for (const c of cards) {
    const src = c.externalId?.startsWith("ven-official-") ? "official" : c.externalId?.startsWith("manual-") ? "manual" : c.externalId ? "riftscribe" : "none";
    console.log(
      `VEN ${c.collectorNumber.padEnd(10)} var=${(c.variant ?? "-").padEnd(3)} ${c.rarity.padEnd(9)} ${String(c.isPromo ? "PROMO" : "").padEnd(5)} ${tier(c).padEnd(16)} src=${src.padEnd(10)} /card/${c.slug}  ${c.name}`
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
