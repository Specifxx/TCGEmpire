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
    title: "Community & learn",
    links: [
      { href: "/learn", label: "Learn Riftbound", emoji: "🎓" },
      { href: "/guides", label: "Guides", emoji: "📖" },
      { href: "/blog", label: "Blog", emoji: "📰" },
      { href: "/support", label: "Support", emoji: "🆘" },
    ],
  },
];

// The footer's own grouping — 4 columns instead of NAV_GROUPS' 6-7. Same links,
// same hrefs (every one still reachable, still counted for internal linking),
// just re-bucketed by theme so the footer doesn't need a column per nav group.
// Built FROM NAV_GROUPS (not duplicated) so editing a link once still only
// means editing it once. NAV_GROUPS itself is untouched — the phone sheet and
// desktop mega-menu keep their finer-grained grouping.
const byTitle = Object.fromEntries(NAV_GROUPS.map((g) => [g.title, g.links]));

export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: "Shop",
    links: [...(byTitle["Prices"] ?? []), ...(byTitle["Marketplace"] ?? [])],
  },
  {
    title: "Deals & value",
    links: byTitle["Deals & value"] ?? [],
  },
  {
    title: "Decks & collection",
    links: [...(byTitle["Decks"] ?? []), ...(byTitle["Your collection"] ?? [])],
  },
  {
    title: "Learn & play",
    links: [...(byTitle["Games"] ?? []), ...(byTitle["Community & learn"] ?? [])],
  },
];
