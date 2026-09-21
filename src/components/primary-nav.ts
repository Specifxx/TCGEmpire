import type { NavIconName } from "./NavIcon";

// The rail's PRIMARY destinations — the flat, icon-led list that sits above
// the grouped index, mirroring the shape Piltover Archive's sidebar uses
// (brand → search → primary action → a short flat list → grouped extras →
// pinned account block). See SideNav.tsx's own header for why the rail was
// restructured this way.
//
// DELIBERATELY SHORT, and deliberately a DUPLICATE of links that also appear
// in NAV_GROUPS below it. Ten collapsed group icons with flyouts made the
// visitor open something before they could go anywhere; these eight are the
// destinations worth one click from every page, and the grouped list below
// still carries all ~60 links so nothing became unreachable.
//
// Not merged into NAV_GROUPS as a tenth group: NAV_GROUPS is also the footer
// site-map, the ⌘K index and /llms.txt, and a "Primary" group would show up
// as a duplicate column in all three.
export interface PrimaryNavItem {
  href: string;
  label: string;
  icon: NavIconName;
  /** Marks the route active for itself AND its nested pages; "/" matches exactly. */
  exact?: boolean;
}

export const PRIMARY_NAV: PrimaryNavItem[] = [
  { href: "/", label: "Home", icon: "home", exact: true },
  { href: "/browse", label: "Cards", icon: "browse" },
  { href: "/movers", label: "Prices", icon: "prices" },
  { href: "/sealed", label: "Sealed", icon: "collection" },
  { href: "/tools/deal-finder", label: "Deals", icon: "deals" },
  { href: "/deck", label: "Decks", icon: "decks" },
  { href: "/games", label: "Games", icon: "games" },
  { href: "/blog", label: "News", icon: "news" },
];
