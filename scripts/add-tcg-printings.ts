/**
 * Add printings that exist on TCGplayer but are missing from our RiftScribe-derived
 * catalogue (e.g. the "b" rune printings / shiny/showcase extras). For each TCGplayer
 * single that doesn't match an existing card, we clone its BASE card (same set + base
 * number) and set the variant collector number — exactly like add-promos.ts, so game
 * data is correct and it displays. Prices are filled by the normal importer afterwards.
 *
 * Usage: npx tsx scripts/add-tcg-printings.ts [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { fetchTcgplayerProducts } from "../src/lib/tcgplayer";
import { cardSlug } from "../src/lib/card-url";

const prisma = new PrismaClient();

// Mirror of the importer's matching keys so we agree on what we already have.
function numKey(seg: string): string {
  const m = seg.match(/^0*(\d+)([a-z]*)/i);
  const base = m ? m[1] + m[2].toLowerCase() : seg.toLowerCase();
  return seg.includes("*") ? `${base}s` : base;
}
function setFromTotal(total?: string): string | null {
  switch (parseInt(total ?? "", 10)) {
    case 298: return "OGN";
    case 221: return "SFD";
    case 219: return "UNL";
    case 24: return "OGS";
    default: return null;
  }
}

async function main() {
  const dry = process.argv.includes("--dry");
  console.log("Fetching TCGplayer catalogue…");
  const products = await fetchTcgplayerProducts();
  const cards = await prisma.card.findMany();

  const have = new Set<string>();
  const baseBy = new Map<string, (typeof cards)[number]>();
  for (const c of cards) {
    const [num, total] = c.collectorNumber.split("/");
    const sc = setFromTotal(total);
    if (sc) have.add(`${sc}|${numKey(num)}`);
    if (c.variant == null && !c.isPromo) {
      baseBy.set(`${c.setCode}|${num.replace(/[a-z*]/gi, "")}/${total}`, c);
    }
  }
  const existingExternal = new Set(cards.map((c) => c.externalId).filter(Boolean) as string[]);
  // Track slugs so we don't create a duplicate card when TCGplayer lists the same
  // printing twice (e.g. a normal + foil entry that share name/number → same slug).
  const usedSlugs = new Set(cards.map((c) => c.slug).filter(Boolean) as string[]);
  let dupSkipped = 0;

  // Unique base-card names (variant null, non-promo) so we can place promos whose
  // TCGplayer number doesn't encode a set (e.g. the R-numbered promo runes) by name.
  const nameCounts = new Map<string, number>();
  for (const c of cards) if (c.variant == null && !c.isPromo) nameCounts.set(c.name, (nameCounts.get(c.name) || 0) + 1);
  const baseByName = new Map<string, (typeof cards)[number]>();
  for (const c of cards) if (c.variant == null && !c.isPromo && nameCounts.get(c.name) === 1) baseByName.set(c.name, c);

  let created = 0, noBase = 0, skipExisting = 0, badNum = 0;
  const samples: string[] = [];
  const badDenoms: Record<string, number> = {};
  const badSamples: string[] = [];
  const noteBad = (numStr: string | undefined, name: string) => {
    badNum++;
    const t = numStr && numStr.includes("/") ? numStr.split("/")[1] : "(no slash)";
    badDenoms[t] = (badDenoms[t] || 0) + 1;
    if (badSamples.length < 15) badSamples.push(`${(numStr || "(none)").padEnd(12)} ${name.slice(0, 40)}`);
  };

  async function cloneCard(base: (typeof cards)[number], collectorNumber: string, externalId: string, variant: string | null, isPromo: boolean, label: string) {
    // Fresh unique slug — cloning the base's slug would collide (slug is @unique).
    const slug = cardSlug({ name: base.name, setCode: base.setCode, collectorNumber, isPromo });
    if (usedSlugs.has(slug)) { dupSkipped++; return; } // a twin listing already creates this printing
    usedSlugs.add(slug);
    if (samples.length < 25) samples.push(`${label}: ${base.name} ${collectorNumber}${isPromo ? " [promo]" : ""}`);
    created++;
    if (!dry) {
      const { id, createdAt, ...rest } = base;
      await prisma.card.create({
        data: {
          ...rest, externalId, collectorNumber, slug, variant, isPromo,
          viewCount: 0, searchCount: 0, lastViewedAt: null, marketPriceCents: 0,
          lowestPriceCents: null, lowestPriceCentsNz: null, lowestPriceCentsUs: null, lowestPriceCentsUk: null,
        },
      }).catch((e) => { console.warn("create failed", collectorNumber, e.message); created--; usedSlugs.delete(slug); });
    }
  }

  const SEALED = /display|booster|bundle|\bbox\b|\bcase\b|\bpack\b|\bdeck\b/i;
  for (const p of products) {
    const numStr = p.customAttributes?.number;
    const externalId = `tcg-${p.productId}`;
    if (existingExternal.has(externalId)) { skipExisting++; continue; }

    // 1) In-set printing: number parses to a known set (e.g. "007b/298").
    if (numStr && numStr.includes("/")) {
      const [num, total] = numStr.split("/");
      const sc = setFromTotal(total);
      if (sc) {
        if (have.has(`${sc}|${numKey(num)}`)) continue; // already have it
        const base = baseBy.get(`${sc}|${num.replace(/[a-z*]/gi, "")}/${total}`);
        if (base) {
          const letter = (num.match(/[a-z]+/i)?.[0] || "").toLowerCase() || null;
          await cloneCard(base, numStr, externalId, letter, false, "VARIANT");
        } else { noBase++; if (samples.length < 25) samples.push(`NO BASE: ${p.productName} ${numStr}`); }
        continue;
      }
    }

    // 2) Promo with non-set numbering (e.g. R-numbered runes): place by unique name.
    if (numStr && !SEALED.test(p.productName) && baseByName.has(p.productName)) {
      await cloneCard(baseByName.get(p.productName)!, numStr, externalId, null, true, "PROMO");
      continue;
    }
    noteBad(numStr, p.productName);
  }
  console.log(`${dry ? "[DRY] " : ""}create=${created} | dupSkipped=${dupSkipped} | noBase=${noBase} | skipExisting=${skipExisting} | badNum=${badNum}`);
  for (const s of samples) console.log("  ", s);
  if (dry) {
    console.log("badNum by denominator:", JSON.stringify(badDenoms));
    console.log("badNum samples:");
    for (const s of badSamples) console.log("  ", s);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
