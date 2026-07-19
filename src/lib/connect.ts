// Stripe Connect (Express) — per-seller payouts for the P2P marketplace.
//
// Buyers always pay the PLATFORM account via lib/stripe.ts's plain hosted Checkout
// (unchanged). This file is the OTHER half: onboarding a seller's own Express
// account (Stripe runs the identity/KYC verification — that's the whole answer to
// "do we need ID verification", nothing custom to build), and — once an order is
// confirmed delivered — TRANSFERRING that seller's share out of the platform's held
// balance. Using a transfer (not `application_fee_amount` on the original charge)
// is what lets us hold the money until delivery instead of splitting it at the
// moment of payment: the fee is simply the difference we never transfer.
//
// INERT until STRIPE_SECRET_KEY is set — every function here assumes stripeEnabled().
import { prisma } from "./db";
import { stripe } from "./stripe";
import { SITE_URL } from "./site";
import { platformFeeCents } from "./marketplace";

// Two DISTINCT Stripe walls are in play here, confirmed by live testing
// (neither can be worked around by contacting neither support nor guessing —
// this is exactly what each attempt hit):
//
// 1. Stripe's "recipient" service agreement (a transfers-only account shape,
//    no card_payments ever offered) is REJECTED OUTRIGHT for same-country
//    accounts: "The recipient ToS agreement is not supported for platforms in
//    AU creating accounts in AU." It only works cross-border (platform in one
//    country, connected account in another) — exactly what it's document for.
// 2. The full Express agreement requesting ONLY `transfers` (no
//    `card_payments`) hits a manual platform-approval wall: "Your platform
//    needs approval for accounts to have requested the transfers capability
//    without the card_payments capability."
//
// So: same-country (AU platform → AU seller) MUST use the full agreement, and
// avoids wall #2 by also requesting `card_payments` — never actually used
// (buyers always pay the PLATFORM account, see the header comment), but its
// presence is what stops Stripe treating this as an unusual transfers-only
// shape needing manual review. Cross-border (AU platform → UK/US seller) uses
// the recipient agreement instead, which is built for exactly that and never
// needs card_payments at all.
function accountParamsFor(country: string): import("stripe").Stripe.AccountCreateParams {
  const base = { type: "express" as const, country, business_type: "individual" as const };
  if (country === "AU") {
    return { ...base, capabilities: { transfers: { requested: true }, card_payments: { requested: true } } };
  }
  return { ...base, capabilities: { transfers: { requested: true } }, tos_acceptance: { service_agreement: "recipient" } };
}

// Creates the seller's Express account (idempotent per call — always makes a new
// one, so only call this when SellerProfile.stripeAccountId is still null) and
// returns its id to store on SellerProfile.
export async function createExpressAccount(country: string, email: string): Promise<string> {
  const account = await stripe().accounts.create({ ...accountParamsFor(country), email });
  return account.id;
}

// A fresh Stripe-hosted onboarding link for an account that hasn't finished KYC yet
// (or needs to fix something) — always request a new one rather than reusing an old
// link, since Account Links expire quickly.
export async function createOnboardingLink(accountId: string): Promise<string> {
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${SITE_URL}/marketplace/sell?connect=refresh`,
    return_url: `${SITE_URL}/marketplace/sell?connect=return`,
  });
  return link.url;
}

// A one-time login link into the seller's own Stripe Express dashboard — this is
// where they see their real available/paid-out balance and payout schedule. We
// deliberately never mirror that number ourselves (see getFundsSummary in
// lib/marketplace.ts) — Stripe is the single source of truth for it.
export async function createLoginLink(accountId: string): Promise<string> {
  const link = await stripe().accounts.createLoginLink(accountId);
  return link.url;
}

// Transfers a completed order's seller share (total − platform fee) out of the
// platform's held balance into the seller's connected account. Idempotent: a
// second call on the same order is a no-op if it already has a transfer recorded,
// so it's always safe to call from both the buyer "receive" action AND the
// auto-release cron without double-paying a seller.
export async function releaseFundsForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      kind: true,
      status: true,
      sellerId: true,
      totalCents: true,
      feeCents: true,
      currency: true,
      stripePaymentIntent: true,
      stripeTransferId: true,
      orderNumber: true,
    },
  });
  if (!order || order.kind !== "MARKETPLACE") return;
  if (order.stripeTransferId) return; // already released
  if (!order.stripePaymentIntent) return; // nothing was actually charged (shouldn't happen for a COMPLETED order)

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: order.sellerId },
    select: { stripeAccountId: true },
  });
  if (!profile?.stripeAccountId) return; // seller never finished onboarding — held funds stay held; support ticket path handles this manually

  const pi = await stripe().paymentIntents.retrieve(order.stripePaymentIntent);
  const charge = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
  if (!charge) return;

  const fee = order.feeCents ?? platformFeeCents(order.totalCents);
  const amount = Math.max(0, order.totalCents - fee);
  if (amount <= 0) return;

  const transfer = await stripe().transfers.create({
    amount,
    currency: order.currency.toLowerCase(),
    destination: profile.stripeAccountId,
    source_transaction: charge,
    transfer_group: `RC-${order.orderNumber ?? order.id}`,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { stripeTransferId: transfer.id, transferredAt: new Date() },
  });
  await prisma.sellerProfile.update({
    where: { userId: order.sellerId },
    data: { completedSalesCount: { increment: 1 } },
  });
}

// Refunds a PAID (not yet shipped/delivered) order in full — used by the
// ship-deadline cron job when a seller never uploads tracking in time, and by
// mutual-cancellation acceptance. Refunding before any transfer happens is a
// plain platform-side refund; the seller is unaffected either way since they
// were never paid.
export async function refundOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, kind: true, stripePaymentIntent: true, refundedAt: true },
  });
  if (!order || order.kind !== "MARKETPLACE" || order.refundedAt) return;

  if (order.stripePaymentIntent) {
    // Every Order row from one checkout shares a single PaymentIntent (one
    // card charge can span several listing lines, even several sellers — see
    // orders/route.ts's groupKey). If a sibling order already refunded that
    // same PaymentIntent, asking Stripe to refund it again would error
    // ("charge has already been refunded") — just mark this order refunded
    // too instead of calling Stripe a second time for the same money.
    const alreadyRefundedSibling = await prisma.order.findFirst({
      where: { id: { not: order.id }, stripePaymentIntent: order.stripePaymentIntent, refundedAt: { not: null } },
      select: { id: true },
    });
    if (!alreadyRefundedSibling) {
      await stripe().refunds.create({ payment_intent: order.stripePaymentIntent });
    }
  }
  await prisma.order.update({ where: { id: order.id }, data: { refundedAt: new Date() } });
}
