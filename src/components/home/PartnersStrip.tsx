"use client";

import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { affiliateUrl, ebaySearchUrl } from "@/lib/affiliate";
import { useCountry } from "@/components/CountryProvider";

// The "Approved partners" trust strip — extracted out of the hero and moved
// below the fold (see CinematicHero's history: this used to live at the bottom
// of the hero itself, which kept it inside the first viewport). Both marks are
// affiliate-tagged, so the disclosure travels with them as one unit, never
// detached from the links it describes — see AffiliateDisclosure's own rules.
//
// Client component reading useCountry(), NOT a `country` prop baked server-side
// — page.tsx is ISR-cached with DEFAULT_COUNTRY ("US"), so every visitor's eBay
// click here was tagged US regardless of their actual selected market: a
// Singapore visitor's click landed on ebay.com, credited (if at all) as a US
// sale in EPN reporting, not SG. Same fix FooterAds already applies to EbayAd.
// ebaySearchUrl (not a local EBAY_DOMAIN map) so this can't drift from the
// shared domain/rotation table in lib/affiliate.ts the way EbayAd's copy once did.
export function PartnersStrip() {
  const { country } = useCountry();
  const ebayHref = ebaySearchUrl(country, "Riftbound TCG", "partners_strip");
  const tcgHref = affiliateUrl(
    "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product"
  );
  return (
    <section className="flex flex-col items-center gap-1 text-center">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
        <span className="uppercase tracking-wide">Approved partners</span>
        {/* tap-link: these wordmarks had no flex display and no min-height, so
            min-h-11's sitewide pointer:coarse bump had nothing to act on —
            measured ~18px/16px tall on a real mobile viewport. aria-label now
            actually reaches the rendered <a> (see OutboundLink's own doc
            comment on why it silently didn't before this pass) — the fuller
            name reads better than the bare "ebay"/"TCGplayer" text content
            these links already fell back to as their accessible name. */}
        <OutboundLink href={ebayHref} retailer="ebay_search" country={country} className="tap-link text-lg font-extrabold lowercase leading-none transition-opacity hover:opacity-80" aria-label="eBay Partner Network">
          <span style={{ color: "#e53238" }}>e</span><span style={{ color: "#0064d2" }}>b</span><span style={{ color: "#f5af02" }}>a</span><span style={{ color: "#86b817" }}>y</span>
        </OutboundLink>
        <OutboundLink href={tcgHref} retailer="tcgplayer" country={country} className="tap-link text-base font-extrabold leading-none text-white transition-opacity hover:opacity-80" aria-label="TCGplayer">
          TCG<span className="text-sky-400">player</span>
        </OutboundLink>
      </div>
      {/* Both partner marks above are affiliate-tagged links, so the strip needs
          its own disclosure — "Approved partners" alone doesn't disclose an
          economic relationship. */}
      <AffiliateDisclosure partner="both" tight className="mx-auto max-w-2xl text-center" />
    </section>
  );
}
