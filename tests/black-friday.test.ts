import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blackFriday, cyberMonday, inSeason, sealedDeals } from "../src/lib/black-friday";
import type { SealedGroup } from "../src/lib/sealed-import";

const now = Date.parse("2026-10-30T00:00:00Z");
const seen = "2026-10-29T12:00:00Z";
const row = (retailer: string, priceCents: number, inStock = true) => ({ retailer, retailerName: retailer, priceCents, url: "https://x", inStock, lastSeen: seen });
const group = (key: string, listings: ReturnType<typeof row>[], msrpCents: number | null = null) =>
  ({ groupKey: key, name: key, productType: "Booster Box", setCode: "RAD", imageUrl: null, lowestPriceCents: null, storeCount: listings.length, msrpCents, atMsrp: false, overMsrpPct: null, firstSeenAt: null, listings }) as unknown as SealedGroup;

test("Black Friday and Cyber Monday dates", () => {
  assert.equal(blackFriday(2026), "2026-11-27");
  assert.equal(cyberMonday(2026), "2026-11-30");
  assert.equal(blackFriday(2027), "2027-11-26");
  assert.ok(inSeason("2026-10-30"));
  assert.ok(!inSeason("2026-12-10"));
});

test("a deal is a store well under the median or the MSRP; eBay and sold-out rows never count", () => {
  const deals = sealedDeals(
    [
      group("under-median", [row("a", 9000), row("b", 11000), row("c", 12000), row("ebay-us", 5000)]),
      group("flat", [row("a", 11800), row("b", 12000), row("c", 12100)], 12000),
      group("under-msrp", [row("a", 10800)], 12000),
      group("sold-out-cheap", [row("a", 5000, false), row("b", 12000), row("c", 12000)]),
    ],
    now,
  );
  assert.deepEqual(deals.map((d) => d.group.groupKey), ["under-median", "under-msrp"]);
  assert.equal(deals[0].cheapestCents, 9000);
  assert.equal(deals[0].underMedianPct, 18);
  assert.equal(deals[1].underMsrpPct, 10);
});

test("the page states no 'was' price or countdown", () => {
  const page = readFileSync("src/app/black-friday/page.tsx", "utf8");
  assert.doesNotMatch(page, /ends soon|limited time|countdown/i);
  assert.match(page, /export const revalidate = 21600;/);
});
