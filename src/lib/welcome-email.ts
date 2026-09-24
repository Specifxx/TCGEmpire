// The one-time welcome email to a NEW account — the run half (the template is
// buildWelcomeEmail in lib/email.ts). DECISIONS.md, "Premium after sign-up:
// the post-signup funnel", 2026-09-23.
//
// Called hourly by .github/workflows/welcome-email.yml through
// /api/cron/welcome-email (GitHub Actions, not Vercel Cron — same reason as the
// checkout-recovery email: the Vercel cron slots are spoken for).
//
// WHO: accounts created in the last WINDOW_HOURS that have not had it
// (welcomeEmailSentAt null), excluding admins and seed accounts. The window is
// what keeps the first run from emailing every account that already existed
// when this shipped — they are simply outside it — and it bounds the query.
// Accounts younger than MIN_AGE_MINUTES wait for the next run, so an OAuth
// sign-up that is still mid-redirect is never emailed before it has landed.
//
// EXACTLY ONCE: each account is CLAIMED with a conditional update (only while
// welcomeEmailSentAt is still null) before anything is sent, so two overlapping
// runs cannot both send. A failed send releases the claim so the next hour
// retries; the window caps that at three days of attempts.
import { prisma } from "./db";
import type Stripe from "stripe";
import { NOT_SEED_WHERE, PREMIUM_TRIAL_DAYS, premiumTrialEnabled, subscriptionChargeLine, subscriptionIsCancelling, isIntroCouponId, tierFromPriceId } from "./premium";
import { premiumFromLine, premiumZeroToday, introOfferEnabled, introPriceLine, PREMIUM_ANNUAL_AMOUNT } from "./site";
import { sendWelcomeEmail, sendTrialWelcomeEmail } from "./email";
import { stripe, stripeEnabled } from "./stripe";

/**
 * The live trial behind an account, for the trialist welcome (2026-09-24):
 * one Stripe read per trialist, of whom there are a handful a day. null when
 * there is no trialing subscription (it converted, ended, or the lookup
 * failed) — the caller then sends the ordinary welcome.
 */
async function liveTrial(stripeCustomerId: string | null) {
  if (!stripeCustomerId || !stripeEnabled()) return null;
  try {
    const subs = await stripe().subscriptions.list({
      customer: stripeCustomerId,
      status: "trialing",
      limit: 1,
      expand: ["data.items.data.price"],
    });
    const sub = subs.data[0];
    if (!sub?.trial_end) return null;
    const price = sub.items.data[0]?.price as Stripe.Price | undefined;
    const interval = price?.recurring?.interval;
    const coupon = sub.discount?.coupon;
    return {
      planName: tierFromPriceId(price?.id) === "plus" ? "Plus" : "Premium",
      endsAt: new Date(sub.trial_end * 1000),
      cancelling: subscriptionIsCancelling(sub),
      chargeLine: subscriptionChargeLine({
        unitAmount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
        interval: interval === "month" || interval === "year" ? interval : null,
        introAmountOff: coupon && isIntroCouponId(coupon.id) ? coupon.amount_off ?? 0 : 0,
      }),
    };
  } catch {
    return null;
  }
}

export const WELCOME_WINDOW_HOURS = 72;
const MIN_AGE_MINUTES = 10;
const BATCH = 100;

export async function runWelcomeEmails(now = Date.now()): Promise<{ candidates: number; sent: number; failed: number }> {
  const users = await prisma.user.findMany({
    where: {
      AND: [
        NOT_SEED_WHERE,
        {
          welcomeEmailSentAt: null,
          isAdmin: false,
          createdAt: { gte: new Date(now - WELCOME_WINDOW_HOURS * 3600_000), lte: new Date(now - MIN_AGE_MINUTES * 60_000) },
        },
      ],
    },
    select: { id: true, email: true, displayName: true, trialStartedAt: true, stripeCustomerId: true },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    const claim = await prisma.user.updateMany({
      where: { id: u.id, welcomeEmailSentAt: null },
      data: { welcomeEmailSentAt: new Date() },
    });
    if (claim.count === 0) continue; // another run got there first

    let ok = false;
    try {
      // Already in a trial: the enrolment confirmation, not the free pitch.
      const trial = u.trialStartedAt ? await liveTrial(u.stripeCustomerId) : null;
      ok = trial
        ? await sendTrialWelcomeEmail(u.email, { displayName: u.displayName, ...trial })
        : await sendWelcomeEmail(u.email, {
        displayName: u.displayName,
        // A brand-new account has never had a trial, but read it rather than
        // assume it: an account can be created, subscribe and cancel inside the
        // ten-minute wait.
        trialDays: premiumTrialEnabled() && !u.trialStartedAt ? PREMIUM_TRIAL_DAYS : 0,
        // Intro-aware (lib/site.ts intro block): the monthly half-price months,
        // or the annual rate.
        fromLine: introOfferEnabled() ? `${introPriceLine()}, or ${PREMIUM_ANNUAL_AMOUNT}/yr` : premiumFromLine(),
        zeroToday: premiumZeroToday(),
      });
    } catch {
      ok = false;
    }
    if (ok) {
      sent++;
    } else {
      failed++;
      await prisma.user.update({ where: { id: u.id }, data: { welcomeEmailSentAt: null } }).catch(() => {});
    }
  }
  return { candidates: users.length, sent, failed };
}
