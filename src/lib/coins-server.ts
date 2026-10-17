// RiftCompare Coins and Riftcoins — the wallet (server only). The rules are
// lib/coins.ts; this file is the only writer of CoinWallet, CoinTask, CoinOwned
// and BadgeOwned. DECISIONS.md, "RiftCompare Coins" and "Riftcoins".
//
// Egress (lib/db.ts rules): every read is one member's rows by primary key or
// by (userId, createdAt) — a wallet row, at most twelve owned coins and six
// badges, today's task rows. Nothing here is cached and nothing reads across
// members.
//
// Every reward is idempotent through CoinTask's unique (userId, task, key): the
// task row and the wallet increment go in ONE batch transaction, so a retried
// or duplicated claim fails on the key and pays nothing. A Premium redemption
// uses the same key (one per calendar month) for the same reason.
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { grantPremiumDays, isPremium, type EntitlementUser } from "./premium";
import {
  BADGES,
  COINS,
  PREMIUM_REDEEM_COST,
  PREMIUM_REDEEM_DAYS,
  SHARDS_FOR_DUPLICATE,
  SHARDS_FOR_DUPLICATE_BADGE,
  SHARDS_PER_PULL,
  SPIN_COST,
  badgeById,
  dayKey,
  nextStreak,
  redeemBlocker,
  redeemKey,
  roll,
  rollBadge,
  streakBonusDue,
  taskById,
  taskReward,
  TASKS,
  type ArcadeGame,
  type Badge,
  type Coin,
  type TaskId,
} from "./coins";

/**
 * Every signed-in member earns and spends Riftcoins (owner, 2026-10-17: "Every
 * signed-in user"). Until then the collection was a Premium perk; Premium now
 * earns PREMIUM_BOOST times as much instead (premiumBoost below).
 */
export function coinsEnabledFor(user: { id?: string } | null | undefined): boolean {
  return !!user;
}

/** Premium members (the top tier; admins count, as everywhere) earn double. */
export function premiumBoost(user: EntitlementUser | null | undefined): boolean {
  return isPremium(user, "premium");
}

/** Any active paid entitlement, Plus included: free Premium is for accounts without one. */
export function hasPaidPlan(user: EntitlementUser | null | undefined): boolean {
  return isPremium(user, "plus");
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const isNotFound = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
const rand = () => randomInt(0, 1_000_000) / 1_000_000;

function startOfDay(now: Date): Date {
  return new Date(`${dayKey(now)}T00:00:00Z`);
}

/** Pay one task once under `key`. Returns the Riftcoins paid (0 when already paid). */
async function pay(userId: string, task: TaskId, key: string, riftcoins: number, wallet: { streak?: number; lastCheckIn?: string } = {}): Promise<number> {
  try {
    await prisma.$transaction([
      prisma.coinTask.create({ data: { userId, task, key, riftcoins } }),
      prisma.coinWallet.upsert({
        where: { userId },
        create: { userId, riftcoins, ...wallet },
        update: { riftcoins: { increment: riftcoins }, ...wallet },
      }),
    ]);
    return riftcoins;
  } catch (e) {
    if (isUniqueViolation(e)) return 0;
    throw e;
  }
}

/** A capped daily task: pays while today's count is under the cap. */
async function payCapped(userId: string, task: TaskId, premium: boolean, now: Date, keyFor: (n: number) => string): Promise<number> {
  const t = taskById(task)!;
  const done = await prisma.coinTask.count({ where: { userId, task, createdAt: { gte: startOfDay(now) } } });
  if (t.perDay != null && done >= t.perDay) return 0;
  return pay(userId, task, keyFor(done + 1), taskReward(task, premium));
}

export type ClaimResult = { paid: number; task: TaskId; bonus?: number };

/**
 * A task the browser claims: welcome, daily (with its streak bonus), share,
 * visit, and a finished arcade game. The caller has checked the member is
 * signed in and passes whether they earn the Premium boost.
 */
export async function claimTask(userId: string, task: TaskId, premium: boolean, opts: { game?: ArcadeGame; now?: Date } = {}): Promise<ClaimResult> {
  const now = opts.now ?? new Date();
  const today = dayKey(now);
  if (task === "welcome") return { task, paid: await pay(userId, "welcome", "once", taskReward("welcome", premium)) };
  if (task === "share" || task === "visit") {
    return { task, paid: await payCapped(userId, task, premium, now, (n) => `${today}:${n}`) };
  }
  // Once per game per day: the key is the game, so a replay of the same game pays nothing.
  if (task === "arcade") {
    if (!opts.game) return { task, paid: 0 };
    const game = opts.game;
    return { task, paid: await payCapped(userId, "arcade", premium, now, () => `${today}:${game}`) };
  }
  if (task === "daily") {
    const w = await prisma.coinWallet.findUnique({ where: { userId }, select: { lastCheckIn: true, streak: true } });
    if (w?.lastCheckIn === today) return { task, paid: 0 };
    const streak = nextStreak(w?.lastCheckIn ?? null, w?.streak ?? 0, today);
    const paid = await pay(userId, "daily", today, taskReward("daily", premium), { streak, lastCheckIn: today });
    let bonus = 0;
    if (paid && streakBonusDue(streak)) bonus = await pay(userId, "streak", today, taskReward("streak", premium));
    return { task, paid, bonus };
  }
  return { task, paid: 0 };
}

/** Called by the watchlist route after a member watches a card. Never throws. */
export async function rewardWatch(user: EntitlementUser & { id: string }, cardId: string, now = new Date()): Promise<number> {
  try {
    if (!coinsEnabledFor(user)) return 0;
    return await payCapped(user.id, "watch", premiumBoost(user), now, () => `card:${cardId}`);
  } catch (e) {
    console.error("[coins] watch reward failed", e);
    return 0;
  }
}

/** Called once per new signup that came through a member's invite link. Never throws. */
export async function rewardReferral(referrerId: string, newUserId: string): Promise<number> {
  try {
    const referrer = await prisma.user.findUnique({
      where: { id: referrerId },
      select: { id: true, premiumUntil: true, isAdmin: true, premiumTier: true, premiumTierFloor: true },
    });
    if (!coinsEnabledFor(referrer)) return 0;
    return await pay(referrerId, "referral", newUserId, taskReward("referral", premiumBoost(referrer)));
  } catch (e) {
    console.error("[coins] referral reward failed", e);
    return 0;
  }
}

// ── The slot ───────────────────────────────────────────────────────────────────

/** What a spin is paid with: Riftcoins, a pull left over from the 2026-10-16 tasks, or shards. */
export type SpinPayment = "riftcoins" | "pull" | "shards";

export type SpinResult =
  | { ok: true; coin: Coin; isNew: boolean; count: number; shards: number; forced: boolean; badge: Badge | null; badgeIsNew: boolean }
  | { ok: false; reason: "cant-pay" | "busy" };

/**
 * One spin of the slot: a champion coin (lib/coins.ts roll, with its pity) and
 * a chance at a profile badge (rollBadge, with its own pity). Both rolls use
 * crypto randomness, here, never in the browser. A spin pays out only
 * collectibles — coins, badges and shards — never Riftcoins.
 *
 * The wallet update is conditional on `pullsMade` being the value read (and on
 * the balance it spends), so two spins at once cannot share one pity state or
 * one payment: the loser re-reads and tries again.
 */
export async function spin(userId: string, payment: SpinPayment): Promise<SpinResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [w, ownedBadges] = await Promise.all([
      prisma.coinWallet.findUnique({ where: { userId } }),
      prisma.badgeOwned.findMany({ where: { userId }, select: { badgeId: true }, take: BADGES.length + 2 }),
    ]);
    if (!w) return { ok: false, reason: "cant-pay" };
    const canPay = payment === "riftcoins" ? w.riftcoins >= SPIN_COST : payment === "shards" ? w.shards >= SHARDS_PER_PULL : w.pulls >= 1;
    if (!canPay) return { ok: false, reason: "cant-pay" };

    const r = roll(rand(), rand(), { sinceEpic: w.sinceEpic, sinceLegendary: w.sinceLegendary });
    const b = rollBadge(rand(), rand(), w.sinceBadge, ownedBadges.map((o) => o.badgeId));
    const owned = await prisma.coinOwned.findUnique({ where: { userId_coinId: { userId, coinId: r.coin.id } }, select: { count: true } });
    const isNew = !owned || owned.count < 1;
    const badgeIsNew = !!b.badge && !ownedBadges.some((o) => o.badgeId === b.badge!.id);
    const shardGain = (isNew ? 0 : SHARDS_FOR_DUPLICATE[r.coin.rarity]) + (b.badge && !badgeIsNew ? SHARDS_FOR_DUPLICATE_BADGE : 0);

    const spend =
      payment === "riftcoins"
        ? { where: { riftcoins: { gte: SPIN_COST } }, data: { riftcoins: { decrement: SPIN_COST }, shards: { increment: shardGain } } }
        : payment === "shards"
          ? { where: { shards: { gte: SHARDS_PER_PULL } }, data: { shards: { increment: shardGain - SHARDS_PER_PULL } } }
          : { where: { pulls: { gte: 1 } }, data: { pulls: { decrement: 1 }, shards: { increment: shardGain } } };
    const spent = await prisma.coinWallet.updateMany({
      where: { userId, pullsMade: w.pullsMade, ...spend.where },
      data: {
        pullsMade: { increment: 1 },
        ...spend.data,
        sinceEpic: r.pity.sinceEpic,
        sinceLegendary: r.pity.sinceLegendary,
        sinceBadge: b.sinceBadge,
      },
    });
    if (spent.count !== 1) continue;

    const row = await prisma.coinOwned.upsert({
      where: { userId_coinId: { userId, coinId: r.coin.id } },
      create: { userId, coinId: r.coin.id, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    if (badgeIsNew) {
      await prisma.badgeOwned.upsert({
        where: { userId_badgeId: { userId, badgeId: b.badge!.id } },
        create: { userId, badgeId: b.badge!.id },
        update: {},
      });
    }
    return { ok: true, coin: r.coin, isNew, count: row.count, shards: shardGain, forced: r.forced, badge: b.badge, badgeIsNew };
  }
  return { ok: false, reason: "busy" };
}

/** Show a badge the member owns on their profile, or none (null). */
export async function equipBadge(userId: string, badgeId: string | null): Promise<boolean> {
  if (badgeId !== null) {
    if (!badgeById(badgeId)) return false;
    const owns = await prisma.badgeOwned.findUnique({ where: { userId_badgeId: { userId, badgeId } }, select: { badgeId: true } });
    if (!owns) return false;
  }
  await prisma.coinWallet.upsert({ where: { userId }, create: { userId, badge: badgeId }, update: { badge: badgeId } });
  return true;
}

/** The badge a member shows on their profile, if any. One row by key. */
export async function equippedBadge(userId: string): Promise<Badge | null> {
  const w = await prisma.coinWallet.findUnique({ where: { userId }, select: { badge: true } });
  return w?.badge ? badgeById(w.badge) ?? null : null;
}

// ── Free Premium ───────────────────────────────────────────────────────────────

export type RedeemResult = { ok: true; until: Date } | { ok: false; reason: "paid-plan" | "this-month" | "short" | "failed" };

/**
 * Spend PREMIUM_REDEEM_COST Riftcoins on PREMIUM_REDEEM_DAYS of Premium, once a
 * calendar month, for an account with no active paid plan (Plus included: on
 * top of a subscription the days would mostly be swallowed by the period being
 * paid for, so offering them would be a promise that quietly does nothing).
 *
 * The month's task row and the debit are one transaction: a second redemption
 * this month fails on the key (P2002), and a balance that is short fails the
 * conditional update (P2025), and either way nothing is spent. If the grant
 * then fails, the spend is put back.
 */
export async function redeemPremium(user: EntitlementUser & { id: string }, now = new Date()): Promise<RedeemResult> {
  if (hasPaidPlan(user)) return { ok: false, reason: "paid-plan" };
  const key = redeemKey(now);
  try {
    await prisma.$transaction([
      prisma.coinTask.create({ data: { userId: user.id, task: "redeem", key, riftcoins: -PREMIUM_REDEEM_COST } }),
      prisma.coinWallet.update({
        where: { userId: user.id, riftcoins: { gte: PREMIUM_REDEEM_COST } },
        data: { riftcoins: { decrement: PREMIUM_REDEEM_COST } },
      }),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "this-month" };
    if (isNotFound(e)) return { ok: false, reason: "short" };
    throw e;
  }
  try {
    const until = await grantPremiumDays(user.id, PREMIUM_REDEEM_DAYS, "premium");
    if (!until) throw new Error("grantPremiumDays returned null");
    return { ok: true, until };
  } catch (e) {
    console.error("[coins] premium grant failed, refunding", e);
    await prisma
      .$transaction([
        prisma.coinTask.delete({ where: { userId_task_key: { userId: user.id, task: "redeem", key } } }),
        prisma.coinWallet.update({ where: { userId: user.id }, data: { riftcoins: { increment: PREMIUM_REDEEM_COST } } }),
      ])
      .catch((err) => console.error("[coins] refund failed", err));
    return { ok: false, reason: "failed" };
  }
}

// ── The page's view ────────────────────────────────────────────────────────────

export interface CoinState {
  riftcoins: number;
  pulls: number;
  shards: number;
  pullsMade: number;
  sinceEpic: number;
  sinceLegendary: number;
  sinceBadge: number;
  streak: number;
  checkedInToday: boolean;
  owned: Record<string, number>;
  badges: string[];
  badge: string | null;
  /** Per task: how many times it has paid today (or ever, for once-only tasks). */
  done: Partial<Record<TaskId, number>>;
  /** Earns PREMIUM_BOOST times the Riftcoins. */
  boosted: boolean;
  /** Why "Get a week of Premium" is unavailable, or null when it can be redeemed. */
  redeemBlocker: "paid-plan" | "this-month" | "short" | null;
}

export async function coinState(user: EntitlementUser & { id: string }, now = new Date()): Promise<CoinState> {
  const userId = user.id;
  const [w, owned, badges, today, welcome, redeemed] = await Promise.all([
    prisma.coinWallet.findUnique({ where: { userId } }),
    prisma.coinOwned.findMany({ where: { userId }, select: { coinId: true, count: true }, take: COINS.length + 4 }),
    prisma.badgeOwned.findMany({ where: { userId }, select: { badgeId: true }, take: BADGES.length + 2 }),
    prisma.coinTask.groupBy({ by: ["task"], where: { userId, createdAt: { gte: startOfDay(now) } }, _count: { _all: true } }),
    prisma.coinTask.count({ where: { userId, task: "welcome" } }),
    prisma.coinTask.findUnique({ where: { userId_task_key: { userId, task: "redeem", key: redeemKey(now) } }, select: { id: true } }),
  ]);
  const done: Partial<Record<TaskId, number>> = {};
  for (const t of TASKS) done[t.id] = 0;
  for (const g of today) if (taskById(g.task)) done[g.task as TaskId] = g._count._all;
  done.welcome = welcome;
  const riftcoins = w?.riftcoins ?? 0;
  return {
    riftcoins,
    pulls: w?.pulls ?? 0,
    shards: w?.shards ?? 0,
    pullsMade: w?.pullsMade ?? 0,
    sinceEpic: w?.sinceEpic ?? 0,
    sinceLegendary: w?.sinceLegendary ?? 0,
    sinceBadge: w?.sinceBadge ?? 0,
    streak: w?.streak ?? 0,
    checkedInToday: w?.lastCheckIn === dayKey(now),
    owned: Object.fromEntries(owned.map((o) => [o.coinId, o.count])),
    badges: badges.map((b) => b.badgeId),
    badge: w?.badge ?? null,
    done,
    boosted: premiumBoost(user),
    redeemBlocker: redeemBlocker({ riftcoins, redeemedThisMonth: !!redeemed }, { hasPaidPlan: hasPaidPlan(user) }),
  };
}
