/**
 * scripts/audit-rarity.ts — READ-ONLY rarity census, every set side by side.
 *
 *   npx tsx scripts/audit-rarity.ts
 *
 * WHY: filtering /browse by "Rare" returned a wall of A$165–172 Vendetta chase
 * cards. The filter was correct — the DATA said those cards were Rare. Before
 * rewriting anyone's rarity we need to know how far that goes: is it only the
 * overnumbered prints, or is Vendetta's rarity data shaped differently from
 * every other set?
 *
 * Comparing raw totals would answer nothing, because sets differ in size and in
 * how many chase prints they have. So this splits every set the same way:
 *
 *   BASE      — a plain print of a base-set card. The only fair comparison, and
 *               the population the rarity filter is really about.
 *   ALT-ART   — variant != null
 *   SIG       — "*" in the collector number
 *   OVERNUM   — numerator > set total (excludes Signatures by definition)
 *   PROMO     — isPromo
 *
 * A chase print carries the rarity of the card it re-prints unless something
 * reclassifies it, so its rarity says nothing about the set's real distribution
 * — which is exactly how ~30 Vendetta chase cards ended up under "Rare".
 *
 * Writes nothing. Safe to run against production at any time.
 */
export {};

import { PrismaClient } from "@prisma/client";
import { RARITY_KEYS, SETS, isOvernumbered, isSignature } from "../src/lib/constants";

const prisma = new PrismaClient();

type Kind = "BASE" | "ALT-ART" | "SIG" | "OVERNUM" | "PROMO";
const KINDS: Kind[] = ["BASE", "ALT-ART", "SIG", "OVERNUM", "PROMO"];

function kindOf(c: { collectorNumber: string; variant: string | null; isPromo: boolean }): Kind {
  // Order matters and mirrors how the UI badges them: a card is labelled by its
  // most specific treatment, so a promo alt-art counts once, as PROMO.
  if (c.isPromo) return "PROMO";
  if (c.variant != null) return "ALT-ART";
  if (isSignature(c.collectorNumber)) return "SIG";
  if (isOvernumbered(c.collectorNumber)) return "OVERNUM";
  return "BASE";
}

const pct = (n: number, total: number) => (total ? `${((n / total) * 100).toFixed(0)}%` : "—");

async function main() {
  const cards = await prisma.card.findMany({
    select: { setCode: true, collectorNumber: true, variant: true, isPromo: true, rarity: true, name: true, slug: true },
  });
  console.log(`\nRarity census — ${cards.length} cards\n`);

  const setCodes = SETS.map((s) => s.code).filter((code) => cards.some((c) => c.setCode === code));
  // Any rarity string actually present, so a value outside RARITIES (e.g. the
  // "TBC" placeholder import-vendetta.ts writes when the gallery omitted it)
  // shows up rather than being silently bucketed away.
  const seenRarities = [...new Set(cards.map((c) => c.rarity))].sort(
    (a, b) => (RARITY_KEYS.indexOf(a) + 99) % 99 - ((RARITY_KEYS.indexOf(b) + 99) % 99),
  );
  const unknown = seenRarities.filter((r) => !RARITY_KEYS.includes(r));

  // ── 1. BASE prints only: the apples-to-apples comparison ──────────────────
  console.log("BASE PRINTS ONLY — the population the rarity filter is about\n");
  const head = ["set", ...seenRarities, "total"];
  console.log(head.map((h, i) => (i === 0 ? h.padEnd(6) : h.padStart(10))).join(""));
  for (const code of setCodes) {
    const base = cards.filter((c) => c.setCode === code && kindOf(c) === "BASE");
    if (!base.length) continue;
    const row = [code.padEnd(6)];
    for (const r of seenRarities) {
      const n = base.filter((c) => c.rarity === r).length;
      row.push(`${n} ${pct(n, base.length)}`.padStart(10));
    }
    row.push(String(base.length).padStart(10));
    console.log(row.join(""));
  }

  // ── 2. Every set × printing kind × rarity ─────────────────────────────────
  console.log("\n\nBY PRINTING KIND — a chase print inherits the rarity it re-prints\n");
  for (const code of setCodes) {
    const inSet = cards.filter((c) => c.setCode === code);
    console.log(`${code}  (${inSet.length} cards)`);
    for (const k of KINDS) {
      const group = inSet.filter((c) => kindOf(c) === k);
      if (!group.length) continue;
      const byR = seenRarities
        .map((r) => [r, group.filter((c) => c.rarity === r).length] as const)
        .filter(([, n]) => n > 0)
        .map(([r, n]) => `${r}:${n}`)
        .join("  ");
      console.log(`   ${k.padEnd(8)} ${String(group.length).padStart(4)}   ${byR}`);
    }
    console.log("");
  }

  // ── 3. Anomalies worth acting on ──────────────────────────────────────────
  console.log("\nANOMALIES\n");
  let flagged = 0;
  const flag = (msg: string) => {
    flagged++;
    console.log(`  • ${msg}`);
  };

  if (unknown.length) {
    for (const r of unknown) {
      const n = cards.filter((c) => c.rarity === r);
      const bySet = [...new Set(n.map((c) => c.setCode))].join("/");
      flag(`${n.length} card(s) carry rarity "${r}", which is not one of ${RARITY_KEYS.join("/")} — sets: ${bySet}`);
    }
  }

  // A set missing a tier its peers all have is a data gap, not a design choice.
  for (const r of RARITY_KEYS) {
    const withTier = setCodes.filter((code) =>
      cards.some((c) => c.setCode === code && kindOf(c) === "BASE" && c.rarity === r),
    );
    const without = setCodes.filter((code) => !withTier.includes(code) && cards.some((c) => c.setCode === code));
    if (withTier.length >= 2 && without.length) {
      flag(`rarity "${r}" exists in ${withTier.join("/")} but NOT in ${without.join("/")} (base prints)`);
    }
  }

  // Chase prints sitting in a base tier — the reported bug.
  for (const code of setCodes) {
    for (const k of ["OVERNUM", "SIG", "ALT-ART"] as Kind[]) {
      const bad = cards.filter((c) => c.setCode === code && kindOf(c) === k && c.rarity !== "Showcase");
      if (!bad.length) continue;
      const tiers = [...new Set(bad.map((c) => c.rarity))].join("/");
      flag(`${code}: ${bad.length} ${k} print(s) sit in base tier(s) ${tiers} — e.g. ${bad.slice(0, 3).map((c) => `${c.collectorNumber} ${c.name}`).join(", ")}`);
    }
  }

  if (!flagged) console.log("  none");
  console.log("");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
