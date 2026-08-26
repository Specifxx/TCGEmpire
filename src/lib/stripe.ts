// Stripe (plain Checkout) — the foundation Premium subscriptions are built on. The
// buyer pays the platform account via a hosted Checkout Session; the subscription
// webhook (api/marketplace/stripe/webhook — kept at that path, see its own note)
// stamps entitlement. The P2P marketplace this module used to also serve was
// removed (2026-08), along with its Connect payouts (lib/connect.ts) and stock
// reservations.
//
// INERT until STRIPE_SECRET_KEY is set — callers check `stripeEnabled()`.
import Stripe from "stripe";

const SECRET = process.env.STRIPE_SECRET_KEY ?? "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!SECRET) throw new Error("Stripe is not configured");
  if (!_stripe) _stripe = new Stripe(SECRET, { apiVersion: "2025-02-24.acacia" });
  return _stripe;
}

export function stripeEnabled(): boolean {
  return Boolean(SECRET);
}
