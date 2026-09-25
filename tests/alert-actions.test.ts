import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALERT_ACTION_TTL_MS,
  SNOOZE_MS,
  alertActionLinks,
  loweredTargetCents,
  performAlertAction,
  signAlertAction,
  verifyAlertAction,
  type AlertActionDb,
} from "../src/lib/alert-actions";
import { PLUS_TARGET_ALERT_LIMIT } from "../src/lib/alert-limits";
import { POST as actionPOST } from "../src/app/api/alerts/action/route";

// ─────────────────────────────────────────────────────────────────────────────
// One-tap links in price-alert emails (lib/alert-actions.ts): the HMAC token,
// and what POST /api/alerts/action does with it — 403 on a bad token, the
// Plus-only targets with targetAlertLimit enforced, and no state change on GET.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-09-25T09:00:00Z");
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── The token ────────────────────────────────────────────────────────────────

test("sign → verify round-trips the row, the action and the value", () => {
  const t = signAlertAction({ alertId: "ckrow123", action: "target-set", value: 1840, now: NOW });
  const v = verifyAlertAction(t, NOW);
  assert.ok(v.ok);
  assert.equal(v.alertId, "ckrow123");
  assert.equal(v.action, "target-set");
  assert.equal(v.value, 1840);
  assert.equal(v.exp, Math.floor((NOW.getTime() + ALERT_ACTION_TTL_MS) / 1000));
  const s = verifyAlertAction(signAlertAction({ alertId: "ckrow123", action: "snooze", now: NOW }), NOW);
  assert.ok(s.ok && s.action === "snooze" && s.value === null);
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "URL-safe");
});

test("tampering fails: another row, another action, another value, a flipped signature byte", () => {
  const t = signAlertAction({ alertId: "rowA", action: "snooze", now: NOW });
  const [payload, sig] = t.split(".") as [string, string];
  const forge = (text: string) => `${Buffer.from(text).toString("base64url")}.${sig}`;
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  for (const forged of [
    forge(decoded.replace("rowA", "rowB")),
    forge(decoded.replace("snooze", "stop")),
    forge(decoded.replace(".snooze.", ".target-set.").replace(/\.\./, ".1.")),
    forge(decoded.replace(/\.(\d+)$/, (_, e: string) => `.${Number(e) + 86400 * 365}`)),
  ]) {
    assert.deepEqual(verifyAlertAction(forged, NOW), { ok: false, reason: "signature" });
  }
  const flipped = Buffer.from(sig, "base64url");
  flipped[0] = flipped[0]! ^ 1;
  assert.deepEqual(verifyAlertAction(`${payload}.${flipped.toString("base64url")}`, NOW), { ok: false, reason: "signature" });
  // A target token's value is signed too.
  const tt = signAlertAction({ alertId: "rowA", action: "target-set", value: 1000, now: NOW });
  const [tp, ts] = tt.split(".") as [string, string];
  const cheaper = Buffer.from(Buffer.from(tp, "base64url").toString("utf8").replace(".1000.", ".1.")).toString("base64url");
  assert.equal(verifyAlertAction(`${cheaper}.${ts}`, NOW).ok, false);
});

test("expired and malformed tokens are refused", () => {
  const t = signAlertAction({ alertId: "rowA", action: "stop", now: NOW });
  assert.equal(verifyAlertAction(t, new Date(NOW.getTime() + ALERT_ACTION_TTL_MS - 1000)).ok, true);
  assert.deepEqual(verifyAlertAction(t, new Date(NOW.getTime() + ALERT_ACTION_TTL_MS + 1000)), { ok: false, reason: "expired" });
  for (const bad of ["", "abc", "a.b.c", "!!!.???", `${"x".repeat(500)}.y`, null, undefined]) {
    assert.equal(verifyAlertAction(bad, NOW).ok, false, String(bad));
  }
  assert.throws(() => signAlertAction({ alertId: "has.dot", action: "stop" }));
});

test("links: a paid row gets target links (the target down 10%), a free row the Plus link", () => {
  assert.equal(loweredTargetCents(2000, 1840), 1800);
  assert.equal(loweredTargetCents(null, 1840), 1656);
  const paid = alertActionLinks({ alertId: "r", currentCents: 1840, targetCents: 2000, canTarget: true, now: NOW });
  assert.equal(paid.targetSet?.cents, 1840);
  assert.equal(paid.targetDown?.cents, 1800);
  assert.equal(paid.upsell, null);
  assert.equal(paid.hasTarget, true);
  const v = verifyAlertAction(new URL(paid.targetDown!.url).searchParams.get("t"), NOW);
  assert.ok(v.ok && v.action === "target-down" && v.value === 1800);
  // "Set target at this price" is dropped when it already is the target.
  assert.equal(alertActionLinks({ alertId: "r", currentCents: 1840, targetCents: 1840, canTarget: true, now: NOW }).targetSet, null);
  const free = alertActionLinks({ alertId: "r", currentCents: 1840, targetCents: null, canTarget: false, now: NOW });
  assert.equal(free.targetSet, null);
  assert.equal(free.targetDown, null);
  assert.match(free.upsell!, /\/premium\?src=alert-email/);
  for (const u of [free.stop, free.snooze]) assert.match(u, /\/alerts\/action\?t=/);
});

// ── Applying (a stub PriceAlert table) ───────────────────────────────────────

type StubRow = {
  id: string;
  cardId: string;
  market: string;
  userId: string | null;
  targetCents: number | null;
  targetEmailedCents: number | null;
  snoozedUntil: Date | null;
  user: { id: string; email: string; isAdmin: boolean; premiumUntil: Date | null; premiumTier: string; premiumTierFloor: string | null } | null;
};

const PAID = new Date("2099-01-01T00:00:00Z");
const account = (tier: "plus" | "premium" | null, id = "u1") => ({
  id,
  email: `${id}@example.com`,
  isAdmin: false,
  premiumUntil: tier ? PAID : null,
  premiumTier: tier ?? "plus",
  premiumTierFloor: null,
});

function stub(rows: StubRow[]) {
  const calls: string[] = [];
  const db = {
    priceAlert: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      deleteMany: async ({ where }: { where: { id: string } }) => {
        calls.push(`delete:${where.id}`);
        const i = rows.findIndex((r) => r.id === where.id);
        if (i >= 0) rows.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<StubRow> }) => {
        calls.push(`update:${where.id}`);
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
      count: async ({ where }: { where: { userId: string; NOT: { cardId: string; market: string } } }) =>
        rows.filter((r) => r.userId === where.userId && r.targetCents != null && !(r.cardId === where.NOT.cardId && r.market === where.NOT.market)).length,
      findFirst: async ({ where }: { where: { userId: string; cardId: string; market: string } }) =>
        rows.find((r) => r.userId === where.userId && r.cardId === where.cardId && r.market === where.market) ?? null,
      updateMany: async ({ where, data }: { where: { userId: string; cardId: string; market: string }; data: Partial<StubRow> }) => {
        calls.push(`target:${where.cardId}`);
        const hit = rows.filter((r) => r.userId === where.userId && r.cardId === where.cardId && r.market === where.market);
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
    },
  };
  return { db: db as unknown as AlertActionDb, rows, calls };
}

const watch = (over: Partial<StubRow> = {}): StubRow => ({
  id: "row1",
  cardId: "card1",
  market: "AU",
  userId: null,
  targetCents: null,
  targetEmailedCents: null,
  snoozedUntil: null,
  user: null,
  ...over,
});
const tok = (action: "stop" | "snooze" | "target-set" | "target-down", value?: number, alertId = "row1") => signAlertAction({ alertId, action, value, now: NOW });

test("a bad token is a 403 and touches nothing", async () => {
  const s = stub([watch()]);
  for (const t of [null, "", "junk", tok("stop").replace(/.$/, (c) => (c === "A" ? "B" : "A"))]) {
    const r = await performAlertAction(s.db, t, NOW);
    assert.equal(r.status, 403);
    assert.equal(r.outcome, "invalid");
  }
  assert.deepEqual(s.calls, []);
  assert.equal(s.rows.length, 1);
});

test("stop deletes exactly that row, and a second tap is still fine", async () => {
  const s = stub([watch(), watch({ id: "row2", cardId: "card2" })]);
  const r = await performAlertAction(s.db, tok("stop"), NOW);
  assert.equal(r.status, 200);
  assert.deepEqual(s.rows.map((x) => x.id), ["row2"]);
  const again = await performAlertAction(s.db, tok("stop"), NOW);
  assert.equal(again.status, 200);
  assert.equal(again.body.removed, 0);
});

test("snooze sets snoozedUntil 30 days out", async () => {
  const s = stub([watch()]);
  const r = await performAlertAction(s.db, tok("snooze"), NOW);
  assert.equal(r.status, 200);
  assert.deepEqual(s.rows[0]!.snoozedUntil, new Date(NOW.getTime() + SNOOZE_MS));
  const gone = await performAlertAction(stub([]).db, tok("snooze"), NOW);
  assert.equal(gone.status, 404);
  assert.equal(gone.outcome, "gone");
});

test("targets: an anonymous or free watch can't set one (403); Plus can, and re-arms", async () => {
  const anon = stub([watch()]);
  const a = await performAlertAction(anon.db, tok("target-set", 1840), NOW);
  assert.equal(a.status, 403);
  assert.equal(a.outcome, "no-account");
  assert.equal(anon.rows[0]!.targetCents, null);

  const free = stub([watch({ userId: "u1", user: account(null) })]);
  const f = await performAlertAction(free.db, tok("target-set", 1840), NOW);
  assert.equal(f.status, 403);
  assert.equal(f.outcome, "not-plus");
  assert.equal(free.rows[0]!.targetCents, null);
  assert.deepEqual(free.calls, [], "nothing written for a free account");

  const plus = stub([watch({ userId: "u1", user: account("plus"), targetCents: 2000, targetEmailedCents: 1900 })]);
  const p = await performAlertAction(plus.db, tok("target-down", 1800), NOW);
  assert.equal(p.status, 200);
  assert.equal(p.outcome, "ok");
  assert.equal(plus.rows[0]!.targetCents, 1800);
  assert.equal(plus.rows[0]!.targetEmailedCents, null, "a changed target re-arms");
});

test("the Plus target limit is enforced server-side; Premium is unlimited", async () => {
  const full = Array.from({ length: PLUS_TARGET_ALERT_LIMIT }, (_, i) =>
    watch({ id: `t${i}`, cardId: `c${i}`, userId: "u1", user: account("plus"), targetCents: 500 }),
  );
  const s = stub([...full, watch({ userId: "u1", user: account("plus") })]);
  const r = await performAlertAction(s.db, tok("target-set", 1840), NOW);
  assert.equal(r.status, 409);
  assert.equal(r.outcome, "limit");
  assert.equal(s.rows.find((x) => x.id === "row1")!.targetCents, null);

  const prem = stub([...full.map((w) => ({ ...w, user: account("premium") })), watch({ userId: "u1", user: account("premium") })]);
  const ok = await performAlertAction(prem.db, tok("target-set", 1840), NOW);
  assert.equal(ok.status, 200);
  assert.equal(prem.rows.find((x) => x.id === "row1")!.targetCents, 1840);
});

// ── The route and the page ───────────────────────────────────────────────────

test("POST /api/alerts/action: 403 on a bad token, JSON or form", async () => {
  const json = await actionPOST(
    new Request("https://riftcompare.com/api/alerts/action", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" }, body: JSON.stringify({ token: "nope.nope" }) }),
  );
  assert.equal(json.status, 403);
  const form = await actionPOST(
    new Request("https://riftcompare.com/api/alerts/action", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.0.0.2" }, body: "t=forged.token" }),
  );
  assert.equal(form.status, 403);
});

test("no GET acts: the route has no GET handler, and the page only confirms, posting a form", () => {
  const route = code("src/app/api/alerts/action/route.ts");
  assert.doesNotMatch(route, /export (async )?function GET/);
  assert.match(route, /performAlertAction\(prisma, token\)/);
  const page = code("src/app/alerts/action/page.tsx");
  assert.doesNotMatch(page, /performAlertAction|deleteMany|\.update\(|applyTargetPrice/, "the GET page must never change state");
  assert.match(page, /<form method="post" action="\/api\/alerts\/action"/);
  assert.match(page, /verifyAlertAction\(token\)/);
  assert.match(page, /index: false/);
});
