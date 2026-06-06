// One-off: verify every card name in prisma/meta-decks.json resolves to a real DB
// card (same normalized matching the deck pages use). Prints any unmatched names
// with close suggestions so we can correct them. Run: npx tsx scripts/validate-decks.ts
import { prisma } from "../src/lib/db";
import { normalizeSearch } from "../src/lib/format";
import metaDecksData from "../prisma/meta-decks.json";

async function main() {
  const decks = metaDecksData.decks as {
    slug: string;
    legend: string;
    cards: { name: string; qty: number; section: string }[];
  }[];

  // Collect unique names (legend + cards).
  const names = new Set<string>();
  for (const d of decks) {
    names.add(d.legend);
    for (const c of d.cards) names.add(c.name);
  }

  const keys = Array.from(names).map((n) => ({ name: n, key: normalizeSearch(n) }));
  const matches = await prisma.card.findMany({
    where: { nameNormalized: { in: keys.map((k) => k.key) }, isPromo: false },
    select: { name: true, nameNormalized: true },
  });
  const found = new Set(matches.map((m) => m.nameNormalized));

  const missing = keys.filter((k) => !found.has(k.key));
  console.log(`Unique names: ${names.size} · matched: ${names.size - missing.length} · MISSING: ${missing.length}\n`);

  if (missing.length) {
    // Suggest close matches by shared prefix/substring of the first word.
    const all = await prisma.card.findMany({ select: { name: true, nameNormalized: true } });
    for (const m of missing) {
      const firstWord = m.key.split(" ")[0];
      const sugg = all
        .filter((c) => c.nameNormalized.includes(firstWord) || c.nameNormalized.split(" ")[0] === firstWord)
        .slice(0, 6)
        .map((c) => c.name);
      console.log(`✗ "${m.name}"  (key: ${m.key})`);
      if (sugg.length) console.log(`    maybe: ${sugg.join(" | ")}`);
    }
  } else {
    console.log("All deck cards resolve. ✓");
  }

  // Per-deck count sanity: main (incl. legend) should be 56, sideboard 8.
  console.log("\nPer-deck size (main incl. legend = 56, side = 8):");
  for (const d of decks) {
    const main = d.cards.filter((c) => c.section !== "sideboard").reduce((n, c) => n + c.qty, 0) + 1;
    const side = d.cards.filter((c) => c.section === "sideboard").reduce((n, c) => n + c.qty, 0);
    console.log(`  ${d.slug}: main ${main}, side ${side}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
