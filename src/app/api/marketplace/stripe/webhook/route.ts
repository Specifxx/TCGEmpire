import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, stripeEnabled, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { PREMIUM_TRIAL_DAYS } from "@/lib/premium";
import {
  customerIdOf,
  entitledUntilFromSubscription,
  extendedPremiumUntil,
  subscriptionIdFromInvoice,
  userIdFromSubscription,
} from "@/lib/stripe-entitlement";

export const dynamic = "force-dynamic";
// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = "nodejs";

// RiftCompare Premium's Stripe webhook.
//
// WHY THE PATH STILL SAYS /marketplace/. This endpoint was originally shared by
// the peer-to-peer Marketplace and Premium — the buyer/escrow branches lived
// alongside the subscription branches because Stripe delivers every event for
// the account to ONE registered URL. The Marketplace was removed (2026-08), so
// every order/escrow branch is gone and only the Premium branches remain.
// The URL is kept exactly as-is because it is the endpoint already registered in
// the Stripe Dashboard: renaming the route means updating that Dashboard URL in
// lockstep, and any gap between the two drops live subscription events (new
// signups AND renewals) that Stripe only retries for ~3 days. Keeping the path
// costs nothing a visitor can see (it is a server-to-server callback) and avoids
// that risk entirely.
//
// HARDENED AFTER THE NARON INCIDENT (Aug 2026): a trial converted to a paid
// year on Stripe but the site showed the account lapsed, because the renewal
// path listened for exactly one event type, parsed exactly one payload shape,
// and failed silently at four separate points. The rules now:
//
//   1. BELT AND BRACES ON EVENTS. Renewals stamp from `invoice.paid` AND its
//      sibling `invoice.payment_succeeded` (Dashboard endpoints are often
//      subscribed to one but not the other), AND from
//      customer.subscription.created/updated — three independent chances per
//      billing cycle to record the same fact. Stamping is idempotent, so
//      overlap is free.
//   2. PAYLOAD SHAPES ARE VERSION-TOLERANT (lib/stripe-entitlement.ts): the
//      endpoint's Dashboard-configured API version decides the payload shape,
//      NOT the SDK pin in lib/stripe.ts, and Stripe moved both
//      invoice.subscription and subscription.current_period_end in the
//      2025-03-31 "basil" version. Never read either field directly here.
//   3. NO SILENT DROPS. Every path that gives up logs console.error with the
//      event id — a paying customer losing entitlement must show in the
//      function logs, not vanish.
//   4. EXTEND-ONLY. Stripe events only ever GROW premiumUntil (see
//      extendedPremiumUntil) — a monthly renewal must not clobber a longer
//      comp grant, and out-of-order event delivery must not shorten paid time.
//   5. The daily reconcile cron (/api/cron/stripe-reconcile) re-derives
//      entitlement from the Stripe subscription list, so even a fully missed
//      webhook heals within a day.
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
      // Premium renewals — see rule 1 above for why both invoice events.
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        await premiumRenewed(event.data.object, event.id);
        break;
      }
      // The subscription object itself is the most reliable entitlement source:
      // `updated` fires on every period rollover (incl. trial → active) and
      // carries the new period end directly — no invoice indirection at all.
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await premiumSubscriptionChanged(event.data.object, event.id);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Returning 500 makes Stripe retry — acceptable for transient DB blips.
    console.error(`stripe webhook ${event.id} (${event.type}) failed:`, e);
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
//
// PAYMENT MUST SUCCEED BEFORE ANYTHING IS GRANTED (the churchless@gmail.com
// incident, Aug 2026). `checkout.session.completed` fires once the customer
// finishes the Checkout UI — which is NOT the same thing as the charge having
// gone through: a card that fails 3DS/bank authentication after Checkout closes,
// or a delayed payment method, leaves the subscription in a non-entitled status
// (incomplete/incomplete_expired/unpaid) even though this event still fires.
// `entitledUntilFromSubscription` was already computing the correct null for
// that case — the bug was a fallback below it that treated "checked Stripe and
// it says no" exactly like "couldn't check Stripe at all" and granted a grace
// window either way. Only a genuine RETRIEVAL failure (network/API error — we
// never learned the real status) still gets that grace, and only because the
// checkout session itself completing is real signal the charge likely landed;
// a successfully-read non-entitled subscription now grants nothing, ever.
async function premiumStarted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId ?? session.client_reference_id;
  if (!userId) {
    console.error("stripe webhook: premium checkout with no userId (session", session.id, ")");
    return;
  }
  const isTrial = session.metadata?.trial === "1";
  const customerId = customerIdOf(session);
  const subId = typeof session.subscription === "string" ? session.subscription : null;
  if (!subId) {
    console.error(`stripe webhook: premium checkout ${session.id} completed with no subscription id`);
    return;
  }

  let sub: Stripe.Subscription;
  try {
    // Expand the default payment method so we can read the card fingerprint.
    // The retrieve goes through the SDK's own pinned API version, so its shape
    // is stable regardless of the webhook endpoint's version — but the period
    // end still goes through the tolerant reader, so an SDK version bump can't
    // silently null it.
    sub = await stripe().subscriptions.retrieve(subId, { expand: ["default_payment_method"] });
  } catch (e) {
    console.error(`stripe webhook: subscription read failed for checkout ${session.id}:`, e);
    // We genuinely don't know the real status — the checkout session completing
    // is the best signal we have, so grant a short grace window that the next
    // renewal event or the daily reconcile cron will correct once Stripe is
    // reachable again. This is the ONLY path that may grant without confirmed
    // entitlement, and only because entitlement couldn't be checked at all.
    const grace = new Date(Date.now() + (isTrial ? PREMIUM_TRIAL_DAYS : 32) * 86400_000);
    await stampPremium(userId, grace, customerId, `checkout ${session.id} (grace — subscription unreadable)`);
    if (isTrial) {
      await prisma.user.update({ where: { id: userId }, data: { trialStartedAt: new Date() } }).catch(() => {});
    }
    return;
  }

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

  const until = entitledUntilFromSubscription(sub);
  if (!until) {
    // Stripe was reachable and says this subscription does not entitle access
    // right now (payment failed, requires action, or was never completed) —
    // grant NOTHING. If the payment later succeeds, invoice.paid /
    // customer.subscription.updated (or checkout.session.async_payment_succeeded
    // re-running this same function) will stamp premium then, correctly.
    console.error(
      `stripe webhook: checkout ${session.id} completed but subscription ${subId} is not entitled (status "${sub.status}") — granting nothing`
    );
    if (isTrial) {
      await prisma.user.update({ where: { id: userId }, data: { trialStartedAt: new Date() } }).catch(() => {});
    }
    return;
  }

  await stampPremium(userId, until, customerId, `checkout ${session.id}`);
  if (isTrial) {
    await prisma.user.update({ where: { id: userId }, data: { trialStartedAt: new Date() } }).catch(() => {});
  }
}

// Renewal invoices: resolve the subscription across payload generations, then
// the user (subscription metadata → stored customer id), then extend.
async function premiumRenewed(invoice: unknown, eventId: string) {
  const subId = subscriptionIdFromInvoice(invoice);
  if (!subId) return; // genuinely not a subscription invoice (one-off charge)

  let sub: Stripe.Subscription;
  try {
    sub = await stripe().subscriptions.retrieve(subId);
  } catch (e) {
    console.error(`stripe webhook ${eventId}: could not retrieve subscription ${subId}:`, e);
    throw e; // 500 → Stripe retries
  }
  await stampFromSubscription(sub, eventId, customerIdOf(invoice));
}

async function premiumSubscriptionChanged(sub: unknown, eventId: string) {
  await stampFromSubscription(sub, eventId, null);
}

/** Resolve the user a subscription belongs to and extend their entitlement. */
async function stampFromSubscription(sub: unknown, eventId: string, fallbackCustomerId: string | null) {
  const until = entitledUntilFromSubscription(sub);
  if (!until) return; // canceled/incomplete — earns nothing new, keeps paid time

  const customerId = customerIdOf(sub) ?? fallbackCustomerId;
  let userId = userIdFromSubscription(sub);
  if (!userId && customerId) {
    const u = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
    userId = u?.id ?? null;
  }
  if (!userId) {
    // A paying subscription we can't map to an account is exactly the failure
    // that stranded a real customer — make it impossible to miss. The daily
    // reconcile also reports these, with the customer email attached.
    console.error(`stripe webhook ${eventId}: entitled subscription has no resolvable user (customer ${customerId ?? "?"})`);
    return;
  }
  await stampPremium(userId, until, customerId, `event ${eventId}`);
}

/** Extend-only write of premiumUntil (+ backfill of the customer link). */
async function stampPremium(userId: string, until: Date, customerId: string | null, source: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true, stripeCustomerId: true } });
  if (!u) {
    console.error(`stripe webhook: ${source} names unknown user ${userId}`);
    return;
  }
  const next = extendedPremiumUntil(u.premiumUntil, until);
  const linkCustomer = customerId && !u.stripeCustomerId;
  if (!next && !linkCustomer) return; // nothing to change — idempotent overlap
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(next ? { premiumUntil: next } : {}),
      ...(linkCustomer ? { stripeCustomerId: customerId } : {}),
    },
  });
}
