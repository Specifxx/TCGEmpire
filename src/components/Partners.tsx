import { OutboundLink } from "./OutboundLink";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";

// eBay marketplace domain per site market (NZ has no eBay site of its own —
// eBay Australia is the closest marketplace and ships to NZ).
const EBAY_DOMAIN: Record<string, string> = {
  AU: "ebay.com.au",
  NZ: "ebay.com.au",
  US: "ebay.com",
  UK: "ebay.co.uk",
  GB: "ebay.co.uk",
};

// Trust strip: the partner programs RiftCompare is APPROVED for — shown as a
// credibility signal. Framing stays honest ("approved affiliate partners"):
// these are real, approved programs (eBay Partner Network; TCGplayer via
// Impact), not a corporate endorsement, and the copy never claims more.
// Wordmarks are styled text — no third-party logo assets are copied.
export function Partners({ country }: { country: string }) {
  const domain = EBAY_DOMAIN[country] ?? "ebay.com";
  const ebayHref = ebayAffiliateUrl(`https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent("Riftbound TCG")}`);
  const tcgHref = affiliateUrl(
    "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product"
  );
  return (
    <section className="card-surface px-5 py-4" aria-label="Official partners">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-300">Official partners</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Approved affiliate partners — every price links straight to the source.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <OutboundLink
            href={ebayHref}
            retailer="ebay_search"
            country={country}
            className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-2.5 transition-colors hover:border-brand-500/50"
          >
            <span className="text-2xl font-extrabold lowercase tracking-tight" aria-label="eBay">
              <span style={{ color: "#e53238" }}>e</span>
              <span style={{ color: "#0064d2" }}>b</span>
              <span style={{ color: "#f5af02" }}>a</span>
              <span style={{ color: "#86b817" }}>y</span>
            </span>
            <span className="text-left">
              <span className="block text-xs font-semibold text-white">eBay Partner Network</span>
              <span className="block text-[11px] text-slate-500">Live secondary-market prices</span>
            </span>
          </OutboundLink>
          <OutboundLink
            href={tcgHref}
            retailer="tcgplayer"
            country={country}
            className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-2.5 transition-colors hover:border-brand-500/50"
          >
            <span className="text-xl font-extrabold tracking-tight text-white" aria-label="TCGplayer">
              TCG<span className="text-sky-400">player</span>
            </span>
            <span className="text-left">
              <span className="block text-xs font-semibold text-white">Approved affiliate partner</span>
              <span className="block text-[11px] text-slate-500">Live US market prices</span>
            </span>
          </OutboundLink>
        </div>
      </div>
    </section>
  );
}
