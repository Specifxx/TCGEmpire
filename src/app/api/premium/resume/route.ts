import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { ensureIntroCoupon, hasEverPaid, subscriptionIsCancelling, tierFromPriceId } from "@/lib/premium";
import { introOfferEnabled } from "@/lib/site";

export const dynamic = "force-dynamic";

// "Keep Premium" — turn renewal back ON for a subscription that is set to end.
// DECISIONS.md, "Trial cancellations: keep, remind, tell the truth", 2026-09-24.
//
// Most trial cancels were renewal switched off in the first hour "to be safe"
// ("I prefer to manually renew"), and the app had no way back: nothing in src
// ever set cancel_at_period_end:false. This clears the cancellation and
// nothing else. The trial end and the next charge date are unchanged, and
// nothing is charged now.
//
// POST only, from the signed-in owner, on their own Stripe customer. A GET does
// nothing (405 by omission): mail scanners prefetch links, and the trial email
// links to /premium?keep=1, where this is one deliberate click.
//
// Intro offer: keeping must never be worse than letting the trial lapse and
// buying again at half price, so a monthly subscription with no discount on a
// never-paid account gets the intro coupon in the SAME update — checkout's
// rule exactly (lib/site.ts intro block).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } });
  if (!dbUser?.stripeCustomerId) {
    return NextResponse.json({ error: "No subscription found on this account" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const keptFrom = body?.from === "email" ? "email" : "card";

  try {
    const subs = await stripe().subscriptions.list({
      customer: dbUser.stripeCustomerId,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price"],
    });
    const live = subs.data.filter((s) => s.status === "trialing" || s.status === "active" || s.status === "past_due");
    const sub = live.find((s) => subscriptionIsCancelling(s));
    if (!sub) {
      if (live.length) return NextResponse.json({ ok: true, already: true });
      return NextResponse.json(
        { error: "This subscription has already ended — start a new one from /premium." },
        { status: 400 },
      );
    }

    const price = sub.items.data[0]?.price as Stripe.Price | undefined;
    const params: Stripe.SubscriptionUpdateParams = {
      cancel_at_period_end: false,
      ...(sub.cancel_at != null ? { cancel_at: "" } : {}),
      metadata: { keptAt: new Date().toISOString(), keptVia: "resume", keptFrom },
    };
    if (
      introOfferEnabled() &&
      price?.id &&
      price.recurring?.interval === "month" &&
      !sub.discount &&
      !(await hasEverPaid(dbUser.stripeCustomerId))
    ) {
      const coupon = await ensureIntroCoupon(tierFromPriceId(price.id), price.id).catch((e) => {
        console.error("resume: intro coupon unavailable — keeping at the full price:", e);
        return null;
      });
      if (coupon) params.discounts = [{ coupon }];
    }

    await stripe().subscriptions.update(sub.id, params);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("premium resume failed:", e);
    return NextResponse.json(
      { error: "Couldn't keep your subscription — you can also turn renewal back on from the billing portal." },
      { status: 500 },
    );
  }
}
