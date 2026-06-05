/**
 * Test the multi-card (playset/lot/bundle) guard used by the store price matcher.
 *
 * 1) Unit cases: titles that MUST be excluded (multi-card) vs. singles that must NOT.
 * 2) Live check: pull Cherry Collectables' Riftbound products.json and confirm every
 *    "PLAYSET (3) 3x ..." style listing is caught, and that plain singles survive.
 *
 * Usage: npx tsx scripts/test-multicard.ts
 */
import { MULTI_CARD } from "../src/lib/price-import";

const UA = { "User-Agent": "Mozilla/5.0 RiftCompareAUBot" };

// title, shouldBeExcluded
const CASES: [string, boolean][] = [
  ["PLAYSET (3) 3x Watchful Sentry - 096/298", true],
  ["Lot of 4 Watchful Sentry - 096/298", true],
  ["Watchful Sentry Bundle - 096/298", true],
  ["Job Lot Riftbound Origins commons", true],
  ["Complete Set Origins - 298 cards", true],
  ["Full Set Spirit Forged", true],
  ["Vayne 4x - 223/221", true],
  ["3 x Watchful Sentry - 096/298", true],
  ["Set of 5 Riftbound", true],
  ["Bulk Riftbound commons", true],
  // Singles that must still match (NOT excluded):
  ["Watchful Sentry - 096/298", false],
  ["Vayne - Hunter — Signature - 223*/221", false],
  ["Existential Dread - 134/219", false],
  ["Lux - 001/298 Foil Near Mint", false],
];

let failed = 0;
for (const [title, expected] of CASES) {
  const got = MULTI_CARD.test(title);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  excluded=${got} (want ${expected})  "${title}"`);
}

async function liveCheck() {
  const base = "https://www.cherrycollectables.com.au";
  // Cherry's Riftbound singles collection. Page through it fully (the playset
  // listings are deep in the feed, not on page 1) the way the real importer does.
  const handle = "riftbound-singles";
  const products: { title: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    try {
      const r = await fetch(`${base}/collections/${handle}/products.json?limit=250&page=${page}`, { headers: UA });
      if (!r.ok) break;
      const d = (await r.json()) as { products: { title: string }[] };
      if (!d.products?.length) break;
      products.push(...d.products);
      if (d.products.length < 250) break;
    } catch { break; }
  }
  if (!products.length) {
    console.log("\nLive check SKIPPED — could not fetch Cherry Collectables Riftbound feed (offline?).");
    return;
  }
  const excluded = products.filter((p) => MULTI_CARD.test(p.title));
  const playsets = products.filter((p) => /\bplayset\b|\blot of\b|\bx\s*\d+|\d+\s*x\b/i.test(p.title));
  console.log(`\nLive: ${products.length} Cherry products, ${excluded.length} caught by MULTI_CARD.`);
  console.log("Sample excluded titles:");
  for (const p of excluded.slice(0, 10)) console.log(`  - ${p.title}`);

  // Every playset-looking title we can see must be caught by the guard.
  const missed = playsets.filter((p) => !MULTI_CARD.test(p.title));
  if (missed.length) {
    failed += missed.length;
    console.log("FAIL — these multi-card titles were NOT excluded:");
    for (const p of missed) console.log(`  ! ${p.title}`);
  } else {
    console.log("PASS — all playset/lot titles in the live feed are excluded.");
  }
}

liveCheck()
  .catch((e) => { console.error("live check error:", e); })
  .finally(() => {
    console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
    process.exit(failed === 0 ? 0 : 1);
  });
