/**
 * Create (if missing) and verify the Stripe coupons behind "first 3 months
 * half price" — one per configured MONTHLY price. DECISIONS.md, "Trial model:
 * 3-day trial, then the first 3 months half price", 2026-09-24.
 *
 * The checkout route creates the coupon on first use anyway; this runs it
 * ahead of time so (1) the first buyer never waits on it, and (2) a key that
 * is not allowed to write coupons shows up here, in CI, rather than as a
 * checkout quietly falling back to full price.
 *
 * Writes to Stripe: at most one coupon per monthly price, only when missing.
 * Idempotent — the coupon id encodes the amount, so reruns are no-ops.
 */
import { stripe, stripeEnabled } from "../src/lib/stripe";
import { ensureIntroCoupon, PREMIUM_PRICE_ID, PLUS_PRICE_ID, type PremiumTier } from "../src/lib/premium";
import { INTRO_MONTHS, PREMIUM_PRICE_AMOUNT, PLUS_PRICE_AMOUNT, premiumMoneyNum } from "../src/lib/site";

// The price ids are Vercel env vars and may not be in this CI job. Without
// them, find the active monthly prices in Stripe whose amount matches what the
// site displays for each tier — the same display-equals-Price invariant the
// whole pricing block rests on (lib/site.ts).
async function monthlyPrices(): Promise<{ tier: PremiumTier; priceId: string }[]> {
  if (PREMIUM_PRICE_ID) {
    return [
      { tier: "premium", priceId: PREMIUM_PRICE_ID },
      ...(PLUS_PRICE_ID ? [{ tier: "plus" as const, priceId: PLUS_PRICE_ID }] : []),
    ];
  }
  const want: [PremiumTier, number][] = [
    ["premium", Math.round(premiumMoneyNum(PREMIUM_PRICE_AMOUNT) * 100)],
    ["plus", Math.round(premiumMoneyNum(PLUS_PRICE_AMOUNT) * 100)],
  ];
  const prices = await stripe().prices.list({ active: true, type: "recurring", limit: 100 });
  const out: { tier: PremiumTier; priceId: string }[] = [];
  for (const [tier, cents] of want) {
    const hits = prices.data.filter((p) => p.recurring?.interval === "month" && p.unit_amount === cents);
    if (hits.length !== 1) {
      console.log(`${tier}: ${hits.length} active monthly prices at ${cents} cents — set STRIPE_${tier.toUpperCase()}_PRICE_ID to disambiguate. Skipped.`);
      continue;
    }
    out.push({ tier, priceId: hits[0].id });
  }
  return out;
}

async function main() {
  if (!stripeEnabled()) {
    console.log("Stripe is not configured — nothing to do.");
    return;
  }
  const targets = await monthlyPrices();
  if (!targets.length) throw new Error("No monthly Premium/Plus price found");
  for (const { tier, priceId } of targets) {
    const id = await ensureIntroCoupon(tier, priceId);
    const c = await stripe().coupons.retrieve(id);
    const price = await stripe().prices.retrieve(priceId);
    const charged = (price.unit_amount ?? 0) - (c.amount_off ?? 0);
    console.log(
      `${tier}: coupon ${c.id} — ${c.amount_off} ${c.currency?.toUpperCase()} off for ${c.duration_in_months} months (${c.duration}), valid=${c.valid}. ` +
        `Monthly price ${(price.unit_amount ?? 0) / 100} → first ${INTRO_MONTHS} invoices ${charged / 100} ${price.currency.toUpperCase()}.`,
    );
    if (!c.valid) throw new Error(`${c.id} is not valid`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
