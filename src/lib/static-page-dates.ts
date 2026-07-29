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
  "/riftle": "2026-07-29",
  "/tools": "2026-07-29",
  "/tools/best-basket": "2026-07-26",
  "/premium": "2026-07-29",
  "/vendetta-countdown": "2026-07-26",
  "/feedback": "2026-07-26",
  "/about": "2026-07-26",
  "/contact": "2026-07-26",
  "/returns": "2026-07-29",
  "/privacy": "2026-07-27",
  "/terms": "2026-07-27",
  "/games/higher-lower": "2026-07-29",
  "/games/price-check": "2026-07-29",
  "/games/zoomed": "2026-07-29",
  "/games/pairs": "2026-07-29",
  "/games/pack-sim": "2026-07-29",
  "/games/twenty48": "2026-07-29",
  "/games/card-smash": "2026-07-29",
  "/stores/tracked": "2026-07-29",
  "/stores/suggest": "2026-07-26",
  "/keywords": "2026-07-29",
  "/marketplace/faq": "2026-07-26",
  "/marketplace/buyer-protection": "2026-07-26",
  "/marketplace/shipping": "2026-07-26",
  "/marketplace/terms": "2026-07-26",
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
