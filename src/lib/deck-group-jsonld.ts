// Structured data + FAQ copy for the programmatic deck-group pages
// (/decks/archetype/<slug>, /decks/domain/<slug>).
//
// Kept out of the route components for the same reason lib/deck-jsonld.ts is:
// these builders have to be exercised across every market in a unit test, because
// the bug they exist to prevent — a currency or a price that renders perfectly and
// is simply wrong for five of the six markets we serve — is invisible in review.
//
// The other rule enforced here: NOTHING is marked up as an offer unless
// deckCostVerdict() in lib/deck-groups.ts says its build cost is publishable.
// Structured data is a machine-readable claim about a price; emitting one for a
// deck where 4 of 44 cards resolved would be publishing a wrong price to a
// shopping surface, which is precisely the failure the verdict exists to stop.
import type { CountryInfo } from "./country";
import { formatMoney } from "./format";
import { statLine, type DeckLdInput } from "./deck-jsonld";
import {
  deckCostVerdict,
  cheapestPublishableDeck,
  deckGroupDescription,
  deckGroupPath,
  deckGroupTitle,
  type DeckGroup,
} from "./deck-groups";

export interface DeckGroupLdOpts {
  siteUrl: string;
  setLabel: string;
  metaUpdated: string;
  info: CountryInfo;
}

/**
 * What these builders need on top of /decks' DeckLdInput: `priceableCards`, the
 * denominator deckCostVerdict() divides by to get price coverage. /decks renders
 * a total with its own "n/m priced" caption beside it; these pages instead SORT
 * and HEADLINE by cost ("the cheapest {archetype} deck is X"), so a total drawn
 * from four resolved cards would be promoted rather than merely displayed —
 * which is why coverage is a required input here and not there.
 *
 * Structural, so ResolvedDeck satisfies it without importing Prisma into a
 * module the tests need to load without a database.
 */
export interface DeckGroupLdInput extends DeckLdInput {
  priceableCards: number;
}

/** The cheapest-cart figure, when one was actually computed. Optional because a
 *  DB blip must degrade the page, never fabricate a cart. */
export interface CheapestCart {
  deckName: string;
  deckSlug: string;
  totalCents: number;
  storeCount: number;
  topStoreName: string;
  matchedCards: number;
  savedCents: number;
}

/**
 * ItemList of the group's decks as Products.
 *
 * AggregateOffer/lowPrice (not Offer/price), matching /decks: a build cost is a
 * floor assembled across many stores, not one purchasable listing. No
 * aggregateRating anywhere — a tournament win rate is not a user rating, and
 * dressing it as one is what costs a site its rich-result eligibility.
 */
export function deckGroupItemListLd(g: DeckGroup, decks: DeckGroupLdInput[], o: DeckGroupLdOpts) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: deckGroupTitle(g),
    description: deckGroupDescription(g),
    url: `${o.siteUrl}${deckGroupPath(g)}`,
    numberOfItems: decks.length,
    ...(o.metaUpdated ? { datePublished: o.metaUpdated, dateModified: o.metaUpdated } : {}),
    // Edges back to the site-level graph in app/layout.tsx — without them the
    // node is an island and the Organization/WebSite signals don't propagate.
    isPartOf: { "@id": `${o.siteUrl}/#website` },
    publisher: { "@id": `${o.siteUrl}/#org` },
    itemListElement: decks.map((d, i) => {
      const verdict = deckCostVerdict(d);
      return {
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          name: `${d.name} — Riftbound ${o.setLabel} ${g.name} deck`,
          url: `${o.siteUrl}/decks/${d.slug}`,
          ...(d.imageUrl ? { image: d.imageUrl } : {}),
          category: `Riftbound ${o.setLabel} ${d.archetype}`,
          description: statLine(d) ? `${d.description} ${statLine(d)}` : d.description,
          ...(verdict.ok && verdict.totalCents != null
            ? {
                offers: {
                  "@type": "AggregateOffer",
                  priceCurrency: o.info.currency,
                  lowPrice: (verdict.totalCents / 100).toFixed(2),
                  offerCount: d.pricedCards,
                  availability: "https://schema.org/InStock",
                  url: `${o.siteUrl}/decks/${d.slug}`,
                },
              }
            : {}),
        },
      };
    }),
  };
}

export interface GroupFaqEntry {
  q: string;
  a: string;
}

/**
 * The page's FAQ, as data — rendered visibly by the route AND marked up, from
 * this one array. Every answer is built from the real numbers on the page; a
 * question whose data isn't publishable is omitted rather than answered with a
 * placeholder.
 */
export function deckGroupFaq(
  g: DeckGroup,
  decks: DeckGroupLdInput[],
  o: DeckGroupLdOpts,
  cart?: CheapestCart | null
): GroupFaqEntry[] {
  const label = g.axis === "archetype" ? `${g.name.toLowerCase()} deck` : `${g.name} deck`;
  const cheapest = cheapestPublishableDeck(decks);
  const priced = decks.filter((d) => deckCostVerdict(d).ok);
  const dearest = priced.length ? priced.reduce((a, b) => (b.totalCents > a.totalCents ? b : a)) : null;
  const bestWr = decks
    .filter((d) => d.winRatePct != null)
    .reduce<DeckGroupLdInput | null>((a, b) => (a == null || (b.winRatePct ?? 0) > (a.winRatePct ?? 0) ? b : a), null);
  const tiers = [...new Set(decks.map((d) => d.tier))].sort();

  const faqs: GroupFaqEntry[] = [
    {
      q: `How many Riftbound ${label}s are in the current meta?`,
      a: `${decks.length} — every ${label} on this page is a real tournament list from the ${o.setLabel} metagame, not a house build, and they span tier ${tiers.join(", ")}. The list is re-cut against the published metagame breakdown rather than maintained by hand.`,
    },
  ];

  if (cheapest && dearest) {
    const lo = formatMoney(cheapest.totalCents, o.info.currency);
    const hi = formatMoney(dearest.totalCents, o.info.currency);
    faqs.push({
      q: `How much does a Riftbound ${label} cost to build?`,
      a:
        cheapest.slug === dearest.slug
          ? `${lo} in ${o.info.place} for ${cheapest.name}, priced from the cheapest in-stock listing for each card across the stores we track. That excludes the 12-card rune base, which every deck in the domain runs.`
          : `Between ${lo} (${cheapest.name}) and ${hi} (${dearest.name}) in ${o.info.place}, using each card's cheapest in-stock price across the stores we track. Build cost excludes the 12-card rune base and can span multiple stores.`,
    });
    faqs.push({
      q: `What is the cheapest Riftbound ${label}?`,
      a: `${cheapest.name}, at ${lo} in ${o.info.place} at today's prices. Prices move daily, so the ranking on this page is re-priced with every import rather than fixed.`,
    });
  }

  if (cart) {
    faqs.push({
      q: `Where is the cheapest place to buy a Riftbound ${label} right now?`,
      a: `Right now the cheapest complete cart for ${cart.deckName} is ${formatMoney(cart.totalCents, o.info.currency)} delivered across ${cart.storeCount} ${cart.storeCount === 1 ? "store" : "stores"}${cart.topStoreName ? `, led by ${cart.topStoreName}` : ""}. That figure includes postage and each store's free-shipping threshold, which is why it can beat buying every card from its individually cheapest store.`,
    });
  }

  if (bestWr && bestWr.winRatePct != null) {
    faqs.push({
      q: `Which Riftbound ${label} has the best win rate?`,
      a: `${bestWr.name}, at ${bestWr.winRatePct}%${bestWr.top8s != null ? ` across ${bestWr.top8s} top-8 finish${bestWr.top8s === 1 ? "" : "es"}` : ""} in the current ${o.setLabel} field. Win rate is a tournament statistic from the published metagame breakdown, not a rating or a review.`,
    });
  }

  return faqs;
}

export function deckGroupFaqLd(
  g: DeckGroup,
  decks: DeckGroupLdInput[],
  o: DeckGroupLdOpts,
  cart?: CheapestCart | null
) {
  const faqs = deckGroupFaq(g, decks, o, cart);
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
