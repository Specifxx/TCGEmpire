import { SITE_URL } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// Author identity for the blog and guides.
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS: all 64 articles carried the byline "RiftCompare" and linked
// nowhere. Anonymous long-form content at scale is one of the strongest signals
// that a site is machine-generated, and it is the signal an AdSense reviewer
// checks when the rest of the site is programmatic.
//
// WHAT IT DELIBERATELY DOES NOT DO: invent people. There is no real named human
// on record as the author of these pieces, and fabricating one — a name, a
// photo, a "ten years in the TCG industry" bio — would be inventing a human
// identity and publishing it as fact. That is dishonest on its own terms, and it
// is worse than anonymity if a reviewer looks the person up and finds nothing.
//
// So the bylines here are the real ones: a named editorial team with an honest
// account of who writes the content, how prices are collected, and what is and
// is not automated. Structured data types them as an ORGANIZATION rather than a
// Person, because Organization is what they truthfully are. schema.org permits
// an Organization as `author`, and Google's guidance is explicit that the byline
// should reflect reality rather than being decorated for search.
//
// ── OWNER: this is where to add yourself ────────────────────────────────────
// A named human author with a real bio is a genuinely stronger trust signal than
// a team byline, for AdSense review and for Search alike. If you want that, add
// an entry below with your real name and a true bio, set `type: "Person"`, and
// change the `author` field on the articles you actually wrote (lib/articles.ts).
// Nothing else needs to change — the pages, links and structured data follow.

export type Author = {
  slug: string;
  /** Must match the `author` string on articles in lib/articles.ts. */
  name: string;
  /** "Organization" for a team byline, "Person" for a named human. */
  type: "Organization" | "Person";
  role: string;
  bio: string[];
  /** What this author is responsible for — shown as a short list. */
  covers: string[];
  email?: string;
};

export const AUTHORS: Author[] = [
  {
    slug: "riftcompare-editorial",
    name: "RiftCompare",
    type: "Organization",
    role: "RiftCompare editorial team",
    bio: [
      "RiftCompare is an independent price-comparison site for Riftbound: League of Legends TCG, tracking singles and sealed product across stores in Australia, the United States, the United Kingdom, Singapore and Canada.",
      "The guides and posts published under this byline are written by the people who run the site. They are researched against the same price database the rest of the site is built on, which means the figures quoted in an article are the figures our importer actually recorded — not estimates, and not numbers carried over from somewhere else.",
      "We are not affiliated with, endorsed by, or sponsored by Riot Games. We do not accept payment for coverage, and no retailer has any say in what we publish or how results are ranked. Where an outbound link earns us a commission it is marked as such, on the page, next to the link.",
      "What we can claim expertise in is narrow and specific: the prices. We have been importing and reconciling Riftbound listings from every store we track since the game launched, which means we know where the data is reliable, where it is thin, and where a headline number is misleading — a card listed at a low price by one shop that never has stock, a printing routinely confused with its base card, a market where postage is the real cost. That is what the guides are about, and it is why they quote figures from the same database the rest of the site runs on rather than from other sites.",
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
