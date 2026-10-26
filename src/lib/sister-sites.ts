// The owner's other price-comparison sites (owner, 2026-10-14: the four sites
// cross-link — every footer, plus the blog posts where another game is the
// subject). One list for the footer line and the article block.
//
// Plain FOLLOWED links (rel="noopener", no nofollow/sponsored, no noreferrer):
// our own sites, no commission, and the referrer lets the visit be attributed
// there — the same terms as the RiftboundStocks links (DECISIONS.md, 2026-09-28).
//
// Every deep link here must be live on the sister site when it ships: they
// were checked with a 200 on 2026-10-14. A sister site's brand-new pages are
// added only once they are deployed there.
//
// Kept to the footer and to the articles below, never every page: the AdSense
// remediation plan (docs/adsense-remediation.md, Phase 15) warns that four
// look-alike sites cross-linked sitewide read as a link network.

export interface SisterSite {
  key: "op" | "dex" | "mtg" | "gundam" | "lorcana";
  name: string;
  url: string;
  /** The game, as a reader would say it: "One Piece", "Pokémon", "Magic". */
  game: string;
  /** Descriptive anchor text for the footer's "Compare other TCGs" block:
   *  the query a player of that game would type, not the brand alone. */
  anchor: string;
  /** What it compares, for a short line under its name. */
  what: string;
  /** The pages a Riftbound reader would want from it, deepest-useful first. */
  links: { label: string; href: string }[];
  /** Footer only: left out of the articles' block, which serves the three
   *  games Riftbound players most often come from (2026-10-26). */
  footerOnly?: boolean;
}

export const SISTER_SITES: SisterSite[] = [
  {
    key: "op",
    name: "OP Compare",
    url: "https://www.opcompare.app",
    game: "One Piece",
    anchor: "One Piece card prices",
    what: "One Piece Card Game singles and sealed prices across stores in the US, AU, UK, CA, SG and the EU",
    links: [
      { label: "Where to buy One Piece cards", href: "https://www.opcompare.app/guides/where-to-buy-one-piece-cards" },
      { label: "EB05 pre-order prices", href: "https://www.opcompare.app/eb05-preorders" },
      { label: "Cheapest alt arts by colour", href: "https://www.opcompare.app/blog/cheapest-one-piece-alt-arts-by-colour" },
    ],
  },
  {
    key: "dex",
    name: "DexCompare",
    url: "https://www.dexcompare.app",
    game: "Pokémon",
    anchor: "Pokémon TCG sealed prices",
    what: "Pokémon booster box, Elite Trainer Box and bundle prices across independent stores in seven markets",
    links: [
      { label: "Pick your country", href: "https://www.dexcompare.app/" },
      { label: "Pokémon booster boxes in Australia", href: "https://www.dexcompare.app/au/type/booster-boxes" },
      { label: "Pokémon release calendar", href: "https://www.dexcompare.app/au/releases" },
    ],
  },
  {
    key: "mtg",
    name: "MTG Compare",
    url: "https://mtgcompare.app",
    game: "Magic",
    anchor: "Magic: The Gathering card prices",
    what: "Magic: The Gathering singles and sealed prices across stores, with a deck pricer",
    links: [
      { label: "Where to buy Magic cards", href: "https://mtgcompare.app/guides/where-to-buy-magic-cards" },
      { label: "Price a decklist", href: "https://mtgcompare.app/deck" },
      { label: "Magic release dates", href: "https://mtgcompare.app/release-dates" },
    ],
  },
  // The whole family in the footer (2026-10-26, DECISIONS.md "One family of
  // sites"): Gundam and Lorcana run the same comparison. Nav paths checked live
  // that day.
  {
    key: "gundam",
    name: "Gundam Compare",
    url: "https://gundamcompare.com",
    game: "Gundam",
    anchor: "Gundam Card Game prices",
    what: "Gundam Card Game singles and sealed prices across stores",
    links: [
      { label: "Gundam sealed prices", href: "https://gundamcompare.com/sealed" },
      { label: "Gundam pre-orders", href: "https://gundamcompare.com/preorders" },
    ],
    footerOnly: true,
  },
  {
    key: "lorcana",
    name: "Lorcana Compare",
    url: "https://lorcanacompare.com",
    game: "Lorcana",
    anchor: "Disney Lorcana card prices",
    what: "Disney Lorcana singles and sealed prices across stores",
    links: [
      { label: "Lorcana sealed prices", href: "https://lorcanacompare.com/sealed" },
      { label: "Lorcana pre-orders", href: "https://lorcanacompare.com/preorders" },
    ],
    footerOnly: true,
  },
];

const ARTICLE_SITES = SISTER_SITES.filter((s) => !s.footerOnly);

// The cross-game guides, written for players of another game: each gets its
// own game's site only.
const GAME_GUIDES: Record<string, SisterSite["key"]> = {
  "one-piece-tcg-to-riftbound": "op",
  "pokemon-collector-to-riftbound": "dex",
  "mtg-to-riftbound": "mtg",
};

// Buying and price-comparison reading, where "the same comparison for your
// other game" is a useful next step: all three.
const BUYING_TAGS = new Set(["where to buy", "price comparison"]);

/** The sister sites an article links at its end; empty for most articles. */
export function sisterSitesFor(article: { slug: string; tags: readonly string[] }): SisterSite[] {
  const only = GAME_GUIDES[article.slug];
  if (only) return ARTICLE_SITES.filter((s) => s.key === only);
  const buying =
    article.slug.startsWith("where-to-buy-") || article.slug.startsWith("buy-riftbound-cards-") || article.tags.some((t) => BUYING_TAGS.has(t));
  return buying ? ARTICLE_SITES : [];
}
