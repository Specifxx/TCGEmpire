"use client";

import { TcgplayerAd } from "@/components/TcgplayerAd";
import { useCountry } from "@/components/CountryProvider";

// One in-content affiliate banner, roughly mid-homepage. The sidebar
// skyscrapers (see SidebarAds) only ever show on very wide monitors, so most
// visitors — everyone on a phone included — would otherwise only see an ad
// down in the footer, easy to never scroll to. TcgplayerAd already ships a
// responsive mobile creative built in (the `mobile` prop, shown below `sm`),
// so this single placement covers phone and desktop from one component,
// consistent with how it's used elsewhere (CardMarketSection, FooterAds).
// Client-wrapped (not read server-side) so the tagline/creative matches the
// visitor's actual market, not the page's cached ISR baseline.
export function HomeAdBreak() {
  const { country } = useCountry();
  return (
    <div className="flex justify-center">
      <TcgplayerAd size="rect" mobile="rect" country={country} />
    </div>
  );
}
