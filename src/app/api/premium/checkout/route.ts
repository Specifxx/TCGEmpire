import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { premiumCheckoutEnabled, PREMIUM_PRICE_ID } from "@/lib/premium";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// Start a RiftCompare Premium subscription via Stripe's hosted Checkout.
// Entitlement is granted by the webhook (invoice.paid → premiumUntil = period
// end), so a user is only ever premium for time that's actually been paid.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!premiumCheckoutEnabled()) {
    return NextResponse.json({ error: "Premium checkout isn't configured yet" }, { status: 503 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true, email: true },
  });

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PREMIUM_PRICE_ID, quantity: 1 }],
      // Reuse the Stripe customer when we have one, so renewals stay linked.
      ...(dbUser?.stripeCustomerId
        ? { customer: dbUser.stripeCustomerId }
        : { customer_email: dbUser?.email }),
      client_reference_id: user.id,
      metadata: { kind: "premium", userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
      success_url: `${SITE_URL}/portfolio?upgraded=1`,
      cancel_url: `${SITE_URL}/premium`,
      allow_promotion_codes: true,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("premium checkout failed:", e);
    return NextResponse.json({ error: "Couldn't start checkout — try again" }, { status: 500 });
  }
}
