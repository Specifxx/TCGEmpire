import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyTargetPrice, type TargetDb } from "../src/lib/target-alerts";
import { PLUS_TARGET_ALERT_LIMIT } from "../src/lib/alert-limits";
import { MAX_TARGET_CENTS, clampTargetCents, parseMoneyInput, centsToInput, honouredTargetIds } from "../src/lib/target-price";

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

function stub(opts: { others?: number; row?: { targetCents: number | null } | null; updated?: number } = {}) {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const db = {
    priceAlert: {
      count: async (args: Record<string, unknown>) => {
        calls.push({ op: "count", args });
        return opts.others ?? 0;
      },
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ op: "findFirst", args });
        return opts.row === undefined ? { targetCents: null } : opts.row;
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
  const edit = stub({ others: PLUS_TARGET_ALERT_LIMIT - 1, row: { targetCents: 900 } });
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
  const s = stub({ others: PLUS_TARGET_ALERT_LIMIT, row: { targetCents: 1000 } });
  const r = await applyTargetPrice(s.db, plus, "card-1", { market: "AU", targetCents: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.targetCents, null);
  assert.equal(r.body.used, PLUS_TARGET_ALERT_LIMIT, "clearing frees this card's slot");
  const u = s.update()!;
  assert.deepEqual(u.where, { userId: "u1", cardId: "card-1", market: "AU" });
  assert.deepEqual(u.data, { targetCents: null, targetEmailedCents: null }, "clearing resets only the target's own watermark");
  assert.ok(!("lowestEmailedCents" in u.data), "the shared watermark is never touched");
});

test("a changed target re-arms the TARGET's own watermark, never the shared lowestEmailedCents", async () => {
  // Emailed at $3 long ago, $40 now, a $30 target set: the target is armed
  // again (targetEmailedCents null) — and the free drop rule's "lowest we've
  // ever emailed you" ($3) is left alone, so a $40 → $38 move is not a "new low".
  const set = stub({ row: { targetCents: null } });
  await applyTargetPrice(set.db, plus, "card-1", { market: "US", targetCents: 3000 });
  assert.deepEqual(set.update()!.data, { targetCents: 3000, targetEmailedCents: null });
  // Changing an existing target re-arms it too.
  const moved = stub({ row: { targetCents: 2500 } });
  await applyTargetPrice(moved.db, plus, "card-1", { market: "US", targetCents: 3000 });
  assert.deepEqual(moved.update()!.data, { targetCents: 3000, targetEmailedCents: null });
  // Saving the same target again re-arms nothing (no repeat email).
  const same = stub({ row: { targetCents: 3000 } });
  await applyTargetPrice(same.db, plus, "card-1", { market: "US", targetCents: 3000 });
  assert.deepEqual(same.update()!.data, { targetCents: 3000 });
  // No write from this route ever names the shared watermark.
  for (const s of [set, moved, same]) assert.ok(!("lowestEmailedCents" in s.update()!.data));
  const src = readFileSync(join(process.cwd(), "src/lib/target-alerts.ts"), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /lowestEmailedCents/);
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

test("honouredTargetIds: the oldest watches' targets win, ties broken by id; none when not entitled", () => {
  const rows = [
    { id: "c", targetCents: 100, createdAt: "2026-09-03T00:00:00.000Z" },
    { id: "a", targetCents: 100, createdAt: "2026-09-01T00:00:00.000Z" },
    { id: "x", targetCents: null, createdAt: "2026-08-01T00:00:00.000Z" }, // no target: never counted
    { id: "b2", targetCents: 100, createdAt: "2026-09-02T00:00:00.000Z" },
    { id: "b1", targetCents: 100, createdAt: "2026-09-02T00:00:00.000Z" }, // same createMany as b2
  ];
  assert.deepEqual([...honouredTargetIds(rows, 2)].sort(), ["a", "b1"]);
  assert.deepEqual([...honouredTargetIds(rows, 3)].sort(), ["a", "b1", "b2"]);
  assert.equal(honouredTargetIds(rows, Number.POSITIVE_INFINITY).size, 4, "Premium: every target");
  assert.equal(honouredTargetIds(rows, 0).size, 0, "not entitled: none");
  // Dates and ISO strings (the watchlist's JSON) sort the same.
  const asDates = rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));
  assert.deepEqual([...honouredTargetIds(asDates, 2)].sort(), ["a", "b1"]);
});

test("the watchlist shows an over-limit target as not active, by the cron's own rule", () => {
  const wl = readFileSync(join(process.cwd(), "src/components/Watchlist.tsx"), "utf8");
  assert.match(wl, /honouredTargetIds\(visible, premium \? targetAlertLimit\(tier\) : 0\)/);
  assert.equal(wl.match(/active=\{targetActive/g)?.length, 2, "both layouts pass it");
  const field = readFileSync(join(process.cwd(), "src/components/TargetPriceField.tsx"), "utf8");
  assert.match(field, /Not active: over your Plus limit/);
  const cron = readFileSync(join(process.cwd(), "src/lib/price-alerts.ts"), "utf8");
  assert.match(cron, /honouredTargetIds\(rows, targetAlertLimit\(premiumTierOf\(user\)\)\)/);
});

test("the modal's target field fetches its own 'N of 25 used' count; the watchlist passes it", () => {
  const field = readFileSync(join(process.cwd(), "src/components/TargetPriceField.tsx"), "utf8");
  assert.match(field, /const needCount = used === undefined && loaded && !!user && premium && finiteLimit != null;/);
  assert.match(field, /fetch\("\/api\/alerts\/watchlist\?targets=1", \{ cache: "no-store" \}\)/);
  const route = readFileSync(join(process.cwd(), "src/app/api/alerts/watchlist/route.ts"), "utf8");
  const branch = route.slice(route.indexOf('searchParams.get("targets") === "1"'), route.indexOf("const country = getCountry()"));
  assert.match(branch, /prisma\.priceAlert\s*\.count\(\{ where: \{ userId: user\.id, targetCents: \{ not: null \} \} \}\)/);
  assert.doesNotMatch(branch, /findMany/, "a count, never rows");
  // The modal renders the field without a count, so the field fetches it.
  const modal = readFileSync(join(process.cwd(), "src/components/PriceAlertModal.tsx"), "utf8");
  const use = modal.slice(modal.indexOf("<TargetPriceField"), modal.indexOf("/>", modal.indexOf("<TargetPriceField")));
  assert.doesNotMatch(use, /used=/);
});
