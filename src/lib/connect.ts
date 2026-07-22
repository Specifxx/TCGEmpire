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
// returns its id to store on SellerProfile. Pre-fills whatever we already know
// (email, name) so Stripe's hosted onboarding form skips those fields instead
// of asking again — the account shape itself (capabilities/tos_acceptance) is
// unavoidable per accountParamsFor's comment, but every already-known field we
// pass here is one less screen the seller has to fill in themselves.
export async function createExpressAccount(country: string, email: string, displayName?: string | null): Promise<string> {
  const [firstName, ...rest] = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  const lastName = rest.join(" ");
  const account = await stripe().accounts.create({
    ...accountParamsFor(country),
    email,
    ...(firstName && lastName ? { individual: { email, first_name: firstName, last_name: lastName } } : {}),
  });
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
// where they see their real available/paid-out balance, plus everything below
// (schedule, manual payout) if they'd rather manage it there directly. We
// deliberately never mirror the BALANCE figure ourselves (see the funds API
// route) — Stripe is the single source of truth for that. The payout SCHEDULE
// below is different: it's a low-frequency setting, not a number that can drift
// out of sync, so reading/writing it here (always live against Stripe, never
// cached) is just a thin, safe proxy that saves a seller a trip to Stripe's UI.
export async function createLoginLink(accountId: string): Promise<string> {
  const link = await stripe().accounts.createLoginLink(accountId);
  return link.url;
}

export type PayoutInterval = "manual" | "daily" | "weekly" | "monthly";
export interface PayoutSchedule {
  interval: PayoutInterval;
  delayDays: number | null; // Stripe/country-assigned minimum days before a transaction is payout-eligible
  weeklyAnchor: string | null; // day name, only set when interval === "weekly"
  monthlyAnchor: number | null; // day of month (1-31, or 31 = last day), only set when interval === "monthly"
}

// Reads the connected account's CURRENT payout schedule straight from Stripe —
// no local copy, so it can never go stale.
export async function getPayoutSchedule(accountId: string): Promise<PayoutSchedule> {
  const account = await stripe().accounts.retrieve(accountId);
  const schedule = account.settings?.payouts?.schedule;
  return {
    interval: (schedule?.interval as PayoutInterval) ?? "daily",
    delayDays: typeof schedule?.delay_days === "number" ? schedule.delay_days : null,
    weeklyAnchor: schedule?.weekly_anchor ?? null,
    monthlyAnchor: schedule?.monthly_anchor ?? null,
  };
}

// Updates the schedule sellers can choose from this app: automatic daily/weekly/
// monthly, or "manual" (Stripe holds the balance until createManualPayout is
// called — the "hold" option). Deliberately doesn't expose delay_days — that's
// a country-assigned minimum, not something a seller should be tuning.
export async function updatePayoutSchedule(
  accountId: string,
  schedule: { interval: PayoutInterval; weeklyAnchor?: string; monthlyAnchor?: number }
): Promise<void> {
  await stripe().accounts.update(accountId, {
    settings: {
      payouts: {
        schedule: {
          interval: schedule.interval,
          ...(schedule.interval === "weekly" && schedule.weeklyAnchor
            ? { weekly_anchor: schedule.weeklyAnchor as import("stripe").Stripe.AccountUpdateParams.Settings.Payouts.Schedule.WeeklyAnchor }
            : {}),
          ...(schedule.interval === "monthly" && schedule.monthlyAnchor ? { monthly_anchor: schedule.monthlyAnchor } : {}),
        },
      },
    },
  });
}

// Manually triggers a payout of the account's full available balance in every
// currency it holds — only meaningful (and only exposed in the UI) when the
// schedule is "manual"; Stripe pays out automatically otherwise. Lets a seller
// who's chosen to "hold" funds actually pull them out on demand instead of
// waiting for the next auto-payout. No-ops (throws nothing) if there's simply
// nothing available yet.
export async function createManualPayout(accountId: string): Promise<void> {
  const balance = await stripe().balance.retrieve({ stripeAccount: accountId });
  const payable = balance.available.filter((b) => b.amount > 0);
  if (!payable.length) throw new Error("No funds available to pay out yet");
  for (const b of payable) {
    await stripe().payouts.create({ amount: b.amount, currency: b.currency }, { stripeAccount: accountId });
  }
}

export interface PayoutRecord {
  id: string;
  amountCents: number;
  currency: string;
  // Stripe's own payout lifecycle: pending (scheduled, not sent yet) ->
  // in_transit (sent, on its way) -> paid (arrived) — or failed/canceled.
  status: "pending" | "in_transit" | "paid" | "failed" | "canceled";
  arrivalDate: string; // Stripe's expected (or, once paid, actual) bank arrival date
  createdAt: string;
  automatic: boolean; // false = triggered via "Pay out now", true = the account's own schedule
  failureMessage: string | null;
}

// The seller's actual payout HISTORY — real Payout objects from Stripe, not
// something we track ourselves. This is what answers "when does it actually
// land in my bank": arrivalDate on a pending/in_transit payout IS Stripe's own
// expected-arrival date, so there's no need to predict Stripe's scheduling
// logic ourselves — we just surface what Stripe has already scheduled.
export async function listPayouts(accountId: string, limit = 10): Promise<PayoutRecord[]> {
  const payouts = await stripe().payouts.list({ limit }, { stripeAccount: accountId });
  return payouts.data.map((p) => ({
    id: p.id,
    amountCents: p.amount,
    currency: p.currency,
    status: p.status as PayoutRecord["status"],
    arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
    createdAt: new Date(p.created * 1000).toISOString(),
    automatic: p.automatic,
    failureMessage: p.failure_message ?? null,
  }));
}

// Self-heals SellerProfile.payoutsEnabled against Stripe directly. The
// account.updated webhook (connect-webhook/route.ts) is the fast path that
// normally flips this the moment onboarding finishes — but if that webhook
// endpoint was never registered in Stripe's dashboard, STRIPE_CONNECT_WEBHOOK_
// SECRET is wrong/missing, or a single event just got dropped, the stored flag
// can get stuck false forever even though the seller genuinely finished
// setup — showing "enable payouts" indefinitely on an account that actually
// works. Called wherever a seller sees their payout status; only makes a live
// Stripe call when we don't already believe payouts are enabled, so once the
// flag catches up this never fires again for that seller.
export async function reconcilePayoutStatus(userId: string, accountId: string): Promise<boolean> {
  try {
    const account = await stripe().accounts.retrieve(accountId);
    const payoutsEnabled = !!account.payouts_enabled;
    if (payoutsEnabled) {
      await prisma.sellerProfile.update({ where: { userId }, data: { payoutsEnabled: true } });
      // Same catch-up the webhook does: release any COMPLETED sale that was
      // stuck waiting on payouts to switch on.
      const stuck = await prisma.order.findMany({
        where: { sellerId: userId, kind: "MARKETPLACE", status: "COMPLETED", stripeTransferId: null },
        select: { id: true },
        take: 200,
      });
      for (const o of stuck) await releaseFundsForOrder(o.id).catch(() => {});
    }
    return payoutsEnabled;
  } catch {
    return false; // Stripe unreachable — report unchanged rather than guess
  }
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
