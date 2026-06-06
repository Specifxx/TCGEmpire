// One-off calibration: verify the TCGPlayer-popularity chase list resolves to real
// DB cards (same normalized matching the rest of the app uses). Prints, per entry,
// the printings found + prices, and flags any unmatched names.
// Run: npx tsx scripts/validate-chase.ts
import { prisma } from "../src/lib/db";
import { normalizeSearch } from "../src/lib/format";

// Ordered by TCGPlayer "best selling" (most popular) for the Riftbound card line,
// deduped by base card. setHint helps pick the right printing when a name is reused.
const CHASE: { name: string; setHint?: string }[] = [
  { name: "Teemo, Scout", setHint: "PROMO" },
  { name: "Baited Hook", setHint: "OGN" },
  { name: "Thousand-Tailed Watcher", setHint: "OGN" },
  { name: "Baron Nashor", setHint: "UNL" },
  { name: "Ahri, Inquisitive", setHint: "SFD" },
  { name: "Diana, Scorn of the Moon", setHint: "UNL" },
  { name: "Defiant Dance", setHint: "SFD" },
  { name: "Rengar, Trophy Hunter", setHint: "UNL" },
  { name: "Moonfall", setHint: "UNL" },
  { name: "Dazzling Aurora", setHint: "OGN" },
  { name: "Vex, Gloomist", setHint: "UNL" },
  { name: "Unchecked Power", setHint: "OGN" },
  { name: "Mirror Image", setHint: "UNL" },
  { name: "Fizz, Trickster", setHint: "SFD" },
  { name: "Kai'Sa, Survivor", setHint: "OGN" },
  { name: "Last Rites", setHint: "SFD" },
  { name: "LeBlanc, Deceiver", setHint: "UNL" },
  { name: "Stacked Deck", setHint: "OGN" },
  { name: "Sabotage", setHint: "OGN" },
  { name: "Irelia, Fervent", setHint: "SFD" },
  { name: "Vex, Apathetic", setHint: "UNL" },
  { name: "Arise!", setHint: "SFD" },
  { name: "Veteran Poro", setHint: "UNL" },
  { name: "Pyke, Dockside Butcher", setHint: "UNL" },
  { name: "Mind Rune", setHint: "UNL" },
  { name: "Pyke, Bloodharbor Ripper", setHint: "UNL" },
  { name: "Teemo, Strategist", setHint: "SFD" },
  { name: "Irelia, Blade Dancer", setHint: "SFD" },
  { name: "Body Rune", setHint: "UNL" },
  { name: "Elder Dragon", setHint: "UNL" },
  { name: "Vilemaw", setHint: "UNL" },
  { name: "Guerilla Warfare", setHint: "OGN" },
  { name: "Sett, Brawler", setHint: "OGN" },
  { name: "Hwei, Brooding Painter", setHint: "UNL" },
  { name: "Viktor, Herald of the Arcane", setHint: "OGN" },
  { name: "Tideturner", setHint: "OGN" },
  { name: "Ahri, Nine-Tailed Fox", setHint: "PROMO" },
  { name: "Thrill of the Hunt", setHint: "UNL" },
];

async function main() {
  const keys = CHASE.map((c) => ({ ...c, key: normalizeSearch(c.name) }));
  const cards = await prisma.card.findMany({
    where: { nameNormalized: { in: keys.map((k) => k.key) } },
    select: {
      name: true, nameNormalized: true, setCode: true, collectorNumber: true,
      variant: true, isPromo: true, lowestPriceCents: true, imageThumbUrl: true,
    },
    orderBy: { lowestPriceCents: { sort: "desc", nulls: "last" } },
  });
  const byKey = new Map<string, typeof cards>();
  for (const c of cards) {
    const a = byKey.get(c.nameNormalized) ?? [];
    a.push(c);
    byKey.set(c.nameNormalized, a);
  }

  let matched = 0;
  const missing: string[] = [];
  for (const k of keys) {
    const printings = byKey.get(k.key);
    if (!printings || printings.length === 0) { missing.push(k.name); continue; }
    matched++;
    const top = printings[0];
    const price = top.lowestPriceCents != null ? `$${(top.lowestPriceCents / 100).toFixed(2)}` : "no price";
    const img = top.imageThumbUrl ? "img" : "NO-IMG";
    const sets = [...new Set(printings.map((p) => p.setCode))].join("/");
    console.log(`✓ ${k.name.padEnd(30)} [${k.setHint}] -> ${printings.length} printing(s) in ${sets}; top ${top.setCode} ${top.collectorNumber} ${price} ${img}`);
  }
  console.log(`\nMatched ${matched}/${keys.length}.`);
  if (missing.length) {
    console.log(`MISSING (${missing.length}):`);
    const all = await prisma.card.findMany({ select: { name: true, nameNormalized: true } });
    for (const name of missing) {
      const fw = normalizeSearch(name).slice(0, 5);
      const sugg = all.filter((c) => c.nameNormalized.startsWith(fw)).slice(0, 6).map((c) => c.name);
      console.log(`  ✗ ${name}${sugg.length ? `  maybe: ${sugg.join(" | ")}` : ""}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
