import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sevenDayChange } from "../src/lib/price-table";

// The homepage price table ("Riftbound card prices today", 2026-09-24) is gone
// from every home (2026-10-02): a link to /price-guide sits under Today's Top
// Deals instead. Its 7-day helper lives on in the price guide.

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

test("every home: Today's Top Deals, then the price guide link; no price table anywhere", () => {
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /<PriceTodayTable|getPriceTable\(/, f);
    const deals = src.indexOf("<TodaysTopDeals");
    const guide = src.indexOf("<PriceGuideCallout");
    const rest = src.indexOf("<HomeSections");
    assert.ok(deals > 0 && deals < guide && guide < rest, `${f}: deals < price guide < HomeSections`);
    assert.match(src, /showTopDeals=\{false\}/, `${f}: the deals render once`);
  }
  const c = read("src/components/home/PriceGuideCallout.tsx");
  assert.match(c, /href="\/price-guide"/);
  assert.match(c, /prefetch=\{false\}/);
  assert.doesNotMatch(c, /prisma|unstable_cache|cookies/, "static: no data of its own");
});
