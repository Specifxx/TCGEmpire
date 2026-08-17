import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

// Comments are STRIPPED before any of these assertions run. These files document
// themselves heavily — including quoting the very code shapes being banned — so a
// naive grep matches the explanation of a bug as readily as the bug, and would
// pass or fail for the wrong reason. Only executable source is examined.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const read = (p: string) => stripComments(readFileSync(join(ROOT, p), "utf8"));

const connect = read("src/lib/connect.ts");
const orderActions = read("src/lib/order-actions.ts");
const maintenance = read("src/app/api/cron/marketplace-maintenance/route.ts");

const fnBody = (src: string, decl: string) => {
  const start = src.indexOf(decl);
  assert.ok(start >= 0, `${decl} not found`);
  const rest = src.slice(start);
  // Up to the next top-level `export ` declaration, which is where the next
  // function begins in both of these files.
  const end = rest.indexOf("\nexport ", 1);
  return end === -1 ? rest : rest.slice(0, end);
};

/** The balanced `{…}` block starting at the first `{` after `label`. */
const blockAfter = (src: string, label: string) => {
  const at = src.indexOf(label);
  assert.ok(at >= 0, `${label} not found`);
  const open = src.indexOf("{", at);
  assert.ok(open >= 0, `no block after ${label}`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  assert.fail(`unbalanced block after ${label}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// A refund must never reach past the order it is refunding.
// ─────────────────────────────────────────────────────────────────────────────
// One checkout creates one Order row per listing LINE and can span SEVERAL
// SELLERS, and every one of those rows shares a single PaymentIntent (see
// markPaid() in marketplace/stripe/webhook/route.ts, which stamps the same `pi`
// on all of them via updateMany). orders/route.ts's groupKey is
// `stripeSessionId:sellerId` — a "group" is ONE SELLER'S SLICE of a cart, never
// the whole cart.
//
// So no caller of refundOrder() is cancelling a whole charge:
//   • the ship-deadline cron picks individual PAID rows whose own seller never
//     shipped, so a cart where seller A shipped and seller B didn't reaches it
//     for B's row alone;
//   • mutual cancellation is agreed between the buyer and ONE seller.
//
// refundOrder() used to call `refunds.create({ payment_intent })` with no
// amount, which refunds the whole remaining charge. That handed back seller A's
// money too while A's order stayed SHIPPED and went on to auto-release funds to
// A on schedule — the platform paying A out of its own balance and the buyer
// keeping A's cards for free. Nothing at runtime catches it: Stripe is perfectly
// happy to refund a charge in full, and the orders left behind look normal.
//
// The rule these tests pin: EVERY refund call site passes an explicit `amount`.

test("refundOrder refunds this order's own total, never the whole PaymentIntent", () => {
  const body = fnBody(connect, "export async function refundOrder(");
  const call = /refunds\.create\(\{([^}]*)\}/.exec(body);
  assert.ok(call, "refundOrder no longer calls refunds.create — update this test");
  assert.match(
    call[1],
    /amount:\s*order\.totalCents/,
    "refundOrder must pass an explicit amount; an unqualified payment_intent refund " +
      "claws back other sellers' money from the same cart"
  );
});

test("every refunds.create in connect.ts is amount-scoped", () => {
  const calls = [...connect.matchAll(/refunds\.create\(\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(calls.length >= 2, "expected at least refundOrder + refundOrderBySeller");
  for (const args of calls) {
    assert.match(args, /amount:/, `unscoped refund found: refunds.create({${args}})`);
  }
});

test("refundOrder no longer relies on sibling detection to avoid double-refunding", () => {
  const body = fnBody(connect, "export async function refundOrder(");
  assert.doesNotMatch(
    body,
    /alreadyRefundedSibling/,
    "the sibling short-circuit existed only because the refund was charge-wide. " +
      "With a per-order amount each row refunds its own slice and the slices sum " +
      "to the charge, so skipping a sibling's refund would now UNDER-refund the buyer"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// A cancellation request is not instantaneous, so its state must be re-checked.
// ─────────────────────────────────────────────────────────────────────────────
// requestCancelOrder() only admits PAID and SHIPPED orders. But the request then
// SITS PENDING until the other party answers, and the order moves underneath it:
// autoReleaseShipped() completes SHIPPED orders on a fixed schedule and transfers
// the money to the seller.
//
// respondCancelOrder() had no status check at all, and accept-cancel calls
// refundOrder() — the PRE-TRANSFER refund path, which reverses nothing. So
// accepting a stale request on an already-released order refunded the buyer while
// the seller kept the payout, and the platform covered both sides.
//
// Closed from both ends: the responder re-checks status, and the cron leaves an
// order alone while a cancellation is pending on it.

for (const fn of ["respondCancelOrder", "respondCancelGroup"]) {
  test(`${fn} re-checks order status before accepting a cancellation`, () => {
    const body = fnBody(orderActions, `export async function ${fn}(`);
    assert.match(
      body,
      /status !== "PAID"[\s\S]{0,120}status !== "SHIPPED"/,
      `${fn} must refuse a stale request — accepting one on a COMPLETED order ` +
        `refunds the buyer without reversing the seller's payout`
    );
    // The guard has to come before the refund, not after it.
    const guardAt = body.search(/status !== "PAID"/);
    const refundAt = body.search(/refundOrder\(/);
    assert.ok(guardAt >= 0 && refundAt >= 0, "expected both a status guard and a refund call");
    assert.ok(guardAt < refundAt, `${fn} checks status AFTER refunding — the money has already moved`);
  });
}

test("auto-release skips orders with a pending cancellation", () => {
  const body = fnBody(maintenance, "async function autoReleaseShipped(");
  const where = blockAfter(body, "where:");
  assert.match(
    where,
    /cancelRequestedAt:\s*null/,
    "releasing funds mid-negotiation means a later acceptance refunds the buyer " +
      "out of the platform's balance — pause release like disputedAt already does"
  );
  // disputedAt is the precedent this mirrors; if it ever goes, this test should
  // be re-derived rather than silently left half-true.
  assert.match(where, /disputedAt:\s*null/);
  assert.match(where, /status:\s*"SHIPPED"/);
});
