import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auctionWatch, dropsWatch, gradedWatch, sealedWatch, GRADED_WATCH_MAX_CENTS, type GradedListingRow } from "../src/lib/price-watch";
import type { SealedGroup } from "../src/lib/sealed-import";
import type { Mover } from "../src/lib/price-history";
import type { AuctionRow } from "../src/lib/ebay-auctions";

// The Black Friday / Cyber Monday price watch (DECISIONS.md, 2026-11-06): pure rules.

const now = Date.parse("2026-11-06T00:00:00Z");
const seen = "2026-11-05T12:00:00Z";
const row = (retailer: string, priceCents: number, inStock = true) => ({ retailer, retailerName: retailer, priceCents, url: `https://x/${retailer}`, inStock, lastSeen: seen });
const group = (key: string, productType: string, listings: ReturnType<typeof row>[]) =>
  ({ groupKey: key, name: key, productType, setCode: "RAD", imageUrl: null, lowestPriceCents: null, storeCount: listings.length, msrpCents: null, atMsrp: false, overMsrpPct: null, firstSeenAt: null, listings }) as unknown as SealedGroup;

test("sealed watch: boxes first, dearest first, cheapest store beside cheapest in-stock eBay row; nothing with neither", () => {
  const rows = sealedWatch(
    [
      group("bundle", "Bundle", [row("a", 4000), row("ebay_us", 3500)]),
      group("cheap-box", "Booster Box", [row("a", 11000), row("b", 10500)]),
      group("dear-box", "Booster Box", [row("a", 13000), row("ebay_us", 12000), row("ebay_us", 14000, false)]),
      group("ebay-only", "Booster Box", [row("a", 9000, false), row("ebay_us", 12500)]),
      group("nothing", "Booster Box", [row("a", 9000, false)]),
    ],
    now,
  );
  assert.deepEqual(rows.map((r) => r.group.groupKey), ["dear-box", "ebay-only", "cheap-box", "bundle"]);
  assert.equal(rows[0].store?.priceCents, 13000);
  assert.equal(rows[0].ebay?.priceCents, 12000);
  assert.equal(rows[1].store, null);
  assert.equal(rows[2].store?.retailerName, "b");
  assert.equal(rows[2].ebay, null);
});

test("drops watch: the movers in order, each with its tagged eBay copy when there is one", () => {
  const mover = (id: string, pct: number) => ({ card: { id, name: id }, nowCents: 1000, refCents: 2000, pct, points: [] }) as unknown as Mover;
  const out = dropsWatch(
    [mover("a", -40), mover("b", -30)],
    new Map([["a", { ebayCents: 900, postageKnown: true, url: "https://www.ebay.com/itm/1", ebayKey: "ebay_us" }]]),
    (u) => `${u}?tagged`,
  );
  assert.deepEqual(out.map((d) => d.mover.card.id), ["a", "b"]);
  assert.deepEqual(out[0].ebay, { priceCents: 900, postageKnown: true, url: "https://www.ebay.com/itm/1?tagged", retailer: "ebay_us" });
  assert.equal(out[1].ebay, null);
});

test("graded watch: one row per card, its best grade (PSA first) at the cheapest price, dearest cards first; stale and silly rows out", () => {
  const l = (cardId: string, grader: string | null, grade: number | null, priceCents: number, updatedAt = "2026-11-05T15:00:00Z"): GradedListingRow =>
    ({ cardId, itemId: `${cardId}-${grader}-${grade}-${priceCents}`, priceCents, shippingCents: null, currency: "USD", url: "https://www.ebay.com/itm/1", title: "t", imageUrl: null, grader, grade, updatedAt });
  const cards = new Map([
    ["zed", { id: "zed", slug: "zed", name: "Zed", setName: "Vendetta", collectorNumber: "191" }],
    ["jinx", { id: "jinx", slug: "jinx", name: "Jinx", setName: "Origins", collectorNumber: "10" }],
    ["old", { id: "old", slug: "old", name: "Old", setName: "Origins", collectorNumber: "11" }],
  ]);
  const rows = gradedWatch(
    [
      l("zed", "PSA", 10, 50000),
      l("zed", "PSA", 10, 40000),
      l("zed", "BGS", 10, 30000),
      l("zed", "PSA", 9, 9000),
      l("jinx", "CGC", 9.5, 45000),
      l("jinx", "PSA", 10, GRADED_WATCH_MAX_CENTS + 1),
      l("old", "PSA", 10, 99000, "2026-11-01T00:00:00Z"),
      l("unknown-card", "PSA", 10, 99000),
    ],
    cards,
    now,
  );
  assert.deepEqual(rows.map((r) => [r.card.name, r.grade, r.priceCents]), [["Jinx", "CGC 9.5", 45000], ["Zed", "PSA 10", 40000]]);
});

test("auction watch: biggest bid first", () => {
  const a = (itemId: string, currentBidCents: number, endsAt: string) => ({ itemId, currentBidCents, endsAt, title: itemId, url: "https://x", imageUrl: null, currency: "USD", bidCount: 1, buyItNowCents: null, condition: null, grader: null, grade: null }) as AuctionRow;
  const out = auctionWatch([a("small", 100, "2026-11-06T01:00:00Z"), a("big", 90000, "2026-11-06T05:00:00Z"), a("mid", 20000, "2026-11-06T02:00:00Z")], 2);
  assert.deepEqual(out.map((r) => r.itemId), ["big", "mid"]);
});

test("both sale pages are the one component, six hours, no countdown; Cyber Monday keeps its own URL in the sitemap and nav", () => {
  for (const p of ["src/app/black-friday/page.tsx", "src/app/cyber-monday/page.tsx"]) {
    const page = readFileSync(p, "utf8");
    assert.match(page, /export const revalidate = 21600;/);
    assert.match(page, /HolidaySalePage/);
  }
  const comp = readFileSync("src/components/HolidaySalePage.tsx", "utf8");
  assert.doesNotMatch(comp, /ends soon|limited time|countdown/i);
  assert.match(comp, /<SalePriceWatch /);
  assert.match(readFileSync("src/lib/sitemap-sections.ts", "utf8"), /\/cyber-monday/);
  assert.match(readFileSync("src/components/nav-groups.ts", "utf8"), /href: "\/cyber-monday"/);
  // The price watch never wraps a self-caching loader in another cache (CLAUDE.md).
  assert.doesNotMatch(readFileSync("src/lib/price-watch-data.ts", "utf8"), /unstable_cache\s*\(/);
});
