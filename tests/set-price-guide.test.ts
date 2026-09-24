import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setPriceGuideRows } from "../src/lib/set-price-guide";

// A full price list on every set page (#price-guide), and the counted title.
// DECISIONS.md, "Growth pass: rank for 'riftbound card prices'", 2026-09-24.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const F = "lowestPriceCentsUs";

test("every card is listed, dearest first, unpriced cards last by collector number", () => {
  const rows = setPriceGuideRows(
    [
      { id: "a", slug: "a", name: "Cheap", rarity: "Common", collectorNumber: "010/219", setCode: "UNL", [F]: 25, stores: 4 },
      { id: "b", slug: "b", name: "Dear", rarity: "Epic", collectorNumber: "147/219", setCode: "UNL", [F]: 9000, stores: 2 },
      { id: "c", slug: null, name: "None B", rarity: "Rare", collectorNumber: "100/219", setCode: "UNL", [F]: null },
      { id: "d", slug: null, name: "None A", rarity: "Rare", collectorNumber: "20/219", setCode: "UNL", [F]: null },
      { id: "u", slug: "u", name: "Baron Nashor", rarity: "Showcase", collectorNumber: "238/219", setCode: "UNL", [F]: 50000, stores: 1 },
    ],
    F,
  );
  assert.deepEqual(rows.map((r) => r.id), ["u", "b", "a", "d", "c"]);
  assert.equal(rows[0].rarity, "Ultimate", "the displayed rarity, not the stored one");
  assert.equal(rows[0].name, "Baron Nashor (Showcase, Overnumbered)", "credentialed names separate printings");
  assert.equal(rows[3].priceCents, null);
  assert.equal(rows[3].stores, 0);
});

test("the set page renders the guide under its H2 and anchor, from the cached intro query", () => {
  const page = read("src/app/sets/[set]/page.tsx");
  assert.match(page, /<SetPriceGuide setName=\{set\.name\} rows=\{priceGuide\}/);
  assert.match(page, /storeCountsByCountry\(rows\.map\(\(r\) => r\.id\)\)/, "one grouped count, not per card");
  const c = read("src/components/sets/SetPriceGuide.tsx");
  assert.match(c, /id="price-guide"/);
  assert.match(c, /Riftbound \{setName\} price guide/);
});

test("the title leads with the counted rung, fits 60, and falls back without a count", () => {
  const page = read("src/app/sets/[set]/page.tsx");
  assert.match(page, /cardCount > 0 \? \[`Riftbound \$\{set\.name\} Card List & Price Guide \(All \$\{cardCount\} Cards\)`\]/);
  assert.match(page, /fullTitles\.find\(\(t\) => t\.length <= 60\)/);
  assert.match(page, /title: \{ absolute: fullTitle \}/);
  for (const [name, n] of [["Origins", 412], ["Unleashed", 250], ["Vendetta", 190], ["Radiance", 180]] as const) {
    const t = `Riftbound ${name} Card List & Price Guide (All ${n} Cards)`;
    assert.ok(t.length <= 60, `${t} is ${t.length}`);
  }
});
