import test from "node:test";
import assert from "node:assert/strict";
import { createDeckWatch, deleteDeckWatch, listDeckWatches, updateDeckWatch, type DeckWatchRouteDb } from "../src/lib/deck-watch";
import { createSealedWatch, deleteSealedWatch, listSealedWatches, updateSealedWatch, type SealedWatchRouteDb } from "../src/lib/sealed-watch";
import { DECK_WATCH_LIMIT, SEALED_WATCH_LIMIT_PLUS } from "../src/lib/alert-limits";
import {
  ALERT_ACTION_KINDS,
  performAlertAction,
  signAlertAction,
  verifyAlertAction,
  watchActionLinks,
  type AlertActionDb,
} from "../src/lib/alert-actions";
import { recentlyEmailedAddresses, RunBudget, type AlertBudgetDb } from "../src/lib/alert-budget";
import { free, lapsed, plus, premium } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// The watch routes' logic (create / list / update / delete for deck and sealed
// watches), the token kinds that keep a deck link from acting on a card row,
// and the budget count that spans the three tables (2026-09-29).
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-09-29T09:00:00Z");
const u = (id: string, tier: typeof free) => ({ ...tier, id, email: `${id}@example.com` });

// ── Stub tables ──────────────────────────────────────────────────────────────

function deckDb(seed: Record<string, unknown>[] = []) {
  const rows = seed.map((r) => ({ ...r }));
  const calls: string[] = [];
  const db = {
    deckWatch: {
      count: async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `d${rows.length + 1}`, lastTotalCents: null, lastCheckedAt: null, lastEmailedCents: null, lastNotifiedAt: null, snoozedUntil: null, createdAt: NOW, ...data };
        rows.push(row);
        calls.push(`create:${row.id}`);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
      findMany: async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        calls.push(`update:${where.id}`);
        return r;
      },
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const i = rows.findIndex((r) => r.id === where.id && r.userId === where.userId);
        if (i >= 0) rows.splice(i, 1);
        calls.push(`delete:${where.id}:${i >= 0}`);
        return { count: i >= 0 ? 1 : 0 };
      },
    },
  };
  return { db: db as unknown as DeckWatchRouteDb, rows, calls };
}

function sealedDb(seed: Record<string, unknown>[] = []) {
  const rows = seed.map((r) => ({ ...r }));
  const calls: string[] = [];
  const db = {
    sealedWatch: {
      count: async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `s${rows.length + 1}`, lastPriceCents: null, lastInStock: null, soldOutAt: null, lastEmailedCents: null, lastNotifiedAt: null, snoozedUntil: null, createdAt: NOW, ...data };
        rows.push(row);
        calls.push(`create:${row.id}`);
        return row;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
      findMany: async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        calls.push(`update:${where.id}`);
        return r;
      },
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const i = rows.findIndex((r) => r.id === where.id && r.userId === where.userId);
        if (i >= 0) rows.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
    },
  };
  return { db: db as unknown as SealedWatchRouteDb, rows, calls };
}

// ── Deck watches: Premium only, owner only, DECK_WATCH_LIMIT ─────────────────

test("deck watches: create / update / delete need Premium to create or edit (402 for free, Plus and lapsed); snooze and stop are any owner's; only the owner's rows", async () => {
  const { db, rows, calls } = deckDb();
  for (const who of [free, plus, lapsed]) {
    const res = await createDeckWatch(db, u("x", who), { name: "d", listText: "3 Alpha" }, "US");
    assert.equal(res.status, 402, who.premiumTier);
    assert.equal(res.body.code, "tier_required");
    assert.equal(res.body.tier, "premium");
  }
  assert.equal(rows.length, 0);
  const created = await createDeckWatch(db, u("owner", premium), { name: " Jinx aggro ", listText: "3 Alpha\n1 Beta", targetCents: 18_000, region: "northeast", trackedOnly: true }, "US");
  assert.equal(created.status, 201);
  const w = created.body.watch as Record<string, unknown>;
  assert.equal(w.name, "Jinx aggro");
  assert.equal(w.targetCents, 18_000);
  assert.equal(w.region, "northeast");
  assert.equal(w.trackedOnly, true);
  assert.equal(w.market, "US");
  assert.equal(rows[0]!.userId, "owner");
  // A name defaults to the first card.
  const named = await createDeckWatch(db, u("owner", premium), { listText: "2 Kai'Sa, Survivor\n1 Beta" }, "US");
  assert.equal((named.body.watch as { name: string }).name, "Kai'Sa, Survivor +1");
  // Validation.
  assert.equal((await createDeckWatch(db, u("owner", premium), { listText: "" }, "US")).status, 400);
  assert.equal((await createDeckWatch(db, u("owner", premium), { listText: "3 Alpha", targetCents: "lots" }, "US")).status, 400);
  const clamped = await createDeckWatch(db, u("owner", premium), { listText: "3 Alpha", targetCents: 1 }, "US");
  assert.equal((clamped.body.watch as { targetCents: number }).targetCents, 100, "clamped to the minimum target");

  // Update: owner and Premium only; a changed target re-arms the watermark.
  rows[0]!.lastEmailedCents = 17_000;
  const other = await updateDeckWatch(db, u("someone-else", premium), "d1", { targetCents: 5 }, NOW);
  assert.equal(other.status, 404, "not the owner: as if it did not exist");
  assert.equal((await updateDeckWatch(db, u("owner", plus), "d1", { targetCents: 5000 }, NOW)).status, 402);
  const upd = await updateDeckWatch(db, u("owner", premium), "d1", { targetCents: 15_000 }, NOW);
  assert.equal(upd.status, 200);
  assert.equal(rows[0]!.targetCents, 15_000);
  assert.equal(rows[0]!.lastEmailedCents, null, "re-armed");
  const snoozed = await updateDeckWatch(db, u("owner", premium), "d1", { snoozeDays: 30 }, NOW);
  assert.deepEqual((snoozed.body.watch as { snoozedUntil: Date }).snoozedUntil, new Date(NOW.getTime() + 30 * 86_400_000));
  assert.equal((await updateDeckWatch(db, u("owner", premium), "d1", { snoozeDays: 0 }, NOW)).status, 200);
  assert.equal(rows[0]!.snoozedUntil, null);
  assert.equal((await updateDeckWatch(db, u("owner", premium), "d1", {}, NOW)).status, 400);
  assert.equal((await updateDeckWatch(db, u("owner", premium), "d1", { snoozeDays: 999 }, NOW)).status, 400);

  // List: the owner's rows only.
  const list = await listDeckWatches(db, u("owner", premium));
  assert.equal((list.body.watches as unknown[]).length, 3, "three creates landed; two were refused");
  assert.equal(list.body.limit, DECK_WATCH_LIMIT);
  assert.equal(((await listDeckWatches(db, u("someone-else", premium))).body.watches as unknown[]).length, 0);

  // A LAPSED owner keeps their rows and may snooze or stop them (no entitlement
  // needed, ownership still is); editing the target or the name stays Premium's.
  assert.equal((await updateDeckWatch(db, u("owner", free), "d2", { targetCents: 5000 }, NOW)).status, 402);
  assert.equal((await updateDeckWatch(db, u("owner", free), "d2", { name: "renamed" }, NOW)).status, 402);
  assert.equal((await updateDeckWatch(db, u("owner", free), "d2", { snoozeDays: 30 }, NOW)).status, 200, "a lapsed owner can snooze");
  assert.equal((await updateDeckWatch(db, u("someone-else", free), "d2", { snoozeDays: 30 }, NOW)).status, 404, "…only their own");

  // Delete: the owner at any tier, never another account's; idempotent.
  assert.equal((await deleteDeckWatch(db, u("someone-else", premium), "d1")).status, 404);
  assert.equal((await deleteDeckWatch(db, u("someone-else", free), "d1")).status, 404);
  assert.equal(rows.length, 3, "nothing removed");
  assert.equal((await deleteDeckWatch(db, u("owner", free), "d1")).status, 200, "a lapsed owner can stop a watch");
  assert.equal((await deleteDeckWatch(db, u("owner", premium), "d1")).status, 404);
  assert.equal(rows.length, 2);
  assert.ok(calls.some((c) => c.startsWith("delete:d1:true")));
});

test("deck watches: the eleventh list is refused with 409 and the real count", async () => {
  const { db } = deckDb(Array.from({ length: DECK_WATCH_LIMIT }, (_, i) => ({ id: `d${i}`, userId: "owner", market: "US", name: `d${i}`, listText: "1 Alpha" })));
  const res = await createDeckWatch(db, u("owner", premium), { listText: "1 Alpha" }, "US");
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "limit");
  assert.equal(res.body.limit, DECK_WATCH_LIMIT);
  assert.equal(res.body.count, DECK_WATCH_LIMIT);
  // Another account is unaffected.
  assert.equal((await createDeckWatch(db, u("fresh", premium), { listText: "1 Alpha" }, "US")).status, 201);
});

// ── Sealed watches: any paid tier, Plus capped, owner only ───────────────────

test("sealed watches: create / update / delete need a paid tier to create or edit a target (402 for free and lapsed); snooze and stop are any owner's; Plus works; ownership; the unique key updates instead", async () => {
  const { db, rows } = sealedDb();
  for (const who of [free, lapsed]) {
    const res = await createSealedWatch(db, u("x", who), { groupKey: "OGN|Booster Box" }, "US");
    assert.equal(res.status, 402, who.premiumTier);
    assert.equal(res.body.tier, "plus");
  }
  assert.equal((await createSealedWatch(db, u("p", plus), {}, "US")).status, 400, "which product?");
  assert.equal((await createSealedWatch(db, u("p", plus), { groupKey: "<script>" }, "US")).status, 400);
  const created = await createSealedWatch(db, u("p", plus), { groupKey: "OGN|Booster Box", targetCents: 14000 }, "US");
  assert.equal(created.status, 201);
  assert.equal(rows[0]!.email, "p@example.com", "the address at creation is the mail-routing key");
  assert.equal(rows[0]!.market, "US");
  // Watching it again is an update of the same row, never a second row.
  rows[0]!.lastEmailedCents = 13_000;
  const again = await createSealedWatch(db, u("p", plus), { groupKey: "OGN|Booster Box", targetCents: 12000 }, "US");
  assert.equal(again.status, 200);
  assert.equal(again.body.existed, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.targetCents, 12000);
  assert.equal(rows[0]!.lastEmailedCents, null, "a changed target is re-armed");
  // Another market is another watch.
  assert.equal((await createSealedWatch(db, u("p", plus), { groupKey: "OGN|Booster Box" }, "AU")).status, 201);
  assert.equal(rows.length, 2);

  assert.equal((await updateSealedWatch(db, u("q", premium), "s1", { targetCents: 1 }, NOW)).status, 404, "not the owner");
  assert.equal((await updateSealedWatch(db, u("p", free), "s1", { targetCents: 1 }, NOW)).status, 402);
  assert.equal((await updateSealedWatch(db, u("p", lapsed), "s1", { snoozeDays: 30 }, NOW)).status, 200, "a lapsed owner can snooze");
  assert.equal((await updateSealedWatch(db, u("q", free), "s1", { snoozeDays: 30 }, NOW)).status, 404, "…only their own");
  assert.equal((await updateSealedWatch(db, u("p", plus), "s1", { snoozeDays: 0 }, NOW)).status, 200);
  const upd = await updateSealedWatch(db, u("p", plus), "s1", { targetCents: 11000, snoozeDays: 30 }, NOW);
  assert.equal(upd.status, 200);
  assert.equal(rows[0]!.targetCents, 11000);
  assert.ok(rows[0]!.snoozedUntil);
  assert.equal((await updateSealedWatch(db, u("p", plus), "s1", { targetCents: null }, NOW)).status, 200);
  assert.equal(rows[0]!.targetCents, null);

  const list = await listSealedWatches(db, u("p", plus));
  assert.equal((list.body.watches as unknown[]).length, 2);
  assert.equal(list.body.limit, SEALED_WATCH_LIMIT_PLUS);
  assert.equal((await listSealedWatches(db, u("p", premium))).body.limit, null, "Premium: no limit to quote");

  assert.equal((await deleteSealedWatch(db, u("q", premium), "s1")).status, 404);
  assert.equal((await deleteSealedWatch(db, u("q", free), "s1")).status, 404);
  assert.equal(rows.length, 2, "nothing removed");
  assert.equal((await deleteSealedWatch(db, u("p", lapsed), "s1")).status, 200, "a lapsed owner can stop a watch");
  assert.equal((await deleteSealedWatch(db, u("p", plus), "s1")).status, 404, "idempotent");
  assert.equal(rows.length, 1);
});

test("sealed watches: Plus stops at SEALED_WATCH_LIMIT_PLUS with 409; Premium does not", async () => {
  const seed = Array.from({ length: SEALED_WATCH_LIMIT_PLUS }, (_, i) => ({ id: `s${i}`, userId: "p", email: "p@example.com", market: "US", groupKey: `k${i}` }));
  const { db } = sealedDb(seed);
  const res = await createSealedWatch(db, u("p", plus), { groupKey: "new" }, "US");
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "limit");
  assert.equal(res.body.limit, SEALED_WATCH_LIMIT_PLUS);
  const prem = sealedDb(seed.map((r) => ({ ...r, userId: "q" })));
  assert.equal((await createSealedWatch(prem.db, u("q", premium), { groupKey: "new" }, "US")).status, 201);
});

// ── Token kinds ──────────────────────────────────────────────────────────────

test("token kinds: a card token stays v1 and verifies as 'price'; deck and sealed tokens name their kind and act only on their table", async () => {
  assert.deepEqual([...ALERT_ACTION_KINDS], ["price", "deck", "sealed"]);
  const card = signAlertAction({ alertId: "row1", action: "snooze", now: NOW });
  assert.match(Buffer.from(card.split(".")[0]!, "base64url").toString("utf8"), /^v1\.row1\.snooze\.\.\d+$/, "the pre-2026-09-29 payload, unchanged");
  const v = verifyAlertAction(card, NOW);
  assert.ok(v.ok && v.kind === "price" && v.alertId === "row1");
  const deck = signAlertAction({ alertId: "row1", action: "stop", now: NOW, kind: "deck" });
  assert.match(Buffer.from(deck.split(".")[0]!, "base64url").toString("utf8"), /^v2\.deck\.row1\.stop\.\.\d+$/);
  const d = verifyAlertAction(deck, NOW);
  assert.ok(d.ok && d.kind === "deck" && d.alertId === "row1" && d.action === "stop");
  const sealed = verifyAlertAction(signAlertAction({ alertId: "row1", action: "snooze", now: NOW, kind: "sealed" }), NOW);
  assert.ok(sealed.ok && sealed.kind === "sealed");
  // The same id, another kind: a different signature — a deck link cannot be replayed on a card row.
  assert.notEqual(card.split(".")[1], signAlertAction({ alertId: "row1", action: "snooze", now: NOW, kind: "deck" }).split(".")[1]);
  // Forging the kind fails the signature; a target action on a non-card kind is refused outright.
  const [payload, sig] = deck.split(".") as [string, string];
  const forged = Buffer.from(Buffer.from(payload, "base64url").toString("utf8").replace("v2.deck.", "v2.sealed.")).toString("base64url");
  assert.deepEqual(verifyAlertAction(`${forged}.${sig}`, NOW), { ok: false, reason: "signature" });
  assert.throws(() => signAlertAction({ alertId: "row1", action: "target-down", value: 100, kind: "deck" }));
  const links = watchActionLinks({ kind: "sealed", id: "s9", now: NOW });
  assert.match(links.stop, /\/alerts\/action\?t=/);
  const stopClaims = verifyAlertAction(new URL(links.stop).searchParams.get("t"), NOW);
  assert.ok(stopClaims.ok && stopClaims.kind === "sealed" && stopClaims.action === "stop");

  // performAlertAction dispatches by kind: the card table is never touched by a deck token.
  const touched: string[] = [];
  const table = (name: string, exists: boolean) => ({
    findUnique: async () => {
      touched.push(`${name}.find`);
      return exists ? { id: "row1" } : null;
    },
    deleteMany: async () => {
      touched.push(`${name}.delete`);
      return { count: 1 };
    },
    update: async () => {
      touched.push(`${name}.update`);
      return {};
    },
  });
  const db = { priceAlert: table("card", true), deckWatch: table("deck", true), sealedWatch: table("sealed", false) } as unknown as AlertActionDb;
  const stopped = await performAlertAction(db, deck, NOW);
  assert.equal(stopped.status, 200);
  assert.deepEqual(touched, ["deck.find", "deck.delete"]);
  touched.length = 0;
  const gone = await performAlertAction(db, signAlertAction({ alertId: "row1", action: "snooze", now: NOW, kind: "sealed" }), NOW);
  assert.equal(gone.status, 404);
  assert.equal(gone.outcome, "gone");
  assert.deepEqual(touched, ["sealed.find"]);
});

// ── The shared budget ────────────────────────────────────────────────────────

test("the budget count unions the three tables' addresses inside the window, and RunBudget spends it per address", async () => {
  const seen: string[] = [];
  const db = {
    priceAlert: {
      groupBy: async (args: { where: { lastNotifiedAt: { gte: Date } }; take: number }) => {
        seen.push(`cards:${args.where.lastNotifiedAt.gte.toISOString()}:${args.take}`);
        return [{ email: "a@example.com" }, { email: "b@example.com" }];
      },
    },
    sealedWatch: {
      groupBy: async () => {
        seen.push("sealed");
        return [{ email: "b@example.com" }, { email: "c@example.com" }];
      },
    },
    deckWatch: {
      findMany: async (args: { select: { user: { select: { email: boolean } } }; take: number }) => {
        seen.push(`decks:${args.take}`);
        return [{ user: { email: "d@example.com" } }, { user: null }];
      },
    },
  } as unknown as AlertBudgetDb;
  const recent = await recentlyEmailedAddresses(db, NOW, 20 * 3_600_000);
  assert.deepEqual([...recent].sort(), ["a@example.com", "b@example.com", "c@example.com", "d@example.com"]);
  assert.deepEqual(seen, [`cards:${new Date(NOW.getTime() - 20 * 3_600_000).toISOString()}:1000`, "sealed", "decks:1000"]);

  // 2 slots left, cap 3: two new addresses fit, a third new one is over budget,
  // an address already counted is free, and one already opened costs nothing more.
  const b = new RunBudget(recent, 2, 3);
  assert.equal(b.reason("new1@example.com"), null);
  b.open("new1@example.com");
  assert.equal(b.reason("new1@example.com"), null, "already opened this run");
  b.open("new2@example.com");
  assert.equal(b.reason("new3@example.com"), "budget");
  assert.equal(b.reason("a@example.com"), null, "counted earlier today: no new slot");
  b.open("a@example.com");
  assert.equal(b.reason("b@example.com"), "cap", "the per-run cap binds before the budget");
});
