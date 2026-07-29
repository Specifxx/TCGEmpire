import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import type { Country } from "@/lib/country";

// eBay marketplace domain per market (NZ has no eBay of its own → AU).
const EBAY_DOMAIN: Record<string, string> = {
  AU: "ebay.com.au", NZ: "ebay.com.au", US: "ebay.com", UK: "ebay.co.uk", SG: "ebay.com.sg",
};

// The "Approved partners" trust strip — extracted out of the hero and moved
// below the fold (see CinematicHero's history: this used to live at the bottom
// of the hero itself, which kept it inside the first viewport). Both marks are
// affiliate-tagged, so the disclosure travels with them as one unit, never
// detached from the links it describes — see AffiliateDisclosure's own rules.
export function PartnersStrip({ country }: { country: Country }) {
  const ebayHref = ebayAffiliateUrl(
    `https://www.${EBAY_DOMAIN[country] ?? "ebay.com"}/sch/i.html?_nkw=${encodeURIComponent("Riftbound TCG")}`
  );
  const tcgHref = affiliateUrl(
    "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product"
  );
  return (
    <section className="flex flex-col items-center gap-1 text-center">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
        <span className="uppercase tracking-wide">Approved partners</span>
        <OutboundLink href={ebayHref} retailer="ebay_search" country={country} className="text-lg font-extrabold lowercase leading-none transition-opacity hover:opacity-80" aria-label="eBay Partner Network">
          <span style={{ color: "#e53238" }}>e</span><span style={{ color: "#0064d2" }}>b</span><span style={{ color: "#f5af02" }}>a</span><span style={{ color: "#86b817" }}>y</span>
        </OutboundLink>
        <OutboundLink href={tcgHref} retailer="tcgplayer" country={country} className="text-base font-extrabold leading-none text-white transition-opacity hover:opacity-80" aria-label="TCGplayer">
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
