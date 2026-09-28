import { COUNTRIES, type Country } from "@/lib/country";
import { COUNTRY_GUIDE_SLUGS } from "@/lib/seo";

// ─────────────────────────────────────────────────────────────────────────────
// Owner-curated reading lists: the homepage band's "Start here" and "Market
// updates" picks (components/home/EditorialHub.tsx) and the "Editor's picks" on
// /blog and /guides. One module, so the three surfaces are curated in one place.
// ─────────────────────────────────────────────────────────────────────────────
// WHY CURATED, AND NEVER "MOST READ" (2026-09-26, "Blog and tools, joined up" in
// DECISIONS.md). /blog and /guides used to label their picks "Most read", from a
// 30-day Top Pages export taken in August. Nothing on the site counts views per
// article (Card.viewCount is cards only), so that label could not be kept true
// and had already drifted: all six picks were July–August pieces tied to one set.
// These lists are editorial choices, and every surface labels them as such.
//
// Rules for a pick:
//  - evergreen and substantial (roughly 600 words or more): the rejection these
//    lists answer was for low-value content, and a pick is the first page a
//    reviewer following "Start here" will open;
//  - set-agnostic: no slug here names a set, so nothing goes stale when the next
//    one releases. A new set's coverage reaches the homepage through the band's
//    "Latest news" column, which is simply the newest posts;
//  - published, in the category its list says, and not a next.config.js
//    redirect source (tests/home-editorial.test.ts);
//  - its claims about the site pass tests/site-claims.test.ts.
//
// Pure data: no query, no cache, safe on any ISR page (src/lib/db.ts rules).

/** A pick for the homepage band: the article, and one line on what it covers,
 *  in our own words (shown from md up under the title). */
export type HomePick = { slug: string; line: string };

// The general buying guide. On a market home it gives way to that market's own
// guide (startHereFor), so the six homepages' bands differ where it matters most.
const GENERAL_BUYING_GUIDE = "where-to-buy-riftbound-cards";

/** "Start here" on "/", in order. */
export const START_HERE: readonly HomePick[] = [
  { slug: GENERAL_BUYING_GUIDE, line: "How the stores in each of the six markets compare for singles and sealed." },
  { slug: "why-riftbound-card-prices-change", line: "Print runs, bans and tournament results: what moves a card's price." },
  { slug: "riftbound-banlist-explained", line: "Every banned card in Standard and 2v2, and why Riot banned it." },
];

/** "Market updates": data-led posts that read our own price data, beside the
 *  links to /movers and the Index. */
export const MARKET_READS: readonly HomePick[] = [
  { slug: "most-expensive-riftbound-cards", line: "The priciest cards right now, in a table drawn from our own price data." },
  { slug: "are-riftbound-cards-cheaper-in-another-country", line: "Whether buying from another market still saves money once postage and import tax are added." },
];

/** "Editor's picks" on /blog, in order. Blog posts only. */
export const BLOG_PICKS: readonly string[] = [
  "are-riftbound-cards-cheaper-in-another-country",
  "most-expensive-riftbound-cards",
  "how-to-choose-a-riftbound-marketplace",
];

/** "Editor's picks" on /guides, in order. Guides only. */
export const GUIDE_PICKS: readonly string[] = [
  "riftbound-banlist-explained",
  "why-riftbound-card-prices-change",
  "riftbound-empower-explained",
  "how-much-is-your-riftbound-collection-worth",
];

/**
 * The band's "Start here" for one homepage. `market` is the region home's own
 * market; "/" passes none, because its copy is market-neutral and it keeps the
 * guide that covers all six. A market home leads with its own buying guide
 * (lib/seo.ts COUNTRY_GUIDE_SLUGS) in place of the general one.
 */
export function startHereFor(market?: Country): HomePick[] {
  if (!market) return [...START_HERE];
  const { place, currency } = COUNTRIES[market];
  return [
    { slug: COUNTRY_GUIDE_SLUGS[market], line: `Where to buy in ${place}, with prices in ${currency}.` },
    ...START_HERE.filter((p) => p.slug !== GENERAL_BUYING_GUIDE),
  ];
}
