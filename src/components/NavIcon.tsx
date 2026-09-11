/**
 * The nine icons the collapsed desktop rail shows, one per nav group.
 *
 * WHY THESE EXIST. The rail used to render the group's emoji (💹 🗂️ 💎 …). Emoji
 * are the reason the nav was described as looking "AI generated" — they are a
 * different visual language from everything else on the site, they render as a
 * different typeface (and a different SHAPE) on every OS, they can't take the
 * brand colour, and they can't go semi-transparent when inactive. These are
 * drawn in the same idiom as the chrome already around them: 24px box, no fill,
 * `currentColor` stroke, 2px round caps — identical to SideNav's own collapse
 * chevron and the rest of the components' inline SVG.
 *
 * DRAWN IN-HOUSE, not imported. No icon library is a dependency here and none
 * was added for nine glyphs; nothing here carries a licence or an attribution
 * requirement, which a Flaticon free-tier icon would (a visible credit link on
 * every page the icon appears on — and the rail is on every page).
 *
 * SWAPPING ONE OUT is a single entry in ICONS below. The group data
 * (nav-groups.ts) names an icon by KEY, so it stays a plain data module and
 * nothing about the rail's markup changes when an icon's art does.
 *
 * READABLE AT 20px IS THE WHOLE CONSTRAINT. They render at 20px inside a 44px
 * button, so each one is a distinct SILHOUETTE rather than a detailed picture —
 * no two share an outline, because at that size the outline is all a reader
 * gets. That is also why "Browse the database" is a magnifier and "Decks" is a
 * pair of cards: both are card-ish concepts, and two card-shaped icons three
 * rows apart would be indistinguishable in the rail.
 */

export type NavIconName =
  | "prices"
  | "browse"
  | "deals"
  | "collection"
  | "decks"
  | "games"
  | "news"
  | "calendar"
  | "help";

// A Record (not a partial index) so adding a NavIconName without drawing it is
// a TYPE ERROR here rather than an invisible blank square in the rail.
const ICONS: Record<NavIconName, React.ReactNode> = {
  // Prices — a price tag.
  prices: (
    <>
      <path d="M3 3h7.4l9.1 9.1a1.9 1.9 0 0 1 0 2.7l-4.7 4.7a1.9 1.9 0 0 1-2.7 0L3 10.4V3Z" />
      <circle cx="7.2" cy="7.2" r="1.3" />
    </>
  ),
  // Browse the database — a magnifier. Deliberately NOT cards: "Decks" below is
  // the card-shaped one, and browsing is the act of looking something up.
  browse: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  // Deals & value — a percent sign, which reads as "discount" instantly at any
  // size. (A gem, matching the old 💎, needs four interior facet lines to read
  // as a gem at all, and they turn to mush at 20px.)
  deals: (
    <>
      <path d="M18.5 5.5 5.5 18.5" />
      <circle cx="7.8" cy="7.8" r="2.3" />
      <circle cx="16.2" cy="16.2" r="2.3" />
    </>
  ),
  // Your collection — a storage box with a lid.
  collection: (
    <>
      <path d="M3 7.5h18V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z" />
      <path d="M3 7.5 4.5 4.2A2 2 0 0 1 6.3 3h11.4a2 2 0 0 1 1.8 1.2L21 7.5" />
      <path d="M10 12h4" />
    </>
  ),
  // Decks — one card in front, a second behind it.
  decks: (
    <>
      <path d="M3 9.5A2 2 0 0 1 5 7.5h7a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5Z" />
      <path d="M7 7.5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-2.5" />
    </>
  ),
  // Games — a controller. Body plus a D-pad only; a second button cluster is
  // one detail too many at this size.
  games: (
    <>
      <path d="M17.2 6.5H6.8A4.8 4.8 0 0 0 2 11.3v2.4a4.3 4.3 0 0 0 7.4 3l.7-.7h3.8l.7.7a4.3 4.3 0 0 0 7.4-3v-2.4a4.8 4.8 0 0 0-4.8-4.8Z" />
      <path d="M6.6 11.8h3.2M8.2 10.2v3.2" />
      <circle cx="16.4" cy="11.8" r="1.15" />
    </>
  ),
  // Guides & News — a page of text.
  news: (
    <>
      <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5Z" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </>
  ),
  // Miscellaneous — release dates, so: a calendar.
  calendar: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 10.5h18M8 3v4M16 3v4" />
    </>
  ),
  // Help — a question mark.
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.55 2.55 0 0 1 4.96.85c0 1.7-2.46 2.25-2.46 3.6" />
      <path d="M12 17.1h.01" />
    </>
  ),
};

/**
 * `title` is intentionally NOT rendered: every call site already labels the
 * control it sits inside (the rail's button carries aria-label + title), so a
 * <title> here would make a screen reader announce the group name twice.
 */
export function NavIcon({ name, className = "" }: { name: NavIconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONS[name]}
    </svg>
  );
}
