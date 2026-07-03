// Backfills slugs for cards that don't have one yet. Published slugs are permanent
// (they are the public /card/[slug] URLs and there is no redirect table): a rename
// must keep its old slug or ship a redirect, so this script must never touch a card
// that already has a slug. import-cards.ts follows the same slug-preservation policy.
import { PrismaClient } from "@prisma/client";
import { cardSlug } from "../src/lib/cards";
const prisma = new PrismaClient();
async function main(){
  const cards = await prisma.card.findMany({ where: { slug: null }, select: { id:true, name:true, setCode:true, collectorNumber:true, isPromo:true } });
  // seed with live slugs so a backfilled slug can't collide with a published URL
  const existing = await prisma.card.findMany({ where: { slug: { not: null } }, select: { slug:true } });
  const used = new Set<string>(existing.map(e=>e.slug!));
  let n=0, dup=0;
  for (const c of cards){
    let slug = cardSlug(c);
    if (used.has(slug)) { slug = `${slug}-${c.id.slice(-4)}`; dup++; } // guard (shouldn't happen)
    used.add(slug);
    await prisma.card.update({ where:{ id:c.id }, data:{ slug } });
    n++;
    if (n % 200 === 0) console.log(`  ${n}/${cards.length}`);
  }
  console.log(`Set ${n} slugs (${dup} had a collision suffix).`);
  const sample = await prisma.card.findMany({ where:{ name:{contains:"Vayne"} }, select:{name:true,collectorNumber:true,slug:true} });
  for (const s of sample) console.log(`  ${s.name} ${s.collectorNumber} -> ${s.slug}`);
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
