// The grouped site navigation, shared by the ⌘K command launcher
// (CommandLauncher.tsx), the footer site-map (FOOTER_GROUPS below) and
// /llms.txt — edit a link here once and all three follow.
export interface NavGroupLink {
  href: string;
  label: string;
  emoji: string;
  /**
   * Extra words the ⌘K launcher should match this link on — synonyms, plurals
   * the label doesn't contain, and the words people actually type.
   *
   * This exists because the launcher used to match on the label alone, and a
   * label is written to be READ, not searched. "Prices" returned nothing (the
   * only price page is labelled "Bulk Pricer"), "deals" returned nothing (the
   * label is "Deal Finder", singular), "blog" returned nothing (labelled "News
   * & analysis"), and "alerts" returned nothing (labelled "My Watchlist"). Every
   * one of those is a page we have. Keywords are the cheap fix; they are never
   * rendered, so they cost nothing but a line here.
   */
  keywords?: string[];
  /**
   * Keep this link OUT of the footer site-map (it still appears in the launcher
   * and in llms.txt). The launcher is the complete index of the site; the footer
   * is a curated four-column block that has to stay a readable height. Used for
   * the secondary mini-games, whose hub (/games) is in the footer already.
   */
  hideInFooter?: boolean;
}

export interface NavGroup {
  title: string;
  links: NavGroupLink[];
}

// Kept as a single NEXT_PUBLIC_-prefixed flag (not the server-only
// MARKETPLACE_PUBLIC in lib/marketplace.ts, which pulls in Prisma and can't be
// imported into these client-bundled nav components) so nav visibility and the
// public price-comparison/listing gating flip together from one Vercel env var.
// While unset, the marketplace is fully live under the hood (routes, Stripe,
// escrow, cron) but not linked from anywhere a visitor would stumble onto it.
export const MARKETPLACE_NAV_VISIBLE = process.env.NEXT_PUBLIC_MARKETPLACE_PUBLIC === "1";

// The P2P marketplace nav group — see docs/MARKETPLACE.md. Spread in only once
// launched (NEXT_PUBLIC_MARKETPLACE_PUBLIC=1); kept as its own object so
// UserMenu.tsx and layout.tsx's footer can reuse the same visibility flag.
const MARKETPLACE_GROUP: NavGroup = {
  title: "Marketplace",
  links: [
    { href: "/marketplace", label: "Buy on Marketplace", emoji: "🛒", keywords: ["marketplace", "p2p", "from players", "second hand"] },
    { href: "/marketplace/sell", label: "Sell a card", emoji: "🏷️", keywords: ["sell", "list a card", "seller"] },
    { href: "/marketplace/orders", label: "My orders", emoji: "📦", keywords: ["orders", "purchases", "tracking"] },
    { href: "/marketplace/funds", label: "Seller funds", emoji: "💰", keywords: ["payout", "balance", "earnings"] },
    { href: "/marketplace/buyer-protection", label: "Buyer protection", emoji: "🛡️", keywords: ["protection", "refund", "dispute", "escrow"] },
    { href: "/marketplace/faq", label: "Marketplace FAQ", emoji: "❓", keywords: ["faq", "questions", "how it works"] },
  ],
};

export const NAV_GROUPS: NavGroup[] = [
  {
    // Core price/data pages — the heart of the site.
    title: "Prices",
    links: [
      { href: "/browse", label: "Card Database", emoji: "🗃️", keywords: ["cards", "search", "find", "lookup", "compare prices", "database", "singles"] },
      { href: "/sealed", label: "Sealed Products", emoji: "📦", keywords: ["booster box", "packs", "boxes", "bundles", "cases", "sealed"] },
      // The countdown for whichever set is NEXT. Its predecessor
      // (/vendetta-countdown) was never in the nav and depended entirely on
      // article links for discovery; putting the slot here means the release-date
      // page is one ⌘K away all through the pre-launch window, when it is the
      // single highest-intent page on the site.
      { href: "/radiance-countdown", label: "Radiance release date", emoji: "✨", keywords: ["release date", "countdown", "when", "next set", "set 5", "radiance"] },
      { href: "/market", label: "Market Index", emoji: "📊", keywords: ["index", "market", "chart", "trend", "how is the market"] },
      { href: "/movers", label: "Daily Movers", emoji: "📈", keywords: ["movers", "risers", "fallers", "gainers", "drops", "trending", "biggest movers"] },
      { href: "/stores/tracked", label: "Stores we track", emoji: "🏪", keywords: ["stores", "shops", "retailers", "which stores"] },
      { href: "/bulk-pricer", label: "Bulk Pricer", emoji: "📋", keywords: ["bulk", "price a list", "paste a list", "collection value"] },
    ],
  },
  ...(MARKETPLACE_NAV_VISIBLE ? [MARKETPLACE_GROUP] : []),
  {
    // The database's own hub pages. These were reachable from the sitemap and
    // from /llms.txt but were NOT in the nav at all, on the old view that "the
    // nav is a shortlist, not an index". The ⌘K launcher is now the index — a
    // visitor searching "champions" or "keywords" was getting "No matches" for
    // pages we very much have — so they live here and llms.txt reads them from
    // this one list instead of keeping its own copy.
    title: "Browse the database",
    links: [
      { href: "/sets", label: "Sets & card lists", emoji: "🗂️", keywords: ["sets", "set list", "card list", "vendetta", "origins", "unleashed", "spirit forged", "proving grounds", "radiance"] },
      { href: "/champions", label: "Champions", emoji: "🦸", keywords: ["champions", "by champion", "legends"] },
      { href: "/cards", label: "By type & rarity", emoji: "🔤", keywords: ["type", "rarity", "showcase", "epic", "signature", "promo", "printings", "facets", "alt art"] },
      { href: "/domains", label: "Domains", emoji: "🌀", keywords: ["domains", "colours", "colors", "fury", "calm", "mind", "body", "chaos", "order"] },
      { href: "/keywords", label: "Keywords glossary", emoji: "📚", keywords: ["keywords", "glossary", "mechanics", "rules", "empower", "flow", "burn", "tank", "deflect", "what does"] },
      { href: "/singles", label: "Buy singles", emoji: "🃏", keywords: ["singles", "buy singles", "cheapest single"] },
    ],
  },
  {
    // Smart-shopping / value tools (several Premium).
    title: "Deals & value",
    links: [
      { href: "/tools/deal-finder", label: "Deal Finder", emoji: "💱", keywords: ["deals", "bargains", "cheapest", "savings", "arbitrage", "underpriced"] },
      { href: "/tools/value-finder", label: "Value Finder", emoji: "🔎", keywords: ["value", "best value", "worth", "undervalued"] },
      { href: "/tools/rising", label: "Rising Cards", emoji: "🚀", keywords: ["rising", "hot", "momentum", "spiking", "going up"] },
      { href: "/tools/best-basket", label: "Best Basket", emoji: "🧺", keywords: ["basket", "cart", "multi card", "cheapest combination", "one order", "shipping"] },
      { href: "/tools/box-ev", label: "Box EV Calc", emoji: "🎲", keywords: ["ev", "expected value", "is a box worth it", "booster box value", "box ev"] },
      { href: "/tools", label: "All Tools", emoji: "🧰", keywords: ["tools", "calculators", "utilities"] },
    ],
  },
  {
    // The signed-in user's own stuff + the upgrade.
    title: "Your collection",
    links: [
      { href: "/portfolio", label: "My Portfolio", emoji: "💼", keywords: ["collection", "my cards", "holdings", "portfolio", "what is mine worth"] },
      { href: "/watching", label: "My Watchlist", emoji: "🔔", keywords: ["watchlist", "watching", "saved", "favourites", "favorites", "tracked cards"] },
      { href: "/alerts", label: "Price Alerts", emoji: "📩", keywords: ["alerts", "price alerts", "notify me", "notifications", "email me", "price drop"] },
      { href: "/premium", label: "Premium", emoji: "⭐", keywords: ["premium", "upgrade", "subscription", "pro", "plans", "pricing"] },
    ],
  },
  {
    title: "Decks",
    links: [
      { href: "/decks", label: "Meta Decks", emoji: "🏆", keywords: ["meta", "tier list", "decklists", "best decks"] },
      { href: "/deck", label: "Deck Builder", emoji: "🛠️", keywords: ["build a deck", "deck price", "brew", "deck cost"] },
      { href: "/trade", label: "Trade Calculator", emoji: "🔁", keywords: ["trade", "swap", "fair trade", "is this trade fair"] },
    ],
  },
  {
    title: "Games",
    links: [
      { href: "/riftle", label: "Riftle (daily)", emoji: "🃏", keywords: ["riftle", "wordle", "daily", "puzzle", "guess the card"] },
      { href: "/games/pack-sim", label: "Pack Simulator", emoji: "🎁", keywords: ["pack sim", "pack opening", "open packs", "rip packs", "simulator"] },
      { href: "/games/price-check", label: "Price Check", emoji: "💲", keywords: ["price check", "guess the price"], hideInFooter: true },
      { href: "/games/higher-lower", label: "Higher or Lower", emoji: "↕️", keywords: ["higher lower", "higher or lower"], hideInFooter: true },
      { href: "/games/card-smash", label: "Card Smash", emoji: "🔨", keywords: ["card smash", "whack a mole", "reflex"], hideInFooter: true },
      { href: "/games/pairs", label: "Pairs", emoji: "🧠", keywords: ["pairs", "memory", "matching"], hideInFooter: true },
      { href: "/games/twenty48", label: "Riftbound 2048", emoji: "🔢", keywords: ["2048", "twenty48", "merge"], hideInFooter: true },
      { href: "/games/zoomed", label: "Zoomed In", emoji: "🔍", keywords: ["zoomed", "guess the card", "art quiz"], hideInFooter: true },
      { href: "/games", label: "All Games", emoji: "🎮", keywords: ["games", "play", "fun", "quiz", "minigames"] },
    ],
  },
  {
    // Our original editorial work. Promoted out of the footer-only position it
    // used to occupy — see PRIMARY_NAV below and Navbar.tsx. A reviewer (or a
    // reader) landing on a programmatic price page needs a one-click path to
    // something a person wrote, or the whole site reads as a data feed.
    title: "Guides & News",
    links: [
      { href: "/guides", label: "Guides", emoji: "📖", keywords: ["guides", "how to", "tutorials", "explainers"] },
      { href: "/blog", label: "News & analysis", emoji: "📰", keywords: ["blog", "news", "articles", "posts", "updates", "announcements"] },
      { href: "/learn", label: "Learn Riftbound", emoji: "🎓", keywords: ["learn", "beginner", "how to play", "getting started", "rules"] },
      { href: "/authors", label: "Who writes this", emoji: "✍️", keywords: ["authors", "team", "byline", "who writes"] },
      { href: "/editorial-policy", label: "Editorial policy", emoji: "📐", keywords: ["editorial", "policy", "standards", "corrections"] },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/support", label: "Support", emoji: "🆘", keywords: ["support", "help", "faq", "problem", "issue", "something is broken"] },
      { href: "/contact", label: "Contact & feedback", emoji: "✉️", keywords: ["contact", "email", "get in touch", "reach us"] },
      { href: "/feedback", label: "Suggest a feature", emoji: "💡", keywords: ["feedback", "suggest", "idea", "feature request", "vote"] },
      { href: "/stores/suggest", label: "Suggest a store", emoji: "➕", keywords: ["suggest a store", "add a store", "missing store", "list my store"] },
      { href: "/about", label: "About RiftCompare", emoji: "ℹ️", keywords: ["about", "who we are", "riftcompare", "compare"] },
    ],
  },
];

// TOP-LEVEL header items — the handful of destinations that get their own
// always-visible link rather than living inside the mega-menu.
//
// The editorial slot is here deliberately. The blog and guides were reachable
// only from the footer and the mega-menu, which meant the ~64 pieces of
// genuinely original writing on this site were invisible to anyone who didn't go
// looking — including an AdSense reviewer sampling pages from the homepage.
// Original content that a reviewer cannot find might as well not exist. It
// points at /blog rather than /guides: same job, and the blog is the half that
// changes weekly. Keep this in step with Navbar.tsx, which renders the real bar.
export const PRIMARY_NAV: { href: string; label: string }[] = [
  { href: "/browse", label: "Cards" },
  { href: "/sealed", label: "Sealed" },
  { href: "/market", label: "Index" },
  { href: "/blog", label: "Blog" },
];

// The footer's own grouping — 4 columns instead of NAV_GROUPS' 8-9. Same links,
// same hrefs (every one still reachable, still counted for internal linking),
// just re-bucketed by theme so the footer doesn't need a column per nav group.
// Built FROM NAV_GROUPS (not duplicated) so editing a link once still only
// means editing it once. NAV_GROUPS itself is untouched — the ⌘K launcher keeps
// its finer-grained grouping.
//
// COLUMN BALANCE is the thing to preserve when editing. The four columns are
// deliberately kept within roughly 8-15 links of each other; a column at twice
// its neighbours' height leaves a ragged block of whitespace under the other
// three. Marketplace's 6 links are split 2-2-2 across three columns for the same
// reason (the spread is a no-op — an empty array — while MARKETPLACE_NAV_VISIBLE
// is off). Links flagged `hideInFooter` (the six secondary mini-games, whose
// /games hub is here) are dropped: the launcher is the complete index, the
// footer is a curated block.
const byTitle = Object.fromEntries(
  NAV_GROUPS.map((g) => [g.title, g.links.filter((l) => !l.hideInFooter)])
);
const marketplaceLinks = byTitle["Marketplace"] ?? [];

export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: "Shop",
    links: [...(byTitle["Prices"] ?? []), ...marketplaceLinks.slice(0, 2)],
  },
  {
    title: "Browse & collect",
    links: [...(byTitle["Browse the database"] ?? []), ...(byTitle["Your collection"] ?? [])],
  },
  {
    title: "Deals & decks",
    links: [...(byTitle["Deals & value"] ?? []), ...(byTitle["Decks"] ?? []), ...marketplaceLinks.slice(2, 4)],
  },
  {
    title: "Learn & play",
    links: [
      ...(byTitle["Games"] ?? []),
      ...(byTitle["Guides & News"] ?? []),
      ...(byTitle["Help"] ?? []),
      ...marketplaceLinks.slice(4, 6),
    ],
  },
];
