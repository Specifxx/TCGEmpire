import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The owner's site-wide UX review (2026-11-24), ported from DexCompare. DECISIONS.md, "The owner's UX review on RiftCompare".
const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("P0 1: every self-opening prompt waits out typing through armNudge, never a bare timer", () => {
  for (const f of ["src/components/RateUsPrompt.tsx", "src/components/giveaway/GiveawayPrompt.tsx"]) {
    const src = code(f);
    assert.match(src, /armNudge\(/, f);
    assert.doesNotMatch(src, /setTimeout\(\(\) => \{\s*const here/, `${f}: the return-from-store ask goes through armNudge`);
  }
});

test("P0 2: price freshness is amber past 12 hours and red past 20", async () => {
  const { PRICE_STALE_WARN_H, PRICE_STALE_CRIT_H } = await import("../src/lib/ops/checks");
  assert.equal(PRICE_STALE_WARN_H, 12);
  assert.ok(PRICE_STALE_CRIT_H <= 24);
  assert.match(code("src/components/CheckedAgo.tsx"), /may have changed/);
});

test("P0 6: the sale line closes for a week and is hidden before paint once closed", async () => {
  const strip = code("src/components/HolidayStrip.tsx");
  assert.match(strip, /<StripClose \/>/);
  assert.match(strip, /__html: STRIP_BOOT/);
  const { STRIP_BOOT, STRIP_CLOSED_KEY } = await import("../src/components/StripClose");
  assert.ok(STRIP_BOOT.includes(STRIP_CLOSED_KEY));
  assert.match(code("src/components/StripClose.tsx"), /7 \* DAY/);
});

test("P0 4: the default sealed order is by product type with a heading per type", () => {
  assert.match(code("src/lib/sealed-view.ts"), /typeHeadings:/);
  assert.match(code("src/components/SealedMarketBoard.tsx"), /view\.typeHeadings \?/);
  assert.match(code("src/components/SealedSort.tsx"), /Sort: By product type/);
});

test("P0 5: a search with no match offers popular products instead of a dead end", () => {
  assert.match(code("src/app/api/search/route.ts"), /popular\.length \? \{ popular \}/);
  assert.match(code("src/components/SearchBar.tsx"), /Popular right now/);
});

test("P1 12: the cart is the Shortlist in every word a visitor reads", () => {
  for (const f of ["src/components/cart/CartAddButton.tsx", "src/components/cart/CartDrawer.tsx", "src/components/cart/CartHeaderLink.tsx", "src/app/cart/page.tsx"]) {
    const src = code(f);
    assert.doesNotMatch(src, /Add to cart|Your cart|"In cart"/, f);
  }
  assert.match(code("src/components/cart/CartDrawer.tsx"), /RiftCompare sells nothing/);
});

test("P1 15: a broken image retries once, then shows the site mark", async () => {
  const { IMG_FALLBACK_SCRIPT, IMG_FALLBACK_SRC } = await import("../src/lib/img-fallback");
  assert.ok(IMG_FALLBACK_SCRIPT.includes(IMG_FALLBACK_SRC));
  assert.match(IMG_FALLBACK_SCRIPT, /1500/);
  assert.match(code("src/app/layout.tsx"), /__html: IMG_FALLBACK_SCRIPT/);
});

test("P1 13: the card page has jump links to sections that exist", () => {
  const page = code("src/app/card/[id]/page.tsx");
  for (const id of ["price-history", "about-card", "card-faq", "card-details"]) {
    assert.match(page, new RegExp(`"#${id}"`), id);
    assert.match(page, new RegExp(`id="${id}"`), id);
  }
  assert.match(code("src/components/CardMarketSection.tsx"), /id="price-comparison"/);
});
