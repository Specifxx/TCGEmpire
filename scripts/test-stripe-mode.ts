/**
 * One-off diagnostic: reports whether STRIPE_SECRET_KEY is a test key
 * (sk_test_...) or a live key (sk_live_...), without making any API call —
 * this alone determines whether it's safe to run a real Connect account
 * create/delete round-trip (test mode only; never touch live-mode Connect
 * accounts from an automated test).
 *
 * Writes `mode=test` | `mode=live` to $GITHUB_OUTPUT so later workflow steps
 * can branch on it. Exits 1 (loud failure) if the key is missing entirely.
 */
import { appendFileSync } from "node:fs";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set (checked as a GitHub Actions secret — it may only be configured in Vercel, which this CI job can't see).");
  process.exitCode = 1;
} else if (key.startsWith("sk_test_")) {
  console.log("STRIPE_SECRET_KEY is a TEST-mode key (sk_test_...).");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "mode=test\n");
} else if (key.startsWith("sk_live_")) {
  console.log("STRIPE_SECRET_KEY is a LIVE-mode key (sk_live_...) — skipping any test that would create real Connect objects.");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "mode=live\n");
} else {
  console.error(`STRIPE_SECRET_KEY doesn't look like a real Stripe secret key (got a value starting with "${key.slice(0, 8)}...").`);
  process.exitCode = 1;
}
