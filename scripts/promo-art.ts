/**
 * PROMO ART FROM TCGPLAYER: the real face of a promo or alternate printing.
 *
 * WHY. Promo and alternate printings enter the catalogue by cloning their base
 * card (add-promos.ts, add-tcg-printings.ts), so they start with the BASE card's
 * picture. For a plain organized-play reprint that is close enough, but for a
 * printing with its own art it shows the wrong card. The owner's example
 * (2026-10-15): Riven, Shattered VEN 041a/166, the PAX Australia promo, showed
 * the ordinary Riven art, when the real card is a different illustration.
 * fix-cloned-art.ts only knew Riot's official gallery, which does not publish
 * most promos. TCGplayer does: every product page carries a photo of that exact
 * printing (its number, its promo stamp), on a CDN next.config already allows.
 *
 * WHAT IT CHANGES. Only a promo or lettered-variant card whose image is MISSING
 * or SHARED with another card (a clone), and only when exactly one TCGplayer
 * product matches it on all of: set (from the "/NNN" total), the full collector
 * number including its letter, the card name, and promo-ness (a promo card takes
 * a product from a promotional set, a non-promo card one from a main set).
 * Products naming a different treatment ("Metal", "Prize Wall", "Best Of",
 * "Serial Numbered", a bundle) never match: those are different printings of the
 * same number. Two or more matches is ambiguous, so the card is left alone and
 * reported. A product whose image TCGplayer has not uploaded (the CDN answers 403)
 * is skipped. Regional printings (lib/regional-printings.ts) are never touched:
 * their art is the official image already, or deliberately none.
 *
 * REPORT-ONLY unless --apply. Every change and every skip is printed, so a run's
 * log is the review. Runs weekly (promo-art.yml) and from maintenance.yml.
 *
 * Usage: npx tsx scripts/promo-art.ts [--apply]
 */
import { prisma } from "../src/lib/db";
import { fetchTcgplayerProducts, isPromoProduct, numKey, setFromTotal, type TcgProduct } from "../src/lib/tcgplayer";
import { regionalPrinting } from "../src/lib/regional-printings";

const APPLY = process.argv.includes("--apply");
const CDN = "https://tcgplayer-cdn.tcgplayer.com/product";
// A different treatment of the same collector number: never the card we want.
const OTHER_TREATMENT = /\b(metal|prize wall|best of|serial numbered|bundle|oversized|jumbo|playmat|sleeves?)\b/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "041a/166" and "VEN 041a/166" -> "VEN|41a"; null when the set can't be told. */
function productKey(p: TcgProduct): string | null {
  const raw = (p.customAttributes?.number ?? "").replace(/^[A-Z0-9]{2,4}\s+/, "").trim();
  const [num, total] = raw.split("/");
  const set = setFromTotal(total);
  return set && num ? `${set}|${numKey(num)}` : null;
}

async function imageExists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && (r.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

async function main() {
  const cards = await prisma.card.findMany({
    select: {
      id: true, name: true, setCode: true, collectorNumber: true, isPromo: true,
      variant: true, imageUrl: true, externalId: true,
    },
  });

  // An image used by more than one card is a clone somewhere.
  const uses = new Map<string, number>();
  for (const c of cards) if (c.imageUrl) uses.set(c.imageUrl, (uses.get(c.imageUrl) ?? 0) + 1);

  const candidates = cards.filter(
    (c) =>
      (c.isPromo || c.variant != null) &&
      !regionalPrinting(c.externalId) &&
      (!c.imageUrl || (uses.get(c.imageUrl) ?? 0) > 1),
  );
  console.log(`${cards.length} cards; ${candidates.length} promo/variant printings with a missing or shared image.`);

  console.log("Fetching the TCGplayer catalogue...");
  // TCGplayer's search can return a product twice across pages; one per id.
  const seen = new Set<number>();
  const products = (await fetchTcgplayerProducts()).filter(
    (p) => !OTHER_TREATMENT.test(p.productName) && !seen.has(p.productId) && seen.add(p.productId),
  );
  const byKey = new Map<string, TcgProduct[]>();
  for (const p of products) {
    const k = productKey(p);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  console.log(`${products.length} TCGplayer singles indexed.\n`);

  let changed = 0;
  let ambiguous = 0;
  let noMatch = 0;
  let noImage = 0;
  for (const c of candidates) {
    const [num] = c.collectorNumber.split("/");
    const key = `${c.setCode}|${numKey(num)}`;
    const label = `${c.name} ${c.setCode} ${c.collectorNumber}${c.isPromo ? " (promo)" : ""}`;
    const matches = (byKey.get(key) ?? []).filter(
      (p) => norm(p.productName) === norm(c.name) && isPromoProduct(p) === c.isPromo,
    );
    if (matches.length === 0) {
      noMatch++;
      continue;
    }
    if (matches.length > 1) {
      ambiguous++;
      console.log(`AMBIGUOUS  ${label}: ${matches.map((m) => `${m.productId} "${m.productName}" [${m.setName}]`).join(" | ")}`);
      continue;
    }
    const p = matches[0];
    const full = `${CDN}/${p.productId}_in_1000x1000.jpg`;
    if (!(await imageExists(full))) {
      noImage++;
      console.log(`NO IMAGE   ${label}: TCGplayer ${p.productId} has no photo yet`);
      continue;
    }
    if (c.imageUrl === full) continue;
    changed++;
    console.log(`${APPLY ? "SET" : "WOULD SET"}  ${label} <- TCGplayer ${p.productId} "${p.productName}" [${p.setName}]`);
    if (APPLY) {
      await prisma.card.update({
        where: { id: c.id },
        // The blur placeholder and the scanner hash were computed from the cloned
        // picture, so they would describe the wrong card. Both are rebuilt by their
        // own jobs from the new image.
        data: { imageUrl: full, imageThumbUrl: `${CDN}/${p.productId}_in_400x400.jpg`, blurDataUrl: null, imageHash: null },
      });
    }
  }

  const summary = `${APPLY ? "Updated" : "Would update"} ${changed}; ${ambiguous} ambiguous (left alone); ${noImage} with no TCGplayer photo yet; ${noMatch} with no TCGplayer product.`;
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Promo art\n\n${summary}\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
