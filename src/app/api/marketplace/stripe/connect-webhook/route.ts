import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { releaseFundsForOrder } from "@/lib/connect";

export const dynamic = "force-dynamic";
// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = "nodejs";

// Separate webhook + secret from the main checkout one — Connect account events
// (`account.updated`) come from a distinct Stripe webhook endpoint config, since
// they're about connected accounts rather than the platform's own charges.
const CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "";

export async function POST(req: Request) {
  if (!stripeEnabled() || !CONNECT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Connect webhook not configured" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, CONNECT_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const payoutsEnabled = !!account.payouts_enabled;
      const profile = await prisma.sellerProfile.findFirst({
        where: { stripeAccountId: account.id },
        select: { userId: true, payoutsEnabled: true },
      });
      if (profile) {
        await prisma.sellerProfile.update({ where: { userId: profile.userId }, data: { payoutsEnabled } });

        // Payouts just went from off to on — a seller can sell before finishing
        // Connect onboarding (see api/marketplace/listings + stripe/checkout), so
        // there may be COMPLETED orders whose releaseFundsForOrder() call already
        // no-op'd for lack of a payable account. Catch those up now instead of
        // leaving them stuck until a support ticket surfaces it.
        if (payoutsEnabled && !profile.payoutsEnabled) {
          const stuck = await prisma.order.findMany({
            where: { sellerId: profile.userId, kind: "MARKETPLACE", status: "COMPLETED", stripeTransferId: null },
            select: { id: true },
            take: 200,
          });
          for (const o of stuck) await releaseFundsForOrder(o.id).catch(() => {});
        }
      }
    }
  } catch {
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
