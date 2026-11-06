import { prisma } from "./db";

/**
 * Attach an account to the price watches its owner created before signing in.
 *
 * Price alerts shipped account-free: the wishlist pop-up asks for an email and
 * nothing else, so a row's only identity is its address. Someone who watched a
 * few cards anonymously and registered afterwards would otherwise never see
 * those watches on /watchlist — they would be invisible but still emailing, the
 * worst of both.
 *
 * Called on every sign-in (register, login, OAuth callback) rather than once at
 * migration time, because the anonymous flow still exists: a person can watch
 * cards today and create an account next week, and that gap never closes.
 *
 * Idempotent and cheap: it only matches rows that are still unclaimed, so it is
 * a no-op updateMany once there is nothing left to adopt. Safe to call on every
 * session start and safe to fire-and-forget.
 *
 * Exact lowercase equality is correct — PriceAlert.email is stored trimmed and
 * lowercased (the zod schema on the subscribe route enforces it) and every
 * User.email write path lowercases too.
 */
export async function claimAlertsForUser(userId: string, email: string): Promise<number> {
  const addr = email.trim().toLowerCase();
  if (!addr) return 0;
  const res = await prisma.priceAlert
    .updateMany({ where: { email: addr, userId: null }, data: { userId } })
    .catch(() => ({ count: 0 }));
  // Sealed watches made from the sealed page's email form (2026-11-06) are
  // adopted the same way. The account may already watch the same product in
  // the same market (the unique key on userId, groupKey, market): that
  // anonymous twin is dropped first, since the account's row is the one the
  // member can see and edit. A failure here never blocks a sign-in.
  const sealed = await prisma.sealedWatch
    .findMany({ where: { email: addr, userId: null }, select: { id: true, groupKey: true, market: true }, take: 200 })
    .then(async (rows) => {
      if (!rows.length) return 0;
      const owned = await prisma.sealedWatch.findMany({ where: { userId }, select: { groupKey: true, market: true }, take: 500 });
      const has = new Set(owned.map((r) => `${r.market}|${r.groupKey}`));
      const dupes = rows.filter((r) => has.has(`${r.market}|${r.groupKey}`)).map((r) => r.id);
      if (dupes.length) await prisma.sealedWatch.deleteMany({ where: { id: { in: dupes } } });
      const out = await prisma.sealedWatch.updateMany({ where: { email: addr, userId: null }, data: { userId } });
      return out.count;
    })
    .catch(() => 0);
  return res.count + sealed;
}
