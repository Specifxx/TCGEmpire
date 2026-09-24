import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isUltimate, isOvernumbered, displayRarity, rarityInfo, RARITY_KEYS, chasePrintRarity } from "../src/lib/constants";
import { printingKind, printingFieldsFrom, PRINTING_DISPLAY } from "../src/lib/content/card-narrative";
import { poolOf, derivedRates, CHASE_RATES, computeEv, type PoolKey } from "../src/lib/box-ev";
import { PULL_RATES } from "../src/lib/pack-composition";
import { parseSearchQuery } from "../src/lib/search-query";
import { buildCardWhere } from "../src/lib/cards";

// Site owner, 2026-09-24: "Baron Nashor overnumbered is actually ultimate rarity
// and has the same odds as a signature card." DECISIONS.md, "Ultimate rarity:
// Unleashed's Baron Nashor", 2026-09-24.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const BARON = { setCode: "UNL", collectorNumber: "238/219", rarity: "Showcase", variant: null, isPromo: false };

test("Baron Nashor 238/219 is Unleashed's Ultimate; nothing else is", () => {
  assert.ok(isUltimate("UNL", "238/219"));
  assert.ok(!isUltimate("UNL", "147/219"), "the base Baron is not");
  assert.ok(!isUltimate("UNL", "237/219"), "the other over-numbers are not");
  assert.ok(!isUltimate("OGN", "238/298"), "the list is per set");
  // Its number is still an over-number — which is why it needs its own rule.
  assert.ok(isOvernumbered("238/219"));
});

test("it shows as Ultimate rarity, while the stored rarity and the rarity filter are untouched", () => {
  assert.equal(displayRarity(BARON), "Ultimate");
  assert.equal(rarityInfo("Ultimate").label, "Ultimate");
  assert.equal(displayRarity({ setCode: "UNL", collectorNumber: "147/219", rarity: "Epic" }), "Epic");
  // Not a base rarity: RARITY_KEYS drives the DB rarity filter and the facet pages.
  assert.ok(!RARITY_KEYS.includes("Ultimate"));
  assert.equal(chasePrintRarity(BARON), "Showcase");
});

test("its printing is Ultimate, ahead of over-numbered", () => {
  assert.equal(printingKind(printingFieldsFrom(BARON)), "ultimate");
  assert.equal(PRINTING_DISPLAY.ultimate, "Ultimate");
  assert.equal(printingKind(printingFieldsFrom({ ...BARON, collectorNumber: "237/219" })), "overnumbered");
});

test("box EV: Ultimate is its own pool at exactly the Signature rate", () => {
  assert.equal(poolOf(BARON), "Ultimate");
  assert.equal(poolOf({ ...BARON, collectorNumber: "237/219" }), "Overnumbered");
  const byKey = Object.fromEntries(PULL_RATES.map((r) => [r.key, r]));
  assert.equal(byKey.ultimate.onePerPacks, byKey.signature.onePerPacks, "same odds as a Signature");
  assert.equal(CHASE_RATES.Ultimate, CHASE_RATES.Signature);

  const counts = new Map<PoolKey, number>([["Overnumbered", 7], ["Ultimate", 1]]);
  const rates = derivedRates({ counts, packs: 24, specialsPerBox: 0.33 });
  assert.equal(rates.Ultimate, 1 / 720);
  assert.equal(rates.Overnumbered, 1 / 72);
  // A set with no Ultimate pays nothing out for one.
  assert.equal(derivedRates({ counts: new Map([["Overnumbered", 7]]), packs: 24, specialsPerBox: 0.33 }).Ultimate, 0);

  // The bug, in numbers: a US$1,000 Baron averaged into a 7-card over-number
  // pool at 1 in 72 was worth ~10x what it is at 1 in 720.
  const stats = new Map([
    ["Overnumbered" as PoolKey, { avgCents: 5_000, priced: 7, total: 7, topCents: 9_000 }],
    ["Ultimate" as PoolKey, { avgCents: 100_000, priced: 1, total: 1, topCents: 100_000 }],
  ]);
  const ev = computeEv({ stats, rates, packs: 24, boxPriceCents: 0 });
  const ult = ev.lines.find((l) => l.pool === "Ultimate")!;
  assert.ok(ult.chase);
  assert.equal(ult.contributionCents, Math.round(100_000 / 720));
});

test("the pack simulator rolls the Ultimate from the same table", () => {
  const route = read("src/app/api/games/pack/route.ts");
  assert.match(route, /\["ultimate", "signature", "overnumbered", "altart"\]/);
  assert.match(route, /key === "ultimate" \? "Ultimate"/);
});

test("it can be found: a filter, a chip, a search word, a badge", () => {
  assert.deepEqual(parseSearchQuery("baron ultimate").filters, { ult: "1" });
  const where = buildCardWhere({ ult: "1" });
  assert.deepEqual(where.AND, [{ OR: [{ setCode: "UNL", collectorNumber: { startsWith: "238/" } }] }]);
  assert.match(read("src/components/Filters.tsx"), /label="Ultimate"/);
  assert.match(read("src/components/ActiveFilters.tsx"), /label: "Ultimate"/);
  const tile = read("src/components/CardTile.tsx");
  assert.match(tile, /<UltimateBadge show=\{isUltimate\(card\.setCode, card\.collectorNumber\)\} \/>/);
  assert.match(tile, /isOvernumbered\(card\.collectorNumber\) && !isUltimate\(/, "never both badges");
  for (const f of ["src/components/QuickView.tsx", "src/app/card/[id]/page.tsx"]) {
    assert.match(read(f), /<RarityBadge rarity=\{displayRarity\(card\)\} \/>/, f);
  }
});
