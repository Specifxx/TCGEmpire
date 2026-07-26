/**
 * Fix printings that TCGplayer sells under "Riftbound Organized Play Promotional
 * Cards" (Nexus Night event promos — e.g. the Fury/Calm/Mind/Body/Chaos/Order rune
 * cycle numbered like "166b/298") but that add-tcg-printings.ts created with
 * isPromo=false. That path only ever clones IN-SET numbered variants (numbers with
 * a "/NNN" denominator) and hardcoded isPromo=false for all of them — it never
 * checked whether the source PRODUCT was itself an organized-play promo, only the
 * SETLESS path (runes with no "/NNN") had that check. Net effect: these six OGN
 * rune promos exist in the DB (right name, right art, right number) but are
 * invisible to the isPromo=true filter/badge/slug — they don't look or act like
 * promos even though that's exactly what they are.
 *
 * Read-only against TCGplayer, additive-safe against the DB (only ever flips
 * isPromo false -> true + rebuilds the slug to match; never creates or deletes
 * rows). Idempotent — a second run finds nothing left to fix.
 *
 * Usage: npx tsx scripts/fix-op-promo-flag.ts [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { fetchTcgplayerProducts } from "../src/lib/tcgplayer";
import { cardSlug } from "../src/lib/card-url";

const prisma = new PrismaClient();

async function main() {
  const dry = process.argv.includes("--dry");
  const products = await fetchTcgplayerProducts();
  const opProducts = products.filter((p) => /organized play/i.test(p.setName ?? ""));
  console.log(`TCGplayer organized-play promo products: ${opProducts.length}`);

  let fixed = 0, alreadyOk = 0, notFound = 0;
  for (const p of opProducts) {
    const externalId = `tcg-${p.productId}`;
    const card = await prisma.card.findUnique({ where: { externalId } });
    if (!card) { notFound++; continue; }
    if (card.isPromo) { alreadyOk++; continue; }
    const slug = cardSlug({ name: card.name, setCode: card.setCode, collectorNumber: card.collectorNumber, isPromo: true });
    console.log(`${dry ? "(dry) " : ""}FIX ${card.setCode} ${card.collectorNumber} "${card.name}" -> isPromo=true, slug=${slug}`);
    if (!dry) {
      const clash = await prisma.card.findUnique({ where: { slug }, select: { id: true } });
      await prisma.card.update({
        where: { id: card.id },
        data: { isPromo: true, slug: clash && clash.id !== card.id ? card.slug : slug },
      });
    }
    fixed++;
  }
  console.log(`Fixed ${fixed}, already correct ${alreadyOk}, no matching card ${notFound}.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
