import Link from "next/link";
import { isBeforeRadianceRelease } from "@/lib/sets/radiance";
import { getRadianceBoxPrices } from "@/lib/radiance-cta";
import { RadianceCtaEbayLine, RadiancePreorderCtaView } from "./RadiancePreorderCtaView";

// "Radiance booster box pre-orders from US$129.97, compare every store →" —
// the block that routes Radiance search traffic (our #1 page is the leaked
// mechanics post) to /radiance-preorders. Rendered near the top of the four
// Radiance pages and again after their first major section. DECISIONS.md,
// "Routing Radiance search traffic to /radiance-preorders", 2026-09-24.
//
// `withSignup` adds the existing release-day capture ("Get an email the day
// Radiance prices go live") — on ONE of the two placements per page, so a
// reader never meets the same form twice in a scroll.
//
// Date-driven like the rest of the Radiance season: from 23 Oct 2026 the
// pre-order framing is gone and the block links to the set's live prices.
export async function RadiancePreorderCta({
  placement,
  withSignup = false,
}: {
  placement: "top" | "section";
  withSignup?: boolean;
}) {
  if (!isBeforeRadianceRelease()) {
    // The "section" placement keeps its eBay line after release (2026-09-26,
    // "Pushing eBay clicks" in DECISIONS.md), singles only — see
    // RadianceCtaEbayLine. A sibling of the link, never nested in it.
    return (
      <div data-radiance-cta={placement} className="not-prose my-6">
        <Link
          href="/sets/radiance#price-guide"
          className="flex items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-slate-200 hover:border-brand-500/60"
        >
          <span>
            <strong className="text-brand-300">Radiance is out.</strong> Every card&apos;s live price, cheapest store first.
          </span>
          <span className="shrink-0 font-semibold text-brand-300">See Radiance prices →</span>
        </Link>
        {placement === "section" && <RadianceCtaEbayLine released />}
      </div>
    );
  }
  const prices = await getRadianceBoxPrices().catch(() => ({}));
  return <RadiancePreorderCtaView prices={prices} placement={placement} withSignup={withSignup} />;
}
