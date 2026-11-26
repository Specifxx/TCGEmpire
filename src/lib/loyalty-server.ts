import { prisma } from "@/lib/db";
import { getPremiumSubscriptionDetails, grantPremiumDays } from "@/lib/premium";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { checkinDay, checkinRuleOf, giveawayFor, giveawayState, type GiveawaySite } from "@/lib/giveaway";
import { canRedeem, LOYALTY_ENABLED, loyaltyState, redemptionSlot, REWARDS, rewardByKey, type LoyaltyState } from "@/lib/loyalty";

// Server half of member rewards (lib/loyalty.ts is pure). Per member, uncached, select-limited, called only from /api/* routes
// (/api/loyalty) and the giveaway's check-in: never from a page or the root layout.

const GIVEAWAY_SITE_KEYS = new Set<string>(["rift", "dex", "mtg", "ygo", "op"]);

/** Record the day's check-in (idempotent per Sydney day). Never throws: a failure only costs the member a point. */
export async function recordLoyaltyDay(userId: string, site: string, day = checkinDay(new Date())): Promise<boolean> {
  if (!LOYALTY_ENABLED) return false;
  try {
    await prisma.loyaltyDay.create({ data: { userId, day, site }, select: { id: true } });
    return true;
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") console.warn("[loyalty] check-in failed:", (e as Error).message);
    return false;
  }
}

/**
 * The member's check-in from a rewards card. It also checks in to the SAME site's open giveaway when the member has entered it
 * (one tap, both streaks) in a streak round, never another site's: each round's rules say the check-in is made on its own site.
 */
export async function loyaltyCheckIn(userId: string, site: string): Promise<void> {
  const day = checkinDay(new Date());
  await recordLoyaltyDay(userId, site, day);
  if (!GIVEAWAY_SITE_KEYS.has(site)) return;
  const g = giveawayFor(site as GiveawaySite, new Date());
  // Only a streak round, whose rules name the rewards card; the December 2026 rounds say "on this page" and keep to it.
  if (!g || giveawayState(g, new Date()) !== "open" || checkinRuleOf(g) !== "streak") return;
  const entered = await prisma.giveawayEntry
    .findUnique({ where: { giveaway_userId: { giveaway: g.key, userId } }, select: { id: true } })
    .catch(() => null);
  if (!entered) return;
  await prisma.giveawayCheckin.create({ data: { giveaway: g.key, userId, day }, select: { id: true } }).catch((e: unknown) => {
    if ((e as { code?: string })?.code !== "P2002") throw e;
  });
}

export interface MyLoyalty extends LoyaltyState {
  rewards: { key: string; title: string; points: number; available: boolean; reason: string | null }[];
  redeemed: { reward: string; points: number; at: string }[];
}

export async function myLoyalty(userId: string, now = new Date()): Promise<MyLoyalty> {
  const today = checkinDay(now);
  const [days, contrib, spent, recent, user] = await Promise.all([
    // Bounded: about five years of daily check-ins.
    prisma.loyaltyDay.findMany({ where: { userId }, select: { day: true }, orderBy: { day: "desc" }, take: 2000 }),
    prisma.contribution.aggregate({ where: { userId }, _sum: { points: true } }),
    prisma.loyaltyRedemption.aggregate({ where: { userId }, _sum: { points: true } }),
    prisma.loyaltyRedemption.findMany({ where: { userId }, select: { reward: true, points: true, slot: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true, stripeCustomerId: true } }),
  ]);
  const state = loyaltyState({ days: days.map((d) => d.day), contributionPoints: contrib._sum.points ?? 0, spent: spent._sum.points ?? 0 }, today);
  const slots = new Set(recent.map((r) => r.slot));
  const rewards = REWARDS.map((r) => {
    // Stripe is asked only when the member presses Redeem (a Stripe customer may be a lapsed one); the card checks the rest.
    const check = !user?.emailVerified
      ? { ok: false as const, error: "Confirm your email address first." }
      : canRedeem(r, { balance: state.balance, paying: false, slotTaken: slots.has(redemptionSlot(r, today)) });
    return { key: r.key, title: r.title, points: r.points, available: check.ok, reason: check.ok ? null : check.error };
  });
  return { ...state, rewards, redeemed: recent.map((r) => ({ reward: r.reward, points: r.points, at: r.createdAt.toISOString() })) };
}

/** Whether Stripe could not be asked about this customer (an outage), as opposed to "no live subscription". */
async function stripeUnreadable(customer: string): Promise<boolean> {
  if (!stripeEnabled()) return true;
  try {
    await stripe().customers.retrieve(customer);
    return false;
  } catch {
    return true;
  }
}

export type RedeemResult = { ok: true; premiumUntil: string | null } | { ok: false; status: number; error: string };

export async function redeemReward(userId: string, rewardKey: unknown, site: string): Promise<RedeemResult> {
  if (!LOYALTY_ENABLED) return { ok: false, status: 404, error: "Rewards are off." };
  const reward = rewardByKey(rewardKey);
  if (!reward) return { ok: false, status: 400, error: "Unknown reward." };
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true, stripeCustomerId: true } });
  if (!u) return { ok: false, status: 401, error: "Sign in again." };
  if (!u.emailVerified) return { ok: false, status: 403, error: "Confirm your email address first." };
  const today = checkinDay(new Date());
  const slot = redemptionSlot(reward, today);
  const mine = await myLoyalty(userId);
  // Fail closed: a Stripe customer whose subscription can't be read right now is treated as unknown, and nothing is granted.
  // Any live subscription (active, trialing, past due, even one set to cancel) counts as paying.
  let paying = false;
  if (reward.premiumDays > 0 && u.stripeCustomerId) {
    const sub = await getPremiumSubscriptionDetails(u.stripeCustomerId);
    if (sub) paying = true;
    else if (await stripeUnreadable(u.stripeCustomerId)) return { ok: false, status: 503, error: "Couldn't check your subscription. Try again in a minute." };
  }
  const taken = await prisma.loyaltyRedemption.findUnique({ where: { userId_slot: { userId, slot } }, select: { id: true } });
  const check = canRedeem(reward, { balance: mine.balance, paying, slotTaken: !!taken });
  if (!check.ok) return { ok: false, status: 409, error: check.error };
  let redemptionId: string;
  try {
    // The unique (userId, slot) makes two presses at once take one reward, never two.
    redemptionId = (await prisma.loyaltyRedemption.create({ data: { userId, reward: reward.key, points: reward.points, slot, site }, select: { id: true } })).id;
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return { ok: false, status: 409, error: "One Premium reward a month. Your next one opens on the 1st." };
    throw e;
  }
  try {
    const until = reward.premiumDays > 0 ? await grantPremiumDays(userId, reward.premiumDays) : null;
    return { ok: true, premiumUntil: until ? until.toISOString() : null };
  } catch (e) {
    // The grant failed: give the points and the month's slot back, so a retry works.
    await prisma.loyaltyRedemption.delete({ where: { id: redemptionId } }).catch(() => {});
    throw e;
  }
}
