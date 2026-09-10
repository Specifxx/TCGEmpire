/**
 * Repairs cards that were created from a TCGplayer PROMO product but filed as an
 * in-set variant (a pack-pulled "Showcase") — the rows scripts/add-tcg-printings.ts
 * produced while its local promo-set regex was narrower than the canonical
 * isPromoProduct() in lib/tcgplayer.ts. That drift is fixed at the source; this
 * cleans up what it already wrote.
 *
 * THE REPORTED CASE. riftcompare.com/card/warwick-hunter-ogn-159a-298 rendered as
 * "Warwick, Hunter (Showcase) — OGN 159a/298" and linked to TCGplayer product
 * 678049, which is in "Riftbound Promotional Cards" — a promo printing, not the
 * pack-pulled Showcase the page claimed, and priced like one (US$63.81).
 *
 * WHAT COUNTS AS AFFECTED, and why the test is this narrow: a card whose
 * externalId is "tcg-<productId>" (so it was created BY that product, not merely
 * priced from it), where that product is isPromoProduct(), and where the card is
 * NOT already flagged isPromo. Anything else is left alone — a promo already
 * flagged correctly needs nothing, and a card that merely takes a price from a
 * promo product is a different problem with a different fix
 * (PROMO_PRODUCT_OVERRIDES).
 *
 * DRY RUN BY DEFAULT — pass --apply to write.
 *
 * THE SLUG IS THE HARD PART. Flagging isPromo changes what cardSlug() produces
 * ("…-promo"), and the current slug is a live, indexed, possibly linked-to URL.
 * So this script NEVER rewrites a slug on its own: it reports the slug each row
 * would move to and leaves the existing one in place unless --reslug is passed
 * too, which also prints the redirect line to add to next.config.js. Correct
 * data with a stable URL first; the URL change is a separate, deliberate call.
 *
 * Usage:
 *   npx tsx scripts/fix-promo-as-variant.ts                 # report only
 *   npx tsx scripts/fix-promo-as-variant.ts --apply         # fix flags/rarity, keep slugs
 *   npx tsx scripts/fix-promo-as-variant.ts --apply --reslug
 */
import { PrismaClient } from "@prisma/client";
import { fetchTcgplayerProducts, isPromoProduct } from "../src/lib/tcgplayer";
import { cardSlug } from "../src/lib/card-url";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const RESLUG = process.argv.includes("--reslug");

async function main() {
  console.log("Fetching TCGplayer catalogue…");
  const products = await fetchTcgplayerProducts();
  // Only promo products matter here, keyed the way a card's externalId stores them.
  const promoByExternal = new Map(
    products.filter(isPromoProduct).map((p) => [`tcg-${p.productId}`, p]),
  );
  console.log(`Promo products in catalogue: ${promoByExternal.size}`);

  const suspects = await prisma.card.findMany({
    where: { externalId: { startsWith: "tcg-" }, isPromo: false },
    select: {
      id: true, name: true, slug: true, setCode: true, collectorNumber: true,
      variant: true, rarity: true, externalId: true,
    },
  });

  const affected = suspects.filter((c) => c.externalId && promoByExternal.has(c.externalId));

  // The rarity these rows carry ("Showcase") is add-tcg-printings' own rule for a
  // VARIANT print, not TCGplayer's and not Riot's. The honest value is whatever the
  // base printing of the same card in the same set carries — which is exactly what
  // that script would have written had the product taken the promo branch, since a
  // promo clone keeps `rest.rarity` from its donor. Look those donors up rather than
  // inventing a label.
  const baseRarity = new Map<string, string | null>();
  if (affected.length) {
    const bases = await prisma.card.findMany({
      where: {
        variant: null,
        isPromo: false,
        OR: affected.map((c) => ({ name: c.name, setCode: c.setCode })),
      },
      select: { name: true, setCode: true, rarity: true },
    });
    for (const b of bases) {
      const k = `${b.setCode}|${b.name.toLowerCase()}`;
      if (!baseRarity.has(k)) baseRarity.set(k, b.rarity);
    }
  }

  console.log(`Cards created from a promo product but NOT flagged isPromo: ${affected.length}`);
  if (!affected.length) {
    console.log("Nothing to repair.");
    return;
  }

  let fixed = 0;
  for (const c of affected) {
    const p = promoByExternal.get(c.externalId!)!;
    // Clearing the variant is what makes the rarity honest again (the "Showcase"
    // label exists only because a variant letter was set), so the two move together
    // or not at all.
    const clearedVariant = c.variant != null;
    const restoredRarity = baseRarity.get(`${c.setCode}|${c.name.toLowerCase()}`) ?? c.rarity;
    const wouldSlug = cardSlug({
      name: c.name,
      setCode: c.setCode,
      collectorNumber: c.collectorNumber,
      isPromo: true,
    });

    console.log(
      `${APPLY ? "FIX " : "(dry) "}${c.name} [${c.setCode} ${c.collectorNumber}] rarity=${c.rarity}` +
        `${clearedVariant ? ` variant=${c.variant}→null rarity→${restoredRarity ?? "(null)"}` : ""}`,
    );
    console.log(`      product ${p.productId} · set "${p.setName}"`);
    console.log(`      /card/${c.slug}`);
    if (wouldSlug !== c.slug) {
      console.log(`      slug would become /card/${wouldSlug}${RESLUG ? " (APPLYING)" : " (kept — pass --reslug to move it)"}`);
      if (RESLUG) {
        console.log(`      REDIRECT: { source: "/card/${c.slug}", destination: "/card/${wouldSlug}", permanent: true },`);
      }
    }

    if (APPLY) {
      await prisma.card.update({
        where: { id: c.id },
        data: {
          isPromo: true,
          // Only touch rarity when we are also clearing the variant that caused it.
          ...(clearedVariant ? { variant: null, rarity: restoredRarity } : {}),
          ...(RESLUG && wouldSlug !== c.slug ? { slug: wouldSlug } : {}),
        },
      });
      fixed++;
    }
  }

  console.log("");
  console.log(
    APPLY
      ? `Repaired ${fixed} card(s).${RESLUG ? " Add the REDIRECT lines above to next.config.js." : " Slugs left unchanged."}`
      : `${affected.length} card(s) would be repaired. Re-run with --apply to write.`,
  );
}

main()
  .catch((e) => {
    console.error("fix-promo-as-variant failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
