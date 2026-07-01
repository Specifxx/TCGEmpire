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

export const NAV_GROUPS: NavGroup[] = [
  {
    // Core price/data pages — the heart of the site.
    title: "Prices",
    links: [
      { href: "/browse", label: "Card Database", emoji: "🗃️" },
      { href: "/sealed", label: "Sealed Products", emoji: "📦" },
      { href: "/card-value", label: "Card Value Checker", emoji: "💎" },
      { href: "/movers", label: "Price Movers", emoji: "📈" },
      { href: "/market", label: "Market Index", emoji: "📊" },
      { href: "/stores/tracked", label: "Stores we track", emoji: "🏪" },
    ],
  },
  {
    // The buyer/flipper tools (several Premium).
    title: "Buy & flip",
    links: [
      { href: "/tools/arbitrage", label: "Arbitrage", emoji: "💱" },
      { href: "/tools/value-finder", label: "Value Finder", emoji: "🔎" },
      { href: "/tools/best-basket", label: "Best Basket", emoji: "🧺" },
      { href: "/tools/box-ev", label: "Box EV Calc", emoji: "🎲" },
    ],
  },
  {
    // The signed-in user's own stuff + the upgrade.
    title: "Your collection",
    links: [
      { href: "/portfolio", label: "My Portfolio", emoji: "💼" },
      { href: "/wishlist", label: "Wishlist", emoji: "❤️" },
      { href: "/premium", label: "Premium", emoji: "⭐" },
    ],
  },
  {
    title: "Decks",
    links: [
      { href: "/decks", label: "Meta Decks", emoji: "🏆" },
      { href: "/deck", label: "Deck Builder", emoji: "🛠️" },
      { href: "/trade", label: "Trade Calculator", emoji: "🔁" },
      { href: "/proxy", label: "Proxy Printer", emoji: "🖨️" },
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
      { href: "/forum", label: "Forum", emoji: "💬" },
      { href: "/learn", label: "Learn Riftbound", emoji: "🎓" },
      { href: "/guides", label: "Guides", emoji: "📖" },
      { href: "/blog", label: "Blog", emoji: "📰" },
    ],
  },
];
