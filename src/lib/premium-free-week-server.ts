// The free Premium week's database half (lib/premium-free-week.ts holds the rules). Called once, from the three
// places a NEW account is created (OAuth, emailed sign-in link, a sister site's sign-in); never on a later sign-in.
import { prisma } from "./db";
import { FREE_WEEK, freeWeekArm, freeWeekCounterKey, freeWeekGrantFor, freeWeekUntil, type FreeWeekArm } from "./premium-free-week";

/**
 * Give a brand-new account its free week when the test puts it in arm "b". Best effort: a failure here must never
 * break a sign-in, so callers `.catch(() => {})`. Writes premiumUntil (extend-only) and premiumTier "premium" only
 * when the account had no active period, plus the Counter row that marks it as a free-week account (the checkout
 * reads that row to let a free-week member start the 14-day card trial before the week ends).
 */
export async function grantFreeWeekIfNew(userId: string, now: number = Date.now()): Promise<boolean> {
  if (!freeWeekGrantFor(userId, now)) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true, stripeCustomerId: true, isAdmin: true } });
  if (!u || u.isAdmin || u.stripeCustomerId) return false;
  const current = u.premiumUntil ? u.premiumUntil.getTime() : null;
  const hadActive = current !== null && current > now;
  const until = freeWeekUntil(now, current);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { premiumUntil: new Date(until), ...(hadActive ? {} : { premiumTier: "premium" }) } }),
    prisma.counter.upsert({
      where: { key: freeWeekCounterKey(userId) },
      create: { key: freeWeekCounterKey(userId), value: Math.floor(until / 1000) },
      update: {},
    }),
  ]);
  return true;
}

/** The end of this account's free week (a Date), or null when it never had one. */
export async function freeWeekEnd(userId: string): Promise<Date | null> {
  const row = await prisma.counter.findUnique({ where: { key: freeWeekCounterKey(userId) }, select: { value: true } });
  return row ? new Date(row.value * 1000) : null;
}

/**
 * May this signed-in account start checkout although it is entitled? Only a free-week member with no Stripe customer
 * (so no subscription to double): their 14-day card trial then starts now, and the webhook's extend-only stamp keeps
 * whichever date is later. Everyone else entitled stays fenced off, as before.
 */
export async function freeWeekMayCheckout(user: { id: string; stripeCustomerId: string | null; isAdmin?: boolean }): Promise<boolean> {
  if (user.isAdmin || user.stripeCustomerId) return false;
  // A member who bought a pass (lib/premium-pass.ts) is paying: never a second checkout on top.
  if (await prisma.counter.findUnique({ where: { key: `pass:u:${user.id}` }, select: { key: true } }).catch(() => null)) return false;
  const end = await freeWeekEnd(user.id).catch(() => null);
  return !!end && end.getTime() > Date.now();
}

export interface FreeWeekArmRead {
  arm: FreeWeekArm;
  accounts: number;
  /** Started a Stripe checkout trial or paid (a Stripe customer or a trial start on the account). */
  started: number;
  /** Premium now AND a Stripe customer: paying or in the card trial, not just the free week. */
  payingNow: number;
}

/** The test's read for /admin/premium: accounts created in the window, split by arm (sister sign-ups included). */
export async function freeWeekRead(): Promise<FreeWeekArmRead[]> {
  const rows = await prisma.user.findMany({
    where: { createdAt: { gte: new Date(FREE_WEEK.start), lt: new Date(FREE_WEEK.end) }, isAdmin: false },
    select: { id: true, stripeCustomerId: true, trialStartedAt: true, premiumUntil: true },
    // A two-week window of sign-ups is a few hundred rows; the cap keeps an admin read bounded whatever happens.
    take: 5000,
  });
  const now = Date.now();
  const out: Record<FreeWeekArm, FreeWeekArmRead> = {
    a: { arm: "a", accounts: 0, started: 0, payingNow: 0 },
    b: { arm: "b", accounts: 0, started: 0, payingNow: 0 },
  };
  for (const r of rows) {
    const o = out[freeWeekArm(r.id)];
    o.accounts++;
    if (r.stripeCustomerId || r.trialStartedAt) o.started++;
    if (r.stripeCustomerId && r.premiumUntil && r.premiumUntil.getTime() > now) o.payingNow++;
  }
  return [out.a, out.b];
}
