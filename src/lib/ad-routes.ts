// Which routes may carry the one in-page ad block (InlineAds). Moved out of FooterAds when the footer leaderboards went (2026-11-13).
import { AD_FREE_GAME_ROUTES } from "@/lib/ad-free-boot";

// Routes that carry NO ad block (owner decision, 2026-09-26, "Blog
// and tools, joined up" in DECISIONS.md). These are the policy and trust pages
// an ad reviewer reads first — privacy, terms, the editorial policy,
// methodology, about, the author pages, contact and support — and an
// affiliate block under a privacy policy make it read as a page built
// around the ads. They earn next to nothing there: no card, no price, nothing
// to buy. Each route matches itself and anything under it (/authors/<slug>).
// Every other route may carry the one block.
export const BANNER_FREE_ROUTES = [
  "/about",
  "/authors",
  "/contact",
  "/editorial-policy",
  "/methodology",
  "/privacy",
  "/support",
  "/terms",
] as const;

// Routes whose subject is not Riftbound at all (2026-10-01): the Pokémon
// section. A "Shop Riftbound cards" leaderboard there is an ad for the wrong
// game, and the section carries its own eBay and TCGplayer links with their own
// disclosure. Kept apart from BANNER_FREE_ROUTES, whose reason is different.
export const OFF_TOPIC_ROUTES = ["/pokemon"] as const;

// The arcade (2026-10-02, owner, from Reddit feedback: "Nice banner ads bro").
// Games are ad-free for everyone, not just Plus: no footer pair, no in-page
// pair, no AdSense slot, and (2026-10-16) no Auto ads either — the list lives in
// lib/ad-free-boot.ts, whose boot script pauses ad requests on these routes.
// Ads stay on the pages where people are buying.
export { AD_FREE_GAME_ROUTES };

// The plans page (2026-10-22, owner: "remove the eBay and TCGplayer promo ad
// blocks from /premium"). A page selling an ad-free plan should not open on two
// ads; with no affiliate link left on it, the disclosure line goes with them.
// /premium/* (start, welcome, claim) included.
export const SALES_ROUTES = ["/premium"] as const;

// Pages that carry the in-page ad block themselves (homes, set hubs, card and sealed product pages, browse), the Mediavine articles
// (/blog and /guides: no new block there, never next to a Mediavine unit), and pages that are not for shopping. Every other page gets
// the one block above the banners (owner, 2026-11-13: one horizontal native block, replacing the side rails and the small strips).
const OWN_BLOCK = [/^\/$/, /^\/(au|uk|ca|eu|sg)\/?$/, /^\/sets\/[^/]+\/?$/, /^\/card\//, /^\/sealed\/[^/]+/, /^\/browse(\/|$)/, /^\/(blog|guides)(\/|$)/, /^\/(account|admin|login|dashboard|profile|portfolio|watchlist|settings)(\/|$)/];
export function inlineAdsAllowed(pathname: string | null): boolean {
  return !!pathname && !OWN_BLOCK.some((r) => r.test(pathname));
}

export function adBlockAllowed(pathname: string | null): boolean {
  if (!pathname) return true;
  const under = (r: string) => pathname === r || pathname.startsWith(`${r}/`);
  return !BANNER_FREE_ROUTES.some(under) && !OFF_TOPIC_ROUTES.some(under) && !AD_FREE_GAME_ROUTES.some(under) && !SALES_ROUTES.some(under);
}

