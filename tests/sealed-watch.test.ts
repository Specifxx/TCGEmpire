import test from "node:test";
import assert from "node:assert/strict";
import {
  SEALED_RESTOCK_MIN_SOLDOUT_MS,
  SEALED_WATCH_COOLDOWN_MS,
  isRealSealedStore,
  sealedOfferState,
  shouldEmailSealedRrp,
  shouldEmailSealedTarget,
} from "../src/lib/sealed-watch";
import { SEALED_WATCH_LIMIT_PLUS, sealedWatchLimit } from "../src/lib/alert-limits";
import { buildSealedWatchEmail, rrpGapText, sealedWatchCopy } from "../src/lib/watch-emails";
import { verifyAlertAction } from "../src/lib/alert-actions";
import { NOW, daysAgo, hoursAgo, free, group, lapsed, offer, plus, premium, sealedHarness, sealedRow } from "./helpers/watch-harness";

// ─────────────────────────────────────────────────────────────────────────────
// SEALED WATCHES (lib/sealed-watch.ts, 2026-09-29): restock after ≥20h sold
// out everywhere, at RRP, at the member's target, or a material drop — from
// the self-cached sealed groups, real stores only, once per 24h per watch.
// ─────────────────────────────────────────────────────────────────────────────

const STALE = new Date(NOW.getTime() - 80 * 3_600_000).toISOString();

test("the numbers and the pure rules", () => {
  assert.equal(SEALED_WATCH_LIMIT_PLUS, 10);
  assert.equal(sealedWatchLimit("plus"), 10);
  assert.equal(sealedWatchLimit("premium"), Number.POSITIVE_INFINITY);
  assert.equal(sealedWatchLimit(null), 0);
  assert.equal(SEALED_RESTOCK_MIN_SOLDOUT_MS, 20 * 3_600_000);
  assert.equal(SEALED_WATCH_COOLDOWN_MS, 24 * 3_600_000);
  for (const r of ["ebay", "ebay_us", "ebay_uk", "EBAY_AU"]) assert.equal(isRealSealedStore(r), false, r);
  for (const r of ["shopx", "tcgplayer", "cardtrader", "ebayish-store"]) assert.equal(isRealSealedStore(r), true, r);
  // The offer state ignores eBay rows entirely.
  const ebayOnly = sealedOfferState([offer(9000, { retailer: "ebay_us", retailerName: "eBay" })], NOW);
  assert.equal(ebayOnly.open, null);
  assert.equal(ebayOnly.unknown, true, "no real-store listing decides nothing");
  const mixed = sealedOfferState([offer(9000, { retailer: "ebay_us" }), offer(15000, { inStock: false }), offer(16000, { retailer: "shopy", retailerName: "Shop Y" })], NOW);
  assert.equal(mixed.open?.priceCents, 16000, "the cheapest OPEN real store, not the eBay row");
  assert.equal(mixed.openStores, 1);
  assert.equal(mixed.soldOutEverywhere, false);
  const allOut = sealedOfferState([offer(15000, { inStock: false }), offer(16000, { retailer: "shopy", inStock: false })], NOW);
  assert.equal(allOut.soldOutEverywhere, true);
  assert.equal(sealedOfferState([offer(15000, { inStock: false }), offer(16000, { retailer: "shopy", inStock: false, lastSeen: STALE })], NOW).soldOutEverywhere, false, "a stale store is unknown, not sold out");
  assert.equal(sealedOfferState([offer(15000, { lastSeen: STALE })], NOW).unknown, true);
  // RRP: at or under (2% tolerance, lib/msrp.ts), and news.
  assert.equal(shouldEmailSealedRrp({ priceCents: 14400, productType: "Booster Box", market: "US", lastAtRrp: null }), true);
  assert.equal(shouldEmailSealedRrp({ priceCents: 14400, productType: "Booster Box", market: "US", lastAtRrp: true }), false, "already told");
  assert.equal(shouldEmailSealedRrp({ priceCents: 14400, productType: "Booster Box", market: "US", lastAtRrp: false }), true, "after being over RRP: news again");
  assert.equal(shouldEmailSealedRrp({ priceCents: 16000, productType: "Booster Box", market: "US", lastAtRrp: null }), false);
  assert.equal(shouldEmailSealedRrp({ priceCents: 100, productType: "Sleeve", market: "US", lastAtRrp: null }), false, "no published RRP: never");
  assert.equal(shouldEmailSealedTarget({ priceCents: 14000, targetCents: 14000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), true);
  assert.equal(shouldEmailSealedTarget({ priceCents: 13500, targetCents: 14000, lastEmailedCents: 14000, lastNotifiedAt: hoursAgo(30), now: NOW }), false, "3.6% under the last email: not news");
  assert.equal(shouldEmailSealedTarget({ priceCents: 13300, targetCents: 14000, lastEmailedCents: 14000, lastNotifiedAt: hoursAgo(30), now: NOW }), true);
  assert.equal(rrpGapText(11800, 12000, "USD"), "US$118.00, RRP US$120.00 — US$2.00 under");
  assert.equal(rrpGapText(15000, 12000, "USD"), "US$150.00, RRP US$120.00 — US$30.00 over");
  assert.equal(rrpGapText(15000, null, "USD"), "");
});

test("restock: sold out at every real store for 20h, then a real store has it — not from a short gap, not from eBay", async () => {
  // Run 1: everything sold out → the clock starts.
  const h1 = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: true })], { groups: [group([offer(15000, { inStock: false })])] });
  const s1 = await h1.run();
  assert.equal(s1.soldOut, 1);
  assert.deepEqual(h1.writeFor("s1")!.soldOutAt, NOW);
  assert.equal(h1.writeFor("s1")!.lastInStock, false);
  assert.equal(h1.sent.length, 0);

  // Only eBay has it: nothing changes.
  const h2 = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: daysAgo(2) })], {
    groups: [group([offer(15000, { inStock: false }), offer(9000, { retailer: "ebay_us", retailerName: "eBay" })])],
  });
  await h2.run();
  assert.equal(h2.sent.length, 0, "an eBay listing is never a restock");
  assert.equal(h2.writeFor("s1")?.soldOutAt, undefined);

  // Back at a store after 19h: cleared quietly. After 21h: news.
  const short = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(19) })], { groups: [group([offer(15000)])] });
  const ss = await short.run();
  assert.equal(ss.restocks, 0);
  assert.equal(short.writeFor("s1")!.soldOutAt, null, "a short gap just clears");
  const long = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(21) })], { groups: [group([offer(15000)])] });
  const sl = await long.run();
  assert.equal(sl.restocks, 1);
  assert.equal(long.sent.length, 1);
  const item = long.sent[0]!.item;
  assert.equal(item.kind, "sealed_restock");
  assert.equal(item.store.name, "Shop X");
  assert.match(item.store.url, /shopx\.example/);
  assert.equal(item.rrpCents, 14400);
  assert.deepEqual(item.soldOutAt, hoursAgo(21));
  const w = long.writeFor("s1")!;
  assert.equal(w.soldOutAt, null);
  assert.equal(w.lastEmailedCents, 15000);
  assert.deepEqual(w.lastNotifiedAt, NOW);
  assert.equal(w.lastAtRrp, false);
  const built = buildSealedWatchEmail(item);
  assert.match(built.subject, /^Origins Booster Box is back in stock: US\$150\.00 at Shop X$/);
  assert.match(built.html, /RRP US\$144\.00 — US\$6\.00 over/);
  assert.match(built.html, /Checked /);
  assert.match(built.text, /Stop watching this product: https:/);
  const snooze = verifyAlertAction(new URL(item.actions!.snooze).searchParams.get("t"), NOW);
  assert.ok(snooze.ok && snooze.kind === "sealed" && snooze.alertId === "s1" && snooze.action === "snooze");
});

test("at RRP: fires the first time and again only after a run saw it over RRP", async () => {
  const at = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000 })], { groups: [group([offer(14400)])] });
  const s1 = await at.run();
  assert.equal(s1.rrp, 1);
  assert.equal(at.sent[0]!.item.kind, "sealed_rrp");
  assert.match(sealedWatchCopy(at.sent[0]!.item).subject, /is at RRP: US\$144\.00 at Shop X \(RRP US\$144\.00\)/);
  assert.equal(at.writeFor("s1")!.lastAtRrp, true);
  // Still at RRP two days on: already told (and the price is not a material drop).
  const still = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 14400, lastAtRrp: true, lastEmailedCents: 14400, lastNotifiedAt: daysAgo(2) })], { groups: [group([offer(14400)])] });
  const s2 = await still.run();
  assert.equal(s2.rrp, 0);
  assert.equal(still.sent.length, 0);
  // Over RRP: the flag resets. Back at RRP: news.
  const over = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 14400, lastAtRrp: true, lastEmailedCents: 14400, lastNotifiedAt: daysAgo(2) })], { groups: [group([offer(17000)])] });
  await over.run();
  assert.equal(over.writeFor("s1")!.lastAtRrp, false);
  const back = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 17000, lastAtRrp: false, lastEmailedCents: 14400, lastNotifiedAt: daysAgo(2) })], { groups: [group([offer(14400)])] });
  const s3 = await back.run();
  assert.equal(s3.rrp, 1);
});

test("a target beats every other trigger; a drop needs no target and a material fall; the 24h cooldown holds the baseline", async () => {
  const t = sealedHarness([sealedRow("s1", premium, { targetCents: 14400, lastPriceCents: 16000, soldOutAt: daysAgo(2) })], { groups: [group([offer(14000)])] });
  const s1 = await t.run();
  assert.equal(s1.targets, 1);
  assert.equal(s1.restocks, 0, "one trigger per watch: the target wins");
  assert.equal(t.sent[0]!.item.kind, "sealed_target");
  assert.match(sealedWatchCopy(t.sent[0]!.item).subject, /hit your US\$144\.00 target: US\$140\.00 at Shop X/);

  // Every price below is OVER RRP (US$144 + 2%), so only the drop rule can speak.
  const withTarget = sealedHarness([sealedRow("s1", premium, { targetCents: 10000, lastPriceCents: 20000 })], { groups: [group([offer(17000)])] });
  const s2 = await withTarget.run();
  assert.equal(s2.drops, 0, "a target set: the drop rule is off");
  assert.equal(s2.rrp, 0, "over RRP");
  const drop = sealedHarness([sealedRow("s1", premium, { lastPriceCents: 20000 })], { groups: [group([offer(17000)])] });
  const s3 = await drop.run();
  assert.equal(s3.drops, 1);
  assert.equal(drop.sent[0]!.item.kind, "sealed_drop");
  assert.match(sealedWatchCopy(drop.sent[0]!.item).subject, /: US\$170\.00 at Shop X, 15% off$/);
  const small = sealedHarness([sealedRow("s1", premium, { lastPriceCents: 20000 })], { groups: [group([offer(19500)])] });
  assert.equal((await small.run()).drops, 0, "2.5% is not material");
  assert.equal(small.writeFor("s1")!.lastPriceCents, 19500, "the last price still advances");

  // Emailed 12h ago about this watch: the new drop is held, baseline kept.
  const cool = sealedHarness([sealedRow("s1", premium, { lastPriceCents: 20000, lastEmailedCents: 20000, lastNotifiedAt: hoursAgo(12) })], { groups: [group([offer(17000)])] });
  const s4 = await cool.run();
  assert.equal(s4.drops, 1);
  assert.equal(s4.cooldown, 1);
  assert.equal(cool.sent.length, 0);
  assert.equal(cool.writeFor("s1")?.lastPriceCents, undefined, "held: re-detects next run");
  const later = sealedHarness([sealedRow("s1", premium, { lastPriceCents: 20000, lastEmailedCents: 20000, lastNotifiedAt: hoursAgo(25) })], { groups: [group([offer(17000)])] });
  assert.equal((await later.run()).emails, 1);
});

test("unknown state decides nothing; a missing product is skipped; pre-order groups are read only for a key the groups lack", async () => {
  const stale = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000, lastInStock: true })], { groups: [group([offer(15000, { lastSeen: STALE })])] });
  const s1 = await stale.run();
  assert.equal(s1.unknown, 1);
  assert.equal(stale.writes.length, 0);
  const missing = sealedHarness([sealedRow("s1", plus, { groupKey: "RAD|Booster Box" })], { groups: [group([offer(15000)])] });
  const s2 = await missing.run();
  assert.equal(s2.missing, 1);
  assert.deepEqual(missing.groupCalls, ["groups:US", "preorders:US"], "the pre-order groups are read once, only because a key was missing");
  const found = sealedHarness([sealedRow("s1", plus, { groupKey: "RAD|Booster Box", lastPriceCents: 20000 })], {
    groups: [group([offer(15000)])],
    preorderGroups: [group([offer(17000)], { groupKey: "RAD|Booster Box", name: "Radiance Booster Box", setCode: "RAD" })],
  });
  const s3 = await found.run();
  assert.equal(s3.drops, 1);
  assert.equal(found.sent[0]!.item.name, "Radiance Booster Box");
  const plain = sealedHarness([sealedRow("s1", plus)], { groups: [group([offer(15000)])] });
  await plain.run();
  assert.deepEqual(plain.groupCalls, ["groups:US"], "no pre-order read when every key is present");
});

test("entitlement and the Plus cap: lapsed and free owners are skipped untouched, Plus evaluates its oldest 10, Premium all", async () => {
  const rows = [
    sealedRow("gone", lapsed, { lastPriceCents: 16000 }),
    sealedRow("never", free, { lastPriceCents: 16000 }),
    ...Array.from({ length: SEALED_WATCH_LIMIT_PLUS + 2 }, (_, i) =>
      sealedRow(`p${i}`, plus, { userId: "u-plus", lastPriceCents: 16000, createdAt: new Date(NOW.getTime() - (100 - i) * 3_600_000) }),
    ),
    ...Array.from({ length: SEALED_WATCH_LIMIT_PLUS + 2 }, (_, i) => sealedRow(`q${i}`, premium, { userId: "u-prem", lastPriceCents: 16000 })),
  ];
  const h = sealedHarness(rows, { groups: [group([offer(15000)])] });
  const s = await h.run();
  assert.equal(s.lapsed, 2);
  assert.equal(s.overLimit, 2, "Plus's two newest rows are kept but not evaluated");
  assert.equal(s.drops, SEALED_WATCH_LIMIT_PLUS + SEALED_WATCH_LIMIT_PLUS + 2);
  assert.ok(!h.writes.some((w) => w.id === "gone" || w.id === "never" || w.id === "p10" || w.id === "p11"));
});

test("snoozed and paused advance their baseline without an email; a failed groups read aborts the pass unwritten", async () => {
  const snoozed = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000, snoozedUntil: daysAgo(-5) })], { groups: [group([offer(14000)])] });
  const s1 = await snoozed.run();
  assert.equal(s1.snoozed, 1);
  assert.equal(snoozed.sent.length, 0);
  assert.equal(snoozed.writeFor("s1")!.lastPriceCents, 14000);
  const paused = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000 })], { groups: [group([offer(14000)])], mutes: ["s1@example.com"] });
  const s2 = await paused.run();
  assert.equal(s2.paused, 1);
  assert.equal(paused.writeFor("s1")!.lastPriceCents, 14000);
  const failing = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000 })], { groups: [group([offer(14000)])], groupsFail: true });
  await assert.rejects(() => failing.run(), /db down/);
  assert.equal(failing.writes.length, 0);
});

test("the shared budget: a new address past ALERT_DAILY_BUDGET is deferred with its baseline held", async () => {
  const recent = Array.from({ length: 50 }, (_, i) => `r${i}@example.com`);
  const rows = [sealedRow("s1", plus, { lastPriceCents: 20000 }), sealedRow("s2", plus, { lastPriceCents: 20000, email: "r0@example.com" })];
  const h = sealedHarness(rows, { groups: [group([offer(17000)])], recent });
  const s = await h.run();
  assert.equal(s.drops, 2);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]!.to, "r0@example.com");
  assert.equal(s.budgetDeferred, 1);
  assert.equal(h.writeFor("s1")?.lastPriceCents, undefined, "held");
  assert.equal(h.writeFor("s2")!.lastEmailedCents, 17000);
});
