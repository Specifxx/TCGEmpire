import test from "node:test";
import assert from "node:assert/strict";
import {
  DECK_DROP_MIN_CENTS,
  DECK_DROP_MIN_PCT,
  DECK_TARGET_REFIRE_PCT,
  friendlyTargetCents,
  isDeckMaterialDrop,
  priceDeckList,
  shouldEmailDeckDrop,
  shouldEmailDeckTarget,
} from "../src/lib/deck-watch";
import { DECK_WATCH_LIMIT, deckWatchLimit } from "../src/lib/alert-limits";
import { WATERMARK_TTL_MS } from "../src/lib/price-alerts";
import { buildDeckWatchEmail, deckWatchCopy } from "../src/lib/watch-emails";
import { verifyAlertAction } from "../src/lib/alert-actions";
import { NOW, daysAgo, hoursAgo, deckHarness, deckRow, lapsed, plus, premium } from "./helpers/watch-harness";

// ─────────────────────────────────────────────────────────────────────────────
// DECK PRICE WATCH (lib/deck-watch.ts, 2026-09-29): a Premium member's saved
// list, re-priced delivered after every import with Best Basket's own
// pieces, emailed at the target or on a material drop.
// ─────────────────────────────────────────────────────────────────────────────

// Three copies of Alpha at $10 and one Beta at $20 at one US store.
const LISTINGS = [
  { cardId: "alpha", retailer: "mythicstore", priceCents: 1000 },
  { cardId: "beta", retailer: "mythicstore", priceCents: 2000 },
];

async function total(h: ReturnType<typeof deckHarness>, listText = "3 Alpha\n1 Beta"): Promise<number> {
  const p = await priceDeckList(h.db, { listText, market: "US", region: null, trackedOnly: null });
  assert.ok(p && p.complete, "fixture: the list must price completely");
  return p.plan.totalCents;
}

test("the numbers, the friendly default target and the pure rules", () => {
  assert.equal(DECK_WATCH_LIMIT, 10);
  assert.equal(deckWatchLimit("premium"), 10);
  assert.equal(deckWatchLimit("plus"), 0, "Plus has no deck watches");
  assert.equal(deckWatchLimit(null), 0);
  assert.equal(DECK_DROP_MIN_PCT, 5);
  assert.equal(DECK_DROP_MIN_CENTS, 100);
  assert.equal(DECK_TARGET_REFIRE_PCT, 5);
  // Rounded DOWN to a friendly figure, never today's total.
  assert.equal(friendlyTargetCents(18740), 18500);
  assert.equal(friendlyTargetCents(4200), 4100);
  assert.equal(friendlyTargetCents(35_000), 34_000);
  assert.equal(friendlyTargetCents(50), 100, "floored at the minimum target");
  assert.ok(friendlyTargetCents(18740) < 18740);
  // Material: ≥5% and ≥ one whole unit.
  assert.equal(isDeckMaterialDrop(10_000, 9_500), true);
  assert.equal(isDeckMaterialDrop(10_000, 9_501), false);
  assert.equal(isDeckMaterialDrop(1_000, 940), false, "6% but under a whole unit");
  assert.equal(isDeckMaterialDrop(1_000, 900), true);
  // Target: news when never emailed, 5% under the last email, or after the TTL.
  const base = { targetCents: 10_000, lastNotifiedAt: hoursAgo(12), now: NOW };
  assert.equal(shouldEmailDeckTarget({ ...base, totalCents: 10_001, lastEmailedCents: null }), false, "over the target");
  assert.equal(shouldEmailDeckTarget({ ...base, totalCents: 10_000, lastEmailedCents: null }), true, "at the target, never emailed");
  assert.equal(shouldEmailDeckTarget({ ...base, totalCents: 9_800, lastEmailedCents: 10_000 }), false, "2% under the last email: not news");
  assert.equal(shouldEmailDeckTarget({ ...base, totalCents: 9_500, lastEmailedCents: 10_000 }), true, "5% under: news");
  assert.equal(
    shouldEmailDeckTarget({ ...base, totalCents: 9_900, lastEmailedCents: 10_000, lastNotifiedAt: new Date(NOW.getTime() - WATERMARK_TTL_MS - 1) }),
    true,
    "the 30-day TTL lapsed: the target is news again",
  );
  // Drop: only without a target, material against the emailed total (live) else the last total.
  assert.equal(shouldEmailDeckDrop({ totalCents: 9_000, targetCents: 10_000, lastTotalCents: 10_000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), false, "a target set: the drop rule is off");
  assert.equal(shouldEmailDeckDrop({ totalCents: 9_000, targetCents: null, lastTotalCents: 10_000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), true);
  assert.equal(shouldEmailDeckDrop({ totalCents: 9_000, targetCents: null, lastTotalCents: 9_100, lastEmailedCents: 9_300, lastNotifiedAt: hoursAgo(20), now: NOW }), false, "measured from the live emailed total: 3% is not material");
  assert.equal(shouldEmailDeckDrop({ totalCents: 9_000, targetCents: null, lastTotalCents: null, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), false, "first run: nothing to compare");
});

test("priceDeckList prices the list the Best Basket way: one bounded listing read, the plan's delivered total", async () => {
  const h = deckHarness([], { listings: LISTINGS });
  const p = await priceDeckList(h.db, { listText: "3 Alpha\n1 Beta\n2 Nobody", market: "US", region: null, trackedOnly: null });
  assert.ok(p);
  assert.equal(p.requestedCopies, 4);
  assert.equal(p.unmatchedLines, 1, "an unmatched line is reported, never priced");
  assert.equal(p.plan.coveredCopies, 4);
  assert.equal(p.complete, true);
  assert.equal(p.plan.itemsCents, 5000);
  assert.equal(p.plan.totalCents, 5000 + p.plan.shippingCents + p.plan.topUpCents);
  assert.equal(h.listingQueries.length, 1, "one RetailerPrice read per list");
  const q = h.listingQueries[0] as { where: { cardId: { in: string[] }; country: string; inStock: boolean; retailer: { in: string[] } }; select: Record<string, boolean> };
  assert.deepEqual(q.where.cardId.in.sort(), ["alpha", "beta"]);
  assert.equal(q.where.country, "US");
  assert.equal(q.where.inStock, true);
  assert.ok(q.where.retailer.in.length > 0, "scoped to this market's stores");
  assert.deepEqual(Object.keys(q.select).sort(), ["cardId", "condition", "priceCents", "retailer", "url"], "the narrow select");
  const none = await priceDeckList(h.db, { listText: "2 Nobody", market: "US", region: null, trackedOnly: null });
  assert.equal(none, null, "nothing resolved: not priced");
});

test("a target met is emailed once, with the totals, the stores and one-tap deck links; the next run is quiet until a further 5%", async () => {
  const probe = deckHarness([], { listings: LISTINGS });
  const t = await total(probe);
  const rows = [deckRow("w1", premium, { targetCents: t, name: "Jinx aggro" })];
  const h = deckHarness(rows, { listings: LISTINGS });
  const s = await h.run();
  assert.equal(s.watches, 1);
  assert.equal(s.priced, 1);
  assert.equal(s.targets, 1);
  assert.equal(s.emails, 1);
  assert.equal(h.sent[0]!.to, "w1@example.com");
  const item = h.sent[0]!.item;
  assert.equal(item.kind, "deck_target");
  assert.equal(item.totalCents, t);
  assert.equal(item.targetCents, t);
  assert.equal(item.storeCount, 1);
  assert.equal(item.coveredCopies, 4);
  assert.equal(item.stores[0]!.name, "The Mythic Store");
  assert.ok(item.actions, "one-tap links");
  const stop = verifyAlertAction(new URL(item.actions!.stop).searchParams.get("t"), NOW);
  assert.ok(stop.ok && stop.kind === "deck" && stop.alertId === "w1" && stop.action === "stop");
  const w = h.writeFor("w1")!;
  assert.equal(w.lastTotalCents, t);
  assert.equal(w.lastEmailedCents, t);
  assert.deepEqual(w.lastNotifiedAt, NOW);
  assert.ok(w.lastCheckedAt);
  // The email.
  const built = buildDeckWatchEmail(item);
  assert.match(built.subject, /^Jinx aggro is now US\$\d+\.\d\d delivered \(target US\$/);
  assert.match(built.html, /See the store-by-store plan/);
  assert.match(built.html, /\/tools\/best-basket\?watch=w1/);
  assert.match(built.text, /Stop watching this list: https:/);
  assert.match(built.html, /The Mythic Store/);
  assert.ok(built.headers["List-Unsubscribe"]?.includes("/api/alerts/action?t="), "the one-click header carries this watch's own token (a stop)");

  // Next run, same total: not news.
  const again = deckHarness([deckRow("w1", premium, { targetCents: t, lastTotalCents: t, lastEmailedCents: t, lastNotifiedAt: NOW })], { listings: LISTINGS, now: hoursAgo(-12) });
  const s2 = await again.run();
  assert.equal(s2.targets, 0);
  assert.equal(again.sent.length, 0);
});

test("with no target, a material drop emails; a sub-5% move is stored but silent", async () => {
  const probe = deckHarness([], { listings: LISTINGS });
  const t = await total(probe);
  const quiet = deckHarness([deckRow("w1", premium, { lastTotalCents: Math.round(t * 1.03) })], { listings: LISTINGS });
  const s1 = await quiet.run();
  assert.equal(s1.drops, 0);
  assert.equal(quiet.sent.length, 0);
  assert.equal(quiet.writeFor("w1")!.lastTotalCents, t, "the last total still advances");
  const loud = deckHarness([deckRow("w1", premium, { lastTotalCents: Math.round(t * 1.2) })], { listings: LISTINGS });
  const s2 = await loud.run();
  assert.equal(s2.drops, 1);
  assert.equal(loud.sent[0]!.item.kind, "deck_drop");
  assert.equal(loud.sent[0]!.item.referenceBasis, "last");
  assert.match(deckWatchCopy(loud.sent[0]!.item).subject, /less$/);
});

test("snoozed: no email, baseline advances; a lapsed owner is skipped untouched; Plus never runs; a failed read aborts the pass unwritten", async () => {
  const probe = deckHarness([], { listings: LISTINGS });
  const t = await total(probe);
  const snoozed = deckHarness([deckRow("w1", premium, { targetCents: t, snoozedUntil: daysAgo(-10) })], { listings: LISTINGS });
  const s1 = await snoozed.run();
  assert.equal(s1.snoozed, 1);
  assert.equal(snoozed.sent.length, 0);
  assert.equal(snoozed.writeFor("w1")!.lastTotalCents, t);
  assert.equal(snoozed.writeFor("w1")!.lastEmailedCents, undefined);

  const gone = deckHarness([deckRow("w1", lapsed, { targetCents: t }), deckRow("w2", plus, { targetCents: t })], { listings: LISTINGS });
  const s2 = await gone.run();
  assert.equal(s2.lapsed, 2, "a lapsed subscriber and a Plus member alike");
  assert.equal(gone.sent.length, 0);
  assert.equal(gone.writes.length, 0, "rows kept, nothing written");
  assert.equal(gone.listingQueries.length, 0, "no read for an owner who is not entitled");

  const failing = deckHarness([deckRow("w1", premium, { targetCents: t })], { listings: LISTINGS, listingsFail: true });
  await assert.rejects(() => failing.run(), /db down/);
  assert.equal(failing.writes.length, 0);
});

test("the per-account cap: rows past DECK_WATCH_LIMIT (oldest first) are not priced", async () => {
  const rows = Array.from({ length: DECK_WATCH_LIMIT + 2 }, (_, i) =>
    deckRow(`w${i}`, premium, { userId: "u-one", createdAt: new Date(NOW.getTime() - (100 - i) * 3_600_000) }),
  );
  const h = deckHarness(rows, { listings: LISTINGS });
  const s = await h.run();
  assert.equal(s.priced, DECK_WATCH_LIMIT);
  assert.equal(h.listingQueries.length, DECK_WATCH_LIMIT);
});

test("an incomplete plan (a card nobody stocks) is stored but never fires", async () => {
  const h = deckHarness([deckRow("w1", premium, { targetCents: 1_000_000 })], { listings: [{ cardId: "alpha", retailer: "mythicstore", priceCents: 1000 }] });
  const s = await h.run();
  assert.equal(s.priced, 1);
  assert.equal(s.incomplete, 1);
  assert.equal(s.targets, 0);
  assert.equal(h.sent.length, 0);
  assert.ok(h.writeFor("w1")!.lastTotalCents);
});

test("paused addresses and the shared budget: deferred watches hold their baseline and re-detect", async () => {
  const probe = deckHarness([], { listings: LISTINGS });
  const t = await total(probe);
  const paused = deckHarness([deckRow("w1", premium, { targetCents: t })], { listings: LISTINGS, mutes: ["w1@example.com"] });
  const s1 = await paused.run();
  assert.equal(s1.paused, 1);
  assert.equal(paused.sent.length, 0);

  // 50 other addresses already emailed today: only an address already counted may open an email.
  const recent = Array.from({ length: 50 }, (_, i) => `r${i}@example.com`);
  const rows = [deckRow("w1", premium, { lastTotalCents: t * 2 }), deckRow("w2", premium, { lastTotalCents: t * 2, user: { ...premium, email: "r0@example.com" } })];
  const h = deckHarness(rows, { listings: LISTINGS, recent });
  const s2 = await h.run();
  assert.equal(s2.drops, 2);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]!.to, "r0@example.com", "an address already counted costs nothing");
  assert.equal(s2.budgetDeferred, 1);
  assert.equal(s2.held, 1);
  assert.equal(h.writeFor("w1")!.lastTotalCents, undefined, "held: the baseline is not advanced, so it re-detects");
  assert.ok(h.writeFor("w1")!.lastCheckedAt, "…but the check is stamped");
  assert.equal(h.writeFor("w2")!.lastEmailedCents, t);
  assert.ok(h.budgetReads.length >= 1, "the budget is read from the shared tables");
});
