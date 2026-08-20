"use client";

import { OutboundLink } from "./OutboundLink";
import { ebaySearchUrl } from "@/lib/affiliate";
import { usePremium } from "./PremiumProvider";
import { AffiliateDisclosure } from "./AffiliateDisclosure";

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

function tagline(country: string, contextual: boolean): string {
  if (contextual) return "New, used & graded listings";
  if (country === "US") return "Millions of TCG listings";
  if (country === "UK") return "Buy from UK & global sellers";
  if (country === "SG") return "Buy from SG & global sellers";
  if (country === "CA") return "Buy from CA & global sellers";
  if (country === "DE") return "Ships to Germany";
  return "Buy from AU & global sellers";
}

// This banner ships on EVERY route via FooterAds, so its market map is the most
// widely-rendered one on the site — and it was the one that had drifted: the
// local copy listed only AU/US/UK and fell back to eBay AU, so every SG and
// CA visitor was sent to the Australian marketplace (in AUD, with AU postage)
// while affiliate.ts already carried verified ebay.com.sg and ebay.ca rotations.
// Now resolved from the single shared map.
function searchUrl(query: string, country: string): string {
  return ebaySearchUrl(country, query, "banner");
}

function Banner({ w, h, country, label, href }: { w: number; h: number; country: string; label: string; href: string }) {
  const horizontal = w >= 2.5 * h;
  return (
    <span
      className="relative inline-block overflow-hidden rounded-lg border border-[#e53238]/30 bg-gradient-to-r from-ink-900 via-[#1a1012] to-ink-900"
      style={{ width: w, height: h, maxWidth: "100%" }}
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
  // Defaults ON: an affiliate banner must never render without a visible
  // disclosure beside it (EPN Participation Requirements I.G.). Pass false ONLY
  // where a caller renders its own adjacent disclosure covering this banner —
  // FooterAds does that to avoid printing the same line twice under a pair.
  disclosure = true,
}: {
  size?: "rect" | "leaderboard" | "billboard";
  mobile?: "banner" | "rect";
  country: string;
  query?: string;
  className?: string;
  disclosure?: boolean;
}) {
  if (usePremium()) return null; // ad-free for Premium subscribers
  const q = query ? `Riftbound ${query}` : "Riftbound TCG cards";
  const href = searchUrl(q, country);
  const label = query ? `Find ${query.length > 28 ? query.slice(0, 27) + "…" : query} on eBay` : "Shop Riftbound cards on eBay";
  const desk = DIMS[size];
  const mid = DIMS.leaderboard;
  const mob = DIMS[mobile === "rect" ? "mobileRect" : "mobile"];
  // THE 728px LEADERBOARD CANNOT APPEAR AT `sm`. Tailwind's sm is 640px, and the
  // banner is a fixed 728px wide, so from 640px up to ~760px it hung ~90px past
  // the right edge and made the whole DOCUMENT scroll sideways — on the homepage,
  // /decks, and every card page, i.e. site-wide. Measured in a real browser:
  // document scrollWidth 684 in a 640px viewport, 714 in a 700px one.
  //
  // The comment above this block used to say the billboard "steps down to the
  // 728 leaderboard between sm and lg so it never overflows", which was the
  // intent and not the arithmetic. md (768px, less 2×16px container padding =
  // 736px) is the first breakpoint a 728px unit actually fits in.
  //
  // Both class strings are literals, never interpolated — Tailwind's JIT only
  // emits classes it can see in the source.
  const wide = size !== "rect";
  const deskShow = wide ? "hidden max-w-full md:inline-block" : "hidden max-w-full sm:inline-block";
  const mobShow = wide ? "max-w-full md:hidden" : "max-w-full sm:hidden";
  return (
    <div className={`flex max-w-full flex-col items-center ${className ?? ""}`}>
      {size === "billboard" ? (
        <>
          <span className="hidden max-w-full lg:inline-block"><Banner {...desk} country={country} label={label} href={href} /></span>
          <span className="hidden max-w-full md:inline-block lg:hidden"><Banner {...mid} country={country} label={label} href={href} /></span>
        </>
      ) : (
        <span className={deskShow}><Banner {...desk} country={country} label={label} href={href} /></span>
      )}
      <span className={mobShow}><Banner {...mob} country={country} label={label} href={href} /></span>
      {disclosure && <AffiliateDisclosure partner="ebay" tight className="max-w-2xl text-center" />}
    </div>
  );
}
