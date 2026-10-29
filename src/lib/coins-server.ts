// RiftCompare Coins — the wallet (server only). The rules are lib/coins.ts;
// this file is the only writer of CoinWallet, CoinTask and CoinOwned.
// DECISIONS.md, "RiftCompare Coins".
//
// Egress (lib/db.ts rules): every read is one member's rows by primary key or
// by (userId, createdAt) — a wallet row, at most twelve owned rows, today's
// task rows. Nothing here is cached and nothing reads across members.
//
// Every reward is idempotent through CoinTask's unique (userId, task, key): the
// task row and the wallet increment go in ONE batch transaction, so a retried
// or duplicated claim fails on the key and pays nothing.
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { isPremium, type EntitlementUser } from "./premium";
import {
  COINS,
  COINS_ENABLED,
  SHARDS_FOR_DUPLICATE,
  SHARDS_PER_PULL,
  dayKey,
  nextStreak,
  roll,
  streakBonusDue,
  taskById,
  TASKS,
  type Coin,
  type TaskId,
} from "./coins";

/** Coins are a Premium perk (the top tier; admins count, as everywhere). */
export const COIN_TIER = "premium" as const;
export function coinsEnabledFor(user: EntitlementUser | null | undefined): boolean {
  return COINS_ENABLED && isPremium(user, COIN_TIER);
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function startOfDay(now: Date): Date {
  return new Date(`${dayKey(now)}T00:00:00Z`);
}

/** Pay one task once under `key`. Returns the pulls paid (0 when already paid). */
async function pay(userId: string, task: TaskId, key: string, pulls: number, wallet: { streak?: number; lastCheckIn?: string } = {}): Promise<number> {
  try {
    await prisma.$transaction([
      prisma.coinTask.create({ data: { userId, task, key, pulls } }),
      prisma.coinWallet.upsert({
        where: { userId },
        create: { userId, pulls, ...wallet },
        update: { pulls: { increment: pulls }, ...wallet },
      }),
    ]);
    return pulls;
  } catch (e) {
    if (isUniqueViolation(e)) return 0;
    throw e;
  }
}

/** A capped daily task: pays while today's count is under the cap. */
async function payCapped(userId: string, task: TaskId, now: Date, keyFor: (n: number) => string): Promise<number> {
  const t = taskById(task)!;
  const done = await prisma.coinTask.count({ where: { userId, task, createdAt: { gte: startOfDay(now) } } });
  if (t.perDay != null && done >= t.perDay) return 0;
  return pay(userId, task, keyFor(done + 1), t.pulls);
}

export type ClaimResult = { paid: number; task: TaskId; bonus?: number };

/**
 * A task the browser claims: welcome, daily (with its streak bonus), share,
 * visit. The caller has checked the member is coin-eligible.
 */
export async function claimTask(userId: string, task: TaskId, now = new Date()): Promise<ClaimResult> {
  const today = dayKey(now);
  if (task === "welcome") return { task, paid: await pay(userId, "welcome", "once", taskById("welcome")!.pulls) };
  if (task === "share" || task === "visit") {
    return { task, paid: await payCapped(userId, task, now, (n) => `${today}:${n}`) };
  }
  if (task === "daily") {
    const w = await prisma.coinWallet.findUnique({ where: { userId }, select: { lastCheckIn: true, streak: true } });
    if (w?.lastCheckIn === today) return { task, paid: 0 };
    const streak = nextStreak(w?.lastCheckIn ?? null, w?.streak ?? 0, today);
    const paid = await pay(userId, "daily", today, taskById("daily")!.pulls, { streak, lastCheckIn: today });
    let bonus = 0;
    if (paid && streakBonusDue(streak)) bonus = await pay(userId, "streak", today, taskById("streak")!.pulls);
    return { task, paid, bonus };
  }
  return { task, paid: 0 };
}

/** Called by the watchlist route after a member watches a card. Never throws. */
export async function rewardWatch(user: EntitlementUser & { id: string }, cardId: string, now = new Date()): Promise<number> {
  try {
    if (!coinsEnabledFor(user)) return 0;
    return await payCapped(user.id, "watch", now, () => `card:${cardId}`);
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
      select: { premiumUntil: true, isAdmin: true, premiumTier: true, premiumTierFloor: true },
    });
    if (!coinsEnabledFor(referrer)) return 0;
    return await pay(referrerId, "referral", newUserId, taskById("referral")!.pulls);
  } catch (e) {
    console.error("[coins] referral reward failed", e);
    return 0;
  }
}

// ── Pulling ────────────────────────────────────────────────────────────────────

export type PullResult =
  | { ok: true; coin: Coin; isNew: boolean; count: number; shards: number; forced: boolean }
  | { ok: false; reason: "no-pulls" | "busy" };

/**
 * Spend one pull (or SHARDS_PER_PULL shards) and reveal a coin. The roll uses
 * crypto randomness. The wallet update is conditional on `pullsMade` being the
 * value read, so two pulls at once cannot share one pity state or one pull:
 * the loser re-reads and tries again.
 */
export async function pull(userId: string, useShards = false): Promise<PullResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const w = await prisma.coinWallet.findUnique({ where: { userId } });
    if (!w) return { ok: false, reason: "no-pulls" };
    if (useShards ? w.shards < SHARDS_PER_PULL : w.pulls < 1) return { ok: false, reason: "no-pulls" };
    const r = roll(randomInt(0, 1_000_000) / 1_000_000, randomInt(0, 1_000_000) / 1_000_000, {
      sinceEpic: w.sinceEpic,
      sinceLegendary: w.sinceLegendary,
    });
    const owned = await prisma.coinOwned.findUnique({ where: { userId_coinId: { userId, coinId: r.coin.id } }, select: { count: true } });
    const isNew = !owned || owned.count < 1;
    const shardGain = isNew ? 0 : SHARDS_FOR_DUPLICATE[r.coin.rarity];
    const spent = await prisma.coinWallet.updateMany({
      where: { userId, pullsMade: w.pullsMade, ...(useShards ? { shards: { gte: SHARDS_PER_PULL } } : { pulls: { gte: 1 } }) },
      data: {
        pullsMade: { increment: 1 },
        ...(useShards ? { shards: { increment: shardGain - SHARDS_PER_PULL } } : { pulls: { decrement: 1 }, shards: { increment: shardGain } }),
        sinceEpic: r.pity.sinceEpic,
        sinceLegendary: r.pity.sinceLegendary,
      },
    });
    if (spent.count !== 1) continue;
    const row = await prisma.coinOwned.upsert({
      where: { userId_coinId: { userId, coinId: r.coin.id } },
      create: { userId, coinId: r.coin.id, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return { ok: true, coin: r.coin, isNew, count: row.count, shards: shardGain, forced: r.forced };
  }
  return { ok: false, reason: "busy" };
}

// ── The page's view ────────────────────────────────────────────────────────────

export interface CoinState {
  pulls: number;
  shards: number;
  pullsMade: number;
  sinceEpic: number;
  sinceLegendary: number;
  streak: number;
  checkedInToday: boolean;
  owned: Record<string, number>;
  /** Per task: how many times it has paid today (or ever, for once-only tasks). */
  done: Partial<Record<TaskId, number>>;
}

export async function coinState(userId: string, now = new Date()): Promise<CoinState> {
  const [w, owned, today, welcome] = await Promise.all([
    prisma.coinWallet.findUnique({ where: { userId } }),
    prisma.coinOwned.findMany({ where: { userId }, select: { coinId: true, count: true }, take: COINS.length + 4 }),
    prisma.coinTask.groupBy({ by: ["task"], where: { userId, createdAt: { gte: startOfDay(now) } }, _count: { _all: true } }),
    prisma.coinTask.count({ where: { userId, task: "welcome" } }),
  ]);
  const done: Partial<Record<TaskId, number>> = {};
  for (const t of TASKS) done[t.id] = 0;
  for (const g of today) if (taskById(g.task)) done[g.task as TaskId] = g._count._all;
  done.welcome = welcome;
  return {
    pulls: w?.pulls ?? 0,
    shards: w?.shards ?? 0,
    pullsMade: w?.pullsMade ?? 0,
    sinceEpic: w?.sinceEpic ?? 0,
    sinceLegendary: w?.sinceLegendary ?? 0,
    streak: w?.streak ?? 0,
    checkedInToday: w?.lastCheckIn === dayKey(now),
    owned: Object.fromEntries(owned.map((o) => [o.coinId, o.count])),
    done,
  };
}
