import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { premiumPlusEnabled, tierFromPriceId, priceIdFor } from "@/lib/premium";

export const dynamic = "force-dynamic";

// One-click "switch my Plus subscription to Premium", same interval. Template
// is switch-to-annual/route.ts's own subscriptions.update, with a price-id
// guard instead of an interval guard (there's no interval change here at all —
// only the price/product changes). always_invoice bills the prorated
// difference now and unlocks the four pro tools immediately; entitlement then
// re-stamps itself the usual way — the resulting customer.subscription.updated
// hits the webhook's stampFromSubscription, which reads the new price and
// writes the new tier. Nothing to hand-sync here beyond the Stripe call.
//
// No downgrade route exists (Premium → Plus): that's a cancel-and-resubscribe,
// or the Stripe billing portal if the owner enables plan switching there —
// either way the webhook already records whatever tier results.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!premiumPlusEnabled()) {
    return NextResponse.json({ error: "Upgrading isn't configured yet" }, { status: 503 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } });
  if (!dbUser?.stripeCustomerId) {
    return NextResponse.json({ error: "No subscription found on this account" }, { status: 400 });
  }

  try {
    const subs = await stripe().subscriptions.list({
      customer: dbUser.stripeCustomerId,
      status: "active",
      limit: 1,
      expand: ["data.items.data.price"],
    });
    const sub = subs.data[0];
    if (!sub) return NextResponse.json({ error: "No active subscription to upgrade" }, { status: 400 });

    const item = sub.items.data[0];
    const price = item?.price as Stripe.Price | undefined;
    if (!item || !price) return NextResponse.json({ error: "Subscription has no line item to update" }, { status: 400 });

    // Idempotency guard is on TIER, resolved from the live price — not on
    // interval, which doesn't change here at all.
    if (tierFromPriceId(price.id) === "premium") {
      // Already Premium (or grandfathered) — nothing to do, and definitely
      // don't double-charge.
      return NextResponse.json({ ok: true, already: true });
    }
    const interval = price.recurring?.interval === "year" ? "annual" : "monthly";
    const targetPriceId = priceIdFor("premium", interval);

    await stripe().subscriptions.update(sub.id, {
      items: [{ id: item.id, price: targetPriceId }],
      // Bill the difference now (crediting the unused part of the current
      // period) rather than deferring — the four pro tools should unlock the
      // moment the upgrade is confirmed, not at the next renewal.
      proration_behavior: "always_invoice",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("premium tier upgrade failed:", e);
    return NextResponse.json(
      { error: "Couldn't upgrade — you can also change it from the billing portal, or contact us." },
      { status: 500 },
    );
  }
}
