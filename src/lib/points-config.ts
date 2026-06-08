// ─────────────────────────────────────────────────────────────────────────────
// Shards — RiftCompare's gamification / loyalty system (pure config + helpers).
//
// This module has NO server imports (no prisma, no next/headers) so it is safe to
// import from client components. All point amounts, levels and the reward catalogue
// live here; the server engine (lib/points.ts) reads from it.
// ─────────────────────────────────────────────────────────────────────────────

export const SHARD = {
  // The on-brand name + glyph for the points currency. Distinct from the AUD
  // wallet so the two are never confused.
  name: "Shards",
  singular: "Shard",
  glyph: "✦",
} as const;

// ── Earning ──────────────────────────────────────────────────────────────────

export interface AwardConfig {
  amount: number;
  // One-time grants are deduped by a stable key so they can never be farmed.
  oneTime?: boolean;
  // Repeatable grants can be capped to N awards per UTC day (anti-spam).
  dailyCap?: number;
  // Short human label for the ledger UI.
  label: string;
}

// Identity helper that keeps the literal keys (for AwardReason) while typing every
// value as the full AwardConfig — so optional fields (oneTime/dailyCap) stay
// accessible instead of being narrowed away per-entry.
function defineAwards<K extends string>(a: Record<K, AwardConfig>): Record<K, AwardConfig> {
  return a;
}

export const AWARDS = defineAwards({
  welcome: { amount: 100, oneTime: true, label: "Welcome bonus" },
  verify_email: { amount: 50, oneTime: true, label: "Confirmed email" },
  forum_post: { amount: 15, dailyCap: 5, label: "Posted on the forum" },
  forum_comment: { amount: 5, dailyCap: 10, label: "Commented on the forum" },
  create_listing: { amount: 20, dailyCap: 10, label: "Listed a card for sale" },
  create_buy_order: { amount: 20, dailyCap: 10, label: "Posted a buy order" },
});

export type AwardReason = keyof typeof AWARDS;

// Daily check-in. Streak grows the reward up to a cap, with a bonus every 7th day.
export const CHECKIN = {
  base: 10,
  perStreakDay: 5, // added per consecutive day…
  maxStreakBonus: 30, // …capped here (so day 7+ ≈ base + 30)
  weeklyBonus: 25, // extra every 7th consecutive day
} as const;

// Shards awarded for a check-in given the resulting streak length (1-indexed).
export function checkinReward(streakDays: number): number {
  const streakBonus = Math.min((streakDays - 1) * CHECKIN.perStreakDay, CHECKIN.maxStreakBonus);
  const weekly = streakDays > 0 && streakDays % 7 === 0 ? CHECKIN.weeklyBonus : 0;
  return CHECKIN.base + streakBonus + weekly;
}

// ── Levels (Reddit-style medals, by lifetime Shards) ─────────────────────────

export interface Level {
  key: string;
  name: string;
  min: number; // lifetime Shards needed to reach this level
  color: string; // chip text/ring colour
  bg: string; // chip background
  blurb: string;
}

// Ordered low → high. levelFor() returns the highest reached.
export const LEVELS: Level[] = [
  { key: "wanderer", name: "Wanderer", min: 0, color: "#9aa6b8", bg: "rgba(148,163,184,0.12)", blurb: "Just arrived on the Rift." },
  { key: "bronze", name: "Bronze", min: 150, color: "#cd9b6a", bg: "rgba(205,155,106,0.14)", blurb: "Finding your footing." },
  { key: "silver", name: "Silver", min: 500, color: "#c9d2dd", bg: "rgba(201,210,221,0.14)", blurb: "A familiar face." },
  { key: "gold", name: "Gold", min: 1200, color: "#e7c45e", bg: "rgba(231,196,94,0.15)", blurb: "A trusted regular." },
  { key: "platinum", name: "Platinum", min: 3000, color: "#7fe0d6", bg: "rgba(127,224,214,0.14)", blurb: "A pillar of the community." },
  { key: "diamond", name: "Diamond", min: 7000, color: "#7fb8ff", bg: "rgba(127,184,255,0.16)", blurb: "Rift royalty." },
  { key: "master", name: "Master", min: 15000, color: "#d99bff", bg: "rgba(217,155,255,0.16)", blurb: "A living legend." },
];

export function levelFor(lifetimePoints: number): Level {
  let cur = LEVELS[0]!;
  for (const l of LEVELS) if (lifetimePoints >= l.min) cur = l;
  return cur;
}

export function nextLevel(lifetimePoints: number): Level | null {
  return LEVELS.find((l) => l.min > lifetimePoints) ?? null;
}

// Progress (0..1) toward the next level, plus the raw remaining amount.
export function levelProgress(lifetimePoints: number): { pct: number; remaining: number } {
  const cur = levelFor(lifetimePoints);
  const next = nextLevel(lifetimePoints);
  if (!next) return { pct: 1, remaining: 0 };
  const span = next.min - cur.min;
  const into = lifetimePoints - cur.min;
  return { pct: Math.max(0, Math.min(1, into / span)), remaining: next.min - lifetimePoints };
}

// ── Reward catalogue (the "shop") ────────────────────────────────────────────

export type RewardKind = "flair" | "badge" | "perk" | "experience";

export interface Reward {
  key: string;
  name: string;
  description: string;
  cost: number;
  kind: RewardKind;
  // Cosmetic display value: flair → the text label; badge → the emoji medal.
  display?: string;
  // Minimum level required to redeem (gates aspirational rewards).
  minLevel?: string;
  // Experiences need a way to reach the user — require a confirmed email.
  needsEmail?: boolean;
}

export const REWARDS: Reward[] = [
  // Flairs — a coloured title shown beside your name on the forum + profile.
  { key: "flair_collector", name: "“Collector” flair", description: "Show a Collector title beside your name.", cost: 150, kind: "flair", display: "Collector" },
  { key: "flair_trader", name: "“Trader” flair", description: "Show a Trader title beside your name.", cost: 150, kind: "flair", display: "Trader" },
  { key: "flair_theorycrafter", name: "“Theorycrafter” flair", description: "Show a Theorycrafter title beside your name.", cost: 150, kind: "flair", display: "Theorycrafter" },
  { key: "flair_whale", name: "“Big Spender” flair", description: "A flex for the serious collector.", cost: 500, kind: "flair", display: "Big Spender", minLevel: "silver" },

  // Badges — an emoji medal shown beside your name (Reddit-style).
  { key: "badge_gem", name: "💎 Gem badge", description: "A shiny gem medal for your name.", cost: 200, kind: "badge", display: "💎" },
  { key: "badge_fire", name: "🔥 On-Fire badge", description: "Show you're on a hot streak.", cost: 200, kind: "badge", display: "🔥" },
  { key: "badge_star", name: "⭐ Star badge", description: "A classic gold star.", cost: 200, kind: "badge", display: "⭐" },
  { key: "badge_crown", name: "👑 Crown badge", description: "For the elite. Gold level and up.", cost: 800, kind: "badge", display: "👑", minLevel: "gold" },

  // Perks — functional unlocks the app checks for.
  { key: "perk_price_charts", name: "Early access: price charts", description: "Unlock the price-history chart on card pages before everyone else.", cost: 600, kind: "perk", minLevel: "bronze" },

  // Experiences — personalised, fulfilled by the team (epal-style).
  { key: "exp_deck_review", name: "Personalised deck review", description: "A RiftCompare expert reviews your deck and emails back tailored feedback.", cost: 1000, kind: "experience", needsEmail: true, minLevel: "silver" },
  { key: "exp_shoutout", name: "Community shout-out", description: "Get featured to the RiftCompare community.", cost: 800, kind: "experience", needsEmail: true },
  { key: "exp_feature_request", name: "Priority feature request", description: "Your feature idea jumps to the top of our queue.", cost: 1500, kind: "experience", needsEmail: true, minLevel: "gold" },
  { key: "exp_early_beta", name: "Early beta access", description: "First access to new RiftCompare tools as we build them.", cost: 2000, kind: "experience", needsEmail: true, minLevel: "gold" },
];

export function rewardByKey(key: string): Reward | undefined {
  return REWARDS.find((r) => r.key === key);
}

// The display badges shown beside a user's name (level + equipped cosmetics).
// Resolved server-side by getPublicBadges() but typed here so client components
// (e.g. the forum board) can consume it without importing the server engine.
export interface PublicBadge {
  levelName: string;
  levelColor: string;
  levelBg: string;
  flair: string | null; // display label of the equipped flair
  badge: string | null; // emoji of the equipped badge
}

// Is the given lifetime enough to clear a reward's level gate?
export function meetsLevel(lifetimePoints: number, minLevelKey?: string): boolean {
  if (!minLevelKey) return true;
  const needed = LEVELS.find((l) => l.key === minLevelKey);
  return !needed || lifetimePoints >= needed.min;
}
