/**
 * Test-mode-only: creates a throwaway Express Connect account (AU, "recipient"
 * n/a since AU uses the full service agreement), fetches an onboarding link,
 * then deletes the test account — proving lib/connect.ts's core Stripe API
 * calls actually work against these credentials, without leaving any test
 * data behind. Only ever run this when STRIPE_SECRET_KEY is confirmed
 * sk_test_... (see test-stripe-mode.ts) — never against live mode.
 */
import Stripe from "stripe";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) {
    console.error("Refusing to run — STRIPE_SECRET_KEY is not a test-mode key.");
    process.exit(1);
  }
  const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });

  console.log("Creating a throwaway test Express account (AU)...");
  const account = await stripe.accounts.create({
    type: "express",
    country: "AU",
    capabilities: { transfers: { requested: true } },
    business_type: "individual",
    // Matches lib/connect.ts's accountParamsFor() exactly (recipient agreement
    // for every country — see that file's comment for why).
    tos_acceptance: { service_agreement: "recipient" },
    email: `rc-smoke-test-${Date.now()}@example.com`,
  });
  console.log(`Created ${account.id} — payouts_enabled=${account.payouts_enabled}`);

  console.log("Requesting an onboarding link...");
  const link = await stripe.accountLinks.create({
    account: account.id,
    type: "account_onboarding",
    refresh_url: "https://riftcompare.com/marketplace/sell?connect=refresh",
    return_url: "https://riftcompare.com/marketplace/sell?connect=return",
  });
  console.log(`Onboarding link created: ${link.url ? "yes (URL present)" : "MISSING URL — problem"}`);
  if (!link.url) process.exitCode = 1;

  console.log(`Deleting test account ${account.id}...`);
  await stripe.accounts.del(account.id);
  console.log("Deleted — no test data left behind.");
}

main().catch((e) => {
  console.error("Stripe Connect smoke test FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
