import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAID_SEND_CAP,
  REMINDER_INTERVAL_MS,
  STORE_ROWS_PER_CARD,
  isBelowMarketNewLow,
  runPriceAlerts,
  shouldEmailTarget,
  type AlertRunDeps,
  type AlertScope,
} from "../src/lib/price-alerts";
import { dropRow, postageNote, priceDropCopy, type PriceDropItem } from "../src/lib/email";
import { PLUS_TARGET_ALERT_LIMIT } from "../src/lib/alert-limits";
import { ADMIN_EMAILS } from "../src/lib/admin-emails";

// ─────────────────────────────────────────────────────────────────────────────
// TARGET-PRICE AND BELOW-MARKET ALERTS (Plus/Premium, 2026-09-25 lineup).
//
// A member types "Notify me at $X" on a watched card. After each price update
// the cron emails them, naming the store, when the card's lowest in-stock price
// in that market is at or below X — with no weekly wait, but only once per new
// low (the target's own watermark, targetEmailedCents, which a changed target
// resets; the free alerts' lowestEmailedCents is never reset). A lapsed
// subscription ignores its targets and the watch behaves as a free one. Free
// and anonymous watches are untouched.
//
// These run the real runPriceAlerts() against a stub client, sender and
// ranking, like tests/price-alerts-first-price.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-10-16T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
// Entitlement is read against the real clock (isPremium), so pick dates far
// from today in both directions.
const PAID_UNTIL = new Date("2099-01-01T00:00:00Z");
const LAPSED = new Date("2020-01-01T00:00:00Z");

type User = { isAdmin: boolean; premiumUntil: Date | null; premiumTier: string; premiumTierFloor: string | null; email?: string };
const plus: User = { isAdmin: false, premiumUntil: PAID_UNTIL, premiumTier: "plus", premiumTierFloor: null };
const premium: User = { isAdmin: false, premiumUntil: PAID_UNTIL, premiumTier: "premium", premiumTierFloor: null };
const lapsed: User = { isAdmin: false, premiumUntil: LAPSED, premiumTier: "plus", premiumTierFloor: null };
const free: User = { isAdmin: false, premiumUntil: null, premiumTier: "premium", premiumTierFloor: null };

type Row = {
  id: string;
  email: string;
  market: string;
  lastPriceCents: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  targetCents: number | null;
  targetEmailedCents: number | null;
  createdAt: Date;
  unsubToken: string;
  userId: string | null;
  user: User | null;
  card: {
    id: string;
    name: string;
    slug: string | null;
    setCode: string;
    collectorNumber: string;
    lowestPriceCents: number | null;
    lowestPriceCentsUs: number | null;
    lowestPriceCentsUk: number | null;
    lowestPriceCentsSg: number | null;
    lowestPriceCentsCa: number | null;
    lowestPriceCentsEu: number | null;
  };
};

function row(id: string, over: Partial<Row> & { us?: number | null; cardId?: string } = {}): Row {
  const { us = null, cardId = `card-${id}`, ...rest } = over;
  return {
    id,
    email: `${id}@example.com`,
    market: "US",
    lastPriceCents: null,
    lowestEmailedCents: null,
    lastNotifiedAt: null,
    targetCents: null,
    targetEmailedCents: null,
    createdAt: daysAgo(30),
    unsubToken: `tok-${id}`,
    userId: null,
    user: null,
    card: {
      id: cardId,
      name: `Card ${id}`,
      slug: cardId,
      setCode: "RAD",
      collectorNumber: "001",
      lowestPriceCents: null,
      lowestPriceCentsUs: us,
      lowestPriceCentsUk: null,
      lowestPriceCentsSg: null,
      lowestPriceCentsCa: null,
      lowestPriceCentsEu: null,
    },
    ...rest,
  };
}

// A watch owned by an account with the given entitlement.
const owned = (id: string, user: User, over: Partial<Row> & { us?: number | null; cardId?: string } = {}) =>
  row(id, { userId: `u-${id}`, user, ...over });

type StoreRow = {
  cardId: string;
  country: string;
  retailer: string;
  retailerName: string;
  priceCents: number;
  shippingCents: number | null;
  condition: string | null;
  url: string;
};

function harness(rows: Row[], opts: { ranks?: Record<string, string[]>; stores?: StoreRow[]; sendOk?: boolean } = {}) {
  const sent: { to: string; items: PriceDropItem[] }[] = [];
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  const findManyArgs: Record<string, unknown>[] = [];
  const storeQueries: Record<string, unknown>[] = [];
  const rankCalls: string[] = [];
  const db = {
    priceAlert: {
      findMany: async (args: Record<string, unknown>) => {
        findManyArgs.push(args);
        return rows;
      },
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: args.where.id, data: args.data });
        return args;
      },
    },
    retailerPrice: {
      findMany: async (args: Record<string, unknown>) => {
        storeQueries.push(args);
        return opts.stores ?? [];
      },
    },
    $transaction: async (ops: unknown[]) => ops,
  };
  const deps: AlertRunDeps = {
    db: db as unknown as AlertRunDeps["db"],
    sendPriceDropEmail: async (to, items) => {
      sent.push({ to, items });
      return opts.sendOk ?? true;
    },
    now: NOW,
    // These rows carry userIds (the paid triggers need an account): never let
    // the in-app mirror reach a real database from a test.
    notifyUsers: false,
    dealRanks: async (country) => {
      rankCalls.push(country);
      return new Map((opts.ranks?.[country] ?? []).map((id, i) => [id, i + 1]));
    },
  };
  return {
    sent,
    writes,
    findManyArgs,
    storeQueries,
    rankCalls,
    run: (scope?: AlertScope) => runPriceAlerts(deps, scope ? { scope } : {}),
  };
}

// ── The pure policies ────────────────────────────────────────────────────────

test("shouldEmailTarget: fires at or below the target, once per new low", () => {
  const base = { lowestEmailedCents: null, lastNotifiedAt: null, now: NOW };
  assert.equal(shouldEmailTarget({ ...base, current: 900, targetCents: null }), false, "no target, no target alert");
  assert.equal(shouldEmailTarget({ ...base, current: 1001, targetCents: 1000 }), false, "a cent above the target is not a hit");
  assert.equal(shouldEmailTarget({ ...base, current: 1000, targetCents: 1000 }), true, "AT the target is a hit");
  assert.equal(shouldEmailTarget({ ...base, current: 400, targetCents: 1000 }), true);
  // Already emailed at 900: the same price again is not news…
  const told = { lowestEmailedCents: 900, lastNotifiedAt: daysAgo(3), now: NOW };
  assert.equal(shouldEmailTarget({ ...told, current: 900, targetCents: 1000 }), false, "the same price never re-sends");
  assert.equal(shouldEmailTarget({ ...told, current: 950, targetCents: 1000 }), false, "a sawtooth back up stays quiet");
  // …a lower one is.
  assert.equal(shouldEmailTarget({ ...told, current: 899, targetCents: 1000 }), true, "a new low under the target sends");
  // The ≈2-month reminder the free alerts use applies too.
  const longAgo = new Date(NOW.getTime() - REMINDER_INTERVAL_MS);
  assert.equal(shouldEmailTarget({ ...told, lastNotifiedAt: longAgo, current: 950, targetCents: 1000 }), true, "reminder due");
  assert.equal(shouldEmailTarget({ ...told, lastNotifiedAt: longAgo, current: 1050, targetCents: 1000 }), false, "never above the target");
});

test("isBelowMarketNewLow: only a new low, never a card that has just sat in the ranking", () => {
  assert.equal(isBelowMarketNewLow({ current: 900, prev: 1000, lowestEmailedCents: null }), true, "never emailed: a real drop");
  assert.equal(isBelowMarketNewLow({ current: 1000, prev: 1000, lowestEmailedCents: null }), false, "unmoved since the watch began");
  assert.equal(isBelowMarketNewLow({ current: 900, prev: null, lowestEmailedCents: null }), true, "its first price in this market");
  assert.equal(isBelowMarketNewLow({ current: 900, prev: 950, lowestEmailedCents: 900 }), false, "not below what we already sent");
  assert.equal(isBelowMarketNewLow({ current: 899, prev: 950, lowestEmailedCents: 900 }), true);
});

// ── The run ──────────────────────────────────────────────────────────────────

test("an entitled target hit bypasses the weekly cooldown and writes the watermark", async () => {
  // Emailed two days ago: a free drop for this address would wait five more days.
  const h = harness([owned("a", plus, { targetCents: 1000, lastPriceCents: 1200, lastNotifiedAt: daysAgo(2), lowestEmailedCents: 1500, us: 950 })]);
  const summary = await h.run();
  assert.equal(h.sent.length, 1, "sent despite the address being inside its week");
  const item = h.sent[0]!.items[0]!;
  assert.equal(item.kind, "target");
  assert.equal(item.targetCents, 1000);
  assert.equal(item.newCents, 950);
  assert.equal(summary.targets, 1);
  assert.equal(summary.deferred, 0);
  assert.equal(summary.drops, 0, "a target hit is counted as a target, not also as a drop");
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0]!.data.lowestEmailedCents, 950, "a target email is a price we told them: the shared watermark moves too");
  assert.equal(h.writes[0]!.data.targetEmailedCents, 950, "and the target's own watermark is seeded");
  assert.deepEqual(h.writes[0]!.data.lastNotifiedAt, NOW);
});

test("setting a target never resets the free rules: an old low still gates plain drops (review 2026-09-25)", async () => {
  // Emailed at $3 a month ago; the card is $40; a $30 target was just set
  // (PATCH armed targetEmailedCents = null and left lowestEmailedCents = 300).
  const state = { targetCents: 3000, targetEmailedCents: null, lowestEmailedCents: 300, lastNotifiedAt: daysAgo(30), lastPriceCents: 4000 };
  // $40 → $38: above the target, and not below the $3 already sent. Quiet.
  const drift = harness([owned("a", plus, { ...state, us: 3800 })]);
  const s1 = await drift.run();
  assert.equal(drift.sent.length, 0, "no 'Price drop: now $38' above a price already emailed");
  assert.equal(s1.drops, 1);
  assert.equal(s1.suppressed, 1);
  assert.equal(drift.writes[0]!.data.lowestEmailedCents, undefined, "the shared watermark is untouched");
  // $40 → $29: the target is met, and it is armed — it sends.
  const hit = harness([owned("a", plus, { ...state, us: 2900 })]);
  await hit.run();
  assert.equal(hit.sent.length, 1);
  assert.equal(hit.sent[0]!.items[0]!.kind, "target");
  assert.equal(hit.writes[0]!.data.targetEmailedCents, 2900);
  assert.equal(hit.writes[0]!.data.lowestEmailedCents, 300, "min(300, 2900): the old low stands");
  // The same account lapsed: the target is inert and the $3 still gates drops.
  const lapsedRun = harness([owned("a", lapsed, { ...state, us: 2900 })]);
  const s3 = await lapsedRun.run();
  assert.equal(lapsedRun.sent.length, 0);
  assert.equal(s3.suppressed, 1);
});

test("after a target fires, it re-sends only below its own last email — whatever the shared watermark says", async () => {
  const after = { targetCents: 3000, targetEmailedCents: 2900, lowestEmailedCents: 300, lastNotifiedAt: daysAgo(1), lastPriceCents: 3100 };
  const back = harness([owned("a", plus, { ...after, us: 2950 })]);
  assert.equal((await back.run()).targets, 0, "back under the target, but not below $29: quiet");
  assert.equal(back.sent.length, 0);
  const lower = harness([owned("a", plus, { ...after, us: 2800 })]);
  await lower.run();
  assert.equal(lower.sent.length, 1, "below $29 (though far above the $3 drop low): a new low under the target");
  assert.equal(lower.writes[0]!.data.targetEmailedCents, 2800);
});

test("a lapsed subscription ignores its target: the watch runs the free drop rules", async () => {
  const rowFor = (id: string, lastNotifiedAt: Date | null) =>
    owned(id, lapsed, { targetCents: 1000, lastPriceCents: 1200, lastNotifiedAt, lowestEmailedCents: 1500, us: 950 });
  // In cooldown: the drop is DEFERRED, exactly as for any free watch.
  const quiet = harness([rowFor("a", daysAgo(2))]);
  const s1 = await quiet.run();
  assert.equal(quiet.sent.length, 0);
  assert.equal(s1.targets, 0);
  assert.equal(s1.drops, 1);
  assert.equal(s1.deferred, 1);
  assert.equal(quiet.writes.length, 0, "baseline held for the next digest");
  // Out of cooldown: an ordinary drop email, not a target email.
  const open = harness([rowFor("b", daysAgo(8))]);
  await open.run();
  assert.equal(open.sent[0]!.items[0]!.kind, "drop");
  // A free account that somehow holds a target is treated the same way.
  const f = harness([owned("c", free, { targetCents: 1000, lastPriceCents: 1200, lastNotifiedAt: daysAgo(2), us: 950 })]);
  const s3 = await f.run();
  assert.equal(s3.targets, 0);
  assert.equal(s3.deferred, 1);
});

test("the same price never re-sends, and a hit with the price unmoved is still recorded", async () => {
  // Run 1: the target is met with no price move (a target set under today's
  // price). The row must still be written, or it would fire every run.
  const first = harness([owned("a", plus, { targetCents: 1000, lastPriceCents: 900, us: 900 })]);
  await first.run();
  assert.equal(first.sent.length, 1);
  assert.equal(first.writes.length, 1, "a fired paid alert is written even though the price did not move");
  assert.equal(first.writes[0]!.data.lowestEmailedCents, 900);
  // Run 2: the state run 1 wrote, same price → nothing.
  assert.equal(first.writes[0]!.data.targetEmailedCents, 900);
  const second = harness([owned("a", plus, { targetCents: 1000, lastPriceCents: 900, lowestEmailedCents: 900, targetEmailedCents: 900, lastNotifiedAt: NOW, us: 900 })]);
  const summary = await second.run();
  assert.equal(second.sent.length, 0);
  assert.equal(summary.targets, 0);
  assert.equal(second.writes.length, 0);
});

test("free and anonymous cadence is unchanged, and a paid run never touches those rows", async () => {
  const rows = [
    row("anon", { lastPriceCents: 1000, us: 800, lastNotifiedAt: daysAgo(2) }),
    owned("free", free, { lastPriceCents: 1000, us: 800 }),
  ];
  const all = harness(rows);
  const s = await all.run();
  assert.equal(s.deferred, 1, "the anonymous drop waits out its week");
  assert.equal(all.sent.length, 1, "the free account's first drop sends at once");
  assert.equal(all.sent[0]!.items[0]!.kind, "drop");
  assert.equal(all.findManyArgs[0]!.where, undefined, "the 'all' run reads every row, unfiltered");

  const paid = harness(rows);
  const p = await paid.run("paid");
  assert.equal(paid.sent.length, 0);
  assert.equal(paid.writes.length, 0, "no free or anonymous baseline moves in a paid run");
  assert.equal(p.drops + p.listed + p.deferred, 0);
  assert.ok(paid.findManyArgs[0]!.where, "the paid run narrows its read to entitled accounts");
});

test("an ADMIN_EMAILS account is entitled in the cron exactly as in the session (review, 2026-09-25)", async () => {
  // The session makes an env-listed address an admin (lib/auth.ts), so the
  // watchlist shows its unlimited targets as live; the cron read only the DB
  // column, so with isAdmin=false and no paid period they were never sent.
  const adminEmail = ADMIN_EMAILS[0];
  assert.ok(adminEmail, "fixture: at least one admin address");
  const admin: User = { isAdmin: false, premiumUntil: null, premiumTier: "plus", premiumTierFloor: null, email: adminEmail.toUpperCase() };
  const n = PLUS_TARGET_ALERT_LIMIT + 2;
  const rows = Array.from({ length: n }, (_, i) =>
    row(`adm${i}`, { userId: "u-admin", user: admin, email: adminEmail, cardId: `c-adm${i}`, targetCents: 1000, lastPriceCents: 1200, us: 950 }),
  );
  for (const scope of ["all", "paid"] as const) {
    const h = harness(rows);
    const s = await h.run(scope);
    assert.equal(s.targets, n, `${scope}: every target honoured — an admin reads as Premium, unlimited`);
    assert.equal(h.sent.length, 1, `${scope}: one digest for the address`);
  }
  const paid = harness(rows);
  await paid.run("paid");
  assert.ok(JSON.stringify(paid.findManyArgs[0]!.where).includes(adminEmail), "the paid read fetches ADMIN_EMAILS accounts too");
  // A non-admin address with the same row shape stays unentitled.
  const other = harness([owned("x", { ...admin, email: "someone@example.com" }, { targetCents: 1000, lastPriceCents: 1200, us: 950 })]);
  assert.equal((await other.run()).targets, 0);
});

test("a paid run still applies the weekly cap to an entitled watch's plain drops", async () => {
  const h = harness([owned("a", plus, { lastPriceCents: 1000, us: 900, lastNotifiedAt: daysAgo(1), lowestEmailedCents: 1000 })]);
  const s = await h.run("paid");
  assert.equal(h.sent.length, 0);
  assert.equal(s.deferred, 1);
});

test("PAID_SEND_CAP defers the overflow of new digests, baselines held", async () => {
  const rows = Array.from({ length: PAID_SEND_CAP + 3 }, (_, i) =>
    owned(`p${i}`, plus, { targetCents: 1000, lastPriceCents: 1200, us: 900 }),
  );
  const h = harness(rows);
  const s = await h.run("paid");
  assert.equal(h.sent.length, PAID_SEND_CAP);
  assert.equal(s.targets, PAID_SEND_CAP + 3);
  assert.equal(s.deferred, 3);
  assert.equal(s.held, 3);
  assert.equal(h.writes.length, PAID_SEND_CAP);
});

test("a Plus account's targets beyond its limit are not honoured; Premium has no limit", async () => {
  // Newest first, as a findMany might return them: the OLDEST watches keep
  // their targets regardless of row order (honouredTargetIds, which the
  // watchlist uses to mark the rest "Not active").
  const many = (user: User) =>
    Array.from({ length: PLUS_TARGET_ALERT_LIMIT + 2 }, (_, i) =>
      row(`t${i}`, { email: "member@example.com", userId: "u-member", user, targetCents: 1000, lastPriceCents: 900, us: 900, createdAt: daysAgo(i) }),
    );
  const p = harness(many(plus));
  const sp = await p.run();
  assert.equal(sp.targets, PLUS_TARGET_ALERT_LIMIT);
  assert.equal(p.sent.length, 1, "one digest per address");
  const hitIds = new Set(p.sent[0]!.items.map((i) => i.cardId));
  assert.ok(!hitIds.has("card-t0") && !hitIds.has("card-t1"), "the two newest watches are the ones left out");
  assert.ok(hitIds.has(`card-t${PLUS_TARGET_ALERT_LIMIT + 1}`), "the oldest is honoured");
  const q = harness(many(premium));
  const sq = await q.run();
  assert.equal(sq.targets, PLUS_TARGET_ALERT_LIMIT + 2);
});

test("below-market: an entitled watch entering the ranking at a new low sends at once", async () => {
  const h = harness(
    [
      owned("a", plus, { cardId: "deal", lastPriceCents: 1000, us: 900, lastNotifiedAt: daysAgo(1), lowestEmailedCents: 1000 }),
      // Not in the ranking: an ordinary drop, weekly-capped.
      owned("b", plus, { cardId: "plain", lastPriceCents: 1000, us: 900, lastNotifiedAt: daysAgo(1), lowestEmailedCents: 1000 }),
      // Free: the ranking is not theirs to trigger on.
      owned("c", free, { cardId: "deal", lastPriceCents: 1000, us: 900, lastNotifiedAt: daysAgo(1), lowestEmailedCents: 1000 }),
      // In the ranking, but at the price we already sent: not news.
      owned("d", plus, { cardId: "deal", lastPriceCents: 900, us: 900, lowestEmailedCents: 900, lastNotifiedAt: daysAgo(1) }),
    ],
    { ranks: { US: ["deal"] } },
  );
  const s = await h.run();
  assert.equal(s.belowMarket, 1);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]!.to, "a@example.com");
  assert.equal(h.sent[0]!.items[0]!.kind, "under-market");
  assert.equal(s.deferred, 2, "b and c wait out their week");
});

test("the ranking is fetched once per market that has an entitled watch, and never for free-only markets", async () => {
  const h = harness([
    owned("a", plus, { us: 900, lastPriceCents: 900 }),
    owned("b", plus, { us: 800, lastPriceCents: 800 }),
    row("anon", { market: "AU", lastPriceCents: 1000 }),
  ]);
  await h.run();
  assert.deepEqual(h.rankCalls, ["US"]);
});

test("a paid alert and the same address's capped drop share ONE digest, whatever the row order", async () => {
  const email = "member@example.com";
  const h = harness([
    // The drop row comes first and its address is inside its week…
    owned("drop", plus, { email, userId: "u-m", lastPriceCents: 1000, us: 900, lastNotifiedAt: daysAgo(1), lowestEmailedCents: 1000 }),
    // …but the target hit on another card sends now, so the drop rides along.
    owned("hit", plus, { email, userId: "u-m", cardId: "c-hit", targetCents: 500, lastPriceCents: 700, us: 480, lastNotifiedAt: daysAgo(1) }),
  ]);
  const s = await h.run();
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0]!.items.map((i) => i.kind).sort(), ["drop", "target"]);
  assert.equal(s.deferred, 0);
});

// ── The store behind the price ───────────────────────────────────────────────

test("every alert email names the store: ONE capped lookup for every fired card", async () => {
  const h = harness(
    [
      owned("a", plus, { cardId: "c1", targetCents: 1000, lastPriceCents: 1200, us: 950 }),
      row("anon", { cardId: "c2", lastPriceCents: 700, us: 500 }), // a free drop
      row("anon2", { cardId: "c3", lastPriceCents: 700, us: 400 }), // no store row found
    ],
    {
      stores: [
        { cardId: "c2", country: "US", retailer: "shopx", retailerName: "Shop X", priceCents: 500, shippingCents: null, condition: null, url: "https://shopx.example/c2" },
        { cardId: "c1", country: "US", retailer: "ebay_us", retailerName: "eBay", priceCents: 950, shippingCents: 0, condition: "Near Mint", url: "https://www.ebay.com/itm/1" },
        // A pricier row for c1 after the cheapest: ignored.
        { cardId: "c1", country: "US", retailer: "shopy", retailerName: "Shop Y", priceCents: 950, shippingCents: null, condition: null, url: "https://shopy.example/c1" },
      ],
    },
  );
  await h.run();
  assert.equal(h.storeQueries.length, 1, "one query for the whole run, never one per card");
  const q = h.storeQueries[0]! as { take: number; orderBy: unknown; where: { inStock: boolean; OR: unknown[]; retailer: { notIn: string[] } } };
  assert.equal(q.take, 3 * STORE_ROWS_PER_CARD, "capped by the number of fired cards");
  assert.deepEqual(q.orderBy, { priceCents: "asc" });
  assert.equal(q.where.inStock, true);
  assert.ok(q.where.retailer.notIn.includes("tcgplayer_market"), "reference (fallback) rows are never a store");
  assert.deepEqual(q.where.OR, [
    { cardId: "c1", country: "US", priceCents: { lte: 950 } },
    { cardId: "c2", country: "US", priceCents: { lte: 500 } },
    { cardId: "c3", country: "US", priceCents: { lte: 400 } },
  ]);

  const byCard = new Map(h.sent.flatMap((s) => s.items).map((i) => [i.cardId, i]));
  assert.equal(byCard.get("c1")!.store!.name, "eBay", "the cheapest row wins");
  assert.equal(byCard.get("c1")!.store!.shippingCents, 0);
  assert.equal(byCard.get("c2")!.store!.name, "Shop X", "free drop emails name the store too");
  assert.equal(byCard.get("c3")!.store, undefined, "no row: the email links the card page instead");
});

test("a failing store lookup never blocks the alert", async () => {
  const rows = [row("x", { lastPriceCents: 700, us: 500 })];
  const sent: PriceDropItem[][] = [];
  const summary = await runPriceAlerts({
    db: {
      priceAlert: { findMany: async () => rows, update: (a: unknown) => a },
      retailerPrice: { findMany: async () => { throw new Error("db down"); } },
      $transaction: async (ops: unknown[]) => ops,
    } as unknown as AlertRunDeps["db"],
    sendPriceDropEmail: async (_to, items) => {
      sent.push(items);
      return true;
    },
    now: NOW,
    notifyUsers: false,
    dealRanks: async () => new Map(),
  });
  assert.equal(summary.emails, 1);
  assert.equal(sent[0]![0]!.store, undefined);
});

test("the store lookup is a single capped query in the source, too", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/price-alerts.ts"), "utf8");
  assert.equal(src.match(/retailerPrice\.findMany\(/g)?.length, 1, "exactly one RetailerPrice read in the cron");
  const fn = src.slice(src.indexOf("async function cheapestStores("));
  assert.match(fn, /take: wanted\.size \* STORE_ROWS_PER_CARD/);
  assert.match(fn, /orderBy: \{ priceCents: "asc" \}/);
  assert.match(fn, /retailer: \{ notIn: \[\.\.\.ALL_FALLBACK_RETAILERS\] \}/);
  assert.match(fn, /affiliateUrl\(r\.url, r\.retailer, "\/watching"\)/, "the listing link is affiliate-wrapped");
  // Called once, after both per-row passes and before the send loop — never
  // from inside a per-row loop.
  assert.equal(src.match(/await cheapestStores\(/g)?.length, 1);
  const call = src.indexOf("await cheapestStores(db, firedItems)");
  const pass2 = src.indexOf("// PASS 2");
  const sendLoop = src.indexOf("for (const [email, { token, items, anonymous, userId }] of byEmail)");
  assert.ok(pass2 > 0 && call > pass2 && call < sendLoop, "the lookup runs between the per-row passes and the send");
  const passes = src.slice(src.indexOf("// PASS 1"), call);
  assert.doesNotMatch(passes, /retailerPrice/, "no store read inside the per-row passes");
  // Never inside an unstable_cache: this is a cron (and getTcgDealRanks, a
  // self-caching loader, must be called directly — db.ts rule 6).
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(code, /unstable_cache|cachedOrDirect/);
  assert.match(code, /getTcgDealRanks\(c, defaultTcgBuyKeys\(c\)\)/);
});

// ── The email ────────────────────────────────────────────────────────────────

test("target email copy: '{Card} hit your target: {price} at {store}', item price, never 'delivered'", () => {
  const base = { name: "Radiant Hero", setCode: "RAD", collectorNumber: "001", url: "https://x/card/a", market: "US" as const };
  const store = { name: "Shop X", url: "https://shopx.example/a", priceCents: 900, shippingCents: null, condition: null };
  const hit: PriceDropItem = { ...base, kind: "target", oldCents: 1200, newCents: 900, targetCents: 1000, store };
  const c = priceDropCopy([hit]);
  assert.equal(c.subject, "Radiant Hero hit your target: US$9.00 at Shop X");
  assert.match(priceDropCopy([hit, { ...base, kind: "drop", oldCents: 500, newCents: 400 }]).subject, /hit your target: US\$9\.00 at Shop X \(\+1 more\)$/);
  assert.equal(priceDropCopy([{ ...hit, store: null }]).subject, "Radiant Hero hit your target: US$9.00");

  const html = dropRow(hit);
  assert.match(html, /Hit your target of US\$10\.00/);
  assert.match(html, /Cheapest at <strong[^>]*>Shop X<\/strong>: US\$9\.00/);
  assert.match(html, /item price, postage extra/);
  assert.match(html, /href="https:\/\/shopx\.example\/a"[^>]*>View listing/);
  assert.doesNotMatch(html, /delivered/i);

  assert.equal(postageNote({ shippingCents: null }, "USD"), "item price, postage extra");
  assert.equal(postageNote({ shippingCents: 0 }, "USD"), "free postage");
  assert.equal(postageNote({ shippingCents: 450 }, "USD"), "+ US$4.50 postage");

  // Free drop rows gain the same store line; their subject copy is unchanged.
  const drop: PriceDropItem = { ...base, kind: "drop", oldCents: 1500, newCents: 1299, store: { ...store, priceCents: 1299 } };
  assert.match(dropRow(drop), /line-through/);
  assert.match(dropRow(drop), /Cheapest at <strong[^>]*>Shop X/);
  assert.match(priceDropCopy([drop]).subject, /^Price drop: Radiant Hero is now /);
  // A scraped store name can't inject markup.
  assert.match(dropRow({ ...drop, store: { ...drop.store!, name: "<b>A&B</b>" } }), /&lt;b&gt;A&amp;B&lt;\/b&gt;/);
});

test("a paid digest links Deal Finder filtered to the member's watchlist", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/email.ts"), "utf8");
  assert.match(src, /\/tools\/deal-finder\?mine=watch/);
});
