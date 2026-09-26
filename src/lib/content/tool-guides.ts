import { getArticles, type Article } from "@/lib/articles";
import type { RelatedGuide } from "@/lib/content/related-guides";

// ─────────────────────────────────────────────────────────────────────────────
// Tool ↔ guide: which of our guides explains each tool or data page, and — read
// the other way round — which tools each guide is about.
// ─────────────────────────────────────────────────────────────────────────────
// The card page solved "a programmatic page with no path to our writing" with
// guidesForCard (Phase 12d). Every other data surface a visitor or an ad
// reviewer samples — /browse, /sealed, /movers, the tools — linked to nothing
// we wrote, and the guides that explain those tools were not linked back.
//
// One map, read both ways, so the two directions cannot drift: a tool page
// renders guidesForTool(route) under its data, and an article's "Tools in this
// guide" line is toolsForArticle(slug), the inverse of the same entries.
//
// Rules for an entry (2026-09-26, "Blog and tools, joined up" in DECISIONS.md):
//  - at most three guides, most useful first — more reads as a link farm;
//  - each `reason` says what the GUIDE covers, in its own words, never a claim
//    about the tool the guide does not make;
//  - only guides whose claims about the site are true (tests/site-claims.test.ts
//    scans every article), and never a retired tool;
//  - no invest/flip framing (tests/premium-positioning.test.ts).
//
// Pure and in-memory (getArticles is a constant array): safe on any ISR page
// with no query and no cache (src/lib/db.ts rules 5 and 6).

type GuideRef = { slug: string; reason: string };
type ToolEntry = { label: string; guides: readonly GuideRef[] };

export const TOOL_GUIDES = {
  "/browse": {
    label: "Card price database",
    guides: [
      { slug: "riftbound-card-price-comparison", reason: "Sticker price vs total cost, and how to find the cheapest place to buy" },
      { slug: "riftbound-variant-glossary", reason: "Signature, Overnumbered, foil and alt art — why printings of one card price differently" },
      { slug: "riftbound-card-condition-guide", reason: "What each condition grade means and roughly what it is worth against Near Mint" },
    ],
  },
  "/sealed": {
    label: "Sealed product prices",
    guides: [
      { slug: "cheapest-riftbound-booster-boxes", reason: "Where booster boxes and other sealed product are cheapest, market by market" },
      { slug: "riftbound-booster-box-ev-worth-ripping-or-buying-singles", reason: "When opening a box stops making sense and buying singles wins" },
      { slug: "where-to-buy-riftbound-cards", reason: "How the six markets we cover compare for singles and sealed" },
    ],
  },
  "/tools": {
    label: "All tools",
    guides: [
      { slug: "best-basket-cheapest-riftbound-deck", reason: "How Best Basket splits a list across stores so postage is paid as few times as possible" },
      { slug: "riftbound-booster-box-ev-worth-ripping-or-buying-singles", reason: "How a booster box's expected value is worked out, and when to stop opening" },
      { slug: "riftcompare-premium-explained", reason: "What Plus and Premium add to the free tools, and what they cost" },
    ],
  },
  "/tools/box-ev": {
    label: "Booster box EV calculator",
    guides: [
      { slug: "riftbound-booster-box-ev-worth-ripping-or-buying-singles", reason: "What expected value can and cannot tell you before you open a box" },
      { slug: "cheapest-riftbound-booster-boxes", reason: "Where the box itself is cheapest to buy" },
    ],
  },
  "/tools/best-basket": {
    label: "Best Basket",
    guides: [
      { slug: "best-basket-cheapest-riftbound-deck", reason: "A worked example: pricing a whole deck as one order instead of card by card" },
      { slug: "cheapest-way-to-start-riftbound", reason: "Every way into the game compared on cost, from a ready-made deck to singles" },
      { slug: "currency-conversion-fees", reason: "What an overseas store's currency conversion adds to the total" },
    ],
  },
  "/tools/deal-finder": {
    label: "Deal Finder",
    guides: [
      { slug: "riftbound-card-price-comparison", reason: "How price comparison works, and why the sticker price is not the whole cost" },
      { slug: "why-riftbound-card-prices-change", reason: "Print runs, bans and tournaments — why a card's price moves at all" },
      { slug: "riftbound-card-condition-guide", reason: "Why a cheaper copy may be a lower grade, and how much that should matter" },
    ],
  },
  "/tools/rising": {
    label: "Rising Cards",
    guides: [
      { slug: "why-riftbound-card-prices-change", reason: "The supply and demand forces behind a card's price moving" },
      { slug: "understanding-the-riftcompare-index-methodology", reason: "How we measure the market as a whole, week to week" },
    ],
  },
  "/tools/demand": {
    label: "Demand Finder",
    guides: [
      { slug: "best-riftbound-cards", reason: "The cards players search for most, priced in your market" },
      { slug: "why-riftbound-card-prices-change", reason: "Why demand shows up in a card's price, and when it does not" },
    ],
  },
  "/tools/selling-fees": {
    label: "Selling fee calculator",
    guides: [
      { slug: "tcgplayer-fees", reason: "TCGplayer's commission and payment processing, fee by fee" },
      { slug: "how-to-sell-riftbound-cards", reason: "Pricing, platforms and packing when you sell your cards" },
      { slug: "how-much-is-your-riftbound-collection-worth", reason: "The gap between what a collection lists for and what you would actually receive" },
    ],
  },
  "/movers": {
    label: "Price movers",
    guides: [
      { slug: "why-riftbound-card-prices-change", reason: "What usually sits behind a big weekly rise or fall" },
      { slug: "understanding-the-riftcompare-index-methodology", reason: "How the whole-market index is built from a basket of cards" },
      { slug: "riftbound-banlist-explained", reason: "Which cards are banned and why — a common cause of sudden moves" },
    ],
  },
  "/market": {
    label: "RiftCompare Index",
    guides: [
      { slug: "understanding-the-riftcompare-index-methodology", reason: "What the Index tracks, how it is built and how to read it" },
      { slug: "why-riftbound-card-prices-change", reason: "The forces that move the cards inside the Index" },
    ],
  },
  "/market/records": {
    label: "Market records",
    guides: [
      { slug: "most-expensive-riftbound-cards", reason: "The priciest cards right now and what most of them have in common" },
      { slug: "are-riftbound-cards-cheaper-in-another-country", reason: "Whether a cross-market price gap survives postage and import tax" },
    ],
  },
  "/trade": {
    label: "Trade calculator",
    guides: [
      { slug: "how-much-is-your-riftbound-collection-worth", reason: "Why a card's listed price is not what it is worth in a trade or sale" },
      { slug: "riftbound-card-condition-guide", reason: "How condition changes a card's value on both sides of a trade" },
    ],
  },
  "/deck": {
    label: "Deck builder",
    guides: [
      { slug: "how-a-riftbound-deck-is-built", reason: "Legend, Champion, main deck, runes and battlefields — the anatomy of a legal deck" },
      { slug: "riftbound-deck-archetypes-guide", reason: "What each archetype is trying to do and which to build first" },
      { slug: "best-basket-cheapest-riftbound-deck", reason: "Buying the finished list as one order across stores" },
    ],
  },
  "/decks": {
    label: "Deck library",
    guides: [
      { slug: "riftbound-deck-archetypes-guide", reason: "How to tell an archetype from its list" },
      { slug: "how-a-riftbound-deck-is-built", reason: "What every legal deck is made of" },
      { slug: "cheapest-way-to-start-riftbound", reason: "The cheapest ways to get a playable deck in hand" },
    ],
  },
  "/stores": {
    label: "Stores",
    guides: [
      { slug: "where-to-buy-riftbound-cards", reason: "How the stores in each of the six markets compare" },
      { slug: "how-to-choose-a-riftbound-marketplace", reason: "Seven things to check before you buy from a store you do not know" },
      { slug: "currency-conversion-fees", reason: "The cost of paying an overseas store in its own currency" },
    ],
  },
  "/stores/tracked": {
    label: "Stores we track",
    guides: [
      { slug: "where-to-buy-riftbound-cards", reason: "Where to buy in each market we cover" },
      { slug: "are-riftbound-cards-cheaper-in-another-country", reason: "When buying from another market is worth it, and when postage undoes it" },
    ],
  },
  "/sets": {
    label: "Sets",
    guides: [
      { slug: "riftbound-sets-in-order", reason: "Every set in release order, with its real card count" },
      { slug: "riftbound-set-checklist-how-to-complete-a-set", reason: "The order to buy in when you are completing a set" },
      { slug: "riftbound-2027-set-roadmap", reason: "The releases Riot has announced beyond the current set" },
    ],
  },
  "/champions": {
    label: "Champions",
    guides: [
      { slug: "league-of-legends-champions-in-riftbound", reason: "Which League champions have cards, and how Legends work" },
      { slug: "riftbound-deck-archetypes-guide", reason: "The deck styles each champion's cards tend to build towards" },
    ],
  },
  "/domains": {
    label: "Domains",
    guides: [
      { slug: "riftbound-deck-archetypes-guide", reason: "How domain pairs shape a deck's archetype" },
      { slug: "how-a-riftbound-deck-is-built", reason: "Where domains fit in a legal deck" },
    ],
  },
  "/cards": {
    label: "Card facets",
    guides: [
      { slug: "understanding-riftbound-card-rarity", reason: "Every rarity and special printing, and why each changes the price" },
      { slug: "riftbound-variant-glossary", reason: "How to read Signature and Overnumbered collector numbers" },
    ],
  },
  "/cards/rarity": {
    label: "Cards by rarity",
    guides: [
      { slug: "understanding-riftbound-card-rarity", reason: "What each rarity tier means for pull odds and price" },
      { slug: "riftbound-variant-glossary", reason: "The printings that sit on top of rarity: foil, alt art, Signature, Metal" },
    ],
  },
  "/gallery": {
    label: "Card gallery",
    guides: [
      { slug: "riftbound-variant-glossary", reason: "What sets the special printings in each gallery apart" },
      { slug: "riftbound-sets-in-order", reason: "The sets in release order, with their card counts" },
    ],
  },
  "/alerts": {
    label: "Price alerts",
    guides: [
      { slug: "why-riftbound-card-prices-change", reason: "Why a card you watch drops or climbs" },
      { slug: "riftbound-card-condition-guide", reason: "What each condition grade means, and what a lower grade is worth against Near Mint" },
    ],
  },
  "/auctions": {
    label: "eBay auctions ending soon",
    guides: [
      { slug: "ebay-bidding-strategies", reason: "Proxy bidding, sniping and setting a maximum you can defend" },
      { slug: "how-to-sell-riftbound-cards", reason: "Where and how to sell when you are on the other side of an auction" },
    ],
  },
  "/methodology": {
    label: "Methodology",
    guides: [
      { slug: "understanding-the-riftcompare-index-methodology", reason: "The Index's basket, weighting and weekly method in full" },
      { slug: "riftbound-card-condition-guide", reason: "The five condition grades, and what each is worth against Near Mint" },
      { slug: "currency-conversion-fees", reason: "What currency conversion adds when you buy from another market" },
    ],
  },
  "/singles": {
    label: "Singles prices",
    guides: [
      { slug: "where-to-buy-riftbound-cards", reason: "Where to buy singles in each of the six markets we cover" },
      { slug: "riftbound-card-price-comparison", reason: "How price comparison works, and why the sticker price is not the whole cost" },
      { slug: "riftbound-card-condition-guide", reason: "What a store's condition grade means for the copy you receive" },
    ],
  },
  // The mini-games run on the same card and price data as the tools, so each
  // links the guide behind what it tests. Last in the map on purpose: a guide's
  // "Tools in this guide" line lists real tools before games.
  "/games/higher-lower": {
    label: "Higher or Lower",
    guides: [
      { slug: "most-expensive-riftbound-cards", reason: "The priciest cards right now and what most of them have in common" },
      { slug: "why-riftbound-card-prices-change", reason: "Why one card costs ten times another" },
    ],
  },
  "/games/price-check": {
    label: "Price Check",
    guides: [
      { slug: "why-riftbound-card-prices-change", reason: "The forces behind a card's price, for sharper guesses" },
      { slug: "riftbound-variant-glossary", reason: "Why two printings of the same card can be priced far apart" },
    ],
  },
  "/games/card-smash": {
    label: "Card Smash",
    guides: [
      { slug: "most-valuable-riftbound-cards", reason: "What makes a card valuable, from chase rares to Signature printings" },
    ],
  },
  "/games/zoomed": {
    label: "Zoomed",
    guides: [
      { slug: "riftbound-variant-glossary", reason: "The alt arts and special printings behind the art you are guessing" },
      { slug: "riftbound-sets-in-order", reason: "Every set in release order, to place the art you recognise" },
    ],
  },
  "/games/pairs": {
    label: "Pairs",
    guides: [
      { slug: "league-of-legends-champions-in-riftbound", reason: "Which League champions have cards, and who is on the art" },
    ],
  },
  "/games/twenty48": {
    label: "2048",
    guides: [
      { slug: "understanding-riftbound-card-rarity", reason: "The real rarity tiers and special printings in the game" },
    ],
  },
} as const satisfies Record<string, ToolEntry>;

export type ToolRoute = keyof typeof TOOL_GUIDES;

export const TOOL_ROUTES = Object.keys(TOOL_GUIDES) as ToolRoute[];

export function articleHref(a: Pick<Article, "slug" | "category">): string {
  return `/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`;
}

/**
 * The guides that explain this tool, resolved against the PUBLISHED articles —
 * a draft or retired slug drops out rather than rendering a dead link.
 */
export function guidesForTool(route: ToolRoute, limit = 3): RelatedGuide[] {
  const bySlug = new Map(getArticles().map((a) => [a.slug, a]));
  const out: RelatedGuide[] = [];
  for (const g of TOOL_GUIDES[route].guides) {
    const a = bySlug.get(g.slug);
    if (!a) continue;
    out.push({ slug: a.slug, title: a.title, category: a.category, reason: g.reason });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The tools a guide is about: every TOOL_GUIDES route that lists it, in map
 * order, minus `exclude` (the article's own "Ready to buy?" link), capped.
 */
export function toolsForArticle(slug: string, exclude?: string, limit = 3): { href: ToolRoute; label: string }[] {
  const out: { href: ToolRoute; label: string }[] = [];
  for (const route of TOOL_ROUTES) {
    if (route === exclude) continue;
    if (!TOOL_GUIDES[route].guides.some((g) => g.slug === slug)) continue;
    out.push({ href: route, label: TOOL_GUIDES[route].label });
    if (out.length >= limit) break;
  }
  return out;
}
