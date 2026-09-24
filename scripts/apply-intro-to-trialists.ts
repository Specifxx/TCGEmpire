/**
 * Give the half-price intro to trials that started BEFORE the offer existed.
 * Owner, 2026-09-24: "The one person yes we'll give them a cheaper price" —
 * the one 14-day trialist still set to renew (converts about 10-04), who would
 * otherwise pay $9.99 while anyone starting that day pays $4.99. DECISIONS.md,
 * "Trial cancellations: keep, remind, tell the truth", 2026-09-24.
 *
 * Selects exactly: a TRIALING subscription, renewal ON, no discount yet, a
 * monthly price, a customer who has never paid, a trial that began before the
 * intro launched (2026-09-25). Cancelled trials are left alone: they get the
 * intro when they click Keep (api/premium/resume), which is their choice.
 *
 * REPORT ONLY unless --apply. The write is one subscriptions.update per match:
 * discounts [intro coupon] + metadata introGrantedAt. The coupon's 3 months
 * count from now, which covers the first three charges after the trial.
 * Anonymised output — no email or customer id in the CI log.
 */
import type Stripe from "stripe";
import { stripe, stripeEnabled } from "../src/lib/stripe";
import { ensureIntroCoupon, hasEverPaid, subscriptionIsCancelling, tierFromPriceId } from "../src/lib/premium";

const INTRO_LAUNCH = Date.parse("2026-09-25T00:00:00Z");
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!stripeEnabled()) {
    console.log("Stripe is not configured — nothing to do.");
    return;
  }
  const subs = await stripe().subscriptions.list({ status: "trialing", limit: 100, expand: ["data.items.data.price"] });
  let matched = 0;
  for (const sub of subs.data) {
    const price = sub.items.data[0]?.price as Stripe.Price | undefined;
    const started = (sub.trial_start ?? sub.created) * 1000;
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const why = !price?.id
      ? "no price"
      : price.recurring?.interval !== "month"
      ? "not monthly"
      : subscriptionIsCancelling(sub)
      ? "renewal off (gets the intro via Keep)"
      : sub.discount
      ? "already discounted"
      : started >= INTRO_LAUNCH
      ? "started under the intro"
      : (await hasEverPaid(customer))
      ? "has paid before"
      : null;
    const label = `trial ${new Date(started).toISOString().slice(0, 10)} → ${sub.trial_end ? new Date(sub.trial_end * 1000).toISOString().slice(0, 10) : "?"} · ${tierFromPriceId(price?.id)}/${price?.recurring?.interval ?? "?"}`;
    if (why) {
      console.log(`skip   ${label} — ${why}`);
      continue;
    }
    matched++;
    const tier = tierFromPriceId(price!.id);
    const coupon = await ensureIntroCoupon(tier, price!.id);
    if (!APPLY) {
      console.log(`WOULD  ${label} — attach ${coupon}`);
      continue;
    }
    await stripe().subscriptions.update(sub.id, {
      discounts: [{ coupon }],
      metadata: { introGrantedAt: new Date().toISOString(), introGrantedVia: "owner-2026-09-24" },
    });
    const after = await stripe().subscriptions.retrieve(sub.id);
    console.log(`APPLIED ${label} — ${after.discount?.coupon?.id ?? "NO DISCOUNT?!"} (${after.discount?.coupon?.amount_off} off until ${after.discount?.end ? new Date(after.discount.end * 1000).toISOString().slice(0, 10) : "?"})`);
  }
  console.log(`\n${matched} matching trial(s). ${APPLY ? "Applied." : "Report only — re-run with apply to write."}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
