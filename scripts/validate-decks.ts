/**
 * Validate prisma/meta-decks.json against Riftbound's constructed deck rules, and
 * (when a database is reachable) against the real card catalogue.
 *
 * Two independent passes:
 *
 *  1. RULES — pure JSON, no database needed, so this always runs and can gate CI:
 *       · main deck incl. legend  = 56  (40 + 12 runes + 3 battlefields + 1 legend)
 *       · runes = 12, battlefields = 3, champion = 1
 *       · side deck <= 10          (raised from 8 in the July 2026 tournament rules
 *                                   update, effective 2026-07-24)
 *       · no runes / legends / battlefields in the side deck
 *       · <= 3 copies of a card across main deck + side deck COMBINED
 *         (runes are exempt — decks legitimately run 7x Body Rune)
 *
 *  2. NAMES — every card name resolves to a real DB card using the same
 *     normalized matching the deck pages use. Skipped with a notice when no
 *     database URL is set, so the rules pass still works locally.
 *
 * Exits non-zero if either pass fails.
 * Run: npx tsx scripts/validate-decks.ts
 */
import { normalizeSearch } from "../src/lib/format";
import metaDecksData from "../prisma/meta-decks.json";

// Mirrors src/lib/db.ts's fallback chain — RM6 is the current project.
const HAS_DB = Boolean(
  process.env.RM6 || process.env.DATABASE_URL_2 || process.env.DATABASE_URL || process.env.RM3
);

const MAIN_TOTAL = 56; // incl. the legend
const RUNES = 12;
const BATTLEFIELDS = 3;
const CHAMPIONS = 1;
const SIDE_MAX = 10; // was 8 until 2026-07-24
const COPY_MAX = 3; // main + side combined

type DeckCard = { name: string; qty: number; section: string };
type Deck = { slug: string; legend: string; cards: DeckCard[] };

const decks = metaDecksData.decks as Deck[];

const problems: string[] = [];
const fail = (slug: string, msg: string) => problems.push(`  ✗ ${slug}: ${msg}`);

function checkRules() {
  console.log("Rules check (main incl. legend = 56, side <= 10, <= 3 copies combined):\n");

  for (const d of decks) {
    const qty = (pred: (c: DeckCard) => boolean) =>
      d.cards.filter(pred).reduce((n, c) => n + c.qty, 0);

    const side = qty((c) => c.section === "sideboard");
    const main = qty((c) => c.section !== "sideboard") + 1; // +1 legend
    const runes = qty((c) => c.section === "rune");
    const battlefields = qty((c) => c.section === "battlefield");
    const champions = qty((c) => c.section === "champion");

    if (main !== MAIN_TOTAL) fail(d.slug, `main deck incl. legend is ${main}, expected ${MAIN_TOTAL}`);
    if (side > SIDE_MAX) fail(d.slug, `side deck is ${side}, over the ${SIDE_MAX}-card cap`);
    if (runes !== RUNES) fail(d.slug, `${runes} runes, expected ${RUNES}`);
    if (battlefields !== BATTLEFIELDS) fail(d.slug, `${battlefields} battlefields, expected ${BATTLEFIELDS}`);
    if (champions !== CHAMPIONS) fail(d.slug, `${champions} champion cards, expected ${CHAMPIONS}`);

    // Side decks hold spells/units/gear only — the other zones aren't sideboardable.
    for (const c of d.cards) {
      if (c.section !== "sideboard") continue;
      const asMain = d.cards.find((x) => x.section !== "sideboard" && normalizeSearch(x.name) === normalizeSearch(c.name));
      if (asMain && (asMain.section === "rune" || asMain.section === "battlefield")) {
        fail(d.slug, `"${c.name}" is a ${asMain.section} and can't go in the side deck`);
      }
    }
    if (d.cards.some((c) => c.section === "sideboard" && normalizeSearch(c.name) === normalizeSearch(d.legend))) {
      fail(d.slug, `the legend "${d.legend}" can't go in the side deck`);
    }

    // 3-copy limit, counted across main deck AND side deck. Runes are exempt.
    const combined = new Map<string, { name: string; total: number; main: number; side: number }>();
    for (const c of d.cards) {
      if (c.section === "rune") continue;
      const key = normalizeSearch(c.name);
      const e = combined.get(key) ?? { name: c.name, total: 0, main: 0, side: 0 };
      e.total += c.qty;
      if (c.section === "sideboard") e.side += c.qty;
      else e.main += c.qty;
      combined.set(key, e);
    }
    for (const e of combined.values()) {
      if (e.total > COPY_MAX) {
        fail(
          d.slug,
          `"${e.name}" runs ${e.total} copies (${e.main} main + ${e.side} side) — the ${COPY_MAX}-copy limit counts both`
        );
      }
    }

    const flag = side > SIDE_MAX ? " ⚠" : side < SIDE_MAX ? `  (${SIDE_MAX - side} side slots unused)` : "";
    console.log(`  ${d.slug.padEnd(30)} main ${main} · side ${side} · total ${main + side}${flag}`);
  }
}

async function checkNames() {
  if (!HAS_DB) {
    console.log(
      "\nName check: SKIPPED — no RM6 / DATABASE_URL_2 / DATABASE_URL / RM3 set.\n" +
        "  (Set one to verify every deck card resolves to a real catalogue card.)"
    );
    return;
  }
  const { prisma } = await import("../src/lib/db");

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
  console.log(
    `\nName check: unique ${names.size} · matched ${names.size - missing.length} · MISSING ${missing.length}\n`
  );

  if (missing.length) {
    // Suggest close matches by shared prefix/substring of the first word.
    const all = await prisma.card.findMany({ select: { name: true, nameNormalized: true } });
    for (const m of missing) {
      const firstWord = m.key.split(" ")[0];
      const sugg = all
        .filter((c) => c.nameNormalized.includes(firstWord) || c.nameNormalized.split(" ")[0] === firstWord)
        .slice(0, 6)
        .map((c) => c.name);
      problems.push(`  ✗ unresolved card name: "${m.name}" (key: ${m.key})`);
      if (sugg.length) console.log(`    maybe: ${sugg.join(" | ")}`);
    }
  } else {
    console.log("All deck cards resolve. ✓");
  }

  await prisma.$disconnect();
}

async function main() {
  checkRules();
  await checkNames();

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log("\nAll decks legal. ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
