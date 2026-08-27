import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, stripeEnabled, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { PREMIUM_TRIAL_DAYS } from "@/lib/premium";

export const dynamic = "force-dynamic";
// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = "nodejs";

// RiftCompare Premium's Stripe webhook.
//
// WHY THE PATH STILL SAYS /marketplace/. This endpoint was originally shared by
// the peer-to-peer Marketplace and Premium — the buyer/escrow branches lived
// alongside the subscription branches because Stripe delivers every event for
// the account to ONE registered URL. The Marketplace was removed (2026-08), so
// every order/escrow branch is gone and only the two Premium branches remain.
// The URL is kept exactly as-is because it is the endpoint already registered in
// the Stripe Dashboard: renaming the route means updating that Dashboard URL in
// lockstep, and any gap between the two drops live subscription events (new
// signups AND renewals) that Stripe only retries for ~3 days. Keeping the path
// costs nothing a visitor can see (it is a server-to-server callback) and avoids
// that risk entirely.
export async function POST(req: Request) {
  if (!stripeEnabled() || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Premium is the only checkout left; ignore any other session kind.
        if (session.metadata?.kind === "premium") await premiumStarted(session);
        break;
      }
      // Premium renewals: every successful subscription invoice re-stamps
      // premiumUntil with the new period end. A cancelled/lapsed sub simply
      // stops getting stamped and entitlement runs out on its own.
      case "invoice.paid": {
        await premiumRenewed(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        break;
    }
  } catch {
    // Returning 500 makes Stripe retry — acceptable for transient DB blips.
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── RiftCompare Premium (subscriptions) ────────────────────────────────────────

// First successful premium checkout: link the Stripe customer to the account and
// grant the first period (the period end comes off the subscription itself). For a
// free trial, the card is fingerprinted and checked against past trials FIRST — a
// reused card's trial is cancelled and NO entitlement is granted (entitlement is
// only ever written here, so a blocked abuser never gets a moment of access).
async function premiumStarted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId ?? session.client_reference_id;
  if (!userId) return;
  const isTrial = session.metadata?.trial === "1";
  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subId = typeof session.subscription === "string" ? session.subscription : null;

  let until: Date | null = null;
  if (subId) {
    try {
      // Expand the default payment method so we can read the card fingerprint.
      const sub = await stripe().subscriptions.retrieve(subId, { expand: ["default_payment_method"] });
      until = new Date(sub.current_period_end * 1000);

      if (isTrial) {
        const pm = sub.default_payment_method;
        const fingerprint = pm && typeof pm !== "string" ? pm.card?.fingerprint ?? null : null;
        if (fingerprint) {
          const seen = await prisma.trialRedemption.findUnique({ where: { cardFingerprint: fingerprint } });
          if (seen && seen.userId !== userId) {
            // This card already had a free trial (on any account) → refuse this one.
            await stripe().subscriptions.cancel(subId).catch(() => {});
            // Mark the account as having attempted a trial so it can't loop, but grant
            // nothing.
            await prisma.user.update({ where: { id: userId }, data: { trialStartedAt: new Date() } }).catch(() => {});
            return;
          }
          if (!seen) {
            await prisma.trialRedemption.create({ data: { cardFingerprint: fingerprint, userId } }).catch(() => {});
          }
        }
      }
    } catch {
      /* fall through to the grace default */
    }
  }
  // If the subscription read failed: grant a short grace window that the precise
  // period end (invoice.paid / renewal) will correct — PREMIUM_TRIAL_DAYS for a
  // trial, ~a month for a paid start. Was hardcoded to 1 day here, which under-
  // granted once the trial length moved off its original 1-day value.
  if (!until) until = new Date(Date.now() + (isTrial ? PREMIUM_TRIAL_DAYS : 32) * 86400_000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      premiumUntil: until,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      ...(isTrial ? { trialStartedAt: new Date() } : {}),
    },
  }).catch(() => {});
}

// Renewal invoices: resolve the user via subscription metadata (preferred) or the
// stored Stripe customer id, then extend premiumUntil to the new period end.
async function premiumRenewed(invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : null;
  if (!subId) return; // not a subscription invoice

  let userId: string | null = null;
  let until: Date | null = null;
  try {
    const sub = await stripe().subscriptions.retrieve(subId);
    userId = (sub.metadata?.userId as string | undefined) ?? null;
    until = new Date(sub.current_period_end * 1000);
  } catch {
    return;
  }
  if (!userId) {
    const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
    if (!customerId) return;
    const u = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
    userId = u?.id ?? null;
  }
  if (!userId || !until) return;
  await prisma.user.update({ where: { id: userId }, data: { premiumUntil: until } }).catch(() => {});
}
