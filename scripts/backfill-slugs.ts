import { PrismaClient } from "@prisma/client";
import { cardSlug } from "../src/lib/cards";
const prisma = new PrismaClient();
async function main(){
  const cards = await prisma.card.findMany({ select: { id:true, name:true, setCode:true, collectorNumber:true, isPromo:true } });
  const used = new Set<string>();
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
