/**
 * ONE-OFF diagnostic (not wired into maintenance.yml) — tests whether Stripe's
 * newer "controller" account-configuration model (replacing type: "express" +
 * tos_acceptance.service_agreement) lets a same-country (AU platform, AU
 * seller) individual account request ONLY the transfers capability without
 * hitting either wall we've hit so far:
 *   1. tos_acceptance.service_agreement: "recipient" rejected outright for
 *      same-country accounts.
 *   2. Full agreement + transfers-only (no card_payments) needs manual
 *      platform approval.
 * If this works, transfers-only AU onboarding stays lean (no card_payments-
 * driven business/MCC questions). Creates and immediately deletes a
 * throwaway live account — no money moves, nothing left behind.
 */
import Stripe from "stripe";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_live_")) {
    console.error("Refusing to run — STRIPE_SECRET_KEY is not a live-mode key.");
    process.exit(1);
  }
  const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });

  console.log("Creating a throwaway LIVE Express account (AU, controller model, transfers-only)...");
  const account = await stripe.accounts.create({
    country: "AU",
    email: `rc-controller-test-${Date.now()}@example.com`,
    business_type: "individual",
    capabilities: { transfers: { requested: true } },
    controller: {
      fees: { payer: "application" },
      losses: { payments: "application" },
      stripe_dashboard: { type: "express" },
    },
  } as Stripe.AccountCreateParams);
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
  console.error("Controller-model smoke test FAILED:", e instanceof Error ? e.message : e);
  if (e && typeof e === "object") {
    console.error("Full error object:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
  }
  process.exitCode = 1;
});
