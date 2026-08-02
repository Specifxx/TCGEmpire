/**
 * Assertion script for the Shopify title → card resolver (resolveCardId in
 * price-import.ts), covering the odd real-world listing shapes seen across the
 * US store batch: Overnumbered chase prints, lettered/starred alt-art suffixes
 * (151b/298, a starred number like 303 over 298), Chinese-language listings,
 * and prize-wall/metal promos.
 *
 * There's no test framework in this repo (no jest/vitest anywhere) — this
 * mirrors the existing scripts/check-card-consistency.ts convention instead:
 * a plain tsx script asserting real behaviour, exit code 1 on any failure.
 *
 * The card fixtures below are HAND-BUILT, not loaded from the DB or from
 * prisma/riftbound-cards.json (that file is RiftScribe's raw import shape —
 * set_id/collector_number as a bare int, no isPromo/variant/collectorNumber
 * "N/total" string — turning it into a real Card row goes through the full
 * import pipeline, which is out of scope here). "Blazing Scorcher" (001/298)
 * and "Watchful Sentry" (096/298) are real per prisma/riftbound-cards.json and
 * price-import.ts's own multi-card-listing comment, respectively; the
 * Overnumbered/promo fixtures are illustrative (correct NUMBER relationships —
 * over the set's own total — but not a claim about a specific real printing).
 *
 * Usage: npx tsx scripts/test-parsing.ts
 */
process.env.DATABASE_URL ||= "postgresql://localhost:5432/unused_test_placeholder";

import { buildCardIndex, resolveCardId, type CardLite, type ShopifyProduct } from "../src/lib/price-import";

const CARDS: CardLite[] = [
  { id: "c-blazing-scorcher", name: "Blazing Scorcher", setCode: "OGN", collectorNumber: "001/298", rarity: "Common", variant: null, isPromo: false },
  { id: "c-watchful-sentry", name: "Watchful Sentry", setCode: "OGN", collectorNumber: "096/298", rarity: "Common", variant: null, isPromo: false },
  // Starred Signature pair — mirrors the exact "223*/221" example already used
  // in resolveCardId's own comments.
  { id: "c-vayne-base", name: "Vayne, the Hunter", setCode: "SFD", collectorNumber: "150/221", rarity: "Rare", variant: null, isPromo: false },
  { id: "c-vayne-signature", name: "Vayne, the Hunter", setCode: "SFD", collectorNumber: "223*/221", rarity: "Showcase", variant: null, isPromo: false },
  // Lettered alt-art pair (the "151b/298" shape) — synthetic second printing of
  // a real base card, added purely to exercise the alt-art disambiguation path.
  { id: "c-buccaneer-base", name: "Brazen Buccaneer", setCode: "OGN", collectorNumber: "002/298", rarity: "Common", variant: null, isPromo: false },
  { id: "c-buccaneer-alt", name: "Brazen Buccaneer", setCode: "OGN", collectorNumber: "002b/298", rarity: "Showcase", variant: "b", isPromo: false },
  // Overnumbered chase print (number beyond the set total, e.g. VEN's 166) —
  // illustrative name, real number relationship.
  { id: "c-overnumbered-chase", name: "Windborne Vanguard", setCode: "VEN", collectorNumber: "197/166", rarity: "Epic", variant: null, isPromo: false },
  // Promo — illustrative name, shares a base-card-shaped number as the schema's
  // isPromo/promo-pool matching expects.
  { id: "c-ashe-promo", name: "Ashe, the Frost Archer", setCode: "OGN", collectorNumber: "128/298", rarity: "Rare", variant: null, isPromo: true },
  // A Legend whose ONLY row in our DB is its Signature print — mirrors the real
  // "Kennen, Heart of the Tempest" bug: 88gamesarena.com.au sells the ordinary Rare
  // 155/166 print, which we hadn't catalogued, and the store's title shares the
  // Signature's exact name. No base sibling exists here on purpose.
  { id: "c-kennen-signature-only", name: "Kennen, Heart of the Tempest", setCode: "VEN", collectorNumber: "197*/166", rarity: "Showcase", variant: null, isPromo: false },
];

function product(title: string): ShopifyProduct {
  return { title, handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), variants: [{ title: "Near Mint", price: "5.00", available: true }] };
}

interface Case {
  label: string;
  title: string;
  expected: string | null;
}

const CASES: Case[] = [
  { label: "plain base match", title: "Blazing Scorcher (001/298)", expected: "c-blazing-scorcher" },
  {
    label: "Chinese-language listing, English name in parens (parens are stripped — must resolve via collector number, not name)",
    title: "暗影守卫 (Watchful Sentry) - 096/298",
    expected: "c-watchful-sentry",
  },
  { label: "Signature suffix (223*/221) routes to the starred printing, not the base", title: "Vayne, the Hunter - Signature (223*/221)", expected: "c-vayne-signature" },
  { label: "plain number (150/221) routes to the base Vayne, not the Signature", title: "Vayne, the Hunter (150/221)", expected: "c-vayne-base" },
  { label: "lettered alt-art suffix (002b/298) routes to the alt printing", title: "Brazen Buccaneer - Alternate Art (002b/298)", expected: "c-buccaneer-alt" },
  { label: "plain number (002/298) routes to the base printing, not the alt", title: "Brazen Buccaneer (002/298)", expected: "c-buccaneer-base" },
  { label: "Overnumbered chase print (197/166, over VEN's 166 total)", title: "Windborne Vanguard - Overnumbered (197/166)", expected: "c-overnumbered-chase" },
  {
    label: "metal/prize-wall promo — 'Promo' alone doesn't clear the extra qualifier words from the name key, so this only resolves via the collector-number fallback inside the promo branch",
    title: "Ashe, the Frost Archer — Metal Prize Wall Promo (128/298)",
    expected: "c-ashe-promo",
  },
  {
    label: "multi-card/playset guard — never price a lot against a single card (the exact example from price-import.ts's own MULTI_CARD comment)",
    title: "PLAYSET (3) 3x Watchful Sentry - 096/298",
    expected: null,
  },
  {
    label: "real bug (88gamesarena.com.au): a same-named base print we haven't catalogued must not be mis-attached to our only (Signature) row for that name — the title's own number (155/166) disagrees with the sole candidate's (197*/166), so it must stay unmatched, not silently price the Signature card at the base print's price",
    title: "Kennen - Heart of the Tempest [VEN - 155/166]",
    expected: null,
  },
];

function main() {
  const idx = buildCardIndex(CARDS);
  let failures = 0;
  for (const c of CASES) {
    const got = resolveCardId(product(c.title), idx);
    const ok = got === c.expected;
    console.log(`${ok ? "✓" : "✗"} ${c.label}\n    title: "${c.title}"\n    expected=${c.expected} got=${got}`);
    if (!ok) failures++;
  }
  console.log(`\n${CASES.length - failures}/${CASES.length} passed.`);
  if (failures > 0) {
    console.error(`\n::error::${failures} parsing case(s) failed — resolveCardId's behaviour changed. Fix the regression before shipping.`);
    process.exit(1);
  }
}

main();
