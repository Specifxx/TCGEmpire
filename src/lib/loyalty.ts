// MEMBER REWARDS (owner, 2026-11-26: "we actually need loyalty systems ... loyalty that will not make us a loss ... I want that on
// all of our Empire websites"). DECISIONS.md, 2026-11-26 "Compounding daily streaks, and member rewards". Plan:
// /mnt/project-files/loyalty/loyalty-plan-2026-11-26.html.
//
// ONE PROGRAMME, HELD HERE, SHOWN EVERYWHERE. Points belong to the shared account (RiftCompare's database), so a member earns the
// same balance on every site they are signed in to; each site draws the card in its own name (never "RiftCompare").
//
// RULES THE CODE HOLDS:
// - Earn: a daily check-in on any of our sites (lib/streak.ts: 1, 2, 3 ... up to STREAK_CAP a day, a missed Sydney day starts
//   again at 1; a giveaway check-in counts too), plus every community contribution point (lib/contributions.ts, capped a day).
//   Nothing is earned for buying, and nothing for being Premium: points measure showing up and helping.
// - Spend: only rewards that cost us no cash (Premium days, given only to members who are not paying for Premium, and at most one
//   Premium reward a calendar month). A reward that costs money (booster packs, a store voucher we pay for) is added only with
//   the owner's yes on its budget; until then it is not shown, not promised, not teased.
// - Points have no cash value, can't be bought, sold or moved, and spending them never touches giveaway tickets (those are
//   counted separately from the same activity), so the giveaways stay free prize draws.
// - Levels come from lifetime points (spending never lowers a level). They are a badge and a thank-you, never a price gate:
//   the cheapest price is never behind a level.
//
// Pure: no database, no node built-ins. The server half is lib/loyalty-server.ts.

import { streakOutlook, streakPoints } from "./streak";

export const LOYALTY_ENABLED = true;

export interface Level {
  key: "member" | "regular" | "insider" | "legend";
  name: string;
  /** Lifetime points needed. */
  min: number;
}

// A perfect month of check-ins is 255 (1+2+...+10, then 10 a day); a member who also helps a little makes ~350.
export const LEVELS: Level[] = [
  { key: "member", name: "Member", min: 0 },
  { key: "regular", name: "Regular", min: 100 },
  { key: "insider", name: "Insider", min: 500 },
  { key: "legend", name: "Legend", min: 2000 },
];

export function levelFor(lifetime: number): { level: Level; next: Level | null; toNext: number } {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (lifetime >= LEVELS[k].min) i = k;
  const next = LEVELS[i + 1] ?? null;
  return { level: LEVELS[i], next, toNext: next ? Math.max(0, next.min - lifetime) : 0 };
}

export interface Reward {
  key: string;
  title: string;
  points: number;
  /** Premium days granted (extend-only, lib/premium.ts grantPremiumDays). */
  premiumDays: number;
  /** The cash this reward costs us. Only 0 rewards exist until the owner approves a budget. */
  cashCost: 0;
}

// Priced so the week of Premium needs about five weeks of daily visits: a member who comes back every day for a month has already
// earned us more than the week costs (nothing in cash; see the plan's model). At most 7 Premium days a month, the cap the Premium
// pricing plan set for loyalty milestones (2026-11-26), and extend-only on User.premiumUntil, as the referral week is.
export const REWARDS: Reward[] = [{ key: "premium-7", title: "7 days of Premium", points: 300, premiumDays: 7, cashCost: 0 }];

export function rewardByKey(key: unknown): Reward | null {
  return REWARDS.find((r) => r.key === key) ?? null;
}

/** "premium:2026-11": the one Premium reward a member can take per Sydney calendar month (unique per account, race-proof). */
export function redemptionSlot(reward: Reward, sydneyDay: string): string {
  return `${reward.premiumDays > 0 ? "premium" : reward.key}:${sydneyDay.slice(0, 7)}`;
}

export interface LoyaltyInput {
  /** Every Sydney day checked in (any site), YYYY-MM-DD. */
  days: string[];
  /** All-time community contribution points. */
  contributionPoints: number;
  /** Points already spent. */
  spent: number;
}

export interface LoyaltyState {
  lifetime: number;
  balance: number;
  checkinPoints: number;
  contributionPoints: number;
  streak: number;
  checkedInToday: boolean;
  /** What today's check-in is (or was) worth, and tomorrow's if the streak holds. */
  today: number;
  tomorrow: number;
  level: Level;
  next: Level | null;
  toNext: number;
}

export function loyaltyState(input: LoyaltyInput, today: string): LoyaltyState {
  const checkinPoints = streakPoints(input.days);
  const contributionPoints = Math.max(0, Math.floor(input.contributionPoints));
  const lifetime = checkinPoints + contributionPoints;
  const o = streakOutlook(input.days, today);
  return {
    lifetime,
    balance: Math.max(0, lifetime - Math.max(0, Math.floor(input.spent))),
    checkinPoints,
    contributionPoints,
    streak: o.streak,
    checkedInToday: o.checkedInToday,
    today: o.today,
    tomorrow: o.tomorrow,
    ...levelFor(lifetime),
  };
}

export type RedeemCheck = { ok: true } | { ok: false; error: string };

/** Whether a member may take a reward now. The slot itself is enforced by a unique key on the server. */
export function canRedeem(reward: Reward, s: { balance: number; paying: boolean; slotTaken: boolean }): RedeemCheck {
  if (s.balance < reward.points) return { ok: false, error: `You need ${reward.points - s.balance} more points.` };
  if (reward.premiumDays > 0 && s.paying) return { ok: false, error: "You already have a Premium subscription, so save your points for the next reward." };
  if (s.slotTaken) return { ok: false, error: "One Premium reward a month. Your next one opens on the 1st." };
  return { ok: true };
}
