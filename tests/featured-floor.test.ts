import test from "node:test";
import assert from "node:assert/strict";
import { FEATURE_FLOOR_CENTS, featuredMovers } from "../src/lib/featured-floor";
import type { PriceMovers } from "../src/lib/price-history";

const mover = (nowCents: number) => ({ card: {} as never, points: [], nowCents, refCents: nowCents * 2, pct: -50 });

test("every market has a card and sealed floor, sealed dearer than a single", () => {
  for (const f of Object.values(FEATURE_FLOOR_CENTS)) assert.ok(f.card > 0 && f.sealed > f.card);
});

test("featuredMovers keeps only cards at or above the floor when enough clear it", () => {
  const m = { spiking: [], plummeting: [mover(10), mover(600), mover(900), mover(5000), mover(20)], value: [] } as PriceMovers;
  const out = featuredMovers(m, "US", 6);
  assert.deepEqual(out.plummeting.map((x) => x.nowCents), [600, 900, 5000]);
});

test("featuredMovers falls back to the raw list when too few clear the floor", () => {
  const m = { spiking: [], plummeting: [mover(10), mover(600), mover(20)], value: [] } as PriceMovers;
  assert.equal(featuredMovers(m, "US", 6).plummeting.length, 3);
});
