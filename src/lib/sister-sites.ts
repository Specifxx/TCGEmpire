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
  key: "op" | "dex" | "mtg" | "gundam" | "lorcana" | "ygo" | "wargame" | "figure" | "cam" | "empire";
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
  /** Not a card game: listed after the TCGs, under "Also from Compare Empire". */
  notTcg?: boolean;
  /** The site's own search results for a query, `{q}` replaced by it (its
   *  WebSite SearchAction target). Card games only: the "Search another game"
   *  line under /browse results (components/FamilySearch.tsx). */
  search?: string;
}

export const SISTER_SITES: SisterSite[] = [
  {
    key: "op",
    search: "https://opcompare.app/browse?q={q}",
    name: "OP Compare",
    url: "https://opcompare.app",
    game: "One Piece",
    anchor: "One Piece card prices",
    what: "One Piece Card Game singles and sealed prices across stores in the US, AU, UK, CA, SG and the EU",
    links: [
      { label: "Where to buy One Piece cards", href: "https://opcompare.app/guides/where-to-buy-one-piece-cards" },
      { label: "EB05 pre-order prices", href: "https://opcompare.app/eb05-preorders" },
      { label: "Cheapest alt arts by colour", href: "https://opcompare.app/blog/cheapest-one-piece-alt-arts-by-colour" },
    ],
  },
  {
    key: "dex",
    search: "https://dexcompare.app/us/sealed?q={q}",
    name: "DexCompare",
    url: "https://dexcompare.app",
    game: "Pokémon",
    anchor: "Pokémon TCG sealed prices",
    what: "Pokémon booster box, Elite Trainer Box and bundle prices across independent stores in seven markets",
    links: [
      { label: "Pick your country", href: "https://dexcompare.app/" },
      { label: "Pokémon booster boxes in Australia", href: "https://dexcompare.app/au/type/booster-boxes" },
      { label: "Pokémon release calendar", href: "https://dexcompare.app/au/releases" },
    ],
  },
  {
    key: "mtg",
    search: "https://mtgcompare.app/us/sealed?q={q}",
    name: "MTG Compare",
    url: "https://mtgcompare.app",
    game: "Magic",
    // Sealed only since 2026-10-21 (mtgcompare DECISIONS.md): the anchor and
    // links say so, and the old singles paths it 308s are no longer linked.
    anchor: "Magic: The Gathering sealed prices",
    what: "Magic: The Gathering booster box, bundle and Commander deck prices across stores in seven markets",
    links: [
      { label: "Magic sealed prices", href: "https://mtgcompare.app/us/sealed" },
      { label: "Where to buy Magic cards", href: "https://mtgcompare.app/blog/where-to-buy-magic-cards" },
      { label: "Magic release dates", href: "https://mtgcompare.app/us/releases" },
    ],
  },
  // The whole family in the footer (2026-10-26, DECISIONS.md "One family of
  // sites"): Gundam and Lorcana run the same comparison. Nav paths checked live
  // that day.
  {
    key: "gundam",
    search: "https://gundamcompare.com/cards?q={q}",
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
    search: "https://lorcanacompare.com/cards?q={q}",
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
  // The rest of the family (2026-10-27, DECISIONS.md "Every site links the
  // whole family"): YGO Compare runs the Gundam/Lorcana engine; CamCompare and
  // Compare Empire are not card games, so they sit after the TCGs.
  {
    key: "ygo",
    search: "https://ygocompare.com/cards?q={q}",
    name: "YGO Compare",
    url: "https://ygocompare.com",
    game: "Yu-Gi-Oh!",
    anchor: "Yu-Gi-Oh! card prices",
    what: "Yu-Gi-Oh! TCG singles and sealed prices across stores",
    links: [
      { label: "Yu-Gi-Oh! sealed prices", href: "https://ygocompare.com/sealed" },
      { label: "Yu-Gi-Oh! pre-orders", href: "https://ygocompare.com/preorders" },
    ],
    footerOnly: true,
  },
  {
    key: "wargame",
    name: "WargameCompare",
    url: "https://wargamecompare.com",
    game: "Wargames",
    anchor: "Miniature wargame prices",
    what: "miniature wargame kit and army box prices across independent hobby stores",
    links: [{ label: "Wargame prices", href: "https://wargamecompare.com/" }],
    footerOnly: true,
    notTcg: true,
  },
  {
    key: "figure",
    name: "FigureCompare",
    url: "https://figurecompare.com",
    game: "Anime figures",
    anchor: "Anime figure prices",
    what: "Nendoroid, figma and POP UP PARADE prices across real figure stores, matched by barcode",
    links: [
      { label: "Nendoroid prices", href: "https://figurecompare.com/nendoroid" },
      { label: "Figure deals", href: "https://figurecompare.com/deals" },
    ],
    footerOnly: true,
    notTcg: true,
  },
  {
    key: "cam",
    name: "CamCompare",
    url: "https://www.camcompare.app",
    game: "Cameras",
    anchor: "Camera and lens prices",
    what: "camera and lens specs side by side, with new and used prices in five markets",
    links: [
      { label: "All cameras", href: "https://www.camcompare.app/cameras" },
      { label: "All lenses", href: "https://www.camcompare.app/lenses" },
    ],
    footerOnly: true,
    notTcg: true,
  },
  {
    key: "empire",
    name: "Compare Empire",
    url: "https://compareempire.com",
    game: "Tech",
    anchor: "Australian tech prices",
    what: "phone, TV and laptop prices across Australian stores",
    links: [
      { label: "Phone prices", href: "https://compareempire.com/phones" },
      { label: "Today's deals", href: "https://compareempire.com/deals" },
    ],
    footerOnly: true,
    notTcg: true,
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

/** Each card-game sister site's search for `q`, for the "Search another game"
 *  line. A plain search link per site: nothing is fetched from them. */
export function familySearchLinks(q: string): { key: SisterSite["key"]; name: string; game: string; href: string }[] {
  const term = q.trim().slice(0, 80);
  if (!term) return [];
  return SISTER_SITES.filter((s) => s.search && !s.notTcg).map((s) => ({
    key: s.key,
    name: s.name,
    game: s.game,
    href: s.search!.replace("{q}", encodeURIComponent(term)),
  }));
}
