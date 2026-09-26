import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { formatDeckLine, parseDeckList, resolveDeckLines } from "./deck";
import { championForCardName } from "./champions";
import {
  DECK_MAX_UNMATCHED,
  DECK_MIN_CARDS,
  deckDomains,
  deckSlug,
  deckTotals,
  legendSlugFrom,
  type MarketTotals,
} from "./published-decks";

// Server half of the deck library (lib/published-decks.ts has the rules).

const RESOLVE_SELECT = {
  id: true,
  slug: true,
  name: true,
  nameNormalized: true,
  setCode: true,
  collectorNumber: true,
  type: true,
  domain: true,
  lowestPriceCents: true,
  lowestPriceCentsUs: true,
  lowestPriceCentsUk: true,
  lowestPriceCentsSg: true,
  lowestPriceCentsCa: true,
  lowestPriceCentsEu: true,
} satisfies Prisma.CardSelect;

type ResolvedCard = Prisma.CardGetPayload<{ select: typeof RESOLVE_SELECT }>;

export interface PreparedDeck {
  lines: { cardId: string; qty: number }[];
  list: string;
  cardIds: string[];
  cardCount: number;
  legends: { id: string; name: string }[];
  unmatched: string[];
  domains: string[];
  totals: MarketTotals;
}

/** Resolves a pasted list exactly the way /deck prices it (lib/deck.ts), merging repeat lines. */
export async function prepareDeck(text: string): Promise<PreparedDeck> {
  const orderBy = [{ lowestPriceCentsUs: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput];
  const res = await resolveDeckLines(parseDeckList(text, { plainNames: true }), (args) =>
    prisma.card.findMany({ ...args, select: RESOLVE_SELECT, orderBy }),
  );
  const merged = new Map<string, { card: ResolvedCard; qty: number }>();
  for (const m of res.matched) {
    const cur = merged.get(m.card.id);
    merged.set(m.card.id, { card: m.card, qty: Math.min(99, (cur?.qty ?? 0) + m.line.qty) });
  }
  const entries = [...merged.values()];
  return {
    lines: entries.map((e) => ({ cardId: e.card.id, qty: e.qty })),
    list: entries.map((e) => formatDeckLine(e.qty, e.card, true)).join("\n"),
    cardIds: entries.map((e) => e.card.id),
    cardCount: entries.reduce((n, e) => n + e.qty, 0),
    legends: entries.filter((e) => e.card.type === "Legend").map((e) => ({ id: e.card.id, name: e.card.name })),
    unmatched: [...res.unmatched.map((l) => l.raw), ...res.fuzzy.map((f) => f.line.raw)],
    domains: deckDomains(entries.map((e) => ({ qty: e.qty, domain: e.card.domain }))),
    totals: deckTotals(entries.map((e) => ({ qty: e.qty, card: e.card }))),
  };
}

export type PublishInput = {
  title: string;
  description: string | null;
  text: string;
  legendCardId?: string | null;
  userId: string | null;
  authorName: string | null;
  source: "user" | "import";
};

export type PublishResult =
  | { ok: true; slug: string; legendSlug: string }
  | { ok: false; error: string; legends?: { id: string; name: string }[] };

export async function publishDeck(input: PublishInput): Promise<PublishResult> {
  const deck = await prepareDeck(input.text);
  if (deck.unmatched.length > DECK_MAX_UNMATCHED) {
    return { ok: false, error: `${deck.unmatched.length} lines didn't match a card — fix them in the builder first.` };
  }
  if (deck.cardCount < DECK_MIN_CARDS) {
    return { ok: false, error: `A published deck needs at least ${DECK_MIN_CARDS} cards (this list has ${deck.cardCount}).` };
  }
  if (!deck.legends.length) return { ok: false, error: "Add your Legend to the list first (for example “1 Jinx, Loose Cannon”)." };
  const legend = input.legendCardId ? deck.legends.find((l) => l.id === input.legendCardId) : deck.legends.length === 1 ? deck.legends[0] : null;
  if (!legend) return { ok: false, error: "Pick which Legend this deck is built around.", legends: deck.legends };

  if (input.userId) {
    const dup = await prisma.publishedDeck.findFirst({ where: { userId: input.userId, list: deck.list }, select: { slug: true } });
    if (dup) return { ok: false, error: "You've already published this exact list." };
  }

  const legendSlug = legendSlugFrom(legend.name, championForCardName(legend.name)?.slug);
  const slug = deckSlug(input.title, randomBytes(4).toString("hex"));
  await prisma.publishedDeck.create({
    data: {
      slug,
      userId: input.userId,
      authorName: input.authorName,
      title: input.title,
      description: input.description,
      legendCardId: legend.id,
      legendName: legend.name,
      legendSlug,
      domains: deck.domains.join(","),
      list: deck.list,
      lines: deck.lines,
      cardIds: deck.cardIds,
      cardCount: deck.cardCount,
      publishedTotals: deck.totals as Prisma.InputJsonValue,
      source: input.source,
    },
  });
  return { ok: true, slug, legendSlug };
}

// ── Reads (ISR pages only — never per request) ──────────────────────────────

export const DECK_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  authorName: true,
  legendName: true,
  legendSlug: true,
  legendCardId: true,
  domains: true,
  lines: true,
  cardCount: true,
  publishedTotals: true,
  createdAt: true,
} satisfies Prisma.PublishedDeckSelect;

export type DeckListRow = Prisma.PublishedDeckGetPayload<{ select: typeof DECK_LIST_SELECT }>;

const PRICE_SELECT = {
  id: true,
  lowestPriceCents: true,
  lowestPriceCentsUs: true,
  lowestPriceCentsUk: true,
  lowestPriceCentsSg: true,
  lowestPriceCentsCa: true,
  lowestPriceCentsEu: true,
} satisfies Prisma.CardSelect;

/** Current per-market totals for many decks: one price read over the distinct cards they use. */
export async function currentTotals(decks: { id: string; lines: Prisma.JsonValue }[]): Promise<Record<string, MarketTotals>> {
  const parsed = decks.map((d) => ({ id: d.id, lines: (d.lines as { cardId: string; qty: number }[] | null) ?? [] }));
  const ids = [...new Set(parsed.flatMap((d) => d.lines.map((l) => l.cardId)))];
  if (!ids.length) return {};
  const cards = await prisma.card.findMany({ where: { id: { in: ids } }, select: PRICE_SELECT });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: Record<string, MarketTotals> = {};
  for (const d of parsed) out[d.id] = deckTotals(d.lines.map((l) => ({ qty: l.qty, card: byId.get(l.cardId) })));
  return out;
}

export async function liveDecks(where: Prisma.PublishedDeckWhereInput = {}, take = 300): Promise<DeckListRow[]> {
  return prisma.publishedDeck
    .findMany({ where: { status: "live", ...where }, orderBy: { createdAt: "desc" }, take, select: DECK_LIST_SELECT })
    .catch(() => []);
}

/** Up to six live decks that play a card (the card page's "Decks using this card"). */
export async function decksUsingCard(cardId: string): Promise<{ slug: string; title: string; legendName: string }[]> {
  return prisma.publishedDeck
    .findMany({
      where: { status: "live", cardIds: { has: cardId } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { slug: true, title: true, legendName: true },
    })
    .catch(() => []);
}
