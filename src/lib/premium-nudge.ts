// PERSONAL PREMIUM NUDGES — what Deal Finder and Rising Cards say about the
// cards THIS account watches and owns. DECISIONS.md, "Premium after sign-up:
// the post-signup funnel", 2026-09-23.
//
// Why: every Premium pitch on the site was generic ("Deal Finder lists cards
// that are cheaper in one place than another"), true for everyone and therefore
// compelling for no one. The most persuasive line available is about the
// reader's own cards — "4 cards you watch are underpriced right now" — and the
// data to say it already exists and is already cached.
//
// COST, per call: two user-scoped, capped queries (their watches, their
// collection — getUserCardIds below); the Deal Finder ranking from its
// day-cached aggregates (lib/arbitrage.ts getTcgDealRanks — no detail fetch);
// Rising Cards from its day cache; and at most one single-row name lookup. Both
// loaders cache themselves and are called directly — never from inside another
// cache (src/lib/db.ts rule 6).
//
// getUserCardIds is also what the Deal Finder's "Only my cards" chips
// (?mine=watch|own, Plus) read: the same two capped selects, per request,
// NEVER cached — a shared cache entry keyed by user would be one entry per
// account per day, and wrapping the self-caching ranking beside it would
// disable that cache (tests/deal-finder-buyer-list.test.ts pins both).
//
// WHAT IT REVEALS: counts, whether a card is inside the free top three, and one
// example card name. Never a price, a gap or a rank beyond "in the free top 3
// or not" — those are what Premium sells.
import { prisma } from "./db";
import { defaultTcgBuyKeys, getTcgDealRanks } from "./arbitrage";
import { getCachedRisingCards } from "./rise-predictor";
import type { Country } from "./country";

// Same number as FREE_PREVIEW_ROWS in the Deal Finder and Rising Cards pages —
// a hit at or above it is one the free account can already see.
// tests/premium-post-signup.test.ts pins the three together.
export const FREE_PREVIEW_ROWS = 3;
const RISING_LIST = 40; // the ranked list Rising Cards shows in full

export interface NudgeCounts {
  deals: number; // cards in Deal Finder's default view
  dealsFree: number; // …of which in the free top 3
  rising: number; // cards among Rising Cards' ranked picks (Global)
  risingFree: number; // …of which in the free top 3
}
export interface PremiumNudge {
  watched: NudgeCounts;
  owned: NudgeCounts;
  example: { name: string; kind: "deal" | "rising"; set: "watched" | "owned" } | null;
}

const EMPTY: NudgeCounts = { deals: 0, dealsFree: 0, rising: 0, risingFree: 0 };

/** Pure: tally one set of card ids against the two rankings. */
export function tally(ids: Iterable<string>, dealRank: Map<string, number>, risingRank: Map<string, number>): NudgeCounts {
  const c = { ...EMPTY };
  for (const id of ids) {
    const d = dealRank.get(id);
    if (d != null) {
      c.deals++;
      if (d <= FREE_PREVIEW_ROWS) c.dealsFree++;
    }
    const r = risingRank.get(id);
    if (r != null) {
      c.rising++;
      if (r <= FREE_PREVIEW_ROWS) c.risingFree++;
    }
  }
  return c;
}

export function hasNudge(n: PremiumNudge | null): n is PremiumNudge {
  return !!n && n.watched.deals + n.watched.rising + n.owned.rising > 0;
}

/**
 * The card ids an account watches ("watch": its PriceAlert rows, capped at 500)
 * or owns ("own": its CollectionCard rows, capped at 1000). One user-scoped,
 * capped select; uncached on purpose — see the header.
 */
export async function getUserCardIds(userId: string, which: "watch" | "own"): Promise<Set<string>> {
  const rows =
    which === "watch"
      ? await prisma.priceAlert.findMany({ where: { userId }, select: { cardId: true }, take: 500 })
      : await prisma.collectionCard.findMany({ where: { userId }, select: { cardId: true }, take: 1000 });
  return new Set(rows.map((r) => r.cardId));
}

export async function getPremiumNudge(userId: string, country: Country): Promise<PremiumNudge | null> {
  const [watched, owned] = await Promise.all([getUserCardIds(userId, "watch"), getUserCardIds(userId, "own")]);
  if (!watched.size && !owned.size) return null; // nothing of theirs to talk about

  const [dealRank, rising] = await Promise.all([
    getTcgDealRanks(country, defaultTcgBuyKeys(country)),
    getCachedRisingCards("GLOBAL").catch(() => null),
  ]);
  const picks = rising?.picks.slice(0, RISING_LIST) ?? [];
  const risingRank = new Map(picks.map((p, i) => [p.id, i + 1]));

  // Owned cards: Rising only. "Underpriced vs TCGplayer" is a BUYING signal,
  // which says nothing useful about a card someone already has.
  const nudge: PremiumNudge = {
    watched: tally(watched, dealRank, risingRank),
    owned: { ...tally(owned, new Map(), risingRank) },
    example: null,
  };
  if (!hasNudge(nudge)) return null;

  // One example, preferring a card the free account CANNOT already see — the
  // point is what Premium adds, not what the top 3 already showed them.
  const locked = (rank: number | undefined) => rank != null && rank > FREE_PREVIEW_ROWS;
  const watchedDeal = [...watched].find((id) => locked(dealRank.get(id))) ?? [...watched].find((id) => dealRank.has(id));
  const watchedRise = [...watched].find((id) => locked(risingRank.get(id))) ?? [...watched].find((id) => risingRank.has(id));
  const ownedRise = [...owned].find((id) => locked(risingRank.get(id))) ?? [...owned].find((id) => risingRank.has(id));
  const pick: { id: string; kind: "deal" | "rising"; set: "watched" | "owned" } | null = watchedDeal
    ? { id: watchedDeal, kind: "deal", set: "watched" }
    : watchedRise
      ? { id: watchedRise, kind: "rising", set: "watched" }
      : ownedRise
        ? { id: ownedRise, kind: "rising", set: "owned" }
        : null;
  if (pick) {
    const fromRising = picks.find((p) => p.id === pick.id)?.displayName;
    const name =
      fromRising ?? (await prisma.card.findUnique({ where: { id: pick.id }, select: { name: true } }).catch(() => null))?.name;
    if (name) nudge.example = { name, kind: pick.kind, set: pick.set };
  }
  return nudge;
}

// ── Copy ─────────────────────────────────────────────────────────────────────
// Pure, so every sentence is testable without a database. Returns null when
// there is nothing true and specific to say — the caller then renders nothing,
// rather than falling back to a generic pitch.
//
// `audience` (2026-09-25): "free" (the default) ends on the Plus-level gate
// line; "member" drops the free-top-3 counts and the pitch, because a member
// already sees every row — PremiumNudgeCard then links to the list itself
// (Deal Finder ?mine=watch|own, or Rising Cards) instead of a wall.
// `kind` says which list the nudge is about, so that link can be the right one.
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const PLUS_GATE_LINE = "Plus shows every one, and can email you when one hits your price.";

export function nudgeCopy(
  nudge: PremiumNudge,
  where: "watched" | "owned",
  audience: "free" | "member" = "free",
): { heading: string; line: string; kind: "deal" | "rising" } | null {
  const c = nudge[where];
  const who = where === "watched" ? ["card you watch", "cards you watch"] : ["card you own", "cards you own"];
  const ex = nudge.example && nudge.example.set === where ? nudge.example : null;
  const free = audience === "free";

  if (where === "watched" && c.deals > 0) {
    const heading = `${n(c.deals, `${who[0]} is`, `${who[1]} are`)} underpriced right now`;
    const parts = [
      `Deal Finder shows ${c.deals === 1 ? "it" : "them"} selling below TCGplayer's market price${ex?.kind === "deal" ? ` — including ${ex.name}` : ""}.`,
    ];
    if (free && c.dealsFree > 0) parts.push(`${c.dealsFree === c.deals ? (c.deals === 1 ? "It's" : "All are") : n(c.dealsFree, "is", "are")} in your free top 3.`);
    if (c.rising > 0) parts.push(`${n(c.rising, "is also a Rising Cards pick", "are also Rising Cards picks")}.`);
    if (free) parts.push(PLUS_GATE_LINE);
    return { heading, line: parts.join(" "), kind: "deal" };
  }
  if (c.rising > 0) {
    const heading = `${n(c.rising, `${who[0]} is a Rising Cards pick`, `${who[1]} are Rising Cards picks`)} right now`;
    const parts = [
      `Ranked by demand and price-timing signals${ex?.kind === "rising" ? ` — including ${ex.name}` : ""}.`,
    ];
    if (free && c.risingFree > 0) parts.push(`${c.risingFree === c.rising ? (c.rising === 1 ? "It's" : "All are") : n(c.risingFree, "is", "are")} in your free top 3.`);
    if (free) parts.push("Plus shows every pick and the signals behind each score.");
    return { heading, line: parts.join(" "), kind: "rising" };
  }
  return null;
}
