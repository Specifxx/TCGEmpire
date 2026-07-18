import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, stripeEnabled } from "@/lib/stripe";

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
      await prisma.sellerProfile.updateMany({
        where: { stripeAccountId: account.id },
        data: { payoutsEnabled: !!account.payouts_enabled },
      });
    }
  } catch {
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
