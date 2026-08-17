// Hand-maintained "last meaningful content change" dates for sitemap entries that
// carry no database-backed data of their own — marketing/tool/legal page shells
// where any live behaviour (price lookups, the daily puzzle, game logic) happens
// client-side and never shows up in what's server-rendered for a crawler.
//
// Seeded from each page's real last content-touching commit (`git log -1 --format=%aI
// -- <file>`), NOT from build time. Bump a route's date by hand when you meaningfully
// edit that page's copy or structure — the same convention as the `updated` field on
// articles (see lib/articles.ts). Do not derive these from `new Date()` / the build
// clock: a sitemap lastmod that moves on every deploy regardless of real changes
// teaches Google to stop trusting <lastmod> entirely.
const STATIC_PAGE_DATES: Record<string, string> = {
  "/deck": "2026-07-29",
  "/bulk-pricer": "2026-07-29",
  "/trade": "2026-07-29",
  "/riftle": "2026-08-10",
  "/tools": "2026-07-29",
  "/tools/best-basket": "2026-08-17",
  "/premium": "2026-07-29",
  "/radiance-countdown": "2026-08-04",
  "/radiance-preorders": "2026-08-15",
  "/feedback": "2026-07-26",
  "/about": "2026-07-26",
  "/contact": "2026-07-26",
  "/returns": "2026-07-29",
  "/support": "2026-07-26",
  "/privacy": "2026-08-02",
  "/editorial-policy": "2026-08-17",
  "/methodology": "2026-08-17",
  "/authors": "2026-08-01",
  "/terms": "2026-08-01",
  "/games/higher-lower": "2026-07-29",
  "/games/price-check": "2026-07-29",
  "/games/zoomed": "2026-07-29",
  "/games/pairs": "2026-07-29",
  "/games/pack-sim": "2026-08-10",
  "/games/twenty48": "2026-07-29",
  "/games/card-smash": "2026-07-29",
  "/stores/tracked": "2026-08-17",
  "/stores/suggest": "2026-07-26",
  "/keywords": "2026-07-29",
  "/marketplace/faq": "2026-07-26",
  "/marketplace/buyer-protection": "2026-07-26",
  "/marketplace/shipping": "2026-07-26",
  "/marketplace/terms": "2026-07-28",
  // Fallbacks only — /guides and /blog normally derive their lastmod from the
  // newest article in each category (see sitemap-data.ts's editorial section).
  "/guides": "2026-07-29",
  "/blog": "2026-07-29",
};

// Deliberately throws on an unlisted path rather than silently falling back to
// "now" — a missing entry is a programmer error (a new static route was added to
// the sitemap without a real date), and failing loudly beats shipping a fake one.
export function staticPageDate(path: string): Date {
  const d = STATIC_PAGE_DATES[path];
  if (!d) throw new Error(`static-page-dates: no lastmod configured for "${path}"`);
  return new Date(`${d}T09:00:00+10:00`);
}

// ─────────────────────────────────────────────────────────────────────────────
// The SAME date, rendered for a human: /privacy's "Last updated: 2 August 2026".
// ─────────────────────────────────────────────────────────────────────────────
// Each policy page used to carry its own hardcoded `const UPDATED = "…"` string,
// which is how three sources of truth ended up disagreeing at once:
//
//   page              visible line        this table    last commit
//   /privacy          1 August 2026       2026-08-01    2026-08-02
//   /terms            12 June 2026        2026-08-01    2026-08-01
//   /marketplace/terms 18 July 2026       2026-07-26    2026-07-28
//
// /terms was the worst: it gained a whole moderation section (+195 lines) while
// still telling readers it had not changed since 12 June — and its own "Changes
// to this policy" clause promises that date reflects material changes.
//
// One entry per route now feeds BOTH the visible line and the sitemap's
// <lastmod>, so they cannot drift apart again, and scripts/adsense-guard.ts
// fails the build if a policy page is committed without its date being bumped.
//
// NOT derived from file mtime, which was the other option considered: a fresh
// `git clone` — every Vercel and CI build — stamps every file with the checkout
// time, so mtime would report "updated today" for every policy on every deploy.
// That is precisely the fabricated-lastmod behaviour the note at the top of this
// file exists to prevent, and on a legal page it would also be a false claim.
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "2 August 2026" for a page's "Last updated" line.
 *
 * Formatted from the ISO string's own parts rather than through a Date, so the
 * rendered day can never shift by one under a different server timezone — the
 * classic way a legal date ends up off by a day between build and runtime.
 */
export function staticPageDateLabel(path: string): string {
  const d = STATIC_PAGE_DATES[path];
  if (!d) throw new Error(`static-page-dates: no lastmod configured for "${path}"`);
  const [y, m, day] = d.split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** Every route with a hand-maintained date, for the build guard's drift check. */
export const STATIC_PAGE_DATE_PATHS = Object.keys(STATIC_PAGE_DATES);
export { STATIC_PAGE_DATES };
