/**
 * Live-mode-only: creates a throwaway Express Connect account (AU, matching
 * lib/connect.ts's accountParamsFor), fetches an onboarding link, then deletes
 * the account — proving the exact same Stripe API calls
 * /api/marketplace/stripe/connect makes actually succeed against the live
 * platform account. No money moves and nothing is left behind; this is the
 * live-mode counterpart to test-stripe-connect-account.ts (which refuses to
 * run against anything but a test key) — only run this to diagnose a real
 * "couldn't reach Stripe" failure sellers are hitting in production.
 */
import Stripe from "stripe";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_live_")) {
    console.error("Refusing to run — STRIPE_SECRET_KEY is not a live-mode key.");
    process.exit(1);
  }
  const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });

  console.log("Creating a throwaway LIVE Express account (AU, individual, transfers+card_payments requested)...");
  const account = await stripe.accounts.create({
    type: "express",
    country: "AU",
    // Matches lib/connect.ts's accountParamsFor("AU") exactly. Same-country
    // (AU platform, AU account) can't use the recipient agreement (Stripe
    // rejects it outright), so this uses the full agreement — and requests
    // card_payments alongside transfers (never actually used) specifically to
    // avoid the "transfers without card_payments needs platform approval"
    // wall. See lib/connect.ts's comment for both confirmed failure modes.
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    business_type: "individual",
    email: `rc-live-smoke-test-${Date.now()}@example.com`,
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
  console.log("Deleted — no live data left behind.");
}

main().catch((e) => {
  console.error("LIVE Stripe Connect smoke test FAILED:", e instanceof Error ? e.message : e);
  if (e && typeof e === "object") {
    // Stripe errors carry a machine-readable `code`/`type` and often a `param` —
    // print the full object so the actual actionable reason (not just the
    // human message) shows up in the CI log.
    console.error("Full error object:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
  }
  process.exitCode = 1;
});
