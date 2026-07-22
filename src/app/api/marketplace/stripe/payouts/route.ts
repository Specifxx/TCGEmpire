import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripeEnabled } from "@/lib/stripe";
import { listPayouts } from "@/lib/connect";

export const dynamic = "force-dynamic";

// The seller's real payout history (pending/in_transit/paid/failed/canceled),
// read live from Stripe — this is what drives "expected date of payout" and
// the sent/pending/successful status list, not something we compute ourselves.
export async function GET() {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payouts aren't enabled yet" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
    select: { stripeAccountId: true, payoutsEnabled: true },
  });
  if (!profile?.payoutsEnabled || !profile.stripeAccountId) {
    return NextResponse.json({ payouts: [] });
  }

  try {
    const payouts = await listPayouts(profile.stripeAccountId, 15);
    return NextResponse.json({ payouts });
  } catch (e) {
    console.error("[stripe/payouts] failed:", e);
    return NextResponse.json({ error: "Couldn't reach Stripe — try again shortly" }, { status: 502 });
  }
}
