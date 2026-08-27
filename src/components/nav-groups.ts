import { DISCORD_URL } from "@/lib/site";

// The grouped site navigation, shared by the ⌘K command launcher
// (CommandLauncher.tsx), the persistent desktop rail (SideNav.tsx), the footer
// site-map (FOOTER_GROUPS below) and /llms.txt — edit a link here once and all
// four follow.
export interface NavGroupLink {
  href: string;
  label: string;
  emoji: string;
  /**
   * True for a link that leaves the site (opens in a new tab, never routed
   * through next/link's client-side navigation or router.push — both would
   * either mis-handle an absolute non-app URL or navigate the current tab
   * away from RiftCompare). Every renderer of NavGroupLink (FooterNav,
   * CinematicNavMenu, CommandLauncher, SideNav) must branch on this.
   */
  external?: boolean;
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
  /**
   * One of the ~10 highest-traffic destinations — the default view the phone
   * Explore overlay (CinematicNavMenu) leads with, before a visitor asks to see
   * everything. See POPULAR_LINKS below for the full contract on what belongs
   * here.
   */
  popular?: boolean;
}

export interface NavGroup {
  title: string;
  links: NavGroupLink[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    // Core price/data pages — the heart of the site.
    title: "Prices",
    links: [
      { href: "/browse", label: "Card Database", emoji: "🗃️", keywords: ["cards", "search", "find", "lookup", "compare prices", "database", "singles"], popular: true },
      { href: "/sealed", label: "Sealed Products", emoji: "📦", keywords: ["booster box", "packs", "boxes", "bundles", "cases", "sealed"], popular: true },
      // Label deliberately omits the word "prices": nav search scores the label, and
      // "Radiance pre-order prices" outranked the Bulk Pricer on a bare "prices"
      // query (caught by tests/nav-search.test.ts). The pre-order keywords below
      // still carry every intent that should land here.
      { href: "/radiance-preorders", label: "Radiance pre-orders", emoji: "🛒", keywords: ["preorder", "pre-order", "radiance preorder", "booster box preorder", "set 5 preorder"] },
      { href: "/movers", label: "Daily Movers", emoji: "📈", keywords: ["movers", "risers", "fallers", "gainers", "drops", "trending", "biggest movers", "how is the market"], popular: true },
      { href: "/stores/tracked", label: "Stores we track", emoji: "🏪", keywords: ["stores", "shops", "retailers", "which stores"] },
      { href: "/bulk-pricer", label: "Bulk Pricer", emoji: "📋", keywords: ["bulk", "price a list", "paste a list", "collection value"] },
    ],
  },
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
      // The set-agnostic hub for /sets/<set>/gallery (added 2026-08-20 to target
      // "riftbound card gallery" directly — see that route's own doc comment for
      // the Search Console data behind the per-set galleries it links to).
      { href: "/gallery", label: "Card gallery", emoji: "🖼️", keywords: ["gallery", "card gallery", "full art", "browse art", "card images"] },
      { href: "/domains", label: "Domains", emoji: "🌀", keywords: ["domains", "colours", "colors", "fury", "calm", "mind", "body", "chaos", "order"] },
      { href: "/keywords", label: "Keywords glossary", emoji: "📚", keywords: ["keywords", "glossary", "mechanics", "rules", "empower", "flow", "burn", "tank", "deflect", "what does"] },
      { href: "/singles", label: "Buy singles", emoji: "🃏", keywords: ["singles", "buy singles", "cheapest single"] },
    ],
  },
  {
    // Smart-shopping / value tools (several Premium).
    title: "Deals & value",
    links: [
      { href: "/tools/deal-finder", label: "Deal Finder", emoji: "💱", keywords: ["deals", "bargains", "cheapest", "savings", "arbitrage", "underpriced"], popular: true },
      { href: "/tools/value-finder", label: "Value Finder", emoji: "🔎", keywords: ["value", "best value", "worth", "undervalued"] },
      { href: "/tools/rising", label: "Rising Cards", emoji: "🚀", keywords: ["rising", "hot", "momentum", "spiking", "going up"] },
      { href: "/tools/best-basket", label: "Best Basket", emoji: "🧺", keywords: ["basket", "cart", "multi card", "cheapest combination", "one order", "shipping"], popular: true },
      { href: "/tools/condition-calculator", label: "Condition Calculator", emoji: "🩹", keywords: ["condition", "nm", "lp", "mp", "hp", "damaged", "grading", "value calculator"] },
      { href: "/tools/box-ev", label: "Box EV Calc", emoji: "🎲", keywords: ["ev", "expected value", "is a box worth it", "booster box value", "box ev"] },
      { href: "/tools/selling-fees", label: "Selling Fee Calc", emoji: "🧾", keywords: ["tcgplayer fees", "ebay fees", "selling fees", "net proceeds", "marketplace commission"] },
      { href: "/tools", label: "All Tools", emoji: "🧰", keywords: ["tools", "calculators", "utilities"] },
    ],
  },
  {
    // The signed-in user's own stuff + the upgrade.
    title: "Your collection",
    links: [
      { href: "/portfolio", label: "My Portfolio", emoji: "💼", keywords: ["collection", "my cards", "holdings", "portfolio", "what is mine worth"] },
      { href: "/watching", label: "My Watchlist", emoji: "🔔", keywords: ["watchlist", "watching", "saved", "favourites", "favorites", "tracked cards"], popular: true },
      { href: "/alerts", label: "Price Alerts", emoji: "📩", keywords: ["alerts", "price alerts", "notify me", "notifications", "email me", "price drop"] },
      { href: "/premium", label: "Premium", emoji: "⭐", keywords: ["premium", "upgrade", "subscription", "pro", "plans", "pricing"], popular: true },
    ],
  },
  {
    title: "Decks",
    links: [
      { href: "/decks", label: "Meta Decks", emoji: "🏆", keywords: ["meta", "tier list", "decklists", "best decks"], popular: true },
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
      { href: "/blog", label: "News & analysis", emoji: "📰", keywords: ["blog", "news", "articles", "posts", "updates", "announcements"], popular: true },
      { href: "/learn", label: "Learn Riftbound", emoji: "🎓", keywords: ["learn", "beginner", "how to play", "getting started", "rules"] },
      { href: "/authors", label: "Who writes this", emoji: "✍️", keywords: ["authors", "team", "byline", "who writes"] },
      { href: "/editorial-policy", label: "Editorial policy", emoji: "📐", keywords: ["editorial", "policy", "standards", "corrections"] },
      { href: "/methodology", label: "Methodology", emoji: "📏", keywords: ["methodology", "condition", "grading", "fx", "currency", "ranking"] },
    ],
  },
  {
    // The catch-all. A page belongs here when it answers a real question but is
    // none of the things the other groups are about — not a price, not a view of
    // the card database, not a tool, not our own writing.
    //
    // /release-dates is the founding member, and the reason the group exists. It
    // had been filed under "Browse the database" (and under "Prices" before
    // that), because a release countdown is adjacent to both and squarely in
    // neither — it was the one entry in a database-views group that shows no
    // cards, exactly as it had been the one entry in a prices group with nothing
    // to do with comparing a price. Rather than move it a third time, it gets a
    // group whose whole definition is "doesn't fit the others".
    title: "Miscellaneous",
    links: [
      // Deliberately NOT named after a set. Its two predecessors were
      // (/vendetta-countdown, then /radiance-countdown) and both went stale on a
      // known date, taking a nav label with them; this one reads the release
      // calendar and rolls forward on its own. The keywords carry every
      // set-specific phrasing people actually type, so "radiance release date"
      // still lands here without the label having to say it.
      { href: "/release-dates", label: "Release dates", emoji: "📅", keywords: ["release date", "release dates", "countdown", "when", "next set", "upcoming", "radiance", "legacy", "when does the next set come out"] },
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
      // The header's own Discord icon is desktop-only (Navbar.tsx, lg:grid) —
      // below that breakpoint (everything under 1024px: every phone AND the
      // whole 640-1023px tablet range) it was reachable from NOWHERE, despite
      // a header comment claiming "Discord is in the footer, so no link is
      // lost." DISCORD_URL had never actually been added to NAV_GROUPS, so
      // that claim was false — this makes it true. External, so every
      // renderer of this list must open it in a new tab, not route through it.
      { href: DISCORD_URL, label: "Join our Discord", emoji: "💬", keywords: ["discord", "community", "chat", "server"], external: true },
    ],
  },
];

// The phone Explore overlay's DEFAULT view (CinematicNavMenu) — the ~10
// highest-traffic destinations, flat (no category headers), instead of every
// link across all ~9 groups. Reported directly: "we don't need everything to
// show up... we can have a subset of the most used features and have a way
// for them to look at all features only if they want to." Chosen to mirror
// the destinations already promoted elsewhere on the site rather than a new,
// separate editorial call — PRIMARY_NAV below (Cards/Sealed/Index/Blog), the
// header's own md/lg-and-up row (Decks, Best Basket, Premium), plus the
// highest-intent tool/collection pages (Deal Finder, Daily Movers,
// Watchlist). The full grouped list is always one tap away via "Show all
// features" — this is a default, not a wall. Order follows NAV_GROUPS, not a
// separate list, so a link can't silently drift out of sync with its own
// entry there.
export const POPULAR_LINKS: NavGroupLink[] = NAV_GROUPS.flatMap((g) => g.links).filter((l) => l.popular);

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
  { href: "/movers", label: "Movers" },
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
// three. Links flagged `hideInFooter` (the six secondary mini-games, whose
// /games hub is here) are dropped: the launcher is the complete index, the
// footer is a curated block.
const byTitle = Object.fromEntries(
  NAV_GROUPS.map((g) => [g.title, g.links.filter((l) => !l.hideInFooter)])
);

// The Miscellaneous NAV_GROUP has no footer column of its own — four columns is
// the footer's whole layout, and a fifth for one link would be worse than either
// of the alternatives. Its links are folded into Shop instead, which is also
// where /release-dates was already pinned when it lived under "Browse the
// database": without it Shop drops well below Learn & play, just over the 2x
// column-balance ceiling this file's own header comment guards. Reading the
// whole group (rather than naming the one link) means a future Miscellaneous
// entry lands somewhere real instead of silently vanishing from the footer.
//
// /stores/suggest is pinned the same way, for the same reason: removing the
// retired Market Index from the Prices group left Shop one link short of the
// ceiling against Learn & play (the tallest column, which owns Help). "Suggest a
// store" also just reads better next to "Stores we track" in Shop than buried in
// Help. NAV_GROUPS itself is untouched — only its footer column changes.
const miscLinks = byTitle["Miscellaneous"] ?? [];
const helpLinks = byTitle["Help"] ?? [];
const suggestStore = helpLinks.find((l) => l.href === "/stores/suggest");
const helpFooterLinks = helpLinks.filter((l) => l.href !== "/stores/suggest");

export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: "Shop",
    links: [
      ...(byTitle["Prices"] ?? []),
      ...miscLinks,
      ...(suggestStore ? [suggestStore] : []),
    ],
  },
  {
    title: "Browse & collect",
    links: [...(byTitle["Browse the database"] ?? []), ...(byTitle["Your collection"] ?? [])],
  },
  {
    title: "Deals & decks",
    links: [...(byTitle["Deals & value"] ?? []), ...(byTitle["Decks"] ?? [])],
  },
  {
    title: "Learn & play",
    links: [
      ...(byTitle["Games"] ?? []),
      ...(byTitle["Guides & News"] ?? []),
      ...helpFooterLinks,
    ],
  },
];
