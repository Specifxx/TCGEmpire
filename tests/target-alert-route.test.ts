import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyTargetPrice, type TargetDb } from "../src/lib/target-alerts";
import { PLUS_TARGET_ALERT_LIMIT } from "../src/lib/alert-limits";
import { MAX_TARGET_CENTS, clampTargetCents, parseMoneyInput, centsToInput } from "../src/lib/target-price";

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/alerts/watchlist/[cardId] { market, targetCents } — setting the
// Plus "Notify me at $X" price. The route reads the session (401) and rate
// limits (429); everything else is lib/target-alerts.ts applyTargetPrice,
// driven here against a stub client.
// ─────────────────────────────────────────────────────────────────────────────

const PAID_UNTIL = new Date("2099-01-01T00:00:00Z");
const plus = { id: "u1", isAdmin: false, premiumUntil: PAID_UNTIL, premiumTier: "plus", premiumTierFloor: null };
const premium = { ...plus, premiumTier: "premium" };
const free = { id: "u1", isAdmin: false, premiumUntil: null, premiumTier: "plus", premiumTierFloor: null };
const lapsed = { ...plus, premiumUntil: new Date("2020-01-01T00:00:00Z") };

function stub(opts: { others?: number; row?: { targetCents: number | null; lowestEmailedCents: number | null } | null; updated?: number } = {}) {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const db = {
    priceAlert: {
      count: async (args: Record<string, unknown>) => {
        calls.push({ op: "count", args });
        return opts.others ?? 0;
      },
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ op: "findFirst", args });
        return opts.row === undefined ? { targetCents: null, lowestEmailedCents: null } : opts.row;
      },
      updateMany: async (args: Record<string, unknown>) => {
        calls.push({ op: "updateMany", args });
        return { count: opts.updated ?? 1 };
      },
    },
  };
  return { db: db as unknown as TargetDb, calls, update: () => calls.find((c) => c.op === "updateMany")?.args as { where: unknown; data: Record<string, unknown> } | undefined };
}

test("403 for a free account, and for a lapsed one — before any read", async () => {
  for (const user of [free, lapsed]) {
    const s = stub();
    const r = await applyTargetPrice(s.db, user, "card-1", { market: "US", targetCents: 1000 });
    assert.equal(r.status, 403);
    assert.equal(s.calls.length, 0, "a free account's request never touches the table");
  }
});

test("400 for anything but whole cents in range, or null", async () => {
  for (const body of [
    { market: "US", targetCents: 0 },
    { market: "US", targetCents: MAX_TARGET_CENTS + 1 },
    { market: "US", targetCents: 12.5 },
    { market: "US", targetCents: "1000" },
    { targetCents: 1000 },
    { market: "NZ", targetCents: 1000 },
    null,
  ]) {
    const s = stub();
    const r = await applyTargetPrice(s.db, plus, "card-1", body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(s.calls.length, 0);
  }
});

test(`409 at the Plus limit (${PLUS_TARGET_ALERT_LIMIT}), counting only the account's OTHER targets`, async () => {
  const s = stub({ others: PLUS_TARGET_ALERT_LIMIT });
  const r = await applyTargetPrice(s.db, plus, "card-1", { market: "US", targetCents: 1000 });
  assert.equal(r.status, 409);
  assert.equal(r.body.limit, PLUS_TARGET_ALERT_LIMIT);
  assert.match(String(r.body.error), /Premium/);
  assert.equal(s.update(), undefined, "nothing written at the limit");
  const count = s.calls.find((c) => c.op === "count")!.args as { where: Record<string, unknown> };
  assert.deepEqual(count.where, { userId: "u1", targetCents: { not: null }, NOT: { cardId: "card-1", market: "US" } });

  // Editing a target already counted (the other 24 + this one) is never blocked.
  const edit = stub({ others: PLUS_TARGET_ALERT_LIMIT - 1, row: { targetCents: 900, lowestEmailedCents: null } });
  const e = await applyTargetPrice(edit.db, plus, "card-1", { market: "US", targetCents: 1000 });
  assert.equal(e.status, 200);
  assert.equal(e.body.used, PLUS_TARGET_ALERT_LIMIT);
});

test("Premium has no limit", async () => {
  const s = stub({ others: 500 });
  const r = await applyTargetPrice(s.db, premium, "card-1", { market: "US", targetCents: 1000 });
  assert.equal(r.status, 200);
  assert.equal(r.body.limit, null, "unlimited is sent as null (Infinity isn't JSON)");
  assert.equal(r.body.used, 501);
});

test("null clears the target — even at the limit — scoped to this account's (card, market) row", async () => {
  const s = stub({ others: PLUS_TARGET_ALERT_LIMIT, row: { targetCents: 1000, lowestEmailedCents: 800 } });
  const r = await applyTargetPrice(s.db, plus, "card-1", { market: "AU", targetCents: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.targetCents, null);
  assert.equal(r.body.used, PLUS_TARGET_ALERT_LIMIT, "clearing frees this card's slot");
  const u = s.update()!;
  assert.deepEqual(u.where, { userId: "u1", cardId: "card-1", market: "AU" });
  assert.deepEqual(u.data, { targetCents: null }, "clearing never touches the watermark");
});

test("a changed target re-arms a watermark at or below it; nothing else touches the watermark", async () => {
  // Listed at $3 (emailed), now $40: a $30 target must not be silenced by the $3.
  const low = stub({ row: { targetCents: null, lowestEmailedCents: 300 } });
  await applyTargetPrice(low.db, plus, "card-1", { market: "US", targetCents: 3000 });
  assert.deepEqual(low.update()!.data, { targetCents: 3000, lowestEmailedCents: null });
  // A watermark above the target never blocks it: left alone.
  const high = stub({ row: { targetCents: null, lowestEmailedCents: 5000 } });
  await applyTargetPrice(high.db, plus, "card-1", { market: "US", targetCents: 3000 });
  assert.deepEqual(high.update()!.data, { targetCents: 3000 });
  // Saving the same target again re-arms nothing (no repeat email).
  const same = stub({ row: { targetCents: 3000, lowestEmailedCents: 2900 } });
  await applyTargetPrice(same.db, plus, "card-1", { market: "US", targetCents: 3000 });
  assert.deepEqual(same.update()!.data, { targetCents: 3000 });
});

test("404 when this account has no such watch", async () => {
  const s = stub({ row: null });
  const r = await applyTargetPrice(s.db, plus, "card-1", { market: "US", targetCents: 1000 });
  assert.equal(r.status, 404);
  assert.equal(s.update(), undefined);
});

test("the route: session first, per-account rate limit, then applyTargetPrice", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/alerts/watchlist/[cardId]/route.ts"), "utf8");
  const patch = src.slice(src.indexOf("export async function PATCH"));
  assert.match(patch, /const user = await getCurrentUser\(\);\s*if \(!user\) return NextResponse\.json\(\{ error: "Sign in" \}, \{ status: 401 \}\);/);
  assert.match(patch, /rateLimit\(`alerts:target:\$\{user\.id\}`, 30, 60_000\)/);
  assert.match(patch, /applyTargetPrice\(prisma, user, params\.cardId, body\)/);
  assert.ok(patch.indexOf("rateLimit(") < patch.indexOf("applyTargetPrice("));
  // DELETE is unchanged and still user-scoped.
  assert.match(src, /export async function DELETE/);
});

test("the field's number rules match the route's", () => {
  assert.equal(parseMoneyInput("12"), 1200);
  assert.equal(parseMoneyInput("12.5"), 1250);
  assert.equal(parseMoneyInput("$12.50"), 1250);
  assert.equal(parseMoneyInput("A$ 1,200.00"), 120000);
  assert.equal(parseMoneyInput("12,50"), 1250, "a decimal comma (EU)");
  assert.equal(parseMoneyInput(""), null, "empty clears");
  assert.equal(parseMoneyInput("abc"), null);
  assert.equal(clampTargetCents(0), 1);
  assert.equal(clampTargetCents(MAX_TARGET_CENTS * 3), MAX_TARGET_CENTS);
  assert.equal(centsToInput(1250), "12.50");
  assert.equal(centsToInput(null), "");
});
