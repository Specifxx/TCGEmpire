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
import { NOT_SEED_WHERE, PREMIUM_TRIAL_DAYS, premiumTrialEnabled } from "./premium";
import { premiumFromLine, premiumZeroToday } from "./site";
import { sendWelcomeEmail } from "./email";

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
    select: { id: true, email: true, displayName: true, trialStartedAt: true },
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
      ok = await sendWelcomeEmail(u.email, {
        displayName: u.displayName,
        // A brand-new account has never had a trial, but read it rather than
        // assume it: an account can be created, subscribe and cancel inside the
        // ten-minute wait.
        trialDays: premiumTrialEnabled() && !u.trialStartedAt ? PREMIUM_TRIAL_DAYS : 0,
        fromLine: premiumFromLine(),
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
