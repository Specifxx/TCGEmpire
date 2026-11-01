"use client";

import Link from "next/link";
import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { ReleaseAlertSignup } from "./ReleaseAlertSignup";
import { formatMoney } from "@/lib/format";
import { currencyOf } from "@/lib/country";
import { ebayLabel, ebaySearchUrl } from "@/lib/affiliate";
import { trackEvent } from "@/lib/analytics";
import { readEntrySource } from "@/lib/entry-source";
import type { RadianceBoxPrices } from "@/lib/radiance-cta";

// Client half of LegacyPreorderCta: the VISITOR's market's cheapest open box
// pre-order, from prices the server read for every market (the posts are cached
// pages with no market on the server). A market with no open box pre-order gets
// the link without a number, never another market's.
export function LegacyPreorderCtaView({ prices, placement }: { prices: RadianceBoxPrices; placement: "top" | "section" }) {
  const { country } = useCountry();
  const cents = prices[country];
  const from = cents != null ? formatMoney(cents, currencyOf(country)) : null;
  const label = ebayLabel(country);

  return (
    <aside aria-label="Legacy pre-orders" data-legacy-cta={placement} className="not-prose my-6">
      <Link
        href="/legacy-preorders"
        onClick={() => trackEvent("preorder_cta_click", { placement, has_price: from != null, entry: readEntrySource(), set: "LGC" })}
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-slate-200 [font-feature-settings:'lnum'_1] hover:border-gold/70"
      >
        <span>
          <strong className="text-gold">Legacy booster box pre-orders</strong>
          {from ? (
            <>
              {" "}
              from <strong className="num text-white">{from}</strong>
            </>
          ) : null}
          <span className="text-slate-400"> · releases 29 Jan 2027</span>
        </span>
        <span className="shrink-0 font-semibold text-gold">Compare every store →</span>
      </Link>
      {/* The top placement stays internal-only (it sits above the TL;DR); the
          section placement adds the eBay line and the release alert. */}
      {placement === "section" && (
        <>
          <div className="mt-1">
            <OutboundLink
              href={ebaySearchUrl(country, "Riftbound Legacy", "legacy-preorder-cta")}
              retailer="ebay_search"
              country={country}
              pageType="article"
              surface="preorder_cta_ebay"
              className="tap-link min-h-11 text-sm text-sky-300 underline-offset-2 hover:underline"
            >
              Or search {label} for Legacy sealed →
            </OutboundLink>
            <AffiliateDisclosure partner="ebay" tight />
          </div>
          <ReleaseAlertSignup setCode="LGC" setName="Legacy" source="article" className="mt-3 max-w-lg" />
        </>
      )}
    </aside>
  );
}
