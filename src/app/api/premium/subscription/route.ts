import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { premiumAnnualEnabled } from "@/lib/premium";

export const dynamic = "force-dynamic";

// The current user's LIVE subscription shape, for the in-app annual-switch nudge
// (AnnualSwitchNudge). Only ever consulted for a Premium user, so it stays cheap:
// one Stripe read, and only when the client already knows they're Premium.
//
// Returns interval:null for anyone with no active (paying) subscription — a
// trialing user has not paid yet and must not be pushed to switch, so 'trialing'
// is deliberately not treated as active here.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ interval: null }, { headers: { "Cache-Control": "no-store" } });

  if (!stripeEnabled()) return NextResponse.json({ interval: null }, { headers: { "Cache-Control": "no-store" } });

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } });
  if (!dbUser?.stripeCustomerId) {
    return NextResponse.json({ interval: null }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const subs = await stripe().subscriptions.list({
      customer: dbUser.stripeCustomerId,
      status: "active",
      limit: 1,
      expand: ["data.items.data.price"],
    });
    const sub = subs.data[0];
    if (!sub) return NextResponse.json({ interval: null }, { headers: { "Cache-Control": "no-store" } });

    const price = sub.items.data[0]?.price as Stripe.Price | undefined;
    const interval = price?.recurring?.interval ?? null; // "month" | "year"
    const monthsActive = Math.floor((Date.now() - sub.created * 1000) / (30 * 86_400_000));

    return NextResponse.json(
      { interval, monthsActive, annualAvailable: premiumAnnualEnabled() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("premium subscription read failed:", e);
    return NextResponse.json({ interval: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
