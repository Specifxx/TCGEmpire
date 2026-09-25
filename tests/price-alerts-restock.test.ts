import { test } from "node:test";
import assert from "node:assert/strict";
import { RESTOCK_MIN_SOLDOUT_MS, isRestock } from "../src/lib/price-alerts";
import { dropRow, priceDropCopy } from "../src/lib/email";
import { applyWrites, daysAgo, harness, hoursAgo, listing, NOW, owned, plus, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// BACK IN STOCK (2026-09-25). A single that sold out AFTER the watch started
// and came back at the same or a higher price used to send nothing, while
// PriceAlertModal promised "in stock or gets cheaper". Now:
//   • alert price sold out, with a baseline → soldOutAt = now (baseline kept);
//   • priced again ≥20h later → "back in stock at X, was Y before it sold out";
//   • back inside 20h → just cleared (one missed scrape is not news);
//   • "unknown" (only stale rows — a failing feed) never sets or clears it.
// Free watches: weekly cap + FIRST_PRICE_SEND_CAP. Entitled: every import.
// ─────────────────────────────────────────────────────────────────────────────

test("isRestock needs a baseline and 20h sold out", () => {
  assert.equal(RESTOCK_MIN_SOLDOUT_MS, 20 * 3600_000);
  assert.equal(isRestock({ prev: 1000, soldOutAt: hoursAgo(20), now: NOW }), true);
  assert.equal(isRestock({ prev: 1000, soldOutAt: hoursAgo(19), now: NOW }), false);
  assert.equal(isRestock({ prev: 1000, soldOutAt: null, now: NOW }), false);
  assert.equal(isRestock({ prev: null, soldOutAt: hoursAgo(48), now: NOW }), false);
});

test("sold out → back at the SAME price sends 'back in stock' (F5)", async () => {
  let rows = [row("a", { lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: daysAgo(20) })];
  const out = harness(rows); // no listing: sold out
  const s1 = await out.run();
  assert.equal(s1.soldOut, 1);
  assert.deepEqual(out.writeFor("a"), { soldOutAt: NOW }, "the baseline is kept");
  rows = applyWrites(rows, out.writes).map((r) => ({ ...r, soldOutAt: daysAgo(3) }));
  const back = harness(rows.map((r) => ({ ...r, _price: 1000 })));
  const s2 = await back.run();
  assert.equal(s2.restocks, 1);
  assert.equal(back.sent.length, 1);
  const item = back.items()[0]!;
  assert.equal(item.kind, "restock");
  assert.equal(item.referenceCents, 1000);
  assert.equal(item.referenceBasis, "before_soldout");
  assert.deepEqual(item.soldOutAt, daysAgo(3));
  assert.equal(back.writeFor("a")!.soldOutAt, null, "cleared once told");
  assert.equal(back.writeFor("a")!.lowestEmailedCents, 1000);
  assert.match(priceDropCopy([item]).subject, /is back in stock: US\$10\.00 at Shop X/);
  assert.match(dropRow(item), /Back in stock/);
});

test("back inside 20h: cleared, no email, judged as an ordinary price", async () => {
  const h = harness([row("a", { lastPriceCents: 1000, soldOutAt: hoursAgo(10), price: 1100 })]);
  const s = await h.run();
  assert.equal(s.restocks, 0);
  assert.equal(h.sent.length, 0);
  assert.equal(h.writeFor("a")!.soldOutAt, null);
  assert.equal(h.writeFor("a")!.lastPriceCents, 1100);
});

test("a failing store feed (only stale rows) is UNKNOWN: never sold out, never a restock", async () => {
  const stale = listing("card-a", 1000, { lastSeen: hoursAgo(50) });
  const h = harness([row("a", { lastPriceCents: 1000 })], { stores: [stale] });
  const s = await h.run();
  assert.equal(s.unknown, 1);
  assert.equal(s.soldOut, 0);
  assert.equal(h.writes.length, 0, "nothing written until a fresh import decides");
  const h2 = harness([row("a", { lastPriceCents: 1000, soldOutAt: daysAgo(2) })], { stores: [stale] });
  await h2.run();
  assert.equal(h2.writes.length, 0, "an unknown never clears soldOutAt either");
});

test("a free restock waits out the weekly cap with soldOutAt held; an entitled one does not wait", async () => {
  const state = { lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: daysAgo(3), soldOutAt: daysAgo(2), price: 1000 };
  const f = harness([row("a", state)]);
  const s = await f.run();
  assert.equal(s.restocks, 1);
  assert.equal(s.deferred, 1);
  assert.equal(f.writes.length, 0, "soldOutAt stays, so the restock re-detects");
  const p = harness([owned("b", plus, state)]);
  await p.run("paid");
  assert.equal(p.sent.length, 1);
  assert.equal(p.items()[0]!.kind, "restock");
});

test("going sold out needs a baseline; a never-priced watch stays unpriced", async () => {
  const h = harness([row("a")]);
  const s = await h.run();
  assert.equal(s.soldOut, 0);
  assert.equal(h.writes.length, 0);
});

test("ebayOnly: sold out on the alert price but priced on the Card is counted", async () => {
  const h = harness([row("a", { lastPriceCents: 900, cardPrice: 300 })], {
    stores: [listing("card-a", 300, { retailer: "ebay_us" })],
  });
  const s = await h.run();
  assert.equal(s.ebayOnly, 1);
  assert.equal(s.soldOut, 1);
  assert.equal(h.sent.length, 0);
});
