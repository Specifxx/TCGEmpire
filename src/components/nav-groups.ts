// The grouped site navigation, shared by the phone sheet (MobileNav) and the
// desktop "Menu" mega-dropdown (NavMenu) so the two menus are always the same
// organisation — edit links here once.
export interface NavGroupLink {
  href: string;
  label: string;
  emoji: string;
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
    { href: "/marketplace", label: "Buy on Marketplace", emoji: "🛒" },
    { href: "/marketplace/sell", label: "Sell a card", emoji: "🏷️" },
    { href: "/marketplace/orders", label: "My orders", emoji: "📦" },
    { href: "/marketplace/funds", label: "Seller funds", emoji: "💰" },
    { href: "/marketplace/buyer-protection", label: "Buyer protection", emoji: "🛡️" },
    { href: "/marketplace/faq", label: "Marketplace FAQ", emoji: "❓" },
  ],
};

export const NAV_GROUPS: NavGroup[] = [
  {
    // Core price/data pages — the heart of the site.
    title: "Prices",
    links: [
      { href: "/browse", label: "Card Database", emoji: "🗃️" },
      { href: "/sealed", label: "Sealed Products", emoji: "📦" },
      // The countdown for whichever set is NEXT. Its predecessor
      // (/vendetta-countdown) was never in the nav and depended entirely on
      // article links for discovery; putting the slot here means the release-date
      // page is one ⌘K away all through the pre-launch window, when it is the
      // single highest-intent page on the site.
      { href: "/radiance-countdown", label: "Radiance release date", emoji: "✨" },
      { href: "/market", label: "Market Index", emoji: "📊" },
      { href: "/stores/tracked", label: "Stores we track", emoji: "🏪" },
      { href: "/bulk-pricer", label: "Bulk Pricer", emoji: "📋" },
    ],
  },
  ...(MARKETPLACE_NAV_VISIBLE ? [MARKETPLACE_GROUP] : []),
  {
    // Smart-shopping / value tools (several Premium).
    title: "Deals & value",
    links: [
      { href: "/tools/deal-finder", label: "Deal Finder", emoji: "💱" },
      { href: "/tools/value-finder", label: "Value Finder", emoji: "🔎" },
      { href: "/tools/rising", label: "Rising Cards", emoji: "🚀" },
      { href: "/tools/best-basket", label: "Best Basket", emoji: "🧺" },
      { href: "/tools/box-ev", label: "Box EV Calc", emoji: "🎲" },
      { href: "/tools", label: "All Tools", emoji: "🧰" },
    ],
  },
  {
    // The signed-in user's own stuff + the upgrade.
    title: "Your collection",
    links: [
      { href: "/portfolio", label: "My Portfolio", emoji: "💼" },
      { href: "/watching", label: "My Watchlist", emoji: "🔔" },
      { href: "/premium", label: "Premium", emoji: "⭐" },
    ],
  },
  {
    title: "Decks",
    links: [
      { href: "/decks", label: "Meta Decks", emoji: "🏆" },
      { href: "/deck", label: "Deck Builder", emoji: "🛠️" },
      { href: "/trade", label: "Trade Calculator", emoji: "🔁" },
    ],
  },
  {
    title: "Games",
    links: [
      { href: "/riftle", label: "Riftle (daily)", emoji: "🃏" },
      { href: "/games", label: "All Games", emoji: "🎮" },
    ],
  },
  {
    // Our original editorial work. Promoted out of the footer-only position it
    // used to occupy — see PRIMARY_NAV below and Navbar.tsx. A reviewer (or a
    // reader) landing on a programmatic price page needs a one-click path to
    // something a person wrote, or the whole site reads as a data feed.
    title: "Guides & News",
    links: [
      { href: "/guides", label: "Guides", emoji: "📖" },
      { href: "/blog", label: "News & analysis", emoji: "📰" },
      { href: "/learn", label: "Learn Riftbound", emoji: "🎓" },
      { href: "/authors", label: "Who writes this", emoji: "✍️" },
      { href: "/editorial-policy", label: "Editorial policy", emoji: "📐" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/support", label: "Support", emoji: "🆘" },
      { href: "/contact", label: "Contact & feedback", emoji: "✉️" },
      { href: "/about", label: "About RiftCompare", emoji: "ℹ️" },
    ],
  },
];

// TOP-LEVEL header items — the handful of destinations that get their own
// always-visible link rather than living inside the mega-menu.
//
// "Guides & News" is here deliberately. The blog and guides were reachable only
// from the footer and the mega-menu, which meant the ~64 pieces of genuinely
// original writing on this site were invisible to anyone who didn't go looking —
// including an AdSense reviewer sampling pages from the homepage. Original
// content that a reviewer cannot find might as well not exist.
export const PRIMARY_NAV: { href: string; label: string }[] = [
  { href: "/browse", label: "Cards" },
  { href: "/sealed", label: "Sealed" },
  { href: "/market", label: "Index" },
  { href: "/guides", label: "Guides & News" },
];

// The footer's own grouping — 4 columns instead of NAV_GROUPS' 6-7. Same links,
// same hrefs (every one still reachable, still counted for internal linking),
// just re-bucketed by theme so the footer doesn't need a column per nav group.
// Built FROM NAV_GROUPS (not duplicated) so editing a link once still only
// means editing it once. NAV_GROUPS itself is untouched — the phone sheet and
// desktop mega-menu keep their finer-grained grouping.
//
// Marketplace's 6 links used to all land in "Shop" (5 + 6 = 11), leaving that
// column roughly twice as tall as its 5-6-link neighbours — a ragged block of
// whitespace under three of the four columns. Split across the other three
// columns instead (2 each) so all four land in the same 5-8 link range
// whether or not the marketplace nav is live (the spread is a no-op — an
// empty array — while MARKETPLACE_NAV_VISIBLE is off).
const byTitle = Object.fromEntries(NAV_GROUPS.map((g) => [g.title, g.links]));
const marketplaceLinks = byTitle["Marketplace"] ?? [];

export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: "Shop",
    links: byTitle["Prices"] ?? [],
  },
  {
    title: "Deals & value",
    links: [...(byTitle["Deals & value"] ?? []), ...marketplaceLinks.slice(0, 2)],
  },
  {
    title: "Decks & collection",
    links: [...(byTitle["Decks"] ?? []), ...(byTitle["Your collection"] ?? []), ...marketplaceLinks.slice(2, 4)],
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
