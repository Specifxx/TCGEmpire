// ─────────────────────────────────────────────────────────────────────────────
// Shards — server engine. Awards, daily check-in, redemptions and the public badge
// lookup. All mutations go through an append-only PointsLedger so balances are
// auditable and one-off grants are idempotent (a unique (userId, dedupeKey) row).
//
// Server-only (imports prisma). Client components import lib/points-config instead.
// ─────────────────────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import {
  AWARDS,
  type AwardReason,
  checkinReward,
  levelFor,
  levelProgress,
  meetsLevel,
  nextLevel,
  rewardByKey,
  type PublicBadge,
  type Reward,
} from "./points-config";

// UTC day key, e.g. "2026-06-08". Used for daily caps + check-in dedupe.
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfUtcDay(): Date {
  return new Date(`${dayKey(new Date())}T00:00:00.000Z`);
}
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// Decode the JSON `ownedRewards` column into a clean string[].
export function parseOwned(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

// Grant Shards for a known engagement reason. Idempotent for one-time reasons and
// silently capped for daily-limited ones — returns the amount actually awarded (0
// if deduped or over the cap). Safe to call fire-and-forget from action handlers.
export async function awardPoints(
  userId: string,
  reason: AwardReason,
  opts?: { amount?: number; dedupeKey?: string; meta?: Prisma.InputJsonValue }
): Promise<number> {
  const cfg = AWARDS[reason];
  if (!cfg) return 0;
  const amount = opts?.amount ?? cfg.amount;
  const dedupeKey = cfg.oneTime ? reason : opts?.dedupeKey ?? null;

  // Enforce a per-UTC-day cap on repeatable awards.
  if (cfg.dailyCap) {
    const count = await prisma.pointsLedger.count({
      where: { userId, reason, createdAt: { gte: startOfUtcDay() } },
    });
    if (count >= cfg.dailyCap) return 0;
  }

  try {
    await prisma.$transaction([
      prisma.pointsLedger.create({
        data: { userId, delta: amount, reason, dedupeKey, meta: opts?.meta },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { points: { increment: amount }, lifetimePoints: { increment: amount } },
      }),
    ]);
    return amount;
  } catch (e) {
    if (isUniqueViolation(e)) return 0; // already granted (one-time) — no-op
    throw e;
  }
}

export interface CheckinResult {
  ok: boolean;
  already?: boolean;
  reward: number;
  streak: number;
}

// Claim the daily check-in. At most once per UTC day (enforced by the dedupe key);
// the streak grows the reward and resets if a day was missed.
export async function awardCheckin(userId: string): Promise<CheckinResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streakDays: true, lastCheckinAt: true },
  });
  if (!user) return { ok: false, reward: 0, streak: 0 };

  const today = dayKey(new Date());
  const last = user.lastCheckinAt ? dayKey(user.lastCheckinAt) : null;
  if (last === today) return { ok: false, already: true, reward: 0, streak: user.streakDays };

  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const streak = last === yesterday ? user.streakDays + 1 : 1;
  const reward = checkinReward(streak);

  try {
    await prisma.$transaction([
      prisma.pointsLedger.create({
        data: { userId, delta: reward, reason: "checkin", dedupeKey: `checkin:${today}`, meta: { streak } },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          points: { increment: reward },
          lifetimePoints: { increment: reward },
          streakDays: streak,
          lastCheckinAt: new Date(),
        },
      }),
    ]);
    return { ok: true, reward, streak };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, already: true, reward: 0, streak: user.streakDays };
    throw e;
  }
}

export interface LedgerEntry {
  delta: number;
  reason: string;
  createdAt: string;
}

// Everything the dashboard / navbar needs about a user's Shard standing.
export async function getPointsState(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      points: true,
      lifetimePoints: true,
      streakDays: true,
      lastCheckinAt: true,
      equippedFlair: true,
      equippedBadge: true,
      ownedRewards: true,
      emailVerified: true,
    },
  });
  if (!user) return null;

  const today = dayKey(new Date());
  const last = user.lastCheckinAt ? dayKey(user.lastCheckinAt) : null;
  const canCheckIn = last !== today;
  // Streak the next claim would produce (for previewing the reward).
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const projectedStreak = last === yesterday ? user.streakDays + 1 : 1;

  const ledger = await prisma.pointsLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { delta: true, reason: true, createdAt: true },
  });

  return {
    points: user.points,
    lifetimePoints: user.lifetimePoints,
    level: levelFor(user.lifetimePoints),
    next: nextLevel(user.lifetimePoints),
    progress: levelProgress(user.lifetimePoints),
    streakDays: user.streakDays,
    canCheckIn,
    nextCheckinReward: canCheckIn ? checkinReward(projectedStreak) : null,
    owned: parseOwned(user.ownedRewards),
    equippedFlair: user.equippedFlair,
    equippedBadge: user.equippedBadge,
    emailVerified: !!user.emailVerified,
    ledger: ledger.map((l) => ({ delta: l.delta, reason: l.reason, createdAt: l.createdAt.toISOString() })),
  };
}

export interface RedeemResult {
  ok: boolean;
  error?: string;
  status?: string; // FULFILLED | PENDING
  reward?: Reward;
}

// Spend Shards on a reward. Cosmetics/perks unlock instantly (and auto-equip);
// experiences land as a PENDING redemption for the team to fulfil.
export async function redeemReward(userId: string, rewardKey: string, note?: string): Promise<RedeemResult> {
  const reward = rewardByKey(rewardKey);
  if (!reward) return { ok: false, error: "Unknown reward." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { points: true, lifetimePoints: true, ownedRewards: true, emailVerified: true },
  });
  if (!user) return { ok: false, error: "Not signed in." };

  const owned = parseOwned(user.ownedRewards);
  const isCosmetic = reward.kind !== "experience";
  if (isCosmetic && owned.includes(rewardKey)) return { ok: false, error: "You already own this." };
  if (!meetsLevel(user.lifetimePoints, reward.minLevel)) return { ok: false, error: "Reach a higher level to redeem this." };
  if (reward.needsEmail && !user.emailVerified) return { ok: false, error: "Confirm your email first so we can reach you." };
  if (user.points < reward.cost) return { ok: false, error: "Not enough Shards yet." };

  const status = reward.kind === "experience" ? "PENDING" : "FULFILLED";
  const newOwned = isCosmetic ? Array.from(new Set([...owned, rewardKey])) : owned;

  // Auto-equip the freshly-bought cosmetic for instant payoff.
  const equipData: Prisma.UserUpdateInput = {};
  if (reward.kind === "flair") equipData.equippedFlair = rewardKey;
  if (reward.kind === "badge") equipData.equippedBadge = rewardKey;

  try {
    await prisma.$transaction([
      prisma.pointsLedger.create({ data: { userId, delta: -reward.cost, reason: `redeem:${rewardKey}` } }),
      prisma.redemption.create({
        data: { userId, rewardKey, rewardName: reward.name, cost: reward.cost, kind: reward.kind, status, note: note?.slice(0, 500) || null },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { points: { decrement: reward.cost }, ...(isCosmetic ? { ownedRewards: newOwned } : {}), ...equipData },
      }),
    ]);
    return { ok: true, status, reward };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Something went wrong — please try again." };
    throw e;
  }
}

// Equip (or clear, with rewardKey=null) an owned flair/badge cosmetic.
export async function equipCosmetic(userId: string, slot: "flair" | "badge", rewardKey: string | null): Promise<RedeemResult> {
  if (rewardKey !== null) {
    const reward = rewardByKey(rewardKey);
    if (!reward || reward.kind !== slot) return { ok: false, error: "Invalid item." };
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { ownedRewards: true } });
    if (!user || !parseOwned(user.ownedRewards).includes(rewardKey)) return { ok: false, error: "You don't own this." };
  }
  await prisma.user.update({
    where: { id: userId },
    data: slot === "flair" ? { equippedFlair: rewardKey } : { equippedBadge: rewardKey },
  });
  return { ok: true };
}

// Server-side perk check, e.g. gating the early-access price chart on a card page.
export async function hasReward(userId: string, rewardKey: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { ownedRewards: true } });
  return !!user && parseOwned(user.ownedRewards).includes(rewardKey);
}

// Resolve display badges (level + equipped cosmetics) for a set of users in one
// query — used to decorate author names on the forum board.
export async function getPublicBadges(userIds: string[]): Promise<Map<string, PublicBadge>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const out = new Map<string, PublicBadge>();
  if (ids.length === 0) return out;
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, lifetimePoints: true, equippedFlair: true, equippedBadge: true },
  });
  for (const u of users) {
    const lvl = levelFor(u.lifetimePoints);
    const flair = u.equippedFlair ? rewardByKey(u.equippedFlair)?.display ?? null : null;
    const badge = u.equippedBadge ? rewardByKey(u.equippedBadge)?.display ?? null : null;
    out.set(u.id, { levelName: lvl.name, levelColor: lvl.color, levelBg: lvl.bg, flair, badge });
  }
  return out;
}
