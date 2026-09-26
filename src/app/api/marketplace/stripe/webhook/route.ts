import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, stripeEnabled, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { PREMIUM_TRIAL_DAYS, tierFromPriceId, normalizeTier, type PremiumTier } from "@/lib/premium";
import {
  customerIdOf,
  entitledUntilFromSubscription,
  extendedPremiumUntil,
  priceIdFromSubscription,
  subscriptionIdFromInvoice,
  userIdFromSubscription,
} from "@/lib/stripe-entitlement";
import { CONSULT_DURATION_MIN, CONSULT_REPLY_HOURS, CONSULT_SCHEDULING_URL } from "@/lib/consulting";
import { sendConsultConfirmationEmail, sendConsultOwnerAlertEmail } from "@/lib/email";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";

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
        if (session.metadata?.kind === "premium") await premiumStarted(session);
        // The paid store consulting session (/stores/consulting) — the one
        // non-subscription checkout on the account.
        else if (session.metadata?.kind === "store_consult") await consultBookingPaid(session, event.id);
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
    // `|| 3` (2026-09-26): with trials off by default PREMIUM_TRIAL_DAYS is 0,
    // but a trial checkout opened before that deploy can still complete after
    // it — a 0-day grace would grant nothing at all. 3 was the last trial length.
    const grace = new Date(Date.now() + (isTrial ? PREMIUM_TRIAL_DAYS || 3 : 32) * 86400_000);
    // No subscription object to read a price off — this is the one path that
    // must trust checkout's own session.metadata.tier stamp.
    const graceTier = normalizeTier(session.metadata?.tier);
    await stampPremium(userId, grace, customerId, `checkout ${session.id} (grace — subscription unreadable)`, graceTier);
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

  // Price first (the live source of truth, and what a switch would change) —
  // tierFromPriceId already resolves an unrecognized/absent price id to the
  // grandfathered "premium" default, so no separate metadata fallback is
  // needed here (unlike the grace path above, which has no subscription at all).
  const tier = tierFromPriceId(priceIdFromSubscription(sub));
  await stampPremium(userId, until, customerId, `checkout ${session.id}`, tier);
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

/** Resolve the user a subscription belongs to and extend their entitlement.
 *
 * This one function is the tier insertion point for every path EXCEPT the
 * first stamp (premiumStarted, above) and the grace fallback: it's reached by
 * invoice.paid/payment_succeeded (renewals) AND customer.subscription.created/
 * updated — which fires on a trial converting to paid AND on a plan/tier
 * switch, whether that switch came from this app's own upgrade route or a
 * customer using the Stripe portal. Reading the price off the live
 * subscription (rather than trusting stale checkout-time metadata) is what
 * makes a tier switch self-correcting here with no extra code at the switch
 * site itself. */
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
  const tier = tierFromPriceId(priceIdFromSubscription(sub));
  await stampPremium(userId, until, customerId, `event ${eventId}`, tier);
}

/** Extend-only write of premiumUntil (+ backfill of the customer link), PLUS a
 * last-write-wins write of premiumTier whenever the live tier disagrees with
 * what's stored. The tier write is DELIBERATELY NOT conditioned on `next` —
 * a same-period upgrade/downgrade (tier changes, current_period_end doesn't)
 * would make `next` null, and the old early-return here would silently drop
 * the tier change entirely. premiumUntil stays extend-only; premiumTier does
 * not, because it describes what the CURRENT period is, not how much of it
 * remains. */
async function stampPremium(userId: string, until: Date, customerId: string | null, source: string, tier: PremiumTier) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true, stripeCustomerId: true, premiumTier: true } });
  if (!u) {
    console.error(`stripe webhook: ${source} names unknown user ${userId}`);
    return;
  }
  const next = extendedPremiumUntil(u.premiumUntil, until);
  const linkCustomer = customerId && !u.stripeCustomerId;
  const tierChange = normalizeTier(u.premiumTier) !== tier;
  if (!next && !linkCustomer && !tierChange) return; // nothing to change — idempotent overlap
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(next ? { premiumUntil: next } : {}),
      ...(linkCustomer ? { stripeCustomerId: customerId } : {}),
      ...(tierChange ? { premiumTier: tier } : {}),
    },
  });
}

// ── Store consulting (one-off payment, not a subscription) ───────────────────

// A store paid for a consulting session (/stores/consulting). Flip the booking
// to `paid`, keep the tax invoice link, and tell both sides.
//
// PAYMENT MUST ACTUALLY HAVE CLEARED. `checkout.session.completed` fires when
// the customer finishes the Checkout UI, which is NOT the same as money having
// moved — the same distinction that cost this codebase the churchless incident
// on the subscription path above. For a one-off payment the honest test is
// `payment_status`, and a session still `unpaid` (a delayed method that may yet
// fail) is left `pending` for its own async_payment_succeeded event to finish.
//
// IDEMPOTENT. Both event types can deliver for one session, and Stripe retries.
// The update is scoped to bookings NOT already paid, so a replay changes zero
// rows and sends zero duplicate emails.
async function consultBookingPaid(session: Stripe.Checkout.Session, eventId: string) {
  const bookingId = session.metadata?.bookingId ?? session.client_reference_id;
  if (!bookingId) {
    console.error(`stripe webhook ${eventId}: store_consult session ${session.id} carries no bookingId`);
    return;
  }
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    // Not an error — an async method just hasn't settled. Its own event follows.
    console.warn(`stripe webhook ${eventId}: consult booking ${bookingId} not paid yet (${session.payment_status})`);
    return;
  }

  // Stripe's hosted tax invoice. `invoice` is an id on the session; the PDF/
  // hosted URL only exists on the invoice object, so it takes one retrieve.
  // A failure here must never block the booking being marked paid — the link
  // is a convenience, the payment is the fact.
  let invoiceUrl: string | null = null;
  const invoiceId = typeof session.invoice === "string" ? session.invoice : session.invoice?.id ?? null;
  if (invoiceId) {
    try {
      const inv = await stripe().invoices.retrieve(invoiceId);
      invoiceUrl = inv.hosted_invoice_url ?? inv.invoice_pdf ?? null;
    } catch (e) {
      console.error(`stripe webhook ${eventId}: invoice ${invoiceId} unreadable for booking ${bookingId}:`, e);
    }
  }

  // Scoped to `not paid` so a retried event is a no-op rather than a second email.
  const updated = await prisma.consultBooking.updateMany({
    where: { id: bookingId, status: { not: "paid" } },
    data: {
      status: "paid",
      paidAt: new Date(),
      stripeSessionId: session.id,
      ...(invoiceUrl ? { invoiceUrl } : {}),
    },
  });
  if (updated.count === 0) return; // already handled — nothing to send

  const booking = await prisma.consultBooking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    console.error(`stripe webhook ${eventId}: consult booking ${bookingId} vanished after update`);
    return;
  }

  // Both sends are best-effort and independent: a failed store receipt must not
  // stop the owner alert, or the owner never learns a paid session is waiting.
  await sendConsultConfirmationEmail(booking.email, {
    storeName: booking.storeName,
    contactName: booking.contactName,
    amountCents: booking.amountCents,
    currency: booking.currency,
    durationMin: CONSULT_DURATION_MIN,
    replyHours: CONSULT_REPLY_HOURS,
    invoiceUrl: booking.invoiceUrl,
    schedulingUrl: CONSULT_SCHEDULING_URL || null,
    preferredTimes: booking.preferredTimes,
  }).catch((e) => console.error(`consult confirmation email failed for ${bookingId}:`, e));

  await sendConsultOwnerAlertEmail(CONTACT_EMAIL, {
    storeName: booking.storeName,
    storeUrl: booking.storeUrl,
    contactName: booking.contactName,
    email: booking.email,
    country: booking.country,
    amountCents: booking.amountCents,
    currency: booking.currency,
    goals: booking.goals,
    preferredTimes: booking.preferredTimes,
    adminUrl: `${SITE_URL}/admin/consulting`,
  }).catch((e) => console.error(`consult owner alert failed for ${bookingId}:`, e));
}
