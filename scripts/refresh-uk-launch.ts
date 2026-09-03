// One-off: populate the UK market for launch. Refreshes TCGplayer (US + UK/GBP) and
// recomputes each market's lowest in-stock price (incl. lowestPriceCentsUk). eBay UK
// fills in on the next scheduled import. Safe to re-run.
import { refreshTcgplayerPrices } from "../src/lib/tcgplayer";
import { prisma } from "../src/lib/db";

async function main() {
  console.log("Refreshing TCGplayer US + UK (GBP)…");
  const { written } = await refreshTcgplayerPrices();
  console.log("TCGplayer rows written:", written);

  console.log("Recomputing lowest price per market…");
  const [au, us, uk] = await Promise.all([
    prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true, country: "AU" }, _min: { priceCents: true } }),
    prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true, country: "US" }, _min: { priceCents: true } }),
    prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true, country: "UK" }, _min: { priceCents: true } }),
  ]);
  const toMap = (g: { cardId: string; _min: { priceCents: number | null } }[]) =>
    new Map(g.map((r) => [r.cardId, r._min.priceCents ?? null]));
  const mAu = toMap(au), mUs = toMap(us), mUk = toMap(uk);

  const cards = await prisma.card.findMany({
    select: { id: true, lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true },
  });
  let changed = 0;
  for (const c of cards) {
    const nAu = mAu.get(c.id) ?? null, nUs = mUs.get(c.id) ?? null, nUk = mUk.get(c.id) ?? null;
    if (nAu !== c.lowestPriceCents || nUs !== c.lowestPriceCentsUs || nUk !== c.lowestPriceCentsUk) {
      await prisma.card.update({
        where: { id: c.id },
        data: { lowestPriceCents: nAu, lowestPriceCentsUs: nUs, lowestPriceCentsUk: nUk },
      });
      changed++;
    }
  }
  console.log(`Recompute done: ${changed} cards changed | UK priced cards: ${mUk.size}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
