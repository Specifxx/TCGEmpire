// Structured data for /decks, kept OUT of the page component so it can be unit
// tested against every market we serve. The currency bug this guards against is
// invisible in review — a hardcoded "AUD" renders fine and only misprices the
// markup for five of six markets — so tests/deck-seo.test.ts runs these builders
// across all of COUNTRY_LIST and asserts the offer currency tracks the market.
import type { CountryInfo } from "./country";
import { formatMoney } from "./format";

// The subset of ResolvedDeck these builders need. Structural, so both the real
// resolver output and test fixtures satisfy it without importing Prisma.
export interface DeckLdInput {
  slug: string;
  name: string;
  archetype: string;
  description: string;
  tier: string;
  totalCents: number;
  pricedCards: number;
  imageUrl: string | null;
  metaSharePct?: number;
  winRatePct?: number;
  top8s?: number;
}

export interface DeckLdOpts {
  siteUrl: string;
  setLabel: string;
  metaUpdated: string;
  info: CountryInfo;
}

/** Metagame standing as a sentence, for the Product description. Real tournament
 *  statistics — deliberately NOT modelled as a rating (see itemListLd). */
export function statLine(d: Pick<DeckLdInput, "metaSharePct" | "winRatePct" | "top8s">): string {
  const bits = [
    d.metaSharePct != null ? `${d.metaSharePct}% metashare` : null,
    d.winRatePct != null ? `${d.winRatePct}% win rate` : null,
    d.top8s != null ? `${d.top8s} top-8 finish${d.top8s === 1 ? "" : "es"}` : null,
  ].filter(Boolean);
  return bits.length ? `Current metagame standing: ${bits.join(", ")}.` : "";
}

/** Cheapest deck to assemble in the active market, ignoring unpriced decks. */
export function cheapestDeck<T extends DeckLdInput>(decks: T[]): T | null {
  const priced = decks.filter((d) => d.totalCents > 0);
  return priced.length ? priced.reduce((a, b) => (b.totalCents < a.totalCents ? b : a)) : null;
}

/** Best-converting deck by win rate. */
export function bestWinRateDeck<T extends DeckLdInput>(decks: T[]): T | null {
  return decks
    .filter((d) => d.winRatePct != null)
    .reduce<T | null>((a, b) => (a == null || (b.winRatePct ?? 0) > (a.winRatePct ?? 0) ? b : a), null);
}

/**
 * ItemList of Product entities, one per deck.
 *
 * AggregateOffer, not Offer: "build cost from X" is a floor assembled across many
 * stores, not one purchasable listing, and lowPrice is the schema term for exactly
 * that. `lowPrice` is the same number the card renders and `priceCurrency` is the
 * resolved market's — never hardcoded.
 *
 * Deliberately NO aggregateRating. A win rate is a tournament statistic, not a
 * rating of the deck by users or an editor, and a top-8 count is not a review
 * volume. Presenting them as one is the misrepresentation that costs a site its
 * rich-result eligibility, so the win rate lives in `description` instead.
 */
export function deckItemListLd(decks: DeckLdInput[], o: DeckLdOpts) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Riftbound ${o.setLabel} Top Meta Decks`,
    url: `${o.siteUrl}/decks`,
    numberOfItems: decks.length,
    // Both dates describe the LIST and come from the same stamp the visible "meta
    // last updated" <time> renders — see prisma/meta-decks.json._metaUpdated.
    ...(o.metaUpdated ? { datePublished: o.metaUpdated, dateModified: o.metaUpdated } : {}),
    // Edges back to the site-level graph in app/layout.tsx. Without them this node
    // is an island and the Organization/WebSite entity signals — sameAs,
    // areaServed, knowsAbout — don't propagate to the page.
    isPartOf: { "@id": `${o.siteUrl}/#website` },
    publisher: { "@id": `${o.siteUrl}/#org` },
    itemListElement: decks.map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: `${d.name} — Riftbound ${o.setLabel} deck`,
        url: `${o.siteUrl}/decks/${d.slug}`,
        ...(d.imageUrl ? { image: d.imageUrl } : {}),
        category: `Riftbound ${o.setLabel} ${d.archetype}`,
        description: statLine(d) ? `${d.description} ${statLine(d)}` : d.description,
        ...(d.totalCents > 0
          ? {
              offers: {
                "@type": "AggregateOffer",
                priceCurrency: o.info.currency,
                lowPrice: (d.totalCents / 100).toFixed(2),
                offerCount: d.pricedCards,
                availability: "https://schema.org/InStock",
                url: `${o.siteUrl}/decks/${d.slug}`,
              },
            }
          : {}),
      },
    })),
  };
}

export interface FaqEntry {
  "@type": "Question";
  name: string;
  acceptedAnswer: { "@type": "Answer"; text: string };
}

/**
 * The page's FAQ, as data. The page RENDERS this same array as visible copy —
 * marking up an answer that isn't on the page breaks Google's guidelines, so the
 * one array is the single source for both.
 *
 * Note: Google restricted FAQ rich results to government and health sites in
 * August 2023, so this is for correctness and AI answer engines, not an expected
 * SERP accordion.
 */
export function deckFaq(decks: DeckLdInput[], o: DeckLdOpts): FaqEntry[] {
  const cheapest = cheapestDeck(decks);
  const bestWr = bestWinRateDeck(decks);
  const q = (name: string, text: string): FaqEntry => ({
    "@type": "Question",
    name,
    acceptedAnswer: { "@type": "Answer", text },
  });
  return [
    q(
      "How many cards is a Riftbound tournament list?",
      "66 cards. That is a 56-card main deck — 40 main deck, 12 runes, 3 battlefields and a legend — plus a side deck of up to 10. The side deck rose from 8 to 10 in the July 2026 tournament rules update, effective 24 July 2026."
    ),
    q(
      "Can I put runes or battlefields in my side deck?",
      "No. Runes, Legends and Battlefields cannot be sideboarded. The 3-copy limit also counts your main deck and side deck together, so three copies in the main deck leaves none for the side."
    ),
    ...(cheapest
      ? [
          q(
            `What is the best budget ${o.setLabel} deck?`,
            `${cheapest.name} is the cheapest list on this page to assemble, at ${formatMoney(cheapest.totalCents, o.info.currency)} in ${o.info.place}. Build cost is priced live from ${o.info.adjective} stores and excludes the 12-card rune base.`
          ),
        ]
      : []),
    ...(bestWr
      ? [
          q(
            `Which ${o.setLabel} deck has the highest win rate?`,
            `${bestWr.name}, at ${bestWr.winRatePct}% across ${bestWr.top8s} top-8 finishes in the current ${o.setLabel} metagame.`
          ),
        ]
      : []),
  ];
}

export function deckFaqLd(decks: DeckLdInput[], o: DeckLdOpts) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: deckFaq(decks, o) };
}
