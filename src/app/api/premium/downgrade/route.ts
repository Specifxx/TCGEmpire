import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { premiumPlusEnabled, tierFromPriceId, priceIdFor } from "@/lib/premium";

export const dynamic = "force-dynamic";

// Premium → Plus, same interval. The mirror image of api/premium/upgrade, and
// the same one-call shape: swap the subscription item's price, let the
// resulting customer.subscription.updated re-stamp the tier through the
// webhook's own price→tier resolution. Nothing to hand-sync here either.
//
// PRORATION IS A CREDIT, NOT AN INVOICE — the one real difference from the
// upgrade route. `create_prorations` credits the unused part of the Premium
// period and applies it against the NEXT invoice; it never charges anything
// now and never refunds cash. The upgrade route uses `always_invoice`
// instead because there the proration is money OWED, and billing it
// immediately is what unlocks the tools immediately.
//
// The switch takes effect NOW, not at period end: the customer moves to Plus
// straight away and is credited for the Premium time they'd already paid for.
// The alternative — deferring to period end via a subscription schedule — keeps
// their Premium access until it lapses, but needs a multi-phase schedule this
// route deliberately doesn't reach for. The UI states which of the two happens
// (see SubscriptionActions), because "what happens to the rest of the month I
// paid for" is exactly the question a downgrade button has to answer up front.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!premiumPlusEnabled()) {
    return NextResponse.json({ error: "There's no cheaper plan configured to move to" }, { status: 503 });
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
    if (!sub) return NextResponse.json({ error: "No active subscription to change" }, { status: 400 });

    const item = sub.items.data[0];
    const price = item?.price as Stripe.Price | undefined;
    if (!item || !price) return NextResponse.json({ error: "Subscription has no line item to update" }, { status: 400 });

    // Idempotency guard is on TIER, resolved from the live price — same as the
    // upgrade route's, and for the same reason: the interval doesn't change
    // here, so an interval check would tell us nothing.
    if (tierFromPriceId(price.id) === "plus") {
      return NextResponse.json({ ok: true, already: true });
    }
    const interval = price.recurring?.interval === "year" ? "annual" : "monthly";
    const targetPriceId = priceIdFor("plus", interval);

    await stripe().subscriptions.update(sub.id, {
      items: [{ id: item.id, price: targetPriceId }],
      proration_behavior: "create_prorations",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("premium tier downgrade failed:", e);
    return NextResponse.json(
      { error: "Couldn't change your plan — you can also change it from the billing portal, or contact us." },
      { status: 500 },
    );
  }
}
