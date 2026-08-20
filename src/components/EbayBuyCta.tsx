"use client";

import { OutboundLink } from "./OutboundLink";
import { ebaySearchUrl } from "@/lib/affiliate";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";

// The primary singles buy-path. eBay is the one marketplace that ALWAYS has
// Riftbound singles inventory in every market (new, used & graded) AND pays us an
// EPN commission on the click-through, so — unlike the display banner in EbayAd —
// this is a first-class "buy this card" action, shown to everyone (Premium
// included) and NOT labelled as an ad. It's affiliate-tagged (ebayAffiliateUrl adds
// the mkevt/campid tracking params) and click-tracked via OutboundLink so it shows
// up in /admin/clicks. Region-aware domain.
//
// This is deliberately additive to the honest local price comparison — it never
// replaces or outranks a genuinely-cheaper local listing; it's the always-present
// "widest selection" option beside it, and the funnel for the cards no local store
// stocks (which is most of the long tail).

// Display labels only — the DOMAIN comes from lib/affiliate's shared map, so this
// can no longer drift from it. CA was missing entirely, which meant a Canadian
// visitor fell through to `EBAY_MKT.US` and was offered "eBay" on ebay.com even
// though affiliate.ts has carried a verified ebay.ca rotation all along.
const EBAY_LABEL: Record<string, { label: string; note?: string }> = {
  AU: { label: "eBay Australia" },
  US: { label: "eBay" },
  UK: { label: "eBay UK" },
  SG: { label: "eBay Singapore" },
  CA: { label: "eBay Canada" },
};

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// eBay's multicolour wordmark, inline.
function EbayMark({ className }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className ?? ""}`} aria-label="eBay">
      <span className="text-[#e53238]">e</span>
      <span className="text-[#0064d2]">b</span>
      <span className="text-[#f5af02]">a</span>
      <span className="text-[#86b817]">y</span>
    </span>
  );
}

export function EbayBuyCta({
  query,
  heading,
  compact,
  className,
}: {
  // A card name → "Buy <name> on eBay". Omit for the generic "shop all singles" CTA.
  query?: string;
  // Optional heading override (used by the /singles hub).
  heading?: string;
  // Tighter layout for the QuickView modal.
  compact?: boolean;
  className?: string;
}) {
  const { country } = useCountry();
  const mkt = EBAY_LABEL[country] ?? EBAY_LABEL.US;
  const nkw = query ? `${query} Riftbound` : "Riftbound TCG cards";
  const href = ebaySearchUrl(country, nkw, query ? "card-cta" : "shop-all");
  const title = heading ?? (query ? `Buy ${truncate(query, 32)} on eBay` : "Shop Riftbound singles on eBay");
  const sub = query
    ? `New, used & graded listings on ${mkt.label}${mkt.note ? ` — ${mkt.note}` : ""}.`
    : `Thousands of Riftbound single cards on ${mkt.label}${mkt.note ? ` — ${mkt.note}` : ""}. The widest selection anywhere.`;

  return (
    <div className={className}>
      <OutboundLink
        href={href}
        retailer="ebay"
        country={country}
        kind="single"
        className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border border-[#0064d2]/40 bg-gradient-to-r from-[#0064d2]/15 via-ink-900 to-ink-900 transition-colors hover:border-[#0064d2]/70 hover:from-[#0064d2]/25 ${compact ? "p-3" : "p-4 sm:p-5"}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <EbayMark className={compact ? "text-base" : "text-lg"} />
            <span className={`font-extrabold text-white ${compact ? "text-sm" : "text-base sm:text-lg"}`}>{title}</span>
          </div>
          <p className={`mt-0.5 text-slate-400 ${compact ? "text-[11px]" : "text-xs sm:text-sm"}`}>{sub}</p>
        </div>
        <span
          className={`shrink-0 rounded-lg bg-[#0064d2] font-bold text-white transition-colors group-hover:bg-[#0079e6] ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
        >
          Shop on eBay →
        </span>
      </OutboundLink>
      {/* Immediately beneath the CTA. This component is also the fallback the
          eBay carousel renders when no cached listings exist, so it must carry
          its own disclosure rather than relying on the carousel's. */}
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}
