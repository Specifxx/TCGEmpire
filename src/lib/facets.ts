// Server-rendered facet pages (/cards/type/[type], /cards/rarity/[rarity],
// /cards/printing/[printing]) — clean, crawlable URLs for dimensions that today
// only exist as /browse query params. runeweave.com ships ~90 of these; we had 7
// (the /domains pages). This is the code-side half of the fix; the actual
// filtering logic is NOT duplicated here — every facet predicate below is
// expressed as the exact same CardQuery shape buildCardWhere() (lib/cards.ts)
// already accepts, so a facet page and the equivalent /browse checkbox can never
// drift apart on what counts as a match.
//
// Deliberately NOT built here: a region/faction facet (Ionia, Noxus, …). Card.tags
// is a real column but no live import pipeline currently writes it — a region
// facet would generate real URLs with zero cards behind them. Revisit once tags
// is backfilled (see the card-page tag chips, which have the same problem).
import type { CardQuery } from "./cards";
import { CARD_TYPES, RARITY_KEYS, type CardType } from "./constants";

export interface Facet {
  slug: string;
  label: string;
  query: CardQuery;
  intro: string; // unique, per-value copy for the landing page (generic, not
  // Riftbound-rules-specific claims — see file header)
}

const TYPE_INTRO: Record<string, string> = {
  Unit: "Units are the cards that take the board and fight for you — the core of most Riftbound decks.",
  Spell: "Spells are one-time effects you cast from hand, then they go to the trash.",
  Gear: "Gear cards equip a unit for an extra edge — stats, an ability, or both.",
  Rune: "Runes power your domains, letting you cast the spells and units your deck needs.",
  Battlefield: "Battlefields are the locations fought over during a game, each with its own effect.",
  Legend: "Legends are the champion your deck is built around — the card you start every game with.",
};
const RARITY_INTRO: Record<string, string> = {
  Common: "The most frequently pulled rarity tier — the backbone of most decks.",
  Uncommon: "A step up from Common — still a core deckbuilding rarity, less frequently pulled.",
  Rare: "A harder pull than Common/Uncommon, often carrying a stronger effect or stat line.",
  Epic: "One of Riftbound's premium rarity tiers — the cards collectors chase.",
  Showcase: "Riftbound's premium alternate-art tier — the same card, a striking treatment.",
};

export const TYPE_FACETS: Facet[] = CARD_TYPES.map((t) => ({
  slug: t.toLowerCase(),
  label: t,
  query: { type: t } as CardQuery,
  intro: TYPE_INTRO[t] ?? `Every Riftbound ${t} card.`,
}));

export const RARITY_FACETS: Facet[] = RARITY_KEYS.map((r) => ({
  slug: r.toLowerCase(),
  label: r,
  query: { rarity: r } as CardQuery,
  intro: RARITY_INTRO[r] ?? `Every Riftbound ${r}-rarity card.`,
}));

// Printing/finish facets. Predicates match Filters.tsx's "Printing" section
// exactly (see src/components/Filters.tsx) — same query params, same semantics.
export const PRINTING_FACETS: Facet[] = [
  {
    slug: "alternate-art",
    label: "Alternate Art",
    query: { variant: "alt" } as CardQuery,
    intro: "Alternate-art printings — the same card with different artwork from the base version.",
  },
  {
    slug: "signature",
    label: "Signature",
    query: { sig: "1" } as CardQuery,
    intro: "Signature prints — collector-number \"*\" cards carrying a stamped artist signature.",
  },
  {
    slug: "overnumbered",
    label: "Overnumbered",
    query: { over: "1" } as CardQuery,
    intro: "Overnumbered chase prints — collector numbers beyond the set's official total.",
  },
  {
    slug: "promo",
    label: "Promo",
    query: { promo: "1" } as CardQuery,
    intro: "Promo printings — organised-play and prerelease prints of an existing card.",
  },
];

export const typeFacetBySlug = (slug: string): Facet | undefined =>
  TYPE_FACETS.find((f) => f.slug === slug.toLowerCase());
export const rarityFacetBySlug = (slug: string): Facet | undefined =>
  RARITY_FACETS.find((f) => f.slug === slug.toLowerCase());
export const printingFacetBySlug = (slug: string): Facet | undefined =>
  PRINTING_FACETS.find((f) => f.slug === slug.toLowerCase());

// Below this many matching cards, a facet is real but thin — noindex it rather
// than ship a page whose only content is a short card grid (explicit constraint:
// "if a facet has fewer than ~8 cards, noindex it rather than shipping thin").
export const FACET_THIN_THRESHOLD = 8;
