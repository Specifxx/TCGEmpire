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
  assert.equal(PRICE_TABLE_SIZE, 15, "capped at ~15 rows with a See-all link (2026-09-24)");
  assert.match(src, /take: PRICE_TABLE_SIZE/);
  assert.match(src, /revalidate: 3600/);
  assert.match(src, /cardId: \{ in: ids \}/, "history is read for the table's cards only");
  assert.doesNotMatch(src, /getPopularCards\(|getPriceMovers\(|getRecentlyUpdated\(/, "db.ts rule 6");
  assert.match(src, /\}\)\(\)\.catch\(\(\) => \[\]\)/);
  for (const f of ["src/app/page.tsx", "src/app/au/page.tsx"]) assert.match(read(f), /revalidate = 3600/);
});

test("every market homepage renders the table high up: under the hero and the editorial band", () => {
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
  assert.match(t, /See all \{totalPriced\.toLocaleString\("en-US"\)\} card prices →/);
});

// 2026-09-26 ("Blog and tools, joined up" in DECISIONS.md): the table says how
// to read it, BELOW the rows so nothing pushes the first row down on a phone,
// in words that match what lib/price-table.ts computes.
test("the table explains its columns under the rows, and links the method and the guide", () => {
  const t = read("src/components/home/PriceTodayTable.tsx");
  const rowsEnd = t.lastIndexOf("</table>");
  const explain = t.indexOf("is the lowest in-stock item price we track in");
  assert.ok(rowsEnd > 0 && explain > rowsEnd, "the explanation sits after the rows, never above them");
  assert.match(t, /from a store or eBay, with postage extra/, "Cheapest is min(the market low, the tracked eBay listing), item prices");
  // The 7-day change reads the weekly GLOBAL series (cheapest across AU/US/UK/SG
  // in USD), so it must not read as this market's own history.
  assert.match(t, /cheapest across Australia, the US, the UK and Singapore, in US dollars\), not this market&apos;s own history/);
  assert.match(read("src/lib/price-table.ts"), /country: GLOBAL_HISTORY_COUNTRY/);
  assert.match(t, /▼ green = cheaper worldwide this week\./);
  for (const href of ['href="/methodology"', 'href="/guides/why-riftbound-card-prices-change"']) assert.ok(t.includes(href), href);
  // A region home adds its own buying guide; "/" leads the band below with the
  // six-market one instead.
  assert.match(read("src/components/home/RegionHome.tsx"), /buyingGuide=\{guideSlug \? \{ href: `\/blog\/\$\{guideSlug\}`/);
  assert.doesNotMatch(read("src/app/page.tsx"), /buyingGuide=/);
});
