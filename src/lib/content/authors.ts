import { SITE_URL } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// Author identity for the blog and guides.
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS: all 64 articles carried the byline "RiftCompare" and linked
// nowhere. Anonymous long-form content at scale is one of the strongest signals
// that a site is machine-generated, and it is the signal an AdSense reviewer
// checks when the rest of the site is programmatic.
//
// WHAT IT DELIBERATELY DOES NOT DO: invent people. Fabricating an author — a
// name, a photo, a "ten years in the TCG industry" bio — would be inventing a
// human identity and publishing it as fact. That is dishonest on its own terms,
// and it is worse than anonymity if a reviewer looks the person up and finds
// nothing.
//
// THE REGISTRY (owner decision, 2026-09-26, "Blog and tools, joined up" in
// DECISIONS.md). Two bylines, both real:
//  - "Bill", a Person: the founder, who built and runs the site on his own. The
//    ten articles bylined with his name are his. His bio says only what the
//    owner confirmed — no surname, photo, location, credentials or history.
//  - "RiftCompare", an Organization: the site's own byline for everything else.
//    It absorbed "RiftCompare Markets Desk", a byline on three posts that was
//    never registered here and rendered unlinked, typed as an Organization.
// How every article is produced is the owner's own statement, and it is the
// same for both: drafted with AI assistance, then edited and fact-checked by
// Bill before publishing; prices and figures come from the site's own price
// database, never from the draft. Keep ARTICLE_PROCESS word for word.
//
// Every published article's `author` must resolve here, and Bill must be typed
// a Person (tests/articles-authors.test.ts). Add a byline only for a real
// author, with a bio made of statements the owner has confirmed.
//
// A bio paragraph may carry internal links as `[label](/path)`; the author page
// renders them (HubIntro's withLinks) and its JSON-LD gets the plain text. Keep
// the first paragraph link-free: it is the /authors card, the meta description
// and authorJsonLd's description, all plain text.

export const ARTICLE_PROCESS =
  "Articles are drafted with AI assistance, then edited and fact-checked by Bill before publishing; prices and figures come from RiftCompare's own price database, never from the draft.";

export type Author = {
  slug: string;
  /** Must match the `author` string on articles in lib/articles.ts. */
  name: string;
  /** "Organization" for the site's byline, "Person" for a named human. */
  type: "Organization" | "Person";
  role: string;
  bio: string[];
  /** What this author is responsible for — shown as a short list. */
  covers: string[];
  email?: string;
};

export const AUTHORS: Author[] = [
  {
    slug: "bill",
    name: "Bill",
    type: "Person",
    role: "Founder — builds and runs RiftCompare",
    bio: [
      "Bill founded RiftCompare, the independent Riftbound price-comparison site, and builds and runs it on his own.",
      "He makes the site's editorial calls: what gets written, what gets corrected, and what gets retired once it has gone stale. The articles under his own name cover buying and selling across marketplaces — fees, eBay bidding and currency conversion — plus how price comparison works and how to tell one printing of a card from another.",
      `Every article on RiftCompare, under either byline, is produced the same way. ${ARTICLE_PROCESS}`,
      "Spotted a wrong price or a mistake in an article? Every card page has a \"Spotted a wrong price? Report it\" link under its list of stores, and the [contact form](/contact) reaches Bill directly. The [editorial policy](/editorial-policy) sets out how corrections are handled.",
    ],
    covers: [
      "Buying and selling across marketplaces: fees, eBay bidding and currency conversion",
      "How price comparison works, and an honest look at what RiftCompare does and does not do",
      "Card variants, card values and the most expensive printings",
    ],
  },
  {
    slug: "riftcompare-editorial",
    name: "RiftCompare",
    type: "Organization",
    role: "Site byline, edited by Bill",
    bio: [
      "RiftCompare is an independent price-comparison site for Riftbound: League of Legends TCG, tracking singles and sealed product across stores in six markets: Australia, the United States, the United Kingdom, Singapore, Canada and the EU.",
      `This is the site's own byline, used for buying guides, set overviews, news and market posts, and edited by Bill, who founded and runs RiftCompare. ${ARTICLE_PROCESS}`,
      "We are not affiliated with, endorsed by, or sponsored by Riot Games. We do not accept payment for coverage, and no retailer has any say in what we publish or how results are ranked. Where an outbound link earns us a commission it is marked as such, on the page, next to the link.",
      "What we can claim expertise in is narrow and specific: the prices. RiftCompare imports every store it tracks twice a day and matches each listing to the exact printing it is selling, which means we know where the data is reliable, where it is thin, and where a headline number is misleading — a card listed at a low price by one shop that never has stock, a printing routinely confused with its base card, a market where postage is the real cost. That is what the guides are about, and it is why they quote figures from the same database the rest of the site runs on rather than from other sites.",
      "Where a piece is opinion rather than fact — whether a set is worth opening, whether a card looks expensive — it is written as opinion. Nothing published here is financial advice, and trading card prices fall as readily as they rise.",
    ],
    covers: [
      "Buying guides and set overviews",
      "Card rarity, printings and variant explainers",
      "Market commentary and price analysis",
      "How-to guides for collecting, storing and selling",
    ],
  },
];

export const authorBySlug = (slug: string) => AUTHORS.find((a) => a.slug === slug);

/** Resolve an article's `author` string to an author record. */
export const authorByName = (name: string) => AUTHORS.find((a) => a.name === name);

/** schema.org author node for an article, keyed to the /authors page. */
export function authorJsonLd(name: string) {
  const a = authorByName(name);
  if (!a) return { "@type": "Organization", name };
  return {
    "@type": a.type,
    "@id": `${SITE_URL}/authors/${a.slug}#author`,
    name: a.name,
    url: `${SITE_URL}/authors/${a.slug}`,
    description: a.bio[0],
  };
}
