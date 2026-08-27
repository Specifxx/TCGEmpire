import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { premiumAnnualEnabled, PREMIUM_ANNUAL_PRICE_ID } from "@/lib/premium";

export const dynamic = "force-dynamic";

// One-click "switch my monthly Premium to annual". Annual up-front is the single
// biggest churn lever on a small-ticket consumer sub — it defers the cancel
// decision 12 months — so this makes taking it frictionless.
//
// Upgrades the live subscription's price to the yearly one with
// proration_behavior:"always_invoice": Stripe bills the annual amount now, CREDITS
// the unused part of the current month, and renews a year out. Entitlement then
// re-stamps itself the usual way — the resulting invoice.paid hits the webhook,
// which sets premiumUntil to the new (yearly) period end. Nothing to hand-sync.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!premiumAnnualEnabled()) {
    return NextResponse.json({ error: "Annual billing isn't configured" }, { status: 503 });
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
    if (!sub) return NextResponse.json({ error: "No active subscription to switch" }, { status: 400 });

    const item = sub.items.data[0];
    const price = item?.price as Stripe.Price | undefined;
    if (price?.recurring?.interval === "year") {
      // Already annual — nothing to do, and definitely don't double-charge.
      return NextResponse.json({ ok: true, already: true });
    }
    if (!item) return NextResponse.json({ error: "Subscription has no line item to update" }, { status: 400 });

    await stripe().subscriptions.update(sub.id, {
      items: [{ id: item.id, price: PREMIUM_ANNUAL_PRICE_ID }],
      // Bill the annual now (crediting the unused part of the current month) and
      // start the yearly term today, rather than deferring the charge.
      proration_behavior: "always_invoice",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("switch-to-annual failed:", e);
    return NextResponse.json(
      { error: "Couldn't switch your plan — you can also change it from the billing portal, or contact us." },
      { status: 500 },
    );
  }
}
