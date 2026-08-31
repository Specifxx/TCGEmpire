// Referral attribution. We use the referrer's own User.id as the share code, so
// there's no extra table or migration: a link like riftcompare.com/?ref=<userId>
// drops a cookie (see components/ReferralCapture), which we read here when the
// referred visitor creates an account.
//
// Server-only (imports prisma + next/headers). Call applyReferral() right after a
// NEW user is created (email register OR OAuth first sign-in). Best-effort — it
// must never block or fail signup.
import { cookies } from "next/headers";
import { prisma } from "./db";
import { grantPremiumDays, REFERRAL_PREMIUM_DAYS } from "./premium";
import { REFERRAL_COOKIE } from "./referral-cookie";

export { REFERRAL_COOKIE };

export async function applyReferral(newUserId: string): Promise<void> {
  try {
    const jar = cookies();
    const referrerId = jar.get(REFERRAL_COOKIE)?.value;
    // Clear immediately so this browser can't credit a second account.
    if (referrerId) jar.set(REFERRAL_COOKIE, "", { path: "/", maxAge: 0 });
    if (!referrerId || referrerId === newUserId) return;

    // Validate the referrer is a real, different account (ignores tampered codes).
    const referrer = await prisma.user.findUnique({
      where: { id: referrerId },
      select: { id: true },
    });
    if (!referrer || referrer.id === newUserId) return;

    // Reward the referrer with +3 days of Premium per friend who joins (best-effort).
    // Called exactly once per new signup (cookie is cleared above), so it's one grant
    // per referred user. No-op when REFERRAL_PREMIUM_DAYS=0.
    await grantPremiumDays(referrer.id, REFERRAL_PREMIUM_DAYS).catch(() => {});
  } catch {
    // Referral is a bonus, never a gate — swallow everything.
  }
}
