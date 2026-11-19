// Prize draws (owner, 2026-11-18: "We could definitely do the giveaway ... a Miss
// Fortune Captain alternate art from Origins ... it shouldn't be restricted to just
// Australia. I don't mind doing the international shipping").
//
// RULES THE CODE HOLDS (DECISIONS.md, 2026-11-18 "Giveaway: one entry per account"):
// - Free entry: a RiftCompare account with a confirmed email. No purchase, no
//   Premium, no tagging or sharing required. One entry per account, enforced by the
//   unique (giveaway, userId) key on GiveawayEntry.
// - Entries count only between `opensAt` and `closesAt`. The draw is a uniform random
//   pick (crypto.randomInt) among entries made in that window, run by an admin on
//   /admin/giveaway. The prize is the owner's own card: nothing is bought.
// - Entries are private (never in PUBLIC_MODELS or data/public).
//
// This file is pure (no database) so the page, the API and the tests share it.

export interface Giveaway {
  key: string;
  title: string;
  prize: string;
  prizeDetail: string;
  cardSlug: string;
  imageUrl: string;
  /** Approximate value shown in the rules, from TCGplayer's market price on the day it was set. */
  approxValue: string;
  opensAt: string; // ISO
  closesAt: string; // ISO
  drawOn: string; // human date
  claimDays: number;
}

export const GIVEAWAYS: Giveaway[] = [
  {
    key: "mf-captain-2026-12",
    title: "Win a Miss Fortune, Captain alternate art",
    prize: "Miss Fortune, Captain (Origins 162a/298, Showcase alternate art)",
    prizeDetail: "One English Riftbound single, ungraded, shipped in a sleeve and top loader to anywhere we can legally post it.",
    cardSlug: "miss-fortune-captain-ogn-162a-298",
    imageUrl: "https://cdn.riftscribe.gg/cards/thumbnails/large/ogn-162a-298-482e5cf579f16711.webp",
    approxValue: "about US$36 (TCGplayer market price, 18 Nov 2026)",
    opensAt: "2026-11-18T00:00:00Z",
    // 14 Dec 2026, 23:59 Sydney time (AEDT, UTC+11).
    closesAt: "2026-12-14T12:59:59Z",
    drawOn: "15 December 2026",
    claimDays: 14,
  },
];

export const CURRENT_GIVEAWAY = GIVEAWAYS[0];

export function giveawayByKey(key: string): Giveaway | null {
  return GIVEAWAYS.find((g) => g.key === key) ?? null;
}

export type GiveawayState = "upcoming" | "open" | "closed";

export function giveawayState(g: Giveaway, now: Date): GiveawayState {
  const t = now.getTime();
  if (t < Date.parse(g.opensAt)) return "upcoming";
  if (t > Date.parse(g.closesAt)) return "closed";
  return "open";
}

/** An entry counts only if it was made while the giveaway was open. */
export function entryCounts(g: Giveaway, createdAt: Date): boolean {
  return giveawayState(g, createdAt) === "open";
}

/** The owner hears about the first entry and every 50th, not each one (the inbox mail cap is shared). */
export function notifyOnCount(count: number): boolean {
  return count === 1 || (count > 0 && count % 50 === 0);
}

// ENTRIES PER ACCOUNT (owner, 2026-11-19: "if you are a premium user, you get triple the amount of entries", and
// "you can increase your entries by referring a friend and getting them to sign up"). Everything here is checked by
// the site itself, never self-reported:
// - Every entry starts at BASE_ENTRIES.
// - A Premium account counts BONUS_ENTRIES instead. So that buying never beats entering free (the rules' "no
//   purchase necessary"), a free account gets exactly the same BONUS_ENTRIES once it watches the price of at least one
//   card or sealed product, which is free for every account (lib/free-limits.ts).
// - Each friend who creates an account through the entrant's invite link while the giveaway is open, and confirms
//   their email, adds one entry, up to MAX_REFERRAL_ENTRIES. One credit per new account (GiveawayReferral's unique
//   key), never for the inviter's own account (lib/referral.ts).
// No "follow us" entries: a follow can't be checked, and many subreddits ban follow-to-enter.
export const BASE_ENTRIES = 1;
export const BONUS_ENTRIES = 3;
export const MAX_REFERRAL_ENTRIES = 10;

export type EntryReason = "premium" | "watch" | "base";

export function entryWeight(opts: { premium: boolean; watches: number; referrals?: number }): {
  weight: number;
  reason: EntryReason;
  referralEntries: number;
} {
  const referralEntries = Math.max(0, Math.min(MAX_REFERRAL_ENTRIES, Math.floor(opts.referrals ?? 0)));
  const reason: EntryReason = opts.premium ? "premium" : opts.watches > 0 ? "watch" : "base";
  const base = reason === "base" ? BASE_ENTRIES : BONUS_ENTRIES;
  return { weight: base + referralEntries, reason, referralEntries };
}

/** The leaderboard's public name: first name and last initial ("Bill Y."), never an email or a full surname. */
export function publicName(displayName: string | null | undefined, show: boolean): string {
  if (!show) return "Anonymous entrant";
  const clean = (displayName ?? "").replace(/\S+@\S+/g, "").replace(/[^\p{L}\p{N} .'_-]/gu, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Anonymous entrant";
  const first = parts[0].slice(0, 20);
  if (parts.length > 1) return `${first} ${parts[parts.length - 1][0].toUpperCase()}.`;
  // One word with digits, dots or underscores is usually an email's local part or a handle: keep three characters.
  return /[\d._]/.test(first) ? `${first.slice(0, 3)}***` : first;
}

/** A weighted draw: each item's chance is its weight over the total. `rand(n)` returns an integer in [0, n). */
export function weightedPick<T extends { weight: number }>(items: T[], rand: (n: number) => number): T | null {
  const pool = items.filter((i) => Number.isInteger(i.weight) && i.weight > 0);
  const total = pool.reduce((s, i) => s + i.weight, 0);
  if (total === 0) return null;
  let ticket = rand(total);
  for (const i of pool) {
    if (ticket < i.weight) return i;
    ticket -= i.weight;
  }
  return null;
}

/** "2026-11-19" in Sydney time, for the admin page's entries per day. */
export function sydneyDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// ---------------------------------------------------------------------------------------------------------------
// Conversion (owner, 20 Nov 2026, Reddit feedback report: "measure this giveaway as a customer acquisition campaign,
// not just a social media competition"). Pure, so the admin page's numbers are pinned by tests/giveaway.test.ts.
// The team is left out before this is called. "Came back" means the account was active on a later Sydney day than
// the one it entered on (User.lastActiveAt, written at most once a day); "still active after the close" means
// active after closesAt, so it reads 0 until the giveaway ends.

export interface FunnelRow {
  enteredAt: Date;
  /** The account was created inside the giveaway window. */
  newAccount: boolean;
  /** User.signupSource is "giveaway": the account was made from /giveaway's own sign-in. */
  fromGiveawayPage: boolean;
  /** Price alerts and sealed watches the account holds now. */
  watches: number;
  /** Confirmed friends who joined through the account's invite link. */
  referrals: number;
  lastActiveAt: Date | null;
}

export interface Funnel {
  entrants: number;
  newAccounts: number;
  fromGiveawayPage: number;
  watching: number;
  cameBack: number;
  referrers: number;
  confirmedReferrals: number;
  activeAfterClose: number;
}

export function giveawayFunnel(rows: FunnelRow[], g: Pick<Giveaway, "closesAt">): Funnel {
  const close = Date.parse(g.closesAt);
  const f: Funnel = { entrants: rows.length, newAccounts: 0, fromGiveawayPage: 0, watching: 0, cameBack: 0, referrers: 0, confirmedReferrals: 0, activeAfterClose: 0 };
  for (const r of rows) {
    if (r.newAccount) f.newAccounts++;
    if (r.fromGiveawayPage) f.fromGiveawayPage++;
    if (r.watches > 0) f.watching++;
    if (r.lastActiveAt && sydneyDay(r.lastActiveAt) > sydneyDay(r.enteredAt)) f.cameBack++;
    if (r.referrals > 0) f.referrers++;
    f.confirmedReferrals += r.referrals;
    if (r.lastActiveAt && r.lastActiveAt.getTime() > close) f.activeAfterClose++;
  }
  return f;
}
