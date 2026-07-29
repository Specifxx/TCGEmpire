"use client";

import { TcgplayerAd } from "./TcgplayerAd";
import { EbayAd } from "./EbayAd";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";

// Client wrapper for the site-wide footer affiliate banners. The layout used
// to resolve the country server-side (a cookies() read that forced every route
// dynamic); the country only affects the creative tagline / eBay domain, so it
// now comes from the client country context — worst case a pre-hydration frame
// shows the AU-default creative.
export function FooterAds() {
  const { country } = useCountry();
  // Both banners self-suppress for Premium (ad-free). Mirror that here so the
  // disclosure isn't left stranded under nothing — but note the inverse must
  // never happen: no path may render a banner without this line under it.
  const adFree = usePremium();
  if (adFree) return null;
  return (
    <div className="container-app flex flex-col items-center gap-3 pb-8">
      <TcgplayerAd size="leaderboard" country={country} disclosure={false} />
      <EbayAd size="leaderboard" country={country} disclosure={false} />
      {/* One combined line for the pair, directly beneath them — this is the
          disclosure that covers /trade and every other page without its own
          inline affiliate surface (EPN flagged /trade specifically). */}
      <AffiliateDisclosure partner="both" tight className="max-w-2xl text-center" />
    </div>
  );
}
