import { OutboundLink } from "./OutboundLink";
import { ebayAffiliateUrl } from "@/lib/affiliate";

// eBay Partner Network banner. eBay retired its hosted display creatives, so
// this is a FIRST-PARTY house banner that links to an affiliate-tagged eBay
// SEARCH (ebayAffiliateUrl adds the mkevt/campid tracking params, so clicks
// credit our EPN account). Region-aware domain; an optional `query` makes it
// card-CONTEXTUAL — "Find <card> on eBay" converts far better than a generic
// banner. Click-tracked via OutboundLink (retailer "ebay_banner"). House
// creative = zero hosted-image dependency, zero CLS (fixed dimensions).

type Variant = "rect" | "leaderboard" | "billboard" | "mobile" | "mobileRect";
const DIMS: Record<Variant, { w: number; h: number }> = {
  rect: { w: 336, h: 280 },
  leaderboard: { w: 728, h: 90 },
  billboard: { w: 970, h: 90 },
  mobile: { w: 320, h: 100 },
  mobileRect: { w: 300, h: 250 },
};

// riftcompare market codes → eBay domain (NZ has no eBay; eBay AU ships there).
const EBAY_DOMAIN: Record<string, string> = {
  AU: "www.ebay.com.au",
  NZ: "www.ebay.com.au",
  US: "www.ebay.com",
  UK: "www.ebay.co.uk",
};

function tagline(country: string, contextual: boolean): string {
  if (contextual) return country === "NZ" ? "New, used & graded — ships to NZ" : "New, used & graded listings";
  if (country === "US") return "Millions of TCG listings";
  if (country === "NZ") return "Ships to New Zealand";
  if (country === "UK") return "Buy from UK & global sellers";
  return "Buy from AU & global sellers";
}

function searchUrl(query: string, country: string): string {
  const host = EBAY_DOMAIN[country] ?? EBAY_DOMAIN.AU;
  return ebayAffiliateUrl(`https://${host}/sch/i.html?_nkw=${encodeURIComponent(query)}`);
}

function Banner({ w, h, country, label, href }: { w: number; h: number; country: string; label: string; href: string }) {
  const horizontal = w >= 2.5 * h;
  return (
    <span
      className="relative inline-block overflow-hidden rounded-lg border border-[#e53238]/30 bg-gradient-to-r from-ink-900 via-[#1a1012] to-ink-900"
      style={{ width: w, height: h }}
    >
      <OutboundLink href={href} retailer="ebay_banner" country={country} className="absolute inset-0 block transition-colors hover:bg-white/[0.03]">
        <span className={`absolute inset-0 flex px-4 ${horizontal ? "flex-row items-center justify-center gap-3 text-left" : "flex-col items-center justify-center gap-1 text-center"}`}>
          {/* eBay multicolour wordmark. */}
          <span className="text-lg font-extrabold tracking-tight">
            <span className="text-[#e53238]">e</span>
            <span className="text-[#0064d2]">b</span>
            <span className="text-[#f5af02]">a</span>
            <span className="text-[#86b817]">y</span>
          </span>
          <span className={horizontal ? "" : "leading-tight"}>
            <span className="block text-[13px] font-semibold text-slate-200">{label}</span>
            <span className="block text-[11px] text-slate-400">{tagline(country, label.startsWith("Find"))}</span>
          </span>
          <span className={`shrink-0 rounded-md bg-[#0064d2]/20 px-2.5 py-1 text-[11px] font-bold text-sky-300 ${horizontal ? "" : "mt-1.5"}`}>
            Search eBay →
          </span>
        </span>
      </OutboundLink>
      <span className="pointer-events-none absolute left-1 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        Ad
      </span>
    </span>
  );
}

// Responsive: `size` for sm+ screens, a mobile unit below. `query` (a card name
// etc.) makes the banner search for that specific card; otherwise it's a generic
// Riftbound TCG search.
export function EbayAd({
  size = "leaderboard",
  mobile = "banner",
  country,
  query,
  className,
}: {
  size?: "rect" | "leaderboard" | "billboard";
  mobile?: "banner" | "rect";
  country: string;
  query?: string;
  className?: string;
}) {
  const q = query ? `Riftbound ${query}` : "Riftbound TCG cards";
  const href = searchUrl(q, country);
  const label = query ? `Find ${query.length > 28 ? query.slice(0, 27) + "…" : query} on eBay` : "Shop Riftbound cards on eBay";
  const desk = DIMS[size];
  const mid = DIMS.leaderboard;
  const mob = DIMS[mobile === "rect" ? "mobileRect" : "mobile"];
  return (
    <div className={`flex justify-center ${className ?? ""}`}>
      {size === "billboard" ? (
        <>
          <span className="hidden lg:inline-block"><Banner {...desk} country={country} label={label} href={href} /></span>
          <span className="hidden sm:inline-block lg:hidden"><Banner {...mid} country={country} label={label} href={href} /></span>
        </>
      ) : (
        <span className="hidden sm:inline-block"><Banner {...desk} country={country} label={label} href={href} /></span>
      )}
      <span className="sm:hidden"><Banner {...mob} country={country} label={label} href={href} /></span>
    </div>
  );
}
