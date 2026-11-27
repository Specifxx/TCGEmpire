import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FOUNDER_SEATS, LIFETIME_UNTIL, PASSES, PASS_TEST, passArm, passOffersFor, passTestOpen, passUntil, parsePassKind } from "../src/lib/premium-pass";
import { passSessionParams } from "../src/lib/premium-pass-server";

// The price ladder test (owner, 2026-11-26; DECISIONS.md "A Week Pass and a Founder Lifetime, as a test").
const DAY = 86_400_000;
const mid = PASS_TEST.start + DAY;
const ids = Array.from({ length: 200 }, (_, i) => `acct${i}`);
const b = ids.find((id) => passArm(id) === "b")!;
const a = ids.find((id) => passArm(id) === "a")!;
const old = mid - 30 * DAY;

test("the window is 7 to 21 Dec 2026, UTC, and the prices are fixed in code", () => {
  assert.equal(new Date(PASS_TEST.start).toISOString(), "2026-12-07T00:00:00.000Z");
  assert.equal(new Date(PASS_TEST.end).toISOString(), "2026-12-21T00:00:00.000Z");
  assert.equal(passTestOpen(PASS_TEST.end), false);
  assert.equal(PASSES.week.cents, 299);
  assert.equal(PASSES.founder.cents, 9900);
  assert.equal(FOUNDER_SEATS, 100);
  for (const f of ["src/lib/premium-pass.ts", "src/lib/premium-pass-server.ts"]) assert.ok(!readFileSync(f, "utf8").includes("process.env"), f);
});

test("only arm b, in the window, not already paying, is offered anything", () => {
  assert.deepEqual(passOffersFor({ userId: a, createdAt: old, entitledByPayment: false, founderSold: 0, now: mid }), []);
  assert.deepEqual(passOffersFor({ userId: b, createdAt: old, entitledByPayment: true, founderSold: 0, now: mid }), []);
  assert.deepEqual(passOffersFor({ userId: b, createdAt: old, entitledByPayment: false, founderSold: 0, now: PASS_TEST.end }), []);
  assert.deepEqual(passOffersFor({ userId: b, createdAt: old, entitledByPayment: false, founderSold: 0, now: mid }).map((o) => o.kind), ["week", "founder"]);
});

test("Founder needs a 14-day-old account and a seat left, with the live count", () => {
  assert.deepEqual(passOffersFor({ userId: b, createdAt: mid - 3 * DAY, entitledByPayment: false, founderSold: 0, now: mid }).map((o) => o.kind), ["week"]);
  assert.deepEqual(passOffersFor({ userId: b, createdAt: old, entitledByPayment: false, founderSold: 100, now: mid }).map((o) => o.kind), ["week"]);
  assert.equal(passOffersFor({ userId: b, createdAt: old, entitledByPayment: false, founderSold: 97, now: mid })[1]!.left, 3);
});

test("entitlement is extend-only", () => {
  assert.equal(passUntil("week", mid, null), mid + 7 * DAY);
  assert.equal(passUntil("week", mid, mid + 2 * DAY), mid + 9 * DAY);
  assert.equal(passUntil("week", mid, mid - DAY), mid + 7 * DAY);
  assert.equal(passUntil("founder", mid, null), LIFETIME_UNTIL);
});

test("a pass is one payment that never saves a customer or renews", () => {
  const p = passSessionParams({ kind: "week", userId: "u1", email: "x@example.com", siteKey: "mtg", billedBy: "Billed by us.", successUrl: "https://s/premium", cancelUrl: "https://s/premium" });
  assert.equal(p.mode, "payment");
  assert.equal(p.customer_email, "x@example.com");
  assert.equal("customer" in p, false);
  assert.equal("subscription_data" in p, false);
  assert.equal(p.line_items?.[0]?.price_data?.unit_amount, 299);
  assert.equal(p.metadata?.kind, "premium_pass");
  assert.equal(parsePassKind("lifetime"), null);
});

test("the webhook grants passes, and only the status and pass routes offer them", () => {
  assert.match(readFileSync("src/app/api/marketplace/stripe/webhook/route.ts", "utf8"), /if \(session\.metadata\?\.kind === "premium_pass"\) await passPaid\(session\);/);
  const server = readFileSync("src/lib/premium-pass-server.ts", "utf8");
  assert.match(server, /pass:s:\$\{session\.id\}/, "idempotent per Checkout session");
  assert.match(server, /session\.payment_status !== "paid"/);
});

test("Founder seats are reserved atomically at checkout and given back when it expires unpaid", () => {
  const server = readFileSync("src/lib/premium-pass-server.ts", "utf8");
  assert.match(server, /updateMany\(\{ where: \{ key: FOUNDER_SOLD_KEY, value: \{ lt: FOUNDER_SEATS \} \}/);
  assert.match(server, /expires_at: Math\.floor\(Date\.now\(\) \/ 1000\) \+ 30 \* 60/);
  const route = readFileSync("src/app/api/sister-premium/pass/route.ts", "utf8");
  assert.match(route, /kind === "founder" && !\(await reserveFounderSeat\(\)\)/);
  assert.match(readFileSync("src/app/api/marketplace/stripe/webhook/route.ts", "utf8"), /if \(session\.metadata\?\.kind === "premium_pass"\) await passExpired\(session\);/);
  // A pass holder is paying: no second pass, no free-week checkout on top.
  assert.match(readFileSync("src/lib/premium-free-week-server.ts", "utf8"), /pass:u:\$\{user\.id\}/);
});
