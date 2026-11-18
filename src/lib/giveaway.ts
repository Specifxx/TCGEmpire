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
