/**
 * Proves a webhook secret actually matches what the live endpoint expects,
 * WITHOUT needing Stripe to send a real event: computes a genuine Stripe
 * webhook signature ourselves (the same HMAC-SHA256(secret, `${t}.${payload}`)
 * scheme Stripe uses) and POSTs a synthetic event straight to the live route.
 *
 * Both test events reference IDs that don't exist in the database, so each
 * handler's lookup matches zero rows and no-ops — completely safe to run
 * against production.
 *
 * Usage: npx tsx scripts/test-stripe-webhook-signature.ts <main|connect>
 */
import { createHmac } from "node:crypto";

const target = process.argv[2];
if (target !== "main" && target !== "connect") {
  console.error('Usage: test-stripe-webhook-signature.ts <main|connect>');
  process.exit(1);
}

const CONFIG = {
  main: {
    url: "https://riftcompare.com/api/marketplace/stripe/webhook",
    secretEnv: "STRIPE_WEBHOOK_SECRET",
    event: {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_smoketest_nonexistent",
          object: "checkout.session",
          payment_intent: "pi_test_smoketest_nonexistent",
          metadata: { orderIds: "rc-smoke-test-nonexistent-order-id", kind: "MARKETPLACE" },
        },
      },
    },
  },
  connect: {
    url: "https://riftcompare.com/api/marketplace/stripe/connect-webhook",
    secretEnv: "STRIPE_CONNECT_WEBHOOK_SECRET",
    event: {
      type: "account.updated",
      data: {
        object: {
          id: "acct_smoketest_nonexistent",
          object: "account",
          payouts_enabled: false,
        },
      },
    },
  },
} as const;

async function main() {
  const cfg = CONFIG[target as "main" | "connect"];
  const secret = process.env[cfg.secretEnv] ?? "";
  if (!secret) {
    console.error(`${cfg.secretEnv} is not set as a GitHub Actions secret.`);
    process.exit(1);
  }

  const payload = JSON.stringify({
    id: `evt_rc_smoketest_${Date.now()}`,
    object: "event",
    api_version: "2025-02-24.acacia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    ...cfg.event,
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const header = `t=${timestamp},v1=${signature}`;

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": header },
    body: payload,
  });
  const text = await res.text();
  console.log(`[${target}] HTTP ${res.status}: ${text}`);

  if (!res.ok) {
    console.error(`[${target}] Signature was rejected — ${cfg.secretEnv} likely doesn't match the live endpoint's configured secret.`);
    process.exit(1);
  }
  console.log(`[${target}] Signature accepted — ${cfg.secretEnv} is correctly configured and the route processed a (harmless, nonexistent-ID) event successfully.`);
}

main().catch((e) => {
  console.error(`[${target}] Webhook signature test FAILED:`, e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
