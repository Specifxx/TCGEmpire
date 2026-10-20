import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCheckoutSessionParams } from "../src/lib/checkout-params";

// Premium without signing in first (2026-10-20). DECISIONS.md, "Premium without
// signing in first".
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const base = { email: null, stripeCustomerId: null, tier: "premium" as const, plan: "monthly" as const, priceId: "price_x", currency: "usd", trial: null, coupon: null };

test("a guest session carries guest:1 and no user id; a signed-in one is unchanged", () => {
  const g = buildCheckoutSessionParams({ ...base, userId: null });
  assert.equal(g.metadata?.guest, "1");
  assert.equal(g.metadata?.userId, undefined);
  assert.equal(g.client_reference_id, undefined);
  assert.equal((g.subscription_data?.metadata as Record<string, string>).guest, "1");
  assert.equal(g.customer_email, undefined, "Stripe collects the email itself");
  const u = buildCheckoutSessionParams({ ...base, userId: "u1", email: "a@b.co" });
  assert.equal(u.metadata?.userId, "u1");
  assert.equal(u.client_reference_id, "u1");
  assert.equal(u.customer_email, "a@b.co");
});

test("the route lets a signed-out visitor through; the webhook resolves the account by email", () => {
  const route = read("src/app/api/premium/checkout/route.ts");
  assert.doesNotMatch(route, /if \(!user\) return NextResponse\.json\(\{ error: "Sign in first" \}/);
  const hook = read("src/app/api/marketplace/stripe/webhook/route.ts");
  assert.match(hook, /session\.metadata\?\.guest === "1"/);
  assert.match(hook, /guestAccountFor\(session\.customer_details\?\.email/);
  assert.match(hook, /subscriptions\.update\(guestSubId, \{ metadata: \{ userId \} \}\)/, "renewals resolve the account directly");
});

test("a guest checkout never creates an admin-address account", () => {
  const lib = read("src/lib/guest-checkout.ts");
  assert.ok(lib.indexOf("isAdminEmail(email)") < lib.indexOf("prisma.user.create"));
  assert.match(lib, /signupSource: "guest_checkout"/);
});
