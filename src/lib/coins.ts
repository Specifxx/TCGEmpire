// RiftCompare Coins and Riftcoins — the rules, as pure functions.
//
// 2026-10-16 (owner, passing on George's idea: "Turn these into virtual coins
// that premium members can get by completing tasks such as building wishlists,
// sharing prices … or clicking links … or daily repeat sign ins, friend
// referrals", and the owner's own "Make it gacha"): twelve champion coins,
// revealed by a pull. DECISIONS.md, "RiftCompare Coins".
//
// 2026-10-17 (owner: "people should be able to collect riftcoins / And use
// them to play the profile badge/coin slot game, or the general games on the
// site, or get free premium"): RIFTCOINS, a currency every signed-in member
// earns (Premium members at double rate). Tasks and finishing an arcade game pay
// Riftcoins; Riftcoins buy a SPIN of the slot (a champion coin, and a chance at
// a profile badge) or a week of Premium. DECISIONS.md, "Riftcoins".
//
// THE RULE THAT KEEPS THIS A GAME. Nothing here is bought: Riftcoins, pulls,
// shards, coins and badges have no cash value and no price anywhere on the site.
// And CHANCE ONLY EVER WINS COLLECTIBLES: a spin pays coins, badges and shards,
// never Riftcoins and never Premium, and shards only buy spins. Riftcoins come
// only from doing things. So nothing of value is ever won at random, and nothing
// random is ever paid for with money.
//
// Everything here is deterministic given its random input, and DOM- and
// database-free, so the odds and the pity are testable. The server
// (lib/coins-server.ts) owns the wallet; the page (components/coins/) draws.

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface Coin {
  id: string;
  name: string;
  /** A short line for the reveal and the collection tile. */
  title: string;
  rarity: Rarity;
  /** The coin's own accent, for the glow behind it. */
  color: string;
}

// Art: public/coins/<id>.webp, cut from the sheet George designed (twelve
// coins, each a champion inside the RiftCompare rim).
export const COINS: Coin[] = [
  { id: "ahri", name: "Ahri", title: "The Nine-Tailed Fox", rarity: "legendary", color: "#ff5fa8" },
  { id: "jinx", name: "Jinx", title: "The Loose Cannon", rarity: "epic", color: "#e94cff" },
  { id: "yasuo", name: "Yasuo", title: "The Unforgiven", rarity: "epic", color: "#4f8dff" },
  { id: "lux", name: "Lux", title: "The Lady of Luminosity", rarity: "rare", color: "#ffd66b" },
  { id: "diana", name: "Diana", title: "Scorn of the Moon", rarity: "rare", color: "#c9d4ff" },
  { id: "zed", name: "Zed", title: "The Master of Shadows", rarity: "rare", color: "#ff3b3b" },
  { id: "thresh", name: "Thresh", title: "The Chain Warden", rarity: "rare", color: "#2ff0b0" },
  { id: "akali", name: "Akali", title: "The Rogue Assassin", rarity: "common", color: "#4fd17a" },
  { id: "mordekaiser", name: "Mordekaiser", title: "The Iron Revenant", rarity: "common", color: "#7b6bff" },
  { id: "rengar", name: "Rengar", title: "The Pridestalker", rarity: "common", color: "#c7d1c0" },
  { id: "lee-sin", name: "Lee Sin", title: "The Blind Monk", rarity: "common", color: "#ff8a4a" },
  { id: "vi", name: "Vi", title: "The Piltover Enforcer", rarity: "common", color: "#ff4f7b" },
];

export const coinById = (id: string): Coin | undefined => COINS.find((c) => c.id === id);
export const coinArt = (id: string) => `/coins/${id}.webp`;

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_LABEL: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

/** The chance of each rarity on an ordinary pull. Shown on the page as the odds. */
export const RARITY_ODDS: Record<Rarity, number> = { common: 0.6, rare: 0.28, epic: 0.1, legendary: 0.02 };

/** At most this many pulls in a row without an Epic or better: the next is one. */
export const EPIC_PITY = 10;
/** At most this many pulls in a row without the Legendary: the next is it. */
export const LEGENDARY_PITY = 50;

/** Shards a DUPLICATE is worth, by rarity. A new coin is worth none: it is the coin. */
export const SHARDS_FOR_DUPLICATE: Record<Rarity, number> = { common: 1, rare: 2, epic: 5, legendary: 10 };
/** Shards that buy one pull. */
export const SHARDS_PER_PULL = 10;

export interface Pity {
  /** Pulls since the last Epic or Legendary. */
  sinceEpic: number;
  /** Pulls since the last Legendary. */
  sinceLegendary: number;
}

/**
 * One pull. `r1` picks the rarity and `r2` the coin within it, each in [0, 1).
 * Pity: the LEGENDARY_PITY-th pull without a Legendary is one, and the
 * EPIC_PITY-th without an Epic or better is at least Epic (Legendary at its
 * ordinary share of the top two).
 */
export function roll(r1: number, r2: number, pity: Pity): { coin: Coin; pity: Pity; forced: boolean } {
  let rarity: Rarity;
  let forced = false;
  if (pity.sinceLegendary + 1 >= LEGENDARY_PITY) {
    rarity = "legendary";
    forced = true;
  } else if (pity.sinceEpic + 1 >= EPIC_PITY) {
    const top = RARITY_ODDS.epic + RARITY_ODDS.legendary;
    rarity = r1 * top < RARITY_ODDS.legendary ? "legendary" : "epic";
    forced = true;
  } else {
    let acc = 0;
    rarity = "common";
    // Highest first, so the rare outcomes sit at the bottom of [0, 1).
    for (const k of [...RARITY_ORDER].reverse()) {
      acc += RARITY_ODDS[k];
      if (r1 < acc) {
        rarity = k;
        break;
      }
    }
  }
  const pool = COINS.filter((c) => c.rarity === rarity);
  const coin = pool[Math.min(pool.length - 1, Math.floor(r2 * pool.length))];
  const isEpicPlus = rarity === "epic" || rarity === "legendary";
  return {
    coin,
    forced,
    pity: {
      sinceEpic: isEpicPlus ? 0 : pity.sinceEpic + 1,
      sinceLegendary: rarity === "legendary" ? 0 : pity.sinceLegendary + 1,
    },
  };
}

// ── Tasks ──────────────────────────────────────────────────────────────────────
// Each task pays Riftcoins (Premium members get PREMIUM_BOOST times as many).
// `perDay` caps it per UTC day; `once` pays once ever. The server checks every
// claim (lib/coins-server.ts). Watching a card and a friend signing up are
// recorded where they happen. Sharing, visiting a store and finishing a game are
// claimed by the browser, so they are capped low and rate-limited.
//
// THE ECONOMY, in one place. A member who checks in every day and does a
// couple of tasks and games earns roughly 35-45 Riftcoins a day, so a week of
// Premium (PREMIUM_REDEEM_COST) is about a month of steady use (owner's pick,
// 2026-10-17), and a spin (SPIN_COST) about one a day. The most a member can
// earn in a day, every cap hit, is under 80.

export type TaskId = "welcome" | "daily" | "streak" | "watch" | "share" | "visit" | "arcade" | "referral";

export interface Task {
  id: TaskId;
  label: string;
  detail: string;
  /** Riftcoins paid, before the Premium boost. */
  riftcoins: number;
  perDay?: number;
  once?: boolean;
  /** Where the task is done, for the page's "Go" link. */
  href?: string;
}

export const STREAK_DAYS = 7;

/** The arcade games that pay for a finished game, once each per day. */
export const ARCADE_GAMES = ["higher-lower", "pack-sim", "seraphines-piano", "riftle"] as const;
export type ArcadeGame = (typeof ARCADE_GAMES)[number];
export const isArcadeGame = (g: unknown): g is ArcadeGame => (ARCADE_GAMES as readonly unknown[]).includes(g);

export const TASKS: Task[] = [
  { id: "welcome", label: "Welcome gift", detail: "Riftcoins to start you off", riftcoins: 50, once: true },
  { id: "daily", label: "Daily check-in", detail: "Come back and check in, once a day", riftcoins: 10, perDay: 1 },
  { id: "streak", label: `${STREAK_DAYS}-day streak`, detail: `Check in ${STREAK_DAYS} days in a row for a bonus`, riftcoins: 30, perDay: 1 },
  { id: "arcade", label: "Play the arcade", detail: "Finish a game of Higher or Lower, Pack Sim, Seraphine's Piano or Riftle (each once a day)", riftcoins: 5, perDay: ARCADE_GAMES.length, href: "/games" },
  { id: "watch", label: "Build your watchlist", detail: "Watch a new card (heart it on any card page)", riftcoins: 5, perDay: 3, href: "/browse" },
  { id: "share", label: "Share a price", detail: "Copy a card's link with its Share button", riftcoins: 5, perDay: 2, href: "/browse" },
  { id: "visit", label: "Visit a store", detail: "Open a store's listing from a price table", riftcoins: 5, perDay: 3, href: "/deals" },
  { id: "referral", label: "Refer a friend", detail: "A friend signs up with your invite link", riftcoins: 100 },
];

export const taskById = (id: string): Task | undefined => TASKS.find((t) => t.id === id);

/** The tasks the BROWSER may claim. The rest are recorded server-side where they happen. */
export const CLIENT_CLAIMABLE: readonly TaskId[] = ["welcome", "daily", "share", "visit", "arcade"];

/** Premium members earn this many times the Riftcoins on every task. */
export const PREMIUM_BOOST = 2;

/** Riftcoins a task pays a member, with the Premium boost applied. */
export function taskReward(task: TaskId, premium: boolean): number {
  const t = taskById(task);
  return t ? t.riftcoins * (premium ? PREMIUM_BOOST : 1) : 0;
}

// ── Spending ───────────────────────────────────────────────────────────────────

/** Riftcoins for one spin of the slot. A legacy pull, or SHARDS_PER_PULL shards, also buys one. */
export const SPIN_COST = 50;
/** Riftcoins for a week of Premium, and the week. */
export const PREMIUM_REDEEM_COST = 1200;
export const PREMIUM_REDEEM_DAYS = 7;

/** One Premium redemption per calendar month (UTC): the key that makes it idempotent. */
export function redeemKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Why a member can't redeem Premium right now, or null when they can. */
export function redeemBlocker(
  wallet: { riftcoins: number; redeemedThisMonth: boolean },
  account: { hasPaidPlan: boolean }
): "paid-plan" | "this-month" | "short" | null {
  if (account.hasPaidPlan) return "paid-plan";
  if (wallet.redeemedThisMonth) return "this-month";
  if (wallet.riftcoins < PREMIUM_REDEEM_COST) return "short";
  return null;
}

// ── Profile badges ─────────────────────────────────────────────────────────────
// Six badges, one per Riftbound domain, won on the slot. A member equips one and
// it shows on their profile. Drawn as SVG (components/coins/RiftBadge.tsx).

export interface Badge {
  id: string;
  name: string;
  /** The domain's colour. */
  color: string;
  /** One line for the tile. */
  motto: string;
}

export const BADGES: Badge[] = [
  { id: "fury", name: "Fury", color: "#ff4d4d", motto: "Strike first" },
  { id: "calm", name: "Calm", color: "#3fd18b", motto: "Patience wins" },
  { id: "mind", name: "Mind", color: "#4f9dff", motto: "Plan three turns ahead" },
  { id: "body", name: "Body", color: "#ff9a3c", motto: "Stand your ground" },
  { id: "chaos", name: "Chaos", color: "#b86bff", motto: "Embrace the unexpected" },
  { id: "order", name: "Order", color: "#ffd24d", motto: "Hold the line" },
];

export const badgeById = (id: string): Badge | undefined => BADGES.find((b) => b.id === id);

/** The chance a spin also wins a badge. */
export const BADGE_CHANCE = 0.1;
/** At most this many spins in a row without a badge: the next wins one. */
export const BADGE_PITY = 15;
/** Shards for a badge you already have. */
export const SHARDS_FOR_DUPLICATE_BADGE = 3;

/**
 * Whether a spin wins a badge, and which. `r1` decides the win, `r2` the badge.
 * A badge you don't have yet is always picked before a repeat, so six wins
 * complete the set.
 */
export function rollBadge(r1: number, r2: number, sinceBadge: number, owned: readonly string[]): { badge: Badge | null; sinceBadge: number; forced: boolean } {
  const forced = sinceBadge + 1 >= BADGE_PITY;
  if (!forced && r1 >= BADGE_CHANCE) return { badge: null, sinceBadge: sinceBadge + 1, forced: false };
  const missing = BADGES.filter((b) => !owned.includes(b.id));
  const pool = missing.length ? missing : BADGES;
  return { badge: pool[Math.min(pool.length - 1, Math.floor(r2 * pool.length))], sinceBadge: 0, forced };
}

/** A UTC day key, "2026-10-16". */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The day before a day key. */
export function previousDay(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return dayKey(d);
}

/** A new streak length after checking in today, given the last check-in day. */
export function nextStreak(lastDay: string | null, streak: number, today: string): number {
  if (lastDay === today) return streak;
  return lastDay === previousDay(today) ? streak + 1 : 1;
}

/** Whether today's check-in completes a streak (the 7th, 14th, … day). */
export function streakBonusDue(streak: number): boolean {
  return streak > 0 && streak % STREAK_DAYS === 0;
}

export function collectionProgress(owned: Record<string, number>): { have: number; total: number } {
  return { have: COINS.filter((c) => (owned[c.id] ?? 0) > 0).length, total: COINS.length };
}
