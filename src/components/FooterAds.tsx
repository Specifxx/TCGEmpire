"use client";

import { usePathname } from "next/navigation";
import { TcgplayerAd } from "./TcgplayerAd";
import { EbayAd } from "./EbayAd";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";

// Routes that carry NO footer banner pair (owner decision, 2026-09-26, "Blog
// and tools, joined up" in DECISIONS.md). These are the policy and trust pages
// an ad reviewer reads first — privacy, terms, the editorial policy,
// methodology, about, the author pages, contact and support — and two
// affiliate leaderboards under a privacy policy make it read as a page built
// around the ads. They earn next to nothing there: no card, no price, nothing
// to buy. Each route matches itself and anything under it (/authors/<slug>).
// Every other route keeps the pair exactly as before, /trade included, whose
// affiliate disclosure is the line below.
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

export function footerBannersAllowed(pathname: string | null): boolean {
  if (!pathname) return true;
  return !BANNER_FREE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

// Client wrapper for the site-wide footer affiliate banners. The layout used
// to resolve the country server-side (a cookies() read that forced every route
// dynamic); the country only affects the creative tagline / eBay domain, so it
// now comes from the client country context — worst case a pre-hydration frame
// shows the AU-default creative. usePathname() is known during SSR, so a
// banner-free route's ISR HTML never carries the pair either.
export function FooterAds() {
  const { country } = useCountry();
  const pathname = usePathname();
  // Both banners self-suppress for Premium (ad-free). Mirror that here so the
  // disclosure isn't left stranded under nothing — but note the inverse must
  // never happen: no path may render a banner without this line under it. A
  // banner-free route drops the whole zone, banners and line together.
  const adFree = usePremium();
  if (adFree || !footerBannersAllowed(pathname)) return null;
  return (
    // id is load-bearing, not decorative: FeedbackWidget observes this element
    // and hides its floating launcher whenever this zone is on screen, so the
    // launcher can never obscure a live ad unit (Google program policy; see
    // docs/adsense-remediation.md).
    <div id="rc-ad-zone" data-ad-placement="" className="container-app flex flex-col items-center gap-3 pb-8">
      {/* eBay first (2026-09-26, "Pushing eBay clicks" in DECISIONS.md): it is
          the site's main affiliate partner, so it takes the upper slot. Both
          stay labelled "Ad" and hidden for ad-free members, as above. */}
      <EbayAd size="leaderboard" country={country} disclosure={false} />
      <TcgplayerAd size="leaderboard" country={country} disclosure={false} />
      {/* One combined line for the pair, directly beneath them — this is the
          disclosure that covers /trade and every other page without its own
          inline affiliate surface (EPN flagged /trade specifically). */}
      <AffiliateDisclosure partner="both" tight className="max-w-2xl text-center" />
    </div>
  );
}
