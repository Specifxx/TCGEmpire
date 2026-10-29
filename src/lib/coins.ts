// RiftCompare Coins — the rules, as pure functions (2026-10-16, owner, passing on
// George's idea: "Turn these into virtual coins that premium members can get by
// completing tasks such as building wishlists, sharing prices … or clicking
// links … or daily repeat sign ins, friend referrals", and the owner's own
// "Make it gacha"). DECISIONS.md, "RiftCompare Coins".
//
// Tasks earn PULLS; a pull reveals one of twelve champion coins at random, by
// rarity, with a pity counter so a run of bad luck always ends. Duplicates turn
// into shards, and shards buy pulls. Nothing here is bought: coins, pulls and
// shards have no cash value and no price anywhere on the site. That is a rule,
// not a launch choice: a paid pull would make this a loot box.
//
// Everything here is deterministic given its random input, and DOM- and
// database-free, so the odds and the pity are testable. The server
// (lib/coins-server.ts) owns the wallet; the page (components/coins/) draws.

/**
 * Off (owner, 2026-10-29: "just completely get rid of the coins"). Hidden, not
 * deleted: the page 404s, the APIs and rewards refuse, and the nav, tier table
 * and Pro ticks drop the row. The wallets, tasks and collections stay in the
 * database untouched, so turning this back on restores everyone's coins.
 * DECISIONS.md, "RiftCompare Coins switched off".
 */
export const COINS_ENABLED = false;

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
// Each task pays pulls. `perDay` caps it per UTC day; `once` pays once ever. The
// server checks every claim (lib/coins-server.ts). Watching a card and a friend
// signing up are recorded where they happen. Sharing and visiting a store are
// claimed by the browser, so they are capped low and rate-limited.

export type TaskId = "welcome" | "daily" | "streak" | "watch" | "share" | "visit" | "referral";

export interface Task {
  id: TaskId;
  label: string;
  detail: string;
  pulls: number;
  perDay?: number;
  once?: boolean;
  /** Where the task is done, for the page's "Go" link. */
  href?: string;
}

export const STREAK_DAYS = 7;

export const TASKS: Task[] = [
  { id: "welcome", label: "Welcome gift", detail: "Three pulls to start your collection", pulls: 3, once: true },
  { id: "daily", label: "Daily check-in", detail: "Come back and check in, once a day", pulls: 1, perDay: 1 },
  { id: "streak", label: `${STREAK_DAYS}-day streak`, detail: `Check in ${STREAK_DAYS} days in a row for a bonus`, pulls: 2, perDay: 1 },
  { id: "watch", label: "Build your watchlist", detail: "Watch a new card (heart it on any card page)", pulls: 1, perDay: 3, href: "/browse" },
  { id: "share", label: "Share a price", detail: "Copy a card's link with its Share button", pulls: 1, perDay: 2, href: "/browse" },
  { id: "visit", label: "Visit a store", detail: "Open a store's listing from a price table", pulls: 1, perDay: 3, href: "/deals" },
  { id: "referral", label: "Refer a friend", detail: "A friend signs up with your invite link", pulls: 5 },
];

export const taskById = (id: string): Task | undefined => TASKS.find((t) => t.id === id);

/** The tasks the BROWSER may claim. The rest are recorded server-side where they happen. */
export const CLIENT_CLAIMABLE: readonly TaskId[] = ["welcome", "daily", "share", "visit"];

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
