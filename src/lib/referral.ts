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
import { grantPremiumDays, REFERRAL_PREMIUM_DAYS, REFERRED_PREMIUM_DAYS } from "./premium";
import { REFERRAL_COOKIE } from "./referral-cookie";
import { rewardReferral } from "./coins-server";
import { CURRENT_GIVEAWAY, giveawayState } from "./giveaway";

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

    // Both sides get a week (owner, 2026-11-18): the referrer per friend who joins,
    // and the friend's new account once (best-effort, extend-only).
    // Called exactly once per new signup (cookie is cleared above), so it's one grant
    // per referred user. No-op when REFERRAL_PREMIUM_DAYS=0.
    await grantPremiumDays(referrer.id, REFERRAL_PREMIUM_DAYS).catch(() => {});
    await grantPremiumDays(newUserId, REFERRED_PREMIUM_DAYS).catch(() => {});
    // One Counter row a month (referral:YYYY-MM), so the invite programme has a real
    // sign-up count: one upsert per referred sign-up, nothing per visit.
    const month = new Date().toISOString().slice(0, 7);
    await prisma.counter
      .upsert({ where: { key: `referral:${month}` }, create: { key: `referral:${month}`, value: 1 }, update: { value: { increment: 1 } } })
      .catch(() => {});
    // And five coin pulls, if the referrer is a Premium member (RiftCompare
    // Coins, lib/coins-server.ts). Keyed by the new account, so once per friend.
    await rewardReferral(referrer.id, newUserId);
    // A friend who joins while a giveaway is open can earn the inviter a bonus entry (lib/giveaway.ts).
    if (giveawayState(CURRENT_GIVEAWAY, new Date()) === "open") {
      await prisma.giveawayReferral
        .create({ data: { giveaway: CURRENT_GIVEAWAY.key, referrerId: referrer.id, referredId: newUserId }, select: { id: true } })
        .catch(() => {});
    }
  } catch {
    // Referral is a bonus, never a gate — swallow everything.
  }
}
