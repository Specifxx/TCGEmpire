/**
 * READ-ONLY, no database: which printing do TCGplayer's listing previews carry,
 * per rarity, and how often does the buyable US row find no listing it may quote?
 *
 * Written for the 2026-10-26 wrong-price report (Kayn, Unleashed RAD 182*): the
 * public snapshot shows the "tcgplayer" row equal to market price for every
 * Rare, Epic and Showcase card, which is what cheapestEnglishNm() returning null
 * looks like. This prints the evidence: foilOnly, the preview's printings and
 * conditions, and the listing the row would quote.
 *
 * Usage: npx tsx scripts/probe-tcgplayer-printing.ts
 */
import { cheapestEnglishNm, fetchTcgplayerProducts, type TcgProduct } from "../src/lib/tcgplayer";

const rarityOf = (p: TcgProduct) => String((p.customAttributes as Record<string, unknown> | undefined)?.rarityDbName ?? (p as unknown as { rarityName?: string }).rarityName ?? "?");

async function main() {
  const items = await fetchTcgplayerProducts();
  console.log(`products: ${items.length}`);
  const stat = new Map<string, { n: number; foilOnly: number; noQuote: number; printings: Map<string, number> }>();
  const samples = new Map<string, TcgProduct[]>();
  for (const p of items) {
    const r = rarityOf(p);
    const s = stat.get(r) ?? { n: 0, foilOnly: 0, noQuote: 0, printings: new Map() };
    s.n++;
    if (p.foilOnly) s.foilOnly++;
    if (!cheapestEnglishNm(p)) s.noQuote++;
    for (const l of p.listings ?? []) s.printings.set(String(l.printing), (s.printings.get(String(l.printing)) ?? 0) + 1);
    stat.set(r, s);
    const list = samples.get(r) ?? [];
    if (list.length < 4 && (p.listings?.length ?? 0) > 0) list.push(p);
    samples.set(r, list);
  }
  for (const [r, s] of stat) {
    console.log(`\n${r}: ${s.n} products, foilOnly ${s.foilOnly}, no quotable listing ${s.noQuote}, preview printings ${JSON.stringify(Object.fromEntries(s.printings))}`);
    for (const p of samples.get(r) ?? []) {
      console.log(`  ${p.productName} #${p.customAttributes?.number ?? "?"} foilOnly=${p.foilOnly} market=${p.marketPrice} lowest=${p.lowestPrice}`);
      for (const l of (p.listings ?? []).slice(0, 6)) console.log(`    $${l.price} lang=${l.languageId} qty=${l.quantity} ${l.condition} ${l.printing}`);
    }
  }
  const kayn = items.filter((p) => /kayn, unleashed/i.test(p.productName));
  console.log("\nKayn, Unleashed products:");
  for (const p of kayn) {
    console.log(`  ${p.productName} #${p.customAttributes?.number ?? "?"} foilOnly=${p.foilOnly} market=${p.marketPrice} lowest=${p.lowestPrice} attrs=${JSON.stringify(p.customAttributes)}`);
    for (const l of (p.listings ?? []).slice(0, 8)) console.log(`    $${l.price} lang=${l.languageId} qty=${l.quantity} ${l.condition} ${l.printing}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
