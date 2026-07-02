"use client";

import { TcgplayerAd } from "./TcgplayerAd";
import { EbayAd } from "./EbayAd";
import { useCountry } from "./CountryProvider";

// Client wrapper for the site-wide footer affiliate banners. The layout used
// to resolve the country server-side (a cookies() read that forced every route
// dynamic); the country only affects the creative tagline / eBay domain, so it
// now comes from the client country context — worst case a pre-hydration frame
// shows the AU-default creative.
export function FooterAds() {
  const { country } = useCountry();
  return (
    <div className="container-app flex flex-col items-center gap-3 pb-8">
      <TcgplayerAd size="leaderboard" country={country} />
      <EbayAd size="leaderboard" country={country} />
    </div>
  );
}
