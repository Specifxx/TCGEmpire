import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sevenDayChange, PRICE_TABLE_SIZE } from "../src/lib/price-table";

// "Riftbound card prices today" under every market homepage's hero.
// DECISIONS.md, "Growth pass: rank for 'riftbound card prices'", 2026-09-24.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const DAY = 86400_000;
const now = Date.parse("2026-09-24T00:00:00Z");

test("the 7-day change compares the latest snapshot with the one nearest a week earlier", () => {
  const pts = [
    { t: now - 15 * DAY, v: 900 },
    { t: now - 8 * DAY, v: 1000 },
    { t: now - 1 * DAY, v: 1100 },
  ];
  assert.equal(sevenDayChange(pts, now), 10);
});

test("no change is invented: too few points, stale data, outliers and zero bases read as unknown", () => {
  assert.equal(sevenDayChange([], now), null);
  assert.equal(sevenDayChange([{ t: now - DAY, v: 500 }], now), null);
  assert.equal(sevenDayChange([{ t: now - 30 * DAY, v: 500 }, { t: now - 23 * DAY, v: 600 }], now), null, "stale");
  assert.equal(sevenDayChange([{ t: now - 8 * DAY, v: 100 }, { t: now - DAY, v: 900 }], now), null, "a 800% jump is a mismatch");
  assert.equal(sevenDayChange([{ t: now - 8 * DAY, v: 0 }, { t: now - DAY, v: 900 }], now), null);
});

test("the loader is capped, cached no shorter than the homepages, fails open, and nests no cached loader", () => {
  const src = read("src/lib/price-table.ts");
  assert.equal(PRICE_TABLE_SIZE, 50);
  assert.match(src, /take: PRICE_TABLE_SIZE/);
  assert.match(src, /revalidate: 3600/);
  assert.match(src, /cardId: \{ in: ids \}/, "history is read for the table's cards only");
  assert.doesNotMatch(src, /getPopularCards\(|getPriceMovers\(|getRecentlyUpdated\(/, "db.ts rule 6");
  assert.match(src, /\}\)\(\)\.catch\(\(\) => \[\]\)/);
  for (const f of ["src/app/page.tsx", "src/app/au/page.tsx"]) assert.match(read(f), /revalidate = 3600/);
});

test("every market homepage renders the table directly under the hero", () => {
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) {
    const src = read(f);
    const hero = src.indexOf("<CinematicHero");
    const table = src.indexOf("<PriceTodayTable");
    const rest = src.indexOf("<HomeSections");
    assert.ok(hero >= 0 && hero < table && table < rest, f);
  }
  const t = read("src/components/home/PriceTodayTable.tsx");
  assert.match(t, /Riftbound card prices today/);
  for (const col of ["Card", "Set", "Cheapest", "Stores in stock", "7-day change"]) assert.ok(t.includes(`>${col}</th>`), col);
  assert.match(t, /All \{totalPriced\.toLocaleString\("en-US"\)\} card prices →/);
});
