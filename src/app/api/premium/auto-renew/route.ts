import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { subscriptionIsCancelling } from "@/lib/premium";
import { subscriptionEndSec } from "@/lib/renewal-reminders";
import { TURNED_OFF_VIA_BUTTON } from "@/lib/trial-cancel";

export const dynamic = "force-dynamic";

// "Turn off auto-renew" — the opposite door to api/premium/resume.
// Customer feedback, 2026-09-25: "Personally I hate auto renewal so I disable
// it for everything and then renew when needed." Until now the only way to do
// that was Stripe's portal, which calls it "Cancel". This sets
// cancel_at_period_end and nothing else: access runs to the end of the trial or
// the paid period, nothing more is charged, and the renewal reminder
// (runRenewalReminders, or the trial reminder's no-charge branch) goes out a
// day or two before it ends. "Turn auto-renew back on" (resume) undoes it.
//
// POST only, from the signed-in owner, on their own Stripe customer — the same
// checks as resume. A GET does nothing (405 by omission): mail scanners
// prefetch links, and no email links here anyway.
//
// It acts on the SAME subscription the /premium card describes
// (getPremiumSubscriptionDetails: the first live one), so the button can never
// switch off a different subscription from the one whose date it showed.
//
// turnedOffAt / turnedOffVia go on the subscription's metadata so
// trial-cancel-report can tell this button's switch-offs from the portal's
// (Stripe records both as the same cancel_at_period_end).

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } });
  if (!dbUser?.stripeCustomerId) {
    return NextResponse.json({ error: "No subscription found on this account" }, { status: 400 });
  }

  try {
    const subs = await stripe().subscriptions.list({ customer: dbUser.stripeCustomerId, status: "all", limit: 10 });
    const sub = subs.data.find((s) => s.status === "active" || s.status === "trialing" || s.status === "past_due");
    if (!sub) {
      return NextResponse.json({ error: "This subscription has already ended — there's nothing to renew." }, { status: 400 });
    }
    if (subscriptionIsCancelling(sub)) {
      return NextResponse.json({ ok: true, already: true, endsAt: new Date(subscriptionEndSec(sub) * 1000).toISOString() });
    }
    if (sub.status === "past_due") {
      // A renewal payment is being retried: that period was never paid, so
      // "you keep everything until the end" would not be true. The portal
      // handles this case (update the card, or cancel).
      return NextResponse.json(
        { error: "A payment on this subscription is being retried — use Manage subscription to update your card or cancel." },
        { status: 409 },
      );
    }

    const updated = await stripe().subscriptions.update(sub.id, {
      cancel_at_period_end: true,
      metadata: { turnedOffAt: new Date().toISOString(), turnedOffVia: TURNED_OFF_VIA_BUTTON },
    });
    return NextResponse.json({ ok: true, endsAt: new Date(subscriptionEndSec(updated) * 1000).toISOString() });
  } catch (e) {
    console.error("premium auto-renew off failed:", e);
    return NextResponse.json(
      { error: "Couldn't turn off auto-renew — you can also do it from Manage subscription." },
      { status: 500 },
    );
  }
}
