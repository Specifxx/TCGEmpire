// "Complete my set" after a scan (lib/scan/set-gap.ts, app/api/scan/set-gap, components/scan/CompleteSet.tsx;
// DECISIONS.md 2026-11-19 "Complete my set after a scan").
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pickGapLinks, scanGap, SCAN_GAP_PAGE, type GapListingRow } from "../src/lib/scan/set-gap";
import type { ChecklistCard } from "../src/lib/set-scope";

const card = (n: number, minCents: number | null, extra: Partial<ChecklistCard> = {}): ChecklistCard => ({
  id: `c${n}`, slug: `card-${n}`, name: `Card ${n}`, collectorNumber: String(n).padStart(3, "0"), rarity: "Common",
  variant: null, isPromo: false, isOvernumbered: false, setCode: "OGN", minCents, stores: minCents ? 2 : 0, otherSource: false, ...extra,
});

test("scanGap: missing base-set cards a store has, cheapest first, paged; owned and special printings left out", () => {
  const cards = [card(1, 300), card(2, 50), card(3, null), card(4, 120), card(5, 80, { variant: "Alt Art" }), ...Array.from({ length: 10 }, (_, i) => card(10 + i, 500 + i))];
  const g = scanGap(cards, { c4: 1 });
  assert.equal(g.total, 14); // the alt art is not in the base set
  assert.equal(g.have, 1);
  assert.equal(g.notStocked, 1);
  assert.equal(g.buyable, 12);
  assert.deepEqual(g.page.map((c) => c.id), ["c2", "c1", "c10", "c11", "c12", "c13"]);
  assert.equal(g.page.length, SCAN_GAP_PAGE);
  assert.equal(g.next, 6);
  assert.equal(g.costCents, 50 + 300 + Array.from({ length: 10 }, (_, i) => 500 + i).reduce((a, b) => a + b, 0));
  const last = scanGap(cards, { c4: 1 }, { offset: 6 });
  assert.equal(last.page.length, 6);
  assert.equal(last.next, null);
  assert.equal(scanGap(cards, Object.fromEntries(cards.map((c) => [c.id, 1]))).buyable, 0);
});

const row = (cardId: string, retailer: string, priceCents: number, extra: Partial<GapListingRow> = {}): GapListingRow => ({
  cardId, retailer, retailerName: retailer.toUpperCase(), url: `https://${retailer}.example/p`, priceCents, currency: "USD", condition: "Near Mint", inStock: true, derived: null, ...extra,
});

test("pickGapLinks: TCGplayer apart, the cheapest real store, never eBay, a reference or a cloned row", () => {
  const m = pickGapLinks(
    [
      row("c1", "ebay_us", 10),
      row("c1", "tcgplayer", 90),
      row("c1", "tcgplayer_market", 80),
      row("c1", "cardmarket", 20),
      row("c1", "cloned", 30, { derived: true }),
      row("c1", "gone", 25, { inStock: false }),
      row("c1", "storeb", 60),
      row("c1", "storea", 60),
      row("c2", "ebay", 5),
    ],
    ["cardmarket", "tcgplayer_market"],
  );
  assert.equal(m.get("c1")?.tcgplayer?.retailer, "tcgplayer_market");
  assert.equal(m.get("c1")?.store?.retailer, "storea");
  assert.equal(m.has("c2"), false);
});

test("the set panel never calls eBay: links only", () => {
  for (const f of ["src/lib/scan/set-gap.ts", "src/app/api/scan/set-gap/route.ts", "src/components/scan/CompleteSet.tsx", "src/app/api/scan/out/route.ts"]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.doesNotMatch(src, /api\.ebay|lib\/ebay|EBAY_/i, f);
  }
  const route = readFileSync(join(process.cwd(), "src/app/api/scan/set-gap/route.ts"), "utf8");
  assert.match(route, /ebaySearchUrl\(/);
  assert.match(route, /getCurrentUser\(\)/);
  assert.match(route, /private, no-store/);
});
