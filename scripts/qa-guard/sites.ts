/**
 * QA guard: the live sites and the journeys a visitor must be able to finish on each (DECISIONS.md,
 * 2026-11-26 "A daily QA guard walks every live site").
 *
 * Every journey is checked the way a visitor does it, in a real browser at desktop and phone widths:
 * type into the site's own search box, open a product, see a price and a working, tagged buy link,
 * use the list filters, open Best Basket. A site's entry says only what differs between sites (its
 * queries, its product URLs, its list page); the checks themselves are in `journeys.ts`.
 *
 * `product` matches the PATH of a product page (a card or a sealed product). `sealedProduct`, when a
 * site gives sealed product its own URLs, is how a sealed result is told from a single. A query is a
 * word a real visitor types; pick one the catalogue will always hold (a game's own staple, not this
 * week's set) so the guard never fails because a set rotated out.
 */

export type SearchSpec = {
  kind: "single" | "sealed";
  q: string;
  /** Words one of the results must contain (any of them, case-insensitive). Defaults to the query's words. */
  expect?: string[];
};

export type Site = {
  key: string;
  name: string;
  url: string;
  /** The repository a fix goes to (owner/name). */
  repo: string;
  searches: SearchSpec[];
  /** Path of a product page. */
  product: RegExp;
  /** Path of a sealed product page, when sealed has its own. */
  sealedProduct?: RegExp;
  /** The site's own results page, also checked directly: `{q}` is the query. */
  searchPage?: string;
  /** A list page with filters, and a word its filter box must narrow the list to. */
  filters?: { path: string; q: string };
  /** The Best Basket page. */
  basket?: string;
  /** Product pages carry the Collector pulse box (MTG's CollectorPulse.tsx): checked at phone width, never answered. */
  pulse?: boolean;
  /** Paths whose console errors are known and owned elsewhere (rare; say why). */
  notes?: string;
};

const SEALED_WORDS = ["box", "booster", "pack", "deck", "bundle", "tin", "display", "case", "collection", "starter"];

export const SITES: Site[] = [
  {
    key: "rift",
    name: "RiftCompare",
    url: "https://riftcompare.com",
    repo: "Specifxx/TCGEmpire",
    searches: [
      { kind: "single", q: "Jinx" },
      { kind: "sealed", q: "booster box", expect: SEALED_WORDS },
    ],
    product: /^\/(card|sealed)\/[^/]+\/?$/,
    sealedProduct: /^\/sealed\/[^/]+\/?$/,
    filters: { path: "/sealed", q: "booster" },
    basket: "/tools/best-basket",
  },
  {
    key: "op",
    name: "OP Compare",
    url: "https://opcompare.app",
    repo: "Specifxx/OpCompare",
    searches: [
      { kind: "single", q: "Luffy" },
      { kind: "sealed", q: "booster box", expect: SEALED_WORDS },
    ],
    product: /^\/(card|sealed)\/[^/]+\/?$/,
    sealedProduct: /^\/sealed\/[^/]+\/?$/,
    searchPage: "/search?q={q}",
    filters: { path: "/sealed", q: "booster" },
    basket: "/tools/best-basket",
  },
  {
    key: "dex",
    name: "DexCompare",
    url: "https://dexcompare.io",
    repo: "Specifxx/CompareEmpire",
    searches: [{ kind: "sealed", q: "elite trainer box", expect: ["elite trainer"] }],
    product: /^\/[a-z]{2}\/p\/[^/]+\/?$/,
    filters: { path: "/us/sealed", q: "elite" },
    basket: "/us/best-basket",
  },
  {
    key: "mtg",
    name: "MTG Compare",
    url: "https://mtgcompare.app",
    repo: "Specifxx/mtgcompare",
    searches: [{ kind: "sealed", q: "play booster box", expect: ["play booster"] }],
    product: /^\/[a-z]{2}\/p\/[^/]+\/?$/,
    filters: { path: "/us/sealed", q: "commander" },
    basket: "/us/best-basket",
    pulse: true,
  },
  {
    key: "gundam",
    name: "Gundam Compare",
    url: "https://gundamcompare.com",
    repo: "Specifxx/GundamCompare",
    searches: [
      { kind: "single", q: "Gundam", expect: ["gundam"] },
      { kind: "sealed", q: "booster box", expect: SEALED_WORDS },
    ],
    product: /^\/(card|kit|kits|sealed)\/[^/]+\/?$/,
    filters: { path: "/sealed", q: "booster" },
    basket: "/tools/best-basket",
  },
  {
    key: "lorcana",
    name: "Lorcana Compare",
    url: "https://lorcanacompare.com",
    repo: "specifxx/lorcanacompare",
    searches: [
      { kind: "single", q: "Elsa" },
      { kind: "sealed", q: "booster box", expect: SEALED_WORDS },
    ],
    product: /^\/(card|sealed)\/[^/]+\/?$/,
    filters: { path: "/sealed", q: "booster" },
    basket: "/tools/best-basket",
  },
  {
    key: "ygo",
    name: "YGO Compare",
    url: "https://ygocompare.com",
    repo: "specifxx/ygocompare",
    searches: [{ kind: "sealed", q: "booster box", expect: SEALED_WORDS }],
    product: /^\/(card|sealed)\/[^/]+\/?$/,
    filters: { path: "/sealed", q: "tin" },
    basket: "/tools/best-basket",
  },
  {
    key: "cyberpunk",
    name: "Cyberpunk Compare",
    url: "https://cyberpunkcompare.com",
    repo: "specifxx/cyberpunkcompare",
    searches: [
      { kind: "single", q: "Johnny" },
      { kind: "sealed", q: "booster", expect: SEALED_WORDS },
    ],
    product: /^\/(card|sealed)\/[^/]+\/?$/,
    filters: { path: "/sealed", q: "booster" },
    basket: "/tools/best-basket",
  },
  {
    key: "tcgprices",
    name: "TCG Prices",
    url: "https://tcgprices.app",
    repo: "specifxx/tcgcompare",
    searches: [{ kind: "sealed", q: "booster box", expect: SEALED_WORDS }],
    product: /^\/(card|sealed)\/[^/]+\/?$/,
    searchPage: "/search?q={q}",
    filters: { path: "/sealed", q: "booster" },
    basket: "/tools/best-basket",
  },
  {
    key: "singles",
    name: "TCG Singles DB",
    url: "https://tcgsinglesdb.com",
    repo: "specifxx/tcgsinglesdb",
    searches: [{ kind: "single", q: "Charizard" }],
    product: /^\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/?$/,
    searchPage: "/search?q={q}",
  },
  {
    key: "ce",
    name: "Compare Empire",
    url: "https://compareempire.com",
    repo: "Specifxx/compareempiretake2",
    searches: [{ kind: "single", q: "LEGO", expect: ["lego"] }],
    // /<market>/<category>/<product>: the market's own hubs (deals, stores, launches…) are not products.
    product: /^\/(us|uk|ca|au|sg|eu)\/(?!deals|stores|launches|browse|search)[a-z0-9-]+\/[a-z0-9-]+\/?$/,
    searchPage: "/search?q={q}",
  },
  {
    key: "ky",
    name: "KaeYoung",
    url: "https://kaeyoung.com",
    repo: "specifxx/kaeyoung",
    searches: [{ kind: "single", q: "COSRX", expect: ["cosrx"] }],
    product: /^\/product\/[^/]+\/?$/,
    searchPage: "/search?q={q}",
    basket: "/basket",
  },
  {
    key: "brick",
    name: "BrickCompare",
    url: "https://brickcompare.app",
    repo: "compare-empire/brickcompare",
    searches: [{ kind: "sealed", q: "Millennium Falcon", expect: ["falcon"] }],
    product: /^\/(?:(?:au|uk|ca|eu|sg)\/)?set\/\d{3,7}-[^/]+\/?$/,
    searchPage: "/search?q={q}",
    filters: { path: "/deals", q: "star" },
    basket: "/shortlist",
  },
  {
    key: "scent",
    name: "ScentCompare",
    url: "https://scentcompare.app",
    repo: "specifxx/scentcompare",
    searches: [{ kind: "single", q: "Sauvage", expect: ["sauvage"] }],
    product: /^\/product\/[^/]+\/?$/,
    searchPage: "/search?q={q}",
    basket: "/basket",
  },
];

export const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900, mobile: false },
  { name: "phone", width: 390, height: 844, mobile: true },
] as const;

export type Viewport = (typeof VIEWPORTS)[number];
