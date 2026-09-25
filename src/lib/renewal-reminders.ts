// Auto-renew off: the reminder before a PAID subscription ends, and the pure
// rules /premium and api/premium/auto-renew share with it.
//
// Customer feedback, 2026-09-25: "Personally I hate auto renewal so I disable
// it for everything and then renew when needed." /premium now has a one-click
// "Turn off auto-renew" (api/premium/auto-renew), and its promise is this
// email: a day or two before the period ends, one plain note that it ends,
// that nothing more is charged, and exactly what renewing would charge, with
// a link to the one page where renewing is a deliberate click.
//
// Its own module, not lib/premium.ts: the once-per-period stamp is a
// subscriptions.update (metadata only), and premium.ts is pinned free of
// subscriptions.update so nothing there can ever re-price a subscription
// (tests/premium-price-increase.test.ts; tests/auto-renew.test.ts pins that
// the stamp here carries metadata and nothing else).
//
// Trials are NOT sent this — runPremiumTrialReminders' no-charge branch
// already tells a trial with renewal off the same thing. This covers `active`
// (paid) subscriptions only.
//
// Same category and opt-out rules as the trial reminder: a billing notice tied
// to something the recipient did (switched renewal off), sent once, not a
// marketing list — so no AnnouncementOptOut/UserDigestOptOut check, and the
// footer says it is once.
//
// ONCE PER PERIOD without a schema change: the claim is a Stripe metadata
// stamp, renewReminderFor=<current_period_end>, written BEFORE the send. A
// failed claim sends nothing; a failed send is not retried (the trial
// reminder's convention — a lost email must never become a repeated one).
// Renewing and switching off again in a later period is a new period end, so a
// new reminder.
//
// Stripe calls stay bounded the trial reminder's way: the DB picks only
// accounts whose premiumUntil (the webhook stamps it to the period end) falls
// in the window, and each costs one subscriptions.list. A stacked comp moves
// premiumUntil past the period end, so that account is never selected — right,
// since its access does not end with the subscription.
import type Stripe from "stripe";
import { prisma } from "./db";
import { stripe, stripeEnabled } from "./stripe";
import { sendRenewalReminderEmail } from "./email";
import { notify } from "./notifications";
import { introAmountOffCents, introOfferEnabled } from "./site";
import {
  TRIAL_REMINDER_WINDOW_MS,
  subscriptionIsCancelling,
  subscriptionChargeLine,
  introRenewalsRemaining,
  isIntroCouponId,
  hasEverPaid,
  tierFromPriceId,
  priceIdFor,
} from "./premium";

/** Same 48h as the trial reminder, for the same reason: one run a day, starting late. */
export const RENEWAL_REMINDER_WINDOW_MS = TRIAL_REMINDER_WINDOW_MS;

/** When a subscription set to end actually ends: cancel_at if set, else the period end. Unix seconds. */
export function subscriptionEndSec(sub: Pick<Stripe.Subscription, "cancel_at" | "current_period_end">): number {
  return sub.cancel_at ?? sub.current_period_end;
}

/**
 * Is the renewal reminder due for this subscription now? Pure. A PAID
 * (`active`) subscription set to end, ending within the window, and not
 * already stamped for this period.
 */
export function renewalReminderDue(
  sub: Pick<Stripe.Subscription, "status" | "cancel_at_period_end" | "cancel_at" | "current_period_end" | "metadata">,
  now: number = Date.now(),
): boolean {
  if (sub.status !== "active" || !subscriptionIsCancelling(sub)) return false;
  const endMs = subscriptionEndSec(sub) * 1000;
  if (endMs <= now || endMs > now + RENEWAL_REMINDER_WINDOW_MS) return false;
  return sub.metadata?.renewReminderFor !== String(sub.current_period_end);
}

/**
 * Can /premium PROMISE the before-it-ends email to someone about to switch
 * renewal off? Pure. Only when the end is more than one reminder window away
 * — every daily run until then still has it ahead, and neither reminder can
 * have gone out for this period yet (a trial's is stamped once it is inside
 * the window) — and when premiumUntil is the subscription's own end, since
 * both runs select on premiumUntil. Otherwise the card makes no promise.
 */
export function renewalReminderAhead(periodEnd: Date, premiumUntil: Date | null | undefined, now: number = Date.now()): boolean {
  if (periodEnd.getTime() - now <= RENEWAL_REMINDER_WINDOW_MS) return false;
  if (premiumUntil && premiumUntil.getTime() > periodEnd.getTime() + 3_600_000) return false;
  return true;
}

/**
 * What renewing charges, in the reminder's words. Pure.
 *   renewLine    — the next charge if renewal is turned back on now
 *                  (subscriptionChargeLine; the intro only while it still
 *                  covers a renewal, or when resume would attach it on
 *                  checkout's never-paid rule);
 *   introMonthsLeft — discounted renewals the current coupon still owes
 *                  (kept by renewing before the end);
 *   newSubLine   — what a NEW subscription after the end would cost someone
 *                  who has paid: the full price, and only when this
 *                  subscription is on today's list price (a grandfathered
 *                  rate is not what checkout would charge — null then).
 */
export function renewalTerms(d: {
  unitAmount: number | null;
  currency: string | null;
  interval: "month" | "year" | null;
  /** The intro coupon's amount off (0 if none). */
  introAmountOff: number;
  /** Any discount on the subscription at all — resume attaches the intro only when there is none. */
  hasDiscount: boolean;
  /** discount.end, unix seconds (null if none). */
  introEndSec: number | null;
  periodEndSec: number;
  everPaid: boolean;
  /** Is the subscription's price the one checkout sells for this tier/interval today? */
  onListPrice: boolean;
}): { renewLine: string | null; introMonthsLeft: number; newSubLine: string | null } {
  const introMonthsLeft = d.introAmountOff > 0 ? introRenewalsRemaining(d.periodEndSec, d.introEndSec) : 0;
  const introOnKeep =
    introOfferEnabled() && d.interval === "month" && !d.hasDiscount && d.unitAmount != null && !d.everPaid;
  const renewLine = subscriptionChargeLine({
    unitAmount: d.unitAmount,
    currency: d.currency,
    interval: d.interval,
    introAmountOff: introOnKeep ? introAmountOffCents(d.unitAmount!) : introMonthsLeft > 0 ? d.introAmountOff : 0,
  });
  const full = subscriptionChargeLine({ unitAmount: d.unitAmount, currency: d.currency, interval: d.interval, introAmountOff: 0 });
  return {
    renewLine,
    // Only months an EXISTING intro coupon still owes. (A never-paid account
    // that resume would give the intro to could equally get it by starting
    // again, so there is nothing to "keep"; renewLine already quotes it.)
    introMonthsLeft,
    newSubLine: d.everPaid && d.onListPrice ? full : null,
  };
}

export async function runRenewalReminders(now: number = Date.now()): Promise<number> {
  if (!stripeEnabled()) return 0;

  const candidates = await prisma.user.findMany({
    where: {
      stripeCustomerId: { not: null },
      premiumUntil: { gt: new Date(now), lte: new Date(now + RENEWAL_REMINDER_WINDOW_MS) },
    },
    select: { id: true, email: true, stripeCustomerId: true },
    // Soonest first, so a cap (never reached at today's scale) defers the
    // later-ending accounts to tomorrow's run, still inside their window.
    orderBy: { premiumUntil: "asc" },
    take: 500,
  });
  if (!candidates.length) return 0;

  let sent = 0;
  for (const u of candidates) {
    try {
      const subs = await stripe().subscriptions.list({
        customer: u.stripeCustomerId!,
        status: "active",
        limit: 3,
        expand: ["data.items.data.price"],
      });
      const sub = subs.data.find((s) => renewalReminderDue(s, now));
      if (!sub) continue;
      // CLAIM first: a failed stamp throws here and nothing is sent. Metadata
      // only — never items, price or discounts (the lock-in promise).
      await stripe().subscriptions.update(sub.id, { metadata: { renewReminderFor: String(sub.current_period_end) } });

      const price = sub.items.data[0]?.price as Stripe.Price | undefined;
      const tier = tierFromPriceId(price?.id);
      const rawInterval = price?.recurring?.interval;
      const interval = rawInterval === "month" || rawInterval === "year" ? rawInterval : null;
      const coupon = sub.discount?.coupon;
      const terms = renewalTerms({
        unitAmount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
        interval,
        introAmountOff: coupon && isIntroCouponId(coupon.id) ? coupon.amount_off ?? 0 : 0,
        hasDiscount: !!sub.discount,
        introEndSec: sub.discount?.end ?? null,
        periodEndSec: sub.current_period_end,
        everPaid: await hasEverPaid(u.stripeCustomerId),
        onListPrice: !!price?.id && price.id === priceIdFor(tier, interval === "year" ? "annual" : "monthly"),
      });
      const planName = tier === "plus" ? "Plus" : "Premium";
      const endsAt = new Date(subscriptionEndSec(sub) * 1000);
      if (await sendRenewalReminderEmail(u.email, { planName, endsAt, ...terms })) {
        sent++;
        void notify(u.id, "renewal_ending", `Your ${planName} ends soon`, "Auto-renew is off, so nothing more is charged. Renew with one click.", "/premium?keep=1#keep").catch(() => {});
      }
    } catch (e) {
      /* best-effort — one failed lookup must not block the rest of the batch */
      console.error("renewal reminder failed for one account:", e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
