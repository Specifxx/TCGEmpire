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
    title: "Prices",
    links: [
      { href: "/browse", label: "Card Database", emoji: "🗃️" },
      { href: "/portfolio", label: "My Portfolio", emoji: "💼" },
      { href: "/sealed", label: "Sealed Products", emoji: "📦" },
      { href: "/movers", label: "Price Movers", emoji: "📈" },
      { href: "/market", label: "Market Index", emoji: "📊" },
      { href: "/wishlist", label: "Wishlist", emoji: "❤️" },
      { href: "/premium", label: "Premium", emoji: "⭐" },
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
    title: "Decks & tools",
    links: [
      { href: "/decks", label: "Meta Decks", emoji: "🏆" },
      { href: "/deck", label: "Deck Builder", emoji: "🛠️" },
      { href: "/trade", label: "Trade Calculator", emoji: "🔁" },
      { href: "/proxy", label: "Proxy Printer", emoji: "🖨️" },
      { href: "/tools/box-ev", label: "Box EV Calc", emoji: "📦" },
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
