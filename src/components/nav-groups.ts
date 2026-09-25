import { DISCORD_URL } from "@/lib/site";

// The grouped site navigation, shared by the ⌘K command launcher
// (CommandLauncher.tsx), the persistent desktop rail (SideNav.tsx), the footer
// site-map (FOOTER_GROUPS below) and /llms.txt — edit a link here once and all
// four follow.
import type { NavIconName } from "./NavIcon";

export interface NavGroupLink {
  href: string;
  label: string;
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
}

export interface NavGroup {
  title: string;
  /**
   * Which icon the desktop rail shows for this group in its collapsed mode,
   * with the group's links in a flyout. A KEY, not the art: the drawings live
   * in NavIcon.tsx so this stays a plain data module (imported by both server
   * and client components) and so re-drawing an icon touches no nav data.
   *
   * Was an emoji until 2026-09-11 — see NavIcon.tsx for why that changed.
   * Required in practice for NAV_GROUPS, since SideNav renders every group as
   * an icon; optional on the type because the footer groups never collapse.
   */
  icon?: NavIconName;
  links: NavGroupLink[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    // Core price/data pages — the heart of the site.
    title: "Prices",
    icon: "prices",
    links: [
      { href: "/browse", label: "Card Database", keywords: ["cards", "search", "find", "lookup", "compare prices", "database", "singles"] },
      { href: "/sealed", label: "Sealed Products", keywords: ["booster box", "packs", "boxes", "bundles", "cases", "sealed"] },
      // Label deliberately omits the word "prices": nav search scores the label, and
      // "Radiance pre-order prices" outranked the Bulk Pricer on a bare "prices"
      // query (caught by tests/nav-search.test.ts). The pre-order keywords below
      // still carry every intent that should land here.
      { href: "/radiance-preorders", label: "Radiance pre-orders", keywords: ["preorder", "pre-order", "radiance preorder", "booster box preorder", "set 5 preorder"] },
      { href: "/market", label: "Market Index", keywords: ["index", "market", "chart", "trend", "how is the market"] },
      { href: "/movers", label: "Weekly Movers", keywords: ["movers", "risers", "fallers", "gainers", "drops", "trending", "biggest movers", "most searched", "popular cards"] },
      { href: "/auctions", label: "Live Auctions", keywords: ["auctions", "auction", "ebay auctions", "bid", "bidding", "ending soon", "ending soonest", "hot auctions", "graded auctions", "psa auction", "slab", "bidding war"] },
      { href: "/stores/tracked", label: "Stores we track", keywords: ["stores", "shops", "retailers", "which stores"] },
    ],
  },
  {
    // The database's own hub pages. These were reachable from the sitemap and
    // from /llms.txt but were NOT in the nav at all, on the old view that "the
    // nav is a shortlist, not an index". The ⌘K launcher is now the index — a
    // visitor searching "champions" or "keywords" was getting "No matches" for
    // pages we very much have — so they live here and llms.txt reads them from
    // this one list instead of keeping its own copy.
    title: "The card database",
    icon: "browse",
    links: [
      { href: "/sets", label: "Sets & card lists", keywords: ["sets", "set list", "card list", "vendetta", "origins", "unleashed", "spirit forged", "proving grounds", "radiance"] },
      { href: "/champions", label: "Champions", keywords: ["champions", "by champion", "legends"] },
      { href: "/cards", label: "By type & rarity", keywords: ["type", "rarity", "showcase", "epic", "signature", "promo", "printings", "facets", "alt art"] },
      { href: "/cards/all", label: "Every card (A-Z)", keywords: ["all cards", "every card", "full list", "complete list", "card index", "sitemap", "a-z", "list of all riftbound cards"] },
      // The set-agnostic hub for /sets/<set>/gallery (added 2026-08-20 to target
      // "riftbound card gallery" directly — see that route's own doc comment for
      // the Search Console data behind the per-set galleries it links to).
      { href: "/gallery", label: "Card gallery", keywords: ["gallery", "card gallery", "full art", "browse art", "card images"] },
      { href: "/domains", label: "Domains", keywords: ["domains", "colours", "colors", "fury", "calm", "mind", "body", "chaos", "order"] },
      // 2026-09-24: "riftbound ban list" is 8.7K impressions a month; the guide
      // now opens with the full banned-card table (lib/banlist.ts).
      { href: "/guides/riftbound-banlist-explained", label: "Ban list", keywords: ["ban list", "banlist", "banned", "banned cards", "bans", "restricted", "legal cards", "2v2 bans"] },
      { href: "/keywords", label: "Keywords glossary", keywords: ["keywords", "glossary", "mechanics", "rules", "empower", "flow", "burn", "tank", "deflect", "what does"] },
      { href: "/singles", label: "Buy singles", keywords: ["singles", "buy singles", "cheapest single"] },
    ],
  },
  {
    // Decks and Games sit ABOVE the money tools on purpose (2026-09-16).
    //
    // Reader feedback, more than once: "simply a too greedy/capitalistic/money
    // focused site for a card GAME for me". Measured on the live site before
    // this change, /premium was the 2nd internal link on a page and the first
    // game was the 34th; `box-ev` and `selling-fees` — a booster-box gambling
    // calculator and a marketplace commission calculator — both outranked every
    // one of the ten games this site actually has.
    //
    // Prices stay first, because that IS the product and it is what people
    // arrive for. But a site about a card game should reach "build a deck" and
    // "play something" before it reaches "work out your selling fees".
    title: "Decks",
    icon: "decks",
    links: [
      // "Meta Decks" (/decks) led this group until 2026-09-12. It was ten
      // hand-typed lists in prisma/meta-decks.json presented as the metagame —
      // removed, with /decks/* redirecting here (DECISIONS.md, "Meta decks:
      // removed").
      // "& Pricer" since 2026-09-25: the Bulk Pricer folded into /deck
      // (/bulk-pricer 301s here), so this is the list-pricing page too — and
      // the label is what a bare "prices" query in ⌘K ranks on.
      { href: "/deck", label: "Deck Builder & Pricer", keywords: ["build a deck", "deck price", "brew", "deck cost", "decklist", "meta", "decks", "bulk", "price a list", "paste a list", "bulk price checker"] },
      { href: "/trade", label: "Trade Calculator", keywords: ["trade", "swap", "fair trade", "is this trade fair"] },
    ],
  },
  {
    title: "Games",
    icon: "games",
    links: [
      { href: "/riftle", label: "Riftle (daily)", keywords: ["riftle", "wordle", "daily", "puzzle", "guess the card"] },
      { href: "/games/pack-sim", label: "Pack Simulator", keywords: ["pack sim", "pack opening", "open packs", "rip packs", "simulator"] },
      { href: "/games/price-check", label: "Price Check", keywords: ["price check", "guess the price"], hideInFooter: true },
      { href: "/games/higher-lower", label: "Higher or Lower", keywords: ["higher lower", "higher or lower"], hideInFooter: true },
      { href: "/games/card-smash", label: "Card Smash", keywords: ["card smash", "whack a mole", "reflex"], hideInFooter: true },
      { href: "/games/pairs", label: "Pairs", keywords: ["pairs", "memory", "matching"], hideInFooter: true },
      { href: "/games/twenty48", label: "Riftbound 2048", keywords: ["2048", "twenty48", "merge"], hideInFooter: true },
      { href: "/games/zoomed", label: "Zoomed In", keywords: ["zoomed", "guess the card", "art quiz"], hideInFooter: true },
      { href: "/games/card-rain", label: "Card Rain", keywords: ["card rain", "catch", "falling cards", "arcade"], hideInFooter: true },
      { href: "/games/sealed-bid", label: "Sealed Bid", keywords: ["sealed bid", "multiplayer", "auction", "play with friends", "party game"], hideInFooter: true },
      { href: "/games", label: "All Games", keywords: ["games", "play", "fun", "quiz", "minigames"] },
    ],
  },
  {
    // Smart-shopping / value tools (several Premium).
    title: "Deals & value",
    icon: "deals",
    links: [
      { href: "/tools/deal-finder", label: "Deal Finder", keywords: ["deals", "bargains", "cheapest", "savings", "arbitrage", "underpriced", "undervalued", "best value"] },
      { href: "/tools/rising", label: "Rising Cards", keywords: ["rising", "hot", "momentum", "spiking", "going up"] },
      { href: "/tools/best-basket", label: "Best Basket", keywords: ["basket", "cart", "multi card", "cheapest combination", "one order", "shipping"] },
      // Premium (2026-09-25). "most searched" and "popular cards" stay /movers'
      // too: its free top-10 strip answers them for everyone.
      { href: "/tools/demand", label: "Demand Finder", keywords: ["demand", "most viewed", "most searched", "popular cards", "what players are searching for", "search trends"] },
      { href: "/tools/box-ev", label: "Box EV Calc", keywords: ["ev", "expected value", "is a box worth it", "booster box value", "box ev"] },
      { href: "/tools/selling-fees", label: "Selling Fee Calc", keywords: ["tcgplayer fees", "ebay fees", "selling fees", "net proceeds", "marketplace commission"] },
      { href: "/tools", label: "All Tools", keywords: ["tools", "calculators", "utilities"] },
    ],
  },
  {
    // The signed-in user's own stuff + the upgrade.
    title: "Your collection",
    icon: "collection",
    links: [
      // Labelled "My Portfolio" until 2026-09-16. The route stays /portfolio (it is
      // noindex, so nothing SEO rides on the label) and "portfolio" stays a search
      // keyword, so anyone who types it still lands here.
      { href: "/portfolio", label: "My Binder", keywords: ["collection", "my cards", "holdings", "portfolio", "binder", "what is mine worth"] },
      { href: "/watching", label: "My Watchlist", keywords: ["watchlist", "watching", "saved", "favourites", "favorites", "tracked cards"] },
      { href: "/alerts", label: "Price Alerts", keywords: ["alerts", "price alerts", "notify me", "notifications", "email me", "price drop"] },
      { href: "/premium", label: "Premium", keywords: ["premium", "upgrade", "subscription", "pro", "plans", "pricing"] },
    ],
  },
  {
    // Our original editorial work. Promoted out of the footer-only position it
    // used to occupy — see PRIMARY_NAV below and Navbar.tsx. A reviewer (or a
    // reader) landing on a programmatic price page needs a one-click path to
    // something a person wrote, or the whole site reads as a data feed.
    title: "Guides & News",
    icon: "news",
    links: [
      { href: "/guides", label: "Guides", keywords: ["guides", "how to", "tutorials", "explainers"] },
      // "Blog", not "News & analysis" (renamed 2026-09-19, owner call). The site
      // was calling one destination two different things depending on which
      // navigation surface you were in: PRIMARY_NAV (the top bar) has always said
      // "Blog", the page's own H1 is "Blog", and its <title> is "Riftbound Blog —
      // …" — while this entry, which feeds the Explore overlay, the footer,
      // SideNav and the ⌘K launcher, said "News & analysis". Clicking it landed
      // you on a page headed something else. The `keywords` below already carry
      // news/articles/announcements, so ⌘K still finds it by any of the old words.
      { href: "/blog", label: "Blog", keywords: ["blog", "news", "articles", "posts", "updates", "announcements", "analysis"] },
      // hideInFooter: the footer's four columns are already at the top of their
      // readable-spread ceiling (tests/nav-search.test.ts) — still reachable via
      // the ⌘K launcher, SideNav and llms.txt, plus the direct links this page
      // added on /blog and /guides themselves.
      { href: "/community", label: "Community links", keywords: ["community", "resources", "links", "other sites", "riftbound news", "deck builders", "wikis", "tier list", "meta"], hideInFooter: true },
      { href: "/learn", label: "Learn Riftbound", keywords: ["learn", "beginner", "how to play", "getting started", "rules"] },
      { href: "/authors", label: "Who writes this", keywords: ["authors", "team", "byline", "who writes"] },
      { href: "/editorial-policy", label: "Editorial policy", keywords: ["editorial", "policy", "standards", "corrections"] },
      { href: "/methodology", label: "Methodology", keywords: ["methodology", "condition", "grading", "fx", "currency", "ranking"] },
    ],
  },
  {
    // The catch-all. A page belongs here when it answers a real question but is
    // none of the things the other groups are about — not a price, not a view of
    // the card database, not a tool, not our own writing.
    //
    // /release-dates is the founding member, and the reason the group exists. It
    // had been filed under "The card database" (and under "Prices" before
    // that), because a release countdown is adjacent to both and squarely in
    // neither — it was the one entry in a database-views group that shows no
    // cards, exactly as it had been the one entry in a prices group with nothing
    // to do with comparing a price. Rather than move it a third time, it gets a
    // group whose whole definition is "doesn't fit the others".
    title: "Miscellaneous",
    icon: "calendar",
    links: [
      // Deliberately NOT named after a set. Its two predecessors were
      // (/vendetta-countdown, then /radiance-countdown) and both went stale on a
      // known date, taking a nav label with them; this one reads the release
      // calendar and rolls forward on its own. The keywords carry every
      // set-specific phrasing people actually type, so "radiance release date"
      // still lands here without the label having to say it.
      { href: "/release-dates", label: "Release dates", keywords: ["release date", "release dates", "countdown", "when", "next set", "upcoming", "radiance", "legacy", "when does the next set come out"] },
    ],
  },
  {
    // The B2B side, and the only group here aimed at someone SELLING rather
    // than buying. It exists as its own group instead of being folded into
    // Help or Prices because both of those are read by players: a shop owner
    // who lands on the site had no path to /stores from the navigation at all
    // (2026-09-21 — the pages existed, nothing linked to them), and a store
    // hunting for "do they have anything for retailers" will not think to
    // look under Help. One group, one icon, one obvious answer.
    //
    // /stores/tracked stays under Prices and /stores/suggest stays under Help
    // ON PURPOSE. Both are read by PLAYERS ("which stores do you compare?",
    // "you're missing my local") far more than by retailers, and moving them
    // here to tidy the URL prefix would bury them for the bigger audience. A
    // link lives where its READER looks, not where its path says.
    title: "For stores",
    icon: "store",
    links: [
      {
        href: "/stores",
        label: "RiftCompare for Stores",
        keywords: ["for stores", "retailers", "my store", "i own a store", "b2b", "sell riftbound", "repricing", "repricing report", "store report", "lgs", "game store", "shop owner"],
      },
      {
        href: "/stores/consulting",
        label: "Book a consulting session",
        keywords: ["consulting", "consultancy", "consultant", "book a session", "pricing help", "pricing strategy", "advice", "one on one", "paid session", "store pricing", "what should i charge"],
      },
    ],
  },
  {
    title: "Help",
    icon: "help",
    links: [
      { href: "/support", label: "Support", keywords: ["support", "help", "faq", "problem", "issue", "something is broken"] },
      { href: "/contact", label: "Contact & feedback", keywords: ["contact", "email", "get in touch", "reach us"] },
      { href: "/feedback", label: "Suggest a feature", keywords: ["feedback", "suggest", "idea", "feature request", "vote"] },
      { href: "/stores/suggest", label: "Suggest a store", keywords: ["suggest a store", "add a store", "missing store", "list my store"] },
      { href: "/about", label: "About RiftCompare", keywords: ["about", "who we are", "riftcompare", "compare"] },
      { href: "/creators", label: "Socials & Creators", keywords: ["socials", "social media", "discord", "instagram", "twitter", "x", "facebook", "follow us", "creators", "content creators", "influencers", "partner", "partnership", "youtube", "twitch", "tiktok"] },
      // The widget directory. It inherits the "embed" keywords that used to sit
      // on /creators above, which was the closest thing the launcher had to an
      // answer for "embed" and was the wrong page to land on: /creators lists
      // people, this one lists the three widgets and the HTML to paste. The
      // widgets themselves have been live for months with no public page
      // describing them.
      { href: "/embed", label: "Widgets for your site", keywords: ["embed", "embed widget", "widget", "iframe", "badge", "price badge", "countdown widget", "add to my site", "api"] },
      // The header's own Discord icon is desktop-only (Navbar.tsx, lg:grid) —
      // below that breakpoint (everything under 1024px: every phone AND the
      // whole 640-1023px tablet range) it was reachable from NOWHERE, despite
      // a header comment claiming "Discord is in the footer, so no link is
      // lost." DISCORD_URL had never actually been added to NAV_GROUPS, so
      // that claim was false — this makes it true. External, so every
      // renderer of this list must open it in a new tab, not route through it.
      { href: DISCORD_URL, label: "Join our Discord", keywords: ["discord", "community", "chat", "server"], external: true },
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
// three. Links flagged `hideInFooter` (the seven secondary mini-games, whose
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
const miscLinks = byTitle["Miscellaneous"] ?? [];

// "For stores" has no footer column of its own either, for the same reason
// Miscellaneous doesn't: four columns IS the footer's layout. It folds into
// Shop, which was the shortest column (9 links against 12/12/16) and is the
// one already about retailers — and the footer is where a business reader
// conventionally goes looking for the "for partners" link anyway.
const storeLinks = byTitle["For stores"] ?? [];

export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: "Shop",
    links: [...(byTitle["Prices"] ?? []), ...miscLinks, ...storeLinks],
  },
  {
    title: "Cards & collection",
    links: [...(byTitle["The card database"] ?? []), ...(byTitle["Your collection"] ?? [])],
  },
  // Games sit with the tools since 2026-09-25: the premium lineup took four
  // tools out of "Deals & value", which left that column at 8 links against
  // Learn's 17, past the 2x spread above. Moving the three footer games across
  // (the other seven are hideInFooter) rebalances to 10 / 13 / 11 / 14.
  {
    title: "Tools, decks & games",
    links: [...(byTitle["Deals & value"] ?? []), ...(byTitle["Decks"] ?? []), ...(byTitle["Games"] ?? [])],
  },
  {
    title: "Learn & help",
    links: [...(byTitle["Guides & News"] ?? []), ...(byTitle["Help"] ?? [])],
  },
];
