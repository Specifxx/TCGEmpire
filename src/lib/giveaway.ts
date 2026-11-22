// Prize draws on five sites (owner, 2026-11-18 for RiftCompare; 2026-11-22 for the network: "can we also do a Pokemon giveaway
// ... make all of that ... for Dex Compare as well ... MTG Compare ... Yu-Gi-Oh Compare and One Piece Compare ... these giveaways
// [every] 2 months ... a point system"). DECISIONS.md, 2026-11-22 "Giveaways on five sites, by points".
//
// ONE SERVICE, HERE. RiftCompare holds every entry (the sister sites have no database): its own page enters with the session, a
// sister's page with the premium-session token RiftCompare signed for that site (lib/sister-premium.ts, /api/sister-giveaway).
//
// RULES THE CODE HOLDS:
// - Free entry: an account with a confirmed email. One entry per account per giveaway (the unique (giveaway, userId) key).
// - Points are tickets. ENTRY_POINTS for entering, CHECKIN_POINTS for each Sydney day the entrant checks in, REFERRAL_POINTS for
//   each friend who joins through their invite link and confirms their email (up to MAX_REFERRALS), and BONUS_POINTS once.
// - NO PURCHASE NECESSARY: Premium members get BONUS_POINTS automatically, and every free account gets exactly the same
//   BONUS_POINTS, free, by watching any price or by pressing "Claim the free bonus" (bonusClaimedAt). So paying never buys a better
//   chance than a free account can have, which keeps it a free prize draw (sweepstakes) and not a lottery.
// - Points count only between `opensAt` and `closesAt`. The draw (lib/giveaway-draw.ts, scripts/giveaway-draw.ts) numbers every
//   point as a ticket, in entry order, and picks one with a public random number (the drand beacon round at the close), so
//   anyone can check it. The team is left out. The prize is the owner's own purchase or card.
// - Entries are private (never in PUBLIC_MODELS or data/public); only a short public name and points are shown.
//
// This file is pure (no database, no node built-ins) so the pages, the client islands, the API and the tests share it.

export type GiveawaySite = "rift" | "dex" | "mtg" | "ygo" | "op";

export interface GiveawaySiteInfo {
  name: string;
  /** Canonical origin, no trailing slash. */
  url: string;
  game: string;
  /** Whose trademarks the game and its cards are, for the rules' "Not sponsored" line. */
  owner: string;
}

export const GIVEAWAY_SITES: Record<GiveawaySite, GiveawaySiteInfo> = {
  rift: { name: "RiftCompare", url: "https://riftcompare.com", game: "Riftbound", owner: "Riot Games" },
  dex: { name: "DexCompare", url: "https://dexcompare.io", game: "Pokémon TCG", owner: "Nintendo, Creatures, GAME FREAK and The Pokémon Company" },
  mtg: { name: "MTG Compare", url: "https://mtgcompare.app", game: "Magic: The Gathering", owner: "Wizards of the Coast" },
  ygo: { name: "YGO Compare", url: "https://ygocompare.com", game: "Yu-Gi-Oh! TCG", owner: "Konami" },
  op: { name: "OP Compare", url: "https://opcompare.com", game: "One Piece Card Game", owner: "Bandai and Eiichiro Oda / Shueisha" },
};

export interface Giveaway {
  key: string;
  site: GiveawaySite;
  title: string;
  /** Short name of the prize, for banners ("2 Delta Reign booster packs"). */
  prizeShort: string;
  prize: string;
  prizeDetail: string;
  /** The prize's page on its own site (a path), when it has one. */
  prizeHref?: string;
  /** RiftCompare's card slug, for the Rift prize's price link. */
  cardSlug?: string;
  imageUrl: string;
  /** Approximate value shown in the rules, from a store price on the day it was set. */
  approxValue: string;
  opensAt: string; // ISO
  closesAt: string; // ISO
  drawOn: string; // human date
  claimDays: number;
}

// Every giveaway closes on the 14th at 23:59 Sydney time and is drawn on the 15th; a new round opens on the 15th, every two
// months (owner, 2026-11-22: "every 2 months, because I think 1 month is too frequent"). The December round is the first on
// the four sister sites. Prizes for the sisters (owner: "less than $20 most recent booster pack ... from Good Games or like
// another TCG store in Australia"): the newest English booster pack of each game, as many as fit under A$20 at the Australian
// stores' in-stock prices on 22 Nov 2026 (tcgcompare's data/public).
const DEC_CLOSE = "2026-12-14T12:59:59Z"; // 14 Dec 2026, 23:59 AEDT (UTC+11)
const DEC_OPEN_SISTERS = "2026-11-22T00:00:00Z";
const POSTED = "shipped to anywhere we can legally post it, at our cost";

export const GIVEAWAYS: Giveaway[] = [
  {
    key: "mf-captain-2026-12",
    site: "rift",
    title: "Win a Miss Fortune, Captain alternate art",
    prizeShort: "a Miss Fortune, Captain alt art",
    prize: "Miss Fortune, Captain (Origins 162a/298, Showcase alternate art)",
    prizeDetail: "One English Riftbound single, ungraded, shipped in a sleeve and top loader to anywhere we can legally post it.",
    cardSlug: "miss-fortune-captain-ogn-162a-298",
    prizeHref: "/card/miss-fortune-captain-ogn-162a-298",
    imageUrl: "https://cdn.riftscribe.gg/cards/thumbnails/large/ogn-162a-298-482e5cf579f16711.webp",
    approxValue: "about US$36 (TCGplayer market price, 18 Nov 2026)",
    opensAt: "2026-11-18T00:00:00Z",
    closesAt: DEC_CLOSE,
    drawOn: "15 December 2026",
    claimDays: 14,
  },
  {
    key: "dex-delta-reign-2026-12",
    site: "dex",
    title: "Win 2 Delta Reign booster packs",
    prizeShort: "2 Delta Reign booster packs",
    prize: "Two Pokémon TCG Mega Evolution: Delta Reign (ME06) booster packs",
    prizeDetail: `Two sealed English booster packs, ${POSTED}.`,
    imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/712099_200w.jpg",
    approxValue: "about A$18 (two packs at A$8.95 to A$9.99 each at Australian stores, 22 Nov 2026)",
    opensAt: DEC_OPEN_SISTERS,
    closesAt: DEC_CLOSE,
    drawOn: "15 December 2026",
    claimDays: 14,
  },
  {
    key: "mtg-star-trek-2026-12",
    site: "mtg",
    title: "Win 2 Star Trek Play Boosters",
    prizeShort: "2 Star Trek Play Boosters",
    prize: "Two Magic: The Gathering Star Trek (TRK) Play Booster packs",
    prizeDetail: `Two sealed English Play Booster packs, ${POSTED}.`,
    imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/706136_200w.jpg",
    approxValue: "about A$17 (two packs at A$8 to A$10 each at Australian stores, 22 Nov 2026)",
    opensAt: DEC_OPEN_SISTERS,
    closesAt: DEC_CLOSE,
    drawOn: "15 December 2026",
    claimDays: 14,
  },
  {
    key: "ygo-beyond-the-brave-2026-12",
    site: "ygo",
    title: "Win 3 Beyond the Brave booster packs",
    prizeShort: "3 Beyond the Brave booster packs",
    prize: "Three Yu-Gi-Oh! TCG Beyond the Brave (BETB) 1st Edition booster packs",
    prizeDetail: `Three sealed English 1st Edition booster packs, ${POSTED}.`,
    imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/711264_200w.jpg",
    approxValue: "about A$18 (three packs at about A$6 each, 22 Nov 2026)",
    opensAt: DEC_OPEN_SISTERS,
    closesAt: DEC_CLOSE,
    drawOn: "15 December 2026",
    claimDays: 14,
  },
  {
    key: "op-op18-2026-12",
    site: "op",
    title: "Win an OP-18 The Dominance of God booster pack",
    prizeShort: "an OP-18 booster pack",
    prize: "One One Piece Card Game The Dominance of God (OP-18) booster pack",
    prizeDetail: `One sealed English booster pack, ${POSTED}.`,
    imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/712904_200w.jpg",
    approxValue: "about A$20 (in stock at Australian stores, 22 Nov 2026)",
    opensAt: DEC_OPEN_SISTERS,
    closesAt: DEC_CLOSE,
    drawOn: "15 December 2026",
    claimDays: 14,
  },
];

/** RiftCompare's own current giveaway (its pages, emails and referral links). */
export const CURRENT_GIVEAWAY = GIVEAWAYS[0];

/** How often a new round opens (owner, 2026-11-22). */
export const GIVEAWAY_EVERY_MONTHS = 2;

export function giveawayByKey(key: string): Giveaway | null {
  return GIVEAWAYS.find((g) => g.key === key) ?? null;
}

export type GiveawayState = "upcoming" | "open" | "closed";

export function giveawayState(g: Pick<Giveaway, "opensAt" | "closesAt">, now: Date): GiveawayState {
  const t = now.getTime();
  if (t < Date.parse(g.opensAt)) return "upcoming";
  if (t > Date.parse(g.closesAt)) return "closed";
  return "open";
}

/** A site's giveaway to show now: the open one, else the next to open, else the one that closed last. */
export function giveawayFor(site: GiveawaySite, now: Date, list: Giveaway[] = GIVEAWAYS): Giveaway | null {
  const mine = list.filter((g) => g.site === site);
  return (
    mine.find((g) => giveawayState(g, now) === "open") ??
    mine.filter((g) => giveawayState(g, now) === "upcoming").sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt))[0] ??
    mine.filter((g) => giveawayState(g, now) === "closed").sort((a, b) => Date.parse(b.closesAt) - Date.parse(a.closesAt))[0] ??
    null
  );
}

/** An entry counts only if it was made while the giveaway was open. */
export function entryCounts(g: Giveaway, createdAt: Date): boolean {
  return giveawayState(g, createdAt) === "open";
}

/** The owner hears about the first entry and every 50th, not each one (the inbox mail cap is shared). */
export function notifyOnCount(count: number): boolean {
  return count === 1 || (count > 0 && count % 50 === 0);
}

// ---------------------------------------------------------------------------------------------------------------
// POINTS (owner, 2026-11-22: "if you're just a user, you get 10 points. And if you check in every day, you get 5 points. And if
// you're a premium user, you get 50 points ... If you refer people, you get like 25 points each"). Every point is one ticket.
export const ENTRY_POINTS = 10;
/** Premium's extra, which a free account gets too by watching a price or claiming it (no purchase necessary). */
export const BONUS_POINTS = 40;
/** What a Premium member starts on: 50. */
export const PREMIUM_START_POINTS = ENTRY_POINTS + BONUS_POINTS;
export const CHECKIN_POINTS = 5;
export const REFERRAL_POINTS = 25;
/**
 * A "star" friend (owner, 2026-11-22: "if you refer someone and they sign up to premium, then you will get 100 points"): a referred
 * friend who takes Premium, OR who checks in on STAR_FRIEND_CHECKINS days of the same giveaway. The free route is what keeps the
 * draw "no purchase necessary": a friend's purchase never earns more than a friend's free activity can.
 */
export const STAR_REFERRAL_POINTS = 100;
export const STAR_FRIEND_CHECKINS = 3;
export const MAX_REFERRALS = 10;

export type BonusVia = "premium" | "watch" | "claim";
/** Kept for the admin page's "why" column: the bonus's source, or "base". */
export type EntryReason = BonusVia | "base";

export interface PointsInput {
  premium: boolean;
  /** Price alerts and sealed watches the account holds now (any of our sites). */
  watches: number;
  /** The entrant pressed "Claim the free bonus". */
  bonusClaimed: boolean;
  /** Sydney days checked in while the giveaway was open. */
  checkins: number;
  /** Confirmed friends who joined through the invite link while it was open. */
  referrals?: number;
  /** Of those, friends with Premium or STAR_FRIEND_CHECKINS check-ins (worth STAR_REFERRAL_POINTS each). */
  starReferrals?: number;
}

export interface Points {
  points: number;
  entry: number;
  bonus: number;
  bonusVia: BonusVia | null;
  checkin: number;
  referral: number;
  /** Friends counted (after the cap). */
  referralsCounted: number;
  /** Of those, star friends (Premium or active). */
  starCounted: number;
  reason: EntryReason;
}

export function entryPoints(p: PointsInput): Points {
  const bonusVia: BonusVia | null = p.premium ? "premium" : p.watches > 0 ? "watch" : p.bonusClaimed ? "claim" : null;
  const referralsCounted = Math.max(0, Math.min(MAX_REFERRALS, Math.floor(p.referrals ?? 0)));
  const checkins = Math.max(0, Math.floor(p.checkins));
  const entry = ENTRY_POINTS;
  const bonus = bonusVia ? BONUS_POINTS : 0;
  const checkin = checkins * CHECKIN_POINTS;
  // Star friends count first, so the cap of ten keeps the best ones.
  const starCounted = Math.max(0, Math.min(referralsCounted, Math.floor(p.starReferrals ?? 0)));
  const referral = starCounted * STAR_REFERRAL_POINTS + (referralsCounted - starCounted) * REFERRAL_POINTS;
  return { points: entry + bonus + checkin + referral, entry, bonus, bonusVia, checkin, referral, referralsCounted, starCounted, reason: bonusVia ?? "base" };
}

// ---------------------------------------------------------------------------------------------------------------
// TICKETS. Every point is a numbered ticket. Entrants are numbered in the order they entered (then by account id, so a tie can
// never reorder), each holding a run of consecutive numbers: the first entrant with 50 points holds #1 to #50, the next starts
// at #51. The draw picks one number (lib/giveaway-draw.ts) and whoever holds it wins.
export interface TicketRun {
  userId: string;
  from: number;
  to: number;
}

export function assignTickets<T extends { userId: string; enteredAt: Date; weight: number }>(rows: T[]): { runs: (TicketRun & { row: T })[]; total: number } {
  const sorted = [...rows]
    .filter((r) => Number.isInteger(r.weight) && r.weight > 0)
    .sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime() || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  let next = 1;
  const runs = sorted.map((row) => {
    const run = { userId: row.userId, from: next, to: next + row.weight - 1, row };
    next += row.weight;
    return run;
  });
  return { runs, total: next - 1 };
}

/** Who holds ticket `n`. */
export function ticketHolder<R extends TicketRun>(runs: R[], n: number): R | null {
  let lo = 0;
  let hi = runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = runs[mid];
    if (n < r.from) hi = mid - 1;
    else if (n > r.to) lo = mid + 1;
    else return r;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// THE DRAW'S PUBLIC RANDOM NUMBER: the League of Entropy's drand beacon (the "default" mainnet chain, a new verifiable random
// value every 30 seconds since 2020, https://drand.love). The draw uses the first round published at or after the close, so
// nobody (us included) can know it while entries are open, and anyone can look it up afterwards.
export const DRAND_GENESIS = 1595431050;
export const DRAND_PERIOD = 30;
export const DRAND_API = "https://api.drand.sh/public";

/** The first drand round published at or after `iso`. Round r is published at GENESIS + (r - 1) × PERIOD. */
export function drandRoundAt(iso: string): number {
  const t = Math.floor(Date.parse(iso) / 1000);
  return Math.max(1, Math.ceil((t - DRAND_GENESIS) / DRAND_PERIOD) + 1);
}

/** The public page where anyone can read a round. */
export function drandRoundUrl(round: number): string {
  return `${DRAND_API}/${round}`;
}

/** The days, in Sydney time, a check-in is counted on ("2026-11-22"). */
export function checkinDay(now: Date): string {
  return sydneyDay(now);
}

// The sister pages show the same giveaway from this API; their own copy lives in their repos.
export function sitePath(g: Giveaway): string {
  return `${GIVEAWAY_SITES[g.site].url}/giveaway`;
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
